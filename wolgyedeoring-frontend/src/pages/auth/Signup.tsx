// A-03 계정 만들기 (시안 3): 역할 → 이메일·비밀번호·이름·연락처 → 약관 동의
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { auth } from '../../api'
import { paths } from '../../app/paths'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Button, Check, Dock, Field, Input, Intro, SuccessHero } from '../../components/ui'
import { RoleTiles } from './RoleTiles'
import type { Role } from '../../types/db'

export default function Signup() {
  const initialRole = (useLocation().state as { role?: Role } | null)?.role ?? 'group'
  const [role, setRole] = useState<Role>(initialRole)
  const [form, setForm] = useState({ email: '', password: '', confirm: '', name: '', phone: '' })
  const [terms, setTerms] = useState(false)
  const [done, setDone] = useState(false)
  const act = useAction()
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password
  const valid = form.name.trim() && form.email.trim() && form.password.length >= 6 && form.password === form.confirm && terms

  const submit = () => act.run(async () => {
    const r = await auth.signUp({ email: form.email.trim(), password: form.password, role, displayName: form.name.trim(), phone: form.phone.trim() || undefined })
    // 이메일 확인을 켠 프로젝트면 세션이 없음 → 안내. 꺼져 있으면 바로 로그인되어 온보딩으로 이동
    if (!r.session) setDone(true)
  })

  if (done) return (
    <Page title="계정 만들기" back={paths.start} role={role}>
      <SuccessHero art="send" title="확인 메일을 보냈어요.">메일의 링크를 누른 뒤<br />로그인해 주세요.</SuccessHero>
    </Page>
  )
  return (
    <Page title="계정 만들기" back={paths.start} role={role}
      dock={<Dock>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" type="submit" form="signup-form" busy={act.busy} disabled={!valid}>계정 만들기</Button></Dock>}>
      <Intro title="어떤 역할로 이용하나요?" sub="가입할 역할을 먼저 선택해 주세요." />
      <RoleTiles role={role} onChange={setRole} />
      <form id="signup-form" onSubmit={(e) => { e.preventDefault(); if (valid) void submit() }}>
        <Field label="이메일"><Input type="email" autoComplete="email" value={form.email} onChange={set('email')} required /></Field>
        <Field label="비밀번호" hint="6자 이상"><Input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required minLength={6} /></Field>
        <Field label="비밀번호 확인" error={mismatch ? '비밀번호가 서로 달라요.' : null}><Input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required /></Field>
        <Field label="이름"><Input value={form.name} onChange={set('name')} required maxLength={20} /></Field>
        <Field label="연락처" hint="예약이 잡히면 상대방에게만 보여요"><Input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="010-1234-5678" /></Field>
        <Check label="이용약관 및 개인정보처리방침에 동의합니다" checked={terms} onChange={setTerms} />
      </form>
    </Page>
  )
}
