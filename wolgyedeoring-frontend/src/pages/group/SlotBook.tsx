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
import { integerInRange } from '../../lib/validation'

export default function SlotBook() {
  const id = Number(useParams().id)
  const { group } = useGroupSession()
  const nav = useNavigate()
  const q = useAsync(async () => {
    const slot = unwrap(await supabase.from('slots').select('*, stores(*)').eq('id', id).single()) as SlotWithStore
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
  const minHc = slot.min_headcount ?? 1 // 011 최소 인원 (서버도 확인)
  const countValid = integerInRange(f.headcount, minHc, slot.capacity)
  const budgetValid = f.budget === '' || integerInRange(f.budget)
  const available = slot.status === 'open' && Date.parse(slot.start_at) > Date.now()
  const valid = countValid && budgetValid && available
  const total = preorderTotal(menus, qty)
  const choice = choices.find((c) => c.key === eventKey) ?? choices[0]

  const submit = () => act.run(async () => {
    if (!valid || Date.parse(slot.start_at) <= Date.now()) return
    const r = await reservations.bookSlot({
      slotId: slot.id, groupId: group.id, eventType: choice.type, headcount: hc,
      budgetPerPerson: f.budget ? Number(f.budget) : slot.price_per_person ?? null, items: toItems(qty),
    }) as { id?: number; reservation_id?: number }
    nav(paths.groupReservation(r.reservation_id ?? r.id!), { replace: true })
  })

  return (
    <Page title="빈자리 예약"
      dock={<Dock meta={!available ? '이미 지난 시간이거나 예약할 수 없는 빈자리예요.' : !countValid ? `인원을 입력해 주세요 (${slot.min_headcount ? `${slot.min_headcount}~` : '최대 '}${slot.capacity}명)` : undefined}>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" busy={act.busy} disabled={!valid} onClick={() => void submit()}>이 날짜로 예약하기</Button></Dock>}>
      <div className="hero-row">
        <div><Badge tone={available ? "success" : "muted"}>{available ? "예약 가능" : "예약 불가"}</Badge><h2 style={{ marginTop: 12 }}>{slot.stores.name}</h2><p className="subtitle">{slot.stores.intro ?? slot.stores.address ?? ''}</p></div>
        <Art name="store" />
      </div>
      <section className="card">
        <Rows rows={[['방문 날짜', dateLabel(slot.start_at)], ['시간', `${timeLabel(slot.start_at)} – ${timeLabel(slot.end_at)}`], ['인원', slot.min_headcount ? `${slot.min_headcount}–${slot.capacity}명` : `최대 ${slot.capacity}명`], ...(slot.price_per_person != null ? [['1인 금액', formatWon(slot.price_per_person)] as [string, string]] : []), ['예약금', slot.deposit_amount > 0 ? formatWon(slot.deposit_amount) : '없음']]} />
        {slot.note && <p className="meta">{slot.note}</p>}
      </section>
      <Section title="모임 종류">
        <OptionGrid value={eventKey} onChange={setEventKey} options={choices.map((c) => ({ value: c.key, label: c.label }))} />
      </Section>
      <Field label="예상 인원" error={f.headcount && !countValid ? (hc < minHc ? `${minHc}명 이상부터 예약할 수 있어요` : `최대 ${slot.capacity}명까지 가능해요`) : null}>
        <Input type="number" inputMode="numeric" min={minHc} max={slot.capacity} value={f.headcount} onChange={(e) => setF({ ...f, headcount: e.target.value })} placeholder="예: 20" />
      </Field>
      <Field label="1인 예산 (선택, 원)" error={!budgetValid ? '예산은 0원 이상의 정수로 입력해 주세요.' : null}><Input type="number" inputMode="numeric" min={0} step={1000} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} placeholder={slot.price_per_person != null ? `비우면 가게 1인 금액 ${formatWon(slot.price_per_person)}` : '예: 25000'} /></Field>
      <Section title="사전 주문 (선택)">
        <MenuPicker menus={menus} qty={qty} onChange={setQty} />
        {total > 0 && <section className="card"><Row label="주문 합계" value={formatWon(total)} />{hc > 0 && <Row label="1인당 예상" value={formatWon(Math.ceil(total / hc))} />}</section>}
      </Section>
    </Page>
  )
}
