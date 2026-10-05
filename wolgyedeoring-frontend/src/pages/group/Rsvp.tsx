// G-12 참석 조사 만들기·공유
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { rsvp } from '../../api'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { BottomAction, Button, ErrorBox, Field, Input, Loading, Rows } from '../../components/ui'
import { formatDateTime, localInputToIso } from '../../lib/format'

export default function Rsvp() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const q = useAsync(() => rsvp.getRsvpForReservation(id), [id])
  const [message, setMessage] = useState('')
  const [deadline, setDeadline] = useState('')
  const [copied, setCopied] = useState(false)
  const act = useAction()
  if (q.loading) return <Page title="참석 조사" back><Loading /></Page>
  if (q.error) return <Page title="참석 조사" back><ErrorBox message={q.error.message} onRetry={q.reload} /></Page>
  const existing = q.data

  const create = () => act.run(async () => {
    await rsvp.createRsvp(id, { message: message.trim() || undefined, deadline: deadline ? localInputToIso(deadline) : undefined })
    await q.reload()
  })
  const share = async (link: string) => {
    if (navigator.share) { try { await navigator.share({ title: '참석 조사', url: link }) } catch { /* 취소 */ } return }
    await navigator.clipboard.writeText(link)
    setCopied(true)
  }

  if (existing) {
    const link = rsvp.rsvpLink(existing.token)
    return (
      <Page title="참석 조사" back={paths.groupReservation(id)}>
        <Rows rows={[['마감', formatDateTime(existing.deadline)], ['상태', existing.is_closed ? '마감됨' : '응답 받는 중']]} />
        {existing.message && <p>{existing.message}</p>}
        <p className="muted" style={{ wordBreak: 'break-all' }}>{link}</p>
        <div className="btn-row">
          <Button variant="secondary" onClick={() => void share(link)}>{copied ? '링크를 복사했어요' : '링크 공유하기'}</Button>
          {existing.is_closed && <Button variant="text" busy={act.busy} onClick={() => void create()}>다시 열기</Button>}
        </div>
        <BottomAction><Button variant="primary" onClick={() => nav(paths.groupRsvpResponses(id))}>참석 현황 보기</Button></BottomAction>
      </Page>
    )
  }
  return (
    <Page title="참석 조사 만들기" back>
      <p className="muted">링크를 받은 사람은 로그인 없이 이름과 참석 여부만 답해요. 참석 인원은 예약 인원에 자동으로 반영돼요.</p>
      <form className="form" onSubmit={(e) => { e.preventDefault(); void create() }}>
        <Field label="안내 문구 (선택)" hint="300자 이내"><Input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} placeholder="예: 금요일 뒤풀이! 참석 여부 알려주세요" /></Field>
        <Field label="응답 마감 (선택)" hint="비우면 행사 24시간 전" error={act.error}><Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        <BottomAction><Button variant="primary" type="submit" busy={act.busy}>참석 조사 만들기</Button></BottomAction>
      </form>
    </Page>
  )
}
