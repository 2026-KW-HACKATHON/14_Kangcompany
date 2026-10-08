// A-02 로그인 (시안 2): 이메일 · 카카오 (네이버는 보류). 소셜로 처음 들어오면 시작 화면에서 고른 역할로 가입
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { auth } from '../../api'
import { paths } from '../../app/paths'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Button, Field, Input, Sheet } from '../../components/ui'
import { SocialButtons } from './SocialButtons'
import type { Role } from '../../types/db'

export default function Login() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const act = useAction()
  const reset = useAction()
  const [resetOpen, setResetOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const role = (useLocation().state as { role?: Role } | null)?.role ?? 'group'
  // 소셜 로그인에서 돌아왔는데 실패한 경우 (?error_description=…)
  const query = new URLSearchParams(window.location.search)
  const oauthError = query.get('error_description')
  // 회원가입 인증 메일 링크로 들어온 경우 (?confirmed=1). 같은 기기면 바로 로그인되어 홈으로 이동한다
  const confirmed = query.get('confirmed') === '1' && !oauthError
  // 로그인 성공 → 세션이 바뀌면 RedirectIfLoggedIn 이 역할별 홈으로 보냄
  const submit = () => act.run(() => auth.signIn(email.trim(), password))
  return (
    <Page title="로그인" back={paths.start}
      overlay={
        <Sheet open={resetOpen} title="비밀번호 찾기" confirmLabel={resetSent ? '닫기' : '재설정 메일 보내기'} busy={reset.busy} onClose={() => setResetOpen(false)}
          onConfirm={resetSent ? () => setResetOpen(false) : resetEmail.trim() ? () => void reset.run(async () => { await auth.requestPasswordReset(resetEmail.trim()); setResetSent(true) }) : undefined}>
          {resetSent ? <p className="subtitle">{resetEmail.trim()} 로 메일을 보냈어요. 이 기기의 이 브라우저에서 메일 링크를 열어야 새 비밀번호를 정할 수 있어요.</p> : (
            <>
              <p className="subtitle">가입한 이메일로 비밀번호 재설정 링크를 보내드려요. 카카오로 가입했다면 카카오 버튼으로 로그인해 주세요.</p>
              <Field label="이메일"><Input type="email" autoComplete="username" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} /></Field>
              {reset.error && <p className="note-error" role="alert">{reset.error}</p>}
            </>
          )}
        </Sheet>
      }>
      <div className="logo-block auth-hero">
        <img src="/app-icon.png" alt="월계더링" />
        <h2>다시 만나 반가워요.</h2>
      </div>
      <form id="login-form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Field label="이메일"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="비밀번호" error={act.error}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
      </form>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="text" onClick={() => { setResetEmail(email); setResetSent(false); setResetOpen(true) }}>비밀번호 찾기</Button>
      </div>
      {confirmed && <p className="meta" role="status" style={{ textAlign: 'center' }}>이메일 인증이 끝났어요. 가입한 이메일로 로그인해 주세요.</p>}
      {oauthError && <p className="note-error" role="alert">로그인 링크를 처리하지 못했어요: {oauthError}</p>}
      <div className="social login-actions">
        <SocialButtons role={role} />
        <Button variant="primary" type="submit" form="login-form" busy={act.busy} disabled={!email || !password}>로그인</Button>
      </div>
      <p className="meta" style={{ textAlign: 'center' }}>처음인가요? <Button variant="text" onClick={() => nav(paths.signup)}>회원가입</Button></p>
    </Page>
  )
}
