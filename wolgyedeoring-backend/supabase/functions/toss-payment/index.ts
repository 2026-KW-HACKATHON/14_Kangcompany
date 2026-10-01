// Edge Function: toss-payment
//
// POST, Authorization: Bearer <로그인 사용자 토큰>
//  1) 결제 승인  { action: "confirm", paymentKey, orderId, amount }
//  2) 환불+취소  { action: "cancel",  reservation_id, reason? }
//
// 필요한 비밀값: TOSS_SECRET_KEY  (개발자센터의 테스트 시크릿 키, test_sk_... 또는 test_gsk_...)
//   앱의 클라이언트 키와 같은 세트여야 함

import { createClient } from "npm:@supabase/supabase-js@2";
import { cancelPayment, confirmPayment, TossError } from "./toss.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST 만 허용됩니다" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const secretKey = Deno.env.get("TOSS_SECRET_KEY");
  if (!secretKey) return json({ error: "서버 설정 오류: TOSS_SECRET_KEY 없음" }, 500);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "로그인이 필요합니다" }, 401);

  const admin = createClient(url, serviceKey);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "JSON 본문이 필요합니다" }, 400); }

  // -------------------------------------------------------------------
  // 1) 결제 승인
  // -------------------------------------------------------------------
  if (body.action === "confirm") {
    const paymentKey = String(body.paymentKey ?? "");
    const orderId = String(body.orderId ?? "");
    const amount = Number(body.amount);
    if (!paymentKey || !orderId || !Number.isInteger(amount)) {
      return json({ error: "paymentKey, orderId, amount 가 필요합니다" }, 400);
    }

    // 주문 조회 (DB 금액이 기준)
    const { data: pay } = await admin
      .from("payments").select("id, reservation_id, amount, status").eq("order_id", orderId).maybeSingle();
    if (!pay) return json({ error: "주문번호가 없습니다" }, 404);

    // 요청자가 이 예약의 단체 대표인지 (사용자 권한 조회 → RLS 통과 여부로 판별)
    const { data: res } = await userClient
      .from("reservations").select("id, group_id, groups!inner(leader_id)").eq("id", pay.reservation_id).maybeSingle();
    // deno-lint-ignore no-explicit-any
    if (!res || (res as any).groups?.leader_id !== userData.user.id) {
      return json({ error: "본인 단체의 예약이 아닙니다" }, 403);
    }

    if (pay.status === "paid") return json({ ok: true, already: true, reservation_id: pay.reservation_id });
    if (pay.status !== "pending") return json({ error: `처리할 수 없는 주문입니다 (${pay.status})` }, 409);
    // 앱이 보낸 금액이 주문 금액과 다르면 승인하지 않음 (금액 조작 방지)
    if (amount !== pay.amount) return json({ error: "결제 금액이 주문 금액과 다릅니다" }, 400);

    let toss;
    try {
      toss = await confirmPayment({ secretKey, paymentKey, orderId, amount: pay.amount });
    } catch (e) {
      const msg = e instanceof TossError ? `${e.code}: ${e.message}` : String(e);
      await admin.from("payments").update({ status: "failed" }).eq("id", pay.id).eq("status", "pending");
      return json({ error: "결제 승인에 실패했습니다", detail: msg }, 402);
    }

    // 승인 성공 → DB 확정. 실패하면 즉시 환불
    const { data: reservation, error: finErr } = await admin.rpc("finalize_toss_payment", {
      p_order_id: orderId,
      p_payment_key: toss.paymentKey,
      p_amount: toss.totalAmount,
      p_method: toss.method ?? null,
      p_receipt_url: toss.receipt?.url ?? null,
      p_approved_at: toss.approvedAt ?? null,
    });
    if (finErr) {
      try {
        await cancelPayment({ secretKey, paymentKey: toss.paymentKey, reason: `예약 확정 실패: ${finErr.message}`.slice(0, 190) });
        await admin.from("payments")
          .update({ status: "refunded", pg_tx_id: toss.paymentKey }).eq("id", pay.id);
        return json({ error: "예약을 확정할 수 없어 결제를 자동 취소했습니다", detail: finErr.message }, 409);
      } catch (e) {
        // 환불까지 실패: 수동 확인 필요
        console.error("REFUND_FAILED", orderId, toss.paymentKey, String(e));
        return json({ error: "결제는 승인됐지만 확정·자동 환불에 실패했습니다. 관리자에게 문의하세요", orderId }, 500);
      }
    }

    return json({ ok: true, reservation, receipt_url: toss.receipt?.url ?? null });
  }

  // -------------------------------------------------------------------
  // 2) 환불 + 예약 취소 (단체 대표 또는 가게 사장님)
  // -------------------------------------------------------------------
  if (body.action === "cancel") {
    const reservationId = Number(body.reservation_id);
    if (!Number.isInteger(reservationId)) return json({ error: "reservation_id 가 필요합니다" }, 400);
    const reason = String(body.reason ?? "예약 취소").slice(0, 190);

    // 당사자 확인: 사용자 권한으로 조회되면 당사자
    const { data: res } = await userClient
      .from("reservations").select("id, status").eq("id", reservationId).maybeSingle();
    if (!res) return json({ error: "예약을 찾을 수 없거나 권한이 없습니다" }, 404);
    if (!["awaiting_payment", "confirmed"].includes(res.status)) {
      return json({ error: `취소할 수 없는 상태입니다 (${res.status})` }, 409);
    }

    const { data: paid } = await admin
      .from("payments").select("id, pg_tx_id")
      .eq("reservation_id", reservationId).eq("status", "paid").eq("pg_provider", "toss");

    for (const p of paid ?? []) {
      try {
        await cancelPayment({ secretKey, paymentKey: p.pg_tx_id, reason });
      } catch (e) {
        const msg = e instanceof TossError ? `${e.code}: ${e.message}` : String(e);
        return json({ error: "환불에 실패해 예약을 취소하지 않았습니다", detail: msg }, 502);
      }
      await admin.from("payments").update({ status: "refunded" }).eq("id", p.id);
    }

    // 환불 완료 후 일반 취소 함수 (사용자 권한 → 당사자 검증·슬롯 재개방·알림)
    const { data: cancelled, error } = await userClient.rpc("cancel_reservation", { p_reservation_id: reservationId });
    if (error) return json({ error: "환불은 완료됐지만 예약 상태 변경에 실패했습니다", detail: error.message }, 500);
    return json({ ok: true, refunded: (paid ?? []).length, reservation: cancelled });
  }

  return json({ error: "action 은 confirm 또는 cancel 이어야 합니다" }, 400);
});
