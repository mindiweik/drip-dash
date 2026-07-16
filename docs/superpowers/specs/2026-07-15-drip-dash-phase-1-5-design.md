# Drip Dash Phase 1.5: Columns, plants, per-plant tasks, and tabs

**Date:** 2026-07-15 (revised same day after decision round with Mindi)
**Status:** Approved decisions baked in; see "Decisions log" at bottom
**Builds on:** Phase 1 MVP (merged to main 2026-07-15), roadmap spec `2026-07-14-drip-dash-roadmap-design.md`
**Design reference:** Mindi's Canva mockup (design `DAG5qz9MtQA`, canva.link/hsqccluf8kp8r9q). Deviations from the mockup must be flagged explicitly.

## Why a Phase 1.5

Phase 1 shipped the kiosk with a deliberately trimmed plant story: a read-only grid over an empty table. Real usage feedback (same day!) surfaced that the plant/column model is a major component, not a nice-to-have: Mindi wants to know what's in each column, tap a plant to interact with it, and manage per-plant care tasks. This phase closes that gap before v1 (real data), because the schema and UI shapes decided here are what v1's real data flows into.

**Working agreement for this project:** Drip Dash is nuanced and personal. Ask Mindi as many questions as necessary at every design/UX/domain decision point; never silently assume anything touching her physical setup, routine, vocabulary, or the mockup's intent. (Memory: `feedback_drip_dash_ask_questions.md`.)

## Scope

### 1. Gardens table and display names

A `gardens` table replaces the `GARDYN_IDS` constant hardcoded in three backend files (chores, poller, routes).

```
gardens(id TEXT PK, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'gardyn', cols INTEGER NOT NULL, positions_per_col INTEGER NOT NULL)
```

Seeded:
- `gardyn-1` -> **"Weik & Wander"**, type `gardyn`, 3 cols x 10 positions
- `gardyn-2` -> **"Mystical Menagerie"**, type `gardyn`, 3 cols x 10 positions

The stable ids stay `gardyn-1`/`gardyn-2` everywhere internally (snapshots, chores, API paths). Only display changes. `type` exists now so nursery trays (5x2, parked) slot in later without schema churn.

Backend consumers (poller, computeChores, status route) read garden ids from this table instead of constants. `GET /api/status` gains `name` per garden.

### 2. Plant positions and rich plant fields

Mindi thinks in columns (2x Gardyn 4.0: 3 adjacent columns, 10 slots each). **Position 1 = the TOP slot of a column**, counting down; the grid renders top-to-bottom matching the physical column.

```
plants(id, gardyn_id, col INTEGER NOT NULL, position INTEGER NOT NULL, name TEXT NOT NULL,
       variety TEXT, planted_at TEXT, notes TEXT,
       care_instructions TEXT, about TEXT, uses TEXT)
```

`(gardyn_id, col, position)` unique. The three rich TEXT fields come from the mockup's plant detail screen (care instructions; about; suggested uses / recipe links as free text). **Plant photos are deferred to v1** (file storage/serving design; v3 camera work builds on the same storage). No migration needed; dev DB is disposable.

### 3. Per-plant tasks

Per-plant tasks are chores attached to a plant. The existing `chores` table gains:

```
plant_id INTEGER NULL      -- FK to plants; NULL = garden-level chore (existing behavior)
kind TEXT NULL             -- 'pollinate' | 'roots' | 'trim' | 'harvest' | 'other'; drives pill color
due_at TEXT NULL           -- NULL = due now (existing behavior); future ISO date = scheduled
```

Semantics:
- **ToDo tab** shows garden-level chores plus plant tasks that are due (`due_at` NULL or <= now), labeled with the plant name.
- **Plant modal** shows all of that plant's open tasks (due and future) and supports: complete, add, edit (title, kind, due date), delete. Mindi's requirement: tasks must be editable "in case they're not accurate or needed later or needed earlier."
- Task generation is **manual** in this phase (added via modal, plus seeded examples). Auto-generation from sow date / maturity data is v1 intelligence.
- `computeChores` is untouched except reading garden ids from the gardens table; per-plant tasks do not dedupe or regenerate (they are one-off items).

New/changed endpoints:
- `GET /api/plants` -> camelCase `Plant[]` via a mapper (replaces raw-row passthrough)
- `PUT /api/plants/:id` -> camelCase merge-patch incl. rich fields, 404 when missing
- `GET /api/plants/:id/tasks`, `POST /api/plants/:id/tasks`, `PATCH /api/tasks/:id`, `DELETE /api/tasks/:id`
- `POST /api/chores/:id/complete` (existing) works for plant tasks too; `POST /api/chores/:id/uncomplete` added
- `GET /api/chores` -> `{ chores, doneToday }`, chores due-filtered, rows carry `plantId`/`plantName`/`kind`/`dueAt`

