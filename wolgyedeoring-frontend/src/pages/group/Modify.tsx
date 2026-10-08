// G-08 조건 수정 요청 (시안 12): 결제 전 1회, 행사 24시간 전까지
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { reservations } from '../../api'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Button, Dock, ErrorBox, Field, Input, Loading, Notice, Rows, Section, Textarea } from '../../components/ui'
import { DatePicker, TimePicker } from '../../components/pickers'
import { dateLabel, formatWon, kstDay, timeLabel } from '../../lib/format'
import { eventLabel } from '../../lib/status'
import { integerInRange } from '../../lib/validation'

export default function Modify() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const q = useAsync(() => reservations.getReservation(id), [id])
  const [f, setF] = useState<{ day: string; time: string; headcount: string; note: string } | null>(null)
  const act = useAction()
  if (q.loading) return <Page title="조건 수정 요청"><Loading /></Page>
  if (q.error || !q.data) return <Page title="조건 수정 요청"><ErrorBox message={q.error?.message ?? '불러오지 못했어요'} /></Page>
  const r = q.data
  const startHm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(r.start_at))
  const v = f ?? { day: kstDay(r.start_at), time: startHm, headcount: String(r.headcount), note: '' }
  const set = (p: Partial<typeof v>) => setF({ ...v, ...p })
  const canChangeDate = r.source === 'request'
  const dateChanged = canChangeDate && (v.day !== kstDay(r.start_at) || v.time !== startHm)
  const hc = Number(v.headcount)
  const hcChanged = hc !== r.headcount
  const valid = (dateChanged || hcChanged) && integerInRange(v.headcount, 1, 200)
    && (!dateChanged || Date.parse(`${v.day}T${v.time}:00+09:00`) > Date.now())

  const submit = () => act.run(async () => {
    if (!valid) return
    await reservations.requestModification(id, {
      startAt: dateChanged ? `${v.day}T${v.time}:00+09:00` : undefined,
      headcount: hcChanged ? hc : undefined, note: v.note.trim() || undefined,
    })
    nav(paths.groupReservation(id), { replace: true })
  })

  return (
    <Page title="조건 수정 요청" dock={<Dock>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" busy={act.busy} disabled={!valid} onClick={() => void submit()}>수정 요청 보내기</Button></Dock>}>
      <Notice>가게의 응답을 받은 뒤 결제할 수 있어요. 조건 수정은 행사 24시간 전까지 1회 요청할 수 있어요.</Notice>
      <section className="card">
        <h2>현재 조건</h2>
        <Rows rows={[
          ['방문 날짜', dateLabel(r.start_at)], ['방문 시간', timeLabel(r.start_at)], ['모임 종류', eventLabel(r.event_type, r.requests?.note)],
          ['예상 인원', `${r.headcount}명`], ['1인 예산', r.budget_per_person ? formatWon(r.budget_per_person) : '-'],
        ]} />
      </section>
      <Section title="변경할 조건">
        {canChangeDate ? (
          <>
            <div className="field">
              <span className="field-label">희망 날짜</span>
              <DatePicker title="희망 날짜" value={v.day} onChange={(day) => set({ day })} />
            </div>
            <div className="field">
              <span className="field-label">희망 시간</span>
              <TimePicker title="희망 시간" value={v.time} onChange={(time) => set({ time })} />
            </div>
          </>
        ) : <p className="meta">가게가 연 날짜로 잡은 예약은 인원만 바꿀 수 있어요.</p>}
        <Field label="예상 인원"><Input type="number" inputMode="numeric" min={1} max={200} value={v.headcount} onChange={(e) => set({ headcount: e.target.value })} /></Field>
        <Field label="가게에 전할 요청"><Textarea value={v.note} maxLength={200} onChange={(e) => set({ note: e.target.value })} placeholder="바꾸려는 이유를 간단히 알려주세요." /></Field>
      </Section>
      <p className="meta">이미 한 번 요청했거나 수정 기한이 지난 경우에는 변경할 수 없어요.</p>
    </Page>
  )
}
