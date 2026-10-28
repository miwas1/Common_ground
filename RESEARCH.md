# Qloo Agentic Hackathon — Research Brief

Compiled 2026-10-28 from qloo.devpost.com, its rules and resources pages, docs.qloo.com, github.com/qloo/qloo-hackathon-kit, and the `@qloo/qloo-harness@0.1.26` npm package.

## 1. The clock

| | |
|---|---|
| **Submission deadline** | **Thu Oct 30, 2026, 11:45 pm EDT** (about 2.5 days from today) |
| Judging | Nov 2–5 |
| Finals | **Nov 5, live on air.** The top 3 pitch to Jason Calacanis, Cedric the Entertainer and Alex Elias (Qloo CEO), who pick the winner live. Finalists must be available on that date and for prep beforehand. |
| Prizes | $15k / $6k / $4k, plus **Calacanis personally invests $25k** in his favourite entry |
| Field | about 2,659 registered participants |

**API key:** request it via the Google Form (https://forms.gle/zz12orkLHTAneLGz6). Keys are issued by hand and take "a few business days", and they often land in spam. **If you don't have a key yet, request it now and post in Discord #api-help** (https://discord.gg/rF9PKsD5Q7). Without a key we can't make any live calls.

## 2. Hard submission requirements (otherwise disqualified)

1. **Live, hosted demo link** that judges can use end to end. A local-only app or one that needs private access doesn't qualify. If it needs a login, give judges credentials. It must stay free and up until judging ends on Nov 5.
2. **Public repo** (GitHub/GitLab/Bitbucket) with all source code, assets and run instructions.
3. **An open-source LICENSE file that GitHub detects**, so it shows in the repo's About sidebar. MIT is fine.
4. **Text description** covering features, what the agent does, and *what makes it Qloo-powered*.
5. **The project must be agentic.** It has to be (a) an agentic tool, (b) built on an agent framework, or (c) Qloo wired into an existing agent.
6. New work. If it builds on an earlier project, the Qloo integration must have been added after Sep 30 and the description must explain what changed.
7. No video is required. Judges "may judge solely on text description, images" and are *not required* to test the app, so **the description and screenshots must sell the project on their own.**
8. Never commit the API key, and **never put Qloo response data in the public repo.** Private server-side caching is allowed.

## 3. How it's judged

- **Stage 1 (pass/fail):** does it fit the theme and actually use the Qloo API?
- **Stage 2:** four criteria, weighted equally. Ties are broken in this order:
  1. **Technological Implementation:** how thoroughly and skilfully Qloo is used, and whether the implementation is non-trivial.
  2. **Design:** a complete, coherent product, not a proof of concept.
  3. **Potential Impact:** a credible, specific real problem for a real audience, and a demo that actually solves it.
  4. **Quality of Idea:** a creative, *non-obvious* use of Qloo that shows understanding of the problem domain.
- The rules allow "automated AI-driven analysis" in screening, so a clear, well-structured description and README matter.
- Sponsor test: *"If your submission would work the same without Qloo, you're building the wrong thing."* and *"We're not looking for demos of what LLMs can already do."*
- The examples Qloo gave are deliberately niche and specific: lighting styles for electricians' customers, meals for seniors with health constraints, and rare-disease journeys.

### Judges (who you're pitching to)
Jason Calacanis (angel investor, All-In; cares about the business), Mike Diolosa (Qloo CTO; cares about API depth), Nicole Seligman (OpenAI board), Todd Boehly (Eldridge, Chelsea FC, Dodgers; sports and media), Cedric the Entertainer (consumer appeal, culture), Michael Abrams (Live Nation; live events and touring).

### Lessons from the previous Qloo hackathon (Jul 2025, 2,853 participants)
The winners were **GeoTaste** (location-based business consultant agent), **Resonance AI** (culturally authentic political campaign messaging), **Alloy** (a "cultural compatibility score" for M&A due diligence) and **Zesty** (an "un-recommendation" engine that breaks your filter bubble).
→ **Pattern:** B2B or decision-making tools for a specific buyer, or a clever inversion. Generic "taste-based movie, travel or recipe recommender" entries filled the rest of the gallery and didn't place.

## 4. Qloo: what it is

A NYC-based "cultural AI" company (CEO Alex Elias). Its taste graph covers **250M+ entities** across music, film/TV, books, podcasts, games, brands, dining/places, destinations and people. It links them through anonymized, aggregate affinity signals, so it holds **no personal data**. The core idea is cross-domain: *people who like X tend to like Y*, even when X is a band and Y is a restaurant. It can also break that down by age, gender, audience segment and geography (down to geohash level), plus trends over time.

Framing to respect (from the kit's Safe Use doc): results are **aggregate affinities**. They are not facts about an individual, and you must not use them to infer health, finances, politics, or decisions about housing, employment, credit or insurance. Don't send PII to Qloo. Show provenance, and keep "what Qloo returned" separate from your own interpretation. Doing this visibly will impress the Qloo CTO.

## 5. Two ways to call Qloo

### A. Raw REST API (simplest, works anywhere including serverless)
- Base URL: **`https://hackathon.api.qloo.com`**. The prod and staging URLs return 401 with hackathon keys.
- Auth header: **`X-Api-Key: <key>`**. Not Bearer, and not a query param.
- `/v2/insights` is a **GET** with query-string params. A POST with a JSON body fails.
- **Invalid params are silently ignored.** An empty `entities` array usually means a param isn't valid for that `filter.type`.
- Don't use `/recommendations` or `/recs` (legacy, unsupported).
- Key stays server-side. Never ship it to the browser.

### B. Official harness `@qloo/qloo-harness` (Node ≥ 22.19)
`npm i -g @qloo/qloo-harness` → `qloo setup --qloo`. One package gives you:
- `qloo mcp`: a local **stdio MCP server** your agent can call (needs a long-running VM/container; **serverless is not supported** for this route).
- `qloo exec <workflow>`: the same workflows as JSON over the CLI.
- `qloo api …`: raw endpoint calls.
- `qloo explore`: a chat REPL for prototyping queries.
- Every tool returns the same envelope: `status` is one of `ok | empty | needs_input | partial | degraded | error`, plus `summary`, `results` and `provenance`.

| Harness MCP tool | What it does |
|---|---|
| `qloo_find_tags` | Natural language → tag URNs (semantic search over the tag ontology) |
| `qloo_describe` | Resolve a name or ID → entity metadata |
| `qloo_recommend` | Entities matching a combined entity + tag + location + demographic profile |
| `qloo_rank` | Rank a *supplied shortlist* against one taste profile (scores only comparable within one call) |
| `qloo_where_popular` | Geographic areas where an entity has strong affinity |
| `qloo_compare_audiences` | Compare two groups of entity signals |
| `qloo_entity_tags` | Concepts that jointly characterize a set of entities |
| `qloo_audience_demographics` | Age and gender affinity distribution for an entity |
| `qloo_trends` | Time-series popularity for 1–5 entities over a date range |
| `qloo_capabilities` | Readiness check (no API call) |

The docs MCP (`https://docs.qloo.com/mcp`, no key needed) is for looking things up while coding. Don't use its `execute-request` tool.

**Recommendation:** call the REST API directly from your own backend. Expose 6–10 well-designed tools to the LLM (Claude via tool use, or an agent SDK). That gives full control, works on Vercel/Cloudflare/Fly, and shows "non-trivial implementation". Mirror the harness's envelope and `needs_input` disambiguation pattern, because the CTO built that pattern and will recognize it.

## 6. API reference (condensed)

### Endpoints
| Endpoint | Purpose |
|---|---|
| `GET /search?query=&types=&take=&filter.location=…` | Name → entity IDs (supports location, tags, rating and popularity filters) |
| `GET /entities?entity_ids=…` or `external.{spotify,imdb,isbn13,musicbrainz,goodreads,resy,michelin,wikidata,…}.ids` | Look up entities by Qloo ID **or by external IDs**, e.g. turn a Spotify artist ID into a Qloo entity |
| `GET /v2/tags?filter.query=&feature.semantic_search=true` | Concept → tag URNs. No static tag list exists, so you must search. |
| `GET /v2/tags/types` | Tag namespaces per entity type |
| `GET /v2/audiences`, `/v2/audiences/types` | Audience segment URNs (`urn:audience:communities`, `spending_habits`, …) |
| `GET /v2/insights` | **The core engine** (below) |
| `GET /v2/analysis/compare` | Compare two groups of entities |
| `GET /v2/trending` | Popularity time series for entities |

### `/v2/insights`: `filter.type` sets what kind of answer you get
- **Entity recs:** `urn:entity:{artist, book, brand, movie, tv_show, podcast, videogame, person, place, destination, locality}`. Use `artist`, not `music`. For food, use `place` with cuisine tags, or `brand`.
- **`urn:tag`**: taste analysis, i.e. which concepts characterize this audience, entity or location. Narrow it with `filter.tag.types` and `filter.parents.types`.
- **`urn:demographics`**: age and gender affinity for an entity or tag. Positive or negative values are relative to the average.
- **`urn:heatmap`**: geohash grid of `affinity`, `affinity_rank` and `popularity` over an area (`filter.location.query=NYC`). Extra place attributes via `heatmap.dimensions`, and city or neighborhood boundaries via `output.heatmap.boundary`.

### Signals (what the taste profile is)
- `signal.interests.entities` (IDs) / `.query` (names) / `.weight`
- `signal.interests.tags` + `.weight`, `operator.signal.interests.tags`
- `signal.demographics.age` (`24_and_younger … 55_and_older`, or `35_and_younger|36_to_55|55_and_older`), `.gender`, `.audiences` + weights
- `signal.location` (WKT `POINT(lon lat)`, polygon or locality ID) / `.query` / `.radius` / `.weight`

### Filters (constrain the output)
- **Location:** `filter.location` / `.query` (fuzzy names; arrays get merged when using POST) / `.radius` / `.geohash`, `filter.exclude.location*`, `filter.geocode.{country_code, admin1_region, name}`, `filter.location.metro`
- **Tags:** `filter.tags`, `filter.exclude.tags`, plus `operator.*` for and/or logic
- **Places:** `filter.price_level.min/max`, `filter.hours` (open on a weekday), `filter.properties.business_rating`, `filter.popularity.min/max`, `filter.hotel_class`, `filter.external.resy.{rating,count,party_size}`, `filter.external.tripadvisor.{rating,rating.count}`
- **Media:** `filter.release_year/date`, `filter.content_rating`, `filter.release_country`, `filter.publication_year`, `filter.finale_year`
- **People:** `filter.gender`, `filter.date_of_birth/death`
- **Scoring a known set:** `filter.results.entities` / `filter.results.tags` (how well do *these* specific items fit the profile?)

### Shaping and quality
- **`feature.explainability=true`**: gives per-result attributions showing which input entities drove each recommendation (0–1). **Use this.** It's the honest "why", and an easy win on technical depth.
- `bias.trends` (off → very_high), `bias.content_based`, `bias.quality`
- `diversify.by=properties.geocode.city|metro|subtype` + `diversify.take`
- `backfill.cross_domain.take`, `backfill.content_based.take`
- `sort_by=affinity|distance|rating|quality`, `take`, `page`, `offset`

### Typical chain
`/v2/tags` or `/search` to resolve vague words into IDs → **confirm with the user if ambiguous** → `/v2/insights` with signals and filters → explain using `feature.explainability`.

## 7. What a winning entry looks like (synthesis)

1. **A specific buyer with a specific, painful decision.** "Who is this for and what do they decide differently because of it?" should have a one-sentence answer. B2B or professional use cases did best last time, and Calacanis is judging the business.
2. **Qloo has to be load-bearing, in a visible way.** Use 4 or more distinct capabilities, for example cross-domain recs + `urn:tag` taste analysis + `urn:demographics` + `urn:heatmap` / `where_popular` + `trending` + `explainability`. Show a side-by-side "LLM alone vs. LLM + Qloo" to prove the difference.
3. **Actually agentic.** Multi-step planning, tool calls, disambiguation (`needs_input`) and a final artifact the user can act on, such as a plan, brief, map, shortlist or itinerary. A chatbot that just relays API output won't place.
4. **A polished, hosted, zero-friction demo.** No signup, or a one-click demo account. Seed it with 2–3 "try this" scenarios so judges see the magic in 30 seconds, and cache server-side so it's fast and robust under judge traffic.
5. **Responsible-data story.** Aggregate affinities only, no PII, provenance shown. It's cheap to add and it signals maturity.
6. **Pitch-ready for a live TV final.** It needs a one-line hook and a visual "wow" moment, like a heatmap, a taste map or a before/after. The judging panel spans entertainment, sports and live events.
7. **Write-up:** problem → who → how it works (diagram) → which Qloo endpoints and why → example request→result → limitations. Add screenshots, because judges may never open the app.

## 8. Practical build notes
- Rate limits, measured from response headers on 2026-10-28: **10 requests/second** (`x-second-ratelimit-*`) and **50,000/month** (`x-month-ratelimit-*`) per key. They can be raised via Discord #api-help.
- Data coverage in the hackathon environment may be patchy for some regions or entities. Test your demo scenarios early and pick ones with rich results.
- The response always includes verbose fields like `akas`, so trim them server-side before sending to the LLM to save tokens.
- Deploy target: any host that keeps the key server-side (Vercel/Next.js API routes, Cloudflare Workers, Fly or Render). Choose a container/VM only if you use `qloo mcp`.