### 4. Tabbed kiosk (the mockup's navigation, built now)

Phase 1's single page becomes a two-tab app, per the mockup and Mindi's explicit call:

- **Bottom tab bar: [Gardyn] [ToDo].** (Nursery and Inventory tabs join in v1.)
- **Gardyn tab:** one garden per screen with back/next (`<` `>`) to flip between Weik & Wander and Mystical Menagerie. Each garden page shows, top to bottom: garden name, **that garden's own sensor status card**, the 3-column x 10-position pill grid (position 1 at top), and the **legend row** from the mockup (pollinate / roots / trim / harvest colors).
- **Plant pills:** whole-pill background tint = the kind of the plant's most urgent due task (amber pollinate, sky roots, violet trim, emerald harvest, slate other); neutral slate when nothing is due. Empty slots render as subtle numbered placeholders so free slots are visible.
- **Tap pill -> plant modal:** details (name, variety, planted date, notes, care instructions, about, uses; editable) + the plant's task list (complete / add / edit / delete). Column/position shown read-only.
- **ToDo tab:** filter chips per the mockup — **All / Weik & Wander / Mystical Menagerie / Plants** (client-side filter), the break board (big tappable chore buttons, plant tasks labeled "PlantName: title", kind-tinted), the happy empty state, and the **done today** strip.
- The degraded-state banner (Phase 1) stays global, above the tab content.

### 5. Seed fake plants

Invented-but-plausible plants (Mindi's call: invented is fine; real inventory lands in v1): 1-2 per column, both gardens, with rich-field sample text on at least a couple, and seeded example tasks in mixed states (each kind represented somewhere, at least one future-dated) so pill tints, board labels, chips, and the modal all demo with real-looking data. Seeding idempotent.

### 6. Completed-chore linger + undo

Usage finding: tapping a chore completes it instantly with no trace or undo (Mindi discovered by accident). Changes:
- ToDo tab keeps chores completed **today** visible in a dimmed "done today" strip (checkmark + strikethrough) below the open chores.
- Each done-today item has an **Undo** button: `POST /api/chores/:id/uncomplete` clears `completed_at`; for schedule-sourced chores it also clears the schedule's `last_done_at` (the reopened chore satisfies dedupe, so nothing double-fires).
- Done-today items age out naturally (completions with `completed_at` on the current local day).

## Out of scope (parked)

- **Nurseries** (2x Gardyn 5x2 lidded trays, per-cell tracking) — mockup screen exists; `type='nursery'` garden rows + 2x5 grid variant + Nursery tab. Deliberately after 1.5.
- **Overall inventory view** (mockup's table with counts + temp preference) + Inventory tab — v1.
- **Add/remove plant UI** (mockup's "Add a new plant!" form) — v1 with inventory; this phase's plants come from seed + are editable via modal. `POST /api/plants` deferred with it.
- **Plant photos / image upload** — v1 (decided this round).
- **Sow date / time-to-maturity / production history** — v1 ("for reference" data).
- **Per-plant check rotation** (1-2 plants per 5-min break, least-recently-checked first) — flagship v1 feature once plant data is real.
- **Auto-generated plant tasks** from growth data — v1/v2.

## Decisions log (Mindi, 2026-07-15)

1. Layout: **tabs now** (Gardyn / ToDo, back/next between gardens), not single-page.
2. Pill indicator: **whole-pill tint** by task kind, plus the mockup's legend row.
3. Position numbering: **position 1 = top of column**.
4. Plant modal fields: **rich fields now** (care instructions, about, uses) alongside basics.
5. Status cards: **top of each garden's own page** (not on the ToDo tab).
6. ToDo filters: **chips now** (All / W&W / MM / Plants).
7. Demo plants: **invented is fine**.
8. Plant photos: **defer to v1**.
9. (2026-07-16, post-review) Completing a future-dated task early via the plant modal **does show in the ToDo tab's "Done today" strip** with its Undo, even though the task never appeared on the open board. Completing ahead of schedule is legitimate and should be visible.

## Constraints carried forward

- `GardynDataSource` adapter seam untouched.
- No emdashes in UI copy or prose. Sentence casing.
- ESM `.js` imports; TDD for logic; commit author = GitHub noreply; no co-author trailers.
- Dev DB stays disposable: schema changes = edit CREATE TABLE + delete db file, no migrations until real data exists (v1).
