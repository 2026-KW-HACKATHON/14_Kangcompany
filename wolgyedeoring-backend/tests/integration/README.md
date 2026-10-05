# 통합 테스트 (FE api 모듈 ↔ DB)

`wolgyedeoring-frontend/tests/flow.integration.test.ts` 가 시연 흐름 전체를 **실제 api 모듈**로 호출한다.
요청 → 가게 2곳 경쟁 수락(선착순) → 알림 → 행동 플래그·연락처 → 사전 주문 → 결제 → 참석 조사(비로그인) → 마감 → 빈 날짜 닫기 → 요청 철회 → 영수증·통계.
권한(테이블 직접 쓰기 거절, 비로그인 명단 조회 불가)도 함께 확인한다.

## A. 실제 Supabase 로 (008 적용 확인용, 권장)

1. SQL Editor: 008 적용 → `scripts/seed_demo.sql` 실행
2. `wolgyedeoring-frontend/.env.local` 에 URL·anon 키
3. `cd wolgyedeoring-frontend && npm run test:integration`

⚠️ 요청·예약을 실제로 만든다. **시드 직후 1회만**. 다시 돌리려면 시드부터 다시 실행.

## B. 로컬로 (Supabase 없이)

PostgreSQL 16 + [PostgREST](https://github.com/PostgREST/postgrest/releases) 바이너리 필요.
`fake-gateway.mjs` 가 Supabase Auth 를 흉내 낸다 (데모 계정, 비밀번호 `demo1234!`).

```bash
cd wolgyedeoring-backend
POSTGREST=~/bin/postgrest PGUSER=postgres bash tests/integration/run.sh
```

Storage(가게 사진)·Edge Function(토스·영수증 인식)·Realtime 은 이 테스트 범위 밖이다.
