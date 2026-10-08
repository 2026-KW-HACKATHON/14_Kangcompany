// 시안 선택 방식 (docs/ui-handoff/full-ui app.js openPicker·openChoicePicker, booking-date.js,
// 승인 A2 drafts/draft-a/soft-booking-enhancements.js showDatePicker·showTimePicker)
// 날짜·시간: 버튼 → 바텀시트 휠, "이 날짜로 설정"을 눌러야 반영. 선택 상자: 버튼 아래 목록, 누르면 바로 반영
// 시트는 화면 틀(.app) 안에 그린다 (시안 .phone 안의 .overlay 와 같은 위치)
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { dayLabel, hmLabel } from '../lib/format'
import { todayKst } from './Calendar'
import { Icon } from './icons'

const ROW = 48 // tokens.css --picker-row-height
const pad = (n: number) => String(n).padStart(2, '0')
const range = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, i) => first + i)

type DateDraft = { year: number; month: number; day: number }
type TimeDraft = { period: number; hour: number; minute: number }

/** 시안 WOLGYE_DATE_POLICY.ranges: min 이전 날짜는 고를 수 없게 연·월·일 목록을 줄이고 draft 를 그 안으로 맞춘다 */
function dateRanges(draft: DateDraft, min: string): { draft: DateDraft; items: Record<keyof DateDraft, number[]> } {
  const [y, m, d] = min.split('-').map(Number)
  const end = Math.max(2100, y + 1)
  const year = Math.max(y, Math.min(end, draft.year))
  const firstMonth = year === y ? m : 1
  const month = Math.max(firstMonth, Math.min(12, draft.month))
  const firstDay = year === y && month === m ? d : 1
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.max(firstDay, Math.min(lastDay, draft.day))
  return { draft: { year, month, day }, items: { year: range(y, end), month: range(firstMonth, 12), day: range(firstDay, lastDay) } }
}

/** 화면 틀(.app) 안에 그리기. 틀을 못 찾으면 body */
function InApp({ anchor, children }: { anchor: HTMLElement | null; children: ReactNode }) {
  const host = anchor?.closest<HTMLElement>('.app') ?? document.body
  return createPortal(children, host)
}

/** Esc 로 닫기 + 닫으면 연 버튼으로 포커스 되돌리기 */
function useDismiss(open: boolean, onClose: () => void, trigger: HTMLElement | null) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close.current() } }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); trigger?.focus({ preventScroll: true }) }
  }, [open, trigger])
}

// ---------------------------------------------------------------------------
// 휠 한 줄 (스크롤로 고르거나 숫자를 눌러 고름)

