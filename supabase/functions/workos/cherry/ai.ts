// Provider dispatch for Cherry.
//
// Both providers are called over plain REST rather than through their npm
// SDKs. Deno supports npm: specifiers and this function already uses two, but
// the AI SDKs pull large dependency trees onto a function that serves every
// request in the app, and their surface here is a single POST. REST also means
// no SDK version can change the wire format underneath us.
//
// Whatever happens, `parseCommand` returns something usable: a provider error
// falls back to the built-in lexical parser rather than surfacing as a failure.
// Cherry is never a dead button.

import type { CherryDraft } from "./types.ts";
import { CHERRY_DRAFT_SCHEMA, CHERRY_SYSTEM } from "./prompts.ts";
import { parseCommandLexically } from "./deterministic.ts";
import type { CherryContext } from "./context.ts";

export type ProviderName = "anthropic" | "gemini" | "builtin";

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-opus-5",
  gemini: "gemini-2.5-flash",
};

export interface ResolvedProvider {
  name: ProviderName;
  apiKey?: string;
  model?: string;
  reason: string;
}

/**
 * Which provider to use, and why.
 *
 * The `reason` is surfaced through /cherry/status so the UI can say up front
 * that Cherry is running without a key, rather than letting the user discover
 * it from disappointing output.
 */
export function resolveProvider(preference?: string): ResolvedProvider {
  const anthropicKey = Deno.env.get("CHERRY_ANTHROPIC_API_KEY") ?? "";
  const geminiKey = Deno.env.get("CHERRY_GEMINI_API_KEY") ?? "";
  const configured = (preference && preference !== "auto")
    ? preference
    : (Deno.env.get("CHERRY_AI_PROVIDER") ?? "auto");
  const model = Deno.env.get("CHERRY_AI_MODEL") || undefined;

  if (configured === "builtin") {
    return { name: "builtin", reason: "The built-in parser is selected in settings." };
  }
  if (configured === "anthropic") {
    if (!anthropicKey) return { name: "builtin", reason: "Anthropic is selected but CHERRY_ANTHROPIC_API_KEY is not set." };
    return { name: "anthropic", apiKey: anthropicKey, model: model ?? DEFAULT_MODELS.anthropic, reason: "Anthropic, selected in settings." };
  }
  if (configured === "gemini") {
    if (!geminiKey) return { name: "builtin", reason: "Gemini is selected but CHERRY_GEMINI_API_KEY is not set." };
    return { name: "gemini", apiKey: geminiKey, model: model ?? DEFAULT_MODELS.gemini, reason: "Gemini, selected in settings." };
  }

  if (anthropicKey) return { name: "anthropic", apiKey: anthropicKey, model: model ?? DEFAULT_MODELS.anthropic, reason: "Anthropic key found." };
  if (geminiKey) return { name: "gemini", apiKey: geminiKey, model: model ?? DEFAULT_MODELS.gemini, reason: "Gemini key found." };
  return { name: "builtin", reason: "No AI key is configured, so Cherry is using her built-in parser." };
}

export interface ParseOutcome {
  draft: CherryDraft;
  provider: ProviderName;
  /** Set when a provider was tried and failed, and the builtin answered instead. */
  degradedFrom?: ProviderName;
  error?: string;
}

export async function parseCommand(
  message: string,
  prompt: string,
  ctx: CherryContext,
  preference?: string,
): Promise<ParseOutcome> {
  const provider = resolveProvider(preference);

  if (provider.name === "builtin") {
    return { draft: parseCommandLexically(message, ctx), provider: "builtin" };
  }

  try {
    const draft = provider.name === "anthropic"
      ? await callAnthropic(prompt, provider)
      : await callGemini(prompt, provider);
    return { draft, provider: provider.name };
  } catch (err) {
    // A provider being down, rate-limited or misconfigured must not stop
    // someone getting work into their board.
    return {
      draft: parseCommandLexically(message, ctx),
      provider: "builtin",
      degradedFrom: provider.name,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Verifies a key works, without falling back - Settings needs the truth. */
export async function testProvider(preference?: string): Promise<{ ok: boolean; provider: ProviderName; model?: string; error?: string }> {
  const provider = resolveProvider(preference);
  if (provider.name === "builtin") {
    return { ok: true, provider: "builtin" };
  }
  try {
    const probe = 'Reply with intent_kind "question", an empty commands array, and the word ok as the reply.';
    const draft = provider.name === "anthropic"
      ? await callAnthropic(probe, provider)
      : await callGemini(probe, provider);
    return { ok: Boolean(draft), provider: provider.name, model: provider.model };
  } catch (err) {
    return { ok: false, provider: provider.name, model: provider.model, error: err instanceof Error ? err.message : String(err) };
  }
}

// ------------------------------------------------------------- Anthropic --

async function callAnthropic(prompt: string, provider: ResolvedProvider): Promise<CherryDraft> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": provider.apiKey!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 8000,
      system: CHERRY_SYSTEM,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: CHERRY_DRAFT_SCHEMA },
      },
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Anthropic returned ${res.status}`);
  }

  const body = await res.json();

  // A declined request comes back as HTTP 200 with stop_reason "refusal" and
  // no usable content. Checking content first would make that look like a
  // parsing bug rather than what it is.
  if (body.stop_reason === "refusal") {
    throw new Error("Cherry declined that request.");
  }

  const text = (body.content ?? []).find((b: { type: string }) => b.type === "text")?.text;
  if (!text) throw new Error("Anthropic returned no text content.");
  return JSON.parse(text) as CherryDraft;
}

// ---------------------------------------------------------------- Gemini --

// Thinking tokens are charged against maxOutputTokens. Without headroom the
// response comes back empty with no error at all, which is a genuinely
// baffling failure to debug from the outside.
const THINKING_HEADROOM = 4000;

async function callGemini(prompt: string, provider: ResolvedProvider): Promise<CherryDraft> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": provider.apiKey! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: CHERRY_SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(CHERRY_DRAFT_SCHEMA),
        maxOutputTokens: 8000 + THINKING_HEADROOM,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Gemini returned ${res.status}`);
  }

  const body = await res.json();
  const candidate = body.candidates?.[0];
  if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
    throw new Error("Cherry declined that request.");
  }
  const text = candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini returned no content.");
  return JSON.parse(text) as CherryDraft;
}

/**
 * Translates a JSON Schema into the OpenAPI dialect Gemini accepts.
 *
 * Two incompatibilities matter: `additionalProperties` is rejected outright,
 * and a `type` union like ["object","null"] is invalid where Gemini wants a
 * single type plus `nullable`.
 */
// deno-lint-ignore no-explicit-any
export function toGeminiSchema(schema: any): any {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;

  // deno-lint-ignore no-explicit-any
  const out: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties") continue;
    if (key === "type" && Array.isArray(value)) {
      const types = value.filter((t) => t !== "null");
      out.type = types[0] ?? "string";
      if (types.length !== value.length) out.nullable = true;
      continue;
    }
    if (key === "properties" && value && typeof value === "object") {
      // deno-lint-ignore no-explicit-any
      const props: any = {};
      for (const [name, sub] of Object.entries(value)) props[name] = toGeminiSchema(sub);
      out.properties = props;
      continue;
    }
    out[key] = toGeminiSchema(value);
  }
  return out;
}
