// S-06 빈 날짜 관리: 열기 · 내가 연 날짜 목록 · 닫기/다시 열기 (예약된 날짜는 수정 불가)
import { useState } from 'react'
import { slots, stats } from '../../api'
import { useOwnerSession } from '../../app/session'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Section } from '../../components/ui'
import { slotView } from '../../lib/status'
import { formatDateTime, formatWon, localInputToIso } from '../../lib/format'

export default function OwnerSlots() {
  const { store } = useOwnerSession()
  const q = useAsync(async () => {
    const [list, st] = await Promise.all([slots.listMySlots(store.id), stats.getStoreStats(store.id).catch(() => null)])
    return { list, st }
  }, [store.id])
  const [f, setF] = useState({ start: '', hours: '3', capacity: String(store.max_capacity), deposit: '0' })
  const act = useAction()
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const cap = Number(f.capacity)
  const valid = f.start && Number(f.hours) > 0 && cap > 0 && cap <= store.max_capacity && Number(f.deposit) >= 0

  const open = () => act.run(async () => {
    const start = new Date(localInputToIso(f.start))
    const end = new Date(start.getTime() + Number(f.hours) * 3600e3)
    await slots.openSlot({ store_id: store.id, start_at: start.toISOString(), end_at: end.toISOString(), capacity: cap, deposit_amount: Number(f.deposit) })
    setF({ ...f, start: '' })
    await q.reload()
  })
  // 한산한 요일 힌트: 최근 예약이 가장 적은 요일
  const quiet = q.data?.st?.by_weekday?.slice().sort((a, b) => a.reservations - b.reservations).slice(0, 2).map((d) => d.label).join('·')

  return (
    <Page title="빈 날짜 관리" back>
      <Section title="날짜 열기">
        {quiet && <p className="muted">최근 예약이 적은 요일: {quiet}</p>}
        <form className="form" onSubmit={(e) => { e.preventDefault(); void open() }}>
          <Field label="시작"><Input type="datetime-local" value={f.start} onChange={set('start')} required /></Field>
          <Field label="이용 시간 (시간)"><Input type="number" min={1} max={12} value={f.hours} onChange={set('hours')} /></Field>
          <Field label="받을 인원" hint={`최대 ${store.max_capacity}명`}><Input type="number" min={1} max={store.max_capacity} value={f.capacity} onChange={set('capacity')} /></Field>
          <Field label="예약금 (원)" error={act.error}><Input type="number" min={0} step={1000} value={f.deposit} onChange={set('deposit')} /></Field>
          <Button variant="secondary" type="submit" busy={act.busy} disabled={!valid}>이 날짜 열기</Button>
        </form>
      </Section>
      <Section title="내가 연 날짜">
        {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error.message} onRetry={q.reload} /> : !q.data!.list.length ? <Empty>연 날짜가 없어요</Empty> : (
          <ul className="list">
            {q.data!.list.map((s) => {
              const v = slotView(s.status, 'owner')
              return (
                <Card as="li" key={s.id}>
                  <div className="card-top"><span className="strong">{formatDateTime(s.start_at)}</span><Badge tone={v.tone}>{v.label}</Badge></div>
                  <span className="muted">{s.capacity}명 · 예약금 {s.deposit_amount > 0 ? formatWon(s.deposit_amount) : '없음'}</span>
                  {s.status !== 'booked' && new Date(s.start_at) > new Date() && (
                    <Button variant="text" busy={act.busy} onClick={() => void act.run(async () => { await slots.setSlotClosed(s.id, s.status === 'open'); await q.reload() })}>
                      {s.status === 'open' ? '닫기' : '다시 열기'}
                    </Button>
                  )}
                </Card>
              )
            })}
          </ul>
        )}
      </Section>
    </Page>
  )
}
