// A-03 계정 만들기 (시안 3): 역할 → 이메일·비밀번호·이름·연락처 → 약관 동의
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { auth } from '../../api'
import { paths } from '../../app/paths'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Button, Check, Dock, Field, Input, Intro, Rows, Sheet, SuccessHero } from '../../components/ui'
import { RoleTiles } from './RoleTiles'
import type { Role } from '../../types/db'

export default function Signup() {
  const initialRole = (useLocation().state as { role?: Role } | null)?.role ?? 'group'
  const [role, setRole] = useState<Role>(initialRole)
  const [form, setForm] = useState({ email: '', password: '', confirm: '', name: '', phone: '' })
  const [terms, setTerms] = useState(false)
  const [done, setDone] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
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
      overlay={<TermsSheet open={termsOpen} onClose={() => setTermsOpen(false)} onAgree={() => { setTerms(true); setTermsOpen(false) }} />}
      dock={<Dock>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" type="submit" form="signup-form" busy={act.busy} disabled={!valid}>계정 만들기</Button></Dock>}>
      <Intro title="어떤 역할로 이용하나요?" sub="가입할 역할을 먼저 선택해 주세요." />
      <RoleTiles role={role} onChange={setRole} />
      <form id="signup-form" onSubmit={(e) => { e.preventDefault(); if (valid) void submit() }}>
        <Field label="이메일"><Input type="email" autoComplete="email" value={form.email} onChange={set('email')} required /></Field>
        <Field label="비밀번호" hint="6자 이상"><Input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required minLength={6} /></Field>
        <Field label="비밀번호 확인" error={mismatch ? '비밀번호가 서로 달라요.' : null}><Input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required /></Field>
        <Field label="이름"><Input value={form.name} onChange={set('name')} required maxLength={20} /></Field>
        <Field label="연락처" hint="예약이 잡히면 상대방에게만 보여요"><Input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="010-1234-5678" /></Field>
        <div className="row">
          <Check label="이용약관 및 개인정보처리방침에 동의합니다" checked={terms} onChange={setTerms} />
          <Button variant="text" onClick={() => setTermsOpen(true)}>약관 보기</Button>
        </div>
      </form>
    </Page>
  )
}

/** 약관 보기 (시안 3). 앱이 실제로 모으고 공개하는 정보만 적은 시연용 안내 (정식 약관 문구는 팀 확정 필요) */
function TermsSheet({ open, onClose, onAgree }: { open: boolean; onClose: () => void; onAgree: () => void }) {
  return (
    <Sheet open={open} title="이용약관 및 개인정보 안내" confirmLabel="동의하고 닫기" onClose={onClose} onConfirm={onAgree}>
      <p className="subtitle">월계더링은 2026 광운대 해커톤 시연용 서비스예요. 실제 결제는 토스페이먼츠 테스트 환경으로 처리돼요.</p>
      <Rows rows={[
        ['모으는 정보', '이메일, 이름, 연락처(선택), 단체·가게 정보, 예약·요청 내용'],
        ['쓰는 곳', '단체 예약 요청·수락·결제, 참석 인원 확인, 가게 소비 분석'],
        ['연락처 공개', '예약이 결제 대기 이상이 된 단체 담당자와 사장님 사이에만'],
        ['공개하지 않는 것', '동네 요청·미충족 수요에서 단체 연락처'],
        ['사진', '영수증·메뉴판·배치도 사진은 인식에만 쓰고 보관하지 않아요. 가게 대표 사진은 공개돼요'],
      ]} />
    </Sheet>
  )
}
