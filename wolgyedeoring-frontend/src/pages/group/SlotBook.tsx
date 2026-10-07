// G-05 빈 날짜 예약 신청: 인원 · 행사 종류 · 예산 + 사전 주문(선택)
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { menus as menusApi, reservations } from '../../api'
import { supabase } from '../../lib/supabase'
import { unwrap } from '../../lib/errors'
import { paths } from '../../app/paths'
import { useGroupSession } from '../../app/session'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { BottomAction, Button, ErrorBox, Field, Input, Loading, Rows, Section, Select } from '../../components/ui'
import { EVENT_LABEL } from '../../lib/status'
import { formatDateTime, formatWon } from '../../lib/format'
import { StoreLayoutView } from '../../components/seat/StoreLayoutView'
import { MenuPicker, preorderTotal, toItems, type Qty } from './MenuPicker'
import type { EventType } from '../../types/db'
import type { SlotWithStore } from '../../api/slots'

export default function SlotBook() {
  const id = Number(useParams().id)
  const { group } = useGroupSession()
  const nav = useNavigate()
  const q = useAsync(async () => {
    const slot = unwrap(await supabase.from('slots').select('*, stores(id, name, address, phone, photo_url, intro, lat, lng)').eq('id', id).single()) as SlotWithStore
    return { slot, menus: await menusApi.listMenus(slot.store_id) }
  }, [id])
  const [f, setF] = useState({ event_type: 'after_party' as EventType, headcount: '', budget: '' })
  const [qty, setQty] = useState<Qty>({})
  const act = useAction()

  if (q.loading) return <Page title="날짜 예약" back><Loading /></Page>
  if (q.error || !q.data) return <Page title="날짜 예약" back><ErrorBox message={q.error?.message ?? '날짜를 찾을 수 없어요'} /></Page>
  const { slot, menus } = q.data
  const hc = Number(f.headcount)
  const valid = Number.isInteger(hc) && hc > 0 && hc <= slot.capacity
  const total = preorderTotal(menus, qty)

  const submit = () => act.run(async () => {
    const r = await reservations.bookSlot({
      slotId: slot.id, groupId: group.id, eventType: f.event_type, headcount: hc,
      budgetPerPerson: f.budget ? Number(f.budget) : null, items: toItems(qty),
    }) as { id?: number; reservation_id?: number }
    nav(paths.groupReservation(r.reservation_id ?? r.id!), { replace: true })
  })

  return (
    <Page title={slot.stores.name} back>
      <Rows rows={[['일시', formatDateTime(slot.start_at)], ['최대 인원', `${slot.capacity}명`], ['예약금', slot.deposit_amount > 0 ? formatWon(slot.deposit_amount) : '없음']]} />
      <StoreLayoutView storeId={slot.store_id} headcount={hc > 0 ? hc : undefined} />
      <form className="form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Field label="행사 종류"><Select value={f.event_type} onChange={(e) => setF({ ...f, event_type: e.target.value as EventType })} options={Object.entries(EVENT_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="인원" error={f.headcount && !valid ? `최대 ${slot.capacity}명까지 가능해요` : null}>
          <Input type="number" inputMode="numeric" min={1} max={slot.capacity} value={f.headcount} onChange={(e) => setF({ ...f, headcount: e.target.value })} required />
        </Field>
        <Field label="1인 예산 (선택)"><Input type="number" inputMode="numeric" min={0} step={1000} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} /></Field>
        <Section title="사전 주문 (선택)">
          <MenuPicker menus={menus} qty={qty} onChange={setQty} />
          {total > 0 && <Rows rows={[['합계', formatWon(total)], ...(hc > 0 ? [['1인당', formatWon(Math.round(total / hc))] as [string, string]] : [])]} />}
        </Section>
        {act.error && <p className="inline-error" role="alert">{act.error}</p>}
        <BottomAction hint={!valid ? '인원을 입력해 주세요' : null}><Button variant="primary" type="submit" busy={act.busy} disabled={!valid}>이 날짜로 예약하기</Button></BottomAction>
      </form>
    </Page>
  )
}
