// 실행: node --experimental-strip-types --test tests/layout.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateSeats, findFreeSpot, extractLayout, fitBox, heightFromImage, normalizeLayout, stripForSave, summarizeLayout, toExtractResult,
} from "../supabase/functions/extract-layout/layout.ts";

test("사진 비율 → 캔버스 세로 (40~200 범위)", () => {
  assert.equal(heightFromImage(1500, 1000), 67);
  assert.equal(heightFromImage(1000, 1500), 150);
  assert.equal(heightFromImage(3000, 500), 40);
  assert.equal(heightFromImage(500, 3000), 200);
  assert.equal(heightFromImage(null, null), 70);
});

test("상자를 캔버스 안으로: 최소 크기, 넘치면 안쪽으로", () => {
  assert.deepEqual(fitBox({ x: 98, y: 5, w: 10, h: 1 }, 60), { x: 90, y: 5, w: 10, h: 3 });
  assert.deepEqual(fitBox({ x: -5, y: 70, w: 20, h: 20 }, 60), { x: 0, y: 40, w: 20, h: 20 });
});

test("인식 결과 정리: % → 캔버스, 좌석 추정, 라벨 채우기·중복, 잘못된 항목 제거", () => {
  const l = normalizeLayout({
    tables: [
      { x: 10, y: 50, w: 10, h: 10, shape: "round", seats: 4, label: "1", confidence: "high" },   // 아래쪽 왼쪽
      { x: 50, y: 10, w: 20, h: 10, shape: "rect", seats: null, label: null, confidence: "low" }, // 위쪽 → T1
      { x: 70, y: 50, w: 10, h: 10, shape: "hexagon", seats: 99, label: "1", confidence: "x" },   // 중복 라벨 → T2
      { x: 10, y: 10, w: 0, h: 10, shape: "rect", seats: 2, label: null },                        // 크기 0 → 제거
      { x: "a", y: 10, w: 5, h: 5 },                                                                // 숫자 아님 → 제거
    ],
    fixtures: [
      { x: 0, y: 95, w: 10, h: 5, kind: "entrance", label: null },
      { x: 90, y: 0, w: 10, h: 10, kind: "sauna", label: "  " },
      { x: 50, y: 50, w: -1, h: 5, kind: "counter", label: null },
    ],
  }, { height: 80, unit: "percent" });

  assert.equal(l.width, 100);
  assert.equal(l.height, 80);
  assert.deepEqual(l.tables.map((t) => t.label), ["T1", "1", "T2"]); // 읽는 순서: 위 → 아래, 왼쪽 → 오른쪽
  const top = l.tables[0];
  assert.deepEqual([top.x, top.y, top.w, top.h], [50, 8, 20, 8]);  // y,h 는 세로 % × 80/100
  assert.equal(top.seats, estimateSeats(20, 8));                   // 좌석 null → 크기로 추정
  assert.equal(top.confidence, "low");
  assert.equal(l.tables[2].shape, "rect");
  assert.equal(l.tables[2].seats, 30);                              // 상한
  assert.equal(l.tables[2].confidence, undefined);
  assert.deepEqual(new Set(l.tables.map((t) => t.id)).size, 3);
  assert.deepEqual(l.fixtures.map((f) => [f.kind, f.label]), [["entrance", null], ["other", null]]);
});

test("편집 중 배치도 정리(canvas 단위): 기존 id·라벨 유지, 중복 id 재발급", () => {
  const l = normalizeLayout({
    height: 60,
    tables: [
      { id: "a1", label: "창가", x: 5, y: 5, w: 10, h: 10, shape: "rect", seats: 4 },
      { id: "a1", label: "룸", x: 30, y: 5, w: 10, h: 10, shape: "rect", seats: 6 },
      { id: "<bad>", label: "", x: 60, y: 5, w: 10, h: 10, shape: "round", seats: 2 },
    ],
    fixtures: [],
  });
  assert.deepEqual(l.tables.map((t) => [t.id, t.label]), [["a1", "창가"], ["t1", "룸"], ["t2", "T1"]]);
  assert.deepEqual([l.tables[0].x, l.tables[0].y], [5, 5]); // canvas 단위는 변환 없음
});

