// A-04 우리 단체 소개 (시안 4)
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { groups } from '../../api'
import { paths } from '../../app/paths'
import { useSessionContext } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { FrameLoading, Page } from '../../components/layout'
import { Button, Dock, Field, Input, Intro, Select } from '../../components/ui'
import { GROUP_TYPE_LABEL } from '../../lib/status'
import type { GroupType } from '../../types/db'

export default function OnboardingGroup() {
  const { loading, me, group, refresh } = useSessionContext()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [type, setType] = useState<GroupType>('student_council')
  const act = useAction()
  if (loading) return <FrameLoading />
  if (!me) return <Navigate to={paths.start} replace />
  if (me.role !== 'group' || group) return <Navigate to={paths.groupHome} replace />

  const submit = () => act.run(async () => {
    await groups.createGroup(me.id, name.trim(), type)
    await refresh()
    nav(paths.groupHome, { replace: true })
  })
  return (
    <Page title="우리 단체 소개" back={false} role="group"
      dock={<Dock>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" type="submit" form="group-form" busy={act.busy} disabled={!name.trim()}>단체 등록하기</Button></Dock>}>
      <Intro title="함께할 모임을 알려주세요." sub="가게가 모임을 이해하는 데 도움이 돼요." art="gathering" />
      <form id="group-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void submit() }}>
        <Field label="단체명"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 소프트웨어학부 학생회" required /></Field>
        <Field label="단체 유형">
          <Select value={type} onChange={(e) => setType(e.target.value as GroupType)} options={Object.entries(GROUP_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="담당자"><Input value={me.display_name} readOnly disabled /></Field>
      </form>
    </Page>
  )
}
