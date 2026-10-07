// S-01 사장님 홈 (시안 21 · hub.js merchantHub): 할 일 → 다가오는 단체 예약 → 가게 캘린더(동네 요청 / 공개한 빈자리) → 가게 운영
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { menus, receipts, requests, reservations, slots } from '../../api'
import { paths } from '../../app/paths'
import { useOwnerSession } from '../../app/session'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Calendar, monthOf, todayKst } from '../../components/Calendar'
import { OwnerRequestCard, ReservationCard } from '../../components/cards'
import { Icon } from '../../components/icons'
import { Badge, Button, ErrorBox, LinkRow, Loading } from '../../components/ui'
import { dayLabel, formatWon, kstDay, timeLabel } from '../../lib/format'
import { slotView } from '../../lib/status'

export default function OwnerHome() {
  const { me, store } = useOwnerSession()
  const nav = useNavigate()
  const [mode, setMode] = useState<'requests' | 'slots'>('requests')
  const [day, setDay] = useState(todayKst())
  const [month, setMonth] = useState(monthOf(todayKst()))
  const act = useAction()
  const q = useAsync(async () => {
    const [reqs, res, rcs, ms, mySlots] = await Promise.all([
      requests.listOpenRequestsForStore(store.id), reservations.listMyReservations(),
      receipts.listReceiptsNeedingReview(), menus.listMenus(store.id), slots.listMySlots(store.id),
    ])
    const now = Date.now()
    return {
      reqs: reqs.filter((r) => r.my_response !== 'declined'),
      upcoming: res.filter((r) => ['awaiting_payment', 'confirmed'].includes(r.status) && new Date(r.start_at).getTime() >= now - 3 * 3600e3),
      needFinish: res.filter((r) => r.status === 'confirmed' && new Date(r.start_at).getTime() < now),
      rcs, noMenu: ms.length === 0, mySlots,
    }
  }, [store.id])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    const add = (iso: string) => { const k = kstDay(iso); c[k] = (c[k] ?? 0) + 1 }
    if (q.data) {
      if (mode === 'slots') q.data.mySlots.forEach((s) => add(s.start_at))
      else { q.data.reqs.forEach((r) => add(r.desired_at)); q.data.upcoming.forEach((r) => add(r.start_at)) }
    }
    return c
  }, [q.data, mode])
  const onMonth = (m: string) => { setMonth(m); setDay(Object.keys(counts).filter((k) => k.startsWith(m)).sort()[0] ?? `${m}-01`) }

  const d = q.data
  const dayReqs = d ? d.reqs.filter((r) => kstDay(r.desired_at) === day) : []
  const dayRes = d ? d.upcoming.filter((r) => kstDay(r.start_at) === day) : []
  const daySlots = d ? d.mySlots.filter((s) => kstDay(s.start_at) === day) : []
  const n = mode === 'slots' ? daySlots.length : dayReqs.length + dayRes.length
  const canOpen = day >= todayKst()

  return (
    <Page title={store.name} back={false} bell nav>
      {q.loading ? <Loading /> : q.error || !d ? <ErrorBox message={q.error?.message ?? ''} onRetry={q.reload} /> : (
        <>
          <p className="meta home-identity">{me.display_name.includes(store.name) ? me.display_name : `${store.name} · ${me.display_name.endsWith('사장님') ? me.display_name : `${me.display_name} 사장님`}`}</p>

          {d.needFinish.length > 0 ? (
            <button type="button" className="attention-banner" onClick={() => nav(paths.ownerReservation(d.needFinish[0].id))}>
              <span className="attention-kicker">완료 처리가 필요해요</span>
              <strong>{d.needFinish[0].groups.name}</strong>
              <span className="attention-bottom">행사가 끝났다면 완료 처리 후 영수증을 올려 주세요<Icon name="chevron" /></span>
            </button>
          ) : d.reqs.some((r) => !r.my_response) && (
            <button type="button" className="attention-banner" onClick={() => nav(paths.ownerInbox)}>
              <span className="attention-kicker">새 요청 {d.reqs.filter((r) => !r.my_response).length}건</span>
              <strong>{d.reqs[0].headcount}명이 모일 자리를 찾고 있어요</strong>
              <span className="attention-bottom">{dayLabel(kstDay(d.reqs[0].desired_at))} · {timeLabel(d.reqs[0].desired_at)} · 1인 {formatWon(d.reqs[0].budget_per_person)}<Icon name="chevron" /></span>
            </button>
          )}

          {d.upcoming.length > 0 && (
            <section className="section owner-reservations">
              <h2>다가오는 단체 예약</h2>
              {d.upcoming.slice(0, 3).map((r) => <ReservationCard key={r.id} r={r} role="owner" />)}
              {d.upcoming.length > 3 && <Button variant="text" full onClick={() => nav(paths.ownerInboxReservations)}>예약 {d.upcoming.length}건 모두 보기</Button>}
            </section>
          )}

          <section className="section">
            <div className="section-heading"><h2>가게 캘린더</h2><Button variant="text" onClick={() => nav(paths.ownerSlots, { state: { day: canOpen ? day : todayKst() } })}>빈자리 열기</Button></div>
            <div className="calendar-tabs" role="group" aria-label="캘린더 내용">
              <button type="button" className="calendar-tab requests" aria-pressed={mode === 'requests'} onClick={() => setMode('requests')}>동네 요청</button>
              <button type="button" className="calendar-tab slots" aria-pressed={mode === 'slots'} onClick={() => setMode('slots')}>공개 빈자리</button>
            </div>
            <section className="calendar-panel" data-calendar-mode={mode}>
              <Calendar month={month} onMonth={onMonth} selected={[day]} onPick={setDay} counts={counts} legend={mode === 'slots' ? '공개한 빈자리' : '동네 요청 · 수락한 일정'} />
              <div className="calendar-results" aria-live="polite">
                <div className="selected-day-heading">
                  <div><h2>{dayLabel(day)}</h2><p className="meta">{mode === 'slots' ? '빈자리' : '요청·예약'} {n}건</p></div>
                  <button type="button" className="date-quick date-quick-owner" disabled={!canOpen} aria-label={`${dayLabel(day)} 빈자리 등록`}
                    onClick={() => nav(paths.ownerSlots, { state: { day } })}><Icon name="plus" /><span>빈자리 열기</span></button>
                </div>
                {n === 0 ? (
                  <div className="calendar-empty">
                    <h3>{mode === 'slots' ? '공개한 빈자리가 없어요' : '이 날짜에는 동네 요청이 없어요'}</h3>
                    <p>가게에 여유가 있다면 빈자리를 열어 보세요.</p>
                  </div>
                ) : mode === 'slots' ? daySlots.map((s) => {
                  const v = slotView(s.status, 'owner')
                  return (
                    <div key={s.id} className="card available-card">
                      <div className="row"><Badge tone={v.tone}>{v.label === '열림' ? '공개 중' : v.label}</Badge><span className="meta">{dayLabel(kstDay(s.start_at))}</span></div>
                      <h3>{timeLabel(s.start_at)} – {timeLabel(s.end_at)}</h3>
                      <p>최대 {s.capacity}명</p>
                      <p className="meta">예약금 {s.deposit_amount > 0 ? formatWon(s.deposit_amount) : '없음'}</p>
                      {s.status !== 'booked' && new Date(s.start_at) > new Date() && (
                        <div className="slot-actions">
                          <Button variant={s.status === 'open' ? 'danger' : 'text'} busy={act.busy} onClick={() => void act.run(async () => { await slots.setSlotClosed(s.id, s.status === 'open'); await q.reload() })}>{s.status === 'open' ? '공개 닫기' : '다시 공개'}</Button>
                        </div>
                      )}
                    </div>
                  )
                }) : (
                  <>
                    {dayReqs.map((r) => <OwnerRequestCard key={r.request_id} id={r.request_id} headcount={r.headcount} desiredAt={r.desired_at} budget={r.budget_per_person} eventType={r.event_type} note={r.note} mine={r.my_response} groupName={r.group_name} deadline={r.response_deadline} canAccept={r.can_accept} remaining={r.remaining_capacity} />)}
                    {dayRes.length > 0 && <section className="section"><h2>수락한 일정</h2>{dayRes.map((r) => <ReservationCard key={r.id} r={r} role="owner" />)}</section>}
                  </>
                )}
              </div>
            </section>
          </section>

          <section className="section">
            <h2>가게 운영</h2>
            <div className="link-list">
              <LinkRow title="좌석 배치도 관리" sub="가게의 테이블과 시설 배치를 게시해요" art="store" onClick={() => nav(paths.ownerLayout)} />
              <LinkRow title={d.noMenu ? '메뉴 등록하기' : '메뉴와 준비 수량 확인'} sub={d.noMenu ? '메뉴판 사진 한 장이면 메뉴가 등록돼요' : '단체 손님의 사전 주문을 준비해요'} art="food" onClick={() => nav(paths.ownerMenus)} />
              <LinkRow title={d.rcs.length ? `영수증 확인 필요 ${d.rcs.length}건` : '영수증 기록'} sub="확인한 기록만 분석에 반영돼요" art="receipt"
                onClick={() => nav(d.rcs.length ? paths.ownerReceipt(d.rcs[0].id) : paths.ownerInboxReservations)} />
              <LinkRow title="빈 날짜 관리" sub="한산한 시간에 단체 손님을 만나세요" art="calendar" onClick={() => nav(paths.ownerSlots)} />
            </div>
          </section>
        </>
      )}
    </Page>
  )
}
