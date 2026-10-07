// G-03 요청 진행 상태: 응답 대기(카운트다운) → 가게 확정 → 예약 상세 / 만료 → 다시 요청
import { useNavigate, useParams } from 'react-router-dom'
import { requests } from '../../api'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Badge, BottomAction, Button, Countdown, ErrorBox, Loading, Rows, Section } from '../../components/ui'
import { EVENT_LABEL, REQUEST_STATUS, effectiveRequestStatus } from '../../lib/status'
import { formatDateTime, formatWon } from '../../lib/format'

export default function RequestDetail() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const q = useAsync(async () => {
    const [req, res, declined] = await Promise.all([requests.getRequest(id), requests.getReservationForRequest(id), requests.countDeclined(id)])
    return { req, res, declined }
  }, [id])
  const act = useAction()

  if (q.loading) return <Page title="요청" back><Loading /></Page>
  if (q.error || !q.data) return <Page title="요청" back><ErrorBox message={q.error?.message ?? '요청을 찾을 수 없어요'} onRetry={q.reload} /></Page>
  const { req, res, declined } = q.data
  const s = effectiveRequestStatus(req)
  const st = REQUEST_STATUS[s]

  return (
    <Page title={`${EVENT_LABEL[req.event_type]} 요청`} back={paths.groupReservations}>
      <div className="btn-row"><Badge tone={st.tone}>{st.label}</Badge>{s === 'open' && <Countdown until={req.response_deadline} />}</div>
      <Rows rows={[
        ['일시', formatDateTime(req.desired_at)], ['인원', `${req.headcount}명`],
        ['1인 예산', formatWon(req.budget_per_person)], ['예상 총액', formatWon(req.headcount * req.budget_per_person)],
        ...(req.note ? [['요청 사항', req.note] as [string, string]] : []),
      ]} />

      {s === 'open' && (
        <Section>
          <p>가게의 수락을 기다리고 있어요. 가장 먼저 수락한 가게로 바로 정해져요.</p>
          {declined > 0 && <p className="muted">{declined}곳이 거절했어요</p>}
          <Button variant="danger" busy={act.busy} onClick={() => {
            if (confirm('요청을 취소할까요? 가게들에 취소가 알려져요.')) void act.run(async () => { await requests.cancelRequest(id); await q.reload() })
          }}>요청 취소</Button>
          {act.error && <p className="inline-error">{act.error}</p>}
        </Section>
      )}
      {s === 'confirmed' && res && (
        <BottomAction hint={`${res.stores.name}이(가) 수락했어요. 예약금을 결제하면 확정돼요`}>
          <Button variant="primary" onClick={() => nav(paths.groupReservation(res.id))}>예약 상세 보기</Button>
        </BottomAction>
      )}
      {s === 'expired' && (
        <BottomAction hint="응답 기한 안에 수락한 가게가 없었어요">
          <Button variant="primary" onClick={() => nav(paths.groupRequestNew, { state: { from: req } })}>조건 바꿔 다시 요청하기</Button>
        </BottomAction>
      )}
      {s === 'cancelled' && <p className="muted">취소한 요청이에요.</p>}
    </Page>
  )
}
