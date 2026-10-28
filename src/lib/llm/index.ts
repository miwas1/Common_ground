// Structured calls to Claude. Every pipeline LLM step asks for JSON matching a Zod schema,
// then runs domain validation (claim rules); failures are sent back once more with the problems listed.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { formatIssues, type Issue } from "@/lib/claims/validate";

export type Effort = "low" | "medium" | "high" | "xhigh";

/** The only models the app may call. Anything else is a configuration error, not a silent fallback. */
export const ALLOWED_MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];

/** "standard" for judgment and writing (Sonnet 5.5); "fast" for light extraction (Haiku 5.5). */
export type Tier = "standard" | "fast";

export type ObjectRequest<S extends z.ZodType> = {
  /** Short label for logs and errors. */
  name: string;
  system: string;
  prompt: string;
  schema: S;
  effort?: Effort;
  maxTokens?: number;
  tier?: Tier;
  /** Appended after the cached prompt, e.g. the problems from a rejected attempt; never cached. */
  followUp?: string;
};

export interface Llm {
  object<S extends z.ZodType>(req: ObjectRequest<S>): Promise<z.infer<S>>;
}

export class LlmRefusalError extends Error {
  constructor(name: string, category: string | null) {
    super(`The model declined the ${name} step${category ? ` (${category})` : ""}`);
    this.name = "LlmRefusalError";
  }
}

export class LlmValidationError extends Error {
  constructor(
    name: string,
    readonly issues: Issue[],
  ) {
    super(`${name}: model output failed validation after retries\n${formatIssues(issues)}`);
    this.name = "LlmValidationError";
  }
}

export const DEFAULT_MODELS: Record<Tier, AllowedModel> = { standard: "claude-sonnet-5-5", fast: "claude-haiku-5-5" };

export function resolveModel(tier: Tier, configured: string | undefined): AllowedModel {
  const model = configured || DEFAULT_MODELS[tier];
  if (!(ALLOWED_MODELS as readonly string[]).includes(model)) {
    throw new Error(`Model "${model}" is not allowed; use one of ${ALLOWED_MODELS.join(", ")}`);
  }
  return model as AllowedModel;
}

// Prompt caching: the system prompt (with the output schema rendered ahead of it) and the stage prompt
// are each a cache breakpoint. Validation retries resend the same prefix with a follow-up block after it,
// and stages that call once per direction share the system prefix, so both read from the cache.
const CACHE = { type: "ephemeral" } as const;

export function anthropicLlm(opts: { apiKey?: string; models?: Partial<Record<Tier, string>> } = {}): Llm {
  const client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
  const models: Record<Tier, AllowedModel> = {
    standard: resolveModel("standard", opts.models?.standard ?? process.env.LLM_MODEL),
    fast: resolveModel("fast", opts.models?.fast ?? process.env.LLM_FAST_MODEL),
  };

  return {
    async object<S extends z.ZodType>({ name, system, prompt, followUp, schema, effort = "medium", maxTokens = 16000, tier = "standard" }: ObjectRequest<S>) {
      const model = models[tier];
      // No server-side refusal fallback: it would re-run the request on a model outside ALLOWED_MODELS.
      // A refusal stops the step with LlmRefusalError instead.
      const response = await client.messages.parse({
        model,
        max_tokens: maxTokens,
        thinking: { type: "adaptive" },
        output_config: { effort, format: zodOutputFormat(schema) },
        system: [{ type: "text", text: system, cache_control: CACHE }],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt, cache_control: CACHE },
              ...(followUp ? [{ type: "text" as const, text: followUp }] : []),
            ],
          },
        ],
      });
      const u = response.usage;
      console.info(`llm ${name} model=${model} in=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} out=${u.output_tokens}`);
      if (response.stop_reason === "refusal") {
        throw new LlmRefusalError(name, response.stop_details?.category ?? null);
      }
      if (response.stop_reason === "max_tokens") throw new Error(`${name}: output hit max_tokens`);
      if (response.parsed_output == null) throw new Error(`${name}: no structured output returned`);
      return response.parsed_output as z.infer<S>;
    },
  };
}

/**
 * Ask for an object and validate it with domain rules; on problems, ask again with the
 * problems listed (bounded). Throws LlmValidationError if it still fails.
 */
export async function objectWithValidation<S extends z.ZodType>(
  llm: Llm,
  req: ObjectRequest<S>,
  validate: (value: z.infer<S>) => Issue[],
  maxAttempts = 4,
): Promise<z.infer<S>> {
  let followUp: string | undefined;
  let issues: Issue[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const value = await llm.object({ ...req, followUp });
    issues = validate(value);
    if (issues.length === 0) return value;
    followUp = `<previous_answer>\n${JSON.stringify(value)}\n</previous_answer>\n<previous_attempt_problems>\nThat answer was rejected for these reasons. Return the complete answer again, changing only what is needed to fix every problem listed, and introduce no new violations of the rules:\n${formatIssues(issues)}\n</previous_attempt_problems>`;
  }
  throw new LlmValidationError(req.name, issues);
}
