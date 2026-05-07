import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";
import { config } from "../config.js";

// AI question generation via Kimi/Moonshot. Uses Vercel AI SDK v6 with the
// OpenAI-compatible provider pointed at Moonshot's endpoint.
//
// Why we don't use Output.object({schema}): that sets responseFormat=json_schema,
// which Moonshot doesn't support (logs a warning, then either ignores it or
// returns empty). Instead we use the loose json_object mode (responseFormat
// passed via providerOptions below) AND a strict system prompt, then parse +
// Zod-validate ourselves. Portable across every OpenAI-compatible provider.
//
// Defaults to moonshot-v1-8k (fast, deterministic) instead of kimi-k2.6 (a
// reasoning model, much slower, can emit empty assistant content when
// reasoning tokens consume the entire output budget).
//
// Reliability: a single attempt has a hard 90s timeout. On empty/invalid
// output we retry once with stricter instructions before giving up.

export type GeneratedChoice = { id: string; label: string };
export type GeneratedQuestion = {
  prompt: string;
  choices: GeneratedChoice[];
  correctChoiceId: string;
  explanation?: string;
};

export type GenerateOptions = {
  topic: string;
  count: number;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  style?: "FACT" | "CONCEPTUAL" | "MIXED";
  language?: string;
  notes?: string;
  withExplanations: boolean;
};

const choiceSchema = z.object({
  id: z.string().min(1).max(4),
  label: z.string().min(1).max(200),
});
const questionItemSchema = z.object({
  prompt: z.string().min(1).max(280),
  choices: z.array(choiceSchema).length(4),
  correctChoiceId: z.string().min(1).max(4),
  explanation: z.string().max(600).optional(),
});
const responseEnvelopeSchema = z.object({
  questions: z.array(questionItemSchema).min(1).max(20),
});

function buildSystemPrompt(): string {
  return [
    "You are a quiz question generator.",
    "Reply with ONLY a single valid JSON object — no markdown fences, no prose, no code blocks.",
    "The JSON object MUST match this exact shape:",
    `{"questions":[{"prompt":"...","choices":[{"id":"a","label":"..."},{"id":"b","label":"..."},{"id":"c","label":"..."},{"id":"d","label":"..."}],"correctChoiceId":"a","explanation":"..."}, ...]}`,
    "Constraints:",
    "- Each question has EXACTLY 4 choices with ids 'a', 'b', 'c', 'd'.",
    "- correctChoiceId MUST be one of 'a', 'b', 'c', 'd'.",
    "- Exactly one choice is correct; distractors must be plausible.",
    "- Avoid 'all of the above' / 'none of the above' / double negatives.",
    "- Each prompt under 280 characters; each choice label under 200.",
  ].join("\n");
}

function buildUserPrompt(opts: GenerateOptions): string {
  const lines = [
    `Generate ${opts.count} multiple-choice quiz questions about: ${opts.topic}.`,
    `Difficulty: ${opts.difficulty ?? "MEDIUM"}.`,
    `Style: ${opts.style ?? "MIXED"} (FACT = direct recall; CONCEPTUAL = understanding; MIXED = both).`,
    `Language: ${opts.language ?? "English"}.`,
  ];
  if (opts.notes) lines.push(`Additional guidance: ${opts.notes}`);
  if (opts.withExplanations) {
    lines.push(
      'Include a brief "explanation" (under 600 chars) per question explaining WHY the correct answer is right.',
    );
  } else {
    lines.push('Do NOT include "explanation" fields.');
  }
  lines.push("");
  lines.push("Reply with the JSON object only.");
  return lines.join("\n");
}

