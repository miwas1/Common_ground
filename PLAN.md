# Common Ground — Implementation Plan

> An AI creative strategist and casting agent. It finds the cultural worlds a brand's customers live in, matches creators who can work authentically in those worlds, and turns each match into a campaign proposal worth testing.

This plan builds on [RESEARCH.md](RESEARCH.md) (hackathon rules and the Qloo API surface). Every Qloo capability marked ✅ below was **verified live against `hackathon.api.qloo.com` on 2026-10-28**, using Blue Bottle Coffee as the test brand, and is now covered by `pnpm test:live`. Revision 2 includes the changes from the partner review (§12).

---

## 0. Why this wins (the thesis we build to)

| Judging criterion | How Common Ground scores |
|---|---|
| **Technological implementation** | Uses 8 distinct Qloo capabilities in one durable agent pipeline. Every factual claim is **bound to a specific stored Qloo result: field, value and query**. Scores are never written by the model. Inputs are tested for sensitivity, and every refinement creates an immutable revision. |
| **Design** | One complete journey: brief → strategy → proposals → challenge → agree → creator draft → review. It's real, works end to end, and runs between two real accounts (brand and creator). |
| **Potential impact** | A specific buyer: brand and agency teams that already commission creator content. A specific pain: picking partners and writing differentiated briefs. A specific output: a proposal someone can pay for. |
| **Quality of idea** | Qloo isn't used to "recommend creators". It finds the *shared cultural context* that gives a collaboration a reason to exist. The concept and the creator are a single decision. |
| **Sponsor's test**: "would it work without Qloo?" | An **Evaluate** view runs a fair, blind comparison: the same brief, roster, portfolio metadata, constraints, model and output schema, with only the Qloo evidence removed. It shows where Qloo helps, adds little, or distracts. |
| **Live TV final** | Visual moments: cultural direction boards, the trace from finding to interpretation to portfolio to concept, "remove an assumption and compare revisions", and a heatmap of where a direction is strongest. |

Past winners (GeoTaste, Alloy, Resonance AI) were decision tools for a specific professional buyer. Common Ground fits that pattern and is more visual.

---

## 1. What live probing taught us (design constraints)

| Finding | Consequence for the build |
|---|---|
| ✅ `/search` is fuzzy. "Blue Bottle Coffee" also returned the Toronto Blue Jays and Blue Origin, and "Stumptown" returned both places and a brand. | **A disambiguation step is required.** The agent asks *"Which did you mean?"* using names and context, never raw IDs. |
| ✅ `urn:tag` taste analysis with `filter.tag.types=urn:tag:lifestyle:qloo` gave Blue Bottle → *Slow Living, Simple Living, Design Appreciation, Minimalist, Craftsmanship, Community Connection, Cycling, Intellectual Pursuits*… | **This is the raw material for "cultural directions."** Brand tag types available: `lifestyle, aesthetic_property, emotional_tone, hobby, customer_identity, customer_segment, cultural_relevance, culture, genre:*`, and more. |
| ✅ `aesthetic_property` → *Minimalist Design, Neutral Color Palette, Clean Lines, Rustic, Vintage Inspired* | Feeds each direction's **art direction and reference board**, with evidence behind it. |
| ✅ Cross-domain recs work: artists, podcasts, TV, destinations, brands. | Each direction gets a cross-category "cultural world". |
| ✅ `feature.explainability=true` returns per-result attribution. With one seed it's always 1.0. With 3 seeds it splits about 0.34 / 0.33 / 0.33. | Always send **2–5 seed entities**, and measure **input sensitivity** with leave-one-out reruns. |
| ✅ `filter.results.entities` / `filter.results.tags` score a supplied list against a profile. | Basis for creator cultural fit, under the comparability rules in §4.3. |
| ✅ `urn:demographics` gave Blue Bottle a skew to ages 30–44 and male +0.16. It also works for tags. | Used in an **audience comparison** (brand-associated vs intended). Divergence isn't an error (§4.2). |
| ✅ `urn:heatmap` + `filter.location.query=London` returns 859 geohash cells. ❌ `output.heatmap.boundary=urn:entity:locality` returned a 23 MB response with nothing usable. | Use the **geohash grid** only, for *where a direction is strongest within a market*. It's never a creator signal. |
| ❌ `urn:tag` with `signal.location.query` returns **empty** (New York, London and Berlin all failed). Music recs barely change between markets. | Market adaptation uses `filter.location` places plus heatmaps, with **coverage warnings** where evidence is thin. |
| ✅ `/v2/trending` responds, but Blue Bottle came back flat (all velocities 0). | Momentum is a **secondary badge**, shown only when the data isn't flat. |
| ✅ `/v2/analysis/compare` returns tag differences between two entity groups. | Shows how directions differ. |
| ✅ `/v2/audiences?filter.query=coffee` → `urn:audience:leisure:coffee`, which works as `signal.demographics.audiences`. | Brief audience descriptors map onto Qloo audience segments. |
| **Affinity scores are normalized per query** (Qloo docs: *interpreting-affinity-scores*). | **Scores from different requests are never averaged or compared.** Comparisons happen within one query, by rank (§4.3). |
| Responses are heavy (10–250 KB) and calls take 1–5 seconds. | The client trims responses, caches them privately in Postgres and runs calls in parallel. *(Built.)* |

