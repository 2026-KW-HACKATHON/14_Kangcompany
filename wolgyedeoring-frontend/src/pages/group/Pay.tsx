// G-09 예약금 결제 → 토스 결제창 → /pay/success|fail (G-10). 0원이면 바로 확정
import { useNavigate, useParams } from 'react-router-dom'
import { payments, reservations } from '../../api'
import { paths } from '../../app/paths'
import { useGroupSession } from '../../app/session'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { BottomAction, Button, ErrorBox, Loading, Rows } from '../../components/ui'
import { formatDateTime, formatWon } from '../../lib/format'

const HAS_TOSS = Boolean(import.meta.env.VITE_TOSS_CLIENT_KEY)

export default function Pay() {
  const id = Number(useParams().id)
  const { me } = useGroupSession()
  const nav = useNavigate()
  const q = useAsync(async () => ({ r: await reservations.getReservation(id), act: await reservations.getActions(id) }), [id])
  const act = useAction()
  if (q.loading) return <Page title="결제" back><Loading /></Page>
  if (q.error || !q.data) return <Page title="결제" back><ErrorBox message={q.error?.message ?? '불러오지 못했어요'} /></Page>
  const { r, act: flags } = q.data
  if (!flags.can_pay) return <Page title="결제" back><p>지금은 결제할 수 없는 예약이에요.</p></Page>

  const zero = flags.pay_method === 'zero'
  return (
    <Page title={zero ? '예약 확정' : '예약금 결제'} back>
      <Rows rows={[['가게', r.stores.name], ['일시', formatDateTime(r.start_at)], ['인원', `${r.headcount}명`], ['예약금', zero ? '없음' : formatWon(r.deposit_amount)]]} />
      <p className="muted">잔금은 행사 당일 가게에서 결제해요.</p>
      <p className="muted">취소·환불 규정 (#6 B-08 결정 대기 — 문구 자리)</p>
      {act.error && <p className="inline-error" role="alert">{act.error}</p>}
      <BottomAction>
        {zero ? (
          <Button variant="primary" busy={act.busy} onClick={() => void act.run(async () => { await payments.confirmZeroDeposit(id); nav(paths.groupReservation(id), { replace: true }) })}>예약 확정하기</Button>
        ) : HAS_TOSS ? (
          <Button variant="primary" busy={act.busy} onClick={() => void act.run(() => payments.startDepositPayment(id, me.id))}>{formatWon(r.deposit_amount)} 결제하기</Button>
        ) : (
          // 토스 키가 없는 개발 환경: 시연용 결제 (실서비스 전 제거)
          <Button variant="primary" busy={act.busy} onClick={() => void act.run(async () => { await payments.payDepositTest(id); nav(paths.groupReservation(id), { replace: true }) })}>시연용 결제 (토스 키 없음)</Button>
        )}
      </BottomAction>
    </Page>
  )
}