function Wheel({ id, label, values, value, format, onPick, a2, columnRef }: {
  id: string; label: string; values: number[]; value: number; format: (v: number) => string
  onPick: (v: number) => void; a2?: boolean; columnRef: (el: HTMLDivElement | null) => void
}) {
  const el = useRef<HTMLDivElement | null>(null)
  const timer = useRef<number>(undefined)
  // 목록이 바뀌면(연·월에 따라 일 수가 바뀜) 선택한 값 위치로
  useLayoutEffect(() => {
    if (el.current) el.current.scrollTop = Math.max(0, values.indexOf(value)) * ROW
  }, [values.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const move = (v: number) => {
    window.clearTimeout(timer.current)
    if (el.current) el.current.scrollTop = values.indexOf(v) * ROW
    onPick(v)
  }
  return (
    <div className={a2 ? 'time-wheel-column' : 'wheel-column'} role="listbox" aria-label={label} tabIndex={0}
      aria-activedescendant={`${id}-${value}`}
      ref={(n) => { el.current = n; columnRef(n) }}
      onScroll={(e) => {
        const top = e.currentTarget.scrollTop
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => onPick(values[Math.max(0, Math.min(values.length - 1, Math.round(top / ROW)))]), 90)
      }}
      onKeyDown={(e) => {
        const i = values.indexOf(value)
        const next = e.key === 'ArrowDown' ? Math.min(values.length - 1, i + 1) : e.key === 'ArrowUp' ? Math.max(0, i - 1)
          : e.key === 'Home' ? 0 : e.key === 'End' ? values.length - 1 : null
        if (next === null) return
        e.preventDefault(); move(values[next])
      }}>
      {values.map((v) => (
        <button key={v} type="button" role="option" tabIndex={-1} id={`${id}-${v}`} aria-selected={v === value} onClick={() => move(v)}>{format(v)}</button>
      ))}
    </div>
  )
}

/** 휠 시트 틀. 일반 화면은 시안 .overlay .sheet, 승인 A2 화면은 .phone-overlay .sheet */
function WheelSheet({ title, confirmLabel, a2, anchor, onClose, onConfirm, preview, labels, children }: {
  title: string; confirmLabel: string; a2?: boolean; anchor: HTMLElement | null
  onClose: () => void; onConfirm: () => void; preview: ReactNode; labels: string[]; children: ReactNode
}) {
  useDismiss(true, onClose, anchor)
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => { first.current?.focus({ preventScroll: true }) }, [])
  const help = <>위아래로 움직이거나 숫자를 눌러 선택하세요.<br />키보드에서는 방향키로 바꿀 수 있어요.</>
  const close = <Icon name="close" />
  return (
    <InApp anchor={anchor}>
      {a2 ? (
        <div className="phone-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
          <section className="sheet">
            <div className="sheet-heading"><h2>{title}</h2><button ref={first} type="button" className="sheet-close" aria-label="닫기" onClick={onClose}>{close}</button></div>
            <div className="time-picker-content">
              <p className="time-picked-preview date-picked-preview">{preview}</p>
              <div className="time-wheel-labels" aria-hidden="true">{labels.map((l) => <span key={l}>{l}</span>)}</div>
              <div className="time-wheel">{children}</div>
              <p className="time-picker-help">{help}</p>
            </div>
            <button className="primary" type="button" onClick={onConfirm}>{confirmLabel}</button>
          </section>
        </div>
      ) : (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
          <section className="sheet">
            <div className="sheet-head"><h2>{title}</h2><button ref={first} type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>{close}</button></div>
            <div className="sheet-body">
              <p className="picked-preview">{preview}</p>
              <div className="wheel-labels" aria-hidden="true">{labels.map((l) => <span key={l}>{l}</span>)}</div>
              <div className="picker-wheel">{children}</div>
              <p className="meta">{help}</p>
            </div>
            <button className="primary" type="button" onClick={onConfirm}>{confirmLabel}</button>
          </section>
        </div>
      )}
    </InApp>
  )
}

/** 확인 직전, 스크롤이 멈추기 전(90ms 대기 중)의 위치까지 읽는다 (시안과 같은 처리) */
function readColumns<K extends string>(cols: Partial<Record<K, HTMLDivElement | null>>, items: Record<K, number[]>, draft: Record<K, number>) {
  const out = { ...draft }
  for (const k of Object.keys(items) as K[]) {
    const col = cols[k]
    if (col) out[k] = items[k][Math.max(0, Math.min(items[k].length - 1, Math.round(col.scrollTop / ROW)))]
  }
  return out
}

// ---------------------------------------------------------------------------
// 날짜

