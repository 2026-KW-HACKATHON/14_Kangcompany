# 02. Edge Function 점검 체크리스트

대상: `wolgyedeoring-backend/supabase/functions/` 의 3개 함수. 이 함수들이 Supabase 에 배포·설정돼 있어야 **메뉴판 인식, 영수증 인식, 토스 결제**가 동작한다.
DB(001~008)·데모 데이터와는 별개라서, SQL 체크(`check_migrations.sql`)로는 확인되지 않는다.

| 함수 | 화면 | 필요한 비밀값 | 없을 때 시연 대안 |
|---|---|---|---|
| `extract-menu` | S-08 메뉴판 사진 인식 | `ANTHROPIC_API_KEY` | 메뉴 화면에서 직접 추가 |
| `process-receipt` | S-10 영수증 등록 → S-11 보정 | `ANTHROPIC_API_KEY` | 시드에 있는 "확인 필요" 영수증으로 보정 화면만 시연 |
| `toss-payment` | G-09 결제 → G-10 결과, 토스 결제분 취소 | `TOSS_SECRET_KEY` (+ 프런트 `VITE_TOSS_CLIENT_KEY`) | 토스 키를 비우면 "시연용 결제" 버튼 |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase 가 자동으로 넣어 준다 (따로 설정하지 않음).
선택: `RECEIPT_MODEL`, `MENU_MODEL` (비우면 코드 기본 모델).

---

## 1. 대시보드로 확인 (설치 없이, 3분)

1. Supabase 대시보드 → 왼쪽 **Edge Functions**
   - [ ] `extract-menu`, `process-receipt`, `toss-payment` 3개가 목록에 있다
2. **Edge Functions → Secrets** (또는 Project Settings → Edge Functions)
   - [ ] `ANTHROPIC_API_KEY` 가 있다
   - [ ] `TOSS_SECRET_KEY` 가 있다 (토스 결제창을 시연할 때만)

둘 다 있으면 3절(실제 시험)로. 없으면 2절.

## 2. 배포·설정 (Windows PowerShell)

Node.js 필요. PowerShell 에서는 `npx` 대신 **`npx.cmd`**.

```powershell
cd C:\14_Kangcompany\wolgyedeoring-backend
npx.cmd supabase login
npx.cmd supabase secrets set ANTHROPIC_API_KEY=발급받은키 --project-ref 프로젝트ID
npx.cmd supabase functions deploy process-receipt --project-ref 프로젝트ID
npx.cmd supabase functions deploy extract-menu --project-ref 프로젝트ID
# 토스 결제창까지 시연할 때만
npx.cmd supabase secrets set TOSS_SECRET_KEY=test_sk_... --project-ref 프로젝트ID
npx.cmd supabase functions deploy toss-payment --project-ref 프로젝트ID
```

- 프로젝트ID: 대시보드 주소 `supabase.com/dashboard/project/<여기>`
- `supabase login` 은 브라우저 로그인 창이 뜬다
- `functions deploy` 에서 Docker 관련 경고가 나와도 배포가 끝나면 무시해도 됨. 실패하면 오류 첫 줄을 공유
- 확인: `npx.cmd supabase functions list --project-ref 프로젝트ID`, `npx.cmd supabase secrets list --project-ref 프로젝트ID`
- **키는 저장소·채팅에 남기지 말 것.** 토스는 테스트 **시크릿** 키는 여기에만, 테스트 **클라이언트** 키는 프런트 환경변수에만, 두 키는 같은 세트여야 함

## 3. 실제로 시험 (시연 전날, 15분)

앱(로컬 `npm.cmd run dev` 또는 배포 주소)에서:

**메뉴판 인식**
- [ ] `owner3@wolgye.demo`(광운분식) 로그인 → 메뉴 탭 → 메뉴판 사진으로 등록 → 아무 식당 메뉴판 사진
- [ ] 10초 안팎으로 메뉴 목록이 나온다 (기존 메뉴는 "변경 없음 / 가격 변경", 새 메뉴는 "새 메뉴")
- [ ] **저장하지 말고** 뒤로 (시드 메뉴 유지. 저장했으면 시연 전 seed 재실행)

**영수증 인식**
- [ ] `owner1@wolgye.demo`(고기굽는집) 로그인 → 요청·예약 탭 → 예약 세그먼트 → **완료** 예약 하나 → 영수증 등록 → 실물 영수증 촬영
- [ ] 결과 화면(S-11)으로 넘어간다
- 예상 결과: 실제 식당 영수증은 시드 메뉴(삼겹살 등)와 이름이 달라 **"확인 필요"** 가 정상. 또 예약 일시와 36시간 넘게 차이 나면 "다른 영수증일 수 있습니다" 안내가 붙는다
- [ ] 보정 화면에서 품목마다 메뉴 선택 → 저장 → **영수증 확정하기** 가 켜지는지

**토스 결제** (키를 넣었을 때만)
- [ ] `sw@wolgye.demo` → 홈 "해야 할 일"의 결제 대기 예약 → 결제 → 토스 테스트 결제창 → 카드 아무거나(테스트 모드는 실제 청구 없음) → "예약이 확정됐어요"
- [ ] 같은 예약 취소 시 환불까지 처리되는지 (예약 상세 → 예약 취소)

## 4. 실패할 때 보는 곳

대시보드 → Edge Functions → 함수 이름 → **Logs** (또는 Invocations). 앱에 뜬 문구와 로그의 오류 줄을 함께 공유하면 원인을 좁힐 수 있다.

| 앱 문구 | 가능한 원인 |
|---|---|
| "영수증 인식에 실패했습니다" | API 키 없음·잘못됨, 모델 이름 오류, 사진이 너무 큼(앱이 1500px로 줄여 보냄) |
| "영수증을 등록할 수 없는 예약 상태입니다" | 확정·완료가 아닌 예약 |
| "Failed to send a request to the Edge Function" / 404 | 함수가 배포되지 않음 |
| 결제 후 "결제 정보가 올바르지 않습니다" | 토스 클라이언트 키와 시크릿 키가 다른 세트 |
