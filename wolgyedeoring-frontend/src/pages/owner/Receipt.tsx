// S-11 영수증 확인·보정: 문제 있는 품목 강조 → 메뉴 매칭·수량·단가 수정 / 추가 / 삭제 → 확정
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { menus as menusApi, receipts, reservations } from '../../api'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Badge, BottomAction, Button, ErrorBox, Input, Loading, Rows, Section, Select } from '../../components/ui'
import { RECEIPT_STATUS } from '../../lib/status'
import { formatDateTime, formatWon } from '../../lib/format'
import type { Menu } from '../../types/db'

export default function OwnerReceipt() {
  const id = Number(useParams().id)
  const q = useAsync(async () => {
    const rc = await receipts.getReceipt(id)
    const res = await reservations.getReservation(rc.reservation_id)
    return { rc, res, menus: await menusApi.listMenus(res.store_id, { includeInactive: true }) }
  }, [id])
  const act = useAction()
  const run = (fn: () => Promise<unknown>) => act.run(async () => { await fn(); await q.reload() })

  if (q.loading && !q.data) return <Page title="영수증" back><Loading /></Page>
  if (q.error || !q.data) return <Page title="영수증" back><ErrorBox message={q.error?.message ?? '영수증을 찾을 수 없어요'} onRetry={q.reload} /></Page>
  const { rc, res, menus } = q.data
  const st = RECEIPT_STATUS[rc.status]
  const editable = rc.status === 'needs_review' || rc.status === 'done'
  const sum = rc.receipt_items.reduce((s, i) => s + (i.amount ?? 0), 0)
  const problems = rc.receipt_items.filter((i) => i.validation_error || !i.menu_id).length

  return (
    <Page title={`${res.groups.name} 영수증`} back={paths.ownerReservation(res.id)}>
      <Badge tone={st.tone}>{st.label}</Badge>
      <Rows rows={[
        ['행사', formatDateTime(res.start_at)], ['영수증 일시', rc.receipt_at ? formatDateTime(rc.receipt_at) : '-'],
        ['영수증 총액', formatWon(rc.total_amount)], ['품목 합계', formatWon(sum)],
      ]} />
      {rc.validation_note && <p className="muted" style={{ whiteSpace: 'pre-line' }}>{rc.validation_note}</p>}
      {rc.status === 'failed' && <p className="inline-error">인식에 실패한 영수증이에요. 예약 상세에서 다시 등록해 주세요.</p>}

      <Section title={`품목 ${rc.receipt_items.length}개${problems ? ` · 확인 필요 ${problems}개` : ''}`}>
        <ul className="list">
          {rc.receipt_items.map((it) => (
            <ItemRow key={it.id} item={it} menus={menus} editable={editable} busy={act.busy}
              onSave={(menuId, qty, price) => void run(() => receipts.correctItem(it.id, menuId, qty, price))}
              onDelete={() => { if (confirm(`"${it.raw_name}" 줄을 지울까요?`)) void run(() => receipts.deleteItem(it.id)) }} />
          ))}
        </ul>
        {editable && <AddItem menus={menus} busy={act.busy} onAdd={(menuId, qty, price) => void run(() => receipts.addItem(rc.id, menuId, qty, price))} />}
      </Section>
      {act.error && <p className="inline-error" role="alert">{act.error}</p>}
      {rc.status === 'needs_review' && (
        <BottomAction hint={problems ? `확인이 필요한 품목 ${problems}개를 먼저 고쳐 주세요` : '확정하면 분석에 반영돼요'}>
          <Button variant="primary" busy={act.busy} disabled={problems > 0} onClick={() => void run(() => receipts.confirmReceipt(rc.id))}>영수증 확정하기</Button>
        </BottomAction>
      )}
    </Page>
  )
}

type Item = Awaited<ReturnType<typeof receipts.getReceipt>>['receipt_items'][number]

function ItemRow({ item, menus, editable, busy, onSave, onDelete }: {
  item: Item; menus: Menu[]; editable: boolean; busy: boolean
  onSave: (menuId: number | null, qty: number, price: number) => void; onDelete: () => void
}) {
  const [f, setF] = useState({ menu: item.menu_id ? String(item.menu_id) : '', qty: String(item.qty ?? ''), price: String(item.unit_price ?? '') })
  const bad = Boolean(item.validation_error || !item.menu_id)
  const dirty = f.menu !== (item.menu_id ? String(item.menu_id) : '') || f.qty !== String(item.qty ?? '') || f.price !== String(item.unit_price ?? '')
  return (
    <li className="card" style={bad ? { borderColor: 'var(--tone-danger-fg)' } : undefined}>
      <div className="card-top">
        <span><span className="strong">{item.raw_name}</span>{item.is_corrected && <span className="muted"> · 수정함</span>}</span>
        <span>{formatWon(item.amount)}</span>
      </div>
      {item.validation_error && <p className="inline-error">{item.validation_error}</p>}
      {editable && (
        <>
          <Select value={f.menu} onChange={(e) => setF({ ...f, menu: e.target.value })} aria-label="메뉴"
            options={[{ value: '', label: '메뉴 선택' }, ...menus.map((m) => ({ value: String(m.id), label: `${m.name}${m.is_active ? '' : ' (판매 중지)'}` }))]} />
          <div className="btn-row">
            <Input type="number" min={1} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} aria-label="수량" style={{ maxWidth: 90 }} />
            <Input type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} aria-label="단가" style={{ maxWidth: 130 }} />
            <Button variant="secondary" busy={busy} disabled={!dirty || !f.qty || f.price === ''} onClick={() => onSave(f.menu ? Number(f.menu) : null, Number(f.qty), Number(f.price))}>저장</Button>
            <Button variant="danger" onClick={onDelete}>삭제</Button>
          </div>
        </>
      )}
    </li>
  )
}

function AddItem({ menus, busy, onAdd }: { menus: Menu[]; busy: boolean; onAdd: (menuId: number, qty: number, price: number) => void }) {
  const [f, setF] = useState({ menu: '', qty: '1' })
  const menu = menus.find((m) => String(m.id) === f.menu)
  return (
    <div className="card">
      <span className="strong">빠진 품목 추가</span>
      <Select value={f.menu} onChange={(e) => setF({ ...f, menu: e.target.value })} aria-label="추가할 메뉴"
        options={[{ value: '', label: '메뉴 선택' }, ...menus.map((m) => ({ value: String(m.id), label: `${m.name} ${formatWon(m.price)}` }))]} />
      <div className="btn-row">
        <Input type="number" min={1} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} aria-label="수량" style={{ maxWidth: 90 }} />
        <Button variant="secondary" busy={busy} disabled={!menu || !Number(f.qty)} onClick={() => { onAdd(menu!.id, Number(f.qty), menu!.price ?? 0); setF({ menu: '', qty: '1' }) }}>추가</Button>
      </div>
    </div>
  )
}
