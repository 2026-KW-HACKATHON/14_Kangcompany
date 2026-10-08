// 네이버 로그인용 사용자 정보 변환 (Supabase 사용자 정의 제공자 custom:naver 의 UserInfo URL 로 등록)
// Supabase Auth 서버가 네이버 액세스 토큰(Bearer)으로 이 주소를 호출 → 네이버 회원 프로필 API 결과를 평탄화해 돌려줌
// 배포: npx supabase functions deploy naver-userinfo --no-verify-jwt  (호출자가 Supabase 로그인 토큰이 아니라 네이버 토큰을 보냄)
// 비밀값 없음. 토큰은 저장·기록하지 않는다.
import { flattenNaver } from "./naver.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(auth)) return json({ error: "missing_token" }, 401);

  let res: Response;
  try {
    res = await fetch("https://openapi.naver.com/v1/nid/me", { headers: { Authorization: auth } });
  } catch {
    return json({ error: "naver_unreachable" }, 502);
  }
  const body = await res.json().catch(() => null);
  const user = res.ok ? flattenNaver(body) : null;
  if (!user) return json({ error: "naver_profile_failed", status: res.status, resultcode: body?.resultcode ?? null }, res.status === 401 ? 401 : 502);
  return json(user);
});
