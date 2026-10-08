import { supabase } from '../lib/supabase'
import { unwrap, toApiError } from '../lib/errors'
import type { Profile, Role } from '../types/db'

export interface SignUpInput {
  email: string
  password: string
  role: Role
  displayName: string
  phone?: string // 예약 상대방에게 공개되는 연락처 (008, B-01)
}

export async function signUp(i: SignUpInput) {
  const { data, error } = await supabase.auth.signUp({
    email: i.email,
    password: i.password,
    options: {
      data: { role: i.role, display_name: i.displayName, phone: i.phone ?? null },
      // 인증 메일 링크 → 배포 주소의 로그인 화면 (Supabase Redirect URLs 에 있어야 함).
      // PKCE 라서 다른 기기에서 열면 자동 로그인은 안 되지만 인증 자체는 끝나므로, 로그인 화면에서 안내한다
      emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
    },
  })
  if (error) throw toApiError(error)
  return data
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw toApiError(error)
  return data
}

// ---------------------------------------------------------------------
// 소셜 로그인 (카카오: Supabase 기본 제공 / 네이버: 사용자 정의 제공자 custom:naver)
// 설정: docs/release/04_소셜로그인_설정.md

export type SocialProvider = 'kakao' | 'naver'
const PROVIDER_ID: Record<SocialProvider, string> = { kakao: 'kakao', naver: 'custom:naver' }
const PENDING_ROLE = 'wolgye.pendingRole'

/** Supabase 에서 켜 둔 소셜 로그인 (GET /auth/v1/settings). 확인 못 하면 모두 false */
export async function enabledSocialProviders(): Promise<Record<SocialProvider, boolean>> {
  const off = { kakao: false, naver: false }
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !key) return off
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, { headers: { apikey: key } })
    if (!res.ok) return off
    const ext = ((await res.json()) as { external?: Record<string, unknown> }).external ?? {}
    return {
      kakao: ext.kakao === true,
      naver: Object.entries(ext).some(([k, v]) => k.toLowerCase().includes('naver') && v === true),
    }
  } catch {
    return off
  }
}

/** 카카오·네이버 로그인 화면으로 이동. 처음 가입이면 role 로 시작 (돌아온 뒤 applyPendingRole) */
export async function signInWithProvider(provider: SocialProvider, role: Role) {
  try { localStorage.setItem(PENDING_ROLE, role) } catch { /* 저장 불가: 등록 화면에서 역할을 바꿀 수 있음 */ }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: PROVIDER_ID[provider] as Parameters<typeof supabase.auth.signInWithOAuth>[0]['provider'],
    options: { redirectTo: `${window.location.origin}/login` },
  })
  if (error) throw toApiError(error)
}

/** 단체·가게 등록 전까지 역할 고르기 (010 choose_role) */
export async function chooseRole(role: Role): Promise<Profile> {
  return unwrap(await supabase.rpc('choose_role', { p_role: role })) as Profile
}

/** 소셜 로그인으로 돌아왔을 때, 시작 화면에서 고른 역할을 적용. 적용했으면 true */
export async function applyPendingRole(me: Profile, registered: boolean): Promise<boolean> {
  let role: string | null = null
  try { role = localStorage.getItem(PENDING_ROLE); localStorage.removeItem(PENDING_ROLE) } catch { return false }
  if (registered || (role !== 'group' && role !== 'owner') || role === me.role) return false
  await chooseRole(role)
  return true
}

/** 비밀번호 재설정 메일 보내기. 메일 링크 → /reset-password (Supabase Redirect URLs 에 있어야 함) */
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
  if (error) throw toApiError(error)
}

/** 로그인된 상태(재설정 링크로 들어온 경우 포함)에서 비밀번호 바꾸기 */
export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw toApiError(error)
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw toApiError(error)
}

/** 로그인한 사용자 프로필. 로그인 안 했으면 null */
export async function getMe(): Promise<Profile | null> {
  const { data: s } = await supabase.auth.getSession()
  if (!s.session) return null
  return unwrap(await supabase.from('profiles').select('*').eq('id', s.session.user.id).single())
}

/** 이름·전화번호만 수정 가능 (role 은 서버가 막음) */
export async function updateMe(id: string, patch: { display_name?: string; phone?: string | null }): Promise<Profile> {
  return unwrap(await supabase.from('profiles').update(patch).eq('id', id).select().single())
}

/** 로그인 상태 변화 구독. 반환값을 호출하면 구독 해제 */
export function onAuthChange(cb: (loggedIn: boolean) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(Boolean(session)))
  return () => data.subscription.unsubscribe()
}
