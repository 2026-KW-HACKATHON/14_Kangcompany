// 월 캘린더 (시안 experience.js calendarHTML). 단일 선택 · 여러 날짜 선택(빈자리 일괄 공개) 겸용
import { dayLabel } from '../lib/format'
import { Icon } from './icons'

const pad = (n: number) => String(n).padStart(2, '0')
export const monthOf = (day: string) => day.slice(0, 7)
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
/** 오늘 (KST) YYYY-MM-DD */
export function todayKst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export function Calendar({ month, onMonth, selected, onPick, counts = {}, legend, multi, minDay, label }: {
  month: string; onMonth: (m: string) => void
  selected: string[]; onPick: (day: string) => void
  counts?: Record<string, number>; legend?: string; multi?: boolean; minDay?: string; label?: string
}) {
  const [y, m] = month.split('-').map(Number)
  const offset = new Date(y, m - 1, 1).getDay()
  const last = new Date(y, m, 0).getDate()
  const at = (d: number) => `${month}-${pad(d)}`
  const sel = new Set(selected)
  return (
    <section className="calendar-card" aria-label={label ?? (multi ? '공개할 날짜 선택' : '날짜별 일정')}>
      <div className="calendar-heading">
        <button type="button" className="icon-btn" aria-label="이전 달" disabled={Boolean(multi && minDay && month <= monthOf(minDay))} onClick={() => onMonth(shiftMonth(month, -1))}><Icon name="back" /></button>
        <h2>{y}년 {m}월</h2>
        <button type="button" className="icon-btn" aria-label="다음 달" onClick={() => onMonth(shiftMonth(month, 1))}><Icon name="chevron" /></button>
      </div>
      <div className="calendar-week" aria-hidden="true">{[...'일월화수목금토'].map((t) => <span key={t}>{t}</span>)}</div>
      <div className="calendar-grid">
        {Array.from({ length: offset }, (_, i) => <span key={`e${i}`} aria-hidden="true" />)}
        {Array.from({ length: last }, (_, i) => {
          const d = i + 1, date = at(d), on = sel.has(date), count = counts[date] ?? 0
          const col = (offset + i) % 7
          const left = multi && on && d > 1 && col > 0 && sel.has(at(d - 1))
          const right = multi && on && d < last && col < 6 && sel.has(at(d + 1))
          const disabled = Boolean(minDay && date < minDay && multi)
          return (
            <button key={date} type="button" className={`calendar-day${left ? ' is-joined-left' : ''}${right ? ' is-joined-right' : ''}`}
              aria-label={`${dayLabel(date)}${count ? ` · ${count}건` : ''}`} aria-pressed={on} disabled={disabled} onClick={() => onPick(date)}>
              <span>{d}</span><i className={`calendar-dot${count ? ' visible' : ''}`} aria-hidden="true" />
            </button>
          )
        })}
      </div>
      <p className="calendar-legend">{multi ? '날짜를 여러 개 선택할 수 있어요.' : <><i /> {legend}</>}</p>
    </section>
  )
}
