// 네이버 사용자 정보 → 표준(OIDC userinfo) 형태로 평탄화
// 네이버는 { resultcode, message, response: { id, name, nickname, email, ... } } 처럼 response 안에 담아 준다.
// Supabase 사용자 정의 제공자는 최상위 sub·email·name 을 기대하므로 이 모양으로 바꿔 돌려준다.

export interface StandardUserInfo {
  sub: string; id: string;
  name: string | null; nickname: string | null;
  email: string | null; email_verified: boolean;
  picture: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function flattenNaver(body: unknown): StandardUserInfo | null {
  const b = body as { resultcode?: string; response?: Record<string, unknown> } | null;
  const p = b?.response;
  const id = str(p?.id);
  if (!b || b.resultcode !== "00" || !p || !id) return null;
  const email = str(p.email);
  return {
    sub: id, id,
    name: str(p.name) ?? str(p.nickname),
    nickname: str(p.nickname),
    email,
    email_verified: email !== null, // 네이버 계정 이메일은 네이버가 확인한 주소
    picture: str(p.profile_image),
  };
}
