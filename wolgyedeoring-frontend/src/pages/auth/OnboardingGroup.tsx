// A-04 단체 정보 등록
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { groups } from '../../api'
import { paths } from '../../app/paths'
import { useSessionContext } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { BottomAction, Button, Field, Input, Loading, Select } from '../../components/ui'
import { GROUP_TYPE_LABEL } from '../../lib/status'
import type { GroupType } from '../../types/db'

export default function OnboardingGroup() {
  const { loading, me, group, refresh } = useSessionContext()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [type, setType] = useState<GroupType>('student_council')
  const act = useAction()
  if (loading) return <Loading />
  if (!me) return <Navigate to={paths.start} replace />
  if (me.role !== 'group' || group) return <Navigate to={paths.groupHome} replace />

  const submit = () => act.run(async () => {
    await groups.createGroup(me.id, name.trim(), type)
    await refresh()
    nav(paths.groupHome, { replace: true })
  })
  return (
    <Page title="단체 정보">
      <form className="form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Field label="단체 이름"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 소프트웨어학부 학생회" required /></Field>
        <Field label="단체 종류" error={act.error}>
          <Select value={type} onChange={(e) => setType(e.target.value as GroupType)}
            options={Object.entries(GROUP_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
        </Field>
        <BottomAction><Button variant="primary" type="submit" busy={act.busy} disabled={!name.trim()}>시작하기</Button></BottomAction>
      </form>
    </Page>
  )
}
