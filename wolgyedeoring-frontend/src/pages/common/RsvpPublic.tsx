// P-01 참석 응답 (로그인 없음, /r/:token)
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { rsvp } from '../../api'
import { useAction, useAsync } from '../../hooks/useAsync'
import { BottomAction, Badge, Button, ErrorBox, Field, Input, Loading, Rows, Segmented } from '../../components/ui'
import { formatDateTime } from '../../lib/format'
import { rsvpView } from '../../lib/status'
import type { RsvpRespondResult } from '../../types/db'

export default function RsvpPublic() {
  const { token = '' } = useParams()
  const q = useAsync(() => rsvp.getRsvpPublic(token), [token])
  const [name, setName] = useState('')
  const [attending, setAttending] = useState<'yes' | 'no'>('yes')
  const [note, setNote] = useState('')
  const [result, setResult] = useState<RsvpRespondResult | null>(null)
  const act = useAction()

  if (q.loading) return <Loading />
  if (q.error || !q.data) return <div className="page"><main className="page-body"><ErrorBox message={q.error?.message ?? '참석 조사를 찾을 수 없어요'} /></main></div>
  const p = q.data
  const view = rsvpView(p)

  const submit = () => act.run(async () => {
    const r = await rsvp.respondRsvp(token, name.trim(), attending === 'yes', note.trim() || undefined)
    setResult(r)
    void q.reload()
  })

  return (
    <div className="page">
      <header className="page-header"><h1>{p.group_name} {p.event_label}</h1></header>
      <main className="page-body">
        <Badge tone={view.tone}>{view.label}</Badge>
        {p.message && <p>{p.message}</p>}
        <Rows rows={[
          ['일시', formatDateTime(p.start_at)],
          ['장소', p.store_name],
          ...(p.store_address ? [['주소', p.store_address] as [string, string]] : []),
          ['응답 마감', formatDateTime(p.deadline)],
          ['참석', `${p.attending}명${p.full ? ' (정원 마감)' : ''}`],
        ]} />
        {/* 위치 지도 + 길찾기 링크 자리 (#8 지도 서비스 결정 후) */}

        {p.cancelled ? <p>취소된 행사예요.</p> : !p.is_open ? <p>응답이 마감되었어요. 최종 {p.attending}명</p> :
          result ? (
            <div className="card">
              <p className="strong">{result.name}님, {result.attending ? '참석' : '불참'}으로 {result.result === 'created' ? '응답했어요' : '바꿨어요'}</p>
              <p className="muted">이 기기에서 같은 이름으로 다시 응답하면 수정돼요.</p>
              <Button variant="text" onClick={() => setResult(null)}>응답 바꾸기</Button>
            </div>
          ) : (
            <form className="form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
              <Field label="이름" hint="같은 이름이 있으면 구분해서 적어 주세요 (예: 김민준B)"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required /></Field>
              <Field label="참석 여부"><Segmented value={attending} onChange={setAttending} options={[{ value: 'yes', label: '참석' }, { value: 'no', label: '불참' }]} /></Field>
              <Field label="메모 (선택)" error={act.error}><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} placeholder="예: 30분 늦어요" /></Field>
              <BottomAction><Button variant="primary" type="submit" busy={act.busy} disabled={!name.trim()}>응답 보내기</Button></BottomAction>
            </form>
          )}
      </main>
    </div>
  )
}
