// 소셜 로그인 버튼 (시안 2 · experience.js socialButton). 지금은 카카오만 표시
// Supabase 에서 켜지 않은 제공자는 누를 수 없게 하고 "준비 중"으로 알린다
import { useEffect, useState } from 'react'
import { auth } from '../../api'
import type { SocialProvider } from '../../api/auth'
import { toApiError } from '../../lib/errors'
import type { Role } from '../../types/db'

const LOGO: Record<SocialProvider, string> = {
  kakao: 'M12 3C5.925 3 1 6.798 1 11.483c0 3.05 2.09 5.72 5.226 7.216l-1.062 3.895c-.094.344.302.619.59.42l4.656-3.117c.523.058 1.056.087 1.59.087 6.075 0 11-3.798 11-8.5S18.075 3 12 3z',
  naver: 'M0 0h7.5l9 13.2V0H24v24h-7.5l-9-13.2V24H0z',
}
const LABEL: Record<SocialProvider, string> = { kakao: '카카오', naver: '네이버' }
// 화면에 보일 제공자. 네이버는 보류 (다시 쓰려면 'naver' 추가 + docs/release/04_소셜로그인_설정.md)
const SHOWN: readonly SocialProvider[] = ['kakao']

export function SocialButtons({ role }: { role: Role }) {
  const [enabled, setEnabled] = useState<Record<SocialProvider, boolean> | null>(null)
  const [busy, setBusy] = useState<SocialProvider | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { void auth.enabledSocialProviders().then(setEnabled) }, [])

  const go = async (p: SocialProvider) => {
    setBusy(p); setError(null)
    try { await auth.signInWithProvider(p, role) } catch (e) { setError(toApiError(e).message); setBusy(null) }
  }
  const off = SHOWN.filter((p) => enabled && !enabled[p])
  return (
    <>
      {SHOWN.map((p) => (
        <button key={p} type="button" className={`social-brand ${p}`} disabled={!enabled?.[p] || busy !== null} aria-busy={busy === p || undefined} onClick={() => void go(p)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={LOGO[p]} /></svg>
          <span>{busy === p ? '이동 중' : `${LABEL[p]}로 로그인`}</span>
        </button>
      ))}
      {off.length > 0 && <p className="meta" style={{ textAlign: 'center' }}>{off.map((p) => LABEL[p]).join('·')} 로그인은 준비 중이에요.</p>}
      {error && <p className="note-error" role="alert">{error}</p>}
    </>
  )
}
