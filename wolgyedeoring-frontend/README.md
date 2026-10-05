# 월계더링 프런트엔드 (React + Vite + TypeScript)

지금 들어 있는 것은 **데이터 계층과 연결 확인 페이지뿐**이다. 화면(UI)은 선택된 초안 방향으로 이 위에 만든다.
BE 기준: `wolgyedeoring-backend` 마이그레이션 001~008, 호출 방법 원본은 `wolgyedeoring-backend/docs/API.md`.

## 실행

```bash
cd wolgyedeoring-frontend
npm install
cp .env.example .env.local   # Supabase URL·anon(publishable) 키, 토스 테스트 "클라이언트" 키 입력
npm run dev                  # http://localhost:5173/dev 에서 시연 계정으로 연결 확인
npm run build                # 타입 검사 + 빌드
```

`.env.local` 은 커밋하지 않는다. service_role 키·토스 시크릿 키는 절대 넣지 않는다.

## 구조

```
src/
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
  pages/          DevCheck(/dev), PaySuccess(/pay/success), PayFail(/pay/fail)
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

## 아직 없는 것

- 모든 화면, 디자인 토큰 연결 (`docs/ui-handoff/design/tokens.css`)
- 지도 SDK (#8 결정 후), 웹 푸시 (#6 결정 후)
- DB 타입 자동 생성: `npx supabase gen types typescript --project-id <ID> > src/types/supabase.gen.ts`