// Some models still wrap JSON in ```json ... ``` despite instructions. Strip
// fences and any leading/trailing prose, then attempt to find the outermost
// {...} block. Defensive — if the model behaved we just return the input.
function extractJsonBlock(raw: string): string {
  let text = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` fences.
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i);
  if (fenceMatch) text = fenceMatch[1]!.trim();
  // If there's still leading/trailing prose, find the first '{' and last '}'.
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  return text;
}

// Validate that every question's correctChoiceId matches one of its choice ids.
// Zod can't enforce cross-field constraints concisely, so this is a runtime
// double-check.
function validateQuestions(questions: GeneratedQuestion[]): void {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]!;
    const ids = new Set(q.choices.map((c) => c.id));
    if (ids.size !== q.choices.length) {
      throw new Error(`Question ${i + 1}: choice ids must be unique`);
    }
    if (!ids.has(q.correctChoiceId)) {
      throw new Error(
        `Question ${i + 1}: correctChoiceId "${q.correctChoiceId}" does not match any choice id`,
      );
    }
  }
}

export class AiGenerationDisabledError extends Error {
  constructor() {
    super("MOONSHOT_API_KEY not configured");
    this.name = "AiGenerationDisabledError";
  }
}

// Lazily build the provider so the api can boot without a key. Throws a
// typed error if called when the key is missing.
function buildModel() {
  if (!config.MOONSHOT_API_KEY) throw new AiGenerationDisabledError();
  const provider = createOpenAICompatible({
    name: "moonshot",
    baseURL: config.MOONSHOT_BASE_URL,
    apiKey: config.MOONSHOT_API_KEY,
  });
  return provider.languageModel(config.MOONSHOT_MODEL);
}

// Single attempt at generation. Returns raw validated questions. Throws on
// empty / invalid output / network error.
async function attemptGeneration(
  opts: GenerateOptions,
  attempt: number,
): Promise<GeneratedQuestion[]> {
  const model = buildModel();
  // Token budget. moonshot-v1-8k has 8k context, so 4k output is the safe
  // ceiling. Empirically 10 questions with explanations is ~3-3.5k tokens
  // of output. For larger models we'd let this go higher, but capping
  // protects against pathological prompts.
  const perQuestion = opts.withExplanations ? 350 : 150;
  const maxOutputTokens = Math.min(4_000, 400 + opts.count * perQuestion);

  // Hard timeout — Moonshot occasionally hangs. AbortController so the
  // socket actually closes instead of waiting on global fetch defaults.
  const ac = new AbortController();
  const TIMEOUT_MS = 90_000;
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  let text = "";
  try {
    const result = await generateText({
      model,
      system: buildSystemPrompt(),
      prompt: buildUserPrompt(opts),
      maxOutputTokens,
      abortSignal: ac.signal,
      // Loose JSON mode. Moonshot supports response_format=json_object via
      // the OpenAI-compatible provider (but NOT json_schema, which is why
      // we don't use Output.object).
      providerOptions: {
        moonshot: { responseFormat: { type: "json_object" } },
      },
    });
    text = result.text ?? "";
  } finally {
    clearTimeout(timer);
  }

  if (!text.trim()) {
    throw new Error(
      attempt === 1
        ? "Model returned empty response"
        : "Model returned empty response (after retry)",
    );
  }
  const jsonBlock = extractJsonBlock(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlock);
  } catch (e) {
    throw new Error(
      `Model response was not valid JSON: ${e instanceof Error ? e.message : "unknown"}`,
    );
  }
  const safe = responseEnvelopeSchema.safeParse(parsed);
  if (!safe.success) {
    throw new Error(`Model response failed schema check: ${safe.error.message}`);
  }
  const trimmed = safe.data.questions.slice(0, opts.count);
  validateQuestions(trimmed);
  return trimmed;
}

export async function generateQuestions(
  opts: GenerateOptions,
): Promise<GeneratedQuestion[]> {
  if (opts.count < 1 || opts.count > 20) {
    throw new Error("count must be between 1 and 20");
  }
  // First attempt. On empty / parse-fail / timeout we retry exactly once;
  // hard errors (auth, schema validation of well-formed but wrong content)
  // surface immediately on the second attempt as well so we don't loop.
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const questions = await attemptGeneration(opts, attempt);
      return questions.map((q) => ({
        ...q,
        // Frontend uses this as a stable React key during the review/edit
        // step before save. Ignored by the server bulk-save endpoint.
        ...({ _draftId: nanoid(8) } as object),
      }));
    } catch (e) {
      lastErr = e;
      // Don't retry obvious permanent failures.
      if (e instanceof AiGenerationDisabledError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("count must be between")) throw e;
      // Otherwise loop once more.
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI generation failed");
}
