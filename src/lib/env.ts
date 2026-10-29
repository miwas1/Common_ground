import { z } from "zod";

// Server-side configuration. Validated lazily so a page that needs no secrets can still render.
const schema = z.object({
  QLOO_API_KEY: z.string().min(10, "QLOO_API_KEY is missing"),
  QLOO_BASE_URL: z.url().default("https://hackathon.api.qloo.com"),
  DATABASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid server environment — ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
