# Drip Dash Phase 1.7: variety catalog + pick-from-catalog add flow

**Date:** 2026-07-17
**Status:** Decisions collected from Mindi (see Decisions log); ready to plan
**Builds on:** Phase 1.6 (plant lifecycle: add/remove/move), merged to main via PR #29
**Design reference:** Mindi's Canva mockup (design `DAG5qz9MtQA`) — the inventory table (counts + temp pref) and the "Add a new plant!" screen.

## Why

Phase 1.6 gave every plant instance its own care/about/uses text, retyped per plant. Mindi is growing the same varieties repeatedly across two Gardyns, so that reference info belongs to the *variety*, not the individual plant. This phase introduces a **variety catalog**: reference data (temp preference, time-to-maturity, care, about, uses, freeform details) entered once per variety and reused on every plant of it. The add-plant flow becomes **pick a known variety** (autofills the reference fields) or **add a new variety**.

This is the backbone for the larger inventory arc. It is the first of three phases:

- **1.7 (this spec):** catalog + pick-from-catalog add flow.
- **1.8 (later):** seed pod stock — counts per variety by source (Gardyn / DIY rockwool), stepper-managed, auto-decrement on plant (warn-but-allow, floor at 0).
- **1.9 (later):** inventory dashboard tab — per-variety stats: alive-now + where, pods on hand, total ever grown split harvested/died, typical lifespan.

The catalog is a hard prerequisite for both 1.8 (stock keys off variety) and 1.9 (dashboard groups by variety).

**Real-world note:** Mindi does not yet have real plant/pod data loaded; the 6 seed plants are demo fakes. Phase 1.7's real job is to be **the tool she uses to take a physical inventory** of her two gardens, building the real catalog as she walks the slots. The fake-data migration below is scaffolding she will overwrite or clear.

