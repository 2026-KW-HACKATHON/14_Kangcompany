// Edge Function: extract-menu
// 메뉴판 사진 → LLM 메뉴 후보 + 기존 메뉴와 비교. DB 에는 아무것도 저장하지 않음
// (사장님이 화면에서 수정한 뒤 rpc('save_menus') 로 저장)
//
// POST, Authorization: Bearer <사장님 토큰>
//   body: { store_id, image_base64, media_type }
// 응답: { items: [{ name, price, category, confidence, status, existing_menu_id, existing_price }], missing: [...] }
//
// 비밀값: ANTHROPIC_API_KEY (영수증 인식과 공용), MENU_MODEL (선택)

import { createClient } from "npm:@supabase/supabase-js@2";
import { compareWithExisting, extractMenu, type ExistingMenu, type ImageMediaType } from "./menu.ts";

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

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "서버 설정 오류: ANTHROPIC_API_KEY 없음" }, 500);

  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "로그인이 필요합니다" }, 401);

  let body: { store_id?: number; image_base64?: string; media_type?: string };
  try { body = await req.json(); } catch { return json({ error: "JSON 본문이 필요합니다" }, 400); }

  const storeId = Number(body.store_id);
  const image = (body.image_base64 ?? "").replace(/^data:[^;]+;base64,/, "");
  const mediaType = body.media_type as ImageMediaType;
  if (!Number.isInteger(storeId)) return json({ error: "store_id 가 필요합니다" }, 400);
  if (!image) return json({ error: "image_base64 가 필요합니다" }, 400);
  if (image.length > MAX_BASE64_LENGTH) return json({ error: "이미지가 너무 큽니다 (약 5MB 이하)" }, 413);
  if (!ALLOWED.includes(mediaType)) return json({ error: "지원하지 않는 이미지 형식입니다" }, 400);

  // 본인 가게인지
  const { data: store } = await userClient.from("stores").select("id, name, owner_id").eq("id", storeId).maybeSingle();
  if (!store || store.owner_id !== userData.user.id) return json({ error: "본인 가게가 아닙니다" }, 403);

  const { data: existing, error: exErr } = await userClient
    .from("menus").select("id, name, price, category, is_active").eq("store_id", storeId);
  if (exErr) return json({ error: "기존 메뉴 조회 실패" }, 500);

  try {
    const candidates = await extractMenu({
      apiKey, imageBase64: image, mediaType, storeName: store.name,
      model: Deno.env.get("MENU_MODEL") ?? undefined,
    });
    if (candidates.length === 0) {
      return json({ items: [], missing: [], note: "메뉴를 찾지 못했습니다. 메뉴판이 잘 보이게 다시 찍어 주세요." });
    }
    const result = compareWithExisting(candidates, (existing ?? []) as ExistingMenu[]);
    const noPrice = result.items.filter((i) => i.price === null).length;
    return json({
      ...result,
      note: noPrice > 0 ? `가격을 읽지 못한 메뉴 ${noPrice}개는 직접 입력해 주세요.` : null,
    });
  } catch (e) {
    console.error("extract-menu", String(e));
    return json({ error: "메뉴판 인식에 실패했습니다. 다시 시도해 주세요." }, 502);
  }
});
