// S-06 빈자리 관리 (시안 23): 여러 날짜 × 여러 시간대를 한 번에 공개 + 공개한 일정 목록(닫기/다시 공개)
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { slots, stats } from '../../api'
import { useOwnerSession } from '../../app/session'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Calendar, monthOf, todayKst } from '../../components/Calendar'
import { Icon } from '../../components/icons'
import { TimePicker } from '../../components/pickers'
import { Badge, Button, Check, Dock, Empty, ErrorBox, Field, Input, Intro, Loading, Section } from '../../components/ui'
import { dayLabel, formatWon, kstDay, timeLabel } from '../../lib/format'
import { slotView } from '../../lib/status'

type Range = { start: string; end: string }
type Cond = { capacity: string; deposit: string }
export default function OwnerSlots() {
  const { store } = useOwnerSession()
  const initialDay = (useLocation().state as { day?: string } | null)?.day
  const today = todayKst()
  const [dates, setDates] = useState<string[]>(initialDay && initialDay >= today ? [initialDay] : [])
  const [month, setMonth] = useState(monthOf(initialDay && initialDay >= today ? initialDay : today))
  const [ranges, setRanges] = useState<Range[]>([{ start: '18:00', end: '20:00' }])
  const [capacity, setCapacity] = useState(String(store.max_capacity))
  const [deposit, setDeposit] = useState('0')
  const [done, setDone] = useState<string | null>(null)
  // 시안 23 날짜별 조건: 켠 날짜만 공통 조건 대신 따로 (빈자리는 날짜·시간대마다 하나씩 저장되므로 그대로 넣으면 됨)
  const [individual, setIndividual] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, Cond>>({})
  const q = useAsync(async () => {
    const [list, st] = await Promise.all([slots.listMySlots(store.id), stats.getStoreStats(store.id).catch(() => null)])
    return { list, st }
  }, [store.id])
  const act = useAction()
  const toggle = (d: string) => { setDone(null); setDates((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort())) }
  const condFor = (d: string): Cond => (individual && overrides[d]) || { capacity, deposit }
  const condOk = (c: Cond) => { const n = Number(c.capacity); return Number.isInteger(n) && n > 0 && n <= store.max_capacity && c.deposit !== '' && Number(c.deposit) >= 0 }
  const rangesOk = ranges.every((r) => r.start < r.end || r.end === '00:00')
  const valid = dates.length > 0 && rangesOk && condOk({ capacity, deposit }) && dates.every((d) => condOk(condFor(d)))
  const count = dates.length * ranges.length

  const publish = () => act.run(async () => {
    for (const d of dates) for (const r of ranges) {
      const c = condFor(d)
      const start = new Date(`${d}T${r.start}:00+09:00`)
      let end = new Date(`${d}T${r.end}:00+09:00`)
      if (end <= start) end = new Date(end.getTime() + 864e5) // 자정 넘김
      await slots.openSlot({ store_id: store.id, start_at: start.toISOString(), end_at: end.toISOString(), capacity: Number(c.capacity), deposit_amount: Number(c.deposit) })
    }
    setDone(`${count}개 빈자리를 공개했어요.`)
    setDates([]); setOverrides({})
    await q.reload()
  })
  const quiet = q.data?.st?.by_weekday?.slice().sort((a, b) => a.reservations - b.reservations).slice(0, 2).map((d) => d.label).join('·')
  const upcoming = (q.data?.list ?? []).filter((s) => new Date(s.end_at) > new Date())

  return (
    <Page title="빈자리 관리"
      dock={<Dock meta={done ?? undefined}>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" busy={act.busy} disabled={!valid} onClick={() => void publish()}>{count ? `${count}개 빈자리 공개` : '날짜를 골라 주세요'}</Button></Dock>}>
      <Intro title="여러 빈자리를 한 번에 열어요." sub={`날짜와 시간을 고르고, 공통 조건을 한 번만 입력하세요.${quiet ? ` 최근 예약이 적은 요일: ${quiet}` : ''}`} />
      <Section title="공개할 날짜">
        <Calendar multi month={month} onMonth={setMonth} selected={dates} onPick={toggle} minDay={today} />
        <p className="meta">{dates.length}개 날짜 선택</p>
        <div className="selected-dates">
          {dates.map((d) => <button key={d} type="button" className="date-chip" aria-label={`${dayLabel(d)} 선택 해제`} onClick={() => toggle(d)}>{dayLabel(d)}<Icon name="close" /></button>)}
        </div>
      </Section>
      <Section title="시간대" action={<Button variant="text" onClick={() => setRanges([...ranges, { start: '20:00', end: '22:00' }])}>시간 추가</Button>}>
        {ranges.map((r, i) => (
          <div key={i} className="time-range">
            {(['start', 'end'] as const).map((k) => (
              <div key={k} className="field">
                <span className="field-label">{k === 'start' ? '시작 시간' : '종료 시간'}</span>
                <TimePicker title={k === 'start' ? '시작 시간' : '종료 시간'} value={r[k]}
                  onChange={(hm) => setRanges(ranges.map((x, j) => (j === i ? { ...x, [k]: hm } : x)))} />
              </div>
            ))}
            {ranges.length > 1 && <button type="button" className="icon-btn" aria-label={`${i + 1}번째 시간대 삭제`} onClick={() => setRanges(ranges.filter((_, j) => j !== i))}><Icon name="close" /></button>}
          </div>
        ))}
        {!rangesOk && <p className="note-error">종료 시간이 시작 시간보다 늦어야 해요.</p>}
      </Section>
      <Section title="공통 조건">
        <div className="condition-grid">
          <Field label="최대 인원"><Input type="number" inputMode="numeric" min={1} max={store.max_capacity} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
          <Field label="예약금 (원)"><Input type="number" inputMode="numeric" min={0} step={1000} value={deposit} onChange={(e) => setDeposit(e.target.value)} /></Field>
        </div>
        <p className="meta">최대 인원은 가게 최대 {store.max_capacity}명까지 정할 수 있어요.</p>
      </Section>
      <Section title="날짜별 조건" action={<Button variant="text" aria-expanded={individual} onClick={() => setIndividual(!individual)}>{individual ? '접기' : '각각 설정'}</Button>}>
        <p className="meta">기본은 공통 조건이에요. 필요한 날짜만 바꿀 수 있어요.</p>
        {individual && (dates.length ? dates.map((d) => {
          const o = overrides[d]
          const c = condFor(d)
          const set = (patch: Partial<Cond>) => setOverrides({ ...overrides, [d]: { ...c, ...patch } })
          return (
            <div key={d} className={`date-condition card${o ? ' is-custom' : ''}`}>
              <h3>{dayLabel(d)}</h3>
              <Check label="이 날짜만 다른 조건 사용" checked={Boolean(o)}
                onChange={(on) => { const next = { ...overrides }; if (on) next[d] = { capacity, deposit }; else delete next[d]; setOverrides(next) }} />
              {o && (
                <div className="condition-grid date-condition-fields">
                  <Field label="최대 인원" error={condOk(o) ? null : `1~${store.max_capacity}명`}><Input type="number" inputMode="numeric" min={1} max={store.max_capacity} value={o.capacity} onChange={(e) => set({ capacity: e.target.value })} /></Field>
                  <Field label="예약금 (원)"><Input type="number" inputMode="numeric" min={0} step={1000} value={o.deposit} onChange={(e) => set({ deposit: e.target.value })} /></Field>
                </div>
              )}
            </div>
          )
        }) : <p className="meta">먼저 공개할 날짜를 골라 주세요.</p>)}
      </Section>
      <p className="meta">{dates.length}개 날짜 × {ranges.length}개 시간대 · 선택한 날짜마다 시간대가 동일하게 적용돼요.</p>

      <Section title="공개한 일정">
        {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error.message} onRetry={q.reload} /> : !upcoming.length ? <Empty art="calendar">아직 공개한 빈자리가 없어요. 여러 일정을 한 번에 열어 보세요.</Empty> : upcoming.map((s) => {
          const v = slotView(s.status, 'owner')
          return (
            <div key={s.id} className="card available-card">
              <div className="row"><Badge tone={v.tone}>{v.label === '열림' ? '공개 중' : v.label}</Badge><span className="meta">{dayLabel(kstDay(s.start_at))}</span></div>
              <h3>{timeLabel(s.start_at)} – {timeLabel(s.end_at)}</h3>
              <p>최대 {s.capacity}명</p>
              <p className="meta">예약금 {s.deposit_amount > 0 ? formatWon(s.deposit_amount) : '없음'}</p>
              {s.status !== 'booked' && (
                <div className="slot-actions">
                  <Button variant={s.status === 'open' ? 'danger' : 'text'} busy={act.busy} onClick={() => void act.run(async () => { await slots.setSlotClosed(s.id, s.status === 'open'); await q.reload() })}>{s.status === 'open' ? '공개 닫기' : '다시 공개'}</Button>
                </div>
              )}
            </div>
          )
        })}
      </Section>
    </Page>
  )
}