---

## 2. Scope, by impact on winning

Every item is **built for real, end to end**. The tiers set what we build first and what gets cut if something has to go. Nothing is faked.

### P0: foundations and the decision journey
1. **Identity**: users, organizations (brand orgs, plus a personal org for each creator), memberships, invitations and permission checks on campaign actions and files. **One-click demo accounts** (see §3.3) keep the judge experience frictionless.
2. **Guided brief** (4 steps, persistent summary, a source label on every audience input: *From customer research / Provided by your team / Suggested assumption*). Also accepts a pasted or uploaded brief.
3. **Durable research run** with visible stages. It keeps going after the browser closes, retries failed steps, can be cancelled, and runs at most once per revision (§3.2).
4. **Disambiguation** of resolved references.
5. **Strategy tab**: 3–4 cultural directions, each with title, audience context, reference board, product role, **findings vs interpretations**, assumptions, the three checks (§4.2) and a creator preview.
6. **Proposals tab**: creator and concept shown together. *Quote needed* and availability states.
7. **Proposal page** + **evidence drawer**, which keeps four kinds of support separate: Qloo findings, the agent's interpretation, portfolio capability, and commercial feasibility.
8. **Challenge / Refine**: every change creates a **new campaign revision** that is fully re-derived. The **revision compare** view shows what changed.
9. **Budget planner**: a deterministic optimizer over real quotes.
10. **Showcase campaign** (precomputed, read-only, with *Duplicate to my workspace*) plus **"Run it on your brand"**.

### P1: the two-sided loop
11. **Creator workspace**: profile builder (proposition, portfolio, **confirmed** cultural references and themes), opportunities, and pitch / rewrite-the-hook. Each change creates a new **proposal version**.
12. **Offer → accept → production**: acceptance is tied to an exact proposal version. Draft upload, version states, timestamped comments, and **approval of an exact asset version**, with every action authorized against org membership.
13. **Evaluate view**: the blind with-Qloo / without-Qloo comparison (§4.6).
14. **Compare up to 3 proposals**, and a **market adaptation** view.

### P2: closing the loop
15. **Results** by direction and hypothesis, **Learnings**, and the **Overview** dashboard.

### Out of scope for the submission
Billing, real social-platform integrations or follower data, email delivery (invitations show a copyable link), and notifications.

---

## 3. Architecture

