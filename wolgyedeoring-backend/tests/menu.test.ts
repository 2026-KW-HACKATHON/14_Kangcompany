// 실행: node --experimental-strip-types --test tests/menu.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMenu, compareWithExisting, extractMenu, nameKey } from "../supabase/functions/extract-menu/menu.ts";

test("LLM 출력 정리: 가격 형식, 중복, 빈 이름, 잘못된 분류", () => {
  const r = normalizeMenu({ items: [
    { name: " 삼겹살  (국내산) ", price: "15,000원", category: "main", confidence: "high" },
    { name: "삼겹살(국내산)", price: 16000, category: "main", confidence: "high" },   // 중복 → 제거
    { name: "", price: 1000, category: "meal", confidence: "high" },
    { name: "모둠전", price: "1.5만", category: "dessert", confidence: "HIGH" },
    { name: "광어회", price: "시가", category: "main", confidence: "medium" },
    { name: "음수", price: -100, category: "etc", confidence: "high" },
  ] });
  assert.equal(r.length, 4);
  assert.deepEqual(r[0], { name: "삼겹살 (국내산)", price: 15000, category: "main", confidence: "high" });
  assert.deepEqual(r[1], { name: "모둠전", price: 15000, category: "etc", confidence: "low" });
  assert.equal(r[2].price, null);
  assert.equal(r[3].price, null);
});

test("이름 비교 키: 공백·괄호 무시", () => {
  assert.equal(nameKey("후라이드 치킨(반마리)"), nameKey("후라이드치킨 반마리"));
});

test("기존 메뉴와 비교", () => {
  const existing = [
    { id: 1, name: "삼겹살", price: 15000, category: "main" as const, is_active: true },
    { id: 2, name: "소주", price: 5000, category: "drink" as const, is_active: true },
    { id: 3, name: "된장 찌개", price: 7000, category: "side" as const, is_active: true },
    { id: 4, name: "목살", price: 16000, category: "main" as const, is_active: false },
  ];
  const { items, missing } = compareWithExisting([
    { name: "삼겹살", price: 16000, category: "main", confidence: "high" },
    { name: "된장찌개", price: 7000, category: "side", confidence: "high" },
    { name: "목살", price: 16000, category: "main", confidence: "high" },
    { name: "냉면", price: 8000, category: "meal", confidence: "high" },
  ], existing);
  assert.deepEqual(items.map((i) => [i.name, i.status, i.existing_menu_id]), [
    ["삼겹살", "price_changed", 1],
    ["된장 찌개", "same", 3],           // 기존 이름으로 맞춤 → 저장 시 같은 메뉴로 갱신
    ["목살", "reactivate", 4],
    ["냉면", "new", null],
  ]);
  assert.deepEqual(missing.map((m) => m.name), ["소주"]);
});

test("extractMenu: 요청 형식·응답 파싱", async () => {
  let sent: any;
  const f = (async (_u: string, init: any) => { sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ content: [{ type: "tool_use", name: "record_menu",
      input: { items: [{ name: "떡볶이(대)", price: 8000, category: "main", confidence: "high" }] } }] }), { status: 200 });
  }) as typeof fetch;
  const r = await extractMenu({ apiKey: "k", imageBase64: "AA", mediaType: "image/png", storeName: "광운분식", fetchFn: f });
  assert.equal(r[0].name, "떡볶이(대)");
  assert.equal(sent.tool_choice.name, "record_menu");
  assert.ok(sent.messages[0].content[1].text.includes("광운분식"));
});

test("extractMenu: API 오류", async () => {
  const f = (async () => new Response("bad", { status: 400 })) as typeof fetch;
  await assert.rejects(extractMenu({ apiKey: "k", imageBase64: "A", mediaType: "image/png", storeName: "", fetchFn: f }), /LLM 호출 실패 \(400\)/);
});
