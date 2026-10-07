// S-03 받은 요청 (시안 22 · 승인 A2): 날짜·조건 → 단체 메모 → 예약금 입력 → 수락(즉시 결제 대기) / 거절
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { requests } from '../../api'
import { paths } from '../../app/paths'
import { useOwnerSession } from '../../app/session'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Icon } from '../../components/icons'
import { Badge, Button, Countdown, Empty, ErrorBox, Loading, Rows, Sheet } from '../../components/ui'
import { GROUP_TYPE_LABEL, eventLabel, myResponseView, noteBody } from '../../lib/status'
import { dateLabel, formatWon, timeLabel } from '../../lib/format'
import { toApiError } from '../../lib/errors'

const PRESETS = [0, 50000, 100000, 150000]

export default function OwnerRequestDetail() {
  const id = Number(useParams().id)
  const { store } = useOwnerSession()
  const nav = useNavigate()
  const q = useAsync(async () => (await requests.listOpenRequestsForStore(store.id)).find((r) => r.request_id === id) ?? null, [id, store.id])
  const [deposit, setDeposit] = useState('50000')
  const [sheet, setSheet] = useState<'accept' | 'decline' | null>(null)
  const act = useAction()

  if (q.loading) return <Page title="받은 요청" a2 kind="owner"><Loading /></Page>
  if (q.error) return <Page title="받은 요청" a2 kind="owner"><ErrorBox message={q.error.message} onRetry={q.reload} /></Page>
  const r = q.data
  if (!r) return (
    <Page title="받은 요청" back={paths.ownerInbox}>
      <Empty art="calendar" title="마감된 요청이에요." action={<Button onClick={() => nav(paths.ownerInbox)}>동네 요청 목록</Button>}>다른 가게가 먼저 수락했거나 단체가 요청을 취소했어요.</Empty>
    </Page>
  )
  const mine = myResponseView(r.my_response)
  const dep = Number(deposit.replace(/,/g, ''))
  const depositOk = deposit !== '' && Number.isInteger(dep) && dep >= 0
  const memo = noteBody(r.note)
  const expired = new Date(r.response_deadline) < new Date()

  const accept = () => act.run(async () => {
    try {
      await requests.acceptRequest(id, store.id, dep)
      const res = await requests.getReservationForRequest(id)
      nav(res ? paths.ownerReservation(res.id) : paths.ownerInboxReservations, { replace: true })
    } catch (e) {
      const err = toApiError(e)
      setSheet(null)
      if (err.kind === 'closed') void q.reload() // 다른 가게가 먼저 수락
      throw e
    }
  })

  return (
    <Page title="받은 요청" a2 kind="owner" back={paths.ownerInbox}
      dock={r.can_accept ? (
        <footer className="dock">
          <button className="primary" type="button" disabled={!depositOk} onClick={() => setSheet('accept')}>수락하기<Icon name="chevron" /></button>
          {r.my_response !== 'declined' && <button type="button" className="text-action quiet-action decline" onClick={() => setSheet('decline')}>이 요청 거절하기</button>}
        </footer>
      ) : undefined}
      overlay={<>
        <Sheet open={sheet === 'accept'} title="이 요청을 수락할까요?" confirmLabel="수락하기" busy={act.busy} onClose={() => setSheet(null)} onConfirm={() => void accept()}>
          <Rows rows={[['방문 일시', `${dateLabel(r.desired_at)} · ${timeLabel(r.desired_at)}`], ['인원', `${r.headcount}명`], ['예약금', dep ? formatWon(dep) : '없음 (결제 없이 확정)']]} />
          <p className="meta">수락하면 이 가게로 예약이 잡혀요. 단체가 예약금을 결제하면 확정돼요.</p>
        </Sheet>
        <Sheet open={sheet === 'decline'} danger title="이 요청을 거절할까요?" confirmLabel="거절하기" busy={act.busy} onClose={() => setSheet(null)}
          onConfirm={() => void act.run(async () => { await requests.declineRequest(id, store.id); nav(paths.ownerInbox, { replace: true }) })}>
          <p className="subtitle">거절해도 다른 가게가 수락할 수 있어요. 단체에게는 거절한 가게 이름이 보이지 않아요.</p>
        </Sheet>
      </>}>
      <div className="owner-editor">
        <section className="owner-date">
          <p className="muted">방문 날짜·시간</p>
          <p className="big-date">{dateLabel(r.desired_at)}</p>
          <p className="big-time">{timeLabel(r.desired_at)}</p>
        </section>
        <section className="owner-conditions">
          <dl className="condition-pair">
            <div><dt>예상 인원</dt><dd>{r.headcount}명</dd></div>
            <div><dt>1인 예산</dt><dd>{formatWon(r.budget_per_person)}</dd></div>
          </dl>
          <dl><div className="amount-row"><dt>예상 총액</dt><dd>{formatWon(r.headcount * r.budget_per_person)}</dd></div></dl>
          <dl><div className="amount-row"><dt>같은 시간 남은 자리</dt><dd>{r.remaining_capacity}석</dd></div></dl>
        </section>
        <div className="owner-heading">
          <Badge tone={r.my_response ? mine.tone : 'neutral'}>{mine.label}</Badge>
          <Countdown until={r.response_deadline} />
        </div>
        <section className="request-message">
          <div className="person">
            <span className="avatar" aria-hidden="true">{r.group_name[0]}</span>
            <div><h3>{r.group_name}</h3><span>{GROUP_TYPE_LABEL[r.group_type]} · {eventLabel(r.event_type, r.note)}</span></div>
          </div>
          {memo ? <blockquote>“{memo}”</blockquote> : <p className="muted">남긴 메모가 없어요.</p>}
        </section>
        {r.can_accept ? (
          <>
            <section className="deposit-area">
              <label className="field-label" htmlFor="deposit">예약금 입력</label>
              <div className="value-field">
                <input id="deposit" type="text" inputMode="numeric" value={deposit ? Number(deposit.replace(/,/g, '')).toLocaleString('ko-KR') : ''}
                  onChange={(e) => setDeposit(e.target.value.replace(/[^0-9]/g, ''))} aria-describedby="owner-accept-note" />
                <span>원</span>
              </div>
              <div className="deposit-presets" role="group" aria-label="예약금 빠른 입력">
                {PRESETS.map((p) => <button key={p} type="button" aria-pressed={dep === p} onClick={() => setDeposit(String(p))}>{p ? `${p / 10000}만 원` : '없음'}</button>)}
              </div>
            </section>
            <p className="confirmation-note" id="owner-accept-note">
              <Icon name="info" />
              <span>수락하면 이 가게로 예약이 잡혀요.<br />{dep ? '단체가 예약금을 결제하면 확정돼요.' : '예약금이 없으면 단체가 결제 없이 확정해요.'}</span>
            </p>
            {act.error && <p className="form-error" role="alert">{act.error}</p>}
          </>
        ) : (
          <p className="confirmation-note"><Icon name="info" /><span>{expired ? '응답 기한이 지났어요.' : `같은 시간대 남은 자리(${r.remaining_capacity}석)가 부족해 수락할 수 없어요.`}</span></p>
        )}
      </div>
    </Page>
  )
}
