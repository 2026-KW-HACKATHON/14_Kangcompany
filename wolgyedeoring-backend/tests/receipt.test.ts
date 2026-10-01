// 실행: node --experimental-strip-types --test tests/receipt.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateReceipt, validateItem, toKstIso } from "../supabase/functions/process-receipt/validate.ts";
import { extractReceipt, normalize } from "../supabase/functions/process-receipt/llm.ts";

const menus = [
  { id: 1, name: "삼겹살", price: 15000 },
  { id: 2, name: "소주", price: 5000 },
  { id: 3, name: "된장찌개", price: 8000 },
];
const START = "2026-10-14T19:00:00+09:00";
const ids = new Set(menus.map((m) => m.id));

test("정상 영수증 → done", () => {
  const r = validateReceipt({
    is_itemized: true, store_name: "가게A", receipt_datetime: "2026-10-14T21:30", total: 170000,
    items: [
      { raw_name: "삼겹살(국내", menu_id: 1, qty: 8, unit_price: 15000, amount: 120000, confidence: "high" },
      { raw_name: "소주", menu_id: 2, qty: 10, unit_price: 5000, amount: 50000, confidence: "high" },
    ],
  }, menus, START);
  assert.equal(r.status, "done");
  assert.deepEqual(r.notes, []);
  assert.equal(r.receipt_at, "2026-10-14T21:30:00+09:00");
});

test("산술 불일치 → 품목 오류, needs_review", () => {
  const i = validateItem({ raw_name: "소주", menu_id: 2, qty: 10, unit_price: 5000, amount: 5000, confidence: "high" }, ids);
  assert.match(i.validation_error!, /qty\*unit_price != amount/);
});

test("목록 밖 menu_id 는 무효화", () => {
  const i = validateItem({ raw_name: "콜라", menu_id: 99, qty: 1, unit_price: 2000, amount: 2000, confidence: "high" }, ids);
  assert.equal(i.menu_id, null);
  assert.match(i.validation_error!, /menu not matched/);
});

test("빠진 값 보완 (수량 계산)", () => {
  const i = validateItem({ raw_name: "삼겹살", menu_id: 1, qty: null, unit_price: 15000, amount: 45000, confidence: "high" }, ids);
  assert.equal(i.qty, 3);
  assert.equal(i.validation_error, null);
});

test("나누어떨어지지 않으면 보완하지 않음", () => {
  const i = validateItem({ raw_name: "삼겹살", menu_id: 1, qty: null, unit_price: 15000, amount: 40000, confidence: "high" }, ids);
  assert.equal(i.qty, null);
  assert.match(i.validation_error!, /invalid qty/);
});

test("신뢰도 low 는 확인 대상", () => {
  const i = validateItem({ raw_name: "된장", menu_id: 3, qty: 1, unit_price: 8000, amount: 8000, confidence: "low" }, ids);
  assert.match(i.validation_error!, /low confidence/);
});

test("합계 불일치 → needs_review", () => {
  const r = validateReceipt({
    is_itemized: true, store_name: null, receipt_datetime: "2026-10-14T21:30", total: 110000,
    items: [{ raw_name: "삼겹살", menu_id: 1, qty: 8, unit_price: 15000, amount: 120000, confidence: "high" }],
  }, menus, START);
  assert.equal(r.status, "needs_review");
  assert.ok(r.notes.some((n) => n.includes("품목 합계")));
});

test("품목 없는 영수증 → needs_review", () => {
  const r = validateReceipt({ is_itemized: false, store_name: "가게A", receipt_datetime: "2026-10-14T21:30", total: 50000, items: [] }, menus, START);
  assert.equal(r.status, "needs_review");
  assert.ok(r.notes[0].includes("품목이 인쇄되지 않은"));
});

test("예약과 날짜가 크게 다르면 경고", () => {
  const r = validateReceipt({
    is_itemized: true, store_name: null, receipt_datetime: "2026-09-01T12:00", total: 8000,
    items: [{ raw_name: "된장찌개", menu_id: 3, qty: 1, unit_price: 8000, amount: 8000, confidence: "high" }],
  }, menus, START);
  assert.ok(r.notes.some((n) => n.includes("다른 영수증")));
});

