// ISOLATED LOCAL AUDIT ONLY. No production requests, credentials, photos, or writes.
export let scenario =
  new URLSearchParams(location.search).get('case') ?? 'receipt-mismatch'
export const calls: { method: string; args: unknown[] }[] = []
export function setScenario(value: string) {
  scenario = value
  calls.length = 0
  items = makeItems()
  opened = []
  slotAttempts = 0
  batchResults.clear()
}
const clone = (v: any) => structuredClone(v)
const timestamp = new Date().toISOString()
const future = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
export const group = {
  id: 1,
  leader_id: 'local-group',
  name: '로컬 테스트 단체',
  group_type: 'club',
  created_at: timestamp,
}
export const store = {
  id: 1,
  owner_id: 'local-owner',
  name: '고기굽는집',
  address: '서울 노원구 월계동',
  max_capacity: 30,
  phone: null,
  photo_url: null,
  intro: '로컬 점검용 가게',
  lat: null,
  lng: null,
  created_at: timestamp,
}
export const menuList = [
  {
    id: 1,
    store_id: 1,
    name: '맥주',
    price: 5000,
    category: 'drink',
    is_active: true,
    created_at: timestamp,
    updated_at: timestamp,
  },
  {
    id: 2,
    store_id: 1,
    name: '비빔밥',
    price: 7500,
    category: 'meal',
    is_active: true,
    created_at: timestamp,
    updated_at: timestamp,
  },
]
export const request = {
  id: 1,
  request_id: 1,
  group_id: 1,
  group_name: group.name,
  group_type: group.group_type,
  event_type: 'etc',
  desired_at: future + 'T19:00:00+09:00',
  flexible_days: 0,
  headcount: 24,
  budget_per_person: 25000,
  note: '[모임:회식] 로컬 테스트',
  status: 'open',
  response_deadline: future + 'T18:00:00+09:00',
  created_at: timestamp,
  updated_at: timestamp,
  my_response: null,
  my_deposit: null,
  committed_headcount: 0,
  remaining_capacity: 30,
  can_accept: true,
}
export const reservation = {
  id: 1,
  group_id: 1,
  store_id: 1,
  source: 'request',
  request_id: 1,
  slot_id: null,
  event_type: 'etc',
  start_at: future + 'T18:30:00+09:00',
  headcount: 24,
  budget_per_person: 25000,
  deposit_amount: 100000,
  status: 'awaiting_payment',
  modify_request_used: false,
  modify_start_at: null,
  modify_headcount: null,
  modify_note: null,
  modify_status: null,
  preorder_updated_at: null,
  created_at: timestamp,
  updated_at: timestamp,
  groups: group,
  stores: store,
  requests: request,
}
export const slot = {
  id: 1,
  store_id: 1,
  start_at: future + 'T18:00:00+09:00',
  end_at: future + 'T20:00:00+09:00',
  capacity: 30,
  deposit_amount: 100000,
  status: 'open',
  created_at: timestamp,
  stores: store,
}
function makeItems() {
  return scenario === 'receipt-empty'
    ? []
    : [
        {
          id: 1,
          receipt_id: 1,
          raw_name: '맥 주',
          menu_id: 1,
          qty: 10,
          unit_price: 5000,
          amount: scenario === 'receipt-mismatch' ? 45000 : 50000,
          confidence: scenario === 'receipt-low' ? 'low' : 'high',
          is_corrected: false,
          validation_error:
            scenario === 'receipt-mismatch'
              ? 'qty*unit_price != amount'
              : scenario === 'receipt-low'
                ? 'low confidence'
                : null,
          created_at: timestamp,
          menus: { name: '맥주' },
        },
      ]
}
let items = makeItems()
let opened: any[] = []
let slotAttempts = 0
const batchResults = new Map<string, any[]>()
const record = (method: string, args: unknown[]) => {
  calls.push({ method, args: clone(args) })
  if (typeof window !== 'undefined')
    window.dispatchEvent(new Event('audit-call'))
}
function api(namespace: string, methods: Record<string, (...a: any[]) => any>) {
  return new Proxy(methods, {
    get(target, key: string) {
      if (key === 'then') return undefined
      if (
        [
          'onAuthChange',
          'subscribeNotifications',
          'subscribeRsvpResponses',
          'rsvpLink',
          'notificationTarget',
        ].includes(key)
      )
        return target[key]
      return async (...args: any[]) => {
        record(namespace + '.' + key, args)
        if (!(key in target))
          throw new Error('점검 응답 미설정: ' + namespace + '.' + key)
        return clone(await target[key](...args))
      }
    },
  })
}
export const auth = api('auth', {
  getMe: () => {
    if (['anonymous', 'start'].includes(scenario)) return null
    const role =
      scenario === 'wrong-role'
        ? 'group'
        : location.pathname.startsWith('/owner')
          ? 'owner'
          : 'group'
    return {
      id: 'local-' + role,
      role,
      display_name: '로컬 점검',
      phone: null,
      created_at: timestamp,
    }
  },
  signOut: () => null,
  signIn: () => ({ session: null }),
  signUp: () => ({ session: null }),
  updateMe: () => null,
})
// Subscription functions return cleanup synchronously, as the real client does.
auth.onAuthChange = () => () => {}
export const groups = api('groups', {
  getMyGroup: () => group,
  updateGroup: (_id: any, data: any) => ({ ...group, ...data }),
  createGroup: () => group,
})
export const stores = api('stores', {
  getMyStore: () => store,
  getStore: () => store,
  listStores: () => [store],
  updateStore: (_id: any, data: any) => ({ ...store, ...data }),
})
export const menus = api('menus', {
  listMenus: () => (scenario === 'empty' ? [] : menuList),
  saveMenus: () => menuList,
  updateMenu: () => null,
  setMenuActive: () => null,
  extractMenu: () => ({ items: [], missing: [], note: null }),
})
export const receipts = api('receipts', {
  getReceipt: () => {
    if (scenario === 'receipt-load-fail') throw new TypeError('Failed to fetch')
    return {
      id: 1,
      reservation_id: 1,
      uploaded_by: 'local-owner',
      status: scenario === 'receipt-done' ? 'done' : 'needs_review',
      is_itemized: true,
      receipt_at: timestamp,
      store_name_raw: store.name,
      total_amount: 50000,
      validation_note: null,
      created_at: timestamp,
      updated_at: timestamp,
      receipt_items: items,
    }
  },
  listReceiptsForReservation: () => [],
  listReceiptsNeedingReview: () => [],
  correctItem: (id: number, menu: number, qty: number, price: number) => {
    if (scenario === 'receipt-save-fail') throw new TypeError('Failed to fetch')
    if (
      !Number.isInteger(qty) ||
      qty <= 0 ||
      !Number.isInteger(price) ||
      price < 0
    )
      throw new Error('수량과 단가를 확인하세요')
    items = items.map((i) =>
      i.id === id
        ? {
            ...i,
            menu_id: menu,
            qty,
            unit_price: price,
            amount: qty * price,
            validation_error: null,
            is_corrected: true,
          }
        : i,
    )
  },
  deleteItem: (id: number) => {
    items = items.filter((i) => i.id !== id)
  },
  addItem: (rc: number, menu: number, qty: number, price: number) => {
    if (scenario === 'receipt-add-fail') throw new TypeError('Failed to fetch')
    items.push({
      id: items.length + 2,
      receipt_id: rc,
      raw_name: '비빔밥',
      menu_id: menu,
      qty,
      unit_price: price,
      amount: qty * price,
      confidence: 'high',
      is_corrected: true,
      validation_error: null,
      created_at: timestamp,
      menus: { name: '비빔밥' },
    })
  },
  confirmReceipt: () => {
    if (!items.length)
      throw new Error('품목이 하나도 없습니다. 품목을 추가하세요')
    if (items.some((i) => i.validation_error || !i.menu_id))
      throw new Error('확인이 필요한 품목이 남아 있습니다')
    return { status: 'done', persistedItems: items }
  },
  resizeImageToBase64: () => 'LOCAL_FAKE_IMAGE',
  processReceipt: () => ({ receipt_id: 1, status: 'needs_review' }),
})
const actions = {
  reservation_id: 1,
  role: 'group',
  status: 'awaiting_payment',
  can_pay: true,
  pay_method: 'toss',
  can_cancel: true,
  cancel_via: 'rpc',
  can_modify: true,
  can_respond_modify: false,
  can_edit_preorder: true,
  preorder_deadline: future + 'T18:30:00+09:00',
  can_rsvp: true,
  rsvp_open: true,
  can_finish: false,
  can_upload_receipt: false,
  can_view_contacts: false,
}
const reservationForCase = () =>
  scenario === 'pay-confirmed'
    ? { ...reservation, status: 'confirmed' }
    : scenario === 'pay-zero-confirmed'
      ? { ...reservation, status: 'confirmed', deposit_amount: 0 }
      : reservation
