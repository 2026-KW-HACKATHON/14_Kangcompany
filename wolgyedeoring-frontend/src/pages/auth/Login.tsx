// A-02 로그인 (시안 2): 이메일 · 카카오 · 네이버. 소셜로 처음 들어오면 시작 화면에서 고른 역할로 가입
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { auth } from '../../api'
import { paths } from '../../app/paths'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Button, Field, Input } from '../../components/ui'
import { SocialButtons } from './SocialButtons'
import type { Role } from '../../types/db'

export default function Login() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const act = useAction()
  const role = (useLocation().state as { role?: Role } | null)?.role ?? 'group'
  // 소셜 로그인에서 돌아왔는데 실패한 경우 (?error_description=…)
  const oauthError = new URLSearchParams(window.location.search).get('error_description')
  // 로그인 성공 → 세션이 바뀌면 RedirectIfLoggedIn 이 역할별 홈으로 보냄
  const submit = () => act.run(() => auth.signIn(email.trim(), password))
  return (
    <Page title="로그인" back={paths.start}>
      <div className="logo-block auth-hero">
        <img src="/app-icon.png" alt="월계더링" />
        <h2>다시 만나 반가워요.</h2>
      </div>
      <form id="login-form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Field label="이메일"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="비밀번호" error={act.error}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
      </form>
      {oauthError && <p className="note-error" role="alert">소셜 로그인에 실패했어요: {oauthError}</p>}
      <div className="social login-actions">
        <SocialButtons role={role} />
        <Button variant="primary" type="submit" form="login-form" busy={act.busy} disabled={!email || !password}>로그인</Button>
      </div>
      <p className="meta" style={{ textAlign: 'center' }}>처음인가요? <Button variant="text" onClick={() => nav(paths.signup)}>회원가입</Button></p>
    </Page>
  )
}
