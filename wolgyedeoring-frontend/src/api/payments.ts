// 예약금 결제 (토스페이먼츠, API.md 3장 "공통: 예약금 결제")
import { loadTossPayments } from '@tosspayments/tosspayments-sdk'
import { supabase } from '../lib/supabase'
import { unwrap, unwrapFunction, ApiError } from '../lib/errors'
import type { Reservation } from '../types/db'

const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY as string | undefined

/**
 * 결제창 열기. 성공하면 브라우저가 /pay/success 로 이동하고,
 * 그 페이지에서 confirmPaymentFromUrl() 을 호출한다.
 * actions.pay_method === 'zero' 면 이 함수 대신 confirmZeroDeposit
 */
export async function startDepositPayment(reservationId: number, customerKey: string) {
  if (!TOSS_CLIENT_KEY) throw new ApiError('결제 설정이 없습니다 (VITE_TOSS_CLIENT_KEY)', 'server')
  // 1) 주문 준비: 금액·주문번호는 서버(DB)가 정함. 다시 열면 이전 주문은 자동 무효
  const prep = unwrap(await supabase.rpc('prepare_deposit_payment', { p_reservation_id: reservationId })) as {
    order_id: string; amount: number; order_name: string
  }
  // 2) 토스 결제창 (SDK v2)
  const toss = await loadTossPayments(TOSS_CLIENT_KEY)
  await toss.payment({ customerKey }).requestPayment({
    method: 'CARD',
    amount: { currency: 'KRW', value: prep.amount },
    orderId: prep.order_id,
    orderName: prep.order_name,
    successUrl: `${location.origin}/pay/success?reservation=${reservationId}`,
    failUrl: `${location.origin}/pay/fail?reservation=${reservationId}`,
  })
}

/** /pay/success 페이지에서 호출: 주소의 paymentKey·orderId·amount 를 서버로 보내 승인·확정 */
export async function confirmPaymentFromUrl(search = location.search) {
  const q = new URLSearchParams(search)
  const paymentKey = q.get('paymentKey')
  const orderId = q.get('orderId')
  const amount = Number(q.get('amount'))
  if (!paymentKey || !orderId || !Number.isInteger(amount)) {
    throw new ApiError('결제 정보가 올바르지 않습니다', 'server')
  }
  return unwrapFunction(await supabase.functions.invoke<{
    ok: true; reservation?: Reservation; receipt_url?: string | null; already?: boolean; reservation_id?: number
  }>('toss-payment', { body: { action: 'confirm', paymentKey, orderId, amount } }))
}

/** 예약금 0원 예약 확정 */
export async function confirmZeroDeposit(reservationId: number): Promise<Reservation> {
  return unwrap(await supabase.rpc('confirm_zero_deposit', { p_reservation_id: reservationId })) as Reservation
}

/** 시연용 가짜 결제 (결제 없이 확정). 실서비스에서는 막을 예정 */
export async function payDepositTest(reservationId: number): Promise<Reservation> {
  return unwrap(await supabase.rpc('pay_deposit_test', { p_reservation_id: reservationId })) as Reservation
}