```
Browser (Next.js 16 App Router, RSC + client islands)
   │  Server Actions / Route Handlers · progress via polling the run's stage rows
   ▼
Auth (Better Auth: users · organizations · memberships · invitations · multi-session)
   │  every action → authorize(user, org, campaign, action)
   ▼
Durable runs (Workflow SDK: "use workflow" per run, "use step" per stage)
   │  retries · cancellation · single active run per revision · recovery after crashes
   │
   ├── Agent layer (Claude via Anthropic SDK)
   │      selects findings, writes interpretations and concepts, judges portfolio capability
   │      output → Zod schema → claim-binding validator (§4.1) → persisted
   │
   ├── Qloo client (built): typed ops · trimming · private cache · provenance per call
   │
   ├── Deterministic services
   │      finding templates · rank-within-query scoring · input sensitivity (RBO) · budget optimizer
   │
   └── Storage: Postgres via Drizzle (PGlite locally, Neon in prod) · Vercel Blob for files
```

### 3.1 Stack
| Layer | Choice | Status |
|---|---|---|
| App | **Next.js 16.4 (App Router, Cache Components) + TypeScript** | ✅ scaffolded |
| UI | **Tailwind v4 + shadcn/ui (radix-nova) + Inter**, design-brief tokens | ✅ tokens in place |
| DB | **Postgres + Drizzle**: **PGlite** locally (auto-migrated), **Neon** in production | ✅ built and tested |
| Qloo | `src/lib/qloo`: transport, trimming, typed API, DB cache, provenance | ✅ built, 6 live contract tests |
| Durable runs | **Workflow SDK** (`workflow@5.2.3`, `withWorkflow` in `next.config.ts`, `src/instrumentation.ts`). Local backend in dev, Vercel-managed in production. | ✅ spike passed (§13) |
| Auth | **Better Auth 1.7.14** + `@better-auth/drizzle-adapter` + `organization` + `multi-session` + `nextCookies` | ✅ spike passed (§13) |
| LLM | **Claude Sonnet 5.5** for tool use and judgments, **Opus 5.5** for direction synthesis and proposal writing | Key present |
| Map | **MapLibre GL + deck.gl HeatmapLayer** | — |
| Files | **Vercel Blob** (private access, checked against org membership) | — |
| Host | **Vercel** | Waiting on repo and accounts |

### 3.2 Durable execution
- One **workflow run per campaign revision and mode**. Each pipeline stage is a **step**: retried automatically on transient failure (Qloo 429/5xx, LLM errors), idempotent (writes are keyed by `run_id + stage`, so a retried step overwrites its own rows), and recorded in `run_stage` for the UI.
- **Single active run**: a partial unique index on `run(revision_id, mode) WHERE status IN ('pending','running','needs_input')`.
- **Cancellation**: the user sets `run.cancel_requested`, and each step checks it before doing work.
- **Disambiguation pauses the run** (`needs_input`). The user's choice resumes it.
- The browser only reads state, so closing the tab changes nothing.

### 3.3 Identity without friction
- Real accounts and organizations. Brands work inside a brand org. Each creator owns a personal creator org.
- **One-click demo access** on the landing page: *Enter as brand (Juniper Coffee demo)* and *Enter as creator (Maya L. demo)*. These sign in to real, seeded demo users. With the multi-session plugin, a judge can hold both sessions and **switch accounts** (not roles), so offers, acceptances and approvals really cross between two parties.
- Demo orgs reset on a schedule. The showcase campaign is read-only for everyone.

---

## 4. The agent pipeline (the technical core)

