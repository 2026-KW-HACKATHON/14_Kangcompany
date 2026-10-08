// 공통 부품 — 시안(docs/ui-handoff/full-ui) 의 클래스·마크업을 그대로 쓴다 (스타일: styles/proto/*.css)
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import type { Tone } from '../lib/status'
import { timeLeft } from '../lib/format'
import { deadlineTone } from '../lib/status'
import { Art, Icon, type ArtName, type IconName } from './icons'

export function Loading({ label = '잠시만 기다려 주세요.' }: { label?: string }) {
  return (
    <div role="status" aria-label="불러오는 중">
      <div className="skeleton short" /><div className="skeleton" /><div className="skeleton" />
      <p className="meta">{label}</p>
    </div>
  )
}

export function ErrorBox({ message, onRetry, title = '내용을 불러오지 못했어요.' }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <div className="empty-state" role="alert">
      <Art name="receipt" />
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && <Button onClick={onRetry}>다시 시도</Button>}
    </div>
  )
}

export function Empty({ children, action, art = 'calendar', title }: { children?: ReactNode; action?: ReactNode; art?: ArtName; title?: string }) {
  return (
    <div className="empty-state">
      <Art name={art} />
      {title && <h2>{title}</h2>}
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

const TONE_CLASS: Record<Tone, string> = { neutral: '', warning: 'warning', success: 'success', danger: 'danger', muted: 'muted' }
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${TONE_CLASS[tone]}`.trim()}>{children}</span>
}

type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger' | 'option' | 'plain'
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'primary', secondary: 'secondary', text: 'text-btn', danger: 'text-btn danger', option: 'option', plain: '',
}
export function Button({ variant = 'secondary', busy, children, disabled, className, full, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; busy?: boolean; full?: boolean }) {
  const cls = [VARIANT_CLASS[variant], full ? 'full-link' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls || undefined} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? '처리 중' : children}
    </button>
  )
}

/** 화면 아래 고정 영역 (시안 .dock). Primary 는 화면당 1개 */
export function Dock({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <footer className="dock">
      {meta && <p className="meta">{meta}</p>}
      {children}
    </footer>
  )
}
/** 이전 이름 호환 */
export const BottomAction = ({ children, hint }: { children: ReactNode; hint?: string | null }) => <Dock meta={hint ?? undefined}>{children}</Dock>

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="meta">{hint}</span>}
      {error && <span className="note-error">{error}</span>}
    </label>
  )
}

// 시안 CSS 는 :invalid:not(:placeholder-shown) 에 빨간 테두리 → 빈 칸이 처음부터 빨갛지 않도록 빈 placeholder 를 둔다
export function Input({ placeholder = ' ', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input placeholder={placeholder} {...props} />
}
export function Textarea({ placeholder = ' ', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea placeholder={placeholder} {...props} />
}

/** 선택 상자 (시안 selectField: 버튼 아래 목록) */
export { Select } from './pickers'

export function Check({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="choice">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function Card({ children, onClick, variant, className }: { children: ReactNode; onClick?: () => void; variant?: 'white' | 'brand-soft'; className?: string }) {
  const cls = ['card', variant, className].filter(Boolean).join(' ')
  if (onClick) return <button type="button" className={`offer-card ${className ?? ''}`.trim()} onClick={onClick}>{children}</button>
  return <section className={cls}>{children}</section>
}

export function Section({ title, children, action }: { title?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="section">
      {action ? <div className="section-heading">{title && <h2>{title}</h2>}{action}</div> : title && <h2>{title}</h2>}
      {children}
    </section>
  )
}

/** 큰 제목 + 보조 문구 (시안 <section><h2>…</h2><p class="subtitle">) */
export function Intro({ title, sub, art }: { title: ReactNode; sub?: ReactNode; art?: ArtName }) {
  const inner = <><h2>{title}</h2>{sub && <p className="subtitle">{sub}</p>}</>
  return art ? <div className="hero-row"><div>{inner}</div><Art name={art} /></div> : <section>{inner}</section>
}

/** 라벨: 값 목록 (시안 dl.facts) */
export function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="facts">
      {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  )
}

/** 한 줄 라벨·값 (시안 .row) */
export function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return <div className="row"><span className="meta">{label}</span><strong>{value}</strong></div>
}

export function Metric({ label, value, unit }: { label: string; value: ReactNode; unit: string }) {
  const u = unit.replace(/\s+/g, '')
  return (
    <div className={`metric${u.length > 1 ? ' metric-unit-wide' : ''}`}>
      <span className="meta">{label}</span>
      <div className="metric-value"><strong>{value}</strong><small>{u}</small></div>
    </div>
  )
}
export function Metrics({ children, three, className }: { children: ReactNode; three?: boolean; className?: string }) {
  return <div className={['metrics', three && 'three', className].filter(Boolean).join(' ')}>{children}</div>
}

export function Notice({ children, tone, icon = 'info' }: { children: ReactNode; tone?: 'warning' | 'danger'; icon?: IconName }) {
  return <div className={`notice ${tone ?? ''}`.trim()}><Icon name={icon} /><span>{children}</span></div>
}

/** 목록 링크 행 (시안 linkRow) */
export function LinkRow({ title, sub, art, onClick }: { title: string; sub?: string; art: ArtName; onClick: () => void }) {
  return (
    <button type="button" className="list-link" onClick={onClick}>
      <Art name={art} />
      <div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
      <Icon name="chevron" />
    </button>
  )
}

/** 응답 기한 카운트다운 (3시간 이하 warning) */
export function Countdown({ until, prefix = '응답 기한' }: { until: string; prefix?: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const left = timeLeft(until, now)
  return <Badge tone={deadlineTone(left?.hours ?? null)}>{left ? `${prefix} ${left.text} 남음` : `${prefix} 지남`}</Badge>
}

/** 세그먼트 (시안 .segmented) */
export function Segmented<T extends string>({ value, options, onChange, label = '목록 전환', className }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string; className?: string
}) {
  return (
    <div className={`segmented ${className ?? ''}`.trim()} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

/** 필터 칩 (시안 .filter-row) */
export function FilterRow<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="filter-row" role="group" aria-label="목록 필터">
      {options.map((o) => <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  )
}

/** 선택 버튼 두 개 이상 (시안 .option-grid .option) */
export function OptionGrid<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="option-grid">
      {options.map((o) => <button key={o.value} type="button" className="option" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  )
}

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => { if (!message) return; const t = setTimeout(onClose, 3500); return () => clearTimeout(t) }, [message, onClose])
  if (!message) return null
  return <div className="toast" role="status">{message}</div>
}

/** 아래에서 올라오는 확인 시트 (시안 .overlay .sheet). danger 면 확인 버튼이 빨강 */
export function Sheet({ open, title, children, confirmLabel = '확인', onConfirm, onClose, danger, busy }: {
  open: boolean; title: string; children?: ReactNode; confirmLabel?: string; onConfirm?: () => void; onClose: () => void; danger?: boolean; busy?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className={`sheet${danger ? ' danger' : ''}`}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}><Icon name="close" /></button>
        </div>
        {children && <div className="sheet-body">{children}</div>}
        {onConfirm && <Button variant="primary" busy={busy} onClick={onConfirm}>{confirmLabel}</Button>}
      </section>
    </div>
  )
}

/** 수량 조절 (시안 .quantity) */
export function Quantity({ value, onChange, label, max = 200 }: { value: number; onChange: (v: number) => void; label: string; max?: number }) {
  return (
    <div className="quantity">
      <button type="button" aria-label={`${label} 수량 줄이기`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}><Icon name="minus" /></button>
      <input type="number" min={0} max={max} step={1} value={value} aria-label={`${label} 수량`} onChange={(e) => onChange(Math.min(max, Math.max(0, Math.floor(Number(e.target.value) || 0))))} />
      <button type="button" aria-label={`${label} 수량 늘리기`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}><Icon name="plus" /></button>
    </div>
  )
}

/** 사진 올리기 상자 (시안 uploadBox). 촬영·선택 두 버튼 */
export function UploadBox({ title, help, onFile, disabled, art = 'receipt' }: { title: string; help: string; onFile: (f: File) => void; disabled?: boolean; art?: ArtName }) {
  const pick = (capture: boolean) => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'
    if (capture) input.setAttribute('capture', 'environment')
    input.onchange = () => { const f = input.files?.[0]; if (f) onFile(f) }
    input.click()
  }
  return (
    <div className="upload">
      <Art name={art} />
      <h3>{title}</h3>
      <p className="meta">{help}</p>
      <div className="upload-buttons">
        <Button disabled={disabled} onClick={() => pick(true)}>사진 촬영</Button>
        <Button disabled={disabled} onClick={() => pick(false)}>사진 선택</Button>
      </div>
    </div>
  )
}

/** 성공·결과 머리 (시안 .success-hero) */
export function SuccessHero({ art, title, children }: { art: ArtName; title: ReactNode; children?: ReactNode }) {
  return <div className="success-hero"><Art name={art} /><h2>{title}</h2>{children && <p>{children}</p>}</div>
}
