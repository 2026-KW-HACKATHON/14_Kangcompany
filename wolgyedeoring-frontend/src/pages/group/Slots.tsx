// G-04 캘린더 (시안 17 · hub.js groupCalendar): 내 예약·요청 / 공개 빈자리를 날짜별로
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requests, reservations, slots } from '../../api'
import { paths } from '../../app/paths'
import { useGroupSession } from '../../app/session'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Calendar, monthOf, todayKst } from '../../components/Calendar'
import { RequestCard, ReservationCard, SlotCard } from '../../components/cards'
import { Icon } from '../../components/icons'
import { Button, ErrorBox, FilterRow, Loading } from '../../components/ui'
import { dayLabel, kstDay } from '../../lib/format'
import { STORE_CATEGORY_LABEL, effectiveRequestStatus } from '../../lib/status'
import type { SlotWithStore } from '../../api/slots'
import type { StoreCategory } from '../../types/db'

export default function Slots() {
  const { group } = useGroupSession()
  const nav = useNavigate()
  const [mode, setMode] = useState<'requests' | 'slots'>('slots')
  // 시안 17 업종 필터 (011 업종이 없는 가게는 음식점으로)
  const [kind, setKind] = useState<'all' | StoreCategory>('all')
  const [day, setDay] = useState(todayKst())
  const [month, setMonth] = useState(monthOf(todayKst()))
  const q = useAsync(async () => {
    const [open, reqs, res] = await Promise.all([slots.listOpenSlots({}), requests.listMyRequests(group.id), reservations.listMyReservations({ upcomingOnly: true })])
    return {
      open,
      reqs: reqs.filter((r) => effectiveRequestStatus(r) === 'open'),
      res: res.filter((r) => ['awaiting_payment', 'confirmed'].includes(r.status)),
    }
  }, [group.id])

  const byKind = (s: SlotWithStore) => kind === 'all' || (s.stores.category ?? 'restaurant') === kind
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    const add = (iso: string) => { const k = kstDay(iso); c[k] = (c[k] ?? 0) + 1 }
    if (q.data) {
      if (mode === 'slots') q.data.open.filter(byKind).forEach((s) => add(s.start_at))
      else { q.data.reqs.forEach((r) => add(r.desired_at)); q.data.res.forEach((r) => add(r.start_at)) }
    }
    return c
  }, [q.data, mode, kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const onMonth = (m: string) => {
    setMonth(m)
    const first = Object.keys(counts).filter((k) => k.startsWith(m)).sort()[0]
    setDay(first ?? `${m}-01`)
  }
  const d = q.data
  const daySlots = d ? d.open.filter((s) => kstDay(s.start_at) === day && byKind(s)) : []
  const dayReqs = d ? d.reqs.filter((r) => kstDay(r.desired_at) === day) : []
  const dayRes = d ? d.res.filter((r) => kstDay(r.start_at) === day) : []
  const n = mode === 'slots' ? daySlots.length : dayReqs.length + dayRes.length
  const canRequest = day >= todayKst()

  return (
    <Page title="캘린더" back={false} nav>
      <div className="section-heading"><h2>예약·공개 빈자리</h2><Button variant="text" onClick={() => nav(paths.groupLayouts())}>좌석 배치도</Button></div>
      <div className="calendar-tabs" role="group" aria-label="캘린더 내용">
        <button type="button" className="calendar-tab requests" aria-pressed={mode === 'requests'} onClick={() => setMode('requests')}>내 예약·요청</button>
        <button type="button" className="calendar-tab slots" aria-pressed={mode === 'slots'} onClick={() => setMode('slots')}>공개 빈자리</button>
      </div>
      {q.loading ? <Loading /> : q.error || !d ? <ErrorBox message={q.error?.message ?? ''} onRetry={q.reload} /> : (
        <section className="calendar-panel" data-calendar-mode={mode} aria-label={mode === 'slots' ? '공개 빈자리 캘린더와 날짜별 결과' : '예약 요청 캘린더와 날짜별 결과'}>
          <Calendar month={month} onMonth={onMonth} selected={[day]} onPick={setDay} counts={counts} legend={mode === 'slots' ? '공개된 빈자리' : '내 예약 · 요청'} />
          <div className="calendar-results" aria-live="polite">
            <div className="selected-day-heading">
              <div><h2>{dayLabel(day)}</h2><p className="meta">{mode === 'slots' ? '빈자리' : '예약·요청'} {n}건</p></div>
              <button type="button" className="date-quick date-quick-group" disabled={!canRequest} aria-label={`${dayLabel(day)} 예약 요청`}
                onClick={() => nav(paths.groupRequestNew, { state: { day } })}><Icon name="plus" /><span>예약 요청</span></button>
            </div>
            {mode === 'slots' && (
              <FilterRow value={kind} onChange={setKind} options={[{ value: 'all', label: '전체' }, ...Object.entries(STORE_CATEGORY_LABEL).map(([value, label]) => ({ value: value as StoreCategory, label }))]} />
            )}
            {n === 0 ? (
              <div className="calendar-empty">
                <h3>{mode === 'slots' ? '공개된 빈자리가 없어요' : '이 날짜에는 내 예약이 없어요'}</h3>
                <p>원하는 조건으로 가게에 예약을 요청해 보세요.</p>
              </div>
            ) : mode === 'slots' ? daySlots.map((s) => <SlotCard key={s.id} s={s} />) : (
              <>{dayRes.map((r) => <ReservationCard key={r.id} r={r} role="group" />)}{dayReqs.map((r) => <RequestCard key={r.id} r={r} />)}</>
            )}
          </div>
        </section>
      )}
    </Page>
  )
}
