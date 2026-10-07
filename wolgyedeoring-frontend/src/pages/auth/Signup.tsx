// A-03 회원가입·역할 선택
import { useState } from 'react'
import { auth } from '../../api'
import { paths } from '../../app/paths'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { BottomAction, Button, Field, Input, Segmented } from '../../components/ui'
import type { Role } from '../../types/db'

export default function Signup() {
  const [role, setRole] = useState<Role>('group')
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '' })
  const [done, setDone] = useState(false)
  const act = useAction()
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  const submit = () => act.run(async () => {
    const r = await auth.signUp({ email: form.email.trim(), password: form.password, role, displayName: form.name.trim(), phone: form.phone.trim() || undefined })
    // 이메일 확인을 켠 프로젝트면 세션이 없음 → 안내. 꺼져 있으면 바로 로그인되어 온보딩으로 이동
    if (!r.session) setDone(true)
  })

  if (done) return (
    <Page title="회원가입" back={paths.start}>
      <p>가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인하세요.</p>
    </Page>
  )

  return (
    <Page title="회원가입" back={paths.start}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Field label="어떤 분인가요?">
          <Segmented value={role} onChange={setRole} options={[{ value: 'group', label: '단체 담당자' }, { value: 'owner', label: '가게 사장님' }]} />
        </Field>
        <Field label="이름"><Input value={form.name} onChange={set('name')} required maxLength={20} /></Field>
        <Field label="전화번호" hint="예약이 잡히면 상대방에게만 보여요"><Input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="010-1234-5678" /></Field>
        <Field label="이메일"><Input type="email" autoComplete="email" value={form.email} onChange={set('email')} required /></Field>
        <Field label="비밀번호" hint="6자 이상" error={act.error}><Input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required minLength={6} /></Field>
        <BottomAction><Button variant="primary" type="submit" busy={act.busy} disabled={!form.name || !form.email || form.password.length < 6}>가입하기</Button></BottomAction>
      </form>
    </Page>
  )
}
