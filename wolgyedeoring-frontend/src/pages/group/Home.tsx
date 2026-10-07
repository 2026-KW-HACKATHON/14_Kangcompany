// G-01 홈: 진행 중 요청 · 다가오는 예약 · 해야 할 일 + "예약 요청하기" CTA
import { useNavigate } from 'react-router-dom'
import { requests, reservations } from '../../api'
import { paths } from '../../app/paths'
import { useGroupSession } from '../../app/session'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { RequestCard, ReservationCard } from '../../components/cards'
import { BottomAction, Button, Empty, ErrorBox, Loading, Section } from '../../components/ui'
import { effectiveRequestStatus } from '../../lib/status'
import { formatDateTime } from '../../lib/format'

export default function GroupHome() {
  const { group } = useGroupSession()
  const nav = useNavigate()
  const q = useAsync(async () => {
    const [reqs, res] = await Promise.all([requests.listMyRequests(group.id), reservations.listMyReservations({ upcomingOnly: true })])
    return {
      openReqs: reqs.filter((r) => effectiveRequestStatus(r) === 'open'),
      upcoming: res.filter((r) => r.status === 'awaiting_payment' || r.status === 'confirmed'),
    }
  }, [group.id])

  const todo = q.data?.upcoming.filter((r) => r.status === 'awaiting_payment') ?? []
  return (
    <Page title={group.name} tabRoot>
      {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error.message} onRetry={q.reload} /> : (
        <>
          {todo.length > 0 && (
            <Section title="해야 할 일">
              <ul className="list">
                {todo.map((r) => (
                  <li key={r.id} className="card card-link" onClick={() => nav(paths.groupReservation(r.id))}>
                    <span className="strong">{r.stores.name} 예약금을 결제해야 확정돼요</span>
                    <span className="muted">{formatDateTime(r.start_at)} · {r.headcount}명</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="진행 중인 요청">
            {q.data!.openReqs.length ? <ul className="list">{q.data!.openReqs.map((r) => <RequestCard key={r.id} r={r} />)}</ul>
              : <p className="muted">응답을 기다리는 요청이 없어요</p>}
          </Section>
          <Section title="다가오는 예약">
            {q.data!.upcoming.length ? <ul className="list">{q.data!.upcoming.map((r) => <ReservationCard key={r.id} r={r} role="group" />)}</ul>
              : <Empty>아직 예약이 없어요. 행사 날짜와 인원만 알려주면 가게가 먼저 연락해요.</Empty>}
          </Section>
        </>
      )}
      <BottomAction><Button variant="primary" onClick={() => nav(paths.groupRequestNew)}>예약 요청하기</Button></BottomAction>
    </Page>
  )
}