test("검사: 겹침, 좌석 합계 vs 최대 인원, 추정 좌석, 빈 배치", () => {
  const l = normalizeLayout({ height: 60, tables: [
    { label: "A", x: 10, y: 10, w: 20, h: 10, seats: 4 },
    { label: "B", x: 15, y: 12, w: 20, h: 10, seats: 4, confidence: "low" }, // A 와 크게 겹침
    { label: "C", x: 60, y: 10, w: 10, h: 10, seats: 2 },
    { label: "D", x: 70, y: 10, w: 10, h: 10, seats: 2 },    // C 와 딱 맞닿음 → 겹침 아님
    { label: "E", x: 33, y: 18, w: 10, h: 10, seats: 2 },    // B 와 모서리 2×4 겹침 → 겹침
  ] });
  const s = summarizeLayout(l, 40);
  assert.equal(s.total_seats, 14);
  assert.deepEqual(s.overlaps, [["A", "B"], ["B", "E"]]);
  assert.ok(s.warnings.some((w) => w.includes("A·B")));
  assert.ok(s.warnings.some((w) => w.includes("14석") && w.includes("40명")));
  assert.ok(s.warnings.some((w) => w.includes("추정")));
  assert.ok(summarizeLayout(normalizeLayout({}), 10).warnings[0].includes("테이블이 하나도"));
  assert.equal(stripForSave(l).tables.some((t) => "confidence" in t), false);
});

test("인식 결과 → 응답: 배치가 아닌 사진, 실내 사진 안내", () => {
  const notLayout = toExtractResult({ is_layout: false, source_type: "other", tables: [{ x: 1, y: 1, w: 5, h: 5 }], fixtures: [], note: null }, 60);
  assert.equal(notLayout.layout.tables.length, 0);
  assert.ok(notLayout.note?.includes("찾지 못했어요"));
  const photo = toExtractResult({ is_layout: true, source_type: "photo", tables: [{ x: 1, y: 1, w: 5, h: 5, seats: 2 }], fixtures: [], note: null }, 60);
  assert.ok(photo.note?.includes("대략적"));
});

test("LLM 호출: 요청 형식과 tool 출력 처리", async () => {
  let sent: Record<string, unknown> | null = null;
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({
      content: [{ type: "tool_use", name: "record_layout", input: {
        is_layout: true, source_type: "floor_plan", note: null,
        tables: [{ x: 10, y: 10, w: 20, h: 20, shape: "rect", seats: 6, label: null, confidence: "high" }],
        fixtures: [{ x: 0, y: 90, w: 10, h: 10, kind: "entrance", label: null }],
      } }],
    }), { status: 200 });
  }) as typeof fetch;
  const r = await extractLayout({
    apiKey: "k", imageBase64: "AAA", mediaType: "image/jpeg", storeName: "고기굽는집",
    imageWidth: 1000, imageHeight: 500, maxCapacity: 60, fetchFn: fakeFetch,
  });
  assert.equal((sent as unknown as { tool_choice: { name: string } }).tool_choice.name, "record_layout");
  assert.equal(r.layout.height, 50);
  assert.deepEqual([r.layout.tables[0].y, r.layout.tables[0].h], [5, 10]);
  assert.equal(r.summary.total_seats, 6);
  assert.ok(r.summary.warnings.some((w) => w.includes("60명")));

  const bad = (async () => new Response("rate limited", { status: 429 })) as typeof fetch;
  await assert.rejects(() => extractLayout({ apiKey: "k", imageBase64: "A", mediaType: "image/png", storeName: "x", fetchFn: bad }), /429/);
});

test("새 테이블 빈자리: 기존 테이블·시설과 겹치지 않는 첫 위치", () => {
  const l = normalizeLayout({ height: 40, tables: [{ label: "A", x: 0, y: 0, w: 50, h: 20, seats: 4 }],
    fixtures: [{ kind: "entrance", x: 50, y: 0, w: 50, h: 10 }] });
  const p = findFreeSpot(l, 14, 10);
  assert.deepEqual(p, { x: 52, y: 12 });
  const full = normalizeLayout({ height: 40, tables: [{ label: "A", x: 0, y: 0, w: 100, h: 40, seats: 4 }] });
  assert.deepEqual(findFreeSpot(full, 14, 10), { x: 43, y: 15 }); // 자리가 없으면 가운데
});
