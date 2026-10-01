# 월계더링 API 문서 (프런트용)

모든 호출은 `@supabase/supabase-js` 클라이언트로 한다. 로그인한 상태여야 한다.

```js
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)  // URL·anon key 는 백엔드 담당에게 받기
```

**규칙:** 조회와 기본 정보 등록은 테이블에 직접, **상태가 바뀌는 동작은 반드시 `rpc`** 로 호출한다.
(예약·결제·영수증 품목은 테이블에 직접 쓰면 권한 오류가 난다.)

에러는 `{ data, error }` 의 `error.message` 에 한글 사유가 담겨 온다. 그대로 사용자에게 보여줘도 된다.

---

## 1. 회원가입 / 로그인

```js
// 가입: role 은 'group'(단체 대표) 또는 'owner'(사장님)
await supabase.auth.signUp({
  email, password,
  options: { data: { role: 'owner', display_name: '홍길동' } }
})
await supabase.auth.signInWithPassword({ email, password })

// 내 정보
const { data: me } = await supabase.from('profiles').select('*').single()
```

---

## 2. 기본 정보 등록 (테이블 직접)

| 누가 | 동작 | 코드 |
|---|---|---|
| 단체 | 단체 만들기 | `supabase.from('groups').insert({ leader_id: me.id, name, group_type })` |
| 사장님 | 가게 등록 | `supabase.from('stores').insert({ owner_id: me.id, name, address, max_capacity })` |
| 사장님 | 메뉴 등록 | 메뉴판 사진 인식 또는 직접 입력 → `rpc('save_menus')` (아래 2-1 참고) |
| 사장님 | 빈 날짜 열기 | `supabase.from('slots').insert({ store_id, start_at, end_at, capacity, deposit_amount })` |
| 단체 | 요청 보내기 | `supabase.from('requests').insert({ group_id, event_type, desired_at, flexible_days, headcount, budget_per_person, note })` |

**코드값**
- `group_type`: `student_council` 학생회, `club` 동아리, `residents` 주민모임, `hobby` 동호회, `etc` 기타
- `category`(메뉴 분류): `main` 메인, `side` 곁들임, `meal` 식사, `drink` 주류·음료, `etc` 기타
- `event_type`: `opening_party` 개강총회, `snack_event` 간식행사, `after_party` 뒤풀이, `closing_party` 종강총회, `etc` 기타
- 시간은 ISO 문자열로 (`'2026-10-14T19:00:00+09:00'`)

---

### 2-1. 메뉴판 사진으로 메뉴 등록 (사장님)

```js
// 1) 인식: DB 에 저장되지 않음. 결과를 편집 화면에 채우기
const { data } = await supabase.functions.invoke('extract-menu', {
  body: { store_id, image_base64, media_type: 'image/jpeg' }
})
// data.items: [{ name, price, category, confidence, status, existing_menu_id, existing_price }]
//   status: 'new' 신규 | 'price_changed' 가격 변경 | 'same' 동일 | 'reactivate' 판매 중지였던 메뉴
//   price 가 null 이면 읽지 못한 것 → 입력칸 비워서 표시
// data.missing: 이번 메뉴판에 없는 기존 메뉴 → "판매 중지할까요?" 확인용
// data.note: 안내 문구 (없으면 null)

// 2) 사장님이 수정·추가·삭제한 목록 저장
await supabase.rpc('save_menus', {
  p_store_id,
  p_items: [{ name: '삼겹살', price: 16000, category: 'main' }, /* ... */],
  p_deactivate_missing: false     // true 면 목록에 없는 기존 메뉴 판매 중지
})
// → { inserted, updated, deactivated }
```

화면 팁
- `confidence: 'low'` 나 `price: null` 인 줄을 강조해서 확인 유도
- `price_changed` 는 "15,000 → 16,000" 처럼 기존 가격과 함께 표시
- 이름은 같은 메뉴로 인식되면 기존 이름으로 맞춰서 돌려주므로 그대로 저장하면 됨
- 메뉴판이 여러 장이면 장마다 인식 후 목록을 합쳐서 한 번에 저장
- 직접 입력도 같은 `save_menus` 사용. 판매 중지 메뉴도 과거 기록 보존을 위해 삭제하지 않음

메뉴 목록 조회 (누구나): `supabase.from('menus').select('*').eq('store_id', id).eq('is_active', true).order('category')`

## 3. 예약 흐름 (rpc)

### ① 단체가 먼저 요청하는 경우

```
단체: requests insert → 사장님: respond_to_request → 단체: choose_response → pay_deposit_test → 확정
```

