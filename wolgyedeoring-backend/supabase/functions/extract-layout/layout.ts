// 좌석 배치도: 사진 → 테이블·시설 후보 (Claude API, tool use) + 정리·검사 규칙
// 외부 의존성 없음 (Node 테스트, Deno Edge Function, 프런트에서 같은 규칙을 공유)
//
// 좌표계: 가로 100 기준. 세로 height(40~200)는 사진 비율로 정한다. x, y 는 왼쪽 위 모서리.
// 사진이 비스듬한 실내 사진이면 위치는 대략적이며, 사장님이 편집기에서 확인·보정한 뒤 게시한다.

export type Shape = "rect" | "round";
export type FixtureKind = "entrance" | "counter" | "kitchen" | "restroom" | "window" | "other";
export type Confidence = "high" | "medium" | "low";
export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export interface LayoutTable {
  id: string;
  label: string;
  x: number; y: number; w: number; h: number;
  shape: Shape;
  seats: number;
  confidence?: Confidence; // 인식 결과에만 있음 (저장 시 제거해도 됨)
}

export interface LayoutFixture {
  id: string;
  kind: FixtureKind;
  label: string | null;
  x: number; y: number; w: number; h: number;
}

export interface Layout {
  width: 100;
  height: number;
  tables: LayoutTable[];
  fixtures: LayoutFixture[];
}

