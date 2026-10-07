// G-06 예약 상세 (시안 11 · 승인 A2): 상태 → 일정 카드 → 금액 → 행사 준비(사전 주문·참석·가게 정보) → 결제
// 보이는 행동은 reservation_actions 플래그로 결정
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { preorder, receipts, reservations, rsvp } from '../../api'
import { paths } from '../../app/paths'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Icon, MiniArt } from '../../components/icons'
import { Badge, Button, ErrorBox, Loading, Sheet } from '../../components/ui'
import { RESERVATION_STATUS, eventLabel, paymentView } from '../../lib/status'
import { dateLabel, dateTimeLabel, formatWon, timeLabel } from '../../lib/format'
import { StoreMap } from '../../components/map/StoreMap'
import { directionsUrl } from '../../components/map/kakao'

const CTRL = { width: '100%', marginTop: 16 } as const
const HERO: Record<string, [string, string]> = {
  awaiting_payment: ['가게가 수락했어요.', '예약금을 결제하면 예약이 확정돼요.'],
  confirmed: ['예약이 확정됐어요.', '참석 인원과 사전 주문을 준비해 보세요.'],
  completed: ['모임이 끝났어요.', '가게가 확인한 소비 기록을 볼 수 있어요.'],
  no_show: ['방문하지 않은 예약이에요.', '가게가 노쇼로 처리했어요.'],
  cancelled: ['취소된 예약이에요.', '결제한 예약금이 있다면 환불 상태를 확인해 주세요.'],
}