export const reservations = api('reservations', {
  getReservation: reservationForCase,
  listMyReservations: () =>
    scenario === 'empty' ? [] : [reservationForCase()],
  listStoreReservations: () => [reservationForCase()],
  getActions: () => actions,
  getLatestPayment: () => null,
  getContacts: () => ({
    store: {
      name: store.name,
      phone: null,
      address: store.address,
      owner_name: '로컬 사장님',
      owner_phone: null,
    },
    group: { name: group.name, leader_name: '로컬 단체장', leader_phone: null },
  }),
  requestModification: () => null,
  bookSlot: () => ({ id: 1 }),
  cancelReservation: () => null,
  finishReservation: () => null,
  respondModification: () => null,
})
export const requests = api('requests', {
  listMyRequests: () => (scenario === 'empty' ? [] : [request]),
  getRequest: () =>
    scenario === 'request-expired'
      ? {
          ...request,
          status: 'expired',
          response_deadline: new Date(Date.now() - 864e5).toISOString(),
        }
      : request,
  countDeclined: () => 0,
  getResponses: () => [],
  listOpenRequestsForStore: () => [request],
  getReservationForRequest: () => null,
  createRequest: () => request,
  requestReach: () => ({ notified: 1, available: 1 }),
  cancelRequest: () => null,
  acceptRequest: () => null,
  declineRequest: () => null,
})
export const slots = api('slots', {
  listMySlots: () => opened,
  listOpenSlots: () => (scenario === 'empty' ? [] : [slot]),
  openSlots: (_store: number, key: string, input: any[]) => {
    slotAttempts++
    if (batchResults.has(key)) return batchResults.get(key)
    if (scenario === 'slot-partial' && slotAttempts === 1)
      throw new TypeError('Failed to fetch')
    const result = input.map((s, i) => ({
      id: opened.length + i + 1,
      status: 'open',
      store_id: _store,
      ...s,
    }))
    opened.push(...result)
    batchResults.set(key, result)
    if (scenario === 'slot-timeout' && slotAttempts === 1)
      throw new TypeError('Failed to fetch')
    return result
  },
  setSlotClosed: () => null,
})
export const stats = api('stats', {
  getStoreStats: () => ({
    period: { from: timestamp, to: timestamp },
    summary: {
      reservations: 0,
      completed: 0,
      no_show: 0,
      cancelled: 0,
      guests: 0,
      revenue: 0,
    },
    by_group: [],
    by_menu: [],
    by_weekday: [],
    by_month: [],
  }),
  getUnmetRequests: () => [],
  getUnmetDemand: () => ({
    total_unmet: 0,
    by_event: [],
    by_size: [],
    by_week: [],
  }),
})
export const preorder = api('preorder', {
  getPreorder: () => ({
    reservation_id: 1,
    items: [],
    total: 0,
    headcount: 24,
    per_person: 0,
    budget_per_person: 25000,
    over_budget: false,
    editable: true,
  }),
  setPreorder: () => null,
})
export const payments = api('payments', {
  confirmPaymentFromUrl: () => null,
  confirmZeroDeposit: () => null,
  payDepositTest: () => null,
  startDepositPayment: () => null,
})
export const notifications = api('notifications', {
  listNotifications: () => [],
  markRead: () => null,
  getNotification: () => null,
})
notifications.subscribeNotifications = () => () => {}
export const rsvp = api('rsvp', {
  getRsvpForReservation: () =>
    ['rsvp-after-first', 'rsvp-zero'].includes(scenario)
      ? {
          id: 1,
          reservation_id: 1,
          token: 'local',
          message: null,
          deadline: future + 'T17:00:00+09:00',
          is_closed: false,
          expected_headcount: 24,
          created_at: timestamp,
        }
      : null,
  listRsvpResponses: () =>
    scenario === 'rsvp-after-first'
      ? [
          {
            id: 1,
            rsvp_id: 1,
            name: '로컬 응답자',
            attending: true,
            note: null,
            created_at: timestamp,
            updated_at: timestamp,
          },
        ]
      : [],
  createRsvp: () => ({ id: 1 }),
  getRsvpPublic: () => ({
    group_name: group.name,
    store_name: store.name,
    store_address: null,
    event_label: '회식',
    start_at: reservation.start_at,
    message: null,
    deadline: future + 'T17:00:00+09:00',
    is_open: scenario !== 'rsvp-closed',
    cancelled: scenario === 'rsvp-cancelled',
    attending: 2,
    capacity: 30,
    full: scenario === 'rsvp-full',
  }),
  respondRsvp: (_token: any, name: string, attending: boolean) => ({
    result: 'created',
    name,
    attending,
    edit_key: 'local-key',
    attending_count: 3,
  }),
})
// Non-promise helper in the real API.
rsvp.rsvpLink = (token: string) => location.origin + '/r/' + token
rsvp.subscribeRsvpResponses = () => () => {}
export const layouts = api('layouts', {
  getMyLayout: () => null,
  listPublishedLayouts: () => [],
  getPublishedLayout: () => null,
})
export const getOpened = () => clone(opened)
export const getItems = () => clone(items)
