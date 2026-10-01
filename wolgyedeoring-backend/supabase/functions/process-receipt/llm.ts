// 영수증 이미지 → 구조화 JSON (Claude API, tool use 로 출력 형식 고정)
// 다른 LLM 으로 바꾸려면 이 파일의 extractReceipt 만 교체하면 됨

import type { LlmReceipt, Menu } from "./validate.ts";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const TOOL_NAME = "record_receipt";

const RECEIPT_TOOL = {
  name: TOOL_NAME,
  description: "영수증에서 읽은 내용을 기록한다.",
  input_schema: {
    type: "object",
    properties: {
      is_itemized: { type: "boolean", description: "품목(메뉴명·수량·금액)이 인쇄된 영수증이면 true" },
      store_name: { type: ["string", "null"], description: "영수증에 인쇄된 가맹점명" },
      receipt_datetime: {
        type: ["string", "null"],
        description: "영수증 일시, 형식 YYYY-MM-DDTHH:mm. 읽을 수 없으면 null",
      },
      total: { type: ["integer", "null"], description: "최종 결제 총액(원)" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            raw_name: { type: "string", description: "영수증에 인쇄된 품목명 원문 그대로" },
            menu_id: { type: ["integer", "null"], description: "제공된 메뉴 목록 중 같은 메뉴의 id. 확실하지 않으면 null" },
            qty: { type: ["integer", "null"] },
            unit_price: { type: ["integer", "null"] },
            amount: { type: ["integer", "null"] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["raw_name", "menu_id", "qty", "unit_price", "amount", "confidence"],
        },
      },
    },
    required: ["is_itemized", "store_name", "receipt_datetime", "total", "items"],
  },
};

export function buildPrompt(menus: Menu[], storeName: string): string {
  const menuLines = menus.length
    ? menus.map((m) => `- id ${m.id}: ${m.name}${m.price !== null ? ` (${m.price}원)` : ""}`).join("\n")
    : "(등록된 메뉴 없음)";

  return [
    `이 이미지는 "${storeName}" 가게의 영수증입니다. 내용을 ${TOOL_NAME} 도구로 기록하세요.`,
    "",
    "이 가게의 등록 메뉴:",
    menuLines,
    "",
    "규칙:",
    "1. raw_name 에는 영수증에 인쇄된 글자를 그대로 적는다. 고치거나 추측해서 바꾸지 않는다.",
    "2. menu_id 는 위 목록에서 같은 메뉴라고 판단될 때만 적고, 목록에 없거나 확실하지 않으면 null.",
    "3. 읽을 수 없는 값은 추측하지 말고 null 로 둔다.",
    "4. 할인, 봉사료, 부가세 줄은 items 에 넣지 않는다.",
    "5. 품목이 인쇄되지 않은 영수증(카드 전표 등)이면 is_itemized 를 false, items 를 빈 배열로 한다.",
    "6. 금액은 원 단위 정수, 쉼표 없이.",
    "7. confidence: 글자가 선명하고 메뉴 매칭이 확실하면 high, 일부 불확실하면 medium, 많이 불확실하면 low.",
  ].join("\n");
}

export async function extractReceipt(opts: {
  apiKey: string;
  imageBase64: string;
  mediaType: ImageMediaType;
  menus: Menu[];
  storeName: string;
  model?: string;
  fetchFn?: typeof fetch; // 테스트용 주입
}): Promise<LlmReceipt> {
  const doFetch = opts.fetchFn ?? fetch;

  const res = await doFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: 2000,
      tools: [RECEIPT_TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: opts.mediaType, data: opts.imageBase64 } },
            { type: "text", text: buildPrompt(opts.menus, opts.storeName) },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LLM 호출 실패 (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const block = (data.content ?? []).find(
    (b: { type: string; name?: string }) => b.type === "tool_use" && b.name === TOOL_NAME,
  );
  if (!block) throw new Error("LLM 응답에 영수증 기록이 없습니다");

  return normalize(block.input);
}

// LLM 출력의 형식 흔들림 보정 (문자열 숫자, "15,000" 등)
function toIntOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const n = Number(v.replace(/[,\s원]/g, ""));
    return Number.isFinite(n) && v.trim() !== "" ? Math.round(n) : null;
  }
  return null;
}

export function normalize(input: Record<string, unknown>): LlmReceipt {
  const items = Array.isArray(input.items) ? input.items : [];
  return {
    is_itemized: Boolean(input.is_itemized),
    store_name: typeof input.store_name === "string" ? input.store_name : null,
    receipt_datetime: typeof input.receipt_datetime === "string" ? input.receipt_datetime : null,
    total: toIntOrNull(input.total),
    items: items
      .filter((it: Record<string, unknown>) => typeof it?.raw_name === "string" && it.raw_name.trim() !== "")
      .map((it: Record<string, unknown>) => ({
        raw_name: String(it.raw_name).trim(),
        menu_id: toIntOrNull(it.menu_id),
        qty: toIntOrNull(it.qty),
        unit_price: toIntOrNull(it.unit_price),
        amount: toIntOrNull(it.amount),
        confidence: (["high", "medium", "low"].includes(it.confidence as string) ? it.confidence : "low") as
          "high" | "medium" | "low",
      })),
  };
}
