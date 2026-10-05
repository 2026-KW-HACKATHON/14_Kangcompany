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
    options: { data: { role: i.role, display_name: i.displayName, phone: i.phone ?? null } },
  })
  if (error) throw toApiError(error)
  return data
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw toApiError(error)
  return data
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
