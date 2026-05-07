import { nanoid } from "nanoid";
import { z } from "zod";
import { config } from "../config.js";

// AI question generation via Kimi/Moonshot. Uses a direct fetch to the
// `/chat/completions` endpoint instead of the Vercel AI SDK provider.
//
// Why not AI SDK? Two issues with `@ai-sdk/openai-compatible@2.0.46`:
//   1. `Output.object({schema})` sets `response_format=json_schema`, which
//      Moonshot doesn't support. Model returns plain text and AI SDK
//      throws `NoOutputGeneratedError` after the request lifetime.
//   2. The provider's `providerOptions` schema is restrictive
//      (`{user, reasoningEffort, textVerbosity, strictJsonSchema}`) — there's
//      no documented way to pass `response_format=json_object` through it,
//      and our attempts produced empty assistant content under load.
//
// A direct fetch is dependency-light, fully observable, and gives us
// `response_format: { type: "json_object" }` which Moonshot supports. We
// still retry once on empty/invalid output and Zod-validate the parsed
// response.
//
// Defaults to moonshot-v1-8k (fast, deterministic, ~15-30s for 10 questions
// with explanations) instead of kimi-k2.6 (a reasoning model — slow, can
// emit empty assistant content when reasoning tokens consume the entire
// output budget).

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
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i);
  if (fenceMatch) text = fenceMatch[1]!.trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  return text;
}

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

// Shape of OpenAI-compatible /chat/completions response (subset we use).
type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; type?: string; code?: string };
};

async function callMoonshot(args: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  abortSignal: AbortSignal;
}): Promise<{ text: string; finishReason: string }> {
  if (!config.MOONSHOT_API_KEY) throw new AiGenerationDisabledError();
  const url = `${config.MOONSHOT_BASE_URL.replace(/\/+$/, "")}/chat/completions`;
  const body = {
    model: config.MOONSHOT_MODEL,
    temperature: 0.3,
    max_tokens: args.maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userPrompt },
    ],
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.MOONSHOT_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: args.abortSignal,
  });
  if (!res.ok) {
    let errBody: ChatCompletionResponse | string;
    try {
      errBody = (await res.json()) as ChatCompletionResponse;
    } catch {
      errBody = await res.text();
    }
    const errMsg =
      typeof errBody === "object" && errBody?.error?.message
        ? errBody.error.message
        : `HTTP ${res.status}`;
    throw new Error(`Moonshot API error: ${errMsg}`);
  }
  const json = (await res.json()) as ChatCompletionResponse;
  const choice = json.choices?.[0];
  return {
    text: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason ?? "unknown",
  };
}

async function attemptGeneration(
  opts: GenerateOptions,
  attempt: number,
): Promise<GeneratedQuestion[]> {
  // Token budget. moonshot-v1-8k has 8k context, so 4k output is the safe
  // ceiling. Empirically 10 questions with explanations is ~3-3.5k tokens.
  const perQuestion = opts.withExplanations ? 350 : 150;
  const maxTokens = Math.min(4_000, 400 + opts.count * perQuestion);

  const ac = new AbortController();
  const TIMEOUT_MS = 90_000;
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  let text = "";
  let finishReason = "unknown";
  try {
    const result = await callMoonshot({
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt(opts),
      maxTokens,
      abortSignal: ac.signal,
    });
    text = result.text;
    finishReason = result.finishReason;
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error(`Moonshot call timed out after ${TIMEOUT_MS}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!text.trim()) {
    throw new Error(
      `Model returned empty response (finish_reason=${finishReason}, attempt=${attempt})`,
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
      if (e instanceof AiGenerationDisabledError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("count must be between")) throw e;
      // Otherwise loop once more.
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI generation failed");
}
