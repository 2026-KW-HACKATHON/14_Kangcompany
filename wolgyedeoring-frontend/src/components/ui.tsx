// 화면 골격용 공통 부품 (모양은 styles/app.css, 규칙은 docs/ui-handoff/design/components.md)
// 디자인 확정 후 이 파일과 app.css 만 다듬으면 전체 화면에 반영된다
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import type { Tone } from '../lib/status'
import { timeLeft } from '../lib/format'
import { deadlineTone } from '../lib/status'

export function Loading({ label = '불러오는 중' }: { label?: string }) {
  return <p className="loading" role="status">{label}</p>
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <p>{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>다시 시도</Button>}
    </div>
  )
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><p>{children}</p>{action}</div>
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge tone-${tone}`}>{children}</span>
}

type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger'
export function Button({ variant = 'secondary', busy, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; busy?: boolean }) {
  return (
    <button className={`btn btn-${variant}`} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? '처리 중' : children}
    </button>
  )
}

/** 화면 맨 아래 고정 주요 버튼 영역 (Primary 는 화면당 1개) */
export function BottomAction({ children, hint }: { children: ReactNode; hint?: string | null }) {
  return (
    <div className="bottom-action">
      {hint && <p className="hint">{hint}</p>}
      {children}
    </div>
  )
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />
}

export function Select({ options, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select className="input" {...props}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Card({ children, onClick, as = 'div' }: { children: ReactNode; onClick?: () => void; as?: 'div' | 'li' }) {
  const Tag = as
  return (
    <Tag className={`card${onClick ? ' card-link' : ''}`} onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick() } : undefined}
      tabIndex={onClick ? 0 : undefined} role={onClick ? 'link' : undefined}>
      {children}
    </Tag>
  )
}

export function Section({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="section">
      {(title || action) && <div className="section-head">{title && <h2>{title}</h2>}{action}</div>}
      {children}
    </section>
  )
}

/** 라벨: 값 목록 */
export function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="rows">
      {rows.map(([k, v]) => (
        <div key={k} className="row"><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  )
}

/** 응답 기한 카운트다운 (3시간 이하 warning) */
export function Countdown({ until, prefix = '응답 기한' }: { until: string; prefix?: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const left = timeLeft(until, now)
  return <Badge tone={deadlineTone(left?.hours ?? null)}>{left ? `${prefix} ${left.text} 남음` : `${prefix} 지남`}</Badge>
}

/** 세그먼트 (상단 탭 전환) */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => { if (!message) return; const t = setTimeout(onClose, 3500); return () => clearTimeout(t) }, [message, onClose])
  if (!message) return null
  return <div className="toast" role="status">{message}</div>
}
