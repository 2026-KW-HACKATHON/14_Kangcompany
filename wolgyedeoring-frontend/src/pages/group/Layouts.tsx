// G-15 가게 좌석 배치도 보기: 가게를 고르면 사장님이 게시한 배치도가 보임 (읽기 전용)
// 진입: 가게 찾기(G-04) 상단 "좌석 배치도", 예약 상세(G-06) "좌석 배치도 보기" (?store=가게 id)
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { layouts } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { LayoutCanvas, type Selection } from '../../components/seat/LayoutCanvas'
import { Empty, ErrorBox, Field, Loading, Select } from '../../components/ui'
import { formatDate } from '../../lib/format'

export default function GroupLayouts() {
  const [params, setParams] = useSearchParams()
  const q = useAsync(() => layouts.listPublishedLayouts(), [])
  const [sel, setSel] = useState<Selection>(null)

  if (q.loading) return <Page title="좌석 배치도" back><Loading /></Page>
  if (q.error) return <Page title="좌석 배치도" back><ErrorBox message={q.error.message} onRetry={q.reload} /></Page>
  const list = q.data ?? []
  if (!list.length) return <Page title="좌석 배치도" back><Empty>아직 좌석 배치도를 올린 가게가 없어요.</Empty></Page>

  const storeId = Number(params.get('store'))
  const current = list.find((l) => l.store_id === storeId) ?? list[0]
  const table = sel?.kind === 'table' ? current.layout.tables.find((t) => t.id === sel.id) : null

  return (
    <Page title="좌석 배치도" back>
      <Field label="가게">
        <Select value={String(current.store_id)} onChange={(e) => { setSel(null); setParams({ store: e.target.value }, { replace: true }) }}
          options={list.map((l) => ({ value: String(l.store_id), label: l.stores.name }))} />
      </Field>
      {!list.some((l) => l.store_id === storeId) && storeId > 0 && (
        <p className="muted">이 가게는 아직 배치도를 올리지 않았어요. 다른 가게 배치도를 보여 드려요.</p>
      )}
      <p className="muted">테이블 {current.table_count}개 · {current.total_seats}석 · {formatDate(current.published_at)} 사장님 게시</p>
      <LayoutCanvas layout={current.layout} selected={sel} onSelect={setSel} label={`${current.stores.name} 좌석 배치도`} />
      <p>{table ? `${table.label} · ${table.seats}석${table.shape === 'round' ? ' · 원형' : ''}` : '테이블을 누르면 좌석 수가 보여요.'}</p>
    </Page>
  )
}
