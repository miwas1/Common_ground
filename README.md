# Common Ground

**An AI creative strategist and casting agent for brands and creators.**

Common Ground discovers the cultural worlds a brand's customers care about, finds creators who can work authentically in those worlds, and turns each partnership into a complete campaign proposal worth testing.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). 🚧 Work in progress. See [PLAN.md](PLAN.md) for the full design.

## Why Qloo is load-bearing

A good creator match doesn't automatically produce a good campaign. Common Ground uses Qloo's taste graph to find the **shared cultural context** that gives a collaboration a reason to exist. It then keeps every claim traceable to the Qloo finding behind it.

| Qloo capability | What Common Ground uses it for |
|---|---|
| `/search`, `/v2/tags`, `/v2/audiences` | Resolve brief references (brands, interests, segments), with explicit disambiguation |
| `/v2/insights` · `urn:tag` taste analysis | Lifestyle, aesthetic and emotional concepts that become **cultural directions** |
| `/v2/insights` · cross-domain entities + explainability | Each direction's world: music, shows, podcasts, brands and places, plus which inputs drove them |
| `/v2/insights` · `filter.results.entities/tags` | Score a creator's public references against each direction |
| `/v2/insights` · `urn:demographics` | Audience reality check: the stated audience vs aggregate affinity |
| `/v2/insights` · `urn:heatmap` | Where a direction is strongest within a market |
| `/v2/analysis/compare`, `/v2/trending` | How directions differ, and momentum (when the data isn't flat) |

Qloo results describe **aggregate affinities**, not individuals. No personal data is sent to Qloo. A creator's own tastes are never presented as evidence about their followers.

## What works today

- **Brief → research → proposals, end to end**, on live Qloo and Claude. A durable workflow runs nine stages: parse the brief, resolve references to Qloo (pausing to ask *"Which did you mean?"* when a name is ambiguous), audience read, cross-domain exploration, direction synthesis, three checks per direction, casting, proposal writing and budget packages.
- **Claims you can trace.** Every factual statement about Qloo data is written by code from a stored result. Each one names its rank, its query and its affinity, and the exact request is one click away. The model writes only interpretations, which are labelled as such, must cite findings, and are rejected if they contain numbers, superlatives, purchase or performance predictions, or claims about individuals.
- **Three separate checks on every direction:** coherence, input sensitivity (leave-one-out, rank-biased overlap plus concept retention, naming any unconfirmed assumption it depends on) and campaign relevance (scored against a held-out audience-only profile, reported as "not measured" when Qloo's scores don't differentiate).
- **Casting without a "match %".** Hard constraints come first, then portfolio capability (each judgment cites portfolio pieces), then cultural fit by rank *within each Qloo query*, using each creator's best reference. A missing result means "not measured", and city is never treated as cultural fit.
- **Real identity:** demo brand and creator accounts, organizations, and permission checks on every action.

## Run locally

Requires Node.js ≥ 22 and pnpm.

```bash
pnpm install
cp .env.example .env.local   # add QLOO_API_KEY and ANTHROPIC_API_KEY
pnpm dev
```

Locally you don't need a database server. With `DATABASE_URL` unset, the app runs embedded [PGlite](https://pglite.dev) (Postgres compiled to WASM) in `./.pglite` and applies migrations automatically. In production, set `DATABASE_URL` to a Neon connection string and run `pnpm db:migrate`. Both are Postgres, so the schema and queries are identical. `GET /api/health` reports which driver is active.

| Script | Purpose |
|---|---|
| `pnpm test` | Unit tests (synthetic fixtures; no network) |
| `pnpm test:live` | Contract tests against the live Qloo hackathon API |
| `pnpm typecheck` · `pnpm lint` · `pnpm build` | Static checks and production build |
| `pnpm db:generate` · `pnpm db:migrate` | Drizzle migrations (PGlite locally, Neon when `DATABASE_URL` is set) |
| `pnpm db:studio` · `pnpm db:reset` | Browse the database · delete the local PGlite data |
| `pnpm db:seed` | Create the demo brand and creator accounts and the fictional 30-creator roster, resolving its references through Qloo (idempotent; needs `DEMO_PASSWORD` and `QLOO_API_KEY`; stop `pnpm dev` first when using PGlite) |
| `pnpm auth:generate` | Regenerate Better Auth tables after changing auth plugins |

## Project layout

```
src/lib/qloo/     Qloo client: transport, trimming, typed API, private cache, provenance
src/db/           Drizzle schema and connection
src/app/          Next.js App Router UI
drizzle/          SQL migrations
```

## Data handling

- The Qloo key stays server-side. It's never sent to the browser or committed.
- Qloo responses are cached privately in Postgres and are never stored in this repository.
- Every Qloo call is logged with its parameters and status, which feeds the in-product evidence trail.

## License

[MIT](LICENSE)
