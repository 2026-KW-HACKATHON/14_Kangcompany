// S-05 예약 상세 (사장님): 단체 연락처 · 사전 주문(준비량) · 조건 수정 응답 · 완료/노쇼 · 취소 · 영수증
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { preorder, receipts, reservations } from '../../api'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Art, Icon } from '../../components/icons'
import { Badge, Button, Dock, ErrorBox, Loading, Notice, Row, Rows, Section, Sheet } from '../../components/ui'
import { RECEIPT_STATUS, RESERVATION_STATUS, eventLabel, paymentView, reservationNextStep } from '../../lib/status'
import { dateLabel, dateTimeLabel, formatWon, timeLabel } from '../../lib/format'

export default function OwnerReservationDetail() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const q = useAsync(async () => {
    const [r, act, pre, pay, rcs] = await Promise.all([
      reservations.getReservation(id), reservations.getActions(id), preorder.getPreorder(id),
      reservations.getLatestPayment(id), receipts.listReceiptsForReservation(id),
    ])
    const contacts = act.can_view_contacts ? await reservations.getContacts(id) : null
    return { r, act, pre, pay, rcs, contacts }
  }, [id])
  const act = useAction()
  const [sheet, setSheet] = useState<'cancel' | 'noshow' | null>(null)
  const run = (fn: () => Promise<unknown>) => act.run(async () => { await fn(); setSheet(null); await q.reload() })

  if (q.loading) return <Page title="예약 상세"><Loading /></Page>
  if (q.error || !q.data) return <Page title="예약 상세"><ErrorBox message={q.error?.message ?? '예약을 찾을 수 없어요'} onRetry={q.reload} /></Page>
  const { r, act: flags, pre, pay, rcs, contacts } = q.data
  const st = RESERVATION_STATUS[r.status]
  const next = reservationNextStep(r.status, 'owner', { hasReceipt: rcs.length > 0 })
  const past = new Date(r.start_at).getTime() < Date.now()

  const dock = flags.can_finish ? (
    <Dock>
      <Button variant="primary" busy={act.busy} onClick={() => void run(() => reservations.finishReservation(id))}>행사 완료 처리</Button>
      <Button variant="danger" full onClick={() => setSheet('noshow')}>노쇼로 처리</Button>
    </Dock>
  ) : flags.can_upload_receipt ? (
    <Dock><Button variant="primary" onClick={() => nav(paths.ownerReceiptUpload(id))}>영수증 등록</Button></Dock>
  ) : undefined

  return (
    <Page title="예약 상세" back={paths.ownerInboxReservations} dock={dock}
      overlay={<>
        <Sheet open={sheet === 'cancel'} danger title="예약을 취소할까요?" confirmLabel="예약 취소하기" busy={act.busy} onClose={() => setSheet(null)}
          onConfirm={() => void run(() => reservations.cancelReservation(id, flags.cancel_via, '가게 사정으로 취소'))}>
          <p className="subtitle">단체에게 알림이 가요.{flags.cancel_via === 'toss' ? ' 결제된 예약금은 환불돼요.' : ''}</p>
        </Sheet>
        <Sheet open={sheet === 'noshow'} danger title="노쇼로 처리할까요?" confirmLabel="노쇼 처리" busy={act.busy} onClose={() => setSheet(null)}
          onConfirm={() => void run(() => reservations.finishReservation(id, true))}>
          <p className="subtitle">단체가 방문하지 않은 경우에만 사용해 주세요.</p>
        </Sheet>
      </>}>
      <div className="hero-row">
        <div>
          <div className="btn-row"><Badge tone={st.tone}>{st.label}</Badge>{r.status === 'confirmed' && past && <Badge tone="warning">완료 처리 필요</Badge>}</div>
          <h2 style={{ marginTop: 12 }}>{r.groups.name}</h2>
          <p className="subtitle">{eventLabel(r.event_type, r.requests?.note)} · {r.headcount}명</p>
        </div>
        <Art name="gathering" />
      </div>
      {next && <Notice>{next}</Notice>}
      <section className="card">
        <Rows rows={[
          ['방문 날짜', dateLabel(r.start_at)], ['방문 시간', timeLabel(r.start_at)], ['예상 인원', `${r.headcount}명`],
          ...(r.budget_per_person ? [['1인 예산', formatWon(r.budget_per_person)] as [string, string]] : []),
          ['예약금', r.deposit_amount > 0 ? `${formatWon(r.deposit_amount)} · ${paymentView(pay?.status ?? null).label}` : '없음'],
        ]} />
        {contacts && <div className="divider"><Row label="연락처" value={contacts.group.leader_phone ? <a href={`tel:${contacts.group.leader_phone}`}>{contacts.group.leader_name} {contacts.group.leader_phone}</a> : `${contacts.group.leader_name} (번호 없음)`} /></div>}
      </section>

      {r.modify_status === 'pending' && (
        <Section title="조건 수정 요청">
          <section className="card">
            <Rows rows={[
              ['일시', r.modify_start_at && r.modify_start_at !== r.start_at ? `${dateTimeLabel(r.start_at)} → ${dateTimeLabel(r.modify_start_at)}` : '변경 없음'],
              ['인원', r.modify_headcount && r.modify_headcount !== r.headcount ? `${r.headcount}명 → ${r.modify_headcount}명` : '변경 없음'],
              ...(r.modify_note ? [['사유', r.modify_note] as [string, string]] : []),
            ]} />
          </section>
          {flags.can_respond_modify && (
            <div className="option-grid">
              <Button busy={act.busy} onClick={() => void run(() => reservations.respondModification(id, false))}>수정 거절</Button>
              <Button variant="primary" busy={act.busy} onClick={() => void run(() => reservations.respondModification(id, true))}>수정 수락</Button>
            </div>
          )}
        </Section>
      )}

      <Section title="사전 주문 (준비량)">
        {r.preorder_note && <Notice tone="warning">알레르기·식이 제한: {r.preorder_note}</Notice>}
        {pre.items.length ? (
          <section className="menu-list">
            {pre.items.map((i) => (
              <div key={i.name} className="menu-row"><Art name="food" /><div><h3>{i.name}</h3><p>{i.qty}개 · {formatWon(i.subtotal)}</p></div></div>
            ))}
            <section className="card"><Row label="합계" value={formatWon(pre.total)} /><Row label="1인당" value={formatWon(pre.per_person)} /></section>
          </section>
        ) : <p className="meta">사전 주문이 없어요.</p>}
      </Section>

      {rcs.length > 0 && (
        <Section title="영수증">
          <div className="link-list">
            {rcs.map((rc) => (
              <button key={rc.id} type="button" className="list-link" onClick={() => nav(paths.ownerReceipt(rc.id))}>
                <Art name="receipt" />
                <div><h3>{formatWon(rc.total_amount)}</h3><p>{dateTimeLabel(rc.created_at)} 등록</p></div>
                <Badge tone={RECEIPT_STATUS[rc.status].tone}>{RECEIPT_STATUS[rc.status].label}</Badge>
                <Icon name="chevron" />
              </button>
            ))}
          </div>
        </Section>
      )}
      {act.error && <p className="note-error" role="alert">{act.error}</p>}
      {flags.can_cancel && <Button variant="danger" full onClick={() => setSheet('cancel')}>예약 취소</Button>}
    </Page>
  )
}
