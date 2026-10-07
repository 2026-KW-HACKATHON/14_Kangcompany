// G-03 요청 진행 / 수락 결과 (시안 10): 응답 대기(카운트다운) → 먼저 수락한 가게 → 예약 상세 / 만료 → 다시 요청
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { requests } from '../../api'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Art } from '../../components/icons'
import { Badge, Button, Countdown, Dock, ErrorBox, Loading, Rows, Sheet, SuccessHero } from '../../components/ui'
import { effectiveRequestStatus, eventLabel, noteBody } from '../../lib/status'
import { dateLabel, formatWon, timeLabel } from '../../lib/format'

export default function RequestDetail() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const q = useAsync(async () => {
    const [req, res, declined] = await Promise.all([requests.getRequest(id), requests.getReservationForRequest(id), requests.countDeclined(id)])
    return { req, res, declined }
  }, [id])
  const act = useAction()
  const [ask, setAsk] = useState(false)

  if (q.loading) return <Page title="요청 진행"><Loading /></Page>
  if (q.error || !q.data) return <Page title="요청 진행"><ErrorBox message={q.error?.message ?? '요청을 찾을 수 없어요'} onRetry={q.reload} /></Page>
  const { req, res, declined } = q.data
  const s = effectiveRequestStatus(req)
  const accepted = s === 'confirmed' && res

  const dock = accepted ? <Dock><Button variant="primary" onClick={() => nav(paths.groupReservation(res.id))}>예약 상세 보기</Button></Dock>
    : s === 'expired' ? <Dock><Button variant="primary" onClick={() => nav(paths.groupRequestNew, { state: { from: req } })}>조건 바꿔 다시 요청</Button></Dock>
    : <Dock><Button variant="primary" onClick={() => nav(paths.groupReservations)}>내 예약 목록 보기</Button></Dock>

  return (
    <Page title="요청 진행" back={paths.groupReservations} dock={dock}
      overlay={
        <Sheet open={ask} danger title="이 요청을 취소할까요?" confirmLabel="요청 취소하기" busy={act.busy} onClose={() => setAsk(false)}
          onConfirm={() => void act.run(async () => { await requests.cancelRequest(id); setAsk(false); await q.reload() })}>
          <p className="subtitle">요청을 받은 가게들에 취소가 알려져요.</p>
          {act.error && <p className="note-error">{act.error}</p>}
        </Sheet>
      }>
      <SuccessHero art={accepted ? 'store' : s === 'open' ? 'send' : 'calendar'}
        title={accepted ? '가게가 요청을 수락했어요.' : s === 'expired' ? '응답 기한이 지났어요.' : s === 'cancelled' ? '취소한 요청이에요.' : '가게의 응답을 기다리고 있어요.'}>
        {accepted ? <>먼저 수락한 한 곳과 예약을 진행해요.<br />{res.deposit_amount > 0 ? '예약금을 결제하면 확정돼요.' : '결제 없이 확정할 수 있어요.'}</>
          : s === 'expired' ? '조건을 바꾸어 다시 요청할 수 있어요.'
          : s === 'cancelled' ? '필요하면 새 요청을 보낼 수 있어요.'
          : <>조건을 수용할 수 있는 가게가 확인하고 있어요.<br />응답 결과를 알려드릴게요.</>}
      </SuccessHero>
      <div className="btn-row">
        <Badge tone={accepted ? 'warning' : s === 'open' ? 'neutral' : 'muted'}>{accepted ? (res.deposit_amount > 0 ? '결제 대기' : '확정 대기') : s === 'open' ? '응답 대기' : s === 'expired' ? '만료' : '취소'}</Badge>
        {s === 'open' && <Countdown until={req.response_deadline} />}
      </div>
      <section className="card">
        <Rows rows={[
          ['방문 날짜', dateLabel(req.desired_at)], ['방문 시간', timeLabel(req.desired_at)],
          ['모임 종류', eventLabel(req.event_type, req.note)], ['예상 인원', `${req.headcount}명`], ['1인 예산', formatWon(req.budget_per_person)],
        ]} />
        {noteBody(req.note) && <p className="meta">“{noteBody(req.note)}”</p>}
      </section>
      {accepted ? (
        <div className="hero-row card"><div><h2>{res.stores.name}</h2><p className="meta">예약금 {res.deposit_amount > 0 ? formatWon(res.deposit_amount) : '없음'}</p></div><Art name="store" /></div>
      ) : s === 'open' ? (
        <p className="meta">{declined > 0 ? `${declined}곳이 이번 요청을 넘겼어요. ` : ''}가장 먼저 수락한 가게로 바로 정해져요.</p>
      ) : null}
      {s === 'open' && <Button variant="danger" full onClick={() => setAsk(true)}>이 요청 취소하기</Button>}
    </Page>
  )
}
