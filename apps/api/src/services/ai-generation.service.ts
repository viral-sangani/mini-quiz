import { nanoid } from "nanoid";
import { z } from "zod";
import { config } from "../config.js";

// AI question generation via OpenRouter. Uses a direct fetch to the
// `/chat/completions` endpoint instead of the Vercel AI SDK provider.
//
// A direct fetch is dependency-light, fully observable, and gives us
// OpenRouter's OpenAI-compatible API. Prefer strict structured outputs for
// Gemini/OpenRouter, fall back to basic JSON mode if a routed provider rejects
// that parameter, then Zod-validate the parsed response.
//
// Defaults to google/gemini-3.5-flash.

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

function makeQuestionResponseJsonSchema(withExplanations: boolean): object {
  const itemProperties = {
    prompt: { type: "string", minLength: 1, maxLength: 280 },
    choices: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", enum: ["a", "b", "c", "d"] },
          label: { type: "string", minLength: 1, maxLength: 200 },
        },
        required: ["id", "label"],
      },
    },
    correctChoiceId: { type: "string", enum: ["a", "b", "c", "d"] },
    ...(withExplanations
      ? { explanation: { type: "string", maxLength: 600 } }
      : {}),
  };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          properties: itemProperties,
          required: [
            "prompt",
            "choices",
            "correctChoiceId",
            ...(withExplanations ? ["explanation"] : []),
          ],
        },
      },
    },
    required: ["questions"],
  };
}

function buildSystemPrompt(): string {
  return [
    "You are a quiz question generator.",
    "Default to accessible, easy questions unless the admin explicitly selected MEDIUM or HARD.",
    "For football campaign topics, make questions football-first and tie them to the teams, countries, players, stadiums, flags, history, or culture named in the topic or notes.",
    "Country trivia is allowed when it is clearly connected to a match-day team or country.",
    "Do not combine the words 'FIFA' and 'World Cup' in promotional-sounding text. If those terms are needed inside a factual quiz question, keep the wording neutral and avoid using them together as a campaign label.",
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
  const difficulty = opts.difficulty ?? "EASY";
  const lines = [
    `Generate ${opts.count} multiple-choice quiz questions about: ${opts.topic}.`,
    `Difficulty: ${difficulty}. Use EASY unless this line says MEDIUM or HARD.`,
    `Style: ${opts.style ?? "MIXED"} (FACT = direct recall; CONCEPTUAL = understanding; MIXED = both).`,
    `Language: ${opts.language ?? "English"}.`,
    "If this is for a football match-day campaign, prioritize easy football questions and simple country questions related to the teams playing that day.",
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
    super("OPENROUTER_API_KEY not configured");
    this.name = "AiGenerationDisabledError";
  }
}

type ChatMessageContent =
  | string
  | Array<{ type?: string; text?: string }>
  | null
  | undefined;

// Shape of OpenAI-compatible /chat/completions response (subset we use).
type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: ChatMessageContent };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; type?: string; code?: string };
};

type ResponseFormatMode = "json_schema" | "json_object";

function makeResponseFormat(
  mode: ResponseFormatMode,
  name: string,
  schemaObject: object,
): object {
  if (mode === "json_object") return { type: "json_object" };
  return {
    type: "json_schema",
    json_schema: {
      name,
      strict: true,
      schema: schemaObject,
    },
  };
}

function textFromMessageContent(content: ChatMessageContent): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part.type === "text" || !part.type ? part.text ?? "" : ""))
    .join("");
}

function isResponseFormatError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /response_format|json_schema|structured output|require_parameters|unsupported parameter/i.test(
    msg,
  );
}

async function callOpenRouter(args: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  abortSignal: AbortSignal;
  responseName: string;
  responseSchema: object;
  responseFormatMode?: ResponseFormatMode;
}): Promise<{ text: string; finishReason: string }> {
  if (!config.OPENROUTER_API_KEY) throw new AiGenerationDisabledError();
  const url = `${config.OPENROUTER_BASE_URL.replace(/\/+$/, "")}/chat/completions`;
  const responseFormatMode = args.responseFormatMode ?? "json_schema";
  const body = {
    model: config.OPENROUTER_MODEL,
    temperature: 0.3,
    max_tokens: args.maxTokens,
    response_format: makeResponseFormat(
      responseFormatMode,
      args.responseName,
      args.responseSchema,
    ),
    // Keep OpenRouter from silently routing a structured-output request to a
    // backend that ignores/rejects response_format. This matters for Gemini
    // model aliases where several upstream providers can be eligible.
    ...(responseFormatMode === "json_schema"
      ? { provider: { require_parameters: true } }
      : {}),
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userPrompt },
    ],
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://admin.miniquiz.club",
      "X-Title": "Mini Quiz Admin",
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
    throw new Error(`OpenRouter API error: ${errMsg}`);
  }
  const json = (await res.json()) as ChatCompletionResponse;
  const choice = json.choices?.[0];
  return {
    text: textFromMessageContent(choice?.message?.content),
    finishReason: choice?.finish_reason ?? "unknown",
  };
}

async function callOpenRouterWithFallback(args: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  abortSignal: AbortSignal;
  responseName: string;
  responseSchema: object;
}): Promise<{ text: string; finishReason: string }> {
  try {
    return await callOpenRouter({
      ...args,
      responseFormatMode: "json_schema",
    });
  } catch (e) {
    if (e instanceof AiGenerationDisabledError || !isResponseFormatError(e)) {
      throw e;
    }
    return callOpenRouter({
      ...args,
      responseFormatMode: "json_object",
    });
  }
}