export const WIDTH = 100;
export const MIN_HEIGHT = 40;
export const MAX_HEIGHT = 200;
export const MIN_SIZE = 3;
export const MAX_TABLES = 100;
export const MAX_FIXTURES = 50;
export const MAX_SEATS_PER_TABLE = 30;
export const SHAPES: Shape[] = ["rect", "round"];
export const FIXTURE_KINDS: FixtureKind[] = ["entrance", "counter", "kitchen", "restroom", "window", "other"];
export const FIXTURE_LABEL: Record<FixtureKind, string> = {
  entrance: "입구", counter: "카운터", kitchen: "주방", restroom: "화장실", window: "창가", other: "기타",
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 사진 가로·세로 픽셀 → 캔버스 세로 길이 (가로 100 기준) */
export function heightFromImage(imgW?: number | null, imgH?: number | null): number {
  if (!imgW || !imgH || imgW <= 0 || imgH <= 0) return 70;
  return clamp(Math.round((WIDTH * imgH) / imgW), MIN_HEIGHT, MAX_HEIGHT);
}

/** 테이블 크기로 좌석 수 추정 (인식에서 좌석을 못 셌을 때) */
export function estimateSeats(w: number, h: number): number {
  const area = w * h;
  if (area < 60) return 2;
  if (area < 150) return 4;
  if (area < 300) return 6;
  return 8;
}

/** 상자를 캔버스 안으로: 최소 크기 보장 후 넘치면 안쪽으로 밀어 넣음 */
export function fitBox(b: { x: number; y: number; w: number; h: number }, height: number) {
  const w = clamp(round1(b.w), MIN_SIZE, WIDTH);
  const h = clamp(round1(b.h), MIN_SIZE, height);
  const x = clamp(round1(b.x), 0, WIDTH - w);
  const y = clamp(round1(b.y), 0, height - h);
  return { x, y, w, h };
}

/** 읽는 순서(위→아래, 왼쪽→오른쪽)로 정렬. 같은 줄 판단 폭은 높이의 5% */
function readingOrder<T extends { x: number; y: number; h: number }>(items: T[], height: number): T[] {
  const band = Math.max(3, height * 0.05);
  return [...items].sort((a, b) => {
    const ay = a.y + a.h / 2, by = b.y + b.h / 2;
    if (Math.abs(ay - by) > band) return ay - by;
    return a.x - b.x;
  });
}

/**
 * 인식 결과(사진 기준 % 좌표) 또는 편집 중인 배치도를 저장 가능한 형태로 정리.
 * - unit: 'percent' 면 x,w 는 사진 가로 %, y,h 는 사진 세로 % → 캔버스 좌표로 변환
 * - 빈/깨진 항목 제거, 캔버스 안으로 맞춤, 좌석 1~30, 라벨 중복·누락은 T1, T2… 로 채움
 */
export function normalizeLayout(
  input: Record<string, unknown>,
  opts: { height?: number; unit?: "percent" | "canvas" } = {},
): Layout {
  const height = clamp(Math.round(num(opts.height ?? input?.height) ?? 70), MIN_HEIGHT, MAX_HEIGHT);
  const sy = opts.unit === "percent" ? height / 100 : 1;

  const rawTables = Array.isArray(input?.tables) ? (input.tables as Record<string, unknown>[]) : [];
  const tables: LayoutTable[] = [];
  for (const t of rawTables.slice(0, MAX_TABLES * 2)) {
    const x = num(t?.x), y = num(t?.y), w = num(t?.w), h = num(t?.h);
    if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) continue;
    const box = fitBox({ x, y: y * sy, w, h: h * sy }, height);
    const shape: Shape = SHAPES.includes(t.shape as Shape) ? (t.shape as Shape) : "rect";
    const s = num(t.seats);
    const seats = s !== null && s >= 1 ? clamp(Math.round(s), 1, MAX_SEATS_PER_TABLE) : estimateSeats(box.w, box.h);
    const label = typeof t.label === "string" ? t.label.replace(/\s+/g, " ").trim().slice(0, 10) : "";
    const confidence = (["high", "medium", "low"] as Confidence[]).includes(t.confidence as Confidence)
      ? (t.confidence as Confidence) : undefined;
    const origId = typeof t.id === "string" ? t.id : "";
    tables.push({ id: origId, label, ...box, shape, seats, ...(confidence ? { confidence } : {}) });
    if (tables.length >= MAX_TABLES) break;
  }

  // 라벨: 비었거나 중복이면 읽는 순서대로 T번호 (기존 라벨과 안 겹치게)
  const ordered = readingOrder(tables, height);
  const used = new Set<string>();
  for (const t of ordered) {
    if (t.label && !used.has(t.label.toLowerCase())) used.add(t.label.toLowerCase());
    else t.label = "";
  }
  let n = 1;
  for (const t of ordered) {
    if (t.label) continue;
    while (used.has(`t${n}`)) n++;
    t.label = `T${n}`;
    used.add(`t${n}`);
  }
  // id: 편집 화면에서 쓰는 고유 키. 넘어온 id 가 유효하고 중복이 아니면 유지
  const ids = new Set<string>();
  for (const t of ordered) {
    if (/^[a-z0-9_-]{1,20}$/i.test(t.id) && !ids.has(t.id)) { ids.add(t.id); continue; }
    t.id = "";
  }
  let k = 1;
  for (const t of ordered) {
    if (t.id) continue;
    while (ids.has(`t${k}`)) k++;
    t.id = `t${k}`;
    ids.add(t.id);
  }

  const rawFixtures = Array.isArray(input?.fixtures) ? (input.fixtures as Record<string, unknown>[]) : [];
  const fixtures: LayoutFixture[] = [];
  for (const f of rawFixtures) {
    const x = num(f?.x), y = num(f?.y), w = num(f?.w), h = num(f?.h);
    if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) continue;
    const kind: FixtureKind = FIXTURE_KINDS.includes(f.kind as FixtureKind) ? (f.kind as FixtureKind) : "other";
    const label = typeof f.label === "string" && f.label.trim() ? f.label.trim().slice(0, 10) : null;
    const orig = typeof f.id === "string" && /^[a-z0-9_-]{1,20}$/i.test(f.id) ? f.id : null;
    const id = orig && !fixtures.some((g) => g.id === orig) ? orig : `f${fixtures.length + 1}`;
    fixtures.push({ id, kind, label, ...fitBox({ x, y: y * sy, w, h: h * sy }, height) });
    if (fixtures.length >= MAX_FIXTURES) break;
  }

  return { width: WIDTH, height, tables: ordered, fixtures };
}

/** 두 상자가 겹치는 면적 */
function overlapArea(a: LayoutTable, b: LayoutTable): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** 새 테이블·시설을 놓을 빈자리: 위→아래, 왼쪽→오른쪽으로 훑어 아무것과도 겹치지 않는 첫 위치 (없으면 가운데) */
export function findFreeSpot(layout: Layout, w: number, h: number, gap = 1): { x: number; y: number } {
  const boxes = [...layout.tables, ...layout.fixtures]
  const hit = (x: number, y: number) => boxes.some((b) =>
    x < b.x + b.w + gap && x + w + gap > b.x && y < b.y + b.h + gap && y + h + gap > b.y)
  for (let y = 2; y + h <= layout.height; y += 2) {
    for (let x = 2; x + w <= WIDTH; x += 2) {
      if (!hit(x, y)) return { x, y }
    }
  }
  return { x: round1((WIDTH - w) / 2), y: round1((layout.height - h) / 2) }
}

