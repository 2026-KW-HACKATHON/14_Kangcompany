// G-11 내 예약·요청 목록 (세그먼트: 진행 중 / 지난 예약). 진행 중 요청도 함께 표시
import { useState } from 'react'
import { requests, reservations } from '../../api'
import { useGroupSession } from '../../app/session'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { RequestCard, ReservationCard } from '../../components/cards'
import { Empty, ErrorBox, Loading, Section, Segmented } from '../../components/ui'
import { effectiveRequestStatus } from '../../lib/status'

export default function GroupReservations() {
  const { group } = useGroupSession()
  const [view, setView] = useState<'active' | 'past'>('active')
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
  return (
    <Page title="예약" tabRoot>
      <Segmented value={view} onChange={setView} options={[{ value: 'active', label: '진행 중' }, { value: 'past', label: '지난 예약' }]} />
      {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error.message} onRetry={q.reload} /> : view === 'active' ? (
        !q.data!.openReqs.length && !q.data!.active.length ? <Empty>진행 중인 예약이 없어요</Empty> : (
          <>
            {q.data!.openReqs.length > 0 && <Section title="응답 대기 중인 요청"><ul className="list">{q.data!.openReqs.map((r) => <RequestCard key={r.id} r={r} />)}</ul></Section>}
            {q.data!.active.length > 0 && <Section title="예약"><ul className="list">{q.data!.active.map((r) => <ReservationCard key={r.id} r={r} role="group" />)}</ul></Section>}
          </>
        )
      ) : (
        !q.data!.past.length && !q.data!.closedReqs.length ? <Empty>지난 예약이 없어요</Empty> : (
          <>
            <ul className="list">{q.data!.past.map((r) => <ReservationCard key={r.id} r={r} role="group" />)}</ul>
            {q.data!.closedReqs.length > 0 && <Section title="만료·취소된 요청"><ul className="list">{q.data!.closedReqs.map((r) => <RequestCard key={r.id} r={r} />)}</ul></Section>}
          </>
        )
      )}
    </Page>
  )
}
