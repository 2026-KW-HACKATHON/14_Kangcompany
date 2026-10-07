// S-11 영수증 확인 (시안 28) → 확정하면 소비 기록 (시안 29)
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { menus as menusApi, receipts, reservations } from '../../api'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Badge, Button, Check, Dock, ErrorBox, Field, Input, Loading, Notice, Row, Section, Select, SuccessHero } from '../../components/ui'
import { RECEIPT_STATUS, eventLabel } from '../../lib/status'
import { dateTimeLabel, formatWon } from '../../lib/format'
import type { Menu } from '../../types/db'

export default function OwnerReceipt() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const q = useAsync(async () => {
    const rc = await receipts.getReceipt(id)
    const res = await reservations.getReservation(rc.reservation_id)
    return { rc, res, menus: await menusApi.listMenus(res.store_id, { includeInactive: true }) }
  }, [id])
  const act = useAction()
  const [checked, setChecked] = useState(false)
  const run = (fn: () => Promise<unknown>) => act.run(async () => { await fn(); await q.reload() })

  if (q.loading && !q.data) return <Page title="영수증 확인"><Loading /></Page>
  if (q.error || !q.data) return <Page title="영수증 확인"><ErrorBox message={q.error?.message ?? '영수증을 찾을 수 없어요'} onRetry={q.reload} /></Page>
  const { rc, res, menus } = q.data
  const sum = rc.receipt_items.reduce((s, i) => s + (i.amount ?? 0), 0)
  const problems = rc.receipt_items.filter((i) => i.validation_error || !i.menu_id).length

  // 시안 29: 확정된 소비 기록
  if (rc.status === 'done') return (
    <Page title="소비 기록" back={paths.ownerReservation(res.id)} dock={<Dock><Button variant="primary" onClick={() => nav(paths.ownerStats)}>가게 분석 보기</Button></Dock>}>
      <SuccessHero art="receipt" title="소비 기록을 확인했어요.">확정한 기록을 가게 분석에서<br />확인할 수 있어요.</SuccessHero>
      <Badge tone="success">확정</Badge>
      <section className="card">
        <p className="meta">이번 소비 금액</p>
        <p className="big">{formatWon(rc.total_amount ?? sum)}</p>
        <Row label="품목 수" value={`${rc.receipt_items.length}개`} />
        <Row label="단체" value={res.groups.name} />
        <Row label="모임" value={`${eventLabel(res.event_type, res.requests?.note)} · ${res.headcount}명`} />
        <Row label="1인당" value={formatWon(Math.round((rc.total_amount ?? sum) / res.headcount))} />
      </section>
      <Section title="품목">
        {rc.receipt_items.map((it) => <Row key={it.id} label={`${it.menus?.name ?? it.raw_name} × ${it.qty ?? '-'}`} value={formatWon(it.amount)} />)}
      </Section>
      <Button onClick={() => nav(paths.ownerHome)}>가게 홈으로</Button>
    </Page>
  )

  const st = RECEIPT_STATUS[rc.status]
  return (
    <Page title="영수증 확인" back={paths.ownerReservation(res.id)}
      dock={rc.status === 'needs_review' ? (
        <Dock meta={problems ? `확인이 필요한 품목 ${problems}개를 먼저 고쳐 주세요.` : undefined}>
          {act.error && <p className="note-error" role="alert">{act.error}</p>}
          <Button variant="primary" busy={act.busy} disabled={problems > 0 || !checked} onClick={() => void run(() => receipts.confirmReceipt(rc.id))}>영수증 확정하기</Button>
        </Dock>
      ) : undefined}>
      <div className="row"><Badge tone={st.tone}>{st.label}</Badge><span className="meta">{res.groups.name} · {dateTimeLabel(res.start_at)}</span></div>
      <Notice>확인한 품목과 금액만 소비 분석에 반영돼요. 원본 사진은 보관하지 않아요.</Notice>
      {rc.validation_note && <Notice tone="warning">{rc.validation_note}</Notice>}
      {rc.status === 'failed' && <Notice tone="danger">인식에 실패한 영수증이에요. 예약 상세에서 다시 등록해 주세요.</Notice>}

      <Section title={`인식 결과 확인 · 품목 ${rc.receipt_items.length}개${problems ? ` · 확인 필요 ${problems}개` : ''}`}>
        {rc.receipt_items.map((it) => (
          <ItemRow key={it.id} item={it} menus={menus} busy={act.busy}
            onSave={(menuId, qty, price) => void run(() => receipts.correctItem(it.id, menuId, qty, price))}
            onDelete={() => void run(() => receipts.deleteItem(it.id))} />
        ))}
        <AddItem menus={menus} busy={act.busy} onAdd={(menuId, qty, price) => void run(() => receipts.addItem(rc.id, menuId, qty, price))} />
      </Section>
      <section className="card">
        <div className="row"><span>품목 합계</span><strong className="big">{formatWon(sum)}</strong></div>
        {rc.total_amount !== null && rc.total_amount !== sum && <p className="meta">영수증 총액 {formatWon(rc.total_amount)}과 {formatWon(Math.abs(rc.total_amount - sum))} 차이가 있어요.</p>}
      </section>
      {rc.status === 'needs_review' && <Check label="품목·수량·금액을 확인했어요" checked={checked} onChange={setChecked} />}
    </Page>
  )
}

