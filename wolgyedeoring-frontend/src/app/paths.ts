// 라우트 경로 한곳 관리. 화면 ID는 docs/ui-handoff/ia/IA.md 4장
// 경로를 바꿀 때는 여기만 고친다 (알림 이동 notificationTarget 도 여기 사용)

export const paths = {
  // 공통·인증
  start: '/start', // A-01
  login: '/login', // A-02
  signup: '/signup', // A-03
  onboardingGroup: '/onboarding/group', // A-04
  onboardingStore: '/onboarding/store', // A-05
  notifications: '/notifications', // C-01 (시안 33·34)
  notification: (id: number | string) => `/notifications/${id}`, // C-02 알림 상세 (시안 7·35)
  rsvpPublic: (token: string) => `/r/${token}`, // P-01
  paySuccess: '/pay/success', // G-10
  payFail: '/pay/fail', // G-10

  // 단체 (탭: 홈 · 예약 · 가게 찾기 · 내 정보)
  groupHome: '/group', // G-01
  groupRequestNew: '/group/requests/new', // G-02
  groupRequest: (id: number | string) => `/group/requests/${id}`, // G-03
  groupSlots: '/group/slots', // G-04
  groupSlotBook: (id: number | string) => `/group/slots/${id}/book`, // G-05
  groupReservation: (id: number | string) => `/group/reservations/${id}`, // G-06
  groupPreorder: (id: number | string) => `/group/reservations/${id}/preorder`, // G-07
  groupModify: (id: number | string) => `/group/reservations/${id}/modify`, // G-08
  groupPay: (id: number | string) => `/group/reservations/${id}/pay`, // G-09
  groupReservations: '/group/reservations', // G-11
  groupRsvp: (id: number | string) => `/group/reservations/${id}/rsvp`, // G-12
  groupRsvpResponses: (id: number | string) => `/group/reservations/${id}/rsvp/responses`, // G-13
  groupMe: '/group/me', // G-14
  groupLayouts: (storeId?: number | string) => (storeId ? `/group/layouts?store=${storeId}` : '/group/layouts'), // G-15 가게 좌석 배치도 보기

  // 사장님 (탭: 홈 · 요청·예약 · 메뉴 · 분석, 상단 ⚙ 가게 정보)
  ownerHome: '/owner', // S-01
  ownerInbox: '/owner/inbox', // S-02 (?view=requests) / S-04 (?view=reservations)
  ownerInboxReservations: '/owner/inbox?view=reservations', // S-04
  ownerRequest: (id: number | string) => `/owner/requests/${id}`, // S-03
  ownerReservation: (id: number | string) => `/owner/reservations/${id}`, // S-05
  ownerSlots: '/owner/slots', // S-06
  ownerMenus: '/owner/menus', // S-07
  ownerMenuScan: '/owner/menus/scan', // S-08
  ownerReceiptUpload: (reservationId: number | string) => `/owner/reservations/${reservationId}/receipt`, // S-10
  ownerReceipt: (id: number | string) => `/owner/receipts/${id}`, // S-11
  ownerStats: '/owner/stats', // S-12
  ownerUnmet: '/owner/stats/unmet', // S-13
  ownerStore: '/owner/store', // S-14
  ownerLayout: '/owner/layout', // S-15 좌석 배치도 (명세 7, #5)
} as const

export const homeFor = (role: 'group' | 'owner') => (role === 'owner' ? paths.ownerHome : paths.groupHome)
