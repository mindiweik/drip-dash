# Drip Dash Phase 1.6: Plant lifecycle (add, remove, move)

**Date:** 2026-07-16
**Status:** Decisions collected from Mindi (see Decisions log); ready to plan
**Builds on:** Phase 1.5 (merged to main via PR #28)
**Design reference:** Mindi's Canva mockup (design `DAG5qz9MtQA`); the "Add a new plant!" screen informs the add form, adapted to per-slot instance adds (catalog-level count adds arrive with v1 inventory).

## Why

Phase 1.5 shipped the plant grid and modal but plants only enter via seed data: no way to add a 7th plant, free a slot, or transplant. Mindi asked "how can i add plants" the day it shipped. This phase completes the instance lifecycle so the grid can mirror her physical gardens. It also lays the inventory groundwork: v1's inventory view aggregates over exactly these instance rows (active = not removed; history + reasons feed production stats), and the per-instance rich fields become seed data for v1's species catalog.

**Working agreement (unchanged):** ask Mindi at every design/UX/domain decision point; the Decisions log below is settled.

## Scope

### 1. Add a plant: tap an empty slot

- Empty-slot placeholders in the garden grid become tappable: open an "Add plant" form pre-bound to that (garden, col, position) — no slot-picker UI needed.
- **Rich form (Mindi's call):** name (required), variety, planted date (defaults to today), care instructions, about, uses, notes. All but name optional.
- Submits to new `POST /api/plants` (400 on missing/empty name, 409 on occupied slot, validates col/position within the garden's geometry from the `gardens` table).
- On success the grid refreshes; the new plant is tappable immediately.

### 2. Remove a plant: archive with a reason

- The plant modal gains a Remove action with a confirm step.
- **Archive, not delete (Mindi's call):** plants gain `removed_at TEXT NULL` and `removed_reason TEXT NULL` (`'harvested' | 'died' | 'other'`). Removing stamps both; the row and its full task history stay for v1 analytics (lifespan, sow-to-harvest, produced-vs-lost).
- Removed plants: leave the grid (slot frees), leave `GET /api/plants` default responses, and their OPEN tasks are completed-or-closed so they stop appearing on the ToDo board. Decision: open tasks on an archived plant are hard-deleted (they are no longer actionable; COMPLETED task history is what analytics need and it stays). The plant's completed task history is untouched.
- `DELETE /api/plants/:id` performs the archive (body: `{ reason }`); 404 on missing/already-removed. It is not a SQL DELETE.
- Uniqueness change: the `UNIQUE(gardyn_id, col, position)` constraint must only apply to ACTIVE plants (an archived basil and its replacement can share a slot historically). SQLite: replace the table constraint with a partial unique index `WHERE removed_at IS NULL`.

### 3. Move a plant: transplant, swap allowed

- The plant modal gains a Move action: pick target garden, column, position.
- **Occupied targets swap (Mindi's call):** moving onto an occupied slot exchanges the two plants in one atomic operation (better-sqlite3 transaction). Empty target = simple move.
- `PATCH /api/plants/:id/position` with `{ gardynId, col, position }`; validates target within geometry; swaps when occupied.
- Tasks follow the plant automatically via `plant_id`; the chores rows' `gardyn_id` must be updated when a plant changes gardens (chips filtering depends on it) — both plants' open tasks in a swap.

### 4. UI notes

- Add form and Move picker are modal-style, consistent with PlantModal's dark styling.
- Move picker shows the target garden's grid with occupied slots visibly distinct (they mean swap); current slot disabled.
- Remove confirm: reason as three buttons (Harvested / Died / Other), destructive styling on the final confirm.
- Archived plants are invisible in Phase 1.6 UI (no history browser yet; that is v1 inventory territory).

## Inventory fit (context, not scope)

v1's inventory view = aggregation over these instance rows: active counts by name, total-grown, produced-vs-lost from `removed_reason`, lifespans from `planted_at -> removed_at`. v1 introduces the species catalog (name, temp preference, care/about/uses entered once; "how many to add" count-adds); 1.6's per-instance rich text seeds it by name-dedupe. Nothing in 1.6 needs migration later; the catalog reads and lifts.

## Out of scope

- Inventory view/tab, species catalog, count-based adds (v1)
- Nursery gardens + transplant-from-nursery flows (the move machinery built here is the foundation; nurseries are just more gardens when they arrive)
- History browser for archived plants (v1)
- Photos (v1); rotation (v1); auto-generated tasks (v1/v2)

## Decisions log (Mindi, 2026-07-16)

1. Scope: **add + remove + move** (full lifecycle).
2. Remove = **archive** (removed_at + history kept), not hard delete.
3. Remove captures a **reason: harvested / died / other**.
4. Move onto an occupied slot = **swap** (one step), not blocked.
5. Add form = **rich** (name, variety, planted date, care instructions, about, uses, notes).
6. (Controller, flagged here for visibility) Archiving a plant hard-deletes its still-OPEN tasks but keeps completed task history. If Mindi prefers open tasks archived rather than deleted, say so before execution.

## Constraints carried forward

- Ask-questions working agreement; mockup is the design reference.
- No emdashes; sentence casing; ESM `.js` imports; TDD for logic; author = GitHub noreply; no co-author trailers.
- DB still disposable (partial unique index goes straight into CREATE TABLE/schema block; delete db + restart re-seeds).
- `GardynDataSource` seam untouched.
