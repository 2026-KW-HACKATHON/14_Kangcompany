// S-15 좌석 배치도 (명세 7, #5)
// 손그림·평면도·홀 사진 인식 또는 직접 그리기 → 확인·수정 → 게시 (게시하면 바로 손님 화면 G-15 에 보임)
import { useEffect, useMemo, useState } from 'react'
import { layouts } from '../../api'
import { useOwnerSession } from '../../app/session'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { LayoutCanvas, type Selection } from '../../components/seat/LayoutCanvas'
import { Badge, BottomAction, Button, Empty, ErrorBox, Field, Input, Loading, Rows, Section, Segmented, Select } from '../../components/ui'
import { FIXTURE_KINDS, FIXTURE_LABEL, MAX_SEATS_PER_TABLE, findFreeSpot, fitBox, summarizeLayout, type FixtureKind, type Layout, type LayoutTable } from '../../lib/layout'
import { formatDateTime } from '../../lib/format'

const EMPTY: Layout = { width: 100, height: 70, tables: [], fixtures: [] }
let seq = 0
const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`.slice(0, 20)

export default function OwnerLayout() {
  const { store } = useOwnerSession()
  const pub = useAsync(() => layouts.getPublishedLayout(store.id), [store.id])
  const [layout, setLayout] = useState<Layout | null>(null)
  const [source, setSource] = useState<'photo' | 'manual'>('manual')
  const [dirty, setDirty] = useState(false)
  const [sel, setSel] = useState<Selection>(null)
  const [note, setNote] = useState<string | null>(null)
  const [fixtureKind, setFixtureKind] = useState<FixtureKind>('entrance')
  const scan = useAction()
  const save = useAction()

  // 처음 열 때: 게시된 배치도가 있으면 그걸로 시작
  useEffect(() => {
    if (pub.data && !layout) { setLayout(pub.data.layout); setSource(pub.data.source) }
  }, [pub.data]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const move = (kind: 'table' | 'fixture', id: string, x: number, y: number) => {
    if (kind === 'table') patchTable(id, { x, y })
    else patchFixture(id, { x, y })
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
  const addFixture = () => {
    const id = newId('f')
    edit((l) => ({ ...l, fixtures: [...l.fixtures, { id, kind: fixtureKind, label: null, ...fitBox({ ...findFreeSpot(l, 12, 8), w: 12, h: 8 }, l.height) }] }))
    setSel({ kind: 'fixture', id })
  }
  const remove = () => {
    if (!sel) return
    edit((l) => sel.kind === 'table'
      ? { ...l, tables: l.tables.filter((t) => t.id !== sel.id) }
      : { ...l, fixtures: l.fixtures.filter((f) => f.id !== sel.id) })
    setSel(null)
  }

  const onPhoto = (file: File) => {
    if (layout && (layout.tables.length || layout.fixtures.length) && !confirm('지금 배치를 사진 인식 결과로 바꿀까요? (게시하기 전까지 손님 화면은 그대로예요)')) return
    void scan.run(async () => {
      const r = await layouts.extractLayout(store.id, file)
      setLayout(r.layout); setSource('photo'); setDirty(true); setSel(null)
      setNote(r.note ?? (r.layout.tables.length ? `테이블 ${r.layout.tables.length}개를 찾았어요. 위치와 좌석 수를 확인하고 게시해 주세요.` : null))
    })
  }

  const publish = () => save.run(async () => {
    if (!layout) return
    if (summary?.overlaps.length && !confirm('겹친 테이블이 있어요. 그대로 게시할까요?')) return
    await layouts.publishStoreLayout(store.id, layout, source)
    await pub.reload()
    setDirty(false)
    setNote('게시했어요. 손님이 가게 찾기 → 좌석 배치도에서 볼 수 있어요.')
  })

  if (pub.loading && !pub.data && !layout) return <Page title="좌석 배치도" back><Loading /></Page>
  if (pub.error) return <Page title="좌석 배치도" back><ErrorBox message={pub.error.message} onRetry={pub.reload} /></Page>

  const photoInput = (labelText: string) => (
    <Field label={labelText} hint="종이에 그린 배치(손그림), 평면도, 홀 전체가 보이는 사진 모두 돼요. 사진은 저장하지 않아요">
      <input type="file" accept="image/*" disabled={scan.busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = '' }} />
    </Field>
  )

  return (
    <Page title="좌석 배치도" back={paths.ownerHome}>
      <div className="btn-row">
        {pub.data ? <Badge tone="success">게시됨 {formatDateTime(pub.data.published_at)}</Badge> : <Badge tone="muted">아직 게시 안 함</Badge>}
        {dirty && <Badge tone="warning">게시하지 않은 변경 있음</Badge>}
      </div>
      {scan.busy && <p className="muted" role="status">배치를 읽는 중이에요 (20초 정도)</p>}
      {scan.error && <p className="inline-error" role="alert">{scan.error}</p>}
      {note && <p className="strong" role="status">{note}</p>}

      {!layout ? (
        <Empty action={
          <div className="form">
            {photoInput('손그림·사진으로 만들기')}
            <Button variant="secondary" onClick={() => { setLayout(EMPTY); setSource('manual'); setDirty(true) }}>직접 그리기</Button>
          </div>
        }>좌석 배치도를 올리면 단체가 예약 전에 자리를 미리 볼 수 있어요.</Empty>
      ) : (
        <>
          {summary && (
            <Rows rows={[
              ['테이블', `${summary.table_count}개`],
              ['좌석 합계', `${summary.total_seats}석`],
              ['단체석 최대 인원 (가게 정보)', `${store.max_capacity}명`],
            ]} />
          )}
          <LayoutCanvas layout={layout} editable selected={sel} onSelect={setSel} onMove={move} warnIds={warnIds} />
          {summary?.warnings.map((w) => <p key={w} className="inline-error" role="status">{w}</p>)}
          <p className="muted">테이블을 끌어서 옮기거나, 누른 뒤 화살표 키로 움직일 수 있어요.</p>

          {table && (
            <Section title={`테이블 ${table.label}`}>
              <Field label="이름"><Input value={table.label} maxLength={10} onChange={(e) => patchTable(table.id, { label: e.target.value })} /></Field>
              <Field label="좌석 수">
                <div className="qty">
                  <Button aria-label="좌석 빼기" onClick={() => patchTable(table.id, { seats: Math.max(1, table.seats - 1) })} disabled={table.seats <= 1}>−</Button>
                  <Input type="number" min={1} max={MAX_SEATS_PER_TABLE} value={table.seats} style={{ width: 80, textAlign: 'center' }} aria-label="좌석 수"
                    onChange={(e) => patchTable(table.id, { seats: Math.min(MAX_SEATS_PER_TABLE, Math.max(1, Number(e.target.value) || 1)) })} />
                  <Button aria-label="좌석 더하기" onClick={() => patchTable(table.id, { seats: Math.min(MAX_SEATS_PER_TABLE, table.seats + 1) })}>+</Button>
                </div>
              </Field>
              <Field label="모양">
                <Segmented value={table.shape} onChange={(v) => patchTable(table.id, { shape: v })} options={[{ value: 'rect', label: '사각' }, { value: 'round', label: '원형' }]} />
              </Field>
              <div className="btn-row">
                <Field label="가로"><Input type="number" min={3} max={100} value={table.w} style={{ width: 90 }} onChange={(e) => patchTable(table.id, { w: Number(e.target.value) || 3 })} /></Field>
                <Field label="세로"><Input type="number" min={3} max={layout.height} value={table.h} style={{ width: 90 }} onChange={(e) => patchTable(table.id, { h: Number(e.target.value) || 3 })} /></Field>
              </div>
              <Button variant="danger" onClick={remove}>이 테이블 삭제</Button>
            </Section>
          )}
          {fixture && (
            <Section title={`시설 ${fixture.label || FIXTURE_LABEL[fixture.kind]}`}>
              <Field label="종류">
                <Select value={fixture.kind} onChange={(e) => patchFixture(fixture.id, { kind: e.target.value as FixtureKind })}
                  options={FIXTURE_KINDS.map((k) => ({ value: k, label: FIXTURE_LABEL[k] }))} />
              </Field>
              <div className="btn-row">
                <Field label="가로"><Input type="number" min={3} max={100} value={fixture.w} style={{ width: 90 }} onChange={(e) => patchFixture(fixture.id, { w: Number(e.target.value) || 3 })} /></Field>
                <Field label="세로"><Input type="number" min={3} max={layout.height} value={fixture.h} style={{ width: 90 }} onChange={(e) => patchFixture(fixture.id, { h: Number(e.target.value) || 3 })} /></Field>
              </div>
              <Button variant="danger" onClick={remove}>이 시설 삭제</Button>
            </Section>
          )}

          <Section title="추가">
            <div className="btn-row">
              <Button variant="secondary" onClick={addTable}>테이블 추가</Button>
              <Select value={fixtureKind} onChange={(e) => setFixtureKind(e.target.value as FixtureKind)} aria-label="추가할 시설 종류"
                options={FIXTURE_KINDS.map((k) => ({ value: k, label: FIXTURE_LABEL[k] }))} style={{ maxWidth: 140 }} />
              <Button variant="secondary" onClick={addFixture}>시설 추가</Button>
            </div>
            {photoInput('손그림·사진으로 다시 만들기')}
          </Section>

          <BottomAction hint={save.error}>
            <Button variant="primary" busy={save.busy} onClick={() => void publish()} disabled={!layout.tables.length || (!dirty && Boolean(pub.data))}>
              {pub.data ? '변경 내용 게시하기' : '게시하기'}
            </Button>
          </BottomAction>
        </>
      )}
    </Page>
  )
}
