# Drip Dash Revamp: Phase 1 Design

**Date:** 2026-07-06
**Status:** Approved (brainstormed with MARVIN); pivoted 2026-07-06 after research spike (see below).

## Vision and roadmap

Drip Dash becomes the always-on garden companion for Mindi's two Gardyn 4.0 hydroponic systems: glanceable status plus a break-time chore board, eventually running on a dedicated Raspberry Pi with a small tablet/monitor as a kiosk display.

Phases, each independently shippable:

1. **Phase 1 (this spec): build the dashboard against a mock data source.** The full app (dashboard, chore board, SQLite, kiosk view) ships and is testable against a `GardynMockSource` that returns realistic fake snapshots. Zero hardware risk. Develop on the Mac.
2. **Phase 2: local Gardyn data source (separate future spec).** Implement a real `GardynDataSource` that talks to the Gardyn hardware locally, swapped in behind the Phase 1 adapter interface. This is its own deliberately-scoped hardware spike, not part of Phase 1 (rationale below).
3. **Phase 3: AI layer.** Local or routed model adding insights on top of accumulated garden data. Not designed yet.

The prime constraint from the 2026-06 time audit: build smaller things. Phase 1 is deliberately minimal and carries no hardware risk.

## Why mock-first (research spike findings, 2026-07-06)

The original plan was cloud-first: feed Phase 1 from an unofficial Gardyn cloud API, go local in Phase 2. A research spike into the community landscape flipped that calculus:

- **The cloud API is actively being disclosed as insecure.** As of June-July 2026 the GitHub `gardyn` topic is dominated by ~12 CVEs and two CISA advisories (ICSA-26-055-03, ICSA-26-183-03): missing auth on user/admin endpoints, IDOR authorization bypass, hardcoded IoT Hub credentials, publicly exposed Azure blob storage with device logs. An API under active security disclosure is likely to change or lock down mid-build. Building Phase 1 on it means building on sand. (Personal security note for Mindi: worth a glance at those advisories regardless of this project, since the Gardyns are on the home network.)
- **The cleanest cloud reference integration is gone.** `JadCham/home-assistant-gardyn-hacs` now 404s.
- **The local-control project is mature but heavyweight.** `iot-root/garden-of-eden` (106 stars, ~99 commits, active) runs on the Gardyn's own Raspberry Pi and exposes a local Flask REST API + MQTT for sensors (ultrasonic water level, AM2320 temp/humidity, PCB temp), lights (on/off + brightness), and pump (on/off + PWM speed). But it requires **reimaging the Pi with a clean Linux install** that replaces the Gardyn stock software entirely. That is destructive, hard to reverse, kills the stock app on that unit, has unconfirmed 4.0 support, and offers no multi-unit guidance.

Reimaging both of Mindi's only two growing systems is the single riskiest, most committal version of this project, and doing it before any dashboard exists front-loads all the risk. The decision: **decouple the dashboard from the data source entirely.** Build and ship the whole visible app against a mock (which tests need anyway), then treat the real local data source as a separate, later spike that experiments on ONE Gardyn while the second stays on stock as a control/fallback, and properly evaluates non-destructive SSH-into-stock access before assuming the full reimage is required.

The adapter interface makes this clean: the UI genuinely does not care where data comes from, so the source is a swap, not a rewrite.

## Jobs to be done

- **Glanceable status:** water level, sensors, light state, "is everything okay" without walking over.
- **Break-time chore board:** open the kiosk during a break, see 2-3 things the garden needs, do them, tap done. Reminders stay in-app by design (garden time is break time, deliberately separate from Motion/work-brain).

Explicit non-goals for Phase 1: Motion integration, a separate journal/history UI (data is captured for it, UI comes later), real-time push (SSE/websockets), multi-user anything, alerting/notifications.

## Research spike: DONE (2026-07-06)

Completed during brainstorming; findings captured in "Why mock-first" above. Outcome: cloud path dropped, Phase 1 goes against a mock, real local source deferred to its own spec. The `GardynSnapshot` shape below is modeled on the sensor set that `garden-of-eden` proves is available locally (water level, temp, humidity, light state), so the mock produces realistic data and the future local source has a known target shape.

## Architecture

One repo (this one), two packages, one runtime process in production:

```
drip-dash/
├── backend/          Express + TypeScript
│   ├── datasources/  GardynDataSource interface + GardynMockSource
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

One method. `GardynSnapshot` is the normalized shape in `shared/`. Everything above the adapter (poller, chores, API, UI) depends only on this shape, which is the whole insurance policy: the future `GardynLocalSource` implements the same interface and nothing else changes.

**GardynMockSource (Phase 1):**
- Returns realistic fake `GardynSnapshot` values with light variation over time (water level slowly dropping, temp/humidity jitter, light state following a day/night schedule) so the dashboard and chore triggers behave lifelike during development.
- Deterministic seeding option for tests (fixed values in, fixed snapshot out).
- No credentials, no network. Pure in-process.

**GardynLocalSource (Phase 2, separate spec, not built here):**
- Will talk to the Gardyn hardware locally and normalize into the same `GardynSnapshot`. Left as a stub/interface note only.

**Poller:**
- `setInterval`, every 15 minutes, each Gardyn in turn: fetch, insert snapshot, run `computeChores()`.
- Fires once on startup so a fresh boot is not blank.

**Failure behavior (the entire error-handling story):**
- Fetch failure: log, skip the cycle, retry next interval. No retry storms, no alerting.
- Staleness is the alert: the UI shows "updated X min ago" and tints the card when data is old.
- (The mock does not fail in Phase 1, but the poller still wraps fetches in try/catch so the future local source inherits this behavior for free.)

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
- Unit tests on `GardynMockSource`: deterministic seed in, expected `GardynSnapshot` out.
- No E2E suite. It is a personal kiosk; break time is the E2E suite.

## Deployment path

- **Now:** `npm run dev` on the Mac (backend + frontend).
- **Later:** fresh Raspberry Pi + small monitor or repurposed tablet as the kiosk. Single Node process under systemd. Footprint is roughly 100-150MB RAM and near-zero idle CPU, comfortably within even modest Pi hardware.

## Deferred to the Phase 2 local-source spec

- How to access a stock Gardyn 4.0 locally: non-destructive SSH-into-stock and read sensors in place, versus the full `garden-of-eden` reimage. Evaluate the non-destructive path first.
- Whether garden-of-eden (or its sensor approach) works on 4.0 hardware.
- Multi-unit addressing for the two Gardyns.
- Whether camera photos are practically fetchable locally.
- Sequencing rule: experiment on ONE Gardyn; keep the second on stock as a control/fallback.
