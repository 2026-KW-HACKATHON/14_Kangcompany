import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import App from '../../src/App'
import { SessionProvider } from '../../src/app/session'
import { StoreForm, storeFormValid } from '../../src/pages/auth/StoreForm'
import { groupExtraForm, groupExtraInput, groupExtraValid } from '../../src/pages/auth/GroupFields'
import { setScenario, calls, getOpened, slot } from './mock-api'
import { dayLabel, kstDay } from '../../src/lib/format'
beforeEach(()=>{setScenario('slots');window.history.replaceState({},'', '/owner/slots')})
afterEach(()=>{cleanup();vi.useRealTimers()})
async function open(path:string,scenario:string){
 setScenario(scenario);window.history.replaceState({},'',path)
 render(<BrowserRouter><SessionProvider><App/></SessionProvider></BrowserRouter>)
 await waitFor(()=>expect(document.querySelector('.app-body')?.textContent).toBeTruthy())
}
async function pickTwo(){
 vi.setSystemTime(new Date('2026-10-08T09:00:00+09:00'))
 await open('/owner/slots','slots');await screen.findByRole('heading',{name:'공통 조건'})
 const days=Array.from(document.querySelectorAll('.calendar-day')).filter(e=>!(e as HTMLButtonElement).disabled)
 fireEvent.click(days[0]);fireEvent.click(days[1])
}
const disabled=(name:string)=>(screen.getByRole('button',{name}) as HTMLButtonElement).disabled
describe('PR20·21 통합 검증',()=>{
 it('날짜별 최소·최대 인원, 0원 금액, 안내를 한 번의 일괄 등록으로 전달',async()=>{
  await pickTwo()
  fireEvent.change(screen.getByRole('spinbutton',{name:/^최소 인원/}),{target:{value:'10'}})
  fireEvent.change(screen.getByRole('spinbutton',{name:/^1인 금액/}),{target:{value:'0'}})
  fireEvent.change(screen.getByRole('textbox',{name:/^안내/}),{target:{value:'단체석 한 공간'}})
  fireEvent.click(screen.getByRole('button',{name:'각각 설정'}))
  fireEvent.click(screen.getAllByRole('checkbox',{name:'이 날짜만 다른 조건 사용'})[1])
  const fields=within(document.querySelector('.date-condition.is-custom')! as HTMLElement)
  fireEvent.change(fields.getByRole('spinbutton',{name:/^최소 인원/}),{target:{value:'12'}})
  fireEvent.change(fields.getByRole('spinbutton',{name:/^최대 인원/}),{target:{value:'20'}})
  fireEvent.change(fields.getByRole('spinbutton',{name:/^1인 금액/}),{target:{value:'25000'}})
  fireEvent.change(fields.getByRole('textbox',{name:/^안내/}),{target:{value:'카페 모임'}})
  fireEvent.click(screen.getByRole('button',{name:'2개 빈자리 공개'}))
  await screen.findByText('2개 빈자리를 공개했어요.')
  expect(calls.filter(c=>c.method==='slots.openSlots')).toHaveLength(1)
  expect(calls.some(c=>c.method==='slots.openSlot')).toBe(false)
  expect(getOpened().map(s=>[s.capacity,s.min_headcount,s.price_per_person,s.note])).toEqual([[30,10,0,'단체석 한 공간'],[20,12,25000,'카페 모임']])
 })
 it.each(['-1','1.5','2147483648'])('새 1인 금액 %s은 일괄 공개 차단',async value=>{
  await pickTwo();fireEvent.change(screen.getByRole('spinbutton',{name:/^1인 금액/}),{target:{value}})
  expect(disabled('2개 빈자리 공개')).toBe(true);expect(getOpened()).toHaveLength(0)
 })
 it('최소 인원이 최대 인원을 넘으면 일괄 공개 차단',async()=>{
  await pickTwo();fireEvent.change(screen.getByRole('spinbutton',{name:/^최소 인원/}),{target:{value:'31'}})
  expect(disabled('2개 빈자리 공개')).toBe(true)
 })
 it('최소 인원 검증과 가게 기본 금액을 함께 예약에 적용',async()=>{
  await open('/group/slots/1/book','slot-min')
  const field=await screen.findByRole('spinbutton',{name:'예상 인원'})
  fireEvent.change(field,{target:{value:'9'}});expect(disabled('이 날짜로 예약하기')).toBe(true)
  fireEvent.change(field,{target:{value:'10'}});fireEvent.click(screen.getByRole('button',{name:'이 날짜로 예약하기'}))
  await waitFor(()=>expect(calls.find(c=>c.method==='reservations.bookSlot')?.args[0]).toMatchObject({headcount:10,budgetPerPerson:25000}))
 })
 it('가게 기본 금액 0원도 그대로 예약 전달',async()=>{
  await open('/group/slots/1/book','slot-free')
  fireEvent.change(await screen.findByRole('spinbutton',{name:'예상 인원'}),{target:{value:'10'}})
  fireEvent.click(screen.getByRole('button',{name:'이 날짜로 예약하기'}))
  await waitFor(()=>expect(calls.find(c=>c.method==='reservations.bookSlot')?.args[0]).toMatchObject({budgetPerPerson:0}))
 })
 it('닫힌 빈자리는 인원이 맞아도 예약 버튼 비활성',async()=>{
  await open('/group/slots/1/book','slot-closed')
  fireEvent.change(await screen.findByRole('spinbutton',{name:'예상 인원'}),{target:{value:'10'}})
  expect(disabled('이 날짜로 예약하기')).toBe(true)
 })
 it.each([['rsvp-min-short','9'],['rsvp-min-zero','10']])('최소 인원 미달 %s은 부족 안내와 마감 차단',async(s,missing)=>{
  await open('/group/reservations/1/rsvp/responses',s)
  await screen.findByText(new RegExp(`최소 10명까지 ${missing}명이 더 필요`))
  expect(disabled('마감하기')).toBe(true);fireEvent.click(screen.getByRole('button',{name:'마감하기'}))
  expect(calls.some(c=>c.method==='rsvp.closeRsvp')).toBe(false)
 })
 it('최소 인원 충족 시 마감 후 예약 10명 표시',async()=>{
  await open('/group/reservations/1/rsvp/responses','rsvp-min-ready')
  fireEvent.click(await screen.findByRole('button',{name:'마감하기'}))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'마감하기'}))
  await screen.findByRole('button',{name:'마감됨'});expect(document.body.textContent).toContain('예약 10명')
 })
 it('확인 중 참석자가 줄어 서버에서 마감 거절하면 시트와 오류 유지',async()=>{
  await open('/group/reservations/1/rsvp/responses','rsvp-min-race')
  fireEvent.click(await screen.findByRole('button',{name:'마감하기'}))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'마감하기'}))
  await screen.findByText(/최소 10명까지 1명이 더 필요/)
  expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.queryByRole('button',{name:'마감됨'})).toBeNull()
 })
 it('설정되지 않은 소셜 로그인은 준비 중 표시',async()=>{
  await open('/login','anonymous');await screen.findByText(/로그인은 준비 중/)
  expect(disabled('카카오로 로그인')).toBe(true)
 })
 it('설정된 소셜 로그인은 선택한 제공자로 전달',async()=>{
  await open('/login','social-enabled');const button=await screen.findByRole('button',{name:'네이버로 로그인'})
  await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));fireEvent.click(button)
  await waitFor(()=>expect(calls.find(c=>c.method==='auth.signInWithProvider')?.args).toEqual(['naver','group']))
 })
 it('비밀번호 찾기는 로컬 이메일로 재설정 요청 및 완료 안내',async()=>{
  await open('/login','anonymous');fireEvent.click(await screen.findByRole('button',{name:'비밀번호 찾기'}))
  const dialog=within(screen.getByRole('dialog'))
  fireEvent.change(dialog.getByRole('textbox',{name:'이메일'}),{target:{value:'local@example.invalid'}})
  fireEvent.click(dialog.getByRole('button',{name:'재설정 메일 보내기'}))
  await screen.findByText(/local@example.invalid 로 메일을 보냈어요/)
  expect(calls.find(c=>c.method==='auth.requestPasswordReset')?.args).toEqual(['local@example.invalid'])
 })
 it('재설정 링크 없는 비로그인 진입은 만료 안내',async()=>{
  await open('/reset-password','anonymous');await screen.findByText('링크가 만료됐거나 잘못됐어요.')
 })
 it('시작 화면에서 선택한 사장님 역할은 소셜 로그인까지 유지',async()=>{
  await open('/start','social-enabled')
  fireEvent.click(await screen.findByRole('button',{name:/가게 사장님/}))
  fireEvent.click(screen.getByRole('button',{name:'로그인'}))
  const button=await screen.findByRole('button',{name:'카카오로 로그인'})
  await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));fireEvent.click(button)
  await waitFor(()=>expect(calls.find(c=>c.method==='auth.signInWithProvider')?.args).toEqual(['kakao','owner']))
 })
 it('시연용 약관 시트 동의가 가입 화면 체크에 반영',async()=>{
  await open('/signup','anonymous')
  fireEvent.click(await screen.findByRole('button',{name:'약관 보기'}))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'동의하고 닫기'}))
  expect((screen.getByRole('checkbox',{name:'이용약관 및 개인정보처리방침에 동의합니다'}) as HTMLInputElement).checked).toBe(true)
 })
 it('공개 빈자리 업종 필터가 목록과 날짜 건수에 함께 적용',async()=>{
  await open('/group/slots','slot-book')
  await screen.findByRole('button',{name:'카페'})
  fireEvent.click(screen.getByRole('button',{name:name=>name.startsWith(dayLabel(kstDay(slot.start_at)))}))
  await screen.findByText('고기굽는집')
  fireEvent.click(screen.getByRole('button',{name:'카페'}))
  await screen.findByText('공개된 빈자리가 없어요')
  expect(screen.queryByText('고기굽는집')).toBeNull()
 })
 it('이번 주 분석은 월요일~오늘 범위로 조회',async()=>{
  vi.setSystemTime(new Date('2026-10-08T12:00:00+09:00'))
  await open('/owner/stats','owner')
  fireEvent.click(await screen.findByRole('button',{name:'이번 주'}))
  await waitFor(()=>expect(calls.filter(c=>c.method==='stats.getStoreStats').at(-1)?.args).toEqual([1,'2026-10-05','2026-10-08']))
 })
 it('알레르기 메모는 주문 저장과 함께 전달',async()=>{
  await open('/group/reservations/1/preorder','reservation')
  fireEvent.change(await screen.findByRole('textbox',{name:/알레르기·식이 제한/}),{target:{value:'견과류 알레르기'}})
  fireEvent.click(screen.getByRole('button',{name:'주문 구성 저장'}))
  await waitFor(()=>expect(calls.find(c=>c.method==='preorder.setPreorderNote')?.args).toEqual([1,'견과류 알레르기']))
 })
 it.each(['-1','1.5','201'])('추가 단체 규모 %s은 변경 저장 차단',async value=>{
  await open('/group/me','reservation')
  fireEvent.change(await screen.findByRole('spinbutton',{name:/평소 인원 규모/}),{target:{value}})
  expect(disabled('변경 내용 저장')).toBe(true)
 })
 it('기타 단체 설명·소속·지역·규모 변환 보존',()=>{
  const f={...groupExtraForm(),description:'독서 모임',affiliation:'광운대',region:'월계동',usual_size:'24'}
  expect(groupExtraValid(f)).toBe(true)
  expect(groupExtraInput(f,'etc')).toEqual({description:'독서 모임',affiliation:'광운대',region:'월계동',usual_size:24})
 })
 it('가게 최대 인원 200명 초과 차단',()=>expect(storeFormValid({name:'가게',phone:'02-000-0000',max_capacity:'201'})).toBe(false))
 it('가게 등록의 업종·상세주소·영업시간·사업자번호를 제출에 포함',async()=>{
  const submit=vi.fn();render(<StoreForm register onSubmit={submit}/>)
  for(const [label,value] of [['가게명','테스트 가게'],['전화번호','02-000-0000'],['단체석 최대 인원','30'],['상세주소 (선택)','2층'],['영업시간 안내 (선택)','10시~22시'],['사업자등록번호 (선택)','000-00-00000']]) fireEvent.change(screen.getByLabelText(label,{exact:false}),{target:{value}})
  fireEvent.click(screen.getByRole('button',{name:/업종/}));fireEvent.click(screen.getByRole('radio',{name:'카페'}))
  fireEvent.submit(document.querySelector('#store-form')!)
  await waitFor(()=>expect(submit).toHaveBeenCalled())
  expect(submit.mock.calls[0][0]).toMatchObject({category:'cafe',address_detail:'2층',hours:'10시~22시',business_no:'000-00-00000'})
 })
})
