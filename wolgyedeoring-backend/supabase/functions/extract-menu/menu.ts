// 메뉴판 이미지 → 메뉴 후보 (Claude API, tool use 로 출력 형식 고정) + 기존 메뉴와 비교
// 외부 의존성 없음. fetchFn 주입으로 테스트 가능

export type Category = "main" | "side" | "meal" | "drink" | "etc";
export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export interface MenuCandidate {
  name: string;
  price: number | null;      // 읽지 못했거나 '시가'면 null
  category: Category;
  confidence: "high" | "medium" | "low";
}

export interface ExistingMenu { id: number; name: string; price: number | null; category: Category; is_active: boolean }

export interface ComparedCandidate extends MenuCandidate {
  status: "new" | "price_changed" | "same" | "reactivate";
  existing_menu_id: number | null;
  existing_price: number | null;
}

export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const TOOL_NAME = "record_menu";
const CATEGORIES: Category[] = ["main", "side", "meal", "drink", "etc"];

const MENU_TOOL = {
  name: TOOL_NAME,
  description: "메뉴판에서 읽은 메뉴를 기록한다.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "메뉴판에 적힌 메뉴명. 크기·용량 구분이 있으면 괄호로 붙임 (예: 후라이드치킨(반마리))" },
            price: { type: ["integer", "null"], description: "가격(원). 읽을 수 없거나 '시가'면 null" },
            category: { type: "string", enum: CATEGORIES },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["name", "price", "category", "confidence"],
        },
      },
    },
    required: ["items"],
  },
};

export function buildPrompt(storeName: string): string {
  return [
    `이 이미지는 "${storeName}" 가게의 메뉴판입니다. 모든 메뉴를 ${TOOL_NAME} 도구로 기록하세요.`,
    "",
    "규칙:",
    "1. 메뉴명은 메뉴판에 적힌 그대로. 설명 문구·원산지·광고 문구는 빼고 메뉴명만.",
    "2. 같은 메뉴가 크기·용량별로 가격이 다르면 각각 따로 기록하고 이름 뒤 괄호에 구분을 붙인다. 예: 떡볶이(소), 떡볶이(대)",
    "3. 가격을 읽을 수 없거나 '시가'면 price 는 null. 추측하지 않는다.",
    "4. 가격은 원 단위 정수. 예: '15,000원' → 15000, '1.5만' → 15000",
    "5. category: main=여럿이 나눠 먹는 메인 요리(고기, 치킨, 전골, 찌개 대(大) 등), side=곁들임·안주(계란찜, 치즈볼 등),",
    "   meal=1인 식사(공기밥, 냉면, 김밥 등), drink=주류·음료, etc=기타. 애매하면 가장 가까운 것.",
    "6. 메뉴판 제목, 가게 이름, 영업시간, 전화번호는 메뉴가 아니다.",
    "7. confidence: 글자가 선명하면 high, 일부 불확실하면 medium, 많이 불확실하면 low.",
  ].join("\n");
}

function toIntOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const t = v.replace(/[,\s원₩]/g, "");
    const man = t.match(/^(\d+(?:\.\d+)?)만$/);
    if (man) return Math.round(Number(man[1]) * 10000);
    const n = Number(t);
    return t !== "" && Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

// LLM 출력 정리: 빈 이름 제거, 공백 정리, 같은 이름 중복 제거(첫 항목 유지), 음수 가격 무효
export function normalizeMenu(input: Record<string, unknown>): MenuCandidate[] {
  const raw = Array.isArray(input?.items) ? input.items : [];
  const seen = new Set<string>();
  const out: MenuCandidate[] = [];
  for (const it of raw as Record<string, unknown>[]) {
    const name = typeof it?.name === "string" ? it.name.replace(/\s+/g, " ").trim() : "";
    if (!name || name.length > 60) continue;
    const key = nameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const price = toIntOrNull(it.price);
    out.push({
      name,
      price: price !== null && price >= 0 ? price : null,
      category: CATEGORIES.includes(it.category as Category) ? (it.category as Category) : "etc",
      confidence: (["high", "medium", "low"].includes(it.confidence as string) ? it.confidence : "low") as
        "high" | "medium" | "low",
    });
  }
  return out;
}

// 이름 비교용 키: 공백·특수문자 제거, 소문자
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[\s\-_·.,/()\[\]]/g, "");
}

// 기존 메뉴와 비교: 신규 / 가격 변경 / 동일 / 판매 재개, 그리고 이번 메뉴판에 없는 기존 메뉴
export function compareWithExisting(candidates: MenuCandidate[], existing: ExistingMenu[]) {
  const byKey = new Map(existing.map((m) => [nameKey(m.name), m]));
  const matched = new Set<number>();

  const items: ComparedCandidate[] = candidates.map((c) => {
    const ex = byKey.get(nameKey(c.name));
    if (!ex) return { ...c, status: "new", existing_menu_id: null, existing_price: null };
    matched.add(ex.id);
    const status = !ex.is_active ? "reactivate" : ex.price !== c.price ? "price_changed" : "same";
    // 저장 시 기존 이름으로 맞춰야 같은 메뉴로 갱신됨
    return { ...c, name: ex.name, status, existing_menu_id: ex.id, existing_price: ex.price };
  });

  const missing = existing
    .filter((m) => m.is_active && !matched.has(m.id))
    .map((m) => ({ menu_id: m.id, name: m.name, price: m.price, category: m.category }));

  return { items, missing };
}

export async function extractMenu(opts: {
  apiKey: string; imageBase64: string; mediaType: ImageMediaType; storeName: string;
  model?: string; fetchFn?: typeof fetch;
}): Promise<MenuCandidate[]> {
  const res = await (opts.fetchFn ?? fetch)("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: 4000,
      tools: [MENU_TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: opts.mediaType, data: opts.imageBase64 } },
          { type: "text", text: buildPrompt(opts.storeName) },
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
  if (!block) throw new Error("LLM 응답에 메뉴 기록이 없습니다");
  return normalizeMenu(block.input);
}
