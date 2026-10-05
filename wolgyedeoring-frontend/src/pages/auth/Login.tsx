// A-02 로그인
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { auth } from '../../api'
import { paths } from '../../app/paths'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { BottomAction, Button, Field, Input } from '../../components/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const act = useAction()
  // 로그인 성공 → 세션이 바뀌면 RedirectIfLoggedIn 이 역할별 홈으로 보냄
  const submit = () => act.run(() => auth.signIn(email.trim(), password))
  return (
    <Page title="로그인" back={paths.start}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Field label="이메일"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="비밀번호" error={act.error}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <BottomAction><Button variant="primary" type="submit" busy={act.busy} disabled={!email || !password}>로그인</Button></BottomAction>
      </form>
      <p className="muted">계정이 없나요? <Link to={paths.signup}>회원가입</Link></p>
    </Page>
  )
}
