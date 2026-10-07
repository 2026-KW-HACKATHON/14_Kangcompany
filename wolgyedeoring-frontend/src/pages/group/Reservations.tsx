// G-11 내 예약 (시안 16): 진행 중 / 지난 예약 + 상태 필터. 응답 대기 요청도 함께
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requests, reservations } from '../../api'
import { paths } from '../../app/paths'
import { useGroupSession } from '../../app/session'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { RequestCard, ReservationCard } from '../../components/cards'
import { Button, Empty, ErrorBox, FilterRow, Loading, Segmented } from '../../components/ui'
import { effectiveRequestStatus } from '../../lib/status'

type Filter = 'all' | 'waiting' | 'pay' | 'confirmed'
export default function GroupReservations() {
  const { group } = useGroupSession()
  const nav = useNavigate()
  const [view, setView] = useState<'active' | 'past'>('active')
  const [filter, setFilter] = useState<Filter>('all')
  const q = useAsync(async () => {
    const [reqs, res] = await Promise.all([requests.listMyRequests(group.id), reservations.listMyReservations()])
    const now = Date.now()
    const active = res.filter((r) => ['awaiting_payment', 'confirmed'].includes(r.status) && new Date(r.start_at).getTime() > now - 6 * 3600e3)
    return {
      openReqs: reqs.filter((r) => effectiveRequestStatus(r) === 'open'),
      active,
      past: res.filter((r) => !active.includes(r)).reverse(),
      closedReqs: reqs.filter((r) => ['expired', 'cancelled'].includes(effectiveRequestStatus(r))),
    }
  }, [group.id])
  const d = q.data
  const reqs = d && (filter === 'all' || filter === 'waiting') ? d.openReqs : []
  const res = d ? d.active.filter((r) => filter === 'all' || (filter === 'pay' && r.status === 'awaiting_payment') || (filter === 'confirmed' && r.status === 'confirmed')) : []
  return (
    <Page title="내 예약" back={false} nav>
      <Segmented value={view} onChange={setView} options={[{ value: 'active', label: '진행 중' }, { value: 'past', label: '지난 예약' }]} />
      {view === 'active' && <FilterRow value={filter} onChange={setFilter} options={[{ value: 'all', label: '전체' }, { value: 'waiting', label: '응답 대기' }, { value: 'pay', label: '결제 대기' }, { value: 'confirmed', label: '확정' }]} />}
      {q.loading ? <Loading /> : q.error || !d ? <ErrorBox message={q.error?.message ?? ''} onRetry={q.reload} /> : view === 'active' ? (
        !reqs.length && !res.length ? <Empty title="이 상태의 예약이 없어요." action={<Button onClick={() => nav(paths.groupRequestNew)}>새 예약 요청</Button>}>날짜·인원·예산을 알려주면 가게가 먼저 응답해요.</Empty> : (
          <section>
            {res.map((r) => <ReservationCard key={r.id} r={r} role="group" />)}
            {reqs.map((r) => <RequestCard key={r.id} r={r} />)}
          </section>
        )
      ) : (
        !d.past.length && !d.closedReqs.length ? <Empty title="지난 예약이 없어요." /> : (
          <section>
            {d.past.map((r) => <ReservationCard key={r.id} r={r} role="group" />)}
            {d.closedReqs.map((r) => <RequestCard key={r.id} r={r} />)}
          </section>
        )
      )}
    </Page>
  )
}
