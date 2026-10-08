# 월계더링 프런트엔드 (React + Vite + TypeScript)

지금 들어 있는 것: **데이터 계층 + 화면 골격**(IA의 모든 화면에 라우트·가드·데이터 연결·기본 동작). 디자인은 골격용 최소 스타일뿐이라, 선택된 초안 방향으로 `components/ui.tsx`·`styles/app.css`·각 화면 마크업을 다듬으면 된다.
BE 기준: `wolgyedeoring-backend` 마이그레이션 001~010, 호출 방법 원본은 `wolgyedeoring-backend/docs/API.md`. 일괄 빈자리 공개를 사용하기 전에 010을 먼저 적용한다.

## 실행

```bash
cd wolgyedeoring-frontend
npm install
cp .env.example .env.local   # Supabase URL·anon(publishable) 키, 토스 테스트 "클라이언트" 키 입력
npm run dev                  # http://localhost:5173/dev 에서 시연 계정으로 연결 확인
npm run build                # 타입 검사 + 빌드
npm run test:local           # 운영 DB 없이 로컬 가짜 API로 회귀 검사
```

`.env.local` 은 커밋하지 않는다. service_role 키·토스 시크릿 키는 절대 넣지 않는다.

## 화면 ↔ 경로 (IA 4장, 하단 탭은 IA 3장 제안안 · #8 확정 시 탭 이름만 조정)

| 역할 | 하단 탭 | 그 밖의 화면 |
|---|---|---|
| 단체 `/group` | 홈 `/group` (G-01) · 예약 `/group/reservations` (G-11) · 가게 찾기 `/group/slots` (G-04) · 내 정보 `/group/me` (G-14) | 요청 작성 G-02 `/group/requests/new` · 요청 상태 G-03 `/group/requests/:id` · 날짜 예약 G-05 `/group/slots/:id/book` · 예약 상세 G-06 `/group/reservations/:id` (+ `/preorder` G-07, `/modify` G-08, `/pay` G-09, `/rsvp` G-12, `/rsvp/responses` G-13) · 좌석 배치도 G-15 `/group/layouts?store=` |
| 사장님 `/owner` | 홈 `/owner` (S-01) · 요청·예약 `/owner/inbox` (S-02, `?view=reservations` S-04) · 메뉴 `/owner/menus` (S-07) · 분석 `/owner/stats` (S-12) | 요청 상세 S-03 `/owner/requests/:id` · 예약 상세 S-05 `/owner/reservations/:id` · 영수증 등록 S-10 `…/:id/receipt` · 보정 S-11 `/owner/receipts/:id` · 빈 날짜 S-06 `/owner/slots` · 메뉴판 인식 S-08 `/owner/menus/scan` · 미충족 수요 S-13 `/owner/stats/unmet` · 가게 정보 S-14 `/owner/store` (상단 ⚙) · 좌석 배치도 S-15 `/owner/layout` |
| 공통 | — | 시작 A-01 `/start` · 로그인 A-02 · 가입 A-03 · 단체/가게 등록 A-04/A-05 `/onboarding/*` · 알림 C-01 `/notifications` · 결제 결과 G-10 `/pay/success`, `/pay/fail` · 참석 응답 P-01 `/r/:token` (로그인 없음) |

- 경로는 `src/app/paths.ts` 한 곳에서 관리 (알림 → 화면 이동도 여기 사용)
- 가드: 로그인 안 함 → `/start`, 역할이 다르면 → 내 홈, 단체/가게 미등록 → 등록 화면
- 보류 화면: S-09 추천 메뉴(#1), 운영자 화면(#4)
- 좌석 배치도: 정리·검사 규칙은 `src/lib/layout.ts` 가 백엔드 `extract-layout/layout.ts` 를 그대로 가져다 씀 (Vercel 에서 Root Directory 바깥 파일 포함 옵션 필요 — tokens.css 와 같음)
- 지도: `.env.local` 에 `VITE_KAKAO_MAP_KEY` 가 있으면 G-04 지도 탭·G-06 위치 지도·가게 주소 → 좌표 자동 변환이 켜지고, 없으면 자리 표시. 다른 지도 서비스로 정해지면 `components/map/` 두 파일만 교체 (#8)

## 구조

```
src/
  app/            paths(경로), session(로그인·내 단체/가게), guards(접근 제어)
  components/     ui(버튼·입력·배지·카드 등 골격 부품), layout(헤더·하단 탭), cards, Bars
  pages/          auth/ group/ owner/ common/ (파일마다 화면 ID 주석)
  styles/app.css  골격 스타일 (의미 토큰만 사용. 토큰 원본 docs/ui-handoff/design/tokens.css 를 직접 import)
  api/            BE 호출 함수. 화면은 supabase 를 직접 부르지 말고 여기만 쓴다
    auth groups stores menus slots requests reservations
    payments preorder receipts rsvp notifications stats
  types/db.ts     테이블 행·RPC 반환 타입 (손으로 작성, 008 기준)
  lib/
    supabase.ts   클라이언트 1개
    errors.ts     오류 → 화면 문구 (서버 한글 메시지 그대로, 42501 → "볼 수 없는 예약이에요")
    status.ts     상태 코드 → 라벨·배지 톤 (docs/ui-handoff/ia/state-definitions.md 와 1:1)
    format.ts     KST 날짜 "10/13(월) 19:00", 금액, 남은 시간
  hooks/          useSession(로그인 프로필), useNotifications(목록 + 실시간)
  pages/DevCheck  /dev 연결 확인 페이지
```

## 화면에서 쓰는 법 (예)

```tsx
import { reservations, payments } from '../api'
import { RESERVATION_STATUS } from '../lib/status'
import { toApiError } from '../lib/errors'

const r = await reservations.getReservation(id)
const act = await reservations.getActions(id)          // 버튼은 act.can_* 로 켜고 끈다
const badge = RESERVATION_STATUS[r.status]             // { label: '결제 대기', tone: 'warning' }

try {
  if (act.pay_method === 'zero') await payments.confirmZeroDeposit(id)
  else await payments.startDepositPayment(id, me.id)   // 토스 결제창 → /pay/success 로 돌아옴
} catch (e) {
  showToast(toApiError(e).message)                     // kind === 'closed' 면 목록 새로고침
}
```

## 규칙

- 상태가 바뀌는 동작 뒤에는 `reservations.getActions()` 를 다시 불러 버튼을 갱신
- 단체 화면의 요청 상태는 `effectiveRequestStatus()` 로 표시 (기한이 지난 open 은 만료로)
- 알림을 눌렀을 때 이동 경로는 `notifications.notificationTarget()` 한 곳에서 관리 (라우트가 정해지면 여기만 수정)
- 참석 조사 링크는 `rsvp.rsvpLink(token)` → `/r/:token`
- 라벨을 바꾸려면 상태 정의도를 먼저 고치고 `lib/status.ts` 를 맞춘다

## 테스트

`npm run test:integration` — 시드 직후 실제 Supabase(또는 로컬 하네스 `wolgyedeoring-backend/tests/integration/`)에 대해
- `tests/flow.integration.test.ts` (11개): api 모듈로 시연 흐름 전체
- `tests/screens.integration.test.tsx` (14개): 실제 라우터·가드·화면 렌더 → 데이터 표시, 요청 작성 제출까지

## 아직 없는 것

- 디자인 (선택된 초안 반영), 아이콘 (지금은 글자 기호)
- 지도 SDK (#8 결정 후), 웹 푸시 (#6 결정 후)
- DB 타입 자동 생성: `npx supabase gen types typescript --project-id <ID> > src/types/supabase.gen.ts`
