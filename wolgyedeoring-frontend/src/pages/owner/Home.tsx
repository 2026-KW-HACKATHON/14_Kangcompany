// S-01 홈: 새 요청(기한 임박순) · 오늘/이번 주 예약 · 완료 처리 필요 · 확인 필요 영수증 · 메뉴 미등록 안내
import { useNavigate } from 'react-router-dom'
import { menus, receipts, requests, reservations } from '../../api'
import { paths } from '../../app/paths'
import { useOwnerSession } from '../../app/session'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { ReservationCard } from '../../components/cards'
import { Badge, Button, Card, Countdown, ErrorBox, Loading, Section } from '../../components/ui'
import { EVENT_LABEL } from '../../lib/status'
import { formatDateTime } from '../../lib/format'

export default function OwnerHome() {
  const { store } = useOwnerSession()
  const nav = useNavigate()
  const q = useAsync(async () => {
    const [reqs, res, rcs, ms] = await Promise.all([
      requests.listOpenRequestsForStore(store.id), reservations.listMyReservations(),
      receipts.listReceiptsNeedingReview(), menus.listMenus(store.id),
    ])
    const now = Date.now()
    const week = now + 7 * 864e5
    return {
      newReqs: reqs.filter((r) => !r.my_response),
      thisWeek: res.filter((r) => ['awaiting_payment', 'confirmed'].includes(r.status) && new Date(r.start_at).getTime() >= now && new Date(r.start_at).getTime() < week),
      needFinish: res.filter((r) => r.status === 'confirmed' && new Date(r.start_at).getTime() < now),
      rcs, noMenu: ms.length === 0,
    }
  }, [store.id])

  return (
    <Page title={store.name} tabRoot>
      {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error.message} onRetry={q.reload} /> : (
        <>
          {q.data!.noMenu && (
            <Card onClick={() => nav(paths.ownerMenus)}>
              <span className="strong">메뉴판 사진 한 장이면 메뉴가 등록돼요</span>
              <span className="muted">메뉴가 있어야 단체가 사전 주문을 할 수 있어요</span>
            </Card>
          )}
          {q.data!.needFinish.length > 0 && (
            <Section title="완료 처리가 필요해요">
              <ul className="list">{q.data!.needFinish.map((r) => <ReservationCard key={r.id} r={r} role="owner" />)}</ul>
            </Section>
          )}
          {q.data!.rcs.length > 0 && (
            <Section title="확인이 필요한 영수증">
              <ul className="list">
                {q.data!.rcs.map((rc) => (
                  <Card as="li" key={rc.id} onClick={() => nav(paths.ownerReceipt(rc.id))}>
                    <div className="card-top"><span className="strong">{rc.reservations.groups.name}</span><Badge tone="warning">확인 필요</Badge></div>
                    <span className="muted">{formatDateTime(rc.reservations.start_at)}</span>
                  </Card>
                ))}
              </ul>
            </Section>
          )}
          <Section title={`새 요청 ${q.data!.newReqs.length}건`} action={<Button variant="text" onClick={() => nav(paths.ownerInbox)}>전체 보기</Button>}>
            {q.data!.newReqs.length ? (
              <ul className="list">
                {q.data!.newReqs.slice(0, 3).map((r) => (
                  <Card as="li" key={r.request_id} onClick={() => nav(paths.ownerRequest(r.request_id))}>
                    <div className="card-top"><span className="strong">{r.group_name} {EVENT_LABEL[r.event_type]}</span><Countdown until={r.response_deadline} /></div>
                    <span>{formatDateTime(r.desired_at)} · {r.headcount}명</span>
                  </Card>
                ))}
              </ul>
            ) : <p className="muted">새 요청이 없어요. 한산한 날짜를 먼저 열어두면 단체가 찾아와요.</p>}
          </Section>
          <Section title="이번 주 예약">
            {q.data!.thisWeek.length ? <ul className="list">{q.data!.thisWeek.map((r) => <ReservationCard key={r.id} r={r} role="owner" />)}</ul> : <p className="muted">이번 주 예약이 없어요</p>}
          </Section>
          <div className="btn-row">
            <Button variant="secondary" onClick={() => nav(paths.ownerSlots)}>빈 날짜 관리</Button>
            <Button variant="secondary" onClick={() => nav(paths.ownerLayout)}>좌석 배치도</Button>
          </div>
        </>
      )}
    </Page>
  )
}
