// G-08 조건 수정 요청 (결제 전 1회, 행사 24시간 전까지). 주체는 #3 결정 대기 — 현재 API 는 단체 요청형
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { reservations } from '../../api'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { BottomAction, Button, ErrorBox, Field, Input, Loading, Rows } from '../../components/ui'
import { formatDateTime, localInputToIso } from '../../lib/format'

export default function Modify() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const q = useAsync(() => reservations.getReservation(id), [id])
  const [f, setF] = useState({ when: '', headcount: '', note: '' })
  const act = useAction()
  if (q.loading) return <Page title="조건 수정" back><Loading /></Page>
  if (q.error || !q.data) return <Page title="조건 수정" back><ErrorBox message={q.error?.message ?? '불러오지 못했어요'} /></Page>
  const r = q.data
  const canChangeDate = r.source === 'request'
  const valid = Boolean(f.when || f.headcount)

  return (
    <Page title="조건 수정 요청" back>
      <Rows rows={[['지금 일시', formatDateTime(r.start_at)], ['지금 인원', `${r.headcount}명`]]} />
      <p className="muted">한 번만 요청할 수 있어요. 가게가 답하기 전에는 결제할 수 없어요.</p>
      <form className="form" onSubmit={(e) => { e.preventDefault(); void act.run(async () => {
        await reservations.requestModification(id, { startAt: f.when ? localInputToIso(f.when) : undefined, headcount: f.headcount ? Number(f.headcount) : undefined, note: f.note || undefined })
        nav(paths.groupReservation(id), { replace: true })
      }) }}>
        {canChangeDate ? <Field label="바꿀 날짜·시간"><Input type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} /></Field>
          : <p className="muted">가게가 연 날짜로 잡은 예약은 인원만 바꿀 수 있어요</p>}
        <Field label="바꿀 인원"><Input type="number" inputMode="numeric" min={1} value={f.headcount} onChange={(e) => setF({ ...f, headcount: e.target.value })} /></Field>
        <Field label="사유 (선택)" error={act.error}><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <BottomAction><Button variant="primary" type="submit" busy={act.busy} disabled={!valid}>수정 요청 보내기</Button></BottomAction>
      </form>
    </Page>
  )
}