| # | Stage | What happens | Qloo calls |
|---|---|---|---|
| 1 | **Parse brief** *(LLM)* | Free text → structured brief, with a source label on each audience statement. Missing fields are listed in plain language. | — |
| 2 | **Resolve** | The LLM proposes candidate public references, and code resolves them. Ambiguous ones pause the run for disambiguation. | `/search`, `/v2/tags`, `/v2/audiences` |
| 3 | **Audience read** | Taste analysis of the brand and seeds across tag types. **Audience comparison**: brand-associated demographics alongside the intended audience (§4.2). | `urn:tag` × tag types; `urn:demographics` |
| 4 | **Explore** | Cross-domain worlds with explainability, plus places filtered to each market. | `/v2/insights` × entity types |
| 5 | **Synthesize directions** *(LLM)* | Groups the **findings** into 3–4 directions. It selects findings by ID and writes **interpretations** that must reference them (§4.1). | — |
| 6 | **Check directions** | Coherence, input sensitivity and campaign relevance, run as three separate checks (§4.2). Pairwise distinctness via compare. | `/v2/insights`, `filter.results.tags`, `/v2/analysis/compare` |
| 7 | **Cast** | Hard constraints, then capability, then cultural fit by rank within each query (§4.3). City is used **only** for logistics and local execution. | `filter.results.entities` / `filter.results.tags` |
| 8 | **Write proposals** *(LLM)* | Concept, hook, storyboard, product integration, deliverables, terms, uncertainty and hypothesis. Same claim rules. | — |
| 9 | **Plan budget** | Deterministic packages from real quotes. Affinity is never turned into spend. | — |

### 4.1 Claims and evidence (credibility rules)
An ID whitelist only proves that the cited evidence exists. These rules also make sure a claim says only what the evidence supports.

- **Evidence row = one returned item, stored with its context**: kind, Qloo reference, label, the **values returned** (affinity, rank in the result list, attribution, skew), and `qloo_call_id`, which links to the exact parameters (signals, filters, type, location).
- **Claim row** (`claim`): `kind ∈ {finding, interpretation, portfolio, commercial}`, `text`, and **bindings** `[{evidence_id | portfolio_item_id | quote_ref, field}]`.
  - **Findings** are written by **code from templates**, never by the model. Example: *"Ranked #3 of 10 podcasts for the profile {Juniper Coffee, Khruangbin} (affinity 0.91, this query only)."* The model chooses *which* findings matter. It doesn't write their text or numbers.
  - **Interpretations** are written by the model, must bind to ≥ 1 finding, and are **always labelled "Interpretation"** in the UI. Example: *"A conversational cooking format could be worth testing."*
  - **Portfolio claims** bind to a portfolio item. **Commercial claims** bind to a quote.
- **Validator** (Zod plus semantic checks): every binding must point to an existing row in **this run**, and the bound field must exist. Interpretations may not contain numbers, percentages or superlatives about affinity ("most", "strongest") unless those come from a bound finding. Interpretations about purchase intent, conversion or individuals are rejected. A failed validation sends the specific errors back to the model, with bounded retries.

### 4.2 Three separate checks on a direction
| Check | Question | Method | Shown as |
|---|---|---|---|
| **Coherence** | Do the direction's references relate to each other? | Score the anchors against each other's profile with `filter.results.*`, by rank within the query. | "References are related / loosely related" |
| **Input sensitivity** | Does the direction change when an input is removed? | Leave-one-out per brief input, measured by rank-biased overlap of the top tags and entities. | **"Stable when *Khruangbin* is removed (overlap 0.82)"** or **"Changes when *home cooking* is removed"**, always listing the inputs tested. Never "Holds up". |
| **Campaign relevance** | Does it address *this* audience, product and objective? | **Qloo part:** score the direction's anchor tags against a profile built **only from the intended-audience inputs** (audience segments and age/gender from the brief), which were not used to generate the direction. **Judgment part:** the LLM's assessment against the objective, labelled as interpretation. | A finding plus a labelled interpretation, shown separately |

**Audience comparison** (stage 3) shows the brand-associated demographic skew next to the intended audience, without any warning styling. If they differ, it asks: *"Is this campaign reaching a new segment?"* The answer is recorded as a brief input with a source label.

