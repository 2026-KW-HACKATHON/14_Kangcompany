// 시연용 데모 계정 생성 (Node 18 이상, 설치 필요 없음)
//
// 실행:
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=<Secret 키 sb_secret_... 또는 service_role 키> node scripts/create-demo-users.mjs
//   (Windows PowerShell: $env:SUPABASE_URL="..."; $env:SUPABASE_SERVICE_ROLE_KEY="..."; node scripts/create-demo-users.mjs)
//
// 그다음 SQL Editor 에서 scripts/seed_demo.sql 실행
// 모든 계정 비밀번호: demo1234!

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수를 설정하세요");
  process.exit(1);
}

const PASSWORD = "demo1234!";
const USERS = [
  { email: "owner1@wolgye.demo", role: "owner", display_name: "고기굽는집 사장님" },
  { email: "owner2@wolgye.demo", role: "owner", display_name: "월계치킨 사장님" },
  { email: "owner3@wolgye.demo", role: "owner", display_name: "광운분식 사장님" },
  { email: "sw@wolgye.demo",     role: "group", display_name: "소프트웨어학부 학생회장" },
  { email: "ee@wolgye.demo",     role: "group", display_name: "전자공학과 학생회장" },
  { email: "band@wolgye.demo",   role: "group", display_name: "소리모아 회장" },
  { email: "fc@wolgye.demo",     role: "group", display_name: "KW FC 주장" },
  { email: "town@wolgye.demo",   role: "group", display_name: "월계1동 주민모임 총무" },
];

// 새 Secret 키(sb_secret_...)는 JWT 가 아니라 apikey 헤더로만 보냄
// 기존 service_role 키(eyJ...)는 Authorization 헤더도 함께 보냄
const headers = { apikey: KEY, "Content-Type": "application/json" };
if (!KEY.startsWith("sb_")) headers.Authorization = `Bearer ${KEY}`;

for (const u of USERS) {
  const res = await fetch(`${URL.replace(/\/+$/, "")}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: u.role, display_name: u.display_name },
    }),
  });
  if (res.ok) {
    console.log(`생성: ${u.email}`);
  } else {
    const text = await res.text();
    if (/already|exists|registered/i.test(text)) console.log(`이미 있음: ${u.email}`);
    else console.error(`실패: ${u.email} (${res.status}) ${text.slice(0, 200)}`);
  }
}
console.log("\n완료. 이제 SQL Editor 에서 scripts/seed_demo.sql 을 실행하세요.");
