// 영수증 인식 결과 검증 (LLM 출력 → DB 저장 전)
// 외부 의존성 없는 순수 함수라 Node/Deno 어디서든 테스트 가능

export type Confidence = "high" | "medium" | "low";

export interface LlmItem {
  raw_name: string;
  menu_id: number | null;
  qty: number | null;
  unit_price: number | null;
  amount: number | null;
  confidence: Confidence;
}

export interface LlmReceipt {
  is_itemized: boolean;
  store_name: string | null;
  receipt_datetime: string | null; // "YYYY-MM-DDTHH:mm" (한국 시간)
  total: number | null;
  items: LlmItem[];
}

export interface Menu {
  id: number;
  name: string;
  price: number | null;
}

export interface ValidatedItem extends LlmItem {
  validation_error: string | null;
}

export interface ValidationResult {
  status: "done" | "needs_review";
  receipt_at: string | null; // ISO (타임존 포함)
  items: ValidatedItem[];
  notes: string[];
}

// 영수증 일시와 예약 일시 허용 차이 (새벽까지 이어지는 뒤풀이 고려)
const MAX_TIME_GAP_HOURS = 36;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

export function toKstIso(local: string | null): string | null {
  if (!local) return null;
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export function validateItem(item: LlmItem, menuIds: Set<number>): ValidatedItem {
  const out: ValidatedItem = { ...item, validation_error: null };
  const errors: string[] = [];

  // 1) 메뉴 매칭: 제공한 메뉴 목록 밖의 ID 는 LLM 오류로 보고 무효화
  if (out.menu_id !== null && !menuIds.has(out.menu_id)) {
    out.menu_id = null;
  }
  if (out.menu_id === null) errors.push("menu not matched");

  // 2) 빠진 값 보완: 셋 중 둘이 있으면 나머지 계산 (나누어떨어질 때만)
  const { qty, unit_price, amount } = out;
  if (isInt(qty) && isInt(unit_price) && amount === null) {
    out.amount = qty * unit_price;
  } else if (isInt(amount) && isInt(unit_price) && unit_price > 0 && qty === null && amount % unit_price === 0) {
    out.qty = amount / unit_price;
  } else if (isInt(amount) && isInt(qty) && qty > 0 && unit_price === null && amount % qty === 0) {
    out.unit_price = amount / qty;
  }

  // 3) 값 존재·범위
  if (!isInt(out.qty) || out.qty <= 0) errors.push("invalid qty");
  if (!isInt(out.unit_price) || out.unit_price < 0) errors.push("invalid unit_price");
  if (!isInt(out.amount) || out.amount < 0) errors.push("invalid amount");

  // 4) 산술 검증
  if (isInt(out.qty) && isInt(out.unit_price) && isInt(out.amount) && out.qty * out.unit_price !== out.amount) {
    errors.push("qty*unit_price != amount");
  }

  // 5) 신뢰도 낮음은 사장님 확인 대상
  if (out.confidence === "low") errors.push("low confidence");

  out.validation_error = errors.length ? errors.join("; ") : null;
  return out;
}

export function validateReceipt(
  receipt: LlmReceipt,
  menus: Menu[],
  reservationStartAt: string,
): ValidationResult {
  const notes: string[] = [];
  const menuIds = new Set(menus.map((m) => m.id));
  const items = (receipt.items ?? []).map((it) => validateItem(it, menuIds));

  if (!receipt.is_itemized || items.length === 0) {
    notes.push("품목이 인쇄되지 않은 영수증입니다. 품목을 직접 입력해 주세요.");
  }

  const itemErrors = items.filter((i) => i.validation_error !== null).length;
  if (itemErrors > 0) notes.push(`확인이 필요한 품목 ${itemErrors}개`);

  // 합계 검증
  const sum = items.reduce((s, i) => s + (isInt(i.amount) ? i.amount : 0), 0);
  if (receipt.total === null) {
    notes.push("영수증 총액을 읽지 못했습니다.");
  } else if (items.length > 0 && sum !== receipt.total) {
    notes.push(`품목 합계 ${sum}원과 총액 ${receipt.total}원이 다릅니다 (할인·봉사료 가능성).`);
  }

  // 일시 검증
  const receipt_at = toKstIso(receipt.receipt_datetime);
  if (receipt_at === null) {
    notes.push("영수증 일시를 읽지 못했습니다.");
  } else {
    const gapH = Math.abs(Date.parse(receipt_at) - Date.parse(reservationStartAt)) / 36e5;
    if (gapH > MAX_TIME_GAP_HOURS) {
      notes.push("영수증 일시가 예약 일시와 크게 다릅니다. 다른 영수증일 수 있습니다.");
    }
  }

  return {
    status: notes.length === 0 ? "done" : "needs_review",
    receipt_at,
    items,
    notes,
  };
}
