// S-02 동네 요청 (시안 36) / S-04 예약 목록 (?view=reservations). 하단 가운데 "요청" 버튼으로 진입
import { useNavigate, useSearchParams } from 'react-router-dom'
import { requests, reservations } from '../../api'
import { paths } from '../../app/paths'
import { useOwnerSession } from '../../app/session'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { ReservationCard } from '../../components/cards'
import { Icon } from '../../components/icons'
import { Badge, Button, Countdown, Empty, ErrorBox, Intro, Loading, Section, Segmented } from '../../components/ui'
import { eventLabel, myResponseView, noteBody } from '../../lib/status'
import { dateLabel, formatWon, timeLabel } from '../../lib/format'

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
              <section>
                {reqQ.data.map((r) => {
                  const mine = myResponseView(r.my_response)
                  return (
                    <button key={r.request_id} type="button" className="offer-card request-card" onClick={() => nav(paths.ownerRequest(r.request_id))}>
                      <div className="row"><Badge tone={r.my_response ? mine.tone : 'neutral'}>{mine.label}</Badge><span className="meta">{r.group_name}</span></div>
                      <h3>{eventLabel(r.event_type, r.note)} · {r.headcount}명</h3>
                      <p className="slot-time">{dateLabel(r.desired_at)} · {timeLabel(r.desired_at)}</p>
                      <p>1인 {formatWon(r.budget_per_person)}</p>
                      {noteBody(r.note) && <p className="meta">{noteBody(r.note)}</p>}
                      <div className="btn-row"><Countdown until={r.response_deadline} />{!r.can_accept && <Badge tone="muted">자리 부족 (남은 {r.remaining_capacity}석)</Badge>}</div>
                      <span className="card-action">조건 확인 후 수락<Icon name="chevron" /></span>
                    </button>
                  )
                })}
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
