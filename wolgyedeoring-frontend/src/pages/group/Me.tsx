// G-14 단체 정보 (시안 8): 단체·담당자 정보 수정 · 로그아웃
import { useState } from 'react'
import { auth, groups } from '../../api'
import { useGroupSession } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Button, Dock, Field, Input, Intro, Select } from '../../components/ui'
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
  const touch = () => setSaved(false)
  return (
    <Page title="단체 정보" back={false} nav
      dock={<Dock meta={saved ? '저장했어요.' : undefined}>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" busy={act.busy} disabled={!p.name.trim() || !g.name.trim()} onClick={() => void save()}>변경 내용 저장</Button></Dock>}>
      <Intro title={group.name} sub="가게와 공유할 단체 정보를 관리해요." />
      <form onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Field label="단체명"><Input value={g.name} onChange={(e) => { setG({ ...g, name: e.target.value }); touch() }} required /></Field>
        <Field label="단체 유형">
          <Select value={g.type} onChange={(e) => { setG({ ...g, type: e.target.value as GroupType }); touch() }} options={Object.entries(GROUP_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="담당자 이름"><Input value={p.name} onChange={(e) => { setP({ ...p, name: e.target.value }); touch() }} required /></Field>
        <Field label="담당자 연락처" hint="예약이 잡힌 가게에만 보여요"><Input type="tel" value={p.phone} onChange={(e) => { setP({ ...p, phone: e.target.value }); touch() }} /></Field>
      </form>
      <Button variant="danger" full onClick={() => void auth.signOut()}>로그아웃</Button>
    </Page>
  )
}
