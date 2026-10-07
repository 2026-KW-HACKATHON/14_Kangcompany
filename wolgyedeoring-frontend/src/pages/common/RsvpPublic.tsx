// P-01 참석 여부 (시안 19, 로그인 없음, /r/:token)
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { rsvp } from '../../api'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Badge, Button, Dock, Empty, Field, Input, Loading, Notice, OptionGrid, Row, Section, Textarea } from '../../components/ui'
import { dateTimeLabel } from '../../lib/format'
import { rsvpView } from '../../lib/status'
import { directionsUrl } from '../../components/map/kakao'
import type { RsvpRespondResult } from '../../types/db'

export default function RsvpPublic() {
  const { token = '' } = useParams()
  const q = useAsync(() => rsvp.getRsvpPublic(token), [token])
  const [name, setName] = useState('')
  const [attending, setAttending] = useState<'yes' | 'no'>('yes')
  const [note, setNote] = useState('')
  const [result, setResult] = useState<RsvpRespondResult | null>(null)
  const act = useAction()

  if (q.loading) return <Page title="참석 여부" back={false} role="group"><Loading /></Page>
  if (q.error || !q.data) return <Page title="참석 여부" back={false} role="group"><Empty art="link" title="참석 조사를 찾을 수 없어요.">{q.error?.message ?? '링크를 다시 확인해 주세요.'}</Empty></Page>
  const p = q.data
  const view = rsvpView(p)
  const canAnswer = !p.cancelled && p.is_open && !result
  const submit = () => act.run(async () => {
    setResult(await rsvp.respondRsvp(token, name.trim(), attending === 'yes', note.trim() || undefined))
    void q.reload()
  })
  const dir = p.store_address ? directionsUrl(p.store_name, null, null, `${p.store_address} ${p.store_name}`) : null

  return (
    <Page title="참석 여부" back={false} role="group"
      dock={canAnswer ? <Dock>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" busy={act.busy} disabled={!name.trim()} onClick={() => void submit()}>참석 여부 제출</Button></Dock>
        : result ? <Dock><Button variant="primary" onClick={() => setResult(null)}>응답 수정하기</Button></Dock> : undefined}>
      {result && <Notice icon="check">{result.name}님, {result.attending ? '참석' : '불참'}으로 {result.result === 'created' ? '응답했어요' : '바꿨어요'}. 같은 이름으로 다시 응답하면 수정돼요.</Notice>}
      <section className="card">
        <h2>{p.group_name} · {p.event_label}</h2>
        <Row label="일시" value={dateTimeLabel(p.start_at)} />
        <Row label="장소" value={p.store_name} />
        <Row label="응답 마감" value={dateTimeLabel(p.deadline)} />
        <Row label="참석" value={`${p.attending}명${p.full ? ' (정원 마감)' : ''}`} />
        {dir && <a className="text-btn" href={dir} target="_blank" rel="noreferrer">길찾기</a>}
      </section>
      <Badge tone={view.tone}>{view.label}</Badge>
      {p.message && <p className="subtitle">{p.message}</p>}
      {p.cancelled ? <Empty art="calendar" title="취소된 행사예요." /> : !p.is_open ? <Empty art="check" title="응답이 마감되었어요.">최종 {p.attending}명이 참석해요.</Empty> : !result && (
        <>
          <Section title="함께할 수 있나요?">
            <OptionGrid value={attending} onChange={setAttending} options={[{ value: 'yes', label: '참석할게요' }, { value: 'no', label: '이번엔 어려워요' }]} />
          </Section>
          <Field label="이름" hint="같은 이름이 있으면 구분해서 적어 주세요 (예: 김민준B)"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="이름을 알려주세요." /></Field>
          <Field label="전하고 싶은 말 (선택)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} placeholder="알레르기나 미리 전할 내용을 적어주세요." /></Field>
          <p className="meta">응답은 모임 담당자가 인원을 확인하는 데 사용해요.</p>
        </>
      )}
    </Page>
  )
}