test("새벽 영수증(예약 다음날 02시)은 허용", () => {
  const r = validateReceipt({
    is_itemized: true, store_name: null, receipt_datetime: "2026-10-15T02:10", total: 8000,
    items: [{ raw_name: "된장찌개", menu_id: 3, qty: 1, unit_price: 8000, amount: 8000, confidence: "high" }],
  }, menus, START);
  assert.equal(r.status, "done");
});

test("일시 형식 오류 → null", () => {
  assert.equal(toKstIso("10/14 21:30"), null);
  assert.equal(toKstIso("2026-13-40T99:99"), null);
});

test("LLM 출력 형식 흔들림 보정", () => {
  const n = normalize({
    is_itemized: true, store_name: "가게A", receipt_datetime: "2026-10-14T21:30", total: "170,000",
    items: [
      { raw_name: " 삼겹살 ", menu_id: "1", qty: "8", unit_price: "15,000원", amount: 120000, confidence: "HIGH" },
      { raw_name: "", menu_id: null, qty: 1, unit_price: 1, amount: 1, confidence: "high" },
    ],
  });
  assert.equal(n.total, 170000);
  assert.equal(n.items.length, 1);
  assert.deepEqual(n.items[0], { raw_name: "삼겹살", menu_id: 1, qty: 8, unit_price: 15000, amount: 120000, confidence: "low" });
});

test("extractReceipt: 요청 형식과 tool_use 응답 파싱", async () => {
  let sent: any;
  const fakeFetch = (async (_url: string, init: any) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({
      content: [{ type: "tool_use", name: "record_receipt", input: {
        is_itemized: true, store_name: "가게A", receipt_datetime: "2026-10-14T21:30", total: 120000,
        items: [{ raw_name: "삼겹살", menu_id: 1, qty: 8, unit_price: 15000, amount: 120000, confidence: "high" }],
      } }],
    }), { status: 200 });
  }) as typeof fetch;

  const r = await extractReceipt({ apiKey: "test", imageBase64: "AAAA", mediaType: "image/jpeg", menus, storeName: "가게A", fetchFn: fakeFetch });
  assert.equal(r.items[0].menu_id, 1);
  assert.equal(sent.tool_choice.name, "record_receipt");
  assert.equal(sent.messages[0].content[0].type, "image");
  assert.ok(sent.messages[0].content[1].text.includes("id 1: 삼겹살"));
});

test("extractReceipt: API 오류 시 예외", async () => {
  const fakeFetch = (async () => new Response("overloaded", { status: 529 })) as typeof fetch;
  await assert.rejects(
    extractReceipt({ apiKey: "t", imageBase64: "A", mediaType: "image/png", menus, storeName: "", fetchFn: fakeFetch }),
    /LLM 호출 실패 \(529\)/,
  );
});

import { scoreReceipt, summarize } from "../scripts/eval-receipts.ts";

test("정확도 채점: 완전 정확 / 수량 오류 / 누락", () => {
  const gt = { file: "a", store: "s", total: 170000, items: [{ menu_id: 1, qty: 8, amount: 120000 }, { menu_id: 2, qty: 10, amount: 50000 }] };
  const base = { is_itemized: true, store_name: null, receipt_datetime: null, total: 170000 };
  const it = (menu_id: number, qty: number, amount: number) => ({ raw_name: "x", menu_id, qty, unit_price: amount / qty, amount, confidence: "high" as const });

  const perfect = scoreReceipt({ ...base, items: [it(1, 8, 120000), it(2, 10, 50000)] }, "done", gt, [1, 2]);
  assert.equal(perfect.perfect, true);

  const wrongQty = scoreReceipt({ ...base, items: [it(1, 7, 105000), it(2, 10, 50000)] }, "done", gt, [1, 2]);
  assert.equal(wrongQty.item_exact, 1);
  assert.equal(wrongQty.perfect, false);

  const missing = scoreReceipt({ ...base, total: 120000, items: [it(1, 8, 120000)] }, "needs_review", gt, [1]);
  assert.equal(missing.menu_found, 1);
  assert.equal(missing.total_ok, false);

  const sum = summarize([perfect, wrongQty, missing]);
  assert.equal(sum["품목 재현율 (정답 품목 중 정확히 읽은 비율)"], "66.7%");
  assert.equal(sum["검증 통과했지만 틀린 비율"], "50.0%");
});
