// S-02 동네 요청 (시안 36) / S-04 예약 목록 (?view=reservations). 하단 가운데 "요청" 버튼으로 진입
import { useNavigate, useSearchParams } from 'react-router-dom'
import { requests, reservations } from '../../api'
import { paths } from '../../app/paths'
import { useOwnerSession } from '../../app/session'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { OwnerRequestCard, ReservationCard } from '../../components/cards'
import { Button, Empty, ErrorBox, Intro, Loading, Section, Segmented } from '../../components/ui'

export default function OwnerInbox() {
  const { store } = useOwnerSession()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'reservations' ? 'reservations' : 'requests'
  const reqQ = useAsync(() => (view === 'requests' ? requests.listOpenRequestsForStore(store.id) : Promise.resolve([])), [view, store.id])
  const resQ = useAsync(() => (view === 'reservations' ? reservations.listMyReservations() : Promise.resolve([])), [view])

  return (
    <Page title={view === 'requests' ? '동네 요청' : '단체 예약'} back={false} nav>
      <Segmented value={view} onChange={(v) => setParams(v === 'requests' ? {} : { view: v })} options={[{ value: 'requests', label: '받은 요청' }, { value: 'reservations', label: '예약' }]} />
      {view === 'requests' ? (
        <>
          <Intro title="동네에서 모일 자리를 찾아요." sub="단체 연락처는 수락 후에 보여요. 날짜·인원·예산을 보고 수락할 수 있어요." />
          {reqQ.loading ? <Loading /> : reqQ.error ? <ErrorBox message={reqQ.error.message} onRetry={reqQ.reload} /> :
            !reqQ.data?.length ? <Empty art="gathering" title="새 요청이 없어요." action={<Button onClick={() => nav(paths.ownerSlots)}>빈자리 열기</Button>}>한산한 날짜를 먼저 열어두면 단체가 찾아와요.</Empty> : (
              <section className="req-tile-list">
                {reqQ.data.map((r) => (
                  <OwnerRequestCard key={r.request_id} id={r.request_id} headcount={r.headcount} desiredAt={r.desired_at} budget={r.budget_per_person}
                    eventType={r.event_type} note={r.note} mine={r.my_response} groupName={r.group_name} deadline={r.response_deadline}
                    canAccept={r.can_accept} remaining={r.remaining_capacity} />
                ))}
              </section>
            )}
        </>
      ) : (
        resQ.loading ? <Loading /> : resQ.error ? <ErrorBox message={resQ.error.message} onRetry={resQ.reload} /> :
          !resQ.data?.length ? <Empty title="예정된 예약이 없어요." /> : (
            <>
              <Section title="다가오는 예약">
                {resQ.data.filter((r) => ['awaiting_payment', 'confirmed'].includes(r.status)).map((r) => <ReservationCard key={r.id} r={r} role="owner" />)}
              </Section>
              <Section title="지난·취소된 예약">
                {resQ.data.filter((r) => !['awaiting_payment', 'confirmed'].includes(r.status)).reverse().map((r) => <ReservationCard key={r.id} r={r} role="owner" />)}
              </Section>
            </>
          )
      )}
    </Page>
  )
}
