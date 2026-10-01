// 토스페이먼츠 API 클라이언트 (승인 / 취소)
// 외부 의존성 없음. fetchFn 주입으로 테스트 가능

const TOSS_API = "https://api.tosspayments.com/v1/payments";

export interface TossPayment {
  paymentKey: string;
  orderId: string;
  status: string;          // 승인 성공 시 "DONE"
  totalAmount: number;
  method?: string;
  approvedAt?: string;
  receipt?: { url?: string } | null;
}

export class TossError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function authHeader(secretKey: string): string {
  // 시크릿 키 뒤에 ':' 를 붙여 base64 인코딩
  return "Basic " + btoa(`${secretKey}:`);
}

async function call(path: string, secretKey: string, body: unknown, fetchFn: typeof fetch, idempotencyKey?: string) {
  const headers: Record<string, string> = {
    Authorization: authHeader(secretKey),
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetchFn(`${TOSS_API}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new TossError(res.status, data?.code ?? "UNKNOWN", data?.message ?? `토스 API 오류 (${res.status})`);
  }
  return data;
}

export async function confirmPayment(opts: {
  secretKey: string; paymentKey: string; orderId: string; amount: number; fetchFn?: typeof fetch;
}): Promise<TossPayment> {
  return await call("/confirm", opts.secretKey,
    { paymentKey: opts.paymentKey, orderId: opts.orderId, amount: opts.amount },
    opts.fetchFn ?? fetch) as TossPayment;
}

export async function cancelPayment(opts: {
  secretKey: string; paymentKey: string; reason: string; fetchFn?: typeof fetch;
}): Promise<TossPayment> {
  return await call(`/${encodeURIComponent(opts.paymentKey)}/cancel`, opts.secretKey,
    { cancelReason: opts.reason }, opts.fetchFn ?? fetch,
    `cancel-${opts.paymentKey}`) as TossPayment;   // 같은 결제 중복 취소 요청 방지
}
