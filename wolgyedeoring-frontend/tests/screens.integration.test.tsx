// @vitest-environment happy-dom
// 화면 골격 통합 테스트: 실제 라우터·가드·화면 → api → DB. 데이터가 화면에 나오는지만 확인 (디자인 무관)
// ⚠️ 시드 직후 실행 (flow 테스트와 같은 DB 를 쓰면 flow 다음에 돌아도 통과하도록 작성)
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App'
import { SessionProvider } from '../src/app/session'
import * as api from '../src/api'
import { supabase } from '../src/lib/supabase'

const T = { timeout: 8000 }
const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><SessionProvider><App /></SessionProvider></MemoryRouter>)
const as = (email: string) => api.auth.signIn(email, 'demo1234!')
afterEach(() => cleanup())

describe.sequential('화면 골격 (라우터 → 화면 → api → DB)', () => {
  it('비로그인: 보호된 화면 → 시작 화면으로', async () => {
    await api.auth.signOut()
    open('/group')
    expect(await screen.findByText('시작하기', {}, T)).toBeTruthy()
  })

  it('사장님 홈(S-01): 가게 이름·새 요청·하단 탭', async () => {
    await as('owner1@wolgye.demo')
    open('/owner')
    expect(await screen.findByRole('heading', { name: '고기굽는집' }, T)).toBeTruthy()
    expect(await screen.findByText(/새 요청 \d+건/, {}, T)).toBeTruthy()
    const nav = within(screen.getByRole('navigation', { name: '주요 메뉴' }))
    expect(nav.getAllByRole('link').map((a) => a.querySelectorAll('span')[1]?.textContent)).toEqual(['홈', '요청·예약', '메뉴', '분석'])
    expect(screen.getByRole('link', { name: '가게 정보' })).toBeTruthy()
  })

  it('사장님 요청·예약(S-02/S-04) 세그먼트', async () => {
    open('/owner/inbox?view=reservations')
    expect(await screen.findByText('다가오는 예약', {}, T)).toBeTruthy()
    expect(await screen.findAllByText('전자공학과 학생회', {}, T)).toBeTruthy()
  })

  it('사장님 영수증 보정(S-11): 확인 필요 품목 표시, 확정 버튼 비활성', async () => {
    const { data } = await supabase.from('receipts').select('id').eq('status', 'needs_review').limit(1).single()
    open(`/owner/receipts/${data!.id}`)
    expect(await screen.findByText(/확인 필요 \d+개/, {}, T)).toBeTruthy()
    expect((screen.getByRole('button', { name: '영수증 확정하기' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('사장님 분석(S-12)·메뉴(S-07)', async () => {
    open('/owner/stats')
    expect(await screen.findByText('요일별 예약 (한산한 날에 빈 날짜를 열어 보세요)', {}, T)).toBeTruthy()
    cleanup()
    open('/owner/menus')
    expect(await screen.findByText('삼겹살', {}, T)).toBeTruthy()
  })

  it('역할이 다른 화면 → 내 홈으로', async () => {
    open('/group')
    expect(await screen.findByRole('heading', { name: '고기굽는집' }, T)).toBeTruthy()
  })

  it('단체 홈(G-01): 해야 할 일(결제 대기)·하단 탭·요청 CTA', async () => {
    await as('sw@wolgye.demo')
    open('/group')
    expect(await screen.findByRole('heading', { name: '소프트웨어학부 학생회' }, T)).toBeTruthy()
    expect(await screen.findByText(/광운분식 예약금을 결제해야 확정돼요/, {}, T)).toBeTruthy()
    expect(screen.getByRole('button', { name: '예약 요청하기' })).toBeTruthy()
    const nav = within(screen.getByRole('navigation', { name: '주요 메뉴' }))
    expect(nav.getAllByRole('link').map((a) => a.querySelectorAll('span')[1]?.textContent)).toEqual(['홈', '예약', '가게 찾기', '내 정보'])
  })

  it('단체 요청 작성(G-02) → 제출 → 요청 상태(G-03)', async () => {
    open('/group/requests/new')
    await screen.findByText('날짜와 시간', {}, T)
    const d = new Date(Date.now() + 20 * 864e5)
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d)
    const inputs = document.querySelectorAll('input')
    fireEvent.change(inputs[0], { target: { value: `${ymd}T18:30` } })
    fireEvent.change(inputs[1], { target: { value: '24' } })
    fireEvent.change(inputs[2], { target: { value: '25000' } })
    expect(await screen.findByText(/곳에 요청이 전달돼요/, {}, T)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '요청 보내기' }))
    expect(await screen.findByText('응답 대기', {}, T)).toBeTruthy()
    expect(await screen.findByText(/응답 기한 .* 남음/, {}, T)).toBeTruthy()
  })

  it('단체 가게 찾기(G-04)·예약 상세(G-06)', async () => {
    open('/group/slots')
    expect(await screen.findAllByText(/예약금/, {}, T)).toBeTruthy()
    cleanup()
    const list = await api.reservations.listMyReservations()
    const awaiting = list.find((r) => r.status === 'awaiting_payment' && r.stores.name === '광운분식')!
    open(`/group/reservations/${awaiting.id}`)
    expect(await screen.findByText('결제 대기', {}, T)).toBeTruthy()
    expect(await screen.findByRole('button', { name: '예약 확정하기' }, T)).toBeTruthy() // 예약금 0원
    expect(screen.getByText('컵떡볶이 × 30')).toBeTruthy()
  })

  it('참석 응답(P-01): 로그인 없이 시드 조사 열기', async () => {
    await api.auth.signOut()
    await as('fc@wolgye.demo')
    const list = await api.reservations.listMyReservations()
    const rv = await api.rsvp.getRsvpForReservation(list.find((r) => r.status === 'confirmed')!.id)
    await api.auth.signOut()
    open(`/r/${rv!.token}`)
    expect(await screen.findByText(/축구 동아리 KW FC/, {}, T)).toBeTruthy()
    expect(await screen.findByText(/응답 받는 중/, {}, T)).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('button', { name: '응답 보내기' })).toBeTruthy())
  })
})
