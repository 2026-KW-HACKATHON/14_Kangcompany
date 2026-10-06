// G-06 예약 상세 (허브): 상태별로 보이는 행동이 다름 → reservation_actions 플래그로 결정
import { useNavigate, useParams } from 'react-router-dom'
import { preorder, receipts, reservations, rsvp } from '../../api'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Badge, BottomAction, Button, ErrorBox, Loading, Rows, Section } from '../../components/ui'
import { EVENT_LABEL, RESERVATION_STATUS, paymentView, reservationNextStep } from '../../lib/status'
import { formatDateTime, formatWon } from '../../lib/format'
import { StoreMap } from '../../components/map/StoreMap'
import { directionsUrl } from '../../components/map/kakao'

export default function GroupReservationDetail() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const q = useAsync(async () => {
    const [r, act, pre, pay, rv] = await Promise.all([
      reservations.getReservation(id), reservations.getActions(id), preorder.getPreorder(id),
      reservations.getLatestPayment(id), rsvp.getRsvpForReservation(id),
    ])
    const contacts = act.can_view_contacts ? await reservations.getContacts(id) : null
    // 실제 소비 기록: 사장님이 확정한 영수증만 (확정 전 인식 결과는 보여주지 않음)
    const done = (await receipts.listReceiptsForReservation(id)).filter((rc) => rc.status === 'done')
    const spent = await Promise.all(done.map((rc) => receipts.getReceipt(rc.id)))
    return { r, act, pre, pay, rv, contacts, spent }
  }, [id])
  const cancel = useAction()

  if (q.loading) return <Page title="예약" back><Loading /></Page>
  if (q.error || !q.data) return <Page title="예약" back><ErrorBox message={q.error?.message ?? '예약을 찾을 수 없어요'} onRetry={q.reload} /></Page>
  const { r, act, pre, pay, rv, contacts, spent } = q.data
  const st = RESERVATION_STATUS[r.status]
  const next = reservationNextStep(r.status, 'group', { hasRsvp: Boolean(rv) })

  return (
    <Page title={r.stores.name} back={paths.groupReservations}>
      <div className="btn-row"><Badge tone={st.tone}>{st.label}</Badge>{r.modify_status === 'pending' && <Badge tone="neutral">조건 수정 요청 중</Badge>}</div>
      {next && <p className="strong">{next}</p>}
      {r.stores.photo_url && <img className="store-photo" src={r.stores.photo_url} alt={`${r.stores.name} 사진`} />}

      <Rows rows={[
        ['행사', EVENT_LABEL[r.event_type]], ['일시', formatDateTime(r.start_at)], ['인원', `${r.headcount}명`],
        ...(r.budget_per_person ? [['1인 예산', formatWon(r.budget_per_person)] as [string, string]] : []),
        ['예약금', r.deposit_amount > 0 ? `${formatWon(r.deposit_amount)} · ${paymentView(pay?.status ?? null).label}` : '없음'],
      ]} />

      <Section title="가게">
        <Rows rows={[
          ['주소', r.stores.address ?? '-'],
          ['전화', contacts?.store.phone ? <a href={`tel:${contacts.store.phone}`}>{contacts.store.phone}</a> : '-'],
          ...(contacts?.store.owner_phone ? [['사장님', <a href={`tel:${contacts.store.owner_phone}`}>{contacts.store.owner_name} {contacts.store.owner_phone}</a>] as [string, React.ReactNode]] : []),
        ]} />
        {r.stores.lat != null && r.stores.lng != null && <StoreMap height={180} markers={[{ id: r.stores.id, lat: r.stores.lat, lng: r.stores.lng, title: r.stores.name }]} />}
        {directionsUrl(r.stores.name, r.stores.lat, r.stores.lng, r.stores.address) && (
          <a className="btn btn-text" href={directionsUrl(r.stores.name, r.stores.lat, r.stores.lng, r.stores.address)!} target="_blank" rel="noreferrer">길찾기</a>
        )}
      </Section>

      <Section title="사전 주문" action={act.can_edit_preorder && <Button variant="text" onClick={() => nav(paths.groupPreorder(id))}>{pre.items.length ? '수정' : '메뉴 고르기'}</Button>}>
        {pre.items.length ? (
          <>
            <ul className="list">{pre.items.map((i) => <li key={i.name} className="row"><span>{i.name} × {i.qty}</span><span>{formatWon(i.subtotal)}</span></li>)}</ul>
            <Rows rows={[['합계', formatWon(pre.total)], ['1인당', formatWon(pre.per_person)]]} />
            {pre.over_budget && <Badge tone="warning">예산을 넘었어요</Badge>}
          </>
        ) : <p className="muted">고른 메뉴가 없어요</p>}
        {act.preorder_deadline && <p className="muted">{formatDateTime(act.preorder_deadline)}까지 수정할 수 있어요</p>}
      </Section>

      {spent.length > 0 && (
        <Section title="실제 소비 기록">
          {spent.map((rc) => (
            <div key={rc.id} className="card">
              <Rows rows={[
                ['결제 일시', rc.receipt_at ? formatDateTime(rc.receipt_at) : '-'],
                ['영수증 총액', formatWon(rc.total_amount)],
                ...(r.deposit_amount > 0 ? [['예약금 (앱에서 결제, 별도)', formatWon(r.deposit_amount)] as [string, string]] : []),
                ['1인당', rc.total_amount ? formatWon(Math.round(rc.total_amount / r.headcount)) : '-'],
              ]} />
              <ul className="list">{rc.receipt_items.map((it) => (
                <li key={it.id} className="row"><span>{it.menus?.name ?? it.raw_name} × {it.qty ?? '-'}</span><span>{formatWon(it.amount)}</span></li>
              ))}</ul>
            </div>
          ))}
          <p className="muted">가게가 확인한 영수증 기록이에요. 회계 증빙은 영수증 원본으로 따로 챙겨 주세요.</p>
        </Section>
      )}

      {(act.can_rsvp || rv) && (
        <Section title="참석 조사" action={<Button variant="text" onClick={() => nav(rv ? paths.groupRsvpResponses(id) : paths.groupRsvp(id))}>{rv ? '현황 보기' : '만들기'}</Button>}>
          <p className="muted">{rv ? (act.rsvp_open ? '응답 받는 중' : '마감됨') : '링크를 공유하면 참석 인원이 예약 인원에 자동 반영돼요'}</p>
        </Section>
      )}

      <div className="btn-row">
        {act.can_modify && <Button variant="secondary" onClick={() => nav(paths.groupModify(id))}>조건 수정 요청</Button>}
        {act.can_cancel && (
          <Button variant="danger" busy={cancel.busy} onClick={() => {
            if (confirm('예약을 취소할까요?' + (act.cancel_via === 'toss' ? ' 결제한 예약금은 환불돼요.' : ''))) {
              void cancel.run(async () => { await reservations.cancelReservation(id, act.cancel_via, '단체 취소'); await q.reload() })
            }
          }}>예약 취소</Button>
        )}
      </div>
      {cancel.error && <p className="inline-error" role="alert">{cancel.error}</p>}
      <p className="muted">취소 규정 보기 (#6 B-08 결정 대기)</p>

      {act.can_pay && (
        <BottomAction><Button variant="primary" onClick={() => nav(paths.groupPay(id))}>{act.pay_method === 'zero' ? '예약 확정하기' : `예약금 ${formatWon(r.deposit_amount)} 결제하기`}</Button></BottomAction>
      )}
    </Page>
  )
}
