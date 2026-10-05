// G-13 참석 현황 (실시간) · 장난 응답 삭제 · 마감
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { rsvp } from '../../api'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Badge, BottomAction, Button, Empty, ErrorBox, Loading, Rows, Section } from '../../components/ui'

export default function RsvpResponses() {
  const id = Number(useParams().id)
  const q = useAsync(async () => {
    const rv = await rsvp.getRsvpForReservation(id)
    return { rv, list: rv ? await rsvp.listRsvpResponses(rv.id) : [] }
  }, [id])
  const act = useAction()
  const rsvpId = q.data?.rv?.id
  useEffect(() => (rsvpId ? rsvp.subscribeRsvpResponses(rsvpId, () => void q.reload()) : undefined), [rsvpId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (q.loading && !q.data) return <Page title="참석 현황" back><Loading /></Page>
  if (q.error || !q.data) return <Page title="참석 현황" back><ErrorBox message={q.error?.message ?? '불러오지 못했어요'} /></Page>
  const { rv, list } = q.data
  if (!rv) return <Page title="참석 현황" back><Empty>아직 참석 조사가 없어요</Empty></Page>
  const yes = list.filter((x) => x.attending)
  const no = list.filter((x) => !x.attending)

  return (
    <Page title="참석 현황" back={paths.groupReservation(id)}>
      <Rows rows={[['참석', `${yes.length}명`], ['불참', `${no.length}명`], ['상태', rv.is_closed ? '마감됨' : '응답 받는 중']]} />
      <Section title="응답">
        {!list.length ? <Empty>아직 응답이 없어요. 링크를 공유해 보세요.</Empty> : (
          <ul className="list">
            {list.map((x) => (
              <li key={x.id} className="card">
                <div className="card-top">
                  <span className="strong">{x.name}</span>
                  <Badge tone={x.attending ? 'success' : 'muted'}>{x.attending ? '참석' : '불참'}</Badge>
                </div>
                {x.note && <p className="muted">{x.note}</p>}
                <Button variant="danger" onClick={() => { if (confirm(`${x.name}님의 응답을 지울까요?`)) void act.run(async () => { await rsvp.deleteRsvpResponse(x.id); await q.reload() }) }}>응답 삭제</Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {act.error && <p className="inline-error" role="alert">{act.error}</p>}
      {!rv.is_closed && (
        <BottomAction hint="마감하면 가게에 최종 인원이 알려져요">
          <Button variant="primary" busy={act.busy} onClick={() => void act.run(async () => { await rsvp.closeRsvp(id); await q.reload() })}>참석 조사 마감하기</Button>
        </BottomAction>
      )}
    </Page>
  )
}
