# Drip Dash Revamp: Phase 1 Design

**Date:** 2026-07-06
**Status:** Approved (brainstormed with MARVIN)

## Vision and roadmap

Drip Dash becomes the always-on garden companion for Mindi's two Gardyn hydroponic systems: glanceable status plus a break-time chore board, eventually running on a dedicated Raspberry Pi with a small tablet/monitor as a kiosk display.

Three phases, each independently shippable:

1. **Phase 1 (this spec): revamp with real data.** Dashboard + chore board fed by the unofficial Gardyn cloud API. Develop on the Mac, deploy to a Pi later.
2. **Phase 2: local control.** Talk to the Gardyn hardware directly on the LAN (community "jailbreak"/local-access projects), removing the cloud dependency. Swaps in behind the Phase 1 adapter interface.
3. **Phase 3: AI layer.** Local or routed model adding insights on top of accumulated garden data. Not designed yet.

The prime constraint from the 2026-06 time audit: build smaller things. Phase 1 is deliberately minimal.

## Jobs to be done

- **Glanceable status:** water level, sensors, light state, "is everything okay" without walking over.
- **Break-time chore board:** open the kiosk during a break, see 2-3 things the garden needs, do them, tap done. Reminders stay in-app by design (garden time is break time, deliberately separate from Motion/work-brain).

Explicit non-goals for Phase 1: Motion integration, a separate journal/history UI (data is captured for it, UI comes later), real-time push (SSE/websockets), multi-user anything, alerting/notifications.

## Step 0: research spike

Before implementation, survey the community projects around Gardyn:

- Find the healthiest unofficial cloud API client (Home Assistant integration, standalone clients).
- Document: auth flow, endpoints, response shapes, how two devices on one account appear, rate limits or gotchas.
- Bank Phase 2 recon for free: note any local-access/jailbreak projects and what they reveal about the hardware.

The `GardynCloudSource` implementation and the exact `GardynSnapshot` fields are finalized from this spike. The spike output is a short findings doc in `docs/`.

## Architecture

One repo (this one), two packages, one runtime process in production:

```
drip-dash/
├── backend/          Express + TypeScript
│   ├── datasources/  GardynDataSource interface + GardynCloudSource
│   ├── poller/       setInterval loop (no cron dependency)
│   ├── care/         computeChores() (a function, not a subsystem)
│   ├── db/           SQLite via better-sqlite3 (replaces MongoDB)
│   └── routes/       small REST API
├── frontend/         React + Vite, single kiosk-first responsive view
└── shared/           types shared FE/BE (GardynSnapshot lives here)
```

Data flow: poller fetches from the Gardyn cloud every 15 minutes per device, normalizes into a `snapshots` row, then runs `computeChores()`. The frontend reads only the backend REST API and never talks to Gardyn.

Production is a single Node process serving the built frontend as static files. Pi migration is clone, install, systemd unit. Dev on the Mac is identical minus systemd.

MongoDB is removed. SQLite is zero-ops, one file to back up, and right-sized for a Pi.

## Data model

Four tables:

**snapshots** - one row per Gardyn per poll
- `id`, `gardyn_id`, `taken_at`
- `data` JSON column holding the normalized snapshot (water level, temp/humidity, light state, photo URLs). Raw-ish JSON means API surprises never lose data; fields get promoted to real columns later only if querying demands it.
- History is kept, not overwritten. The future journal falls out of this for free.

**care_schedules** - recurring rules, seeded once, editable in-app
- `id`, `gardyn_id` (nullable = applies to both), `name`, `every_days`, `last_done_at`

**chores** - the break-time board
- `id`, `gardyn_id`, `title`, `source` (`schedule` | `data-trigger`), `created_at`, `completed_at` (null = open)

**plants** - light metadata overlay, the only hand-entered table (set once per pod, not ongoing entry)
- `id`, `gardyn_id`, `slot`, `name`, `variety`, `planted_at`, `notes`

## Gardyn adapter and poller

```typescript
interface GardynDataSource {
  fetchSnapshot(gardynId: string): Promise<GardynSnapshot>
}
```

One method. `GardynSnapshot` is the normalized shape in `shared/`. Everything above the adapter (poller, chores, API, UI) depends only on this shape, which is the Phase 2 insurance policy: `GardynLocalSource` later implements the same interface and nothing else changes.

**GardynCloudSource:**
- Gardyn credentials in `.env` (never hardcoded, `.env.example` updated with placeholders).
- Manages the auth token, re-login on expiry.
- Endpoints and response handling per the research spike.

**Poller:**
- `setInterval`, every 15 minutes, each Gardyn in turn: fetch, insert snapshot, run `computeChores()`.
- Fires once on startup so a fresh boot is not blank.

**Failure behavior (the entire error-handling story):**
- Fetch failure: log, skip the cycle, retry next interval. No retry storms, no alerting.
- Staleness is the alert: the UI shows "updated X min ago" and tints the card when data is old.
- Auth failure: one re-login attempt, then a visible "reconnect needed" banner.

## Care logic

`computeChores()` runs after each poll:

- **Schedule-driven:** for each `care_schedules` row where `last_done_at + every_days` is past due, insert an open chore (skip if an open chore for that schedule already exists).
- **Data-driven:** a small set of hardcoded triggers to start (water level below threshold). Same dedupe rule.
- **Completion:** `POST /chores/:id/complete` stamps `completed_at`; if the chore came from a schedule, also stamps the schedule's `last_done_at`.

## REST API

Roughly four endpoints:

- `GET /api/status` - latest snapshot per Gardyn plus staleness/reconnect flags
- `GET /api/chores` - open chores
- `POST /api/chores/:id/complete`
- `GET /api/plants` / `PUT /api/plants/:id` - plant metadata read and edit

The legacy plants/systems/tasks CRUD routes are absorbed into the above or deleted.

## Frontend: the kiosk view

One responsive page, tablet-first (its destiny is a wall-mounted display):

1. **Garden status strip:** one card per Gardyn with water level as the big number, temp/humidity, light state, and "updated X min ago". Red tint on stale data or reconnect needed.
2. **Break board:** open chores as big tappable chips. Tap marks done and it animates away. The empty state ("Garden's happy, go enjoy your break") is a first-class design element, since the board earning trust when there is nothing to do is what builds the check-in habit.
3. **Plant grid:** each pod slot with name, variety, days since planted, and the latest camera photo if available. Tap to edit metadata (the only form in the app).

Design rules: big type, high contrast, generous tap targets (read from feet away, tapped with wet fingers), auto-refresh on a timer with zero interaction required, dark mode by default.

## Testing

Light, matching the build:

- Unit tests on `computeChores()`: schedule due, trigger fires, dedupe, completion stamping. TDD.
- Unit tests on the `GardynCloudSource` normalizer: recorded API fixture in, `GardynSnapshot` out.
- No E2E suite. It is a personal kiosk; break time is the E2E suite.

## Deployment path

- **Now:** `npm run dev` on the Mac (backend + frontend).
- **Later:** fresh Raspberry Pi + small monitor or repurposed tablet as the kiosk. Single Node process under systemd. Footprint is roughly 100-150MB RAM and near-zero idle CPU, comfortably within even modest Pi hardware.

## Open questions (resolved by the research spike)

- Exact cloud API auth flow, endpoints, and response shapes.
- Whether camera photos are practically fetchable (frequency, URLs, auth).
- How two Gardyns on one account are addressed.
- Anything the local-access community work implies we should keep in mind for the Phase 2 swap.
