// 실행: node --experimental-strip-types --test tests/naver.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { flattenNaver } from "../supabase/functions/naver-userinfo/naver.ts";

test("네이버 응답을 표준 사용자 정보로 평탄화", () => {
  const u = flattenNaver({ resultcode: "00", message: "success", response: {
    id: "abc123", name: "김월계", nickname: "월계", email: "a@naver.com", profile_image: "https://x/p.png" } });
  assert.deepEqual(u, { sub: "abc123", id: "abc123", name: "김월계", nickname: "월계",
    email: "a@naver.com", email_verified: true, picture: "https://x/p.png" });
});

test("이름이 없으면 별명, 이메일 없으면 null", () => {
  const u = flattenNaver({ resultcode: "00", response: { id: "1", nickname: "별명" } });
  assert.equal(u?.name, "별명");
  assert.equal(u?.email, null);
  assert.equal(u?.email_verified, false);
});

test("실패 응답·id 없음은 null", () => {
  assert.equal(flattenNaver({ resultcode: "024", message: "Authentication failed" }), null);
  assert.equal(flattenNaver({ resultcode: "00", response: {} }), null);
  assert.equal(flattenNaver(null), null);
});
