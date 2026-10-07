// G-15 좌석 배치도 보기 (시안 37): 게시된 가게를 고르면 배치도 (읽기 전용). ?store=가게 id
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { layouts } from '../../api'
import { paths } from '../../app/paths'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Icon } from '../../components/icons'
import { LayoutCanvas, SeatLegend, SeatMetrics, type Selection } from '../../components/seat/LayoutCanvas'
import { Badge, Button, ErrorBox, Intro, Loading, Sheet } from '../../components/ui'
import { dateLabel } from '../../lib/format'

export default function GroupLayouts() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = useAsync(() => layouts.listPublishedLayouts(), [])
  const [sel, setSel] = useState<Selection>(null)
  const [picker, setPicker] = useState(false)
  const [query, setQuery] = useState('')

  const list = q.data ?? []
  const storeId = Number(params.get('store'))
  const current = list.find((l) => l.store_id === storeId) ?? (storeId > 0 ? null : list[0] ?? null)
  const table = current && sel?.kind === 'table' ? current.layout.tables.find((t) => t.id === sel.id) : null
  const results = list.filter((l) => [l.stores.name, l.stores.address ?? ''].some((t) => t.includes(query.trim())))

  return (
    <Page title="좌석 배치도" nav
      overlay={
        <Sheet open={picker} title="배치도를 볼 가게" onClose={() => setPicker(false)}>
          <input className="seat-search" type="search" placeholder="가게 이름이나 주소" aria-label="가게 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="seat-store-results">
            {results.length ? results.map((l) => (
              <button key={l.store_id} type="button" className="seat-store-button" aria-pressed={l.store_id === current?.store_id}
                onClick={() => { setSel(null); setParams({ store: String(l.store_id) }, { replace: true }); setPicker(false) }}>
                <span className="seat-store-icon"><Icon name="store" /></span>
                <span className="seat-store-copy"><strong>{l.stores.name}</strong><small>{l.stores.address ?? ''} · {l.total_seats}석</small></span>
                <span className="seat-store-state">{l.store_id === current?.store_id ? <Icon name="check" /> : '보기'}</span>
              </button>
            )) : <p className="seat-empty">조건에 맞는 공개 배치도가 없어요.</p>}
          </div>
        </Sheet>
      }>
      <Intro title="함께 앉을 자리를 미리 확인해요" sub="사장님이 게시한 가게 배치도를 볼 수 있어요." />
      {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error.message} onRetry={q.reload} /> : (
        <>
          <div className="field seat-store-field">
            <span className="field-label">가게 선택</span>
            <button type="button" className="seat-store-select" aria-haspopup="dialog" aria-label="배치도를 볼 가게 선택" onClick={() => setPicker(true)}>
              <span className="seat-store-copy"><strong>{current?.stores.name ?? '가게를 선택해 주세요'}</strong><small>{current?.stores.address ?? '공개된 배치도가 있는 가게를 골라요'}</small></span>
              <Icon name="chevron" />
            </button>
          </div>
          <section className="seat-layout-panel">
            <div className="seat-panel-heading">
              <div><h2>{current?.stores.name ?? '가게 선택'}</h2><p className="meta">{current?.stores.address ?? ''}</p></div>
              <Badge tone={current ? 'success' : 'neutral'}>{current ? '사장님 게시' : '배치도 미등록'}</Badge>
            </div>
            {current ? (
              <>
                <SeatMetrics tables={current.table_count} seats={current.total_seats} capacity={current.stores.max_capacity} />
                <LayoutCanvas layout={current.layout} selected={sel} onSelect={setSel} label={`${current.stores.name} 좌석 배치도`} />
                <SeatLegend />
                <div className="seat-table-info" aria-live="polite">
                  {table ? <><strong>{table.label}</strong><span>{table.seats}석 · {table.shape === 'round' ? '원형' : '사각'} 테이블</span></> : '테이블을 누르면 이름과 좌석 수가 보여요.'}
                </div>
                <p className="meta seat-published-date">{dateLabel(current.published_at)} 게시</p>
                <p className="meta seat-disclaimer">좌석 배치를 확인하는 참고 정보예요. 실시간 빈자리나 좌석 지정 정보는 아니에요.</p>
              </>
            ) : (
              <div className="seat-empty-layout"><Icon name="store" /><h3>아직 게시된 배치도가 없어요</h3><p>{list.length ? '다른 가게의 공개 배치도를 확인하거나 가게에 문의해 주세요.' : '아직 좌석 배치도를 올린 가게가 없어요.'}</p></div>
            )}
          </section>
          <div className="seat-bottom-links"><Button onClick={() => nav(paths.groupSlots)}>예약·빈자리 캘린더 보기</Button></div>
        </>
      )}
    </Page>
  )
}
