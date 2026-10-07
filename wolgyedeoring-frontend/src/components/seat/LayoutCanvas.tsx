// 좌석 배치도 그리기 (SVG). editable 이면 끌어서 옮기기 + 화살표 키로 1칸씩(Shift 5칸) 이동
// 좌표는 가로 100 기준 (lib/layout). 색은 디자인 토큰 의미 변수만 사용
import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { FIXTURE_LABEL, type Layout } from '../../lib/layout'

export type Selection = { kind: 'table' | 'fixture'; id: string } | null

interface Props {
  layout: Layout
  editable?: boolean
  selected?: Selection
  warnIds?: Set<string> // 겹친 테이블 등 강조
  onSelect?: (s: Selection) => void
  onMove?: (kind: 'table' | 'fixture', id: string, x: number, y: number) => void
  maxHeightPx?: number
  label?: string
}

export function LayoutCanvas({ layout, editable, selected, warnIds, onSelect, onMove, maxHeightPx = 520, label = '좌석 배치도' }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  // 끌기 시작 시점의 화면→SVG 변환을 고정: 끄는 도중 위쪽 내용(경고 문구 등)이 생겨 캔버스가 밀려도 손가락을 정확히 따라감
  const drag = useRef<{ kind: 'table' | 'fixture'; id: string; dx: number; dy: number; inv: DOMMatrix } | null>(null)

  const toSvg = (e: PointerEvent, inv?: DOMMatrix) => {
    const m = inv ?? svgRef.current?.getScreenCTM()?.inverse()
    if (!m) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m)
    return { x: p.x, y: p.y }
  }

  const start = (kind: 'table' | 'fixture', id: string, x: number, y: number) => (e: PointerEvent<SVGGElement>) => {
    onSelect?.({ kind, id })
    if (!editable) return
    const inv = svgRef.current?.getScreenCTM()?.inverse()
    if (!inv) return
    const p = toSvg(e, inv)!
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { kind, id, dx: p.x - x, dy: p.y - y, inv }
  }
  const move = (e: PointerEvent<SVGGElement>) => {
    const d = drag.current
    if (!d) return
    const p = toSvg(e, d.inv)
    if (p) onMove?.(d.kind, d.id, Math.round(p.x - d.dx), Math.round(p.y - d.dy))
  }
  const end = () => { drag.current = null }

  const keys = (kind: 'table' | 'fixture', id: string, x: number, y: number) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.({ kind, id }); return }
    if (!editable) return
    const step = e.shiftKey ? 5 : 1
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const dlt = delta[e.key]
    if (!dlt) return
    e.preventDefault()
    onSelect?.({ kind, id })
    onMove?.(kind, id, x + dlt[0], y + dlt[1])
  }

  const isSel = (kind: string, id: string) => selected?.kind === kind && selected.id === id
  const total = layout.tables.reduce((s, t) => s + t.seats, 0)

  return (
    <div className="seat-canvas" style={{ maxHeight: maxHeightPx }}>
      <svg ref={svgRef} viewBox={`0 0 100 ${layout.height}`} role="img"
        aria-label={`${label}: 테이블 ${layout.tables.length}개, ${total}석`}
        onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as Element).getAttribute('data-bg')) onSelect?.(null) }}
        style={{ width: '100%', height: 'auto', display: 'block' }}>
        <rect data-bg="1" x={0} y={0} width={100} height={layout.height} rx={1.5}
          style={{ fill: 'var(--color-surface)', stroke: 'var(--color-border-strong)', strokeWidth: 0.4 }} />

        {layout.fixtures.map((f) => {
          const sel = isSel('fixture', f.id)
          const name = f.label || FIXTURE_LABEL[f.kind]
          const fs = Math.max(2, Math.min(3.2, f.h * 0.5, (f.w / Math.max(name.length, 1)) * 1.1))
          return (
            <g key={f.id} tabIndex={editable ? 0 : -1} role={editable ? 'button' : undefined} aria-label={editable ? `시설 ${name}` : undefined}
              onPointerDown={start('fixture', f.id, f.x, f.y)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
              onKeyDown={keys('fixture', f.id, f.x, f.y)}
              style={{ cursor: editable ? 'grab' : 'default', touchAction: editable ? 'none' : 'auto' }}>
              <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={0.6}
                style={{ fill: 'var(--color-bg-subtle)', stroke: sel ? 'var(--color-accent)' : 'var(--color-border-strong)', strokeWidth: sel ? 0.7 : 0.3, strokeDasharray: '1 0.8' }} />
              <text x={f.x + f.w / 2} y={f.y + f.h / 2} textAnchor="middle" dominantBaseline="central"
                style={{ fontSize: fs, fill: 'var(--color-text-secondary)', pointerEvents: 'none', userSelect: 'none' }}>{name}</text>
            </g>
          )
        })}

        {layout.tables.map((t) => {
          const sel = isSel('table', t.id)
          const warn = warnIds?.has(t.id)
          const low = t.confidence === 'low'
          const stroke = sel ? 'var(--color-accent)' : warn ? 'var(--tone-danger-fg)' : 'var(--color-brand)'
          const fs = Math.max(2, Math.min(4.2, t.h / 2.6, (t.w / Math.max(t.label.length, 2)) * 1.2)) // 폰 폭에서 약 14px
          const common = { style: { fill: 'var(--color-brand-subtle)', stroke, strokeWidth: sel || warn ? 0.8 : 0.4, strokeDasharray: low ? '1.2 0.8' : undefined } }
          return (
            <g key={t.id} tabIndex={0} role="button" aria-pressed={sel} aria-label={`테이블 ${t.label}, ${t.seats}석${warn ? ', 다른 테이블과 겹침' : ''}${low ? ', 좌석 수 추정' : ''}`}
              onPointerDown={start('table', t.id, t.x, t.y)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
              onKeyDown={keys('table', t.id, t.x, t.y)}
              style={{ cursor: editable ? 'grab' : 'pointer', touchAction: editable ? 'none' : 'auto', outline: 'none' }}>
              {t.shape === 'round'
                ? <ellipse cx={t.x + t.w / 2} cy={t.y + t.h / 2} rx={t.w / 2} ry={t.h / 2} {...common} />
                : <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={1} {...common} />}
              <text x={t.x + t.w / 2} y={t.y + t.h / 2 - fs * 0.45} textAnchor="middle" dominantBaseline="central"
                style={{ fontSize: fs, fontWeight: 700, fill: 'var(--color-text-primary)', pointerEvents: 'none', userSelect: 'none' }}>{t.label}</text>
              <text x={t.x + t.w / 2} y={t.y + t.h / 2 + fs * 0.65} textAnchor="middle" dominantBaseline="central"
                style={{ fontSize: fs * 0.85, fill: 'var(--color-text-secondary)', pointerEvents: 'none', userSelect: 'none' }}>{t.seats}석</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
