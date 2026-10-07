// 손님용 좌석 배치도 보기 (G-05 날짜 예약, G-06 예약 상세). 게시본만 보이고, 없으면 아무것도 그리지 않음
// "배치도 수정 제안": 글로만 사장님께 전달 (공식 배치도는 사장님이 확인·게시해야 바뀜, 명세 7 기준 3)
import { useState } from 'react'
import { layouts } from '../../api'
import { useAction, useAsync } from '../../hooks/useAsync'
import { formatDate } from '../../lib/format'
import { Button, Field, Input, Section } from '../ui'
import { LayoutCanvas, type Selection } from './LayoutCanvas'

export function StoreLayoutView({ storeId, headcount }: { storeId: number; headcount?: number }) {
  const q = useAsync(() => layouts.getStoreLayout(storeId), [storeId])
  const [sel, setSel] = useState<Selection>(null)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)
  const act = useAction()

  const pub = q.data?.published
  if (!pub) return null
  const table = sel?.kind === 'table' ? pub.layout.tables.find((t) => t.id === sel.id) : null

  return (
    <Section title="좌석 배치도">
      <p className="muted">
        테이블 {pub.table_count}개 · {pub.total_seats}석{pub.published_at ? ` · ${formatDate(pub.published_at)} 사장님 게시` : ''}
        {headcount && headcount > pub.total_seats ? ` · 예약 인원(${headcount}명)이 좌석보다 많아요` : ''}
      </p>
      <LayoutCanvas layout={pub.layout} selected={sel} onSelect={setSel} maxHeightPx={360} />
      {table && <p>{table.label} · {table.seats}석{table.shape === 'round' ? ' · 원형' : ''}</p>}

      {!q.data?.is_owner && (
        sent ? <p className="muted">사장님께 전달했어요. 사장님이 확인하면 알림이 와요.</p>
          : open ? (
            <form className="form" onSubmit={(e) => { e.preventDefault(); void act.run(async () => { await layouts.suggestLayoutChange(storeId, note.trim()); setSent(true) }) }}>
              <Field label="실제와 다른 점" hint="배치도는 사장님이 확인한 뒤에 바뀌어요" error={act.error}>
                <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="예: 창가 4인석이 2인석 두 개로 나뉘어 있어요" />
              </Field>
              <div className="btn-row">
                <Button variant="secondary" type="submit" busy={act.busy} disabled={!note.trim()}>제안 보내기</Button>
                <Button variant="text" type="button" onClick={() => setOpen(false)}>닫기</Button>
              </div>
            </form>
          ) : <Button variant="text" onClick={() => setOpen(true)}>배치도가 실제와 달라요</Button>
      )}
    </Section>
  )
}
