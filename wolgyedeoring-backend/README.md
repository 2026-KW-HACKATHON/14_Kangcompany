# 월계더링 백엔드 (Supabase)

## 구성

```
supabase/
  migrations/
    001_schema.sql        테이블 11개, 권한(RLS), 통계 뷰
    002_rpc.sql           예약 상태 전이·영수증 보정 함수, 가입 시 프로필 자동 생성
    003_features.sql      알림, 맞춤 요청 목록·자동 만료, 조건 수정 요청, 통계·미충족 수요
    004_toss.sql          토스페이먼츠 예약금 결제 (주문 준비, 승인 확정, 환불 취소 보호)
    005_menus_preorder.sql 메뉴 분류·일괄 저장, 예약 시 메뉴 사전 주문
    006_rsvp.sql          참석 조사 (로그인 없는 응답, 예약 인원 자동 반영)
  functions/
    extract-menu/         메뉴판 사진 → LLM 메뉴 후보 + 기존 메뉴 비교 (저장 안 함)
      index.ts, menu.ts
    process-receipt/      영수증 이미지 → LLM 품목 추출 → 검증 → 저장 (이미지 저장 안 함)
      index.ts            진입점
      llm.ts              LLM 호출 (다른 LLM 으로 바꿀 때 이 파일만 교체)
      validate.ts         검증 규칙 (산술, 합계, 메뉴 매칭, 일시)
    toss-payment/         토스 결제 승인·환불 취소
      index.ts            진입점 (금액 검증, 승인 후 확정 실패 시 자동 환불)
      toss.ts             토스 API 호출
scripts/
  create-demo-users.mjs   시연용 계정 8개 생성
  seed_demo.sql           시연용 데이터 (지난 8주 이력 + 앞으로 2주 일정 + 미충족 수요)
  eval-receipts.ts        영수증 인식 정확도 측정
eval/                     정확도 측정용 사진·정답 (저장소에 커밋 금지)
docs/API.md               프런트용 호출 방법
tests/                    로컬 테스트 (Supabase 에는 올리지 않음)
```

## 설치 순서

### 1. DB (Supabase 대시보드 → SQL Editor)

1. `001_schema.sql` 실행 (이미 했다면 생략)
2. `002_rpc.sql` 실행
3. `003_features.sql` 실행
4. `004_toss.sql` 실행
5. `005_menus_preorder.sql` 실행
6. `006_rsvp.sql` 실행
7. 확인: `scripts/check_migrations.sql` 실행 → ok 열이 모두 true

### 2. 로그인 설정 (대시보드 → Authentication)

- 해커톤 시연용이면 이메일 확인(Confirm email)을 끄면 가입 즉시 로그인 가능

### 3. Edge Function 배포 (터미널, Node.js 필요)

```bash
npx supabase login
npx supabase secrets set ANTHROPIC_API_KEY=발급받은키 --project-ref 프로젝트ID
npx supabase functions deploy process-receipt --project-ref 프로젝트ID
npx supabase functions deploy extract-menu --project-ref 프로젝트ID      # ANTHROPIC_API_KEY 공용

npx supabase secrets set TOSS_SECRET_KEY=테스트시크릿키 --project-ref 프로젝트ID
npx supabase functions deploy toss-payment --project-ref 프로젝트ID
```

- 토스 키: tosspayments.com 가입 → 개발자센터 → API 키. 테스트 **클라이언트 키는 프런트에, 시크릿 키는 서버 비밀값에만**. 두 키는 같은 세트여야 함

- 프로젝트 ID: 대시보드 주소 `supabase.com/dashboard/project/<여기>`
- 모델을 바꾸려면: `npx supabase secrets set RECEIPT_MODEL=모델명 --project-ref 프로젝트ID`
- API 키는 저장소에 커밋하지 말 것

### 4. 프런트에 전달할 것

- Project URL, anon key (대시보드 → Project Settings → API)
- `docs/API.md`
- **service_role key 는 절대 앱에 넣지 말 것** (모든 권한을 우회함)

### 5. 시연용 데이터 (선택)

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-demo-users.mjs
```
그다음 SQL Editor 에서 `scripts/seed_demo.sql` 실행. 다시 실행하면 데모 데이터만 지우고 새로 만든다.

| 계정 (비밀번호 demo1234!) | 역할 |
|---|---|
| owner1@wolgye.demo | 고기굽는집 (60석) — 확인 필요 영수증 1건 있음 (보정 시연용) |
| owner2@wolgye.demo | 월계치킨 (40석) |
| owner3@wolgye.demo | 광운분식 (30석, 간식행사) |
| sw@ / ee@ / band@ / fc@ / town@ wolgye.demo | 단체 대표 5명 (학생회 2, 동아리 2, 주민모임 1) |

### 6. 영수증 정확도 측정

`eval/README.md` 참고. 실제 영수증 20~30장과 정답을 넣고 실행하면 품목 정확도, 자동 통과율,
"검증 통과했지만 틀린 비율" 등이 나온다. `--no-menu` 로 메뉴 목록 제공 효과를 비교할 수 있다.

## 로컬 테스트

```bash
# 영수증 검증·LLM 응답 처리 (Node 22 이상)
node --experimental-strip-types --test tests/receipt.test.ts

# 예약 흐름·권한 (로컬 PostgreSQL 16, 빈 DB 에서)
psql -d 테스트DB -f tests/stub_supabase.sql -f supabase/migrations/001_schema.sql \
     -f supabase/migrations/002_rpc.sql -f supabase/migrations/003_features.sql \
     -f supabase/migrations/004_toss.sql -f supabase/migrations/005_menus_preorder.sql \
     -f supabase/migrations/006_rsvp.sql -f tests/test_flow.sql
# 003 기능은 tests/test_features.sql, 004 결제는 tests/test_toss.sql, 005 메뉴·사전 주문은 tests/test_preorder.sql, 006 참석 조사는 tests/test_rsvp.sql
# 토스·메뉴판 모듈: node --experimental-strip-types --test tests/toss.test.ts tests/menu.test.ts
# 데모 데이터는 tests/demo_users.sql 다음에 scripts/seed_demo.sql
```

## 아직 구현하지 않은 것

- 실제 결제 연동 (현재 `pay_deposit_test` 로 대체)
- 푸시 알림 (앱 형태 결정 후, `notifications` 테이블 기반으로 연결)
- 토스 라이브(실결제) 전환: 사업자 계약 필요. 해커톤은 테스트 키로 충분
- 앱 화면 전체
