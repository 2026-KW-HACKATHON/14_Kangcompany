// A-02 로그인 (시안 2). 소셜 로그인은 아직 연결하지 않아 표시하지 않는다
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../../api'
import { paths } from '../../app/paths'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Button, Dock, Field, Input } from '../../components/ui'

export default function Login() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const act = useAction()
  // 로그인 성공 → 세션이 바뀌면 RedirectIfLoggedIn 이 역할별 홈으로 보냄
  const submit = () => act.run(() => auth.signIn(email.trim(), password))
  return (
    <Page title="로그인" back={paths.start}
      dock={<Dock><Button variant="primary" type="submit" form="login-form" busy={act.busy} disabled={!email || !password}>로그인</Button></Dock>}>
      <div className="logo-block">
        <img src="/app-icon.png" alt="월계더링" />
        <h2>다시 만나 반가워요.</h2>
        <p>함께할 다음 모임을 준비해 볼까요?</p>
      </div>
      <form id="login-form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Field label="이메일"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="비밀번호" error={act.error}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
      </form>
      <p className="meta" style={{ textAlign: 'center' }}>처음인가요? <Button variant="text" onClick={() => nav(paths.signup)}>회원가입</Button></p>
    </Page>
  )
}
