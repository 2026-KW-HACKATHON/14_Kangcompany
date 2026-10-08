// 영수증 이미지 → 구조화 JSON (Gemini API, JSON 출력)
// 다른 LLM 으로 바꾸려면 이 파일의 extractReceipt 만 교체하면 됨

import type { LlmReceipt, Menu } from "./validate.ts";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const RECEIPT_SCHEMA = {
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
};

export function buildPrompt(menus: Menu[], storeName: string): string {
  const menuLines = menus.length
    ? menus.map((m) => `- id ${m.id}: ${m.name}${m.price !== null ? ` (${m.price}원)` : ""}`).join("\n")
    : "(등록된 메뉴 없음)";

  return [
    `이 이미지는 "${storeName}" 가게의 영수증입니다. 내용을 JSON 으로 기록하세요.`,
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
  const out = await callGeminiJson({
    apiKey: opts.apiKey, model: opts.model, imageBase64: opts.imageBase64, mediaType: opts.mediaType,
    prompt: buildPrompt(opts.menus, opts.storeName), schema: RECEIPT_SCHEMA, fetchFn: opts.fetchFn,
  });
  return normalize(out);
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

// ---- Gemini 호출 (무료 구간 사용). 이미지 + 지시문 → JSON 객체 ----
// 모델은 GEMINI_MODEL 비밀값으로 바꿀 수 있음. 기본값은 최신 Flash 별칭.
export const DEFAULT_MODEL = "gemini-flash-latest";

async function callGeminiJson(opts: {
  apiKey: string; model?: string; imageBase64: string; mediaType: string;
  prompt: string; schema: unknown; fetchFn?: typeof fetch;
}): Promise<Record<string, unknown>> {
  const model = opts.model || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await (opts.fetchFn ?? fetch)(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: opts.mediaType, data: opts.imageBase64 } },
          { text: `${opts.prompt}\n\n응답은 아래 JSON 스키마를 따르는 JSON 객체 하나만 출력하세요. 설명 문장은 쓰지 마세요.\n${JSON.stringify(opts.schema)}` },
        ],
      }],
      generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 16384 },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LLM 호출 실패 (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const cand = data?.candidates?.[0];
  const text = ((cand?.content?.parts ?? []) as { text?: string; thought?: boolean }[])
    .filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("").trim();
  if (!text) throw new Error(`LLM 응답이 비어 있습니다 (${cand?.finishReason ?? data?.promptFeedback?.blockReason ?? "unknown"})`);
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); } catch { throw new Error(`LLM 응답이 JSON 이 아닙니다: ${cleaned.slice(0, 200)}`); }
  if (Array.isArray(parsed)) parsed = parsed.length === 1 && !("name" in (parsed[0] ?? {})) ? parsed[0] : { items: parsed };
  if (!parsed || typeof parsed !== "object") throw new Error("LLM 응답 형식이 올바르지 않습니다");
  return parsed as Record<string, unknown>;
}
