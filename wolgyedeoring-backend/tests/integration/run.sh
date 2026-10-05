#!/usr/bin/env bash
# 로컬 통합 테스트: 빈 DB → 001~008 + 시드 → PostgREST + 가짜 게이트웨이 → FE 통합 테스트
# 필요: PostgreSQL 16 (psql·createdb 가 PG* 환경변수로 접속 가능), PostgREST 바이너리, Node 22
#   POSTGREST=/경로/postgrest PGUSER=postgres bash tests/integration/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BE="$HERE/../.."
FE="$BE/../wolgyedeoring-frontend"
export PGDATABASE="${PGDATABASE:-wgd_itest}"
export JWT_SECRET="${JWT_SECRET:-local-test-jwt-secret-at-least-32-characters}"
POSTGREST="${POSTGREST:-postgrest}"

dropdb --if-exists "$PGDATABASE"; createdb "$PGDATABASE"
args=(-X -q -v ON_ERROR_STOP=1 -f "$HERE/stub_postgrest.sql")
for f in "$BE"/supabase/migrations/*.sql; do args+=(-f "$f"); done
psql "${args[@]}" -f "$BE/tests/demo_users.sql" -f "$BE/scripts/seed_demo.sql" 2>&1 | grep -v NOTICE || true
psql -qc "alter role authenticator password 'auth'"

cat > /tmp/wgd-pgrst.conf <<CONF
db-uri = "postgres://authenticator:auth@${PGHOST:-127.0.0.1}:${PGPORT:-5432}/$PGDATABASE"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-port = 3001
CONF
"$POSTGREST" /tmp/wgd-pgrst.conf > /tmp/wgd-pgrst.log 2>&1 & P1=$!
node "$HERE/fake-gateway.mjs" > /tmp/wgd-gateway.log 2>&1 & P2=$!
trap 'kill $P1 $P2 2>/dev/null' EXIT
sleep 2
ANON=$(grep -m1 '^ANON_KEY=' /tmp/wgd-gateway.log | cut -d= -f2)
cd "$FE"
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY="$ANON" npm run test:integration
