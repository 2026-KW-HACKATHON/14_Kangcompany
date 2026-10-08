import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  // .env.local 이 없으면 바로 알 수 있도록 콘솔에 남김 (화면은 DevCheck 에서 안내)
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없습니다. .env.example 을 .env.local 로 복사해 값을 채우세요.')
}

/** 앱 전체에서 이 클라이언트 하나만 쓴다 */
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing-key', {
  // pkce: 소셜 로그인 사용자 정의 제공자(네이버)는 PKCE 필수. 돌아온 주소의 ?code= 는 자동으로 세션으로 바꾼다
  auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce' },
})

export const isSupabaseConfigured = Boolean(url && anonKey)
