/** Cloudflare Worker: one-shot photo identify for the FitCheck V2 PoC. */

export const MAX_IDENTIFY_BYTES = 4 * 1024 * 1024;
export const MODEL_ID = "@cf/meta/llama-3.2-11b-vision-instruct";
export const MAX_TOKENS = 300;
export const CONSENT_HEADER = "X-FitCheck-Consent";
export const CONSENT_VALUE = "yes";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const STRING_CAP = 120;
const ARRAY_CAP = 12;
const ARRAY_ITEM_CAP = 80;

export type IdentifyFields = {
  category: "clothing" | "shoes" | "other";
  brand: string | null;
  model: string | null;
  colorway: string | null;
  styleCode: string | null;
  visibleText: string[];
  uncertainties: string[];
  containsPerson: boolean;
};

export type WorkerEnv = {
  AI: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
  DB: {
    prepare: (query: string) => {
      bind: (...values: unknown[]) => {
        run: () => Promise<{ meta?: { changes?: number } }>;
      };
    };
  };
  ALLOWED_ORIGINS: string;
  SEARCH_CAP: string;
};

export const IDENTIFY_PROMPT =
  "Identify the clothing or shoes in the photo. Reply with JSON only, no markdown or prose. " +
  "Keys: category (clothing, shoes, or other), brand, model, colorway, styleCode, " +
  "visibleText (array of strings), uncertainties (array of strings), containsPerson (boolean). " +
  "Use null for anything not clearly visible. Never guess a brand, model, or style code.";

export function normalizeContentType(header: string | null): string | null {
  if (!header) return null;
  const base = header.split(";")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_TYPES.has(base) ? base : null;
}

export function matchesMagicBytes(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (contentType === "image/webp") {
    if (bytes.length < 12) return false;
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    return riff === "RIFF" && webp === "WEBP";
  }
  return false;
}

export function extractFirstJsonObject(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function capString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, STRING_CAP);
}

function capStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().slice(0, ARRAY_ITEM_CAP);
    if (!trimmed) continue;
    out.push(trimmed);
    if (out.length >= ARRAY_CAP) break;
  }
  return out;
}

export function coerceIdentifyFields(raw: unknown): IdentifyFields | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const categoryRaw = typeof obj.category === "string" ? obj.category.trim().toLowerCase() : "";
  const category =
    categoryRaw === "clothing" || categoryRaw === "shoes" || categoryRaw === "other"
      ? categoryRaw
      : null;
  if (!category) return null;
  return {
    category,
    brand: capString(obj.brand),
    model: capString(obj.model),
    colorway: capString(obj.colorway),
    styleCode: capString(obj.styleCode),
    visibleText: capStringArray(obj.visibleText),
    uncertainties: capStringArray(obj.uncertainties),
    containsPerson: obj.containsPerson === true,
  };
}

export function parseModelOutput(output: unknown): IdentifyFields | null {
  let text = "";
  if (typeof output === "string") text = output;
  else if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    if (typeof record.response === "string") text = record.response;
    else if (typeof record.description === "string") text = record.description;
    else text = JSON.stringify(output);
  } else return null;
  return coerceIdentifyFields(extractFirstJsonObject(text));
}

function parseSearchCap(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-FitCheck-Consent",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function errorResponse(
  status: number,
  error: string,
  code: string,
  origin: string | null,
): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify({ error, code }), { status, headers });
}

function successResponse(identified: Omit<IdentifyFields, "containsPerson">, origin: string): Response {
  return new Response(JSON.stringify({ identified }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
    },
  });
}

/** Pure request handler — pass fake AI/DB in tests. */
export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const allowed = env.ALLOWED_ORIGINS;
  const origin = request.headers.get("Origin");

  if (origin !== allowed) {
    return errorResponse(403, "Origin not allowed", "forbidden_origin", null);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== "POST") {
    return errorResponse(404, "Not found", "not_found", origin);
  }

  const url = new URL(request.url);
  if (url.pathname !== "/api/identify") {
    return errorResponse(404, "Not found", "not_found", origin);
  }

  if (request.headers.get(CONSENT_HEADER) !== CONSENT_VALUE) {
    return errorResponse(400, "Consent required", "consent_required", origin);
  }

  const contentType = normalizeContentType(request.headers.get("Content-Type"));
  if (!contentType) {
    return errorResponse(400, "Unsupported media type", "bad_type", origin);
  }

  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_IDENTIFY_BYTES) {
    return errorResponse(413, "Image too large", "too_large", origin);
  }
  if (buffer.byteLength === 0) {
    return errorResponse(400, "Unsupported media type", "bad_type", origin);
  }

  const bytes = new Uint8Array(buffer);
  if (!matchesMagicBytes(bytes, contentType)) {
    return errorResponse(400, "Unsupported media type", "bad_type", origin);
  }

  const cap = parseSearchCap(env.SEARCH_CAP);
  let changes = 0;
  try {
    const result = await env.DB.prepare(
      "UPDATE search_quota SET used = used + 1 WHERE id = 1 AND used < ?",
    )
      .bind(cap)
      .run();
    changes = result.meta?.changes ?? 0;
  } catch {
    console.error("db_error");
    return errorResponse(503, "Service unavailable", "db_unavailable", origin);
  }

  if (changes < 1) {
    return errorResponse(429, "Quota exhausted", "quota_exhausted", origin);
  }

  let modelOut: unknown;
  try {
    modelOut = await env.AI.run(MODEL_ID, {
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: [...bytes] },
            { type: "text", text: IDENTIFY_PROMPT },
          ],
        },
      ],
      max_tokens: MAX_TOKENS,
    });
  } catch {
    console.error("model_error");
    return errorResponse(502, "Identify failed", "identify_failed", origin);
  }

  const fields = parseModelOutput(modelOut);
  if (!fields) {
    console.error("identify_failed");
    return errorResponse(502, "Identify failed", "identify_failed", origin);
  }

  if (fields.category === "other" || fields.containsPerson) {
    return errorResponse(422, "Unsupported photo", "unsupported_photo", origin);
  }

  return successResponse(
    {
      category: fields.category,
      brand: fields.brand,
      model: fields.model,
      colorway: fields.colorway,
      styleCode: fields.styleCode,
      visibleText: fields.visibleText,
      uncertainties: fields.uncertainties,
    },
    origin,
  );
}

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleRequest(request, env);
  },
};
