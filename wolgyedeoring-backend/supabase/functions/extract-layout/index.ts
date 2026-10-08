// Edge Function: extract-layout
// 매장 평면도·손그림·실내 사진 → LLM 테이블·시설 후보. DB 에는 아무것도 저장하지 않음
// (사장님이 편집 화면에서 확인·보정한 뒤 rpc('save_store_layout') 로 저장·게시)
// 원본 사진은 저장하지 않는다 (프로덕트 정책 1)
//
// POST, Authorization: Bearer <사장님 토큰>
//   body: { store_id, image_base64, media_type, image_width?, image_height? }
// 응답: { layout: { width, height, tables, fixtures }, summary: { table_count, total_seats, overlaps, warnings },
//         source_type, note }
//
// 비밀값: GEMINI_API_KEY (메뉴판·영수증 인식과 공용), GEMINI_MODEL (선택, 기본 gemini-flash-latest)

import { createClient } from "npm:@supabase/supabase-js@2";
import { extractLayout, type ImageMediaType } from "./layout.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ALLOWED: ImageMediaType[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BASE64_LENGTH = 6_500_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST 만 허용됩니다" }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "서버 설정 오류: GEMINI_API_KEY 없음" }, 500);

  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "로그인이 필요합니다" }, 401);

  let body: { store_id?: number; image_base64?: string; media_type?: string; image_width?: number; image_height?: number };
  try { body = await req.json(); } catch { return json({ error: "JSON 본문이 필요합니다" }, 400); }

  const storeId = Number(body.store_id);
  const image = (body.image_base64 ?? "").replace(/^data:[^;]+;base64,/, "");
  const mediaType = body.media_type as ImageMediaType;
  if (!Number.isInteger(storeId)) return json({ error: "store_id 가 필요합니다" }, 400);
  if (!image) return json({ error: "image_base64 가 필요합니다" }, 400);
  if (image.length > MAX_BASE64_LENGTH) return json({ error: "이미지가 너무 큽니다 (약 5MB 이하)" }, 413);
  if (!ALLOWED.includes(mediaType)) return json({ error: "지원하지 않는 이미지 형식입니다" }, 400);

  // 본인 가게인지 (사용자 권한으로 조회)
  const { data: store } = await userClient
    .from("stores").select("id, name, owner_id, max_capacity").eq("id", storeId).maybeSingle();
  if (!store || store.owner_id !== userData.user.id) return json({ error: "본인 가게가 아닙니다" }, 403);

  try {
    const result = await extractLayout({
      apiKey, imageBase64: image, mediaType, storeName: store.name,
      imageWidth: Number(body.image_width) || null, imageHeight: Number(body.image_height) || null,
      maxCapacity: store.max_capacity, model: Deno.env.get("GEMINI_MODEL") || undefined,
    });
    return json(result);
  } catch (e) {
    console.error("extract-layout", String(e));
    return json({ error: "배치도 인식에 실패했습니다. 다시 시도해 주세요.", detail: String(e).slice(0, 160) }, 502);
  }
});
