// Structured calls to Claude. Every pipeline LLM step asks for JSON matching a Zod schema,
// then runs domain validation (claim rules); failures are sent back once more with the problems listed.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { formatIssues, type Issue } from "@/lib/claims/validate";

export type Effort = "low" | "medium" | "high" | "xhigh";

export type ObjectRequest<S extends z.ZodType> = {
  /** Short label for logs and errors. */
  name: string;
  system: string;
  prompt: string;
  schema: S;
  effort?: Effort;
  maxTokens?: number;
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

export const DEFAULT_MODEL = "claude-opus-5-5";

export function anthropicLlm(opts: { apiKey?: string; model?: string } = {}): Llm {
  const client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
  const model = opts.model ?? process.env.LLM_MODEL ?? DEFAULT_MODEL;

  return {
    async object<S extends z.ZodType>({ name, system, prompt, schema, effort = "medium", maxTokens = 16000 }: ObjectRequest<S>) {
      const response = await client.beta.messages.parse({
        model,
        max_tokens: maxTokens,
        // Server-side fallback re-runs a declined request on Anthropic's recommended model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort, format: betaZodOutputFormat(schema) },
        system,
        messages: [{ role: "user", content: prompt }],
      });
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
  let prompt = req.prompt;
  let issues: Issue[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const value = await llm.object({ ...req, prompt });
    issues = validate(value);
    if (issues.length === 0) return value;
    prompt = `${req.prompt}\n\n<previous_answer>\n${JSON.stringify(value)}\n</previous_answer>\n<previous_attempt_problems>\nThat answer was rejected for these reasons. Return the complete answer again, changing only what is needed to fix every problem listed, and introduce no new violations of the rules:\n${formatIssues(issues)}\n</previous_attempt_problems>`;
  }
  throw new LlmValidationError(req.name, issues);
}