### 4.3 Cultural fit: what it means and how it's scored
- **Inputs**: only a creator's **confirmed** public references and **confirmed** portfolio themes, which are mapped to tags at onboarding. These describe the creator's *work and identity*. They are never presented as evidence about their followers.
- **One query per (direction, entity type)**: the direction's signal profile scores the **union of all roster references of that type** (`filter.results.entities`, paged at 50). Ranks are comparable **only within that query**. Themes are scored the same way, in one `filter.results.tags` query per direction.
- **Per creator, per type**: the *best* rank percentile among their references, plus coverage (*"3 of 4 references measured"*). Using the best, not a sum or average, means a creator gains **nothing from listing more references**. At most 6 references are considered per creator.
- **Missing results mean "not measured"**, never zero, until coverage is understood.
- **No cross-type or cross-query aggregation.** The UI shows bands (*top quarter of this query / middle / lower / not measured*) for each type.
- **Shortlist rule** (deterministic and shown to the user): (1) hard constraints: language, market, availability, quote within budget, campaign mode; (2) **capability** from the portfolio, LLM-judged as *strong / partial / none* with each judgment bound to portfolio items; (3) cultural-fit band. Ties are broken by quote.
- **City** is used only for production logistics and for local execution ideas, such as places in the creator's city from `filter.location`.

### 4.4 Revisions and refinement
- **`campaign_revision`** is immutable: a snapshot of the brief, inputs (with source and confirmation), resolved references, budget and markets, plus `parent_revision_id` and a change note.
- **Every refinement creates a new revision and a full new run** from stage 1's output onward. Nothing derived is carried over, so the audience read, findings, checks, casting, proposals and packages are all recomputed. Qloo calls hit the cache, so reruns are cheap.
- Refinements: `remove_input`, `edit_input`, `set_budget`, `add_market`, `swap_creator` (a proposal-level revision), `explain_choice(a, b)` (read-only), `most_informative_experiment()` (read-only).
- **Revision compare**: directions matched by shared anchor findings, showing what was added or removed, how creators moved, and the change in package cost.
- **Proposal versions** are immutable. Offers, acceptances and asset approvals reference exact version IDs.

### 4.5 Guardrails
- Only public entity names are sent to Qloo. Creator names and any PII are never sent.
- A creator's own cultural preferences are never presented as evidence about their followers.
- Findings are labelled *aggregate affinity, this query*, and interpretations are labelled as such.
- Market evidence gaps are shown as coverage warnings.

### 4.6 Evaluate: the fair without-Qloo comparison
- **Identical inputs**: brief, roster, portfolio metadata, commercial constraints, model, token budget and output schema. **Only the Qloo-derived findings differ**. The baseline's directions and casting rely on the brief, portfolio metadata and the model's general knowledge, and its claims bind to brief or portfolio items.
- **Blind by default**: shown as *Version A / Version B*, with the source revealed on request. There's no framing about "generic vs specific", and both outputs use the same proposal layout.
- It lives in an **Evaluate** view (linked from the campaign menu and `/about/qloo`), not in the main customer flow.
- We report what we observe, whether Qloo helps, adds little or distracts, using real runs from the ablation script (§9).

---

## 5. Data model (Drizzle / Postgres: PGlite locally, Neon in production)

