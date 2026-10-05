// @vitest-environment happy-dom
// 시연 흐름 통합 테스트: 실제 api 모듈 → supabase-js → Supabase(또는 로컬 PostgREST) → DB
// ⚠️ DB 에 요청·예약을 실제로 만든다. seed_demo.sql 을 실행한 직후 1회만 돌릴 것 (다시 돌리려면 seed 재실행)
// 실행: npm run test:integration  (.env.local 의 VITE_SUPABASE_URL 대상)
import { describe, it, expect } from 'vitest'
import * as api from '../src/api'
import { supabase } from '../src/lib/supabase'
import { ApiError } from '../src/lib/errors'
import { effectiveRequestStatus, RESERVATION_STATUS } from '../src/lib/status'

const D = (days: number, hm = '18:30') => {
  const d = new Date(Date.now() + days * 864e5)
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d)
  return `${ymd}T${hm}:00+09:00`
}
const as = (email: string) => api.auth.signIn(email, 'demo1234!')
const ctx: Record<string, any> = {}

describe.sequential('시연 흐름 (실제 api 모듈 → supabase-js → PostgREST → DB)', () => {
  it('로그인 실패 메시지', async () => {
    await expect(api.auth.signIn('sw@wolgye.demo', 'wrong')).rejects.toBeInstanceOf(ApiError)
  })

  it('사장님: 프로필·가게·받은 요청', async () => {
    await as('owner1@wolgye.demo')
    const me = (await api.auth.getMe())!
    expect(me.role).toBe('owner')
    expect(me.phone).toBe('010-0000-0001')
    const store = (await api.stores.getMyStore(me.id))!
    expect(store.name).toBe('고기굽는집')
    expect(store.phone).toBeTruthy()
    const list = await api.requests.listOpenRequestsForStore(store.id)
    expect(list.length).toBe(2)
    expect(list[0]).toHaveProperty('response_deadline')
    expect(list[0]).toHaveProperty('can_accept', true)
    Object.assign(ctx, { owner1: me, meat: store })
  })

  it('단체: 가게 수 미리보기 → 요청 → 메모 수정, 상태 직접 수정은 거절', async () => {
    await as('sw@wolgye.demo')
    const me = (await api.auth.getMe())!
    const g = (await api.groups.getMyGroup(me.id))!
    expect(g.name).toBe('소프트웨어학부 학생회')
    const when = D(12)
    const reach = await api.requests.requestReach(24, when)
    expect(reach.notified).toBe(3)
    const r = await api.requests.createRequest({ group_id: g.id, event_type: 'opening_party', desired_at: when, headcount: 24, budget_per_person: 25000 })
    expect(r.status).toBe('open')
    expect(r.response_deadline).toBeTruthy()
    expect(effectiveRequestStatus(r)).toBe('open')
    const r2 = await api.requests.updateRequestNote(r.id, '개강총회 뒤 식사')
    expect(r2.note).toBe('개강총회 뒤 식사')
    const bad = await supabase.from('requests').update({ status: 'confirmed' }).eq('id', r.id)
    expect(bad.error?.code).toBe('42501')
    const badRole = await supabase.from('profiles').update({ role: 'owner' }).eq('id', me.id)
    expect(badRole.error?.code).toBe('42501')
    Object.assign(ctx, { sw: me, group: g, req: r })
  })

  it('사장님 2명 경쟁: 먼저 수락한 고기굽는집만 확정, 늦은 월계치킨은 closed', async () => {
    await as('owner1@wolgye.demo')
    await api.requests.acceptRequest(ctx.req.id, ctx.meat.id, 50000)
    await as('owner2@wolgye.demo')
    const me = (await api.auth.getMe())!
    const chicken = (await api.stores.getMyStore(me.id))!
    const err = await api.requests.acceptRequest(ctx.req.id, chicken.id, 30000).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.kind).toBe('closed')
    const n = await api.notifications.listNotifications()
    expect(n.some((x) => x.type === 'request_closed' && x.request_id === ctx.req.id)).toBe(true)
    const direct = await supabase.from('request_responses').insert({ request_id: ctx.req.id, store_id: chicken.id, status: 'accepted' })
    expect(direct.error?.code).toBe('42501')
  })

  it('단체: 수락 알림 1건 → 예약 상세·행동 플래그·연락처', async () => {
    await as('sw@wolgye.demo')
    const n = (await api.notifications.listNotifications()).filter((x) => x.request_id === ctx.req.id)
    expect(n.map((x) => x.type)).toEqual(['request_accepted'])
    expect(n[0].reservation_id).toBeTruthy()
    expect(api.notifications.notificationTarget(n[0], 'group')).toBe(`/group/reservations/${n[0].reservation_id}`)
    const res = (await api.requests.getReservationForRequest(ctx.req.id))!
    expect(res.stores.name).toBe('고기굽는집')
    expect(RESERVATION_STATUS[res.status].label).toBe('결제 대기')
    const act = await api.reservations.getActions(res.id)
    expect(act).toMatchObject({ role: 'group', can_pay: true, pay_method: 'toss', can_cancel: true, cancel_via: 'rpc', can_modify: true, can_finish: false })
    const c = await api.reservations.getContacts(res.id)
    expect(c.store.owner_phone).toBe('010-0000-0001')
    expect((await api.requests.getRequest(ctx.req.id)).status).toBe('confirmed')
    ctx.res = res
  })

  it('단체: 사전 주문 → 테스트 결제 → 확정, 참석 조사 생성', async () => {
    const menus = await api.menus.listMenus(ctx.meat.id)
    const sam = menus.find((m) => m.name === '삼겹살')!
    const p = await api.preorder.setPreorder(ctx.res.id, [{ menu_id: sam.id, qty: 24 }])
    expect(p.total).toBe(24 * 15000)
    expect(p.over_budget).toBe(false)
    const paid = await api.payments.payDepositTest(ctx.res.id)
    expect(paid.status).toBe('confirmed')
    const act = await api.reservations.getActions(ctx.res.id)
    expect(act).toMatchObject({ can_pay: false, can_modify: false, can_edit_preorder: true, can_rsvp: true })
    const rv = await api.rsvp.createRsvp(ctx.res.id, { message: '참석 여부 알려주세요' })
    expect(api.rsvp.rsvpLink(rv.token)).toContain(`/r/${rv.token}`)
    ctx.rsvp = rv
  })

  it('구성원(로그인 없음): 참석 응답 → 예약 인원 반영, 같은 기기 수정', async () => {
    await api.auth.signOut()
    const pub = await api.rsvp.getRsvpPublic(ctx.rsvp.token)
    expect(pub.store_name).toBe('고기굽는집')
    expect(pub.is_open).toBe(true)
    const a = await api.rsvp.respondRsvp(ctx.rsvp.token, '김민준', true)
    expect(a.result).toBe('created')
    const b = await api.rsvp.respondRsvp(ctx.rsvp.token, '김민준', true, '30분 늦어요')
    expect(b.result).toBe('updated')
    await api.rsvp.respondRsvp(ctx.rsvp.token, '이서준', true)
    expect((await api.rsvp.getRsvpPublic(ctx.rsvp.token)).attending).toBe(2)
    const anonRead = await supabase.from('rsvp_responses').select('*')
    expect(anonRead.data ?? []).toHaveLength(0)
  })

  it('단체 대표: 명단 조회·마감, 사장님: 인원 반영 확인, 행사 전 완료 처리 거절', async () => {
    await as('sw@wolgye.demo')
    const list = await api.rsvp.listRsvpResponses(ctx.rsvp.rsvp_id)
    expect(list.map((x) => x.name).sort()).toEqual(['김민준', '이서준'])
    const closed = await api.rsvp.closeRsvp(ctx.res.id)
    expect(closed.headcount).toBe(2)
    await as('owner1@wolgye.demo')
    const r = await api.reservations.getReservation(ctx.res.id)
    expect(r.headcount).toBe(2)
    expect(r.groups.name).toBe('소프트웨어학부 학생회')
    const err = await api.reservations.finishReservation(ctx.res.id).catch((e) => e)
    expect(err.message).toContain('이후에 완료')
    const n = await api.notifications.listNotifications()
    expect(n.some((x) => x.type === 'rsvp_closed')).toBe(true)
    expect(n.filter((x) => x.reservation_id === ctx.res.id && x.type === 'reservation_new')).toHaveLength(0)
  })

  it('사장님: 빈 날짜 닫기/열기, 예약된 날짜는 거절', async () => {
    const slots = await api.slots.listMySlots(ctx.meat.id)
    const open = slots.find((s) => s.status === 'open')!
    expect((await api.slots.setSlotClosed(open.id, true)).status).toBe('closed')
    expect((await api.slots.setSlotClosed(open.id, false)).status).toBe('open')
    await as('owner2@wolgye.demo')
    const me = (await api.auth.getMe())!
    const chicken = (await api.stores.getMyStore(me.id))!
    const booked = (await api.slots.listMySlots(chicken.id)).find((s) => s.status === 'booked')!
    const err = await api.slots.setSlotClosed(booked.id, true).catch((e) => e)
    expect(err.message).toContain('예약이 잡힌 날짜')
  })

  it('단체: 빈 날짜 목록·요청 철회', async () => {
    await as('band@wolgye.demo')
    const slots = await api.slots.listOpenSlots()
    expect(slots.length).toBeGreaterThan(0)
    expect(slots[0].stores).toHaveProperty('lat')
    const me = (await api.auth.getMe())!
    const g = (await api.groups.getMyGroup(me.id))!
    const mine = await api.requests.listMyRequests(g.id)
    const open = mine.find((r) => r.status === 'open')!
    const c = await api.requests.cancelRequest(open.id)
    expect(c.status).toBe('cancelled')
    expect(await api.requests.countDeclined(open.id)).toBe(0)
  })

  it('사장님: 영수증 보정 화면 데이터·통계', async () => {
    await as('owner1@wolgye.demo')
    const { data } = await supabase.from('receipts').select('id').eq('status', 'needs_review').limit(1).single()
    const rc = await api.receipts.getReceipt(data!.id)
    expect(rc.receipt_items.length).toBe(5)
    expect(rc.receipt_items.some((i) => i.validation_error)).toBe(true)
    const err = await api.receipts.confirmReceipt(rc.id).catch((e) => e)
    expect(err.message).toContain('확인이 필요한 품목')
    const st = await api.stats.getStoreStats(ctx.meat.id)
    expect(st.by_weekday).toHaveLength(7)
    expect(st.summary.reservations).toBeGreaterThan(0)
    const u = await api.stats.getUnmetDemand()
    expect(u.accepted_but_not_chosen).toBe(0)
  })
})