```js
// [사장님] 내 가게가 받을 수 있는 열린 요청 (인원 조건 충족, 내 응답 상태 포함, 지난 요청 자동 만료)
supabase.rpc('open_requests_for_store', { p_store_id })

// [사장님] 수락(예약금 5만원) / 거절
supabase.rpc('respond_to_request', { p_request_id, p_store_id, p_accept: true, p_deposit_amount: 50000 })
supabase.rpc('respond_to_request', { p_request_id, p_store_id, p_accept: false })

// [단체] 내 요청에 온 응답 보기
supabase.from('request_responses').select('*, stores(name, address)').eq('request_id', id)

// [단체] 수락한 가게 중 하나 선택 + 그 가게 메뉴 사전 주문 → 예약 생성 (결제 대기)
supabase.rpc('choose_response_with_menu', { p_response_id, p_items: [{ menu_id: 12, qty: 20 }, { menu_id: 15, qty: 30 }] })
// 메뉴 없이 예약만: supabase.rpc('choose_response', { p_response_id })
```

### ② 가게가 먼저 연 날짜를 고르는 경우

```js
// [단체] 열린 날짜 목록
supabase.from('slots').select('*, stores(name, address)').eq('status', 'open').gte('start_at', new Date().toISOString())

// [단체] 날짜 선택 + 메뉴 사전 주문 → 예약 생성 (결제 대기)
supabase.rpc('book_slot_with_menu', {
  p_slot_id, p_group_id, p_event_type: 'after_party', p_headcount: 25,
  p_items: [{ menu_id: 12, qty: 20 }], p_budget_per_person: 20000
})
// 메뉴 없이 예약만: supabase.rpc('book_slot', { p_slot_id, p_group_id, p_event_type, p_headcount, p_budget_per_person })
```

### 공통: 예약금 결제 (토스페이먼츠)

```js
// 1) 주문 준비: 주문번호·금액은 서버(DB)가 정함
const { data: prep } = await supabase.rpc('prepare_deposit_payment', { p_reservation_id })
// prep = { order_id, amount, order_name }

// 2) 토스 결제창 (웹 기준 예시, SDK v2) — 정확한 사용법은 토스 공식 문서 확인
import { loadTossPayments } from '@tosspayments/tosspayments-sdk'
const toss = await loadTossPayments(TOSS_CLIENT_KEY)          // 테스트 클라이언트 키 (백엔드 시크릿 키와 같은 세트)
await toss.payment({ customerKey: me.id }).requestPayment({
  method: 'CARD',
  amount: { currency: 'KRW', value: prep.amount },
  orderId: prep.order_id,
  orderName: prep.order_name,
  successUrl: `${location.origin}/pay/success`,
  failUrl: `${location.origin}/pay/fail`,
})

// 3) successUrl 페이지: 주소의 paymentKey, orderId, amount 를 그대로 서버로
const q = new URLSearchParams(location.search)
const { data, error } = await supabase.functions.invoke('toss-payment', {
  body: { action: 'confirm', paymentKey: q.get('paymentKey'), orderId: q.get('orderId'), amount: Number(q.get('amount')) }
})
// 성공: data = { ok: true, reservation, receipt_url }  → 예약 확정
// 실패: error 메시지 표시. 확정 불가 시 서버가 자동 환불함
```

- **예약금 0원 예약**(간식행사 등): 결제 없이 `supabase.rpc('confirm_zero_deposit', { p_reservation_id })`
- 결제창을 다시 열면 `prepare_deposit_payment` 를 다시 호출 (이전 주문번호는 자동 무효)
- 시연용 가짜 결제 `pay_deposit_test` 도 그대로 사용 가능 (토스 연동 전 화면 개발용)

### 공통: 취소 · 완료

```js
// [단체/사장님] 취소 — 토스 결제된 예약은 환불과 함께 이 방법으로만 취소 가능
supabase.functions.invoke('toss-payment', { body: { action: 'cancel', reservation_id, reason: '일정 변경' } })
// 결제 전이거나 테스트 결제 예약은 rpc 로도 가능
supabase.rpc('cancel_reservation', { p_reservation_id })

// [사장님] 행사 끝 → completed / 노쇼 → no_show
supabase.rpc('finish_reservation', { p_reservation_id })
supabase.rpc('finish_reservation', { p_reservation_id, p_no_show: true })

// 내 예약 목록 (단체·사장님 모두 자기 것만 보임)
supabase.from('reservations').select('*, groups(name), stores(name)').order('start_at')
```

### 사전 주문 (예약 시 메뉴 선택)

