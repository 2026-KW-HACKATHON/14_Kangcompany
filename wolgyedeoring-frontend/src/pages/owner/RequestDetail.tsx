// S-03 요청 상세·수락/거절. 수락 = 즉시 확정(결제 대기). 수락·거절 버튼은 붙여 두지 않는다 (components.md)
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { requests } from '../../api'
import { paths } from '../../app/paths'
import { useOwnerSession } from '../../app/session'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Badge, BottomAction, Button, Countdown, ErrorBox, Field, Input, Loading, Rows, Toast } from '../../components/ui'
import { EVENT_LABEL, GROUP_TYPE_LABEL, myResponseView } from '../../lib/status'
import { formatDateTime, formatWon } from '../../lib/format'
import { toApiError } from '../../lib/errors'

export default function OwnerRequestDetail() {
  const id = Number(useParams().id)
  const { store } = useOwnerSession()
  const nav = useNavigate()
  const q = useAsync(async () => (await requests.listOpenRequestsForStore(store.id)).find((r) => r.request_id === id) ?? null, [id, store.id])
  const [deposit, setDeposit] = useState('50000')
  const [toast, setToast] = useState<string | null>(null)
  const act = useAction()

  if (q.loading) return <Page title="요청" back><Loading /></Page>
  if (q.error) return <Page title="요청" back><ErrorBox message={q.error.message} onRetry={q.reload} /></Page>
  const r = q.data
  if (!r) return <Page title="요청" back={paths.ownerInbox}><p>마감되었거나 취소된 요청이에요.</p><Button variant="secondary" onClick={() => nav(paths.ownerInbox)}>받은 요청 목록</Button></Page>
  const mine = myResponseView(r.my_response)
  const dep = Number(deposit)
  const depositOk = deposit !== '' && Number.isInteger(dep) && dep >= 0

  const accept = async () => {
    if (!confirm(`수락하면 바로 이 단체와 예약이 정해져요. 예약금 ${formatWon(dep)}로 수락할까요?`)) return
    try {
      await requests.acceptRequest(id, store.id, dep)
      const res = await requests.getReservationForRequest(id)
      nav(res ? paths.ownerReservation(res.id) : paths.ownerInboxReservations, { replace: true })
    } catch (e) {
      const err = toApiError(e)
      setToast(err.message)
      if (err.kind === 'closed') void q.reload() // 다른 가게가 먼저 수락
    }
  }

  return (
    <Page title={`${r.group_name} 요청`} back={paths.ownerInbox}>
      <div className="btn-row"><Badge tone={mine.tone}>{mine.label}</Badge><Countdown until={r.response_deadline} /></div>
      <Rows rows={[
        ['단체', `${r.group_name} (${GROUP_TYPE_LABEL[r.group_type]})`], ['행사', EVENT_LABEL[r.event_type]],
        ['일시', formatDateTime(r.desired_at)], ['인원', `${r.headcount}명`], ['1인 예산', formatWon(r.budget_per_person)],
        ['예상 총액', formatWon(r.headcount * r.budget_per_person)],
        ['같은 시간 잡힌 인원', `${r.committed_headcount}명 (남은 자리 ${r.remaining_capacity}석)`],
        ...(r.note ? [['요청 사항', r.note] as [string, string]] : []),
      ]} />
      {r.can_accept ? (
        <>
          <Field label="예약금 (원)" hint="0원이면 단체가 결제 없이 확정해요"><Input type="number" inputMode="numeric" min={0} step={1000} value={deposit} onChange={(e) => setDeposit(e.target.value)} /></Field>
          {r.my_response !== 'declined' && (
            <Button variant="danger" busy={act.busy} onClick={() => void act.run(async () => { await requests.declineRequest(id, store.id); nav(paths.ownerInbox, { replace: true }) })}>이 요청 거절하기</Button>
          )}
          {act.error && <p className="inline-error">{act.error}</p>}
          <BottomAction hint="수락하면 바로 확정(결제 대기)돼요. 단체가 예약금을 결제하면 최종 확정이에요.">
            <Button variant="primary" disabled={!depositOk} onClick={() => void accept()}>수락하기</Button>
          </BottomAction>
        </>
      ) : <p className="muted">{new Date(r.response_deadline) < new Date() ? '응답 기한이 지났어요' : `같은 시간대 남은 자리(${r.remaining_capacity}석)가 부족해 수락할 수 없어요`}</p>}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Page>
  )
}