function DateSheet({ title, value, min, a2, anchor, onClose, onChange }: {
  title: string; value: string; min: string; a2?: boolean; anchor: HTMLElement | null; onClose: () => void; onChange: (day: string) => void
}) {
  const [y, m, d] = (value >= min ? value : min).split('-').map(Number)
  const [state, setState] = useState(() => dateRanges({ year: y, month: m, day: d }, min))
  const cols = useRef<Partial<Record<keyof DateDraft, HTMLDivElement | null>>>({})
  const pick = (k: keyof DateDraft) => (v: number) => setState((s) => dateRanges({ ...s.draft, [k]: v }, min))
  const { draft, items } = state
  const weekday = '일월화수목금토'[new Date(draft.year, draft.month - 1, draft.day).getDay()]
  const preview = a2
    ? <><span className="date-picked-year">{draft.year}년</span><span>{draft.month}월 {draft.day}일({weekday})</span></>
    : <><span className="year">{draft.year}년</span>{draft.month}월 {draft.day}일({weekday})</>
  const confirm = () => {
    const f = dateRanges(readColumns(cols.current, items, draft), min).draft
    onChange(`${f.year}-${pad(f.month)}-${pad(f.day)}`)
    onClose()
  }
  const keys: [keyof DateDraft, string][] = [['year', '연도'], ['month', '월'], ['day', '일']]
  return (
    <WheelSheet title={title} confirmLabel="이 날짜로 설정" a2={a2} anchor={anchor} onClose={onClose} onConfirm={confirm} preview={preview} labels={['연', '월', '일']}>
      {keys.map(([k, label]) => (
        <Wheel key={k} id={`date-${k}`} label={label} values={items[k]} value={draft[k]} a2={a2}
          format={(v) => (k === 'year' ? String(v) : pad(v))} onPick={pick(k)} columnRef={(n) => { cols.current[k] = n }} />
      ))}
    </WheelSheet>
  )
}