export default function GroupReservationDetail() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const q = useAsync(async () => {
    const [r, act, pre, pay, rv] = await Promise.all([
      reservations.getReservation(id), reservations.getActions(id), preorder.getPreorder(id),
      reservations.getLatestPayment(id), rsvp.getRsvpForReservation(id),
    ])
    const contacts = act.can_view_contacts ? await reservations.getContacts(id) : null
    const answers = rv ? await rsvp.listRsvpResponses(rv.id) : []
    // 실제 소비 기록: 사장님이 확정한 영수증만
    const done = (await receipts.listReceiptsForReservation(id)).filter((rc) => rc.status === 'done')
    const spent = await Promise.all(done.map((rc) => receipts.getReceipt(rc.id)))
    return { r, act, pre, pay, rv, answers, contacts, spent }
  }, [id])
  const cancel = useAction()
  const [sheet, setSheet] = useState<'cancel' | 'policy' | null>(null)

  if (q.loading) return <Page title="예약 상세" a2 kind="detail"><Loading /></Page>
  if (q.error || !q.data) return <Page title="예약 상세" a2 kind="detail"><ErrorBox message={q.error?.message ?? '예약을 찾을 수 없어요'} onRetry={q.reload} /></Page>
  const { r, act, pre, pay, rv, answers, contacts, spent } = q.data
  const st = RESERVATION_STATUS[r.status]
  const zero = r.deposit_amount === 0
  const [heroTitle, heroMsg] = HERO[r.status]
  const yes = answers.filter((a) => a.attending).length
  const no = answers.length - yes
  const wait = Math.max(0, r.headcount - yes - no)
  const budgetTotal = r.budget_per_person ? r.budget_per_person * r.headcount : null
  const dir = directionsUrl(r.stores.name, r.stores.lat, r.stores.lng, r.stores.address)

  const primary = act.can_pay ? { label: zero ? '예약 확정하기' : '결제하기', go: () => nav(paths.groupPay(id)) }
    : act.can_rsvp && !rv ? { label: '참석 조사 만들기', go: () => nav(paths.groupRsvp(id)) }
    : rv ? { label: '참석 현황 보기', go: () => nav(paths.groupRsvpResponses(id)) }
    : null

  return (
    <Page title="예약 상세" a2 kind="detail" back={paths.groupReservations}
      dock={
        <footer className="dock">
          <div className="dock-meta">
            <div><span>예약금</span> <strong>{zero ? '없음' : formatWon(r.deposit_amount)}</strong></div>
            <button type="button" className="text-action quiet-action" onClick={() => setSheet('policy')}>취소 규정</button>
          </div>
          {primary && <button className="primary" type="button" onClick={primary.go}>{primary.label}<Icon name="chevron" /></button>}
        </footer>
      }
      overlay={<>
        <Sheet open={sheet === 'policy'} title="취소 규정" onClose={() => setSheet(null)}>
          <p className="subtitle">취소·환불 기준은 팀 결정 대기 중이에요. 결제 전에는 언제든 취소할 수 있고, 결제한 예약금은 앱에서 취소하면 환불을 요청해요.</p>
        </Sheet>
        <Sheet open={sheet === 'cancel'} danger title="예약을 취소할까요?" confirmLabel="예약 취소하기" busy={cancel.busy} onClose={() => setSheet(null)}
          onConfirm={() => void cancel.run(async () => { await reservations.cancelReservation(id, act.cancel_via, '단체 취소'); setSheet(null); await q.reload() })}>
          <p className="subtitle">{act.cancel_via === 'toss' ? '결제한 예약금은 환불돼요. ' : ''}가게에 취소가 알려져요.</p>
          {cancel.error && <p className="note-error">{cancel.error}</p>}
        </Sheet>
      </>}>
      <div className="status-hero">
        <div>
          <Badge tone={st.tone}>{r.status === 'awaiting_payment' && zero ? '확정 대기' : st.label}</Badge>
          <h2>{heroTitle}</h2>
        </div>
        <MiniArt name="card" />
        <p className="status-message">{r.status === 'awaiting_payment' && zero ? '예약금 없이 확정할 수 있어요.' : heroMsg}{r.modify_status === 'pending' ? ' 조건 수정 요청에 대한 가게 응답을 기다리고 있어요.' : ''}</p>
      </div>

      <section className="trip-card">
        <div className="store-heading">
          <div><h3>{r.stores.name}</h3><p className="muted">{eventLabel(r.event_type, r.requests?.note)}</p></div>
          <MiniArt name="store" />
        </div>
        <div className="schedule-main">
          <div className="schedule-copy"><strong>{timeLabel(r.start_at)}</strong><span>{dateLabel(r.start_at)}</span></div>
        </div>
        <dl className="condition-pair">
          <div><dt>예상 인원</dt><dd>{r.headcount}명</dd></div>
          <div><dt>1인 예산</dt><dd>{r.budget_per_person ? formatWon(r.budget_per_person) : '-'}</dd></div>
        </dl>
        <button type="button" className="control seating-detail-button" onClick={() => nav(paths.groupLayouts(r.stores.id))}>좌석 배치도 보기</button>
      </section>

      <section className="money-block">
        <dl><div className="amount-row"><dt>예상 총액</dt><dd>{budgetTotal ? formatWon(budgetTotal) : '-'}</dd></div></dl>
        <div className="deposit-line"><h3>예약금</h3><span className="muted">{zero ? '없음' : paymentView(pay?.status ?? null).label}</span></div>
        {!zero && <div className="deposit-line"><strong className="display-money">{formatWon(r.deposit_amount)}</strong></div>}
      </section>

      <section className="ready-section">
        <h3>행사 준비</h3>
        <details className="disclosure">
          <summary className="prep-summary">
            <div>
              <strong>{pre.items.length ? `사전 주문 ${formatWon(pre.total)}` : '사전 주문 없음'}</strong>
              <p>{pre.items.length ? `${pre.items.slice(0, 2).map((i) => `${i.name} ${i.qty}`).join(' · ')}${pre.items.length > 2 ? ' 외' : ''} · 1인 ${formatWon(pre.per_person)}` : '미리 메뉴를 고르면 가게가 준비해요'}</p>
            </div>
            <Icon name="chevron" />
          </summary>
          <div className="disclosure-content">
            {pre.items.map((i) => <p key={i.name}>{i.name} {i.qty}개 × {formatWon(i.unit_price)}</p>)}
            {pre.items.length > 0 && <p>{pre.over_budget ? '1인 예산을 넘었어요.' : r.budget_per_person ? `1인 예산 ${formatWon(r.budget_per_person)} 안에 있어요.` : ''}</p>}
            {act.preorder_deadline && <p className="muted">{dateTimeLabel(act.preorder_deadline)}까지 바꿀 수 있어요.</p>}
            {act.can_edit_preorder && <button type="button" className="control" style={CTRL} onClick={() => nav(paths.groupPreorder(id))}>{pre.items.length ? '사전 주문 수정하기' : '사전 주문 구성하기'}</button>}
          </div>
        </details>
        {(rv || act.can_rsvp) && (
          <details className="disclosure">
            <summary className="prep-summary">
              <div>
                <strong>{rv ? `${yes}명 참석 · ${r.headcount}명 중` : '참석 조사 전'}</strong>
                <p>{rv ? `불참 ${no}명 · 미응답 ${wait}명${rv.is_closed ? ' · 마감' : ''}` : '링크로 참석 인원을 모아요'}</p>
              </div>
              <Icon name="chevron" />
            </summary>
            <div className="disclosure-content">
              {rv && (
                <>
                  <div className="attendance-dots" aria-hidden="true">
                    {Array.from({ length: Math.min(60, Math.max(r.headcount, yes + no)) }, (_, i) => <i key={i} className={i < yes ? undefined : i < yes + no ? 'absent' : 'wait'} />)}
                  </div>
                  <div className="attendance-labels"><span>참석 {yes}명</span><span>불참 {no}명</span><span>미응답 {wait}명</span></div>
                </>
              )}
              <button type="button" className="control" style={CTRL} onClick={() => nav(rv ? paths.groupRsvpResponses(id) : paths.groupRsvp(id))}>{rv ? '참석 현황 보기' : '참석 조사 만들기'}</button>
              {rv && <button type="button" className="control" style={CTRL} onClick={() => nav(paths.groupRsvp(id))}>참석 링크 공유</button>}
            </div>
          </details>
        )}
        <details className="disclosure">
          <summary className="prep-summary">
            <div><strong>가게 정보</strong><p>{r.stores.address ?? '주소 미등록'}</p></div>
            <Icon name="chevron" />
          </summary>
          <div className="disclosure-content">
            {r.stores.photo_url && <img className="store-photo" src={r.stores.photo_url} alt={`${r.stores.name} 사진`} />}
            {contacts?.store.phone && <p>가게 전화 <a href={`tel:${contacts.store.phone}`}>{contacts.store.phone}</a></p>}
            {contacts?.store.owner_phone && <p>사장님 {contacts.store.owner_name} <a href={`tel:${contacts.store.owner_phone}`}>{contacts.store.owner_phone}</a></p>}
            {!contacts && <p className="muted">연락처는 예약이 잡히면 보여요.</p>}
            {r.stores.lat != null && r.stores.lng != null && <StoreMap height={160} markers={[{ id: r.stores.id, lat: r.stores.lat, lng: r.stores.lng, title: r.stores.name }]} />}
            {dir && <a href={dir} target="_blank" rel="noreferrer">길찾기</a>}
          </div>
        </details>
        {spent.length > 0 && (
          <details className="disclosure" open>
            <summary className="prep-summary">
              <div><strong>실제 소비 {formatWon(spent.reduce((s, rc) => s + (rc.total_amount ?? 0), 0))}</strong><p>가게가 확인한 영수증 기록</p></div>
              <Icon name="chevron" />
            </summary>
            <div className="disclosure-content">
              {spent.map((rc) => (
                <div key={rc.id}>
                  <p className="muted">{rc.receipt_at ? dateTimeLabel(rc.receipt_at) : ''} · 1인당 {rc.total_amount ? formatWon(Math.round(rc.total_amount / r.headcount)) : '-'}</p>
                  {rc.receipt_items.map((it) => <p key={it.id}>{it.menus?.name ?? it.raw_name} × {it.qty ?? '-'} · {formatWon(it.amount)}</p>)}
                </div>
              ))}
              {r.deposit_amount > 0 && <p className="muted">예약금 {formatWon(r.deposit_amount)}은 앱에서 따로 결제했어요.</p>}
              <p className="muted">회계 증빙은 영수증 원본으로 따로 챙겨 주세요.</p>
            </div>
          </details>
        )}
      </section>

      {(act.can_modify || act.can_cancel) && (
        <div className="btn-row">
          {act.can_modify && <Button variant="text" onClick={() => nav(paths.groupModify(id))}>조건 수정 요청</Button>}
          {act.can_cancel && <Button variant="danger" onClick={() => setSheet('cancel')}>예약 취소</Button>}
        </div>
      )}
    </Page>
  )
}
