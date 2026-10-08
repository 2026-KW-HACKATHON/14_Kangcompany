import { beforeEach, describe, expect, it, vi } from 'vitest'
const sdk = vi.hoisted(() => ({
  requestPayment: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@tosspayments/tosspayments-sdk', () => ({
  loadTossPayments: vi.fn(async () => ({ payment: () => sdk })),
}))
import { startDepositPayment } from '../../src/api/payments'
import { integerInRange } from '../../src/lib/validation'
beforeEach(() => vi.clearAllMocks())
describe('결제 SDK 호출 계약 - 실제 결제창/외부 통신 없음', () => {
  it.each([
    ['card', 'CARD'],
    ['bank', 'TRANSFER'],
  ] as const)('%s 선택 → %s 호출', async (method, expected) => {
    await startDepositPayment(1, 'local-user', method)
    expect(sdk.requestPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        method: expected,
        amount: { currency: 'KRW', value: 100000 },
        orderId: 'LOCAL-ORDER',
      }),
    )
  })
})
it.each(['', ' ', '-1', '1.5', 'Infinity', '2147483648'])(
  '잘못된 정수 입력 %j 거절',
  (value) => {
    expect(integerInRange(value)).toBe(false)
  },
)
it('0원과 정수 인원 경계 허용', () => {
  expect(integerInRange('0')).toBe(true)
  expect(integerInRange('200', 1, 200)).toBe(true)
  expect(integerInRange('201', 1, 200)).toBe(false)
})
