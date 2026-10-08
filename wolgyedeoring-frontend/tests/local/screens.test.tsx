import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from '@testing-library/react'
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom'
import App from '../../src/App'
import { SessionProvider, useSessionContext } from '../../src/app/session'
import RequestNew from '../../src/pages/group/RequestNew'
import { Calendar, todayKst } from '../../src/components/Calendar'
import { DatePicker, TimePicker } from '../../src/components/pickers'
import { Quantity } from '../../src/components/ui'
import { storeFormValid } from '../../src/pages/auth/StoreForm'
import {
  setScenario,
  calls,
  getItems,
  reservation,
  request,
  getOpened,
} from './mock-api'
import { useAction } from '../../src/hooks/useAsync'

beforeEach(() => {
  setScenario('receipt-unsaved')
  window.history.replaceState({}, '', '/owner/receipts/1')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
async function open(path: string, scenario: string) {
  setScenario(scenario)
  window.history.replaceState({}, '', path)
  render(
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>,
  )
  await waitFor(() =>
    expect(document.querySelector('.app-body')?.textContent).toBeTruthy(),
  )
}
async function receipt(s = 'receipt-unsaved') {
  await open('/owner/receipts/1', s)
  await screen.findByRole('heading', { name: '맥 주' })
  return within(document.querySelector('.ocr-row')! as HTMLElement)
}
const confirm = () =>
  screen.getByRole('button', { name: '영수증 확정하기' }) as HTMLButtonElement
const check = () =>
  fireEvent.click(
    screen.getByRole('checkbox', { name: '품목·수량·금액을 확인했어요' }),
  )

describe('영수증 보정 / 입력 / 실패', () => {
  it('[FIX R01] 기존 정상값 그대로 확인·저장 가능', async () => {
    const row = await receipt('receipt-mismatch')
    expect(
      (row.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled,
    ).toBe(false)
    expect(row.queryByText('qty*unit_price != amount')).toBeNull()
    fireEvent.click(row.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(getItems()[0].validation_error).toBeNull())
    await waitFor(() => expect(screen.queryByText(/확인 필요 1개/)).toBeNull())
    check()
    expect(confirm().disabled).toBe(false)
  })
  it('[FIX R01] 불확실한 정상 품목도 기존값 저장 가능', async () => {
    const row = await receipt('receipt-low')
    expect(row.getByText(/인식이 불확실해요/)).toBeTruthy()
    expect(
      (row.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })
  it('[OK] 입력 변경 후 저장하면 보정 API가 정확한 값으로 호출됨', async () => {
    const row = await receipt()
    fireEvent.change(row.getByRole('spinbutton', { name: '수량' }), {
      target: { value: '12' },
    })
    fireEvent.click(row.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === 'receipts.correctItem')?.args,
      ).toEqual([1, 1, 12, 5000]),
    )
    await waitFor(() => expect(getItems()[0].amount).toBe(60000))
  })
  it('[FIX R02] 미저장 변경은 확정 불가, 저장 후 재확인', async () => {
    const row = await receipt()
    check()
    fireEvent.change(row.getByRole('spinbutton', { name: '단가 (원)' }), {
      target: { value: '6000' },
    })
    check()
    expect(confirm().disabled).toBe(true)
    fireEvent.click(confirm())
    expect(calls.some((c) => c.method === 'receipts.confirmReceipt')).toBe(
      false,
    )
    fireEvent.click(row.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(getItems()[0].unit_price).toBe(6000))
    await waitFor(() =>
      expect(
        (row.getByRole('button', { name: '저장' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true),
    )
    expect(confirm().disabled).toBe(true)
    check()
    expect(confirm().disabled).toBe(false)
    fireEvent.click(confirm())
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'receipts.confirmReceipt')).toBe(
        true,
      ),
    )
  })
  it('[OK] 읽기 실패는 빈 화면 대신 재시도 표시', async () => {
    await open('/owner/receipts/1', 'receipt-load-fail')
    expect(await screen.findByText('연결을 확인해 주세요')).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy()
  })
  it('[FIX R03] 추가 실패 후 메뉴·수량 보존', async () => {
    await receipt('receipt-add-fail')
    fireEvent.click(screen.getByRole('button', { name: '메뉴, 메뉴 선택' }))
    fireEvent.click(screen.getByRole('radio', { name: '비빔밥 7,500원' }))
    const add = within(document.querySelectorAll('.ocr-row')[1] as HTMLElement)
    fireEvent.change(add.getByRole('spinbutton', { name: '수량' }), {
      target: { value: '4' },
    })
    fireEvent.click(add.getByRole('button', { name: '추가' }))
    await screen.findByText('연결을 확인해 주세요')
    expect(
      (add.getByRole('spinbutton', { name: '수량' }) as HTMLInputElement).value,
    ).toBe('4')
    expect(
      add.getByRole('button', { name: '메뉴, 비빔밥 7,500원' }),
    ).toBeTruthy()
  })
  it('[OK] 수정 저장 실패는 사용자가 적은 값 유지', async () => {
    const row = await receipt('receipt-save-fail')
    fireEvent.change(row.getByRole('spinbutton', { name: '수량' }), {
      target: { value: '12' },
    })
    fireEvent.click(row.getByRole('button', { name: '저장' }))
    await screen.findByText('연결을 확인해 주세요')
    expect(
      (row.getByRole('spinbutton', { name: '수량' }) as HTMLInputElement).value,
    ).toBe('12')
  })
  it('[FIX R04] 품목 0개는 확정 불가', async () => {
    await open('/owner/receipts/1', 'receipt-empty')
    await screen.findByRole('heading', { name: '빠진 품목 추가' })
    check()
    expect(confirm().disabled).toBe(true)
    fireEvent.click(confirm())
    expect(calls.some((c) => c.method === 'receipts.confirmReceipt')).toBe(
      false,
    )
  })
  it.each(['-1', '1.5'])(
    '[FIX V01] 잘못된 수량 %s 저장 차단',
    async (value) => {
      const row = await receipt()
      fireEvent.change(row.getByRole('spinbutton', { name: '수량' }), {
        target: { value },
      })
      expect(
        (row.getByRole('button', { name: '저장' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true)
      fireEvent.click(row.getByRole('button', { name: '저장' }))
      expect(calls.some((c) => c.method === 'receipts.correctItem')).toBe(false)
    },
  )
  it('[OK] 품목 확인 체크 전 확정은 비활성', async () => {
    await receipt()
    expect(confirm().disabled).toBe(true)
  })
})
describe('예약 / 결제 / 조건', () => {
  it('[FIX P01] test URL은 실제 결제 대기를 확정 표시하지 않음', async () => {
    await open('/pay/success?reservation=1&test=1', 'pay-forged')
    expect(await screen.findByText(/아직 예약 확정이 확인되지/)).toBeTruthy()
    expect(screen.queryByText('모일 준비가 끝났어요.')).toBeNull()
    expect(calls.some((c) => c.method.startsWith('payments.'))).toBe(false)
  })
  it('[FIX P01] zero URL도 DB 상태 조회 전 확정 표시 없음', async () => {
    await open('/pay/success?reservation=1&zero=1', 'pay-forged')
    expect(await screen.findByText(/아직 예약 확정이 확인되지/)).toBeTruthy()
    expect(screen.queryByText('모일 준비가 끝났어요.')).toBeNull()
  })
  it('[FIX V02] 수정 인원 201 차단', async () => {
    await open('/group/reservations/1/modify', 'modify')
    fireEvent.change(
      await screen.findByRole('spinbutton', { name: '예상 인원' }),
      { target: { value: '201' } },
    )
    expect(
      (
        screen.getByRole('button', {
          name: '수정 요청 보내기',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })
  it('[OK] 수정 요청 인원 0은 제출 비활성', async () => {
    await open('/group/reservations/1/modify', 'modify')
    const input = await screen.findByRole('spinbutton', { name: '예상 인원' })
    fireEvent.change(input, { target: { value: '0' } })
    expect(
      (
        screen.getByRole('button', {
          name: '수정 요청 보내기',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })
  it('[FIX Q01] 재요청의 19:00 보존', async () => {
    setScenario('request')
    window.history.replaceState({}, '', '/group/requests/new')
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/group/requests/new', state: { from: request } },
        ]}
      >
        <SessionProvider>
          <Routes>
            <Route path="*" element={<RequestNewGate />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: '어떤 모임을 준비하세요?' })
    expect(document.body.textContent).toContain('오후 7:00')
  })
  it('[FIX V03] 음수 예산은 빈자리 예약 차단', async () => {
    await open('/group/slots/1/book', 'slot-book')
    fireEvent.change(
      await screen.findByRole('spinbutton', { name: '예상 인원' }),
      { target: { value: '10' } },
    )
    fireEvent.change(
      screen.getByRole('spinbutton', { name: '1인 예산 (선택, 원)' }),
      { target: { value: '-1000' } },
    )
    expect(
      (
        screen.getByRole('button', {
          name: '이 날짜로 예약하기',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })
  it('[FIX V05] 소수 인원으로 요청 차단', async () => {
    await open('/group/requests/new', 'request')
    await screen.findByRole('heading', { name: '어떤 모임을 준비하세요?' })
    fireEvent.click(screen.getByText('인원과 예산', { exact: true }))
    fireEvent.change(document.getElementById('headcount')!, {
      target: { value: '1.5' },
    })
    expect(
      (screen.getByRole('button', { name: /요청 보내기/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(calls.some((c) => c.method === 'requests.createRequest')).toBe(false)
  })
  it('[FIX V06] 음수 메뉴 가격 저장 차단', async () => {
    await open('/owner/menus', 'menus')
    await screen.findByRole('heading', { name: '우리 가게 메뉴' })
    fireEvent.click(screen.getByRole('button', { name: '직접 추가' }))
    fireEvent.change(screen.getByRole('textbox', { name: '메뉴명' }), {
      target: { value: '테스트 메뉴' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: /가격 \(원\)/ }), {
      target: { value: '-500' },
    })
    expect(
      within(screen.getByRole('dialog')).queryByRole('button', {
        name: '저장',
      }),
    ).toBeNull()
    expect(calls.some((c) => c.method === 'menus.saveMenus')).toBe(false)
  })
})
function RequestNewGate() {
  const s = useSessionContext()
  return s.group ? <RequestNew /> : null
}
describe('캘린더 / 선택기 / 참석 / 빈 화면', () => {
  it('[OK] 오늘 기준 과거 날짜와 이전 달은 선택 불가', () => {
    const t = todayKst()
    render(
      <Calendar
        multi
        month={t.slice(0, 7)}
        selected={[]}
        onMonth={() => {}}
        onPick={() => {}}
        minDay={t}
      />,
    )
    expect(
      (screen.getByRole('button', { name: '이전 달' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    const day = Number(t.slice(8))
    if (day > 1) {
      const b = document.querySelectorAll('.calendar-day')[
        day - 2
      ] as HTMLButtonElement
      expect(b.disabled).toBe(true)
    }
  })
  it('[OK] 이어진 날짜 선택은 가운데 셀 연결 클래스 적용', () => {
    render(
      <Calendar
        multi
        month="2026-10"
        selected={['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']}
        onMonth={() => {}}
        onPick={() => {}}
      />,
    )
    const b = screen.getByRole('button', { name: '10월 21일(수)' })
    expect(b.className).toContain('is-joined-left')
    expect(b.className).toContain('is-joined-right')
  })
  it('[OK] 마감된 참석 조사에는 제출 버튼 없음', async () => {
    await open('/r/local', 'rsvp-closed')
    await screen.findByText('응답이 마감되었어요.')
    expect(screen.queryByRole('button', { name: '참석 여부 제출' })).toBeNull()
  })
  it('[OK] 취소된 참석 조사에는 제출 버튼 없음', async () => {
    await open('/r/local', 'rsvp-cancelled')
    await screen.findByText('취소된 행사예요.')
    expect(screen.queryByRole('button', { name: '참석 여부 제출' })).toBeNull()
  })
  it('[OK] 공백 이름으로 참석 제출 불가', async () => {
    await open('/r/local', 'rsvp')
    fireEvent.change(await screen.findByRole('textbox', { name: /^이름/ }), {
      target: { value: '   ' },
    })
    expect(
      (
        screen.getByRole('button', {
          name: '참석 여부 제출',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })
  it('[OK] 이름과 참석 여부로 로컬 응답 제출', async () => {
    await open('/r/local', 'rsvp')
    fireEvent.change(await screen.findByRole('textbox', { name: /^이름/ }), {
      target: { value: '테스트' },
    })
    fireEvent.click(screen.getByRole('button', { name: '참석 여부 제출' }))
    expect(
      await screen.findByRole('button', { name: '응답 수정하기' }),
    ).toBeTruthy()
    expect(
      calls.find((c) => c.method === 'rsvp.respondRsvp')?.args.slice(0, 3),
    ).toEqual(['local', '테스트', true])
  })
  it('[OK] 예약 없는 첫 홈은 새 모임 시작 버튼 표시', async () => {
    await open('/group', 'empty')
    expect(await screen.findByText('새 모임을 준비해 볼까요?')).toBeTruthy()
    expect(screen.queryByText('예약금 결제가 남았어요')).toBeNull()
  })
  it('[OK] 과거 연도를 가진 날짜 값도 오늘로 보정됨', () => {
    const changed = vi.fn()
    render(
      <DatePicker
        value="2018-12-01"
        min="2026-10-08"
        title="희망 날짜"
        onChange={changed}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /희망 날짜/ }))
    expect(screen.queryByRole('option', { name: '2018' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '이 날짜로 설정' }))
    expect(changed).toHaveBeenCalledWith('2026-10-08')
  })
  it('[OK] 31일에서 2월로 변경하면 말일로 보정됨', () => {
    const changed = vi.fn()
    render(
      <DatePicker
        value="2027-01-31"
        min="2026-10-08"
        title="희망 날짜"
        onChange={changed}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /희망 날짜/ }))
    fireEvent.click(
      within(screen.getByRole('listbox', { name: '월' })).getByRole('option', {
        name: '02',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: '이 날짜로 설정' }))
    expect(changed).toHaveBeenCalledWith('2027-02-28')
  })
  it('[OK] 날짜 시트 Esc 취소 시 변경값 전달 안 함', () => {
    const changed = vi.fn()
    render(
      <DatePicker
        value="2027-01-31"
        min="2026-10-08"
        title="희망 날짜"
        onChange={changed}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /희망 날짜/ }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(changed).not.toHaveBeenCalled()
  })
  it('[OK] 오전 12시는 00:00으로 저장', () => {
    const changed = vi.fn()
    render(<TimePicker value="00:00" title="시간" onChange={changed} />)
    fireEvent.click(screen.getByRole('button', { name: /시간,/ }))
    fireEvent.click(screen.getByRole('button', { name: '이 시간으로 설정' }))
    expect(changed).toHaveBeenCalledWith('00:00')
  })
  it('[OK] 메뉴 수량 음수와 상한은 0,999로 보정', () => {
    const changed = vi.fn()
    render(<Quantity value={0} onChange={changed} label="맥주" max={999} />)
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '-1' },
    })
    expect(changed).toHaveBeenLastCalledWith(0)
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '1000' },
    })
    expect(changed).toHaveBeenLastCalledWith(999)
  })
  it('[FIX V04] 수량 1.5는 정수 1로 보정', () => {
    const changed = vi.fn()
    render(<Quantity value={0} onChange={changed} label="맥주" max={999} />)
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '1.5' },
    })
    expect(changed).toHaveBeenLastCalledWith(1)
  })
  it('[FIX S01] 공개 실패는 모두 미등록, 같은 키 재시도', async () => {
    await pickTwo('slot-partial')
    fireEvent.click(screen.getByRole('button', { name: '2개 빈자리 공개' }))
    await screen.findByText('연결을 확인해 주세요')
    expect(getOpened()).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: '2개 빈자리 공개' }))
    await waitFor(() => expect(getOpened()).toHaveLength(2))
    const c = calls.filter((c) => c.method === 'slots.openSlots')
    expect(c[0].args[1]).toBe(c[1].args[1])
  })
  it('[FIX S02] 오늘 지난 시간 빈자리 공개 차단', async () => {
    vi.setSystemTime(new Date('2026-10-08T20:00:00+09:00'))
    await open('/owner/slots', 'slots')
    await screen.findByRole('heading', { name: '공통 조건' })
    fireEvent.click(screen.getByRole('button', { name: '10월 8일(목)' }))
    expect(
      (
        screen.getByRole('button', {
          name: '1개 빈자리 공개',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(getOpened()).toHaveLength(0)
  })
  it('[OK] 0명, 가게 최대 인원 초과는 빈자리 공개 불가', async () => {
    await open('/owner/slots', 'slots')
    await screen.findByRole('heading', { name: '공통 조건' })
    fireEvent.click(
      Array.from(document.querySelectorAll('.calendar-day')).find(
        (e) => !(e as HTMLButtonElement).disabled,
      )!,
    )
    fireEvent.change(screen.getByRole('spinbutton', { name: /^최대 인원/ }), {
      target: { value: '31' },
    })
    expect(
      (
        screen.getByRole('button', {
          name: '1개 빈자리 공개',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    fireEvent.change(screen.getByRole('spinbutton', { name: /^최대 인원/ }), {
      target: { value: '0' },
    })
    expect(
      (
        screen.getByRole('button', {
          name: '1개 빈자리 공개',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })
  it('[OK] 요청 수락의 음수 예약금은 숫자만 남겨 입력됨', async () => {
    await open('/owner/requests/1', 'owner')
    const field = await screen.findByRole('textbox', { name: '예약금 입력' })
    fireEvent.change(field, { target: { value: '-1000abc' } })
    expect((field as HTMLInputElement).value).toBe('1,000')
  })
})
describe('라우트 표시 및 역할 보호 - 로컬 fixture', () => {
  it.each([
    ['/start', 'anonymous', '함께 모이는 날'],
    ['/login', 'anonymous', '다시 만나 반가워요.'],
    ['/signup', 'anonymous', '어떤 역할로 이용하나요?'],
    ['/group/reservations', 'reservation', '내 예약'],
    ['/group/requests/1', 'request', '요청 진행'],
    ['/group/slots', 'slot-book', '캘린더'],
    ['/group/reservations/1', 'reservation', '예약 상세'],
    ['/group/reservations/1/preorder', 'reservation', '사전 주문'],
    ['/group/reservations/1/rsvp', 'rsvp', '참석 링크'],
    ['/group/reservations/1/rsvp/responses', 'rsvp', '참석 현황'],
    ['/group/layouts', 'empty', '좌석 배치도'],
    ['/group/me', 'reservation', '단체 정보'],
    ['/owner', 'owner', '가게 캘린더'],
    ['/owner/inbox', 'owner', '동네 요청'],
    ['/owner/requests/1', 'owner', '받은 요청'],
    ['/owner/reservations/1', 'owner', '예약 상세'],
    ['/owner/menus', 'menus', '메뉴 관리'],
    ['/owner/menus/scan', 'menus', '메뉴판 확인'],
    ['/owner/reservations/1/receipt', 'owner', '영수증 사진'],
    ['/owner/stats', 'owner', '가게 분석'],
    ['/owner/stats/unmet', 'owner', '미충족 수요'],
    ['/owner/store', 'owner', '가게 정보'],
    ['/owner/layout', 'owner', '좌석 배치도'],
    ['/notifications', 'group', '알림'],
    ['/pay/fail?reservation=1', 'reservation', '결제가 끝나지 않았어요.'],
  ])('[SMOKE] %s 렌더링', async (path, scenario, text) => {
    await open(path, scenario)
    await waitFor(() => expect(document.body.textContent).toContain(text))
    expect(document.body.textContent).not.toContain('점검 응답 미설정')
  })
  it('[OK] 비로그인으로 사장님 영수증 접근하면 시작 화면으로 이동', async () => {
    await open('/owner/receipts/1', 'anonymous')
    await waitFor(() => expect(window.location.pathname).toBe('/start'))
    expect(calls.some((c) => c.method === 'receipts.getReceipt')).toBe(false)
  })
  it('[OK] 단체 계정으로 사장님 메뉴 접근하면 단체 홈으로 이동', async () => {
    await open('/owner/menus', 'wrong-role')
    await waitFor(() => expect(window.location.pathname).toBe('/group'))
    expect(calls.some((c) => c.method === 'menus.listMenus')).toBe(false)
  })
})

async function pickTwo(s: string) {
  vi.setSystemTime(new Date('2026-10-08T09:00:00+09:00'))
  await open('/owner/slots', s)
  await screen.findByRole('heading', { name: '공통 조건' })
  const days = Array.from(document.querySelectorAll('.calendar-day')).filter(
    (e) => !(e as HTMLButtonElement).disabled,
  )
  fireEvent.click(days[0])
  fireEvent.click(days[1])
}
describe('추가 회귀 검사', () => {
  it('StrictMode 결제 승인은 한 번 호출하고 DB 확인 후 성공 표시', async () => {
    setScenario('pay-confirmed')
    window.history.replaceState(
      {},
      '',
      '/pay/success?reservation=1&paymentKey=LOCAL&orderId=LOCAL&amount=100000',
    )
    render(
      <React.StrictMode>
        <BrowserRouter>
          <SessionProvider>
            <App />
          </SessionProvider>
        </BrowserRouter>
      </React.StrictMode>,
    )
    expect(await screen.findByText('모일 준비가 끝났어요.')).toBeTruthy()
    expect(
      calls.filter((c) => c.method === 'payments.confirmPaymentFromUrl'),
    ).toHaveLength(1)
  })
  it('예약 번호 없이 성공 URL을 열면 확정 표시 차단', async () => {
    await open('/pay/success?test=1', 'pay-forged')
    expect(await screen.findByText('예약 정보가 올바르지 않아요.')).toBeTruthy()
    expect(screen.queryByText('모일 준비가 끝났어요.')).toBeNull()
  })
  it('등록 후 응답 유실 재시도도 2개 유지', async () => {
    await pickTwo('slot-timeout')
    fireEvent.click(screen.getByRole('button', { name: '2개 빈자리 공개' }))
    await screen.findByText('연결을 확인해 주세요')
    expect(getOpened()).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '2개 빈자리 공개' }))
    await screen.findByText('2개 빈자리를 공개했어요.')
    expect(getOpened()).toHaveLength(2)
  })
  it('DB 확정 예약은 성공 표시', async () => {
    await open('/pay/success?reservation=1&test=1', 'pay-confirmed')
    expect(await screen.findByText('모일 준비가 끝났어요.')).toBeTruthy()
  })
  it('zero 표시값 대신 실제 예약금으로 안내', async () => {
    await open('/pay/success?reservation=1&zero=1', 'pay-confirmed')
    await screen.findByText('모일 준비가 끝났어요.')
    expect(document.body.textContent).toContain('예약금 결제가 완료되어')
    expect(document.body.textContent).not.toContain('예약금 없이')
  })
  it('0원 확정 예약 안내', async () => {
    await open('/pay/success?reservation=1&zero=1', 'pay-zero-confirmed')
    await screen.findByText('모일 준비가 끝났어요.')
    expect(document.body.textContent).toContain('예약금 없이')
  })
  it('계좌이체 선택은 결제 API로 전달', async () => {
    await open('/group/reservations/1/pay', 'pay-method')
    await screen.findByRole('heading', { name: '결제 방법' })
    fireEvent.click(screen.getByRole('button', { name: '계좌이체' }))
    fireEvent.click(screen.getByRole('button', { name: '100,000원 결제하기' }))
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === 'payments.startDepositPayment')?.args,
      ).toEqual([1, 'local-group', 'bank']),
    )
  })
  it('참석 0명 마감은 기존 인원 유지 안내', async () => {
    await open('/group/reservations/1/rsvp/responses', 'rsvp-zero')
    await screen.findByRole('button', { name: '마감하기' })
    fireEvent.click(screen.getByRole('button', { name: '마감하기' }))
    expect(
      within(screen.getByRole('dialog')).getByText(
        /기존 예약 인원 24명을 유지/,
      ),
    ).toBeTruthy()
  })
  it('첫 응답 후 모집 인원 24명 유지', async () => {
    await open('/group', 'rsvp-after-first')
    await screen.findByText('다가오는 모임')
    expect(document.body.textContent).toContain('/ 24명')
    expect(document.body.textContent).toContain('미응답 23명')
  })
  it('미저장 추가 품목도 확정 차단', async () => {
    await receipt()
    fireEvent.click(screen.getByRole('button', { name: '메뉴, 메뉴 선택' }))
    fireEvent.click(screen.getByRole('radio', { name: '비빔밥 7,500원' }))
    check()
    expect(confirm().disabled).toBe(true)
  })
})
