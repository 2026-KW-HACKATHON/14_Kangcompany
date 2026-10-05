// G-04 가게 찾기 (가게가 연 빈 날짜). 지도/목록 전환 — 지도는 #8 지도 서비스 결정 후 연결
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { slots } from '../../api'
import { paths } from '../../app/paths'
import { useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Card, Empty, ErrorBox, Field, Input, Loading, Segmented } from '../../components/ui'
import { formatDateTime, formatWon } from '../../lib/format'

export default function Slots() {
  const nav = useNavigate()
  const [view, setView] = useState<'list' | 'map'>('list')
  const [minCap, setMinCap] = useState('')
  const q = useAsync(() => slots.listOpenSlots({ minCapacity: Number(minCap) || undefined }), [minCap])
  return (
    <Page title="가게 찾기" tabRoot>
      <Segmented value={view} onChange={setView} options={[{ value: 'list', label: '목록' }, { value: 'map', label: '지도' }]} />
      <Field label="인원 (이상)"><Input type="number" inputMode="numeric" min={1} value={minCap} onChange={(e) => setMinCap(e.target.value)} placeholder="예: 20" /></Field>
      {view === 'map' && (
        <div className="map-placeholder">
          지도 자리 — 지도 서비스(#8) 결정 후 연결<br />가게 좌표(lat/lng)는 아래 목록 데이터에 이미 들어 있어요
        </div>
      )}
      {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error.message} onRetry={q.reload} /> :
        !q.data?.length ? <Empty action={<button className="btn btn-secondary" onClick={() => nav(paths.groupRequestNew)}>예약 요청하기</button>}>지금 열린 날짜가 없어요. 원하는 날짜로 요청해 보세요.</Empty> : (
          <ul className="list">
            {q.data.map((s) => (
              <Card as="li" key={s.id} onClick={() => nav(paths.groupSlotBook(s.id))}>
                {s.stores.photo_url && <img className="store-photo" src={s.stores.photo_url} alt="" />}
                <div className="card-top"><span className="strong">{s.stores.name}</span><span className="muted">최대 {s.capacity}명</span></div>
                <p>{formatDateTime(s.start_at)} ~ {formatDateTime(s.end_at).split(' ')[1]}</p>
                {s.stores.intro && <p className="muted">{s.stores.intro}</p>}
                <p className="muted">예약금 {s.deposit_amount > 0 ? formatWon(s.deposit_amount) : '없음'}</p>
              </Card>
            ))}
          </ul>
        )}
    </Page>
  )
}
