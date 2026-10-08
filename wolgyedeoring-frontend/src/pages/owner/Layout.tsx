// S-15 좌석 배치도 (시안 38 관리 → 39 편집·게시)
// 손그림·평면도·홀 사진 인식 또는 직접 그리기 → 확인·수정 → 게시 (게시하면 바로 손님 화면 G-15 에 보임)
import { useEffect, useMemo, useState } from 'react'
import { layouts } from '../../api'
import { useOwnerSession } from '../../app/session'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Icon } from '../../components/icons'
import { LayoutCanvas, SeatLegend, SeatMetrics, type Selection } from '../../components/seat/LayoutCanvas'
import { Badge, Button, Dock, ErrorBox, Field, Input, Intro, Loading, Segmented, Select, Sheet } from '../../components/ui'
import { FIXTURE_KINDS, FIXTURE_LABEL, MAX_SEATS_PER_TABLE, findFreeSpot, fitBox, summarizeLayout, type FixtureKind, type Layout, type LayoutTable } from '../../lib/layout'
import { dateLabel } from '../../lib/format'

const EMPTY: Layout = { width: 100, height: 70, tables: [], fixtures: [] }
let seq = 0
const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`.slice(0, 20)

function pickPhoto(onFile: (f: File) => void) {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = 'image/*'
  input.onchange = () => { const f = input.files?.[0]; if (f) onFile(f) }
  input.click()
}

export default function OwnerLayout() {
  const { store } = useOwnerSession()
  const pub = useAsync(() => layouts.getPublishedLayout(store.id), [store.id])
  const [layout, setLayout] = useState<Layout | null>(null) // null = 관리 화면(38), 값 = 편집 화면(39)
  const [source, setSource] = useState<'photo' | 'manual'>('manual')
  const [dirty, setDirty] = useState(false)
  const [sel, setSel] = useState<Selection>(null)
  const [note, setNote] = useState<string | null>(null)
  const [fixturePicker, setFixturePicker] = useState(false)
  const [confirmOverlap, setConfirmOverlap] = useState(false)
  const scan = useAction()
  const save = useAction()

  useEffect(() => { if (!layout) setSel(null) }, [layout])
  const summary = useMemo(() => (layout ? summarizeLayout(layout, store.max_capacity) : null), [layout, store.max_capacity])
  const warnIds = useMemo(() => {
    if (!layout || !summary) return new Set<string>()
    const labels = new Set(summary.overlaps.flat())
    return new Set(layout.tables.filter((t) => labels.has(t.label)).map((t) => t.id))
  }, [layout, summary])

  const edit = (fn: (l: Layout) => Layout) => { setLayout((l) => (l ? fn(l) : l)); setDirty(true) }
  const table = sel?.kind === 'table' ? layout?.tables.find((t) => t.id === sel.id) : undefined
  const fixture = sel?.kind === 'fixture' ? layout?.fixtures.find((f) => f.id === sel.id) : undefined

  const patchTable = (id: string, p: Partial<LayoutTable>) => edit((l) => ({
    ...l,
    tables: l.tables.map((t) => {
      if (t.id !== id) return t
      const n = { ...t, ...p }
      const { confidence: _c, ...rest } = n // 사장님이 손댄 테이블은 '추정' 표시 해제
      return { ...rest, ...fitBox(n, l.height) }
    }),
  }))
  const patchFixture = (id: string, p: Partial<Layout['fixtures'][number]>) => edit((l) => ({
    ...l, fixtures: l.fixtures.map((f) => (f.id === id ? { ...f, ...p, ...fitBox({ ...f, ...p }, l.height) } : f)),
  }))
  const move = (kind: 'table' | 'fixture', id: string, x: number, y: number) => (kind === 'table' ? patchTable(id, { x, y }) : patchFixture(id, { x, y }))
  const nudge = (dx: number, dy: number) => {
    const item = table ?? fixture
    if (item && sel) move(sel.kind, item.id, item.x + dx, item.y + dy)
  }
  const swap = () => {
    const item = table ?? fixture
    if (item && sel) (sel.kind === 'table' ? patchTable : patchFixture)(item.id, { w: item.h, h: item.w })
  }

  const addTable = () => {
    if (!layout) return
    const used = new Set(layout.tables.map((t) => t.label.toLowerCase()))
    let n = layout.tables.length + 1
    while (used.has(`t${n}`)) n++
    const id = newId('t')
    edit((l) => ({ ...l, tables: [...l.tables, { id, label: `T${n}`, shape: 'rect', seats: 4, ...fitBox({ ...findFreeSpot(l, 14, 10), w: 14, h: 10 }, l.height) }] }))
    setSel({ kind: 'table', id })
  }
  const addFixture = (kind: FixtureKind) => {
    const id = newId('f')
    edit((l) => ({ ...l, fixtures: [...l.fixtures, { id, kind, label: null, ...fitBox({ ...findFreeSpot(l, 12, 8), w: 12, h: 8 }, l.height) }] }))
    setSel({ kind: 'fixture', id }); setFixturePicker(false)
  }
  const remove = () => {
    if (!sel) return
    edit((l) => sel.kind === 'table' ? { ...l, tables: l.tables.filter((t) => t.id !== sel.id) } : { ...l, fixtures: l.fixtures.filter((f) => f.id !== sel.id) })
    setSel(null)
  }

  const onPhoto = (file: File) => void scan.run(async () => {
    setLayout((l) => l ?? EMPTY); setSource('photo')
    const r = await layouts.extractLayout(store.id, file)
    setLayout(r.layout); setDirty(true); setSel(null)
    setNote(r.note ?? (r.layout.tables.length ? `테이블 ${r.layout.tables.length}개를 찾았어요. 위치와 좌석 수를 확인하고 게시해 주세요.` : null))
  })
  const startEdit = (from: 'published' | 'empty') => {
    setNote(null); setSel(null)
    if (from === 'published' && pub.data) { setLayout(pub.data.layout); setSource(pub.data.source); setDirty(false) }
    else { setLayout(EMPTY); setSource('manual'); setDirty(true) }
  }
  const publish = () => save.run(async () => {
    if (!layout) return
    await layouts.publishStoreLayout(store.id, layout, source)
    await pub.reload()
    setConfirmOverlap(false); setDirty(false); setLayout(null)
    setNote('게시했어요. 단체가 캘린더 → 좌석 배치도에서 볼 수 있어요.')
  })

  if (pub.loading && !pub.data) return <Page title="좌석 배치도" role="owner"><Loading /></Page>
  if (pub.error) return <Page title="좌석 배치도" role="owner"><ErrorBox message={pub.error.message} onRetry={pub.reload} /></Page>

  // ---------------- 시안 38: 관리 ----------------
  if (!layout) {
    const p = pub.data
    return (
      <Page title="좌석 배치도" back={paths.ownerHome}>
        <Intro title="우리 가게의 자리를 보여 주세요" sub="사진으로 시작하거나 직접 그린 뒤 게시해요." />
        {note && <p className="seat-scan-note" role="status">{note}</p>}
        {p ? (
          <section className="seat-layout-panel">
            <div className="seat-panel-heading"><h2>현재 공개한 배치도</h2><Badge tone="success">공개 중</Badge></div>
            <SeatMetrics tables={p.table_count} seats={p.total_seats} capacity={store.max_capacity} />
            <LayoutCanvas layout={p.layout} label="현재 공개한 좌석 배치도" />
            <SeatLegend />
            <p className="meta seat-published-date">{dateLabel(p.published_at)} · {p.source === 'photo' ? '사진에서 시작' : '직접 그리기'}</p>
            <Button full onClick={() => startEdit('published')}>현재 배치도 수정</Button>
          </section>
        ) : (
          <div className="seat-empty-layout"><Icon name="store" /><h3>아직 배치도를 게시하지 않았어요</h3><p>단체가 예약 전에 가게의 자리를 확인할 수 있게 올려 주세요.</p></div>
        )}
        <section className="section">
          <h2>{p ? '새 배치도로 바꾸기' : '어떻게 만들까요?'}</h2>
          <div className="seat-methods">
            <button type="button" className="seat-method" onClick={() => pickPhoto(onPhoto)}>
              <span className="seat-method-icon"><Icon name="receipt" /></span><strong>손그림·사진으로 시작</strong><small>평면도나 홀 사진에서 테이블 후보를 확인해요</small><Icon name="chevron" />
            </button>
            <button type="button" className="seat-method" onClick={() => startEdit('empty')}>
              <span className="seat-method-icon"><Icon name="plus" /></span><strong>직접 그리기</strong><small>테이블과 입구·주방 등을 원하는 곳에 놓아요</small><Icon name="chevron" />
            </button>
          </div>
        </section>
        <p className="meta">편집 중에는 기존 공개 배치도가 유지돼요. 게시하면 새 내용으로 바뀝니다.</p>
      </Page>
    )
  }

  // ---------------- 시안 39: 편집·게시 ----------------
  const item = table ?? fixture
  const blocking = !layout.tables.length ? '테이블이 하나도 없어요. 테이블을 추가해 주세요.' : null
  return (
    <Page title="배치도 만들기" back={false} actions={<Button variant="text" onClick={() => { if (!dirty || confirm('편집한 내용을 버리고 나갈까요?')) setLayout(null) }}>닫기</Button>}
      dock={<Dock>{save.error && <p className="note-error" role="alert">{save.error}</p>}
        <Button variant="primary" busy={save.busy} disabled={Boolean(blocking) || scan.busy || (!dirty && Boolean(pub.data))}
          onClick={() => (summary?.overlaps.length ? setConfirmOverlap(true) : void publish())}>{pub.data ? '변경 내용 게시하기' : '배치도 게시하기'}</Button></Dock>}
      overlay={<>
        <Sheet open={fixturePicker} title="추가할 시설" onClose={() => setFixturePicker(false)}>
          <div className="selection-list">
            {FIXTURE_KINDS.map((k) => <button key={k} type="button" className="selection-row" onClick={() => addFixture(k)}><span className="selection-copy"><strong>{FIXTURE_LABEL[k]}</strong></span></button>)}
          </div>
        </Sheet>
        <Sheet open={confirmOverlap} title="겹친 테이블이 있어요" confirmLabel="그대로 게시하기" busy={save.busy} onClose={() => setConfirmOverlap(false)} onConfirm={() => void publish()}>
          <p className="subtitle">{summary?.overlaps.map((o) => o.join('·')).join(', ')} 테이블이 겹쳐 있어요. 그대로 게시할까요?</p>
        </Sheet>
      </>}>
      <div className="seat-editor-intro">
        <div className="seat-editor-title">
          <h2>{source === 'photo' ? '인식 후보를 확인해 주세요' : '배치도를 직접 만들어요'}</h2>
          <Badge tone={dirty ? 'warning' : 'success'}>{dirty ? '게시 전 변경' : '현재 게시본'}</Badge>
        </div>
        <p className="subtitle">게시하기 전까지 단체에게 보이는 배치도는 바뀌지 않아요.</p>
      </div>
      {scan.busy && <div className="seat-scan-state" role="status"><div className="skeleton short" /><p>배치를 읽는 중이에요 (20초 정도)</p></div>}
      {scan.error && (
        <div className="seat-scan-state error" role="alert">
          <h3>배치도 인식에 실패했어요</h3><p>{scan.error}</p>
          <Button onClick={() => pickPhoto(onPhoto)}>손그림·사진 다시 선택</Button>
        </div>
      )}
      <SeatMetrics tables={summary?.table_count ?? 0} seats={summary?.total_seats ?? 0} capacity={store.max_capacity} />
      <div className="seat-editor-summary"><span>{summary?.table_count ?? 0}개 테이블 · {summary?.total_seats ?? 0}석</span><span className="meta">선택해서 편집</span></div>
      <div className="seat-editor-board">
        <LayoutCanvas layout={layout} editable selected={sel} onSelect={setSel} onMove={move} warnIds={warnIds} />
        {!layout.tables.length && !scan.busy && <p className="seat-board-empty">테이블을 추가해 배치도를 만들어 주세요.</p>}
      </div>
      <SeatLegend />
      {note && <p className="seat-scan-note">{note}</p>}
      {blocking && <p className="seat-edit-error" role="alert">{blocking}</p>}
      {summary && summary.warnings.length > 0 && !blocking && (
        <div className="seat-warnings" role="status"><strong>게시 전에 확인해 주세요</strong>{summary.warnings.map((w) => <p key={w}>{w}</p>)}</div>
      )}

      <section className="seat-selection-tools">
        {!item || !sel ? (
          <div className="seat-selection-empty"><Icon name="info" /><span>테이블이나 시설을 누르면 이름·좌석 수·크기를 바꿀 수 있어요.</span></div>
        ) : (
          <>
            <div className="seat-selection-heading"><h3>{table ? table.label : fixture!.label || FIXTURE_LABEL[fixture!.kind]} 편집</h3><Button variant="text" onClick={() => setSel(null)}>선택 해제</Button></div>
            {table ? (
              <>
                <Field label="테이블 이름"><Input value={table.label} maxLength={10} onChange={(e) => patchTable(table.id, { label: e.target.value })} /></Field>
                <label className="field">
                  <span className="field-label">좌석 수</span>
                  <div className="seat-quantity">
                    <button type="button" className="secondary" aria-label="좌석 한 개 줄이기" disabled={table.seats <= 1} onClick={() => patchTable(table.id, { seats: table.seats - 1 })}>−</button>
                    <input type="number" aria-label="좌석 수" min={1} max={MAX_SEATS_PER_TABLE} value={table.seats} onChange={(e) => patchTable(table.id, { seats: Math.min(MAX_SEATS_PER_TABLE, Math.max(1, Number(e.target.value) || 1)) })} />
                    <button type="button" className="secondary" aria-label="좌석 한 개 늘리기" disabled={table.seats >= MAX_SEATS_PER_TABLE} onClick={() => patchTable(table.id, { seats: table.seats + 1 })}>+</button>
                  </div>
                </label>
                <div className="field"><span className="field-label">테이블 모양</span>
                  <Segmented label="테이블 모양" value={table.shape} onChange={(v) => patchTable(table.id, { shape: v })} options={[{ value: 'rect', label: '사각' }, { value: 'round', label: '원형' }]} />
                </div>
              </>
            ) : (
              <>
                <Field label="시설 종류"><Select title="시설 종류" value={fixture!.kind} onChange={(kind) => patchFixture(fixture!.id, { kind })} options={FIXTURE_KINDS.map((k) => ({ value: k, label: FIXTURE_LABEL[k] }))} /></Field>
                <Field label="시설 이름 (선택)"><Input value={fixture!.label ?? ''} maxLength={10} onChange={(e) => patchFixture(fixture!.id, { label: e.target.value || null })} /></Field>
              </>
            )}
            <div className="pair seat-size-fields">
              <Field label="가로 크기"><Input type="number" min={3} max={100} value={item.w} onChange={(e) => (table ? patchTable : patchFixture)(item.id, { w: Number(e.target.value) || 3 })} /></Field>
              <Field label="세로 크기"><Input type="number" min={3} max={layout.height} value={item.h} onChange={(e) => (table ? patchTable : patchFixture)(item.id, { h: Number(e.target.value) || 3 })} /></Field>
            </div>
            <p className="meta">위치를 끌어 옮기거나 아래 방향 버튼을 누르세요.</p>
            <div className="seat-move-tools" aria-label="선택한 요소 이동">
              {([['왼쪽', '←', -1, 0], ['위', '↑', 0, -1], ['아래', '↓', 0, 1], ['오른쪽', '→', 1, 0]] as const).map(([l, g, dx, dy]) => (
                <button key={l} type="button" className="secondary" aria-label={`${l}로 이동`} onClick={() => nudge(dx, dy)}>{g}</button>
              ))}
            </div>
            <div className="seat-item-actions">
              <Button onClick={swap}>가로·세로 바꾸기</Button>
              <Button variant="danger" onClick={remove}>{table ? '테이블 삭제' : '시설 삭제'}</Button>
            </div>
          </>
        )}
      </section>

      <section className="seat-add-section">
        <h2>배치 요소 추가</h2>
        <div className="seat-palette">
          <Button disabled={scan.busy} onClick={addTable}><Icon name="plus" /><span>테이블 추가</span></Button>
          <Button disabled={scan.busy} onClick={() => setFixturePicker(true)}><Icon name="plus" /><span>시설 추가</span></Button>
        </div>
        <p className="meta">입구 · 카운터 · 주방 · 화장실 · 창가 · 기타</p>
      </section>
      <div className="seat-bottom-links"><Button variant="text" onClick={() => pickPhoto(onPhoto)}>손그림·사진으로 다시 만들기</Button></div>
      <p className="meta">테이블 위치와 좌석 수를 확인한 뒤 바로 게시해요.</p>
    </Page>
  )
}
