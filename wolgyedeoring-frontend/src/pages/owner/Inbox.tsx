// S-02 받은 요청 / S-04 예약 목록 (상단 세그먼트). 빈 날짜 관리 S-06 진입도 여기
import { useNavigate, useSearchParams } from 'react-router-dom'
import { requests, reservations } from '../../api'
import { paths } from '../../app/paths'
import { useOwnerSession } from '../../app/session'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { ReservationCard } from '../../components/cards'
import { Badge, Button, Card, Countdown, Empty, ErrorBox, Loading, Section, Segmented } from '../../components/ui'
import { EVENT_LABEL, GROUP_TYPE_LABEL, myResponseView } from '../../lib/status'
import { formatDateTime, formatWon } from '../../lib/format'

export default function OwnerInbox() {
  const { store } = useOwnerSession()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'reservations' ? 'reservations' : 'requests'
  const reqQ = useAsync(() => (view === 'requests' ? requests.listOpenRequestsForStore(store.id) : Promise.resolve([])), [view, store.id])
  const resQ = useAsync(() => (view === 'reservations' ? reservations.listMyReservations() : Promise.resolve([])), [view])

  return (
    <Page title="요청·예약" tabRoot actions={<Button variant="text" onClick={() => nav(paths.ownerSlots)}>빈 날짜</Button>}>
      <Segmented value={view} onChange={(v) => setParams(v === 'requests' ? {} : { view: v })}
        options={[{ value: 'requests', label: '받은 요청' }, { value: 'reservations', label: '예약' }]} />
      {view === 'requests' ? (
        reqQ.loading ? <Loading /> : reqQ.error ? <ErrorBox message={reqQ.error.message} onRetry={reqQ.reload} /> :
          !reqQ.data?.length ? <Empty>새 요청이 없어요. 한산한 날짜를 먼저 열어두면 단체가 찾아와요.</Empty> : (
            <ul className="list">
              {reqQ.data.map((r) => {
                const mine = myResponseView(r.my_response)
                return (
                  <Card as="li" key={r.request_id} onClick={() => nav(paths.ownerRequest(r.request_id))}>
                    <div className="card-top"><span className="strong">{r.group_name} · {GROUP_TYPE_LABEL[r.group_type]}</span><Badge tone={mine.tone}>{mine.label}</Badge></div>
                    <p>{EVENT_LABEL[r.event_type]} · {formatDateTime(r.desired_at)} · {r.headcount}명 · 1인 {formatWon(r.budget_per_person)}</p>
                    <div className="btn-row"><Countdown until={r.response_deadline} />{!r.can_accept && <Badge tone="muted">자리 부족 (남은 {r.remaining_capacity}석)</Badge>}</div>
                  </Card>
                )
              })}
            </ul>
          )
      ) : (
        resQ.loading ? <Loading /> : resQ.error ? <ErrorBox message={resQ.error.message} onRetry={resQ.reload} /> :
          !resQ.data?.length ? <Empty>예정된 예약이 없어요</Empty> : (
            <>
              <Section title="다가오는 예약">
                <ul className="list">{resQ.data.filter((r) => ['awaiting_payment', 'confirmed'].includes(r.status)).map((r) => <ReservationCard key={r.id} r={r} role="owner" />)}</ul>
              </Section>
              <Section title="지난·취소된 예약">
                <ul className="list">{resQ.data.filter((r) => !['awaiting_payment', 'confirmed'].includes(r.status)).reverse().map((r) => <ReservationCard key={r.id} r={r} role="owner" />)}</ul>
              </Section>
            </>
          )
      )}
    </Page>
  )
}
