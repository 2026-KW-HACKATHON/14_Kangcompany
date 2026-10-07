/* Shared BE layout helpers, feat/seat-layout f757627bccbee3b8923537f440107ea50781d6d5. Types removed; logic unchanged. */
window.WOLGYE_LAYOUT=(()=>{
// 좌석 배치도: 사진 → 테이블·시설 후보 (Claude API, tool use) + 정리·검사 규칙
// 외부 의존성 없음 (Node 테스트, Deno Edge Function, 프런트에서 같은 규칙을 공유)
//
// 좌표계: 가로 100 기준. 세로 height(40~200)는 사진 비율로 정한다. x, y 는 왼쪽 위 모서리.
// 사진이 비스듬한 실내 사진이면 위치는 대략적이며, 사장님이 편집기에서 확인·보정한 뒤 게시한다.

                                     
                                                                                               
                                                   
                                                                                     

                              
             
                
                                             
               
                
                                                      
 

                                
             
                    
                       
                                             
 

                         
             
                 
                        
                            
 

const WIDTH = 100;
const MIN_HEIGHT = 40;
const MAX_HEIGHT = 200;
const MIN_SIZE = 3;
const MAX_TABLES = 100;
const MAX_FIXTURES = 50;
const MAX_SEATS_PER_TABLE = 30;
const SHAPES          = ["rect", "round"];
const FIXTURE_KINDS                = ["entrance", "counter", "kitchen", "restroom", "window", "other"];
const FIXTURE_LABEL                              = {
  entrance: "입구", counter: "카운터", kitchen: "주방", restroom: "화장실", window: "창가", other: "기타",
};

const round1 = (n        ) => Math.round(n * 10) / 10;
const num = (v         )                => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const clamp = (v        , lo        , hi        ) => Math.min(hi, Math.max(lo, v));

/** 사진 가로·세로 픽셀 → 캔버스 세로 길이 (가로 100 기준) */
function heightFromImage(imgW                , imgH                )         {
  if (!imgW || !imgH || imgW <= 0 || imgH <= 0) return 70;
  return clamp(Math.round((WIDTH * imgH) / imgW), MIN_HEIGHT, MAX_HEIGHT);
}

/** 테이블 크기로 좌석 수 추정 (인식에서 좌석을 못 셌을 때) */
function estimateSeats(w        , h        )         {
  const area = w * h;
  if (area < 60) return 2;
  if (area < 150) return 4;
  if (area < 300) return 6;
  return 8;
}

/** 상자를 캔버스 안으로: 최소 크기 보장 후 넘치면 안쪽으로 밀어 넣음 */
function fitBox(b                                                , height        ) {
  const w = clamp(round1(b.w), MIN_SIZE, WIDTH);
  const h = clamp(round1(b.h), MIN_SIZE, height);
  const x = clamp(round1(b.x), 0, WIDTH - w);
  const y = clamp(round1(b.y), 0, height - h);
  return { x, y, w, h };
}

/** 읽는 순서(위→아래, 왼쪽→오른쪽)로 정렬. 같은 줄 판단 폭은 높이의 5% */
function readingOrder                                               (items     , height        )      {
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
function normalizeLayout(
  input                         ,
  opts                                                   = {},
)         {
  const height = clamp(Math.round(num(opts.height ?? input?.height) ?? 70), MIN_HEIGHT, MAX_HEIGHT);
  const sy = opts.unit === "percent" ? height / 100 : 1;

  const rawTables = Array.isArray(input?.tables) ? (input.tables                             ) : [];
  const tables                = [];
  for (const t of rawTables.slice(0, MAX_TABLES * 2)) {
    const x = num(t?.x), y = num(t?.y), w = num(t?.w), h = num(t?.h);
    if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) continue;
    const box = fitBox({ x, y: y * sy, w, h: h * sy }, height);
    const shape        = SHAPES.includes(t.shape         ) ? (t.shape         ) : "rect";
    const s = num(t.seats);
    const seats = s !== null && s >= 1 ? clamp(Math.round(s), 1, MAX_SEATS_PER_TABLE) : estimateSeats(box.w, box.h);
    const label = typeof t.label === "string" ? t.label.replace(/\s+/g, " ").trim().slice(0, 10) : "";
    const confidence = (["high", "medium", "low"]                ).includes(t.confidence              )
      ? (t.confidence              ) : undefined;
    const origId = typeof t.id === "string" ? t.id : "";
    tables.push({ id: origId, label, ...box, shape, seats, ...(confidence ? { confidence } : {}) });
    if (tables.length >= MAX_TABLES) break;
  }

  // 라벨: 비었거나 중복이면 읽는 순서대로 T번호 (기존 라벨과 안 겹치게)
  const ordered = readingOrder(tables, height);
  const used = new Set        ();
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
  const ids = new Set        ();
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

  const rawFixtures = Array.isArray(input?.fixtures) ? (input.fixtures                             ) : [];
  const fixtures                  = [];
  for (const f of rawFixtures) {
    const x = num(f?.x), y = num(f?.y), w = num(f?.w), h = num(f?.h);
    if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) continue;
    const kind              = FIXTURE_KINDS.includes(f.kind               ) ? (f.kind               ) : "other";
    const label = typeof f.label === "string" && f.label.trim() ? f.label.trim().slice(0, 10) : null;
    const orig = typeof f.id === "string" && /^[a-z0-9_-]{1,20}$/i.test(f.id) ? f.id : null;
    const id = orig && !fixtures.some((g) => g.id === orig) ? orig : `f${fixtures.length + 1}`;
    fixtures.push({ id, kind, label, ...fitBox({ x, y: y * sy, w, h: h * sy }, height) });
    if (fixtures.length >= MAX_FIXTURES) break;
  }

  return { width: WIDTH, height, tables: ordered, fixtures };
}

/** 두 상자가 겹치는 면적 */
function overlapArea(a             , b             )         {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** 새 테이블·시설을 놓을 빈자리: 위→아래, 왼쪽→오른쪽으로 훑어 아무것과도 겹치지 않는 첫 위치 (없으면 가운데) */
function findFreeSpot(layout        , w        , h        , gap = 1)                           {
  const boxes = [...layout.tables, ...layout.fixtures]
  const hit = (x        , y        ) => boxes.some((b) =>
    x < b.x + b.w + gap && x + w + gap > b.x && y < b.y + b.h + gap && y + h + gap > b.y)
  for (let y = 2; y + h <= layout.height; y += 2) {
    for (let x = 2; x + w <= WIDTH; x += 2) {
      if (!hit(x, y)) return { x, y }
    }
  }
  return { x: round1((WIDTH - w) / 2), y: round1((layout.height - h) / 2) }
}

                                
                      
                      
                                               
                     
 

/** 화면 안내용 검사: 겹침(맞닿은 정도는 무시, 겹친 면적 1 초과), 단체석 최대 인원 대비 좌석 합계 */
function summarizeLayout(layout        , maxCapacity                )                {
  const total = layout.tables.reduce((s, t) => s + t.seats, 0);
  const overlaps                     = [];
  for (let i = 0; i < layout.tables.length; i++) {
    for (let j = i + 1; j < layout.tables.length; j++) {
      const a = layout.tables[i], b = layout.tables[j];
      if (overlapArea(a, b) > 1) overlaps.push([a.label, b.label]);
    }
  }
  const warnings           = [];
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
function stripForSave(layout        )         {
  return {
    width: WIDTH, height: layout.height,
    tables: layout.tables.map(({ confidence: _c, ...t }) => t),
    fixtures: layout.fixtures,
  };
}


return {WIDTH,MIN_HEIGHT,MAX_HEIGHT,MIN_SIZE,MAX_TABLES,MAX_FIXTURES,MAX_SEATS_PER_TABLE,SHAPES,FIXTURE_KINDS,FIXTURE_LABEL,heightFromImage,fitBox,normalizeLayout,findFreeSpot,summarizeLayout,stripForSave};
})();
