// DB 행 타입 (wolgyedeoring-backend 마이그레이션 001~008 기준, 손으로 작성)
// Supabase CLI 로 자동 생성하려면:
//   npx supabase gen types typescript --project-id <프로젝트ID> > src/types/supabase.gen.ts
// 자동 생성 타입으로 바꿔도 아래 이름(Profile, Store …)은 화면 코드에서 그대로 쓰도록 유지하는 것을 권장

export type Role = 'group' | 'owner'
export type GroupType = 'student_council' | 'club' | 'residents' | 'hobby' | 'etc'
export type EventType = 'opening_party' | 'snack_event' | 'after_party' | 'closing_party' | 'etc'
export type MenuCategory = 'main' | 'side' | 'meal' | 'drink' | 'etc'
export type StoreCategory = 'restaurant' | 'cafe' | 'venue' // 011

export type RequestStatus = 'open' | 'confirmed' | 'cancelled' | 'expired'
export type ResponseStatus = 'pending' | 'accepted' | 'declined' | 'modify_requested'
export type ReservationStatus = 'awaiting_payment' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
export type ModifyStatus = 'pending' | 'accepted' | 'rejected'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'
export type ReceiptStatus = 'processing' | 'done' | 'needs_review' | 'failed'
export type SlotStatus = 'open' | 'booked' | 'closed'
export type Confidence = 'high' | 'medium' | 'low'

/** ISO 8601 문자열 (timestamptz) */
export type Timestamp = string

export interface Profile {
  id: string
  role: Role
  display_name: string
  phone: string | null
  created_at: Timestamp
}

export interface Group {
  id: number
  leader_id: string
  name: string
  group_type: GroupType
  // 011 (실행 전 DB 에서는 없음)
  affiliation?: string | null
  region?: string | null
  usual_size?: number | null
  description?: string | null
  created_at: Timestamp
}

export interface Store {
  id: number
  owner_id: string
  name: string
  address: string | null
  max_capacity: number
  phone: string | null // 008
  photo_url: string | null // 008
  intro: string | null // 008, 60자 이하
  lat: number | null // 008
  lng: number | null // 008
  // 011 (실행 전 DB 에서는 없음)
  category?: StoreCategory
  address_detail?: string | null
  hours?: string | null
  business_no?: string | null
  commerce_no?: string | null
  created_at: Timestamp
}

export interface Menu {
  id: number
  store_id: number
  name: string
  price: number | null
  category: MenuCategory
  is_active: boolean
  created_at: Timestamp
  updated_at: Timestamp
}

export interface Slot {
  id: number
  store_id: number
  start_at: Timestamp
  end_at: Timestamp
  capacity: number
  deposit_amount: number
  status: SlotStatus
  // 011 (실행 전 DB 에서는 없음)
  min_headcount?: number | null
  price_per_person?: number | null
  note?: string | null
  created_at: Timestamp
}

export interface Request {
  id: number
  group_id: number
  event_type: EventType
  desired_at: Timestamp
  flexible_days: number
  headcount: number
  budget_per_person: number
  note: string | null
  status: RequestStatus
  response_deadline: Timestamp // 007, 서버가 계산
  created_at: Timestamp
  updated_at: Timestamp
}

