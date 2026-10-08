// G-13 참석 현황 (시안 20, 실시간) · 장난 응답 삭제 · 마감
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { reservations, rsvp } from '../../api'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Badge, Button, Dock, Empty, ErrorBox, Loading, Metric, Metrics, Segmented, Sheet } from '../../components/ui'

type F = 'all' | 'yes' | 'no'
export default function RsvpResponses() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const q = useAsync(async () => {
    const [r, rv] = await Promise.all([reservations.getReservation(id), rsvp.getRsvpForReservation(id)])
    return { r, rv, list: rv ? await rsvp.listRsvpResponses(rv.id) : [] }
  }, [id])
  const act = useAction()
  const [filter, setFilter] = useState<F>('all')
  const [ask, setAsk] = useState<null | { kind: 'close' } | { kind: 'delete'; id: number; name: string }>(null)
  const rsvpId = q.data?.rv?.id
  useEffect(() => (rsvpId ? rsvp.subscribeRsvpResponses(rsvpId, () => void q.reload()) : undefined), [rsvpId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (q.loading && !q.data) return <Page title="참석 현황"><Loading /></Page>
  if (q.error || !q.data) return <Page title="참석 현황"><ErrorBox message={q.error?.message ?? '불러오지 못했어요'} /></Page>
  const { r, rv, list } = q.data
  if (!rv) return <Page title="참석 현황" dock={<Dock><Button variant="primary" onClick={() => nav(paths.groupRsvp(id))}>참석 링크 만들기</Button></Dock>}><Empty art="link" title="아직 참석 조사가 없어요.">링크를 만들어 구성원에게 공유해 보세요.</Empty></Page>
  const yes = list.filter((x) => x.attending)
  const no = list.filter((x) => !x.attending)
  const total = rv.expected_headcount ?? r.headcount
  const closeMessage = yes.length > 0 ? `예약 인원이 ${yes.length}명으로 바뀌고 가게에 알려져요.` : `참석 응답이 0명이어서 기존 예약 인원 ${r.headcount}명을 유지하고 가게에 알려져요. 예약 취소는 예약 상세에서 할 수 있어요.`
  const shown = filter === 'yes' ? yes : filter === 'no' ? no : list

  return (
    <Page title="참석 현황" back={paths.groupReservation(id)}
      dock={<Dock>
        {!rv.is_closed && <p className="meta">{yes.length > 0 ? `마감하면 참석 인원(${yes.length}명)이 예약 인원에 반영되고 가게에 알려져요.` : `참석 응답이 0명이면 마감해도 기존 예약 인원 ${r.headcount}명을 유지해요.`}</p>}
        <div className="btn-pair">
          <Button onClick={() => nav(paths.groupRsvp(id))}>참석 링크 공유</Button>
          {!rv.is_closed ? <Button variant="primary" onClick={() => setAsk({ kind: 'close' })}>마감하기</Button> : <Button variant="primary" disabled>마감됨</Button>}
        </div>
      </Dock>}
      overlay={<Sheet open={Boolean(ask)} danger={ask?.kind === 'delete'} busy={act.busy} onClose={() => setAsk(null)}
        title={ask?.kind === 'delete' ? `${ask.name}님의 응답을 지울까요?` : '참석 조사를 마감할까요?'}
        confirmLabel={ask?.kind === 'delete' ? '응답 삭제' : '마감하기'}
        onConfirm={() => void act.run(async () => {
          if (ask?.kind === 'delete') await rsvp.deleteRsvpResponse(ask.id); else await rsvp.closeRsvp(id)
          setAsk(null); await q.reload()
        })}>
        <p className="subtitle">{ask?.kind === 'delete' ? '장난 응답이나 중복 응답을 정리할 때 사용해요.' : closeMessage}</p>
        {act.error && <p className="note-error">{act.error}</p>}
      </Sheet>}>
      <Metrics three className="attendance-metrics">
        <Metric label="참석" value={yes.length} unit="명" />
        <Metric label="불참" value={no.length} unit="명" />
        <Metric label="미응답" value={Math.max(0, total - list.length)} unit="명" />
      </Metrics>
      <p className="meta">모집 {total}명 · 예약 {r.headcount}명 · 응답 {list.length}명 · {rv.is_closed ? '마감됨' : '응답 받는 중'}</p>
      <Segmented className="attendance-filter" label="참석 응답 상태별 명단" value={filter} onChange={setFilter} options={[{ value: 'all', label: '전체' }, { value: 'yes', label: '참석' }, { value: 'no', label: '불참' }]} />
      {!shown.length ? <Empty art="link">아직 응답이 없어요. 링크를 공유해 보세요.</Empty> : (
        <section>
          {shown.map((x) => (
            <div key={x.id} className="person-row">
              <span className="avatar">{x.name[0]}</span>
              <div><h3>{x.name}</h3><p className="meta">{x.note || '응답 정보'}</p></div>
              <Badge tone={x.attending ? 'success' : 'muted'}>{x.attending ? '참석' : '불참'}</Badge>
              {!rv.is_closed && <Button variant="danger" aria-label={`${x.name} 응답 삭제`} onClick={() => setAsk({ kind: 'delete', id: x.id, name: x.name })}>삭제</Button>}
            </div>
          ))}
        </section>
      )}
    </Page>
  )
}
