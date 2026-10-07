// S-15 좌석 배치도 (명세 7, #5)
// 사진(평면도·손그림·실내 사진) → 테이블 후보 인식 → 끌어서 옮기기·좌석 수 수정 → 임시 저장 / 게시
// 게시본만 손님에게 보임. 손님 제안은 글로만 오고, 반영은 사장님이 직접 고쳐 게시
import { useEffect, useMemo, useState } from 'react'
import { layouts } from '../../api'
import { useOwnerSession } from '../../app/session'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { LayoutCanvas, type Selection } from '../../components/seat/LayoutCanvas'
import { Badge, BottomAction, Button, Empty, ErrorBox, Field, Input, Loading, Rows, Section, Segmented, Select } from '../../components/ui'
import { FIXTURE_KINDS, FIXTURE_LABEL, MAX_HEIGHT, MAX_SEATS_PER_TABLE, MIN_HEIGHT, fitBox, summarizeLayout, type FixtureKind, type Layout, type LayoutTable } from '../../lib/layout'
import { formatDateTime } from '../../lib/format'

const EMPTY: Layout = { width: 100, height: 70, tables: [], fixtures: [] }
let seq = 0
const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`.slice(0, 20)

export default function OwnerLayout() {
  const { store } = useOwnerSession()
  const info = useAsync(() => layouts.getStoreLayout(store.id), [store.id])
  const sugg = useAsync(() => layouts.listLayoutSuggestions(store.id), [store.id])
  const [layout, setLayout] = useState<Layout | null>(null)
  const [source, setSource] = useState<'photo' | 'manual'>('manual')
  const [dirty, setDirty] = useState(false)
  const [sel, setSel] = useState<Selection>(null)
  const [note, setNote] = useState<string | null>(null)
  const [fixtureKind, setFixtureKind] = useState<FixtureKind>('entrance')
  const scan = useAction()
  const save = useAction()
  const respond = useAction()

  // 처음 열 때: 임시본 → 없으면 게시본
  useEffect(() => {
    if (!info.data || layout) return
    const base = info.data.draft ?? info.data.published
    if (base) { setLayout(base.layout); setSource(base.source) }
  }, [info.data]) // eslint-disable-line react-hooks/exhaustive-deps

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
    edit((l) => ({ ...l, tables: [...l.tables, { id, label: `T${n}`, shape: 'rect', seats: 4, ...fitBox({ x: 43, y: l.height / 2 - 5, w: 14, h: 10 }, l.height) }] }))
    setSel({ kind: 'table', id })
  }
  const addFixture = () => {
    const id = newId('f')
    edit((l) => ({ ...l, fixtures: [...l.fixtures, { id, kind: fixtureKind, label: null, ...fitBox({ x: 2, y: 2, w: 12, h: 8 }, l.height) }] }))
    setSel({ kind: 'fixture', id })
  }
  const remove = () => {
    if (!sel) return
    edit((l) => sel.kind === 'table'
      ? { ...l, tables: l.tables.filter((t) => t.id !== sel.id) }
      : { ...l, fixtures: l.fixtures.filter((f) => f.id !== sel.id) })
    setSel(null)
  }
  const setHeight = (h: number) => edit((l) => {
    const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(h) || l.height))
    return {
      ...l, height,
      tables: l.tables.map((t) => ({ ...t, ...fitBox(t, height) })),
      fixtures: l.fixtures.map((f) => ({ ...f, ...fitBox(f, height) })),
    }
  })

  const onPhoto = (file: File) => {
    if (layout && (layout.tables.length || layout.fixtures.length) && !confirm('지금 배치를 사진 인식 결과로 바꿀까요? (저장 전까지는 게시된 배치도가 그대로예요)')) return
    void scan.run(async () => {
      const r = await layouts.extractLayout(store.id, file)
      setLayout(r.layout); setSource('photo'); setDirty(true); setSel(null)
      setNote(r.note ?? (r.layout.tables.length ? `테이블 ${r.layout.tables.length}개를 찾았어요. 위치와 좌석 수를 확인해 주세요.` : null))
    })
  }

  const doSave = (publish: boolean) => save.run(async () => {
    if (!layout) return
    if (publish && summary?.overlaps.length && !confirm('겹친 테이블이 있어요. 그대로 게시할까요?')) return
    const r = await layouts.saveStoreLayout(store.id, layout, { publish, source })
    info.setData(r)
    setLayout((r.draft ?? r.published)!.layout)
    setDirty(false)
    setNote(publish ? '게시했어요. 손님 예약 화면에 이 배치도가 보여요.' : '임시 저장했어요. 게시하기 전까지 손님에게는 보이지 않아요.')
  })

  if (info.loading && !info.data) return <Page title="좌석 배치도" back><Loading /></Page>
  if (info.error) return <Page title="좌석 배치도" back><ErrorBox message={info.error.message} onRetry={info.reload} /></Page>

  const pub = info.data?.published
  const draft = info.data?.draft
  const photoInput = (labelText: string) => (
    <Field label={labelText} hint="평면도, 손으로 그린 배치, 홀 전체가 보이는 사진 모두 돼요. 사진은 저장하지 않아요">
      <input type="file" accept="image/*" disabled={scan.busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = '' }} />
    </Field>
  )

  return (
    <Page title="좌석 배치도" back={paths.ownerHome}>
      <div className="btn-row">
        {pub ? <Badge tone="success">게시됨 {pub.published_at ? formatDateTime(pub.published_at) : ''}</Badge> : <Badge tone="muted">아직 게시 안 함</Badge>}
        {(dirty || draft?.unpublished_changes) && <Badge tone="warning">게시하지 않은 변경 있음</Badge>}
      </div>
      {scan.busy && <p className="muted" role="status">배치를 읽는 중이에요 (20초 정도)</p>}
      {scan.error && <p className="inline-error" role="alert">{scan.error}</p>}
      {note && <p className="strong" role="status">{note}</p>}

      {!layout ? (
        <Empty action={
          <div className="form">
            {photoInput('사진으로 만들기')}
            <Button variant="secondary" onClick={() => { setLayout(EMPTY); setSource('manual'); setDirty(true) }}>직접 그리기</Button>
          </div>
        }>좌석 배치도를 올리면 단체가 예약할 때 자리를 미리 볼 수 있어요.</Empty>
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
              <Field label="이름 (선택)"><Input value={fixture.label ?? ''} maxLength={10} onChange={(e) => patchFixture(fixture.id, { label: e.target.value || null })} /></Field>
              <div className="btn-row">
                <Field label="가로"><Input type="number" min={3} max={100} value={fixture.w} style={{ width: 90 }} onChange={(e) => patchFixture(fixture.id, { w: Number(e.target.value) || 3 })} /></Field>
                <Field label="세로"><Input type="number" min={3} max={layout.height} value={fixture.h} style={{ width: 90 }} onChange={(e) => patchFixture(fixture.id, { h: Number(e.target.value) || 3 })} /></Field>
              </div>
              <Button variant="danger" onClick={remove}>이 시설 삭제</Button>
            </Section>
          )}

          <Section title="추가·설정">
            <div className="btn-row">
              <Button variant="secondary" onClick={addTable}>테이블 추가</Button>
              <Select value={fixtureKind} onChange={(e) => setFixtureKind(e.target.value as FixtureKind)} aria-label="추가할 시설 종류"
                options={FIXTURE_KINDS.map((k) => ({ value: k, label: FIXTURE_LABEL[k] }))} style={{ maxWidth: 140 }} />
              <Button variant="secondary" onClick={addFixture}>시설 추가</Button>
            </div>
            <Field label="배치도 세로 길이" hint={`가로를 100으로 볼 때 (${MIN_HEIGHT}~${MAX_HEIGHT})`}>
              <Input type="number" min={MIN_HEIGHT} max={MAX_HEIGHT} value={layout.height} style={{ width: 110 }} onChange={(e) => setHeight(Number(e.target.value))} />
            </Field>
            {photoInput('사진으로 다시 인식')}
          </Section>
        </>
      )}

      <Section title={`손님 제안${info.data?.pending_suggestions ? ` · 대기 ${info.data.pending_suggestions}건` : ''}`}>
        {sugg.loading ? <Loading /> : !sugg.data?.length ? <p className="muted">아직 제안이 없어요</p> : (
          <ul className="list">
            {sugg.data.map((s) => (
              <li key={s.id} className="card">
                <div className="card-top">
                  <span className="muted">{s.suggester_name} · {formatDateTime(s.created_at)}</span>
                  <Badge tone={s.status === 'pending' ? 'warning' : s.status === 'accepted' ? 'success' : 'muted'}>
                    {s.status === 'pending' ? '확인 필요' : s.status === 'accepted' ? '반영하기로 함' : '그대로 둠'}
                  </Badge>
                </div>
                <p>{s.note}</p>
                {s.status === 'pending' && (
                  <div className="btn-row">
                    <Button variant="secondary" busy={respond.busy} onClick={() => void respond.run(async () => { await layouts.respondLayoutSuggestion(s.id, true); await Promise.all([sugg.reload(), info.reload()]) })}>반영할게요</Button>
                    <Button variant="text" busy={respond.busy} onClick={() => void respond.run(async () => { await layouts.respondLayoutSuggestion(s.id, false); await Promise.all([sugg.reload(), info.reload()]) })}>그대로 둘게요</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {respond.error && <p className="inline-error">{respond.error}</p>}
        <p className="muted">"반영할게요"는 제안한 손님에게 알림만 보내요. 배치도는 위에서 직접 고쳐 게시해야 바뀌어요.</p>
      </Section>

      {layout && (
        <BottomAction hint={save.error}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8 }}>
            <Button variant="secondary" busy={save.busy} onClick={() => void doSave(false)} disabled={!dirty}>임시 저장</Button>
            <Button variant="primary" busy={save.busy} onClick={() => void doSave(true)} disabled={!layout.tables.length || (!dirty && !draft?.unpublished_changes && Boolean(pub))}>
            {pub ? '변경 내용 게시하기' : '게시하기'}
            </Button>
          </div>
        </BottomAction>
      )}
    </Page>
  )
}
