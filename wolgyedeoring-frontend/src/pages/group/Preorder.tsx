// G-07 사전 주문 (시안 13, 전체 교체 저장)
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { menus as menusApi, preorder, reservations } from '../../api'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Button, Dock, Empty, ErrorBox, Field, Intro, Loading, Notice, Row, Textarea } from '../../components/ui'
import { formatWon } from '../../lib/format'
import { MenuPicker, preorderTotal, toItems, type Qty } from './MenuPicker'

export default function Preorder() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const q = useAsync(async () => {
    const r = await reservations.getReservation(id)
    const [menus, pre] = await Promise.all([menusApi.listMenus(r.store_id), preorder.getPreorder(id)])
    return { r, menus, pre }
  }, [id])
  const [qty, setQty] = useState<Qty>({})
  const [note, setNote] = useState<string | null>(null) // 시안 13 알레르기·식이 제한 (011)
  const act = useAction()
  useEffect(() => {
    if (q.data) setQty(Object.fromEntries(q.data.pre.items.filter((i) => i.menu_id).map((i) => [i.menu_id!, i.qty])))
  }, [q.data])

  if (q.loading) return <Page title="사전 주문"><Loading /></Page>
  if (q.error || !q.data) return <Page title="사전 주문"><ErrorBox message={q.error?.message ?? '불러오지 못했어요'} /></Page>
  const { r, menus, pre } = q.data
  const total = preorderTotal(menus, qty)
  const per = Math.ceil(total / r.headcount)
  const budget = r.budget_per_person
  const over = budget !== null && per > budget

  if (!pre.editable) return <Page title="사전 주문"><Empty art="food" title="지금은 바꿀 수 없어요.">사전 주문은 행사 24시간 전까지 바꿀 수 있어요.</Empty></Page>
  return (
    <Page title="사전 주문" dock={<Dock>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" busy={act.busy} onClick={() => void act.run(async () => {
      await preorder.setPreorder(id, toItems(qty))
      if (note !== null && note.trim() !== (r.preorder_note ?? '')) await preorder.setPreorderNote(id, note.trim())
      nav(paths.groupReservation(id), { replace: true })
    })}>주문 구성 저장</Button></Dock>}>
      <Intro title="미리 고르고 편하게 만나요." sub="가게가 준비할 메뉴와 수량을 알려주세요." />
      <Notice>{r.headcount}명{budget ? <> · 1인 예산 {formatWon(budget)}<br />총 예산 {formatWon(budget * r.headcount)}</> : ''}</Notice>
      <MenuPicker menus={menus} qty={qty} onChange={setQty} />
      <Field label="알레르기·식이 제한 (선택)" hint="가게가 메뉴를 준비할 때 확인해요"><Textarea value={note ?? r.preorder_note ?? ''} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="미리 확인할 내용을 알려주세요." /></Field>
      <section className="card">
        <Row label="주문 합계" value={formatWon(total)} />
        <Row label="1인당 예상" value={formatWon(per)} />
        {budget !== null && <Row label="1인 예산" value={formatWon(budget)} />}
        <div className="divider"><p className="meta">{over ? `1인 예산을 ${formatWon(per - budget!)} 넘었어요. 수량을 다시 확인해 주세요.` : `${budget !== null ? '1인 예산 안에 있어요. ' : ''}예약금은 주문 합계와 별도로 확인해 주세요.`}</p></div>
      </section>
    </Page>
  )
}