```
-- identity (generated by Better Auth CLI, then extended)
user · session · account · verification · organization · member · invitation
org_profile(organization_id PK, kind: brand|creator)

-- campaigns and revisions
campaign(id, organization_id, name, status, is_showcase, current_revision_id, created_at)
campaign_revision(id, campaign_id, number, parent_revision_id?, change_note, brief, markets[], languages[],
                  campaign_type, budget_cents, currency, created_by, created_at)          -- immutable
brief_input(id, revision_id, text, source: research|team|assumption, confirmed)          -- immutable per revision
resolved_reference(id, revision_id, brief_input_id?, label, qloo_kind, qloo_id, qloo_type, candidates, status)

-- runs
run(id, revision_id, mode: qloo|baseline, status, cancel_requested, workflow_run_id, created_at)
    unique (revision_id, mode) where status in (pending, running, needs_input)
run_stage(id, run_id, position, name, status, output, error, started_at, finished_at)

-- Qloo provenance and private cache (built)
qloo_call(id, campaign_id?, run_id?, endpoint, params, status, http_status, latency_ms, cached, cache_key, error)
qloo_cache(cache_key PK, response)

-- evidence and claims
evidence(id, run_id, kind, qloo_ref, label, values jsonb, rank, result_count, qloo_call_id)
claim(id, run_id, owner_type: direction|proposal_version|creator_fit, owner_id,
      kind: finding|interpretation|portfolio|commercial, text, created_by: template|model)
claim_binding(claim_id, evidence_id? | portfolio_item_id? | quote_id?, field)

-- directions and checks
direction(id, run_id, title, audience_context, product_role, art_direction, color_index, status)
direction_check(direction_id, kind: coherence|sensitivity|relevance, result jsonb, tested_inputs jsonb)

-- creators
creator(id, organization_id, is_demo, display_name, city, country, languages[], modes[], bio, proposition, ...)
portfolio_item(id, creator_id, title, image_url, role, formats[], settings[], themes[], description)
creator_reference(id, creator_id, label, qloo_id, qloo_type, confirmed)
creator_theme(id, creator_id, label, tag_id, confirmed)
quote(id, creator_id, campaign_id?, package, amount_cents, currency, usage_terms, valid_until, source)
creator_fit(run_id, creator_id, direction_id, hard_constraints, capability, cultural_bands, shortlisted)

-- proposals, packages, collaboration
proposal(id, run_id, direction_id, creator_id, current_version_id, status)
proposal_version(id, proposal_id, number, author_user_id, author_role, concept, deliverables, terms,
                 hypothesis, created_at)                                                   -- immutable
budget_package(id, run_id, kind, proposal_ids[], cost_cents, rationale)
offer(id, proposal_version_id, from_org, to_org, status, decided_by, decided_at)          -- exact version
collaboration(id, offer_id, status) · deliverable(...) · asset_version(id, deliverable_id, blob_key, number, state)
approval(id, asset_version_id, user_id, decision, created_at) · comment(id, asset_version_id, user_id, timestamp_s, text, resolved)
result(...) · learning(...) · event(id, campaign_id, actor_user_id, type, payload, created_at)
```

---

## 6. Demo content

- **Demo roster: about 30 fictional creators**, clearly labelled *"Demo roster: fictional creators for illustration"*. Each is owned by a seeded creator org. Each has portfolio items, quotes, availability, languages, and **confirmed** references and themes pre-resolved to Qloo IDs. The roster mixes UGC-only creators with tiny followings and distribution creators.
- **Portfolio imagery**: AI-generated stills, labelled illustrative, stored in Blob.
- **Showcase campaign**: the coffee concentrate example (US and UK, paid UGC, $12,000), precomputed with real Qloo provenance. It's read-only, with a *Duplicate* option.
- **2 more templates** in categories with verified data coverage.
- Qloo responses stay in the private DB cache, **never in the repo**. The seed script calls Qloo at deploy time.

---

## 7. Screens

| Route | Contents |
|---|---|
| `/` | Promise, **Open showcase**, **Enter as brand**, **Enter as creator**, and "How it uses Qloo" |
| `/brand` | Overview (P2) |
| `/brand/campaigns/new` | Guided brief + live summary + paste/upload |
| `/brand/campaigns/[id]` | Header (name · markets · type · budget · **revision selector**) + tabs **Strategy · Proposals · Production · Results** + run progress |
| `…/strategy` | Directions (findings and interpretations, the three checks, creator preview) and the audience comparison |
| `…/proposals` · `…/proposals/[pid]` | Cards, filters, compare-3. Proposal page with evidence drawer, version history and Refine |
| `…/revisions` | Revision compare |
| `…/evaluate` | Blind A/B comparison |
| `…/plan` · `…/production` · `…/results` | Packages · collaboration and review · results |
| `/creator` | Work · Opportunities · Portfolio · Business |
| `/about/qloo` | Every endpoint used and why, the claim rules, and a redacted request→result example |

Accessibility baseline: keyboard navigation, visible focus, AA contrast, reduced motion, captions, and stacked layouts on mobile.

---

## 8. Build order (dependency order, not a schedule)