메뉴 선택과 예약은 한 번에 처리된다(위 `*_with_menu`). 메뉴가 잘못되면 예약도 만들어지지 않는다.

```js
// 조회 (단체·사장님)
const { data } = await supabase.rpc('get_preorder', { p_reservation_id })
// { items: [{ menu_id, name, qty, unit_price, subtotal }], total, headcount, per_person,
//   budget_per_person, over_budget, editable }

// 수정 (단체 대표, 전체 교체). 빈 배열이면 비우기
await supabase.rpc('set_preorder', { p_reservation_id, p_items: [{ menu_id: 12, qty: 25 }] })  // 반환 형식은 조회와 동일
```

- 수정 가능: 결제 대기 중, 또는 확정 후 **행사 24시간 전까지** (`editable` 로 확인)
- 확정 후 수정하면 사장님에게 `preorder_changed` 알림
- 가격은 주문 시점 가격으로 고정 (이후 메뉴 가격이 바뀌어도 유지)
- `over_budget`: 사전 주문 합계가 1인 예산 × 인원을 넘으면 true (막지는 않음, 화면 경고용)
- 판매 중지·가격 없는 메뉴, 다른 가게 메뉴는 주문 불가
- 선택 화면 금액 미리보기는 프런트에서 `메뉴 가격 × 수량` 합산, 저장 결과는 서버 반환값 사용

### 조건 수정 요청 (결제 전 1회)

```js
// [단체] 인원·날짜 변경 요청 (슬롯 예약은 인원만). 응답 전까지 결제 불가
supabase.rpc('request_modification', { p_reservation_id, p_headcount: 38, p_note: '인원 늘었어요' })
// [사장님] 수락 → 예약에 반영 / 거절
supabase.rpc('respond_modification', { p_reservation_id, p_accept: true })
```

예약의 `modify_status`: `null` 요청 안 함, `pending` 대기, `accepted`, `rejected`

**예약 상태:** `awaiting_payment` 결제 대기 → `confirmed` 확정 → `completed` 완료 / `cancelled` 취소 / `no_show` 노쇼

---

## 4. 영수증

### 업로드 (확정 또는 완료된 예약만)

이미지는 서버에 저장되지 않는다. 업로드 전에 앱에서 **긴 변 1500px 정도로 줄이고 JPEG 로 압축**하는 것을 권장 (속도·비용).

```js
const { data, error } = await supabase.functions.invoke('process-receipt', {
  body: { reservation_id, image_base64, media_type: 'image/jpeg' }
})
// data = { receipt_id, status: 'done' | 'needs_review' | 'failed', notes: [...], items: [...] }
```

- `done`: 검증 통과, 통계에 바로 반영
- `needs_review`: 사장님 확인 필요. `notes` 에 사유, 품목별 `validation_error` 에 문제
- `failed`: 인식 실패, 다시 찍어서 올리도록 안내

### 보정 (사장님)

```js
// 영수증과 품목 보기
supabase.from('receipts').select('*, receipt_items(*, menus(name))').eq('id', receipt_id).single()

// 품목 수정 (금액은 수량×단가로 자동 계산)
supabase.rpc('correct_receipt_item', { p_item_id, p_menu_id, p_qty, p_unit_price })
// 품목 추가 (품목 없는 영수증이거나 빠진 줄)
supabase.rpc('add_receipt_item', { p_receipt_id, p_menu_id, p_qty, p_unit_price })
// 잘못 읽힌 줄 삭제
supabase.rpc('delete_receipt_item', { p_item_id })
// 확정 → done (메뉴 미매칭·오류 품목이 남아 있으면 거절됨)
supabase.rpc('confirm_receipt', { p_receipt_id })
```

화면 팁: `validation_error` 가 있는 품목만 빨갛게 표시하고, 메뉴는 `menus` 목록에서 고르게 하면 된다.

---

## 4-1. 참석 조사 (RSVP)

예약된 행사(결제 대기·확정)에 대해 단체 대표가 링크를 만들고, 구성원은 **로그인 없이** 웹앱의 `/r/:token` 화면에서 응답한다.
참석 인원은 **예약 인원(`reservations.headcount`)에 자동 반영**된다.

### 대표 (앱)

