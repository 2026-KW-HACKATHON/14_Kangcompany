// G-05 공개 빈자리 예약 신청 (시안 17 → 신청): 모임 종류 · 인원 · 예산 + 사전 주문(선택)
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { menus as menusApi, reservations } from '../../api'
import { supabase } from '../../lib/supabase'
import { unwrap } from '../../lib/errors'
import { paths } from '../../app/paths'
import { useGroupSession } from '../../app/session'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Art } from '../../components/icons'
import { Badge, Button, Dock, ErrorBox, Field, Input, Loading, OptionGrid, Row, Rows, Section } from '../../components/ui'
import { EVENT_CHOICES } from '../../lib/status'
import { dateLabel, formatWon, timeLabel } from '../../lib/format'
import { MenuPicker, preorderTotal, toItems, type Qty } from './MenuPicker'
import type { SlotWithStore } from '../../api/slots'

export default function SlotBook() {
  const id = Number(useParams().id)
  const { group } = useGroupSession()
  const nav = useNavigate()
  const q = useAsync(async () => {
    const slot = unwrap(await supabase.from('slots').select('*, stores(id, name, address, phone, photo_url, intro, lat, lng)').eq('id', id).single()) as SlotWithStore
    return { slot, menus: await menusApi.listMenus(slot.store_id) }
  }, [id])
  const student = group.group_type === 'student_council'
  const choices = EVENT_CHOICES.filter((c) => student || !c.studentOnly)
  const [eventKey, setEventKey] = useState(choices[0].key)
  const [f, setF] = useState({ headcount: '', budget: '' })
  const [qty, setQty] = useState<Qty>({})
  const act = useAction()

  if (q.loading) return <Page title="빈자리 예약"><Loading /></Page>
  if (q.error || !q.data) return <Page title="빈자리 예약"><ErrorBox message={q.error?.message ?? '날짜를 찾을 수 없어요'} /></Page>
  const { slot, menus } = q.data
  const hc = Number(f.headcount)
  const valid = Number.isInteger(hc) && hc > 0 && hc <= slot.capacity
  const total = preorderTotal(menus, qty)
  const choice = choices.find((c) => c.key === eventKey) ?? choices[0]

  const submit = () => act.run(async () => {
    const r = await reservations.bookSlot({
      slotId: slot.id, groupId: group.id, eventType: choice.type, headcount: hc,
      budgetPerPerson: f.budget ? Number(f.budget) : null, items: toItems(qty),
    }) as { id?: number; reservation_id?: number }
    nav(paths.groupReservation(r.reservation_id ?? r.id!), { replace: true })
  })

  return (
    <Page title="빈자리 예약"
      dock={<Dock meta={!valid ? `인원을 입력해 주세요 (최대 ${slot.capacity}명)` : undefined}>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" busy={act.busy} disabled={!valid} onClick={() => void submit()}>이 날짜로 예약하기</Button></Dock>}>
      <div className="hero-row">
        <div><Badge tone="success">예약 가능</Badge><h2 style={{ marginTop: 12 }}>{slot.stores.name}</h2><p className="subtitle">{slot.stores.intro ?? slot.stores.address ?? ''}</p></div>
        <Art name="store" />
      </div>
      <section className="card">
        <Rows rows={[['방문 날짜', dateLabel(slot.start_at)], ['시간', `${timeLabel(slot.start_at)} – ${timeLabel(slot.end_at)}`], ['최대 인원', `${slot.capacity}명`], ['예약금', slot.deposit_amount > 0 ? formatWon(slot.deposit_amount) : '없음']]} />
      </section>
      <Section title="모임 종류">
        <OptionGrid value={eventKey} onChange={setEventKey} options={choices.map((c) => ({ value: c.key, label: c.label }))} />
      </Section>
      <Field label="예상 인원" error={f.headcount && !valid ? `최대 ${slot.capacity}명까지 가능해요` : null}>
        <Input type="number" inputMode="numeric" min={1} max={slot.capacity} value={f.headcount} onChange={(e) => setF({ ...f, headcount: e.target.value })} placeholder="예: 20" />
      </Field>
      <Field label="1인 예산 (선택, 원)"><Input type="number" inputMode="numeric" min={0} step={1000} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} placeholder="예: 25000" /></Field>
      <Section title="사전 주문 (선택)">
        <MenuPicker menus={menus} qty={qty} onChange={setQty} />
        {total > 0 && <section className="card"><Row label="주문 합계" value={formatWon(total)} />{hc > 0 && <Row label="1인당 예상" value={formatWon(Math.ceil(total / hc))} />}</section>}
      </Section>
    </Page>
  )
}
