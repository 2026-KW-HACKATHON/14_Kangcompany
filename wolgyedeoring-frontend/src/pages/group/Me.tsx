// G-14 단체 정보 (시안 8): 단체·담당자 정보 수정 · 로그아웃
import { useState } from 'react'
import { auth, groups } from '../../api'
import { useGroupSession } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Button, Dock, Field, Input, Intro, Select } from '../../components/ui'
import { GROUP_TYPE_LABEL } from '../../lib/status'
import type { GroupType } from '../../types/db'
import { GroupMoreFields, GroupSizeField, GroupTypeOther, groupExtraForm, groupExtraInput } from '../auth/GroupFields'

export default function GroupMe() {
  const { me, group, refresh } = useGroupSession()
  const [p, setP] = useState({ name: me.display_name, phone: me.phone ?? '' })
  const [g, setG] = useState({ name: group.name, type: group.group_type })
  const [extra, setExtraRaw] = useState(groupExtraForm(group))
  const [saved, setSaved] = useState(false)
  const act = useAction()
  const save = () => act.run(async () => {
    await auth.updateMe(me.id, { display_name: p.name.trim(), phone: p.phone.trim() || null })
    // 011 칸: 값이 있거나 원래 있던 칸만 보낸다 (011 실행 전 DB 에서도 저장되도록)
    const ex = Object.fromEntries(Object.entries(groupExtraInput(extra, g.type)).filter(([k, v]) => v !== null || group[k as keyof typeof group] !== undefined))
    await groups.updateGroup(group.id, { name: g.name.trim(), group_type: g.type, ...ex })
    await refresh()
    setSaved(true)
  })
  const touch = () => setSaved(false)
  const setExtra = (v: typeof extra) => { setExtraRaw(v); touch() }
  return (
    <Page title="단체 정보" back={false} nav
      dock={<Dock meta={saved ? '저장했어요.' : undefined}>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" busy={act.busy} disabled={!p.name.trim() || !g.name.trim()} onClick={() => void save()}>변경 내용 저장</Button></Dock>}>
      <Intro title={group.name} sub="가게와 공유할 단체 정보를 관리해요." />
      <form onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Field label="단체명"><Input value={g.name} onChange={(e) => { setG({ ...g, name: e.target.value }); touch() }} required /></Field>
        <Field label="단체 유형">
          <Select title="단체 유형" value={g.type} onChange={(type) => { setG({ ...g, type }); touch() }} options={Object.entries(GROUP_TYPE_LABEL).map(([value, label]) => ({ value: value as GroupType, label }))} />
        </Field>
        <GroupTypeOther type={g.type} value={extra} onChange={setExtra} />
        <GroupMoreFields value={extra} onChange={setExtra} />
        <Field label="담당자 이름"><Input value={p.name} onChange={(e) => { setP({ ...p, name: e.target.value }); touch() }} required /></Field>
        <Field label="담당자 연락처" hint="예약이 잡힌 가게에만 보여요"><Input type="tel" value={p.phone} onChange={(e) => { setP({ ...p, phone: e.target.value }); touch() }} /></Field>
        <GroupSizeField value={extra} onChange={setExtra} />
      </form>
      <Button variant="danger" full onClick={() => void auth.signOut()}>로그아웃</Button>
    </Page>
  )
}