```js
// 조사 만들기 (이미 있으면 같은 링크 반환, 마감된 조사는 다시 열림)
const { data } = await supabase.rpc('create_rsvp', {
  p_reservation_id,
  p_deadline: null,                       // 생략 시 행사 24시간 전
  p_message: '금요일 공연 뒤풀이! 참석 여부 알려주세요'
})
const link = `${location.origin}/r/${data.token}`   // 카톡 공유하기 등으로 전달

// 응답 명단 (대표만 조회 가능)
supabase.from('rsvp_responses').select('id, name, attending, note, updated_at')
  .eq('rsvp_id', data.rsvp_id).order('created_at')

// 실시간 반영
supabase.channel('rsvp').on('postgres_changes',
  { event: '*', schema: 'public', table: 'rsvp_responses', filter: `rsvp_id=eq.${data.rsvp_id}` },
  () => reload()).subscribe()

// 장난 응답 삭제 → 인원 재계산
supabase.rpc('delete_rsvp_response', { p_response_id })
// 마감 → 사장님에게 최종 인원 알림 (rsvp_closed)
supabase.rpc('close_rsvp', { p_reservation_id })
```

### 규칙
- 참석 0명일 때는 기존 예약 인원 유지 (예약 인원은 1명 이상)
- 정원(슬롯 예약이면 슬롯 수용 인원, 아니면 가게 최대 인원)을 넘는 **참석** 응답은 거절. 불참 응답은 언제나 가능
- 같은 이름(공백 무시)으로 다시 응답하면 처음 응답한 기기(저장된 수정 키)에서만 수정 가능
- 응답 가능: 마감 전 + 예약이 결제 대기·확정 상태. 취소되면 자동 마감
- 사장님은 이름 명단을 볼 수 없고 인원(`headcount`)만 봄
- 인원이 바뀌어도 예약금은 그대로, 사전 주문의 1인당 금액·예산 초과 여부는 새 인원 기준으로 다시 계산됨

### 구성원 화면 (`/r/:token`, 로그인 없음)
`get_rsvp_public(p_token)`, `respond_rsvp(p_token, p_name, p_attending, p_note, p_edit_key)`

## 5. 알림

요청 도착, 수락, 예약 생성·확정·취소·완료, 조건 수정, 영수증 확인 필요 시 자동 생성된다.

```js
// 목록
supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50)
// 읽음 처리 (인자 없으면 전체)
supabase.rpc('mark_notifications_read', { p_ids: [1, 2] })
// 실시간 수신
supabase.channel('my-notifications')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${me.id}` },
      (payload) => showToast(payload.new.title))
  .subscribe()
```

`type`: `request_new`, `request_accepted`, `reservation_new`, `reservation_confirmed`, `reservation_cancelled`,
`reservation_completed`, `reservation_no_show`, `modify_requested`, `modify_accepted`, `modify_rejected`, `receipt_review`, `preorder_changed`, `rsvp_closed`
관련 화면으로 이동할 때 `request_id` / `reservation_id` / `receipt_id` 사용.

## 6. 사장님 통계

### 대시보드용 (권장): 한 번 호출로 전부

```js
const { data } = await supabase.rpc('store_stats', { p_store_id })            // 기본: 최근 90일 ~ 앞으로 60일
const { data } = await supabase.rpc('store_stats', { p_store_id, p_from: '2026-09-01', p_to: '2026-12-31' })
```

반환 JSON:
- `summary`: 예약 수, 완료, 노쇼, 취소, 방문 인원, 매출(확정 영수증 기준)
- `by_group`: 단체별 방문 횟수·매출 (매출순)
- `by_menu`: 메뉴별 수량·금액 (금액순)
- `by_weekday`: 요일별 예약 수 (일~토 7개 항상 포함) → 한산한 요일에 슬롯 열기 판단용
- `by_month`: 월별 예약 수·인원

### 미충족 수요 (사장님 계정)

조건 맞는 가게를 못 찾고 만료된 요청 집계. 단체 이름은 포함되지 않는다.

```js
supabase.rpc('unmet_demand_stats')   // 기본: 최근 180일
```
반환: `total_unmet`, `no_store_accepted`, `accepted_but_not_chosen`, `by_event`(행사별 건수·평균 인원·평균 예산), `by_size`(규모별), `by_week`(주별)

### 상세 행 단위 조회

`v_store_item_stats` 뷰. 확정(`done`)된 영수증만 집계되며, 자기 가게 데이터만 보인다.

컬럼: `store_id, group_id, group_name, group_type, event_type, event_date, menu_name, menu_id, total_qty, total_amount`

```js
// 기간별 전체
supabase.from('v_store_item_stats').select('*').gte('event_date', '2026-09-01').lte('event_date', '2026-12-31')
```

단체별 합계·메뉴별 합계는 받아온 행을 프런트에서 묶어서 계산한다 (데이터 양이 적어 충분함).
