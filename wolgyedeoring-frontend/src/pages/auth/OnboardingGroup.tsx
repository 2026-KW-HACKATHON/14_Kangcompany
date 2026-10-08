// A-04 우리 단체 소개 (시안 4)
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { auth, groups } from '../../api'
import { paths } from '../../app/paths'
import { useSessionContext } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { FrameLoading, Page } from '../../components/layout'
import { Button, Dock, Field, Input, Intro, Select } from '../../components/ui'
import { GROUP_TYPE_LABEL } from '../../lib/status'
import type { GroupType } from '../../types/db'
import { RoleSwitch } from './RoleSwitch'

export default function OnboardingGroup() {
  const { loading, me, group, refresh } = useSessionContext()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [type, setType] = useState<GroupType>('student_council')
  const [leader, setLeader] = useState<{ name: string; phone: string } | null>(null)
  const act = useAction()
  if (loading) return <FrameLoading />
  if (!me) return <Navigate to={paths.start} replace />
  if (me.role !== 'group' || group) return <Navigate to={paths.groupHome} replace />

  // 소셜 로그인 계정은 이름이 비어 있을 수 있어 여기서 받는다 (시안 4: 담당자 이름·연락처)
  const l = leader ?? { name: me.display_name === '이름 없음' ? '' : me.display_name, phone: me.phone ?? '' }
  const valid = Boolean(name.trim() && l.name.trim())
  const submit = () => act.run(async () => {
    if (l.name.trim() !== me.display_name || (l.phone.trim() || null) !== me.phone) {
      await auth.updateMe(me.id, { display_name: l.name.trim(), phone: l.phone.trim() || null })
    }
    await groups.createGroup(me.id, name.trim(), type)
    await refresh()
    nav(paths.groupHome, { replace: true })
  })
  return (
    <Page title="우리 단체 소개" back={false} role="group"
      dock={<Dock>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" type="submit" form="group-form" busy={act.busy} disabled={!valid}>단체 등록하기</Button></Dock>}>
      <Intro title="함께할 모임을 알려주세요." sub="가게가 모임을 이해하는 데 도움이 돼요." art="gathering" />
      <form id="group-form" onSubmit={(e) => { e.preventDefault(); if (valid) void submit() }}>
        <Field label="단체명"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 소프트웨어학부 학생회" required /></Field>
        <Field label="단체 유형">
          <Select title="단체 유형" value={type} onChange={setType} options={Object.entries(GROUP_TYPE_LABEL).map(([value, label]) => ({ value: value as GroupType, label }))} />
        </Field>
        <Field label="담당자 이름"><Input value={l.name} onChange={(e) => setLeader({ ...l, name: e.target.value })} maxLength={20} required /></Field>
        <Field label="담당자 연락처" hint="예약이 잡힌 가게에만 보여요"><Input type="tel" inputMode="tel" value={l.phone} onChange={(e) => setLeader({ ...l, phone: e.target.value })} placeholder="010-1234-5678" /></Field>
      </form>
      <RoleSwitch to="owner" />
    </Page>
  )
}