export interface RequestResponse {
  id: number
  request_id: number
  store_id: number
  status: ResponseStatus
  deposit_amount: number | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface Reservation {
  id: number
  group_id: number
  store_id: number
  source: 'request' | 'slot'
  request_id: number | null
  slot_id: number | null
  event_type: EventType
  start_at: Timestamp
  headcount: number
  budget_per_person: number | null
  deposit_amount: number
  status: ReservationStatus
  modify_request_used: boolean
  modify_start_at: Timestamp | null
  modify_headcount: number | null
  modify_note: string | null
  preorder_note?: string | null // 011 알레르기·식이 제한
  modify_status: ModifyStatus | null
  preorder_updated_at: Timestamp | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface Payment {
  id: number
  reservation_id: number
  amount: number
  status: PaymentStatus
  pg_provider: string | null
  pg_tx_id: string | null
  order_id: string | null
  method: string | null
  receipt_url: string | null
  paid_at: Timestamp | null
  created_at: Timestamp
}

export interface Receipt {
  id: number
  reservation_id: number
  uploaded_by: string
  status: ReceiptStatus
  is_itemized: boolean | null
  receipt_at: Timestamp | null
  store_name_raw: string | null
  total_amount: number | null
  validation_note: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface ReceiptItem {
  id: number
  receipt_id: number
  raw_name: string
  menu_id: number | null
  qty: number | null
  unit_price: number | null
  amount: number | null
  confidence: Confidence | null
  is_corrected: boolean
  validation_error: string | null
  created_at: Timestamp
}

export type NotificationType =
  | 'request_new'
  | 'request_closed'
  | 'request_accepted'
  | 'reservation_new'
  | 'reservation_confirmed'
  | 'reservation_cancelled'
  | 'reservation_completed'
  | 'reservation_no_show'
  | 'modify_requested'
  | 'modify_accepted'
  | 'modify_rejected'
  | 'preorder_changed'
  | 'rsvp_closed'
  | 'receipt_review'

export interface AppNotification {
  id: number
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  request_id: number | null
  reservation_id: number | null
  receipt_id: number | null
  is_read: boolean
  created_at: Timestamp
}

export interface Rsvp {
  id: number
  reservation_id: number
  token: string
  message: string | null
  deadline: Timestamp
  is_closed: boolean
  closed_at: Timestamp | null
  created_at: Timestamp
}

export interface RsvpResponse {
  id: number
  rsvp_id: number
  name: string
  attending: boolean
  note: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

// ---------------------------------------------------------------------
// RPC 반환 형식
// ---------------------------------------------------------------------

/** open_requests_for_store 한 행 (008) */
export interface OpenRequestForStore {
  request_id: number
  group_name: string
  group_type: GroupType
  event_type: EventType
  desired_at: Timestamp
  flexible_days: number
  headcount: number
  budget_per_person: number
  note: string | null
  my_response: ResponseStatus | null
  my_deposit: number | null
  created_at: Timestamp
  response_deadline: Timestamp
  committed_headcount: number
  remaining_capacity: number
  can_accept: boolean
}

/** reservation_actions (008, B-09) */
export interface ReservationActions {
  reservation_id: number
  role: Role
  status: ReservationStatus
  can_pay: boolean
  pay_method: 'toss' | 'zero'
  can_cancel: boolean
  cancel_via: 'toss' | 'rpc'
  can_modify: boolean
  can_respond_modify: boolean
  can_edit_preorder: boolean
  preorder_deadline: Timestamp | null
  can_rsvp: boolean
  rsvp_open: boolean
  can_finish: boolean
  can_upload_receipt: boolean
  can_view_contacts: boolean
}

/** reservation_contacts (008, B-01) */
export interface ReservationContacts {
  store: { name: string; phone: string | null; address: string | null; owner_name: string; owner_phone: string | null }
  group: { name: string; leader_name: string; leader_phone: string | null }
}

/** request_reach (008, B-05) */
export interface RequestReach {
  notified: number
  available: number
}

/** get_preorder / set_preorder */
export interface PreorderSummary {
  reservation_id: number
  items: { menu_id: number | null; name: string; qty: number; unit_price: number; subtotal: number }[]
  total: number
  headcount: number
  per_person: number
  budget_per_person: number | null
  over_budget: boolean
  editable: boolean
}

/** extract-menu Edge Function */
export interface ExtractedMenuItem {
  name: string
  price: number | null
  category: MenuCategory
  confidence: Confidence
  status: 'new' | 'price_changed' | 'same' | 'reactivate'
  existing_menu_id: number | null
  existing_price: number | null
}
export interface ExtractMenuResult {
  items: ExtractedMenuItem[]
  missing: { menu_id: number; name: string; price: number | null; category: MenuCategory }[]
  note: string | null
}

/** get_rsvp_public */
export interface RsvpPublic {
  group_name: string
  store_name: string
  store_address: string | null
  event_label: string
  start_at: Timestamp
  message: string | null
  deadline: Timestamp
  is_open: boolean
  cancelled: boolean
  attending: number
  capacity: number
  full: boolean
}

/** respond_rsvp */
export interface RsvpRespondResult {
  result: 'created' | 'updated'
  name: string
  attending: boolean
  edit_key: string
  attending_count: number
}

/** store_stats */
export interface StoreStats {
  period: { from: string; to: string }
  summary: { reservations: number; completed: number; no_show: number; cancelled: number; guests: number; revenue: number }
  by_group: { group_id: number; group_name: string; group_type: GroupType; visits: number; revenue: number }[]
  by_menu: { menu: string; qty: number; amount: number }[]
  by_weekday: { dow: number; label: string; reservations: number }[]
  by_month: { month: string; reservations: number; guests: number }[]
}

/** process-receipt Edge Function */
export interface ProcessReceiptResult {
  receipt_id: number
  status: 'done' | 'needs_review' | 'failed'
  notes?: string[]
  items?: {
    raw_name: string
    menu_id: number | null
    qty: number | null
    unit_price: number | null
    amount: number | null
    confidence: Confidence
    validation_error: string | null
  }[]
  error?: string
}

// ---------------------------------------------------------------------
// 좌석 배치도 (009)
// ---------------------------------------------------------------------
import type { Layout, LayoutSummary } from '../lib/layout'
export type { Layout, LayoutTable, LayoutFixture, FixtureKind, Shape } from '../lib/layout'

/** 게시된 배치도 (store_layouts 한 행) */
export interface PublishedLayout {
  store_id: number
  layout: Layout
  table_count: number
  total_seats: number
  source: 'photo' | 'manual'
  published_at: Timestamp
  stores: { name: string; address: string | null; max_capacity: number }
}

/** extract-layout Edge Function */
export interface ExtractLayoutResult {
  layout: Layout
  summary: LayoutSummary
  source_type: 'floor_plan' | 'sketch' | 'photo' | 'other' | string
  note: string | null
}
