// 비밀번호 재설정 (시안 2 "비밀번호 찾기" → 메일 링크로 들어옴). 링크를 열면 Supabase 가 임시 로그인 상태로 만든다
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../../api'
import { paths } from '../../app/paths'
import { useSessionContext } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { FrameLoading, Page } from '../../components/layout'
import { Button, Dock, Empty, Field, Input, Intro } from '../../components/ui'

export default function ResetPassword() {
  const { loading, me } = useSessionContext()
  const nav = useNavigate()
  const [pw, setPw] = useState({ password: '', confirm: '' })
  const act = useAction()
  if (loading) return <FrameLoading />
  if (!me) return (
    <Page title="비밀번호 재설정" back={paths.login}>
      <Empty art="link" title="링크가 만료됐거나 잘못됐어요." action={<Button onClick={() => nav(paths.login)}>로그인 화면으로</Button>}>
        로그인 화면의 "비밀번호 찾기"에서 메일을 다시 받아 주세요.
      </Empty>
    </Page>
  )
  const mismatch = pw.confirm.length > 0 && pw.confirm !== pw.password
  const valid = pw.password.length >= 6 && pw.password === pw.confirm
  // 저장하면 시작 화면 → 로그인 상태라 역할별 홈으로 이동
  const save = () => act.run(async () => { await auth.updatePassword(pw.password); nav(paths.start, { replace: true }) })
  return (
    <Page title="비밀번호 재설정" back={false}
      dock={<Dock>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" type="submit" form="reset-form" busy={act.busy} disabled={!valid}>새 비밀번호 저장</Button></Dock>}>
      <Intro title="새 비밀번호를 정해 주세요." sub={`${me.display_name}님 계정의 비밀번호를 바꿔요.`} />
      <form id="reset-form" onSubmit={(e) => { e.preventDefault(); if (valid) void save() }}>
        <Field label="새 비밀번호" hint="6자 이상"><Input type="password" autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} required minLength={6} /></Field>
        <Field label="새 비밀번호 확인" error={mismatch ? '비밀번호가 서로 달라요.' : null}><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></Field>
      </form>
    </Page>
  )
}