/** 날짜 고르기 버튼 (YYYY-MM-DD). className: 일반 'date-trigger', 승인 A2 'date-control date-picker-trigger' */
export function DatePicker({ value, onChange, title, min = todayKst(), a2, className = 'date-trigger', id }: {
  value: string; onChange: (day: string) => void; title: string; min?: string; a2?: boolean; className?: string; id?: string
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={btn} id={id} type="button" className={className} aria-haspopup="dialog" aria-expanded={open} aria-label={`${title}, ${dayLabel(value)}`} onClick={() => setOpen(true)}>
        <span>{dayLabel(value)}</span><Icon name="calendar" />
      </button>
      {open && <DateSheet title={title} value={value} min={min} a2={a2} anchor={btn.current} onClose={() => setOpen(false)} onChange={onChange} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// 시간

const TIME_ITEMS: Record<keyof TimeDraft, number[]> = { period: [0, 1], hour: range(1, 12), minute: range(0, 59) }

function TimeSheet({ title, value, a2, anchor, onClose, onChange }: {
  title: string; value: string; a2?: boolean; anchor: HTMLElement | null; onClose: () => void; onChange: (hm: string) => void
}) {
  const [h, min] = value.split(':').map(Number)
  const [draft, setDraft] = useState<TimeDraft>({ period: h < 12 ? 0 : 1, hour: h % 12 || 12, minute: min || 0 })
  const cols = useRef<Partial<Record<keyof TimeDraft, HTMLDivElement | null>>>({})
  const confirm = () => {
    const f = readColumns(cols.current, TIME_ITEMS, draft)
    onChange(`${pad((f.hour % 12) + (f.period ? 12 : 0))}:${pad(f.minute)}`)
    onClose()
  }
  const keys: [keyof TimeDraft, string][] = [['period', '오전 또는 오후'], ['hour', '시'], ['minute', '분']]
  return (
    <WheelSheet title={title} confirmLabel="이 시간으로 설정" a2={a2} anchor={anchor} onClose={onClose} onConfirm={confirm}
      preview={`${draft.period ? '오후' : '오전'} ${draft.hour}:${pad(draft.minute)}`} labels={['오전·오후', '시', '분']}>
      {keys.map(([k, label]) => (
        <Wheel key={k} id={`time-${k}`} label={label} values={TIME_ITEMS[k]} value={draft[k]} a2={a2}
          format={(v) => (k === 'period' ? ['오전', '오후'][v] : pad(v))}
          onPick={(v) => setDraft((s) => ({ ...s, [k]: v }))} columnRef={(n) => { cols.current[k] = n }} />
      ))}
    </WheelSheet>
  )
}

/** 시간 고르기 버튼 (HH:MM). className: 일반 'date-trigger', 승인 A2 'date-control time-picker-trigger' */
export function TimePicker({ value, onChange, title, a2, className = 'date-trigger', id }: {
  value: string; onChange: (hm: string) => void; title: string; a2?: boolean; className?: string; id?: string
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={btn} id={id} type="button" className={className} aria-haspopup="dialog" aria-expanded={open} aria-label={`${title}, ${hmLabel(value)}`} onClick={() => setOpen(true)}>
        <span>{hmLabel(value)}</span><Icon name="clock" />
      </button>
      {open && <TimeSheet title={title} value={value} a2={a2} anchor={btn.current} onClose={() => setOpen(false)} onChange={onChange} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// 선택 상자 (시안 selectField + openChoicePicker)

function ChoiceMenu<T extends string>({ title, value, options, anchor, onClose, onChange }: {
  title: string; value: T; options: { value: T; label: string }[]; anchor: HTMLElement; onClose: () => void; onChange: (v: T) => void
}) {
  useDismiss(true, onClose, anchor)
  const overlay = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLElement>(null)
  const rows = useRef<(HTMLButtonElement | null)[]>([])
  const [focus, setFocus] = useState(Math.max(0, options.findIndex((o) => o.value === value)))

  // 버튼 바로 아래(공간이 모자라면 위)에 버튼 폭으로 띄운다
  useLayoutEffect(() => {
    const place = () => {
      const o = overlay.current, s = sheet.current
      if (!o || !s) return
      const bounds = o.getBoundingClientRect(), a = anchor.getBoundingClientRect(), inset = 16, gap = 8
      const width = Math.min(a.width, bounds.width - inset * 2)
      s.style.width = `${width}px`
      s.style.left = `${Math.max(inset, Math.min(a.left - bounds.left, bounds.width - width - inset))}px`
      s.style.maxHeight = `${bounds.height - inset * 2}px`
      const natural = s.scrollHeight, below = bounds.bottom - a.bottom - gap - inset, above = a.top - bounds.top - gap - inset
      const down = below >= natural || below >= above
      s.style.maxHeight = `${Math.min(bounds.height - inset * 2, Math.max(48, down ? below : above))}px`
      const height = s.getBoundingClientRect().height
      s.style.top = `${Math.max(inset, Math.min(down ? a.bottom - bounds.top + gap : a.top - bounds.top - gap - height, bounds.height - height - inset))}px`
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor])
  useEffect(() => { rows.current[focus]?.focus({ preventScroll: true }) }, [focus])

  return (
    <InApp anchor={anchor}>
      <div ref={overlay} className="overlay choice-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <section ref={sheet} className="sheet selection-popover">
          <div className="sheet-head"><h2>{title}</h2></div>
          <div className="sheet-body">
            <div className="selection-list" role="radiogroup" aria-label={title}>
              {options.map((o, i) => (
                <button key={o.value} ref={(n) => { rows.current[i] = n }} type="button" className="selection-row" role="radio"
                  aria-checked={o.value === value} tabIndex={i === focus ? 0 : -1}
                  onClick={() => { onChange(o.value); onClose() }}
                  onKeyDown={(e) => {
                    const n = options.length
                    const next = ['ArrowDown', 'ArrowRight'].includes(e.key) ? (i + 1) % n : ['ArrowUp', 'ArrowLeft'].includes(e.key) ? (i - 1 + n) % n
                      : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null
                    if (next === null) return
                    e.preventDefault(); setFocus(next)
                  }}>
                  <span className="selection-copy"><strong>{o.label}</strong></span>
                  <span className="selection-check"><Icon name="check" /></span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </InApp>
  )
}

/** 선택 상자: 누르면 버튼 아래에 목록이 펼쳐지고, 고르면 바로 반영 */
export function Select<T extends string>({ value, options, onChange, title, id, disabled }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; title: string; id?: string; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const label = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? ''
  return (
    <>
      <button ref={btn} id={id} type="button" className="select-trigger" disabled={disabled} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`${title}, ${label}`} onClick={(e) => { e.preventDefault(); setOpen(true) }}>
        <span>{label}</span><Icon name="chevron" />
      </button>
      {open && btn.current && <ChoiceMenu title={title} value={value} options={options} anchor={btn.current} onClose={() => setOpen(false)} onChange={onChange} />}
    </>
  )
}
