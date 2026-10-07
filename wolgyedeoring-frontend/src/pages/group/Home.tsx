// G-01 단체 홈 (시안 6 · hub.js groupHub): 해야 할 일 배너 → 다가오는 모임(참석 응답) → 응답 대기 요청 → 날짜에 맞는 가게 찾기
import { useNavigate } from 'react-router-dom'
import { requests, reservations, rsvp } from '../../api'
import { paths } from '../../app/paths'
import { useGroupSession } from '../../app/session'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { RequestCard } from '../../components/cards'
import { Icon } from '../../components/icons'
import { Badge, Button, ErrorBox, Loading } from '../../components/ui'
import { RESERVATION_STATUS, effectiveRequestStatus, eventLabel } from '../../lib/status'
import { dateLabel, dateTimeLabel, formatWon, timeLabel } from '../../lib/format'

export default function GroupHome() {
  const { me, group } = useGroupSession()
  const nav = useNavigate()
  const q = useAsync(async () => {
    const [reqs, res] = await Promise.all([requests.listMyRequests(group.id), reservations.listMyReservations({ upcomingOnly: true })])
    const upcoming = res.filter((r) => r.status === 'awaiting_payment' || r.status === 'confirmed')
    const active = upcoming[0] ?? null
    let count: { yes: number; no: number; deadline: string | null; open: boolean } | null = null
    if (active) {
      const rv = await rsvp.getRsvpForReservation(active.id)
      const list = rv ? await rsvp.listRsvpResponses(rv.id) : []
      count = { yes: list.filter((x) => x.attending).length, no: list.filter((x) => !x.attending).length, deadline: rv?.deadline ?? null, open: Boolean(rv && !rv.is_closed) }
    }
    return { waiting: reqs.filter((r) => effectiveRequestStatus(r) === 'open'), upcoming, active, count }
  }, [group.id])

  const d = q.data
  const payment = d?.upcoming.find((r) => r.status === 'awaiting_payment')
  return (
    <Page title="월계더링" back={false} bell nav>
      {q.loading ? <Loading /> : q.error || !d ? <ErrorBox message={q.error?.message ?? ''} onRetry={q.reload} /> : (
        <>
          <p className="meta home-identity">{group.name} · {me.display_name}</p>

          {payment ? (
            <button type="button" className="attention-banner" onClick={() => nav(paths.groupReservation(payment.id))}>
              <span className="attention-kicker">{payment.deposit_amount === 0 ? '예약 확정이 남았어요' : '예약금 결제가 남았어요'}</span>
              <strong>{payment.stores.name}</strong>
              <span className="attention-bottom">{payment.deposit_amount === 0 ? '결제 없이 확정할 수 있어요' : `${formatWon(payment.deposit_amount)} · 결제 후 예약 확정`}<Icon name="chevron" /></span>
            </button>
          ) : d.waiting.length > 0 && (
            <button type="button" className="attention-banner" onClick={() => nav(paths.groupRequest(d.waiting[0].id))}>
              <span className="attention-kicker">가게의 응답을 기다려요</span>
              <strong>{dateLabel(d.waiting[0].desired_at)} · {d.waiting[0].headcount}명</strong>
              <span className="attention-bottom">요청 진행 확인<Icon name="chevron" /></span>
            </button>
          )}

          {d.active && d.count && (() => {
            const a = d.active, c = d.count
            const total = a.headcount
            const pending = Math.max(0, total - c.yes - c.no)
            const st = RESERVATION_STATUS[a.status]
            return (
              <section className="section">
                <div className="section-heading"><h2>다가오는 모임</h2><Button variant="text" onClick={() => nav(paths.groupReservations)}>전체 보기</Button></div>
                <div className="meeting-card">
                  <div className="row">
                    <Badge tone={st.tone}>{a.status === 'awaiting_payment' && a.deposit_amount === 0 ? '확정 대기' : st.label}</Badge>
                    <button type="button" className="icon-btn" aria-label="이 예약 상세 보기" onClick={() => nav(paths.groupReservation(a.id))}><Icon name="chevron" /></button>
                  </div>
                  <h3>{a.stores.name}</h3>
                  <p className="meeting-schedule">{dateLabel(a.start_at)} · {timeLabel(a.start_at)}</p>
                  <p className="meta">{eventLabel(a.event_type, a.requests?.note)} · {a.headcount}명 예정</p>
                  <div className="attendance-summary">
                    <div className="attendance-heading"><span>참석 응답</span><strong>{c.yes}<small> / {total}명</small></strong></div>
                    <div className="attendance-progress" role="progressbar" aria-label="참석 의사를 응답한 인원" aria-valuemin={0} aria-valuemax={total} aria-valuenow={c.yes}>
                      <span style={{ width: `${Math.min(100, (c.yes / Math.max(1, total)) * 100)}%` }} />
                    </div>
                    <p className="meta">미응답 {pending}명 · 불참 {c.no}명</p>
                    <div className="deadline">
                      <strong>{c.deadline ? (c.open ? '응답 받는 중' : '응답 마감됨') : '참석 조사를 만들어 보세요'}</strong>
                      {c.deadline && <span>{dateTimeLabel(c.deadline)}</span>}
                    </div>
                    {a.status === 'awaiting_payment' && a.deposit_amount > 0 && <p className="payment-deadline">예약금을 결제하면 확정돼요</p>}
                  </div>
                  <div className="meeting-actions">
                    <Button onClick={() => nav(paths.groupRsvpResponses(a.id))}>참석 현황</Button>
                    <Button onClick={() => nav(paths.groupRsvp(a.id))}>참석 링크</Button>
                  </div>
                  <Button variant="text" full className="preorder-link" onClick={() => nav(paths.groupPreorder(a.id))}>사전 주문 준비</Button>
                </div>
              </section>
            )
          })()}

          {d.waiting.length > 0 && (
            <section className="section">
              <div className="section-heading"><h2>응답을 기다리는 요청</h2><span className="meta">{d.waiting.length}건</span></div>
              {d.waiting.map((r) => <RequestCard key={r.id} r={r} />)}
            </section>
          )}

          {!d.upcoming.length && !d.waiting.length && (
            <section className="meeting-card">
              <h2>새 모임을 준비해 볼까요?</h2>
              <p className="subtitle">날짜·인원·예산을 정하면 가게가 응답해요.</p>
              <Button variant="primary" onClick={() => nav(paths.groupRequestNew)}>예약 요청하기</Button>
            </section>
          )}

          <div className="hub-shortcuts">
            <button type="button" className="hub-shortcut" onClick={() => nav(paths.groupSlots)}>
              <span><strong>날짜에 맞는 가게 찾기</strong><small>공개된 빈자리를 캘린더에서 확인해요</small></span><Icon name="chevron" />
            </button>
          </div>
        </>
      )}
    </Page>
  )
}