type Item = Awaited<ReturnType<typeof receipts.getReceipt>>['receipt_items'][number]

function ItemRow({ item, menus, busy, onSave, onDelete }: {
  item: Item; menus: Menu[]; busy: boolean
  onSave: (menuId: number | null, qty: number, price: number) => void; onDelete: () => void
}) {
  const [f, setF] = useState({ menu: item.menu_id ? String(item.menu_id) : '', qty: String(item.qty ?? ''), price: String(item.unit_price ?? '') })
  const bad = Boolean(item.validation_error || !item.menu_id)
  const dirty = f.menu !== (item.menu_id ? String(item.menu_id) : '') || f.qty !== String(item.qty ?? '') || f.price !== String(item.unit_price ?? '')
  return (
    <div className={`ocr-row${bad ? ' needs-check' : ''}`}>
      <div className="row">
        <h3>{item.raw_name}</h3>
        {bad ? <Badge tone="warning">확인 필요</Badge> : item.is_corrected ? <Badge tone="success">수정함</Badge> : <span className="meta">{formatWon(item.amount)}</span>}
      </div>
      {item.validation_error && <p className="note-error">{item.validation_error}</p>}
      <div className="pair">
        <Field label="수량"><Input type="number" min={1} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        <Field label="단가 (원)"><Input type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
      </div>
      <Field label="연결할 메뉴">
        <Select value={f.menu} onChange={(e) => setF({ ...f, menu: e.target.value })}
          options={[{ value: '', label: '메뉴 선택' }, ...menus.map((m) => ({ value: String(m.id), label: `${m.name}${m.is_active ? '' : ' (판매 중지)'}` }))]} />
      </Field>
      <div className="row">
        <Button variant="danger" onClick={onDelete}>이 줄 삭제</Button>
        <Button variant="text" busy={busy} disabled={!dirty || !f.qty || f.price === ''} onClick={() => onSave(f.menu ? Number(f.menu) : null, Number(f.qty), Number(f.price))}>저장</Button>
      </div>
    </div>
  )
}

function AddItem({ menus, busy, onAdd }: { menus: Menu[]; busy: boolean; onAdd: (menuId: number, qty: number, price: number) => void }) {
  const [f, setF] = useState({ menu: '', qty: '1' })
  const menu = menus.find((m) => String(m.id) === f.menu)
  return (
    <div className="ocr-row">
      <h3>빠진 품목 추가</h3>
      <Field label="메뉴"><Select value={f.menu} onChange={(e) => setF({ ...f, menu: e.target.value })} options={[{ value: '', label: '메뉴 선택' }, ...menus.map((m) => ({ value: String(m.id), label: `${m.name} ${formatWon(m.price)}` }))]} /></Field>
      <div className="pair">
        <Field label="수량"><Input type="number" min={1} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        <div className="field"><span className="field-label">&nbsp;</span><Button busy={busy} disabled={!menu || !Number(f.qty)} onClick={() => { onAdd(menu!.id, Number(f.qty), menu!.price ?? 0); setF({ menu: '', qty: '1' }) }}>추가</Button></div>
      </div>
    </div>
  )
}
