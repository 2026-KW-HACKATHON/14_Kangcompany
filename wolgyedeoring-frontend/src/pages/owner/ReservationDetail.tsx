// S-05 예약 상세: 단체 연락처 · 사전 주문(준비량) · 참석 인원 · 조건 수정 응답 · 완료/노쇼 · 취소 · 영수증
import { useNavigate, useParams } from 'react-router-dom'
import { preorder, receipts, reservations } from '../../api'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Badge, BottomAction, Button, ErrorBox, Loading, Rows, Section } from '../../components/ui'
import { EVENT_LABEL, RECEIPT_STATUS, RESERVATION_STATUS, paymentView, reservationNextStep } from '../../lib/status'
import { formatDateTime, formatWon } from '../../lib/format'

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
  const run = (fn: () => Promise<unknown>) => act.run(async () => { await fn(); await q.reload() })

  if (q.loading) return <Page title="예약" back><Loading /></Page>
  if (q.error || !q.data) return <Page title="예약" back><ErrorBox message={q.error?.message ?? '예약을 찾을 수 없어요'} onRetry={q.reload} /></Page>
  const { r, act: flags, pre, pay, rcs, contacts } = q.data
  const st = RESERVATION_STATUS[r.status]
  const next = reservationNextStep(r.status, 'owner', { hasReceipt: rcs.length > 0 })
  const past = new Date(r.start_at).getTime() < Date.now()

  return (
    <Page title={r.groups.name} back={paths.ownerInboxReservations}>
      <div className="btn-row"><Badge tone={st.tone}>{st.label}</Badge>{r.status === 'confirmed' && past && <Badge tone="warning">완료 처리가 필요해요</Badge>}</div>
      {next && <p className="strong">{next}</p>}
      <Rows rows={[
        ['행사', EVENT_LABEL[r.event_type]], ['일시', formatDateTime(r.start_at)], ['인원', `${r.headcount}명`],
        ['예약금', r.deposit_amount > 0 ? `${formatWon(r.deposit_amount)} · ${paymentView(pay?.status ?? null).label}` : '없음'],
        ['담당자', contacts ? <a href={`tel:${contacts.group.leader_phone ?? ''}`}>{contacts.group.leader_name} {contacts.group.leader_phone ?? '(번호 없음)'}</a> : '-'],
      ]} />

      {r.modify_status === 'pending' && (
        <Section title="조건 수정 요청">
          <Rows rows={[
            ['일시', r.modify_start_at && r.modify_start_at !== r.start_at ? `${formatDateTime(r.start_at)} → ${formatDateTime(r.modify_start_at)}` : '변경 없음'],
            ['인원', r.modify_headcount && r.modify_headcount !== r.headcount ? `${r.headcount}명 → ${r.modify_headcount}명` : '변경 없음'],
            ...(r.modify_note ? [['사유', r.modify_note] as [string, string]] : []),
          ]} />
          {flags.can_respond_modify && (
            <div className="btn-row">
              <Button variant="secondary" busy={act.busy} onClick={() => void run(() => reservations.respondModification(id, true))}>수정 수락</Button>
              <Button variant="danger" busy={act.busy} onClick={() => void run(() => reservations.respondModification(id, false))}>수정 거절</Button>
            </div>
          )}
        </Section>
      )}

      <Section title="사전 주문 (준비량)">
        {pre.items.length ? (
          <>
            <ul className="list">{pre.items.map((i) => <li key={i.name} className="row"><span>{i.name} × {i.qty}</span><span>{formatWon(i.subtotal)}</span></li>)}</ul>
            <Rows rows={[['합계', formatWon(pre.total)]]} />
          </>
        ) : <p className="muted">사전 주문이 없어요</p>}
      </Section>

      {(rcs.length > 0 || flags.can_upload_receipt) && (
        <Section title="영수증" action={flags.can_upload_receipt && <Button variant="text" onClick={() => nav(paths.ownerReceiptUpload(id))}>영수증 등록</Button>}>
          {rcs.map((rc) => (
            <div key={rc.id} className="row card-link" onClick={() => nav(paths.ownerReceipt(rc.id))}>
              <span>{formatDateTime(rc.created_at)} · {formatWon(rc.total_amount)}</span><Badge tone={RECEIPT_STATUS[rc.status].tone}>{RECEIPT_STATUS[rc.status].label}</Badge>
            </div>
          ))}
        </Section>
      )}

      {flags.can_cancel && (
        <Button variant="danger" busy={act.busy} onClick={() => {
          if (confirm('예약을 취소할까요? 단체에게 알림이 가요.' + (flags.cancel_via === 'toss' ? ' 결제된 예약금은 환불돼요.' : ''))) void run(() => reservations.cancelReservation(id, flags.cancel_via, '가게 사정으로 취소'))
        }}>예약 취소</Button>
      )}
      {act.error && <p className="inline-error" role="alert">{act.error}</p>}

      {flags.can_finish && (
        <BottomAction>
          <div className="btn-row">
            <Button variant="danger" busy={act.busy} onClick={() => { if (confirm('노쇼로 처리할까요?')) void run(() => reservations.finishReservation(id, true)) }}>노쇼 처리</Button>
          </div>
          <Button variant="primary" busy={act.busy} onClick={() => void run(() => reservations.finishReservation(id))}>행사 완료 처리</Button>
        </BottomAction>
      )}
    </Page>
  )
}
