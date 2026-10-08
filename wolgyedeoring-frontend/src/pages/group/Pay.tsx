// G-09 예약금 결제 (시안 14) → 토스 결제창 → /pay/success|fail (G-10). 0원이면 바로 확정
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { payments, reservations } from '../../api'
import { paths } from '../../app/paths'
import { useGroupSession } from '../../app/session'
import { useAction, useAsync } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Button, Dock, Empty, ErrorBox, Loading, Notice, OptionGrid, Row, Rows, Section, Sheet } from '../../components/ui'
import { dateLabel, formatWon, timeLabel } from '../../lib/format'
import { eventLabel } from '../../lib/status'

const HAS_TOSS = Boolean(import.meta.env.VITE_TOSS_CLIENT_KEY)

export default function Pay() {
  const id = Number(useParams().id)
  const { me } = useGroupSession()
  const nav = useNavigate()
  const q = useAsync(async () => ({ r: await reservations.getReservation(id), act: await reservations.getActions(id) }), [id])
  const act = useAction()
  const [method, setMethod] = useState<'card' | 'bank'>('card')
  const [policy, setPolicy] = useState(false)
  if (q.loading) return <Page title="예약금 결제"><Loading /></Page>
  if (q.error || !q.data) return <Page title="예약금 결제"><ErrorBox message={q.error?.message ?? '불러오지 못했어요'} /></Page>
  const { r, act: flags } = q.data
  if (!flags.can_pay) return <Page title="예약금 결제"><Empty art="check" title="지금은 결제할 수 없어요.">이미 결제했거나 결제할 수 없는 상태의 예약이에요.</Empty></Page>

  const zero = flags.pay_method === 'zero'
  const pay = () => act.run(async () => {
    if (zero) { await payments.confirmZeroDeposit(id); nav(`${paths.paySuccess}?reservation=${id}&zero=1`, { replace: true }); return }
    if (HAS_TOSS) { await payments.startDepositPayment(id, me.id, method); return }
    await payments.payDepositTest(id) // 토스 키가 없는 환경: 시연용 결제
    nav(`${paths.paySuccess}?reservation=${id}&test=1`, { replace: true })
  })
  const label = zero ? '예약 확정하기' : HAS_TOSS ? `${formatWon(r.deposit_amount)} 결제하기` : `${formatWon(r.deposit_amount)} 시연용 결제`

  return (
    <Page title={zero ? '예약 확정' : '예약금 결제'}
      dock={<Dock>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" busy={act.busy} onClick={() => void pay()}>{label}</Button></Dock>}
      overlay={<Sheet open={policy} title="취소 규정" onClose={() => setPolicy(false)}><p className="subtitle">취소·환불 기준은 팀 결정 대기 중이에요. 앱에서 예약을 취소하면 결제한 예약금의 환불을 요청해요.</p></Sheet>}>
      <section>
        <p className="meta">예약을 확정할 마지막 단계</p>
        <p className="big" style={{ marginTop: 8 }}>{zero ? '0원' : formatWon(r.deposit_amount)}</p>
        <p className="subtitle">{r.stores.name} · {eventLabel(r.event_type, r.requests?.note)}</p>
      </section>
      <section className="card">
        <Rows rows={[['방문 날짜', dateLabel(r.start_at)], ['방문 시간', timeLabel(r.start_at)], ['모임 종류', eventLabel(r.event_type, r.requests?.note)], ['예상 인원', `${r.headcount}명`], ...(r.budget_per_person ? [['1인 예산', formatWon(r.budget_per_person)] as [string, string]] : [])]} />
        <Row label="예약금" value={zero ? '없음' : formatWon(r.deposit_amount)} />
        <Row label="결제 상태" value="미결제" />
      </section>
      {!zero && (
        <Section title="결제 방법">
          <OptionGrid value={method} onChange={setMethod} options={[{ value: 'card', label: '신용·체크카드' }, { value: 'bank', label: '계좌이체' }]} />
          <p className="meta">{HAS_TOSS ? '선택한 결제 수단으로 토스페이먼츠 결제창이 열려요.' : '테스트 환경이라 실제 결제 없이 시연용으로 처리돼요.'}</p>
        </Section>
      )}
      <Section title="결제 전 확인">
        <p className="subtitle">{zero ? '예약금 없이 바로 확정돼요.' : '예약금을 결제하면 예약이 확정돼요. 잔금은 행사 당일 가게에서 결제해요.'}</p>
        <Button variant="text" full className="policy" onClick={() => setPolicy(true)}>취소 규정 보기</Button>
        <Notice>취소·환불 기준은 팀 결정 대기 중이에요.</Notice>
      </Section>
    </Page>
  )
}
