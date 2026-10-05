// G-07 사전 주문 (전체 교체 저장)
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { menus as menusApi, preorder, reservations } from '../../api'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { BottomAction, Button, ErrorBox, Loading, Rows } from '../../components/ui'
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
  const act = useAction()
  useEffect(() => {
    if (q.data) setQty(Object.fromEntries(q.data.pre.items.filter((i) => i.menu_id).map((i) => [i.menu_id!, i.qty])))
  }, [q.data])

  if (q.loading) return <Page title="사전 주문" back><Loading /></Page>
  if (q.error || !q.data) return <Page title="사전 주문" back><ErrorBox message={q.error?.message ?? '불러오지 못했어요'} /></Page>
  const { r, menus, pre } = q.data
  const total = preorderTotal(menus, qty)
  const budgetTotal = r.budget_per_person ? r.budget_per_person * r.headcount : null

  return (
    <Page title="사전 주문" back>
      {!pre.editable ? <p>지금은 사전 주문을 바꿀 수 없어요 (행사 24시간 전까지만 가능)</p> : (
        <>
          <MenuPicker menus={menus} qty={qty} onChange={setQty} />
          <Rows rows={[
            ['합계', formatWon(total)], ['1인당', formatWon(Math.round(total / r.headcount))],
            ...(budgetTotal ? [['예산', formatWon(budgetTotal)] as [string, string]] : []),
          ]} />
          {budgetTotal !== null && total > budgetTotal && <p className="inline-error">예산보다 {formatWon(total - budgetTotal)} 많아요 (저장은 가능해요)</p>}
          {act.error && <p className="inline-error" role="alert">{act.error}</p>}
          <BottomAction>
            <Button variant="primary" busy={act.busy} onClick={() => void act.run(async () => { await preorder.setPreorder(id, toItems(qty)); nav(paths.groupReservation(id), { replace: true }) })}>저장하기</Button>
          </BottomAction>
        </>
      )}
    </Page>
  )
}
