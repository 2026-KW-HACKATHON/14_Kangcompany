// 영수증 인식 정확도 측정
//
// 준비:
//   eval/receipts/        실제 영수증 사진 (jpg/png/webp)
//   eval/ground_truth.json 정답 (형식은 eval/ground_truth.example.json 참고)
//
// 실행 (Node 22 이상):
//   ANTHROPIC_API_KEY=... node --experimental-strip-types scripts/eval-receipts.ts
//   옵션: --model=모델명      다른 모델과 비교
//         --no-menu          메뉴 목록을 주지 않고 인식 (메뉴 목록 효과 비교용)
//         --limit=5          앞의 N장만
//
// 결과: 콘솔 요약 + eval/results-<모델>-<menu|nomenu>.json

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { extractReceipt, DEFAULT_MODEL, type ImageMediaType } from "../supabase/functions/process-receipt/llm.ts";
import { validateReceipt, toKstIso, type LlmReceipt, type Menu } from "../supabase/functions/process-receipt/validate.ts";

export interface GtItem { menu_id: number; qty: number; amount: number }
export interface GtReceipt { file: string; store: string; total: number; date?: string; items: GtItem[] }

export interface Score {
  gt_items: number;
  pred_items: number;
  menu_found: number;     // 정답 메뉴가 예측에 존재
  item_exact: number;     // 메뉴·수량·금액 모두 일치
  total_ok: boolean;
  status: "done" | "needs_review";
  perfect: boolean;       // 모든 품목·총액 정확, 여분 품목 없음
}

// 한 장 채점 (메뉴 매칭된 품목 기준)
export function scoreReceipt(pred: LlmReceipt, status: "done" | "needs_review", gt: GtReceipt, validatedMenuIds: (number | null)[]): Score {
  const predItems = pred.items.map((it, i) => ({ ...it, menu_id: validatedMenuIds[i] }));
  const used = new Set<number>();
  let menuFound = 0, exact = 0;

  for (const g of gt.items) {
    const idx = predItems.findIndex((p, i) => !used.has(i) && p.menu_id === g.menu_id);
    if (idx === -1) continue;
    used.add(idx);
    menuFound++;
    if (predItems[idx].qty === g.qty && predItems[idx].amount === g.amount) exact++;
  }

  const totalOk = pred.total === gt.total;
  return {
    gt_items: gt.items.length,
    pred_items: predItems.length,
    menu_found: menuFound,
    item_exact: exact,
    total_ok: totalOk,
    status,
    perfect: exact === gt.items.length && predItems.length === gt.items.length && totalOk,
  };
}

export function summarize(scores: Score[]) {
  const sum = (f: (s: Score) => number) => scores.reduce((a, s) => a + f(s), 0);
  const gtItems = sum((s) => s.gt_items);
  const predItems = sum((s) => s.pred_items);
  const done = scores.filter((s) => s.status === "done");
  const pct = (a: number, b: number) => (b === 0 ? "-" : `${((a / b) * 100).toFixed(1)}%`);
  return {
    receipts: scores.length,
    "품목 재현율 (정답 품목 중 정확히 읽은 비율)": pct(sum((s) => s.item_exact), gtItems),
    "품목 정밀도 (읽은 품목 중 정확한 비율)": pct(sum((s) => s.item_exact), predItems),
    "메뉴 매칭률": pct(sum((s) => s.menu_found), gtItems),
    "총액 정확도": pct(scores.filter((s) => s.total_ok).length, scores.length),
    "완전 정확 영수증": pct(scores.filter((s) => s.perfect).length, scores.length),
    "자동 통과율 (사장님 확인 불필요)": pct(done.length, scores.length),
    // 가장 중요한 안전 지표: 검증을 통과했는데 틀린 영수증 → 통계 오염
    "검증 통과했지만 틀린 비율": pct(done.filter((s) => !s.perfect).length, done.length),
  };
}

// ---------------------------------------------------------------------
async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 를 설정하세요");

  const model = (args.model as string) ?? DEFAULT_MODEL;
  const useMenu = !args["no-menu"];
  const gtPath = "eval/ground_truth.json";
  if (!existsSync(gtPath)) throw new Error(`${gtPath} 가 없습니다 (eval/ground_truth.example.json 참고)`);

  const gt = JSON.parse(readFileSync(gtPath, "utf8")) as {
    stores: Record<string, Menu[]>;
    receipts: GtReceipt[];
  };
  const receipts = args.limit ? gt.receipts.slice(0, Number(args.limit)) : gt.receipts;
  const types: Record<string, ImageMediaType> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

  const scores: Score[] = [];
  const details: unknown[] = [];

  for (const r of receipts) {
    const menus = gt.stores[r.store] ?? [];
    const mediaType = types[extname(r.file).toLowerCase()];
    if (!mediaType) { console.warn(`건너뜀 (형식): ${r.file}`); continue; }
    const image = readFileSync(join("eval/receipts", r.file)).toString("base64");

    const t0 = Date.now();
    try {
      const pred = await extractReceipt({ apiKey, imageBase64: image, mediaType, menus: useMenu ? menus : [], storeName: r.store, model });
      // 메뉴 목록 없이 인식한 경우에도 채점은 이름 일치로 메뉴 ID 를 붙여서 비교
      if (!useMenu) {
        for (const it of pred.items) {
          const hit = menus.find((m) => it.raw_name.replace(/\s/g, "").includes(m.name.replace(/\s/g, "")));
          it.menu_id = hit ? hit.id : null;
        }
      }
      // 일시 검증 기준: 정답에 date 가 있으면 그 값, 없으면 인식된 일시 (일시 검증 제외)
      const start = r.date ?? toKstIso(pred.receipt_datetime) ?? new Date().toISOString();
      const v = validateReceipt(pred, menus, start);
      const s = scoreReceipt(pred, v.status, r, v.items.map((i) => i.menu_id));
      scores.push(s);
      details.push({ file: r.file, ms: Date.now() - t0, score: s, notes: v.notes, pred });
      console.log(`${r.file}: ${s.item_exact}/${s.gt_items} 품목 정확, 총액 ${s.total_ok ? "O" : "X"}, ${s.status}`);
    } catch (e) {
      console.error(`${r.file}: 실패 - ${(e as Error).message}`);
      details.push({ file: r.file, error: (e as Error).message });
    }
  }

  const summary = summarize(scores);
  console.log(`\n=== ${model} / 메뉴 목록 ${useMenu ? "제공" : "미제공"} ===`);
  console.table(summary);
  const out = `eval/results-${model}-${useMenu ? "menu" : "nomenu"}.json`;
  writeFileSync(out, JSON.stringify({ model, useMenu, summary, details }, null, 2));
  console.log(`저장: ${out}`);
}

if (process.argv[1]?.endsWith("eval-receipts.ts")) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