export interface LayoutSummary {
  table_count: number;
  total_seats: number;
  overlaps: [string, string][]; // 겹치는 테이블 라벨 쌍
  warnings: string[];
}

/** 화면 안내용 검사: 겹침(맞닿은 정도는 무시, 겹친 면적 1 초과), 단체석 최대 인원 대비 좌석 합계 */
export function summarizeLayout(layout: Layout, maxCapacity?: number | null): LayoutSummary {
  const total = layout.tables.reduce((s, t) => s + t.seats, 0);
  const overlaps: [string, string][] = [];
  for (let i = 0; i < layout.tables.length; i++) {
    for (let j = i + 1; j < layout.tables.length; j++) {
      const a = layout.tables[i], b = layout.tables[j];
      if (overlapArea(a, b) > 1) overlaps.push([a.label, b.label]);
    }
  }
  const warnings: string[] = [];
  if (layout.tables.length === 0) warnings.push("테이블이 하나도 없어요. 테이블을 추가해 주세요.");
  if (overlaps.length) warnings.push(`겹친 테이블이 있어요: ${overlaps.slice(0, 3).map(([a, b]) => `${a}·${b}`).join(", ")}${overlaps.length > 3 ? " 외" : ""}`);
  const low = layout.tables.filter((t) => t.confidence === "low").length;
  if (low) warnings.push(`좌석 수를 추정한 테이블이 ${low}개 있어요. 확인해 주세요.`);
  if (maxCapacity && total > 0 && total < maxCapacity) {
    warnings.push(`좌석 합계(${total}석)가 단체석 최대 인원(${maxCapacity}명)보다 적어요.`);
  }
  return { table_count: layout.tables.length, total_seats: total, overlaps, warnings };
}

/** 저장 직전: 인식 전용 필드(confidence) 제거 */
export function stripForSave(layout: Layout): Layout {
  return {
    width: WIDTH, height: layout.height,
    tables: layout.tables.map(({ confidence: _c, ...t }) => t),
    fixtures: layout.fixtures,
  };
}

// ---------------------------------------------------------------------------
// LLM 인식
// ---------------------------------------------------------------------------

export const DEFAULT_MODEL = "claude-sonnet-5-5"; // 공간 배치 판단이 필요해 메뉴판(haiku)보다 큰 모델. LAYOUT_MODEL 로 변경 가능
const TOOL_NAME = "record_layout";

const BOX = {
  x: { type: "number", description: "왼쪽 위 모서리 가로 위치, 이미지 가로의 % (0~100)" },
  y: { type: "number", description: "왼쪽 위 모서리 세로 위치, 이미지 세로의 % (0~100)" },
  w: { type: "number", description: "가로 길이, 이미지 가로의 %" },
  h: { type: "number", description: "세로 길이, 이미지 세로의 %" },
};

const LAYOUT_TOOL = {
  name: TOOL_NAME,
  description: "매장 평면도·손그림·실내 사진에서 읽은 테이블과 시설의 위치를 위에서 내려다본 배치로 기록한다.",
  input_schema: {
    type: "object",
    properties: {
      is_layout: { type: "boolean", description: "식당 홀의 평면도·손그림·실내 사진이면 true, 아니면 false" },
      source_type: { type: "string", enum: ["floor_plan", "sketch", "photo", "other"] },
      tables: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ...BOX,
            shape: { type: "string", enum: SHAPES },
            seats: { type: ["integer", "null"], description: "이 테이블에 붙은 의자 표시(작은 동그라미 등) 수. 보이지 않으면 null" },
            label: { type: ["string", "null"], description: "테이블에 적힌 번호·이름 (예: 1, T3, 룸A). 없으면 null" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["x", "y", "w", "h", "shape", "seats", "label", "confidence"],
        },
      },
      fixtures: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ...BOX,
            kind: { type: "string", enum: FIXTURE_KINDS },
            label: { type: ["string", "null"] },
          },
          required: ["x", "y", "w", "h", "kind", "label"],
        },
      },
      note: { type: ["string", "null"], description: "사장님에게 전할 짧은 확인 요청 (한국어, 한 문장). 없으면 null" },
    },
    required: ["is_layout", "source_type", "tables", "fixtures", "note"],
  },
};

