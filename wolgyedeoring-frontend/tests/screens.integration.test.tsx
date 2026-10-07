// @vitest-environment happy-dom
// 화면 통합 테스트: 실제 라우터·가드·화면 → api → DB. 시안 이식(4.12.1) 화면 기준 문구·역할로 확인
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

describe.sequential('화면 (라우터 → 화면 → api → DB)', () => {
  const navLabels = () => [...screen.getByRole('navigation', { name: '주요 메뉴' }).querySelectorAll('.nav-label, .nav-action-label')].map((x) => x.textContent)

  it('비로그인: 보호된 화면 → 시작 화면으로', async () => {
    await api.auth.signOut()
    open('/group')
    expect(await screen.findByText('이 역할로 시작하기', {}, T)).toBeTruthy()
  })

  it('사장님 홈(S-01): 가게 이름·새 요청·하단 탭', async () => {
    await as('owner1@wolgye.demo')
    open('/owner')
    expect(await screen.findByRole('heading', { name: '고기굽는집' }, T)).toBeTruthy()
    expect(await screen.findByText(/새 요청 \d+건/, {}, T)).toBeTruthy()
    expect(navLabels()).toEqual(['홈', '메뉴', '요청', '분석', '정보'])
    expect(screen.getByRole('button', { name: /알림 목록/ })).toBeTruthy()
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
    expect(await screen.findByText('요일별 예약', {}, T)).toBeTruthy()
    cleanup()
    open('/owner/menus')
    expect(await screen.findByText('삼겹살', {}, T)).toBeTruthy()
  })

  it('역할이 다른 화면 → 내 홈으로', async () => {
    open('/group')
    expect(await screen.findByRole('heading', { name: '고기굽는집' }, T)).toBeTruthy()
  })

  it('단체 홈(G-01): 해야 할 일 배너·하단 탭·예약하기', async () => {
    await as('sw@wolgye.demo')
    open('/group')
    expect(await screen.findByText(/소프트웨어학부 학생회 ·/, {}, T)).toBeTruthy()
    expect(await screen.findByText('예약 확정이 남았어요', {}, T)).toBeTruthy() // 광운분식, 예약금 0원
    expect(navLabels()).toEqual(['홈', '내 예약', '예약하기', '캘린더', '내 정보'])
  })

  it('단체 요청 작성(G-02) → 확인 시트 → 요청 상태(G-03)', async () => {
    open('/group/requests/new')
    await screen.findByText('어떤 모임을 준비하세요?', {}, T)
    const d = new Date(Date.now() + 20 * 864e5)
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d)
    fireEvent.change(document.getElementById('req-date')!, { target: { value: ymd } })
    fireEvent.change(document.getElementById('headcount')!, { target: { value: '24' } })
    expect(await screen.findByText(/곳에 요청이 전달돼요/, {}, T)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '요청 보내기' }))
    const dialog = await screen.findByRole('dialog', { name: '이 조건으로 요청할까요?' }, T)
    fireEvent.click(within(dialog).getByRole('button', { name: '요청 보내기' }))
    expect(await screen.findByText('가게의 응답을 기다리고 있어요.', {}, T)).toBeTruthy()
    expect(await screen.findByText(/응답 기한 .* 남음/, {}, T)).toBeTruthy()
  })

  it('단체 캘린더(G-04)·예약 상세(G-06)', async () => {
    open('/group/slots')
    expect(await screen.findByRole('button', { name: '공개 빈자리' }, T)).toBeTruthy()
    expect(await screen.findByText(/빈자리 \d+건/, {}, T)).toBeTruthy()
    cleanup()
    const list = await api.reservations.listMyReservations()
    const awaiting = list.find((r) => r.status === 'awaiting_payment' && r.stores.name === '광운분식')!
    open(`/group/reservations/${awaiting.id}`)
    expect(await screen.findByText('확정 대기', {}, T)).toBeTruthy()
    expect(await screen.findByRole('button', { name: '예약 확정하기' }, T)).toBeTruthy() // 예약금 0원
    expect(screen.getByText('컵떡볶이 30 · 1인 3,000원')).toBeTruthy()
  })

  it('단체 예약 상세(G-06): 완료 예약의 실제 소비 기록 (확정 영수증)', async () => {
    await as('sw@wolgye.demo')
    const list = await api.reservations.listMyReservations()
    let target: number | null = null
    for (const r of list.filter((x) => x.status === 'completed')) {
      const rcs = await api.receipts.listReceiptsForReservation(r.id)
      if (rcs.some((rc) => rc.status === 'done')) { target = r.id; break }
    }
    expect(target).not.toBeNull()
    open(`/group/reservations/${target}`)
    expect(await screen.findByText(/^실제 소비 /, {}, T)).toBeTruthy()
    expect(screen.getByText('가게가 확인한 영수증 기록')).toBeTruthy()
  })

  it('사장님 좌석 배치도(S-15): 게시본 → 수정 → 테이블 추가 → 게시', async () => {
    await as('owner1@wolgye.demo')
    open('/owner/layout')
    expect(await screen.findByText('현재 공개한 배치도', {}, T)).toBeTruthy()
    expect(screen.getByText('공개 중')).toBeTruthy()
    expect(screen.getByRole('group', { name: /테이블 11개, 60석/ })).toBeTruthy()
    expect(screen.queryByText('임시 저장')).toBeNull() // 단순 게시형
    fireEvent.click(screen.getByRole('button', { name: '현재 배치도 수정' }))
    fireEvent.click(await screen.findByRole('button', { name: '테이블 추가' }, T))
    expect(await screen.findByRole('heading', { name: 'T12 편집' }, T)).toBeTruthy()
    expect(screen.getByText('게시 전 변경')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '변경 내용 게시하기' }))
    expect(await screen.findByText(/게시했어요/, {}, T)).toBeTruthy()
    const me = (await api.auth.getMe())!
    const pub = await api.layouts.getPublishedLayout((await api.stores.getMyStore(me.id))!.id)
    expect(pub?.table_count).toBe(12)
    expect(pub?.total_seats).toBe(64)
  })

  it('사장님(배치도 없는 가게): 직접 그리기 → 테이블 추가 → 게시', async () => {
    await as('owner3@wolgye.demo')
    open('/owner/layout')
    expect(await screen.findByText('아직 배치도를 게시하지 않았어요', {}, T)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /직접 그리기/ }))
    expect((screen.getByRole('button', { name: '배치도 게시하기' }) as HTMLButtonElement).disabled).toBe(true) // 테이블 0개
    fireEvent.click(screen.getByRole('button', { name: '테이블 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '배치도 게시하기' }))
    expect(await screen.findByText(/게시했어요/, {}, T)).toBeTruthy()
  })

  it('손님 좌석 배치도(G-15): 예약 상세 버튼 → 가게 바꿔 보기', async () => {
    await as('ee@wolgye.demo')
    const list = await api.reservations.listMyReservations()
    const r = list.find((x) => x.status === 'confirmed' && x.stores.name === '고기굽는집')!
    open(`/group/reservations/${r.id}`)
    fireEvent.click(await screen.findByRole('button', { name: '좌석 배치도 보기' }, T))
    expect(await screen.findByRole('group', { name: /고기굽는집 좌석 배치도: 테이블 12개, 64석/ }, T)).toBeTruthy()
    // 가게 바꾸기: 방금 게시한 광운분식
    fireEvent.click(screen.getByRole('button', { name: '배치도를 볼 가게 선택' }))
    fireEvent.click(await screen.findByRole('button', { name: /광운분식/ }, T))
    expect(await screen.findByRole('group', { name: /광운분식 좌석 배치도: 테이블 1개, 4석/ }, T)).toBeTruthy()
    fireEvent.pointerDown(screen.getByRole('button', { name: /테이블 T1, 4석/ }))
    expect(screen.getByText('4석 · 사각 테이블')).toBeTruthy()
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
    await waitFor(() => expect(screen.getByRole('button', { name: '참석 여부 제출' })).toBeTruthy())
  })
})
