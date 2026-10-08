// G-12 참석 링크 (시안 18): 만들기 → 링크 복사·공유 → 참석 현황
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { reservations, rsvp } from '../../api'
import { paths } from '../../app/paths'
import { useGroupSession } from '../../app/session'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { DatePicker, TimePicker } from '../../components/pickers'
import { Button, Dock, ErrorBox, Field, Input, Intro, Loading, Metric, Metrics, Row, Textarea } from '../../components/ui'
import { dateTimeLabel, kstDay } from '../../lib/format'
import { eventLabel } from '../../lib/status'

export default function Rsvp() {
  const id = Number(useParams().id)
  const { group } = useGroupSession()
  const nav = useNavigate()
  const q = useAsync(async () => {
    const [r, rv] = await Promise.all([reservations.getReservation(id), rsvp.getRsvpForReservation(id)])
    return { r, rv, list: rv ? await rsvp.listRsvpResponses(rv.id) : [] }
  }, [id])
  const [message, setMessage] = useState('')
  const [deadline, setDeadline] = useState<{ day: string; time: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const act = useAction()
  if (q.loading) return <Page title="참석 링크"><Loading /></Page>
  if (q.error || !q.data) return <Page title="참석 링크"><ErrorBox message={q.error?.message ?? ''} onRetry={q.reload} /></Page>
  const { r, rv, list } = q.data

  const create = () => act.run(async () => {
    await rsvp.createRsvp(id, { message: message.trim() || undefined, deadline: deadline ? `${deadline.day}T${deadline.time}:00+09:00` : undefined })
    await q.reload()
  })
  const copy = async (link: string) => {
    try { await navigator.clipboard.writeText(link); setCopied(true) } catch { /* 복사 불가 */ }
  }
  const share = async (link: string) => {
    if (navigator.share) { try { await navigator.share({ title: `${group.name} 참석 조사`, url: link }) } catch { /* 취소 */ } return }
    await copy(link)
  }
  const head = (
    <>
      <Intro title="한 링크로 참석을 모아요." sub="구성원은 로그인 없이 응답할 수 있어요." art="link" />
      <section className="card">
        <h2>{eventLabel(r.event_type, r.requests?.note)} · {group.name}</h2>
        <Row label="방문 일시" value={dateTimeLabel(r.start_at)} />
        <Row label="장소" value={r.stores.name} />
        {rv && <Row label="응답 마감" value={dateTimeLabel(rv.deadline)} />}
      </section>
    </>
  )

  if (!rv) {
    // 고르지 않으면 서버 기본값(행사 24시간 전). 휠은 그 시각에서 시작
    const before = new Date(new Date(r.start_at).getTime() - 24 * 3600e3)
    const defHm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(before)
    const dl = deadline ?? { day: kstDay(before), time: defHm }
    return (
      <Page title="참석 링크" dock={<Dock>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" busy={act.busy} onClick={() => void create()}>참석 링크 만들기</Button></Dock>}>
        {head}
        <Field label="안내 문구 (선택)" hint="300자 이내"><Textarea value={message} maxLength={300} onChange={(e) => setMessage(e.target.value)} placeholder="예: 금요일 뒤풀이! 참석 여부 알려주세요" /></Field>
        <div className="field">
          <span className="field-label">응답 마감 (선택)</span>
          <div className="condition-grid">
            <DatePicker title="응답 마감 날짜" value={dl.day} onChange={(day) => setDeadline({ ...dl, day })} />
            <TimePicker title="응답 마감 시간" value={dl.time} onChange={(time) => setDeadline({ ...dl, time })} />
          </div>
          <span className="meta">{deadline ? '고른 시각에 응답을 마감해요.' : '고르지 않으면 행사 24시간 전에 마감해요.'}</span>
        </div>
        <p className="meta">참석 인원은 마감할 때 예약 인원에 반영돼요.</p>
      </Page>
    )
  }
  const link = rsvp.rsvpLink(rv.token)
  const yes = list.filter((x) => x.attending).length
  const no = list.length - yes
  return (
    <Page title="참석 링크" back={paths.groupReservation(id)} dock={<Dock><Button variant="primary" onClick={() => nav(paths.groupRsvpResponses(id))}>참석 현황 보기</Button></Dock>}>
      {head}
      <Field label="참석 링크"><Input readOnly value={link} onFocus={(e) => e.target.select()} /></Field>
      <div className="btn-row">
        <Button onClick={() => void copy(link)}>{copied ? '링크를 복사했어요' : '링크 복사'}</Button>
        <Button onClick={() => void share(link)}>공유하기</Button>
      </div>
      {rv.is_closed && <Button variant="text" full busy={act.busy} onClick={() => void create()}>참석 조사 다시 열기</Button>}
      <Button variant="text" full onClick={() => window.open(link, '_blank')}>응답 화면 미리보기</Button>
      <Metrics three className="attendance-metrics">
        <Metric label="참석" value={yes} unit="명" />
        <Metric label="불참" value={no} unit="명" />
        <Metric label="미응답" value={Math.max(0, r.headcount - yes - no)} unit="명" />
      </Metrics>
    </Page>
  )
}