export function buildPrompt(storeName: string, maxCapacity?: number | null): string {
  return [
    `이 이미지는 "${storeName}" 가게의 매장(홀) 평면도, 손으로 그린 배치 스케치, 또는 실내 사진입니다.`,
    maxCapacity ? `참고: 사장님이 등록한 단체석 최대 인원은 ${maxCapacity}명입니다 (좌석 합계와 다를 수 있음).` : "",
    `손님용 테이블과 주요 시설을 ${TOOL_NAME} 도구로 기록하세요.`,
    "",
    "규칙:",
    "1. 위치는 위에서 내려다본 배치 기준. x,y,w,h 는 이미지 가로·세로에 대한 % (0~100), x,y 는 왼쪽 위 모서리.",
    "2. 평면도·손그림은 그려진 위치 그대로. 비스듬한 실내 사진이면 상대 배치(앞뒤·좌우 순서, 줄 맞춤)를 유지해 대략적인 평면 위치로 옮긴다.",
    "   사진의 앞쪽(아래)이 평면의 아래쪽, 사진 안쪽이 위쪽.",
    "3. 평면도·손그림의 도형 읽기: 사각형(정사각형·직사각형)은 테이블, 테이블 둘레에 붙은 작은 동그라미(○·●)는 의자(좌석 1개)다.",
    "   작은 동그라미는 tables 에 따로 기록하지 말고, 가장 가까운 테이블의 seats 로 센다.",
    "   큰 원 둘레에 작은 동그라미가 있으면 큰 원이 원형 테이블이다. 크기가 비슷한 원끼리만 모여 있으면 모두 의자로 본다.",
    "4. 테이블 하나마다 하나씩. 붙여 놓은 긴 테이블이 한 덩어리로 쓰이면 하나로, 떨어져 있으면 각각.",
    "5. seats: 그 테이블에 붙은 의자 표시(작은 동그라미·의자 그림·방석)를 하나씩 센 수. 테이블 네 변을 모두 확인해 빠짐없이 센다.",
    "   의자 표시가 없거나 가려져 확실하지 않으면 null (테이블 크기로 추측해 채우지 말 것).",
    "6. shape: 원형 테이블이면 round, 그 외 rect. 바(카운터) 좌석은 rect 테이블 하나로 기록하고 label 을 '바'로.",
    "7. label: 테이블에 적힌 번호·이름만. 적힌 것이 없으면 null.",
    "8. fixtures: 입구(entrance), 카운터·계산대(counter), 주방(kitchen), 화장실(restroom), 창(window)이 보이면 기록. 확실하지 않으면 생략.",
    "9. confidence: 위치와 좌석 수가 선명하면 high, 일부 추정이면 medium, 대부분 추정이면 low.",
    "10. 식당 홀과 관계없는 이미지면 is_layout=false, tables=[] 로 기록.",
  ].filter((l) => l !== "").join("\n");
}

export interface ExtractResult {
  layout: Layout;
  summary: LayoutSummary;
  source_type: string;
  note: string | null;
}

export function toExtractResult(raw: Record<string, unknown>, height: number, maxCapacity?: number | null): ExtractResult {
  const isLayout = raw?.is_layout !== false;
  const layout = normalizeLayout(isLayout ? raw : {}, { height, unit: "percent" });
  const summary = summarizeLayout(layout, maxCapacity);
  const sourceType = typeof raw?.source_type === "string" ? raw.source_type : "other";
  let note = typeof raw?.note === "string" && raw.note.trim() ? raw.note.trim().slice(0, 200) : null;
  if (!isLayout) note = "매장 배치를 찾지 못했어요. 평면도나 홀 전체가 보이는 사진으로 다시 시도해 주세요.";
  else if (sourceType === "photo") note = [note, "실내 사진이라 위치는 대략적이에요. 실제 배치와 맞게 옮겨 주세요."].filter(Boolean).join(" ");
  return { layout, summary, source_type: sourceType, note };
}

export async function extractLayout(opts: {
  apiKey: string; imageBase64: string; mediaType: ImageMediaType; storeName: string;
  imageWidth?: number | null; imageHeight?: number | null; maxCapacity?: number | null;
  model?: string; fetchFn?: typeof fetch;
}): Promise<ExtractResult> {
  const res = await (opts.fetchFn ?? fetch)("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: 6000,
      tools: [LAYOUT_TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: opts.mediaType, data: opts.imageBase64 } },
          { type: "text", text: buildPrompt(opts.storeName, opts.maxCapacity) },
        ],
      }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LLM 호출 실패 (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const block = (data.content ?? []).find((b: { type: string; name?: string }) => b.type === "tool_use" && b.name === TOOL_NAME);
  if (!block) throw new Error("LLM 응답에 배치 기록이 없습니다");
  return toExtractResult(block.input, heightFromImage(opts.imageWidth, opts.imageHeight), opts.maxCapacity);
}