1. ✅ **Scaffold**: Next.js 16, tokens, shadcn, Drizzle with PGlite/Neon, MIT license, README, project rules.
2. ✅ **Qloo client** with cache, provenance, unit tests and live contract tests.
3. ✅ **Foundation spikes**: Workflow SDK and Better Auth both proven on PGlite (§13).
4. **Schema v2** (§5) + **authorization helper** + demo users and orgs.
5. **Seed**: roster, portfolio, quotes, and resolved references and themes.
6. **Claims engine**: finding templates, binding validator, interpretation rules, with tests first.
7. **Workflow + stages 1–6** → Strategy tab. *This is the first end-to-end demo.*
8. **Stages 7–9** → proposals, proposal page, evidence drawer, packages.
9. **Revisions and refinement** + revision compare.
10. **Creator workspace** → offers on exact versions → production and approvals.
11. **Evaluate** (baseline mode + blind A/B) + ablation script.
12. **Showcase precompute**, landing page with demo entry, `/about/qloo`.
13. **Market adaptation**, compare-3, results, learnings, overview.
14. **Hardening**: degraded states, permissions tests, mobile and a11y passes, load test.
15. **Deploy and submit**. *Deploy as soon as there's a GitHub repo, and keep it deployed from step 3 onward.*

---

## 9. Quality bar / tests

- **Qloo contract tests** (live): ✅ in place.
- **Claims validator tests**: unknown bindings, wrong-run bindings, a missing field, an interpretation containing a number or superlative, purchase-intent language. All must be rejected.
- **Scoring tests**: ranks taken only within a query; no averaging across queries; best-rank-not-sum (adding references never improves a fit); missing → "not measured".
- **Sensitivity tests**: RBO implementation and the stable/changes thresholds.
- **Revision tests**: a refinement creates a new revision and run, nothing derived is shared, and the parent stays intact.
- **Authorization tests**: a creator can't read another brand's campaign; acceptance needs the receiving org; approval binds to an exact asset version.
- **Workflow tests**: a step retries after a transient failure, cancellation stops the next step, and only one active run is allowed per revision.
- **E2E (Playwright)**: the showcase, then brand demo → run → proposal → offer → switch to creator → accept → upload → switch to brand → comment → approve.
- **Ablation script**: runs with and without Qloo on the same inputs, saved privately and summarized honestly in the README.

---

## 10. Final-round pitch (if we make the top 3)

The flow: problem → open the showcase → disambiguation → directions with findings vs interpretations → trace one proposal from finding to portfolio item to concept → **remove an input and compare revisions** → switch to the creator account, rewrite the hook, accept → close on the business: brands pay per campaign workspace, creators are free, and the moat is knowing *which creators execute which concepts for which cultural contexts*.

Angles per judge: Calacanis (business and wedge), Diolosa (claim binding, comparability within each query, honest coverage), Abrams and Boehly (the same engine fits live-event and sponsorship casting), Cedric (creators stay authors of the work).

---

## 11. Decisions

| Decision | Status |
|---|---|
| Stack and hosting: Next.js on Vercel, Vercel Blob | ✅ confirmed |
| Database: PGlite locally, Neon in production | ✅ confirmed and built |
| LLM: Claude (key in `.env.local`) | ✅ confirmed |
| Durable runs: Workflow SDK · Auth: Better Auth | ✅ adopted after spikes (§13) |
| GitHub repo, Vercel project, Neon database | ⏳ needs the user's accounts |

---

## 12. Partner review: what changed