**Parallel thread (not in this spec's build scope): Gardyn scrape recon.** Gardyn's cloud app already knows her slot assignments and carries encyclopedia detail (temp, maturity, care). A read-only scrape could turn "take inventory by hand" into "import, then verify," feeding the exact same `catalog` + `plants` tables this phase builds. Feasibility is unknown (auth flow, endpoints, still-works-post-CVE-disclosure) and it wants a timeboxed, non-destructive recon with Mindi's own credentials. Decision (2026-07-17): **build the manual foundation now** (needed regardless — DIY pods, corrections, fallback) and **spike the scrape in parallel** as its own investigation. If it pans out, an importer becomes an additional ingestion path on top of this model; nothing here is thrown away. This connects to the roadmap's `GardynDataSource` seam and the "real data from Gardyn" thread.

**Working agreement (unchanged):** ask Mindi at every design/UX/domain decision point; the Decisions log below is settled.

## Scope

### 1. The `catalog` table (one row per variety)

New table, one row per variety Mindi grows:

```
catalog
  id                INTEGER PRIMARY KEY AUTOINCREMENT
  name              TEXT NOT NULL          -- e.g. "Basil"
  variety           TEXT                   -- e.g. "Genovese"; nullable
  temp_pref         TEXT                   -- free text, e.g. "65-75°F"
  time_to_maturity  TEXT                   -- free text, e.g. "~60 days"
  care_instructions TEXT
  about             TEXT
  uses              TEXT
  details           TEXT                   -- freeform: light, germination, difficulty, Gardyn encyclopedia detail, anything else
  created_at        TEXT NOT NULL
```

**Identity / uniqueness:** a variety is `(name, variety)`. Because SQLite treats `NULL` as distinct in unique constraints (which would let two varietyless "Thai Chili" rows coexist), enforce uniqueness with an expression index that collapses null variety to empty string:

```
CREATE UNIQUE INDEX idx_catalog_identity ON catalog (name, COALESCE(variety, ''));
```

Reference fields (temp_pref, time_to_maturity, details) are new and start blank; Mindi fills them in over time via the "Edit variety" flow (§4).

### 2. Plants link to catalog; identity + reference fields promoted

- `plants` gains `catalog_id INTEGER` referencing `catalog(id)`. Nullable in the schema (an `ALTER ADD COLUMN` can't backfill NOT NULL cleanly), but **required by the API** on create — every plant belongs to a variety.
- **Single source of truth = the catalog.** `name`, `variety`, `care_instructions`, `about`, `uses` all **move from `plants` up to `catalog`** and are dropped as plant columns. A plant no longer carries its own name/variety/care text; it carries `catalog_id`.
- `plants.notes` **stays per-plant** (instance-specific: "this one's leggy"). `planted_at`, `removed_at`, `removed_reason`, and the slot columns (`gardyn_id`, `col`, `position`) all stay as-is.
- **The API `Plant` shape is unchanged for the frontend.** The plant read query joins `catalog` and aliases its columns (`catalog.name AS name`, `variety`, `temp_pref`, `time_to_maturity`, `care_instructions`, `about`, `uses`, `details`) so the returned `Plant` object still has `name`, `variety`, care/about/uses, etc. — the values just come from the join, not from plant columns. Grid pills and the plant modal keep working; nothing displays a stale copy, and a variety rename propagates to every plant of it automatically.

### 3. Add-plant becomes pick-from-catalog

Tap an empty slot → Add Plant modal, now catalog-driven:

- **Picker** at top: searchable/scrollable list of catalog varieties (name + variety), plus a prominent **"+ Add new variety."**
- **Pick an existing variety:** its reference fields show as a **read-only preview**; Mindi sets **planted date** (default today, local) + optional **instance notes**, then Save. Creates a plant row with `catalog_id` set (name/variety/reference fields resolve from the catalog, not stored on the plant). 409 if the slot is occupied; slot validated against garden geometry (unchanged from 1.6).
- **Add a new variety:** the full rich form — name (required), variety, temp_pref, time_to_maturity, care, about, uses, details. Save creates the catalog entry **and** places the plant at that slot. Under the hood this is `POST /api/catalog` then `POST /api/plants` (two honest calls); if the catalog create fails on a duplicate identity, surface it and let her pick the existing one instead.

### 4. Editing a variety's reference fields (Decision B)

- In the plant modal, reference fields are **read-only** with a small **"Edit variety details"** affordance that opens a catalog-entry editor.
- Editing there **obviously applies to the whole variety** (every plant of it), which is the intended mental model — no "did this change everything?" surprise.
- `PATCH /api/catalog/:id` persists the edit; the modal/grid refetch to reflect it.

### 5. Clear demo data

- A simple **"clear demo data"** action removes the seeded fakes in one step, so wiping scaffolding after taking real inventory isn't six manual removes.
- Scoped by the `demo` flag on catalog + plants (set by the seeder), so it deletes only demo plants (and their chores/tasks) and demo catalog entries — never real varieties Mindi has entered. `POST /api/clear-demo`.

## API surface

- `GET /api/catalog` — list catalog entries (feeds the picker).
- `POST /api/catalog` — create a variety. 400 on missing/empty name; 409 on duplicate `(name, COALESCE(variety,''))`.
- `PATCH /api/catalog/:id` — partial update of reference fields; 404 on missing.
- `POST /api/plants` — reworked to `{ gardynId, col, position, catalogId, plantedAt?, notes? }`. 400 on missing/invalid catalogId; 404 if catalog entry doesn't exist; 409 on occupied slot; slot validated against garden geometry.
- Plant read paths (`GET /api/plants`, and any per-plant reads) resolve name/variety + reference fields via the catalog join.
- The existing plant-update endpoint (1.5/1.6 `PUT /api/plants/:id`) **narrows to instance-only fields** — `planted_at` and `notes`. Name/variety/care/about/uses are no longer plant-editable; changing them is a variety edit via `PATCH /api/catalog/:id` (which is a variety-wide rename/update by design).
- Existing `DELETE /api/plants/:id` (archive) and `PATCH /api/plants/:id/position` (move/swap) from 1.6 are unchanged.

## Migration — fresh schema + reseed (no backfill)

Mindi has **no real data yet**; the only rows are the 6 demo fakes, and this repo's established norm is to reseed the local db cleanly. So rather than an ALTER-based column migration, Phase 1.7 defines the **new schema shape directly** and reseeds:

- The `plants` table is defined fresh: it **no longer has** `name`, `variety`, `care_instructions`, `about`, `uses` columns; it gains `catalog_id INTEGER` and a `demo INTEGER NOT NULL DEFAULT 0` flag. Identity + reference fields live on the new `catalog` table.
- `catalog` also carries a `demo` flag so the "clear demo data" action (§5) removes only seeded fakes, never real varieties.
- **Consequence:** an existing dev db from 1.6 has the old plants shape and must be reseeded once — `rm drip-dash.db*` then restart. This is the documented fallback and loses nothing (no real data). Production/Pi deploy has no data yet either.
- `seedFakePlants` seeds **catalog first** (6 demo entries from the current fakes: Basil/Genovese, Cherry Tomato/Red Robin, Lettuce/Butterhead, Thai Chili/·, Strawberry/Alpine, Rainbow Chard/·, all `demo=1`) then seeds the plant rows linked by `catalog_id` (also `demo=1`).
- `seedFakePlants` reworked to **seed catalog first** (6 entries from the current fakes: Basil/Genovese, Cherry Tomato/Red Robin, Lettuce/Butterhead, Thai Chili/·, Strawberry/Alpine, Rainbow Chard/·) then seed plants linked by `catalog_id`.

## Testing (TDD, matching repo rigor)

- **Catalog repo:** create; unique-collapse (two varietyless "Thai Chili" → conflict, distinct varieties of same name allowed); patch partial + 404.
- **Plant create with catalogId:** happy path sets catalog_id; 400 on missing catalogId; 404 on unknown catalog; 409 on occupied slot; geometry validation.
- **Read join:** GET /api/plants returns name/variety + reference fields resolved from catalog; a variety rename via PATCH reflects on its plants.
- **Seed + clear-demo:** seedFakePlants creates demo catalog + demo plants (`demo=1`); `POST /api/clear-demo` removes demo plants (+ their chores) and demo catalog only, leaving real varieties untouched.
- **Frontend:** tsc clean; picker renders catalog list, pick-existing vs add-new paths, "Edit variety details" opens editor and PATCH round-trips. (Repo leans backend-vitest; frontend gets a smoke pass consistent with 1.5/1.6.)

## Out of scope (later phases / threads)

- Pod stock counts, sources, auto-decrement, reorder (1.8).
- Inventory dashboard tab + the four per-variety stats (1.9).
- Gardyn scrape / importer (parallel recon spike; separate spec if it proves out).
- Nursery gardens, per-cell tracking, rotation, photos (v1+).
- Time-to-maturity powering "ready soon" hints — it's a reference note only this phase.

## Decisions log (Mindi, 2026-07-17)

1. Core purpose of the inventory feature overall: **both** a grow-log dashboard and a seed-pod stock manager, equally.
2. Inventory **unit = variety** (Genovese Basil ≠ Thai Basil); varietyless plants group by name alone.
3. Add-plant = **pick from catalog, or add new variety** (autofills reference fields on pick).
4. Zero/untracked stock when planting = **warn but allow**, floor count at 0 (applies in 1.8).
5. Stock restock (1.8) = **editable count with +/- steppers**.
6. Dashboard stats (1.9) = **all four**: alive-now + where, pods on hand, total-grown + harvested/died, typical lifespan.
7. Placement = **new Inventory tab**, keep the fake seed plants for now (with a clear-demo-data escape hatch).
8. Catalog fields = temp pref, care/about/uses, time-to-maturity, **+ freeform details/notes** (structured fields + freeform, per Q); extra structured fields (light/germination/difficulty) live in the freeform block, **not** their own columns.
9. Slicing = **three focused phases** (1.7 catalog → 1.8 stock → 1.9 dashboard), catalog-only first (not bundling stock into phase one).
10. Editing a variety's reference fields = **Decision B**: read-only in the plant modal with an explicit "Edit variety details" affordance (edits apply to the whole variety).
11. Gardyn scrape = **build manual 1.7 now, spike the scrape in parallel** (read-only, own credentials, timeboxed); importer feeds the same tables if it proves out.