async function attemptGeneration(
  opts: GenerateOptions,
  attempt: number,
): Promise<GeneratedQuestion[]> {
  // Empirically 10 questions with explanations is ~3-3.5k tokens.
  const perQuestion = opts.withExplanations ? 350 : 150;
  const maxTokens = Math.min(4_000, 400 + opts.count * perQuestion);

  const ac = new AbortController();
  const TIMEOUT_MS = 90_000;
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  let text = "";
  let finishReason = "unknown";
  try {
    const result = await callOpenRouterWithFallback({
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt(opts),
      maxTokens,
      abortSignal: ac.signal,
      responseName: "quiz_questions",
      responseSchema: makeQuestionResponseJsonSchema(opts.withExplanations),
    });
    text = result.text;
    finishReason = result.finishReason;
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error(`OpenRouter call timed out after ${TIMEOUT_MS}ms`);
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

// ---------------------------------------------------------------------------
// Topic suggestions
// ---------------------------------------------------------------------------
//
// `suggestTopics` returns a small list of quiz topics tailored to one of
// three "modes" (live / daily / practice). The admin UI presents these as
// clickable chips next to the topic input on the question generator. An
// optional `seed` lets the admin steer ("web3 fundamentals", "history of
// India") — empty seed produces broadly engaging picks.
//
// Design intentionally mirrors generateQuestions: same direct fetch +
// structured response + timeout + retry-once on empty/invalid.

export type SuggestMode = "live" | "daily" | "practice";

export type SuggestedTopic = {
  title: string;
  description: string;
};

export type SuggestTopicsOptions = {
  count: number;
  seed?: string;
  mode: SuggestMode;
};

const topicItemSchema = z.object({
  title: z.string().min(2).max(80),
  description: z.string().max(160),
});
const topicEnvelopeSchema = z.object({
  topics: z.array(topicItemSchema).min(1).max(20),
});

const topicResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    topics: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 2, maxLength: 80 },
          description: { type: "string", maxLength: 160 },
        },
        required: ["title", "description"],
      },
    },
  },
  required: ["topics"],
} as const;

function buildTopicSystemPrompt(): string {
  return [
    "You are a quiz topic suggester.",
    "For live campaign topics, prefer football-first, match-day topics that can also include country trivia for the teams playing.",
    "Reply with ONLY a single valid JSON object — no markdown fences, no prose, no code blocks.",
    "The JSON object MUST match this exact shape:",
    `{"topics":[{"title":"...","description":"..."}, ...]}`,
    "Constraints:",
    "- Each title is a punchy quiz-topic name (2-6 words).",
    "- Each description is one short sentence (under 160 chars) explaining what the topic covers.",
    "- Topics must be DISTINCT from each other; avoid near-duplicates.",
    "- Keep titles SFW, broadly recognizable, and unambiguous.",
    "- Avoid titles that combine 'FIFA' and 'World Cup' as promotional wording.",
  ].join("\n");
}

function buildTopicUserPrompt(opts: SuggestTopicsOptions): string {
  const flavour: Record<SuggestMode, string> = {
    live:
      "engaging, easy football-first multiplayer trivia for a live event with prizes — tied to match-day teams and countries",
    daily:
      "broadly engaging general-knowledge trivia for a wide daily-quiz audience — accessible, varied, fun",
    practice:
      "educational, learning-oriented topics suitable for solo practice — concrete subjects players can study and improve at",
  };
  const lines = [
    `Suggest ${opts.count} quiz topics for ${flavour[opts.mode]}.`,
  ];
  if (opts.seed && opts.seed.trim()) {
    lines.push(`Theme / seed: ${opts.seed.trim()}.`);
  } else {
    lines.push("No theme — pick widely interesting topics across genres.");
  }
  lines.push("");
  lines.push("Reply with the JSON object only.");
  return lines.join("\n");
}

async function attemptTopicSuggestion(
  opts: SuggestTopicsOptions,
): Promise<SuggestedTopic[]> {
  const maxTokens = Math.min(2_000, 200 + opts.count * 80);
  const ac = new AbortController();
  const TIMEOUT_MS = 60_000;
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  let text = "";
  try {
    const res = await callOpenRouterWithFallback({
      systemPrompt: buildTopicSystemPrompt(),
      userPrompt: buildTopicUserPrompt(opts),
      maxTokens,
      abortSignal: ac.signal,
      responseName: "quiz_topics",
      responseSchema: topicResponseJsonSchema,
    });
    text = res.text;
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error(`OpenRouter call timed out after ${TIMEOUT_MS}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!text.trim()) throw new Error("Model returned empty response");
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonBlock(text));
  } catch (e) {
    throw new Error(
      `Topic suggestion was not valid JSON: ${
        e instanceof Error ? e.message : "unknown"
      }`,
    );
  }
  const safe = topicEnvelopeSchema.safeParse(parsed);
  if (!safe.success) {
    throw new Error(`Topic response failed schema check: ${safe.error.message}`);
  }
  return safe.data.topics.slice(0, opts.count);
}

export async function suggestTopics(
  opts: SuggestTopicsOptions,
): Promise<SuggestedTopic[]> {
  if (opts.count < 1 || opts.count > 12) {
    throw new Error("count must be between 1 and 12");
  }
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await attemptTopicSuggestion(opts);
    } catch (e) {
      lastErr = e;
      if (e instanceof AiGenerationDisabledError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("count must be between")) throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI suggestion failed");
}
