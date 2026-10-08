// Edge Function: process-receipt
// 영수증 이미지를 받아 LLM 으로 품목 추출 → 검증 → receipts / receipt_items 저장
// 이미지는 메모리에서만 처리하고 어디에도 저장하지 않는다.
//
// 요청: POST, Authorization: Bearer <로그인 사용자 토큰>
//   body: { reservation_id: number, image_base64: string, media_type: "image/jpeg" | ... }
// 응답: { receipt_id, status, notes, items }
//
// 필요한 비밀값 (supabase secrets set):
//   GEMINI_API_KEY  (필수)
//   GEMINI_MODEL    (선택, 기본 gemini-flash-latest)
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 자동 제공

import { createClient } from "npm:@supabase/supabase-js@2";
import { extractReceipt, type ImageMediaType } from "./llm.ts";
import { validateReceipt } from "./validate.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BASE64_LENGTH = 6_500_000; // 원본 약 5MB. 앱에서 업로드 전에 리사이즈 권장

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST 만 허용됩니다" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "서버 설정 오류: GEMINI_API_KEY 없음" }, 500);

  // 1) 로그인 사용자 확인
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "로그인이 필요합니다" }, 401);
  const userId = userData.user.id;

  // 2) 입력 확인
  let body: { reservation_id?: number; image_base64?: string; media_type?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON 본문이 필요합니다" }, 400);
  }
  const reservationId = Number(body.reservation_id);
  const imageBase64 = (body.image_base64 ?? "").replace(/^data:[^;]+;base64,/, "");
  const mediaType = body.media_type as ImageMediaType;

  if (!Number.isInteger(reservationId)) return json({ error: "reservation_id 가 필요합니다" }, 400);
  if (!imageBase64) return json({ error: "image_base64 가 필요합니다" }, 400);
  if (imageBase64.length > MAX_BASE64_LENGTH) return json({ error: "이미지가 너무 큽니다 (약 5MB 이하)" }, 413);
  if (!ALLOWED_TYPES.includes(mediaType)) return json({ error: "지원하지 않는 이미지 형식입니다" }, 400);

  // 3) 예약 당사자 확인 (사용자 권한으로 조회 → RLS 가 당사자만 통과시킴)
  const { data: reservation } = await userClient
    .from("reservations")
    .select("id, store_id, start_at, status, stores(name)")
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation) return json({ error: "예약을 찾을 수 없거나 권한이 없습니다" }, 404);
  if (!["confirmed", "completed"].includes(reservation.status)) {
    return json({ error: `영수증을 등록할 수 없는 예약 상태입니다 (${reservation.status})` }, 409);
  }

  // 이후 저장은 관리자 권한 (앱은 receipts / receipt_items 에 직접 쓸 수 없음)
  const admin = createClient(url, serviceKey);

  const { data: menus, error: menuErr } = await admin
    .from("menus")
    .select("id, name, price")
    .eq("store_id", reservation.store_id)
    .eq("is_active", true);
  if (menuErr) return json({ error: "메뉴 조회 실패" }, 500);

  // 4) 처리 중 상태로 영수증 행 생성
  const { data: receipt, error: rcErr } = await admin
    .from("receipts")
    .insert({ reservation_id: reservationId, uploaded_by: userId, status: "processing" })
    .select("id")
    .single();
  if (rcErr || !receipt) return json({ error: "영수증 생성 실패" }, 500);

  try {
    // 5) LLM 추출
    // deno-lint-ignore no-explicit-any
    const storeName = (reservation as any).stores?.name ?? "";
    const extracted = await extractReceipt({
      apiKey,
      imageBase64,
      mediaType,
      menus: menus ?? [],
      storeName,
      model: Deno.env.get("GEMINI_MODEL") || undefined,
    });

    // 6) 검증
    const result = validateReceipt(extracted, menus ?? [], reservation.start_at);

    // 7) 저장
    if (result.items.length > 0) {
      const { error: itemErr } = await admin.from("receipt_items").insert(
        result.items.map((i) => ({
          receipt_id: receipt.id,
          raw_name: i.raw_name,
          menu_id: i.menu_id,
          qty: i.qty !== null && i.qty > 0 ? i.qty : null,
          unit_price: i.unit_price !== null && i.unit_price >= 0 ? i.unit_price : null,
          amount: i.amount !== null && i.amount >= 0 ? i.amount : null,
          confidence: i.confidence,
          validation_error: i.validation_error,
        })),
      );
      if (itemErr) throw new Error(`품목 저장 실패: ${itemErr.message}`);
    }

    const { error: updErr } = await admin
      .from("receipts")
      .update({
        status: result.status,
        is_itemized: extracted.is_itemized,
        receipt_at: result.receipt_at,
        store_name_raw: extracted.store_name,
        total_amount: extracted.total !== null && extracted.total >= 0 ? extracted.total : null,
        validation_note: result.notes.length ? result.notes.join("\n") : null,
      })
      .eq("id", receipt.id);
    if (updErr) throw new Error(`영수증 갱신 실패: ${updErr.message}`);

    return json({ receipt_id: receipt.id, status: result.status, notes: result.notes, items: result.items });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("receipts").update({ status: "failed", validation_note: message.slice(0, 500) }).eq("id", receipt.id);
    return json({ receipt_id: receipt.id, status: "failed", error: "영수증 인식에 실패했습니다. 다시 시도해 주세요.", detail: message.slice(0, 160) }, 502);
  }
});
