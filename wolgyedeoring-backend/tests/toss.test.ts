// 실행: node --experimental-strip-types --test tests/toss.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { authHeader, confirmPayment, cancelPayment, TossError } from "../supabase/functions/toss-payment/toss.ts";

test("Basic 인증 헤더: 시크릿 키 + ':' 를 base64", () => {
  assert.equal(authHeader("test_sk_abc"), "Basic " + Buffer.from("test_sk_abc:").toString("base64"));
});

test("승인 요청 형식", async () => {
  let url = "", init: any;
  const f = (async (u: string, i: any) => { url = u; init = i;
    return new Response(JSON.stringify({ paymentKey: "pk", orderId: "WGD-1-x", status: "DONE", totalAmount: 50000, method: "카드", receipt: { url: "https://r" } }), { status: 200 });
  }) as typeof fetch;
  const r = await confirmPayment({ secretKey: "test_sk", paymentKey: "pk", orderId: "WGD-1-x", amount: 50000, fetchFn: f });
  assert.equal(url, "https://api.tosspayments.com/v1/payments/confirm");
  assert.deepEqual(JSON.parse(init.body), { paymentKey: "pk", orderId: "WGD-1-x", amount: 50000 });
  assert.equal(init.headers.Authorization, authHeader("test_sk"));
  assert.equal(r.status, "DONE");
});

test("승인 실패 시 토스 오류 코드 전달", async () => {
  const f = (async () => new Response(JSON.stringify({ code: "REJECT_CARD_PAYMENT", message: "한도초과" }), { status: 403 })) as typeof fetch;
  await assert.rejects(confirmPayment({ secretKey: "s", paymentKey: "p", orderId: "o", amount: 1, fetchFn: f }),
    (e: any) => e instanceof TossError && e.code === "REJECT_CARD_PAYMENT" && e.status === 403);
});

test("취소 요청: 경로·사유·중복 방지 키", async () => {
  let url = "", init: any;
  const f = (async (u: string, i: any) => { url = u; init = i; return new Response("{}", { status: 200 }); }) as typeof fetch;
  await cancelPayment({ secretKey: "s", paymentKey: "pk/1", reason: "예약 취소", fetchFn: f });
  assert.equal(url, "https://api.tosspayments.com/v1/payments/pk%2F1/cancel");
  assert.deepEqual(JSON.parse(init.body), { cancelReason: "예약 취소" });
  assert.equal(init.headers["Idempotency-Key"], "cancel-pk/1");
});
