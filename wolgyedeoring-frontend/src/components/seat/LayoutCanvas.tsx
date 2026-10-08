// 좌석 배치도 그리기 (SVG). editable 이면 끌어서 옮기기 + 화살표 키로 1칸씩(Shift 5칸) 이동
// 좌표는 가로 100 기준 (lib/layout). 색은 디자인 토큰 의미 변수만 사용
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
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
  // 이동 반영은 화면 갱신 주기(requestAnimationFrame)마다 한 번만: 휴대폰에서 포인터 이벤트마다 화면 전체를 다시 그리면 끊김
  const pending = useRef<{ kind: 'table' | 'fixture'; id: string; x: number; y: number } | null>(null)
  const frame = useRef(0)
  const flush = () => {
    frame.current = 0
    const p = pending.current
    pending.current = null
    if (p) onMove?.(p.kind, p.id, p.x, p.y)
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

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
    if (!p) return
    // 정수로 반올림하지 않는다 (가로 100칸이라 휴대폰에서 3~4px 씩 뚝뚝 튐). 소수 한 자리 정리는 fitBox 가 함
    pending.current = { kind: d.kind, id: d.id, x: p.x - d.dx, y: p.y - d.dy }
    if (!frame.current) frame.current = requestAnimationFrame(flush)
  }
  const end = () => {
    drag.current = null
    if (frame.current) { cancelAnimationFrame(frame.current); flush() } // 손을 뗀 마지막 위치는 바로 반영
  }

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

  // 시안 seating.js seatingDiagram 와 같은 마크업·클래스 (스타일: styles/proto/seating.css)
  return (
    <div className="seat-canvas" style={{ maxHeight: maxHeightPx }}>
      <svg ref={svgRef} className="seating-diagram" viewBox={`0 0 100 ${layout.height}`} role="group"
        aria-label={`${label}: 테이블 ${layout.tables.length}개, ${total}석.${editable ? ' 요소를 선택하고 끌거나 방향키로 이동하세요.' : ' 테이블을 눌러 좌석 수를 확인하세요.'}`}
        onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as Element).getAttribute('data-bg')) onSelect?.(null) }}>
        <rect data-bg="1" width={100} height={layout.height} rx={3} className="seat-floor" />

        {layout.fixtures.map((f) => {
          const sel = isSel('fixture', f.id)
          const name = f.label || FIXTURE_LABEL[f.kind]
          const fs = Math.max(2, Math.min(5, f.h / 1.8, (f.w / Math.max(name.length, 2)) * 1.1))
          return (
            <g key={f.id} className={`seat-item seat-fixture-item${sel ? ' is-selected' : ''}`} transform={`translate(${f.x} ${f.y})`}
              tabIndex={editable ? 0 : -1} role={editable ? 'button' : undefined} aria-pressed={editable ? sel : undefined} aria-label={editable ? `시설 ${name}, 방향키로 이동` : undefined}
              onPointerDown={start('fixture', f.id, f.x, f.y)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
              onKeyDown={keys('fixture', f.id, f.x, f.y)}>
              <rect className="seat-fixture" width={f.w} height={f.h} rx={1} />
              <text className="seat-facility-name" x={f.w / 2} y={f.h / 2} style={{ fontSize: fs }}>{name}</text>
            </g>
          )
        })}

        {layout.tables.map((t) => {
          const sel = isSel('table', t.id)
          const warn = warnIds?.has(t.id)
          const low = Boolean(editable && t.confidence === 'low')
          const fs = Math.max(2, Math.min(5, t.h / 1.6, (t.w / Math.max(t.label.length, 2)) * 1.1))
          return (
            <g key={t.id} className={`seat-item seat-table-item${sel ? ' is-selected' : ''}${low ? ' is-estimated' : ''}${warn ? ' is-overlapping' : ''}`}
              transform={`translate(${t.x} ${t.y})`} tabIndex={0} role="button" aria-pressed={sel}
              aria-label={`테이블 ${t.label}, ${t.seats}석${low ? ', 좌석 수 확인 필요' : ''}${warn ? ', 다른 테이블과 겹침' : ''}${editable ? ', 방향키로 이동' : ''}`}
              onPointerDown={start('table', t.id, t.x, t.y)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
              onKeyDown={keys('table', t.id, t.x, t.y)}
              style={editable ? undefined : { cursor: 'pointer', touchAction: 'auto' }}>
              {t.shape === 'round'
                ? <ellipse className="seat-table" cx={t.w / 2} cy={t.h / 2} rx={t.w / 2} ry={t.h / 2} />
                : <rect className="seat-table" width={t.w} height={t.h} rx={1.6} />}
              <text className="seat-name" x={t.w / 2} y={t.h / 2} style={{ fontSize: fs }}>{t.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function SeatLegend() {
  return <div className="seat-legend"><span><i className="seat-legend-table" />테이블</span><span><i className="seat-legend-fixture" />시설·통로</span></div>
}

export function SeatMetrics({ tables, seats, capacity }: { tables: number; seats: number; capacity: number }) {
  return (
    <div className="seat-metrics">
      <div><span>테이블</span><strong>{tables}<small>개</small></strong></div>
      <div><span>좌석 합계</span><strong>{seats}<small>석</small></strong></div>
      <div><span>가게 최대 인원</span><strong>{capacity}<small>명</small></strong></div>
    </div>
  )
}
