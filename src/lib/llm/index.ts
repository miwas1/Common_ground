// Structured calls to Claude. Every pipeline LLM step asks for JSON matching a Zod schema,
// then runs domain validation (claim rules); failures are sent back once more with the problems listed.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { formatIssues, type Issue } from "@/lib/claims/validate";

export type Effort = "low" | "medium" | "high" | "xhigh";

/** The one model the app calls. Each step sets its own effort: low for extraction, high for writing. */
export const MODEL = "claude-haiku-5-5";

export type ObjectRequest<S extends z.ZodType> = {
  /** Short label for logs and errors. */
  name: string;
  system: string;
  prompt: string;
  schema: S;
  effort?: Effort;
  maxTokens?: number;
  /** Appended after the cached prompt, e.g. the problems from a rejected attempt; never cached. */
  followUp?: string;
};

export type ResearchRequest = {
  name: string;
  system: string;
  prompt: string;
  /** Upper bound on web searches for this call. */
  maxSearches?: number;
};

export type ResearchResult = { text: string; sources: { title: string; url: string }[] };

export interface Llm {
  object<S extends z.ZodType>(req: ObjectRequest<S>): Promise<z.infer<S>>;
  /**
   * Free-text research with live web search. Optional: fakes and offline runs leave it out,
   * and callers carry on without background research.
   */
  research?(req: ResearchRequest): Promise<ResearchResult>;
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

// Prompt caching: the system prompt (with the output schema rendered ahead of it) and the stage prompt
// are each a cache breakpoint. Validation retries resend the same prefix with a follow-up block after it,
// and stages that call once per direction share the system prefix, so both read from the cache.
const CACHE = { type: "ephemeral" } as const;

export function anthropicLlm(opts: { apiKey?: string } = {}): Llm {
  const client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
  const model = MODEL;

  return {
    async object<S extends z.ZodType>({ name, system, prompt, followUp, schema, effort = "medium", maxTokens = 16000 }: ObjectRequest<S>) {
      // No refusal fallback: it would re-run the request on another model.
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

    // Web search is a server tool: Anthropic runs the searches inside the request. Long searches can
    // end a turn with pause_turn; sending the partial answer back lets the model carry on.
    research:
      process.env.WEB_RESEARCH === "off"
        ? undefined
        : async ({ name, system, prompt, maxSearches = 5 }: ResearchRequest): Promise<ResearchResult> => {
            const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
            const text: string[] = [];
            const sources = new Map<string, string>();
            for (let turn = 0; turn < 4; turn++) {
              const response = await client.messages.create({
                model,
                max_tokens: 8000,
                thinking: { type: "adaptive" },
                output_config: { effort: "medium" },
                system: [{ type: "text", text: system, cache_control: CACHE }],
                tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }],
                messages,
              });
              const u = response.usage;
              console.info(`llm ${name} model=${model} in=${u.input_tokens} out=${u.output_tokens} searches=${u.server_tool_use?.web_search_requests ?? 0}`);
              if (response.stop_reason === "refusal") throw new LlmRefusalError(name, response.stop_details?.category ?? null);
              for (const block of response.content) {
                if (block.type === "text") text.push(block.text);
                // An error result's content is an object, a success is a list of results.
                if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
                  for (const r of block.content) if (!sources.has(r.url)) sources.set(r.url, r.title);
                }
              }
              if (response.stop_reason !== "pause_turn") break;
              messages.push({ role: "assistant", content: response.content });
            }
            return { text: text.join("").trim(), sources: [...sources].map(([url, title]) => ({ url, title })).slice(0, 8) };
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
