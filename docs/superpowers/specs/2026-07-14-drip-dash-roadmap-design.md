# Drip Dash Roadmap: MVP through v3

**Date:** 2026-07-14
**Status:** Approved (brainstormed with MARVIN)
**Relationship to prior specs:** Extends, does not replace, the 2026-07-06 Phase 1 design (`2026-07-06-drip-dash-revamp-design.md`). That spec's Phase 1 becomes the MVP below, unchanged. This doc recuts the loosely-sketched Phase 2/3 into versioned releases and designs the AI layer at roadmap altitude.

## Vision

Drip Dash grows from a mock-fed kiosk dashboard into an AI-assisted garden companion for Mindi's two Gardyn 4.0 systems. Long-term, the AI layer does four jobs: photo plant diagnosis, garden digest and Q&A, smart chore generation, and growth/harvest tracking. Those are the destination, not the near-term build. The prime constraint carries over from the 2026-06 time audit: build smaller things, ship each step, let real usage justify the next.

## Sequencing decision: data before intelligence

Three approaches were considered:

- **A. Data before intelligence (chosen):** ship the mock dashboard, then the real local data source, then AI over real accumulated history.
- **B. AI amuse-bouche:** an early phone-photo diagnosis feature before real data. Rejected: adds a photo-upload flow to an app deliberately designed with one form, and delays the thing that makes every other AI feature meaningful.
- **C. Two lanes:** AI experiments live outside the app as scripts/notebook exercises until the data exists. Rejected as a roadmap structure, but kept as an option: pre-v2 AI play happens as LLM-course-style exercises against exported snapshots, never as app features.

Rationale for A: AI over mock data is a demo, not a tool. A digest that says "water is dropping faster than usual" requires a "usual," which means months of real snapshots. Sequencing data first means every AI feature lands with substance.

## The version ladder

Each version is independently shippable, has a definition of done, and a promotion gate: a real-world condition that must be true before the next version starts. The gates are the anti-shiny-object mechanism.

| Version | What ships | Done when | Gate to next |
|---------|-----------|-----------|--------------|
| **MVP** | 2026-07-06 spec as-is: mock-fed kiosk dashboard + chore board, SQLite, one Node process on the Mac | Mindi is actually using the chore board during breaks for ~2 weeks | The check-in habit exists; the app has earned real data |
| **v1** | Real local data source on ONE Gardyn (its own spec). Second unit stays stock as control/fallback | Dashboard shows live data from Gardyn #1 reliably for ~a month; snapshots accumulating | Enough real history that trends are visible; hardware approach proven |
| **v2** | First AI, OpenRouter-routed: kiosk digest + smart chore suggestions over real history. Gardyn #2 goes local too if v1 proved out | The digest says things the raw numbers do not; suggested chores are ones Mindi actually does | AI is earning its spot on screen, not decorating it |
| **v3** | Vision: photo diagnosis from Gardyn cameras + growth/harvest tracking. Hybrid local inference considered here, gated on explicit criteria | It catches a plant problem before Mindi does, at least once | n/a (long-term destination) |

Two design rules threaded through every version:

- **The adapter interface stays sacred.** Every version swaps or adds behind `GardynDataSource` or new narrow seams. No version rewrites a previous one.
- **AI features must cite their data.** Any digest claim or chore suggestion links back to the snapshots (or photos) that justify it. Keeps the model honest and debugging sane.

## MVP

The 2026-07-06 Phase 1 spec and its implementation plan (`2026-07-06-drip-dash-revamp-phase1.md`) stand unchanged. Nothing in this roadmap modifies MVP scope.

## v1: local data source (own spec when its time comes)

Scope is already sketched in the 2026-07-06 spec's "Deferred to the Phase 2 local-source spec" section: non-destructive SSH-into-stock recon first, `garden-of-eden` reimage only as fallback, experiment on one Gardyn, multi-unit addressing, camera photo fetchability.

One addition from this roadmap: **v1 recon must answer the photo question.** Whether per-slot camera photos are practically fetchable locally determines v3's ceiling (photo diagnosis). Nothing is built with photos until v3, but the recon finding gets recorded in the v1 spec so v3 planning starts informed.

## v2: AI layer, first pass (digest + smart chores)

Roadmap-altitude design; v2 gets its own full spec when its time comes.

### Architecture: one new seam, mirroring the data-source pattern

```
backend/
├── datasources/   GardynDataSource (unchanged)
├── care/          computeChores() (unchanged, still runs)
└── insights/      NEW: InsightEngine
    ├── digest.ts       buildDigest(history) -> DigestReport
    └── suggest.ts      suggestChores(history) -> SuggestedChore[]
```

### Digest

- A scheduled job (daily, not per-poll; 15-minute polling does not need 15-minute prose) sends a compact rollup of recent snapshots + chore history to a model via OpenRouter.
- Returns a short structured digest: 2-3 observations, each citing the data behind it.
- Rendered as a card on the kiosk. Stale digest = hidden digest, same staleness philosophy as the sensor cards.

### Smart chores

- The model proposes, `computeChores()` disposes. Suggestions land in a separate `suggested_chores` state; Mindi taps to accept (becomes a real chore) or dismiss.
- Dismissals are recorded so repeat-nagging gets suppressed.
- The hardcoded deterministic triggers never go away. AI augments, never replaces, the deterministic layer.

### Model calls

- OpenRouter API. Key in `.env`, model ID in config so models swap freely as they improve, no code change.
- Structured output (JSON schema) so a flaky response degrades to "no digest today," never to garbage on the kiosk.
- Failure behavior identical in spirit to the poller: log, skip, retry next cycle. The kiosk never blocks on AI.

### Cost

One digest/day plus a handful of suggestion runs is a few thousand tokens/day. Pennies per month. Not a design factor.

## v3: vision + growth tracking

Roadmap-altitude design; v3 gets its own full spec when its time comes.

### Photo diagnosis

- Feeds on Gardyn camera photos, contingent on the v1 recon answer to the photo question.
- Vision model via OpenRouter on a slow cadence (daily, or on-demand from a kiosk tap): per-slot health assessment, harvest readiness, anomaly flags.
- Same rules as v2: structured output, citations (which photo, which slot), degrade to silence on failure.
- Findings can suggest chores through the same v2 accept/dismiss flow. One pipeline, new input type.

### Growth/harvest tracking

- By v3 there are months of snapshots + plant metadata + photo history. Per-plant timeline view: planted, growth observations, predicted vs actual harvest. This is where the "journal falls out of the snapshots table for free" promise from the 2026-07-06 spec gets its UI.
- Pattern-finding (e.g. "this variety stalls in slot 12") is periodic analysis over history: same InsightEngine seam, new job type.

### Hybrid local inference: a gate, not a plan

Long-term the inference strategy is hybrid (local for cheap frequent tasks, routed for vision and reasoning), but local inference only gets built if a real trigger shows up:

- API costs actually hurt (unlikely at this scale), or
- a latency or offline need appears, or
- Mindi wants it as a deliberate learning project.

Otherwise routed-only forever is a perfectly good end state.

## Non-goals (whole roadmap)

Carrying the 2026-07-06 spirit forward:

- No Motion integration (garden time stays deliberately separate from work-brain).
- No notifications/alerting; staleness on the kiosk is the alert.
- No multi-user anything.
- No chat interface for its own sake. The Q&A job only exists if the digest proves the kiosk-AI habit first.

## Where things live

All Drip Dash specs and plans live in this repo under `docs/superpowers/`. The mindiweik.com repo holds only the public project page (flip its status from dormant to active when MVP ships; already noted in that repo's `docs/followups.md`).