| Review point | Response |
|---|---|
| 1. ID whitelists don't validate claims | **Accepted.** Claims bind to an evidence field and query context. Code writes findings from templates; the model writes labelled interpretations under content rules (§4.1). |
| 2. City hotspot isn't cultural fit; score comparability | **Accepted.** City is logistics-only. Scoring is rank within one query, best rank (not a sum), and missing means "not measured" (§4.3). |
| 3. Separate coherence, stability and relevance; "Holds up" overstates | **Accepted.** Three checks with neutral wording and the tested inputs listed. Relevance uses a held-out audience-only profile plus a labelled judgment. The audience comparison is non-judgmental (§4.2). |
| 4. Unfair baseline | **Accepted**, with identical inputs and blind A/B. *Adjusted:* it stays reachable by judges through the Evaluate view, because the sponsor explicitly asks "would it work without Qloo?". It's still kept out of the main customer flow (§4.6). |
| 5. Anonymous sessions can't support a two-sided workflow | **Accepted**: users, orgs, memberships, invitations and permission checks, with acceptance and approval tied to exact versions. *Adjusted:* one-click demo accounts and multi-session switching keep the zero-friction judge path (§3.3). |
| 6. Durable execution and immutable revisions | **Accepted.** Workflow SDK runs (retries, cancellation, single active run, recovery). Immutable revisions with full re-derivation on every refinement, and immutable proposal versions (§3.2, §4.4). |

---

## 13. Foundation spike results (2026-10-28)

Both spikes ran against the dev server with PGlite and were driven over HTTP.

### Workflow SDK: durable runs
| Behaviour | Result |
|---|---|
| Steps write `run_stage` rows to PGlite (upsert on `run_id, position`) | ✅ |
| Transient failure in a step is retried | ✅ succeeded on attempt 2 |
| Durable `sleep`, and a long step | ✅ |
| Pause for input with `createHook` → `resumeHook` | ✅ (this is the `needs_input` pattern for disambiguation) |
| Graceful restart while paused, then resume | ✅ completed |
| **`kill -9` in the middle of a step** | ✅ the step re-ran (attempt 2) and the run reached `needs_input` 29 s after restart |
| Cancel during a sleep (`getRun(id).cancel()` + `run.cancel_requested`) | ✅ no further stages ran; both statuses read `cancelled` |
| PGlite after a hard kill | ✅ intact |

Operational requirements found (all in place):
- **`src/instrumentation.ts` must call `getWorld().start()`.** Without it, the local backend never re-enqueues unfinished runs after a restart. It's skipped on Vercel, where the managed backend recovers runs itself.
- **Ownership lease:** a step whose process died is retried only after `WORKFLOW_INLINE_OWNERSHIP_LEASE_SECONDS`. The default is **860 s**, which is also the worst-case recovery delay after a crash in production. Dev sets 20 s in the committed `.env.development`. Pipeline steps must stay idempotent, which `markStage` upserts provide.
- Local workflow state lives in `.next/workflow-data`, so deleting `.next` discards in-flight local runs.
- Generated routes in `src/app/.well-known/workflow/` are ignored by git (through their own `.gitignore`) and by ESLint.
- Reusable code from the spike: `src/lib/runs/stages.ts` (`markStage`, `setRunStatus`, `isCancelRequested`). The spike workflow and `/api/spike/run` (dev-only) are removed once the real pipeline exists.

### Better Auth: identity
| Behaviour | Result |
|---|---|
| Email/password sign-up and sign-in through `/api/auth/*` | ✅ |
| Brand org and creator org created, with an active organization per session | ✅ |
| Two accounts in one browser (`multi-session`), switching with `set-active` | ✅ brand ↔ creator |
| A creator reading or activating a brand org | ✅ **403** `USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION` |
| Org list scoped to membership | ✅ |
| Sessions survive a server restart | ✅ |
| Invite by link (no email delivery) → sign up → accept → member | ✅ |

Integration notes:
- The adapter needs a ready database and PGlite boots asynchronously, so the app uses a lazily created, cached `getAuth()` (`src/lib/auth/server.ts`). The CLI loads `auth.cli.ts`, which shares `authOptions()`.
- Identity tables are generated into `src/db/auth-schema.ts` with `pnpm auth:generate`, which also runs `drizzle-kit generate`. Migration `0001` adds them.
- `BETTER_AUTH_SECRET` is in `.env.local` (generated locally). Production needs its own secret and `BETTER_AUTH_URL` set to the deployed origin.
- Still to do in §8.4: foreign keys from app tables (`campaign.organization_id`, `creator.organization_id`, user references) to the identity tables, an `org_profile(kind)` table, and the `authorize()` helper with tests.
