import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { Output, generateText, jsonSchema } from "ai";
import { nanoid } from "nanoid";
import { config } from "../config.js";

// AI question generation via Kimi/Moonshot. Uses Vercel AI SDK v6 with the
// OpenAI-compatible provider pointed at Moonshot's endpoint. The model is
// asked to produce a JSON object matching the schema below; AI SDK validates
// the response against the schema before returning, so a malformed
// generation surfaces as a thrown error (caught by the route).

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

const responseSchema = jsonSchema<{
  questions: Array<{
    prompt: string;
    choices: Array<{ id: string; label: string }>;
    correctChoiceId: string;
    explanation?: string;
  }>;
}>({
  type: "object",
  required: ["questions"],
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        required: ["prompt", "choices", "correctChoiceId"],
        additionalProperties: false,
        properties: {
          prompt: { type: "string", minLength: 8, maxLength: 280 },
          choices: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              required: ["id", "label"],
              additionalProperties: false,
              properties: {
                id: { type: "string", minLength: 1, maxLength: 4 },
                label: { type: "string", minLength: 1, maxLength: 200 },
              },
            },
          },
          correctChoiceId: { type: "string", minLength: 1, maxLength: 4 },
          explanation: { type: "string", maxLength: 600 },
        },
      },
    },
  },
});

function buildPrompt(opts: GenerateOptions): string {
  const lines = [
    `Generate ${opts.count} multiple-choice quiz questions about: ${opts.topic}.`,
    `Difficulty: ${opts.difficulty ?? "MEDIUM"}.`,
    `Style: ${opts.style ?? "MIXED"} (FACT = direct recall; CONCEPTUAL = understanding; MIXED = both).`,
    `Language: ${opts.language ?? "English"}.`,
  ];
  if (opts.notes) lines.push(`Additional guidance: ${opts.notes}`);
  lines.push("");
  lines.push("Rules:");
  lines.push("- Each question has EXACTLY 4 choices.");
  lines.push("- Each choice has a short id ('a', 'b', 'c', 'd') and a label.");
  lines.push("- correctChoiceId must match exactly one of the four choice ids.");
  lines.push("- Exactly one choice is correct; the others must be plausibly wrong, not nonsense.");
  lines.push("- Avoid trick questions, double negatives, or 'all of the above' / 'none of the above'.");
  lines.push("- Keep prompts under 280 characters and choice labels under 200.");
  if (opts.withExplanations) {
    lines.push(
      "- Include a brief 'explanation' (under 600 chars) explaining WHY the correct answer is right.",
    );
  } else {
    lines.push("- Do NOT include explanations; omit the field.");
  }
  return lines.join("\n");
}

// Validate that every question's correctChoiceId matches one of its choices.
// AI SDK's schema validator can't enforce cross-field constraints, so this is
// a runtime double-check.
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

export async function generateQuestions(
  opts: GenerateOptions,
): Promise<GeneratedQuestion[]> {
  if (opts.count < 1 || opts.count > 20) {
    throw new Error("count must be between 1 and 20");
  }
  const model = buildModel();
  const result = await generateText({
    model,
    output: Output.object({ schema: responseSchema }),
    system:
      "You are a quiz question generator. Always reply with a single JSON object matching the requested schema. Never include surrounding prose.",
    prompt: buildPrompt(opts),
    // Some Kimi models (e.g. k2.6) require temperature=1; we leave it at the
    // model default rather than overriding to keep this provider-agnostic.
    maxOutputTokens: 4_000,
  });
  const obj = result.output as { questions: GeneratedQuestion[] };
  // The model might return fewer or more than requested; trim to count.
  const trimmed = obj.questions.slice(0, opts.count);
  validateQuestions(trimmed);
  // Generate stable Question.id-style placeholders so admin UI can identify
  // them in its review form before they're saved. Server-side id is added
  // so the front end can edit/reorder safely.
  return trimmed.map((q) => ({
    ...q,
    // not stored — admin UI uses these as keys until save.
    // (the field is added through the spread; consumer ignores extras)
    ...({ _draftId: nanoid(8) } as object),
  }));
}
