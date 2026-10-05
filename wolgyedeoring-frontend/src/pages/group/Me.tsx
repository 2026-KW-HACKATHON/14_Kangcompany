// G-14 내 정보 · 단체 정보 수정 · 로그아웃
import { useState } from 'react'
import { auth, groups } from '../../api'
import { useGroupSession } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Button, Field, Input, Section, Select } from '../../components/ui'
import { GROUP_TYPE_LABEL } from '../../lib/status'
import type { GroupType } from '../../types/db'

export default function GroupMe() {
  const { me, group, refresh } = useGroupSession()
  const [p, setP] = useState({ name: me.display_name, phone: me.phone ?? '' })
  const [g, setG] = useState({ name: group.name, type: group.group_type })
  const [saved, setSaved] = useState(false)
  const act = useAction()
  const save = () => act.run(async () => {
    await auth.updateMe(me.id, { display_name: p.name.trim(), phone: p.phone.trim() || null })
    await groups.updateGroup(group.id, { name: g.name.trim(), group_type: g.type })
    await refresh()
    setSaved(true)
  })
  return (
    <Page title="내 정보" tabRoot>
      <Section title="담당자">
        <Field label="이름"><Input value={p.name} onChange={(e) => { setP({ ...p, name: e.target.value }); setSaved(false) }} /></Field>
        <Field label="전화번호" hint="예약이 잡힌 가게에만 보여요"><Input type="tel" value={p.phone} onChange={(e) => { setP({ ...p, phone: e.target.value }); setSaved(false) }} /></Field>
      </Section>
      <Section title="단체">
        <Field label="단체 이름"><Input value={g.name} onChange={(e) => { setG({ ...g, name: e.target.value }); setSaved(false) }} /></Field>
        <Field label="단체 종류">
          <Select value={g.type} onChange={(e) => { setG({ ...g, type: e.target.value as GroupType }); setSaved(false) }} options={Object.entries(GROUP_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
        </Field>
      </Section>
      {act.error && <p className="inline-error" role="alert">{act.error}</p>}
      <Button variant="secondary" busy={act.busy} onClick={() => void save()} disabled={!p.name.trim() || !g.name.trim()}>{saved ? '저장했어요' : '저장하기'}</Button>
      <Button variant="text" onClick={() => void auth.signOut()}>로그아웃</Button>
    </Page>
  )
}
