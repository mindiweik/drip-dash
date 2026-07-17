# Drip Dash Phase 1.7: variety catalog + pick-from-catalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a variety `catalog` (reference data entered once per variety) and rework add-plant into pick-from-catalog, with catalog-owned name/variety/care/about/uses resolved onto plants via join.

**Architecture:** New `catalog` table is the single source of truth for a variety's identity (name + variety) and reference fields (temp pref, time-to-maturity, care, about, uses, freeform details). `plants` lose those columns and gain `catalog_id`; plant read paths JOIN catalog so the API `Plant` shape is unchanged for the frontend. Add-plant picks an existing variety (autofill + link) or creates a new one. A `demo` flag on both tables lets a "clear demo data" action wipe only seeded fakes.

**Tech Stack:** Backend — Express 5 (ESM, `.js` import specifiers), better-sqlite3, vitest. Frontend — React 19 + Vite + Tailwind v4, vitest/tsc. Repo has no CI; verify locally.

## Global Constraints

- **ESM import specifiers use `.js`** even for `.ts` files (e.g. `import { getCatalog } from '../db/catalog.js'`). Match existing files.
- **No emdashes** anywhere in code, comments, or UI copy (project writing rule).
- **better-sqlite3 is synchronous** — no `await` on db calls; wrap multi-statement mutations in `db.transaction(() => { ... })()`.
- **Fresh schema, no ALTER migration.** Existing dev dbs are reseeded (`rm drip-dash.db*`). No real data exists.
- **snake_case DB columns, camelCase TS** — map explicitly in a `toX` function like the existing `toPlant`.
- Tests run from `backend/` with `npm test` (vitest). Frontend typecheck: `cd frontend && npx tsc --noEmit`.
- Commit after each task. No `Co-Authored-By` trailers.

---

## File Structure

**Backend:**
- `backend/src/db/database.ts` — MODIFY `SCHEMA`: add `catalog` table + unique identity index; redefine `plants` (drop name/variety/care/about/uses; add `catalog_id`, `demo`).
- `backend/src/db/catalog.ts` — CREATE: `Catalog` type, list/get/create/update, `CatalogExistsError`.
- `backend/src/db/catalog.test.ts` — CREATE.
- `backend/src/db/plants.ts` — MODIFY: `Plant` gains `catalogId`/`tempPref`/`timeToMaturity`/`details`; join-based reads; `createPlant(catalogId,...)`; `updatePlant` narrows to `plantedAt`/`notes`; `clearDemoData`; catalog-aware `seedFakePlants`; `CatalogMissingError`.
- `backend/src/db/plants.test.ts` — MODIFY.
- `backend/src/routes/garden.ts` — MODIFY: catalog routes, reworked `POST /plants`, narrowed `PUT /plants/:id`, `POST /clear-demo`.
- `backend/src/routes/garden.test.ts` — MODIFY.

**Frontend:**
- `frontend/src/api.ts` — MODIFY: `CatalogEntry` type + catalog fns; `Plant` gains new fields; reworked `createPlant`; narrowed `updatePlant`; `clearDemoData`.
- `frontend/src/components/AddPlantModal.tsx` — MODIFY: catalog picker + add-new-variety.
- `frontend/src/components/PlantModal.tsx` — MODIFY: reference fields read-only + "Edit variety details" affordance; save narrows.
- `frontend/src/components/EditVarietyModal.tsx` — CREATE: catalog-entry editor.
- `frontend/src/App.tsx` — MODIFY: load catalog, pass to AddPlantModal, "clear demo data" button.

---

## Task 1: Schema — catalog table + reshaped plants

**Files:**
- Modify: `backend/src/db/database.ts:5-55` (the `SCHEMA` template string)
- Test: `backend/src/db/database.test.ts`

**Interfaces:**
- Produces: `catalog` table (`id, name, variety, temp_pref, time_to_maturity, care_instructions, about, uses, details, demo, created_at`), unique index `idx_catalog_identity` on `(name, COALESCE(variety,''))`; `plants` table now `(id, gardyn_id, col, position, catalog_id, planted_at, notes, demo, removed_at, removed_reason)` with partial unique index `idx_plants_active_slot` unchanged.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/db/database.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getDb } from './database.js';

describe('schema: catalog', () => {
  it('has a catalog table with reference columns', () => {
    const db = getDb(':memory:catalog-schema');
    const cols = db.prepare(`PRAGMA table_info(catalog)`).all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'id', 'name', 'variety', 'temp_pref', 'time_to_maturity',
        'care_instructions', 'about', 'uses', 'details', 'demo', 'created_at',
      ]),
    );
  });

  it('plants table links to catalog and dropped the promoted columns', () => {
    const db = getDb(':memory:plants-schema');
    const cols = (db.prepare(`PRAGMA table_info(plants)`).all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['catalog_id', 'demo', 'planted_at', 'notes']));
    expect(cols).not.toContain('care_instructions');
    expect(cols).not.toContain('name');
    expect(cols).not.toContain('variety');
  });

  it('enforces one catalog entry per (name, variety) collapsing null variety', () => {
    const db = getDb(':memory:catalog-unique');
    const ins = db.prepare(
      `INSERT INTO catalog (name, variety, demo, created_at) VALUES (?, ?, 0, '2026-07-17')`,
    );
    ins.run('Thai Chili', null);
    expect(() => ins.run('Thai Chili', null)).toThrow();
    // different variety of same name is allowed
    expect(() => ins.run('Basil', 'Genovese')).not.toThrow();
    expect(() => ins.run('Basil', 'Thai')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/db/database.test.ts`
Expected: FAIL (no `catalog` table; `care_instructions` still on plants).

- [ ] **Step 3: Replace the SCHEMA string**

In `backend/src/db/database.ts`, replace the `plants` CREATE and index (lines ~38-54) and add the `catalog` table just before `plants`. The full new `SCHEMA` tail (from `gardens` onward stays; replace the `plants` block and add `catalog`):

```typescript
CREATE TABLE IF NOT EXISTS catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  variety TEXT,
  temp_pref TEXT,
  time_to_maturity TEXT,
  care_instructions TEXT,
  about TEXT,
  uses TEXT,
  details TEXT,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_identity
  ON catalog (name, COALESCE(variety, ''));
CREATE TABLE IF NOT EXISTS plants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gardyn_id TEXT NOT NULL,
  col INTEGER NOT NULL,
  position INTEGER NOT NULL,
  catalog_id INTEGER,
  planted_at TEXT,
  notes TEXT,
  demo INTEGER NOT NULL DEFAULT 0,
  removed_at TEXT,
  removed_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plants_active_slot
  ON plants (gardyn_id, col, position) WHERE removed_at IS NULL;
```

Leave `snapshots`, `care_schedules`, `gardens`, `chores` unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/db/database.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/db/database.ts src/db/database.test.ts
git commit -m "feat: catalog table + reshaped plants schema (phase 1.7)"
```

---

## Task 2: Catalog repository

**Files:**
- Create: `backend/src/db/catalog.ts`
- Test: `backend/src/db/catalog.test.ts`

**Interfaces:**
- Consumes: `getDb` from `./database.js`; `catalog` table from Task 1.
- Produces:
  - `interface Catalog { id: number; name: string; variety: string | null; tempPref: string | null; timeToMaturity: string | null; careInstructions: string | null; about: string | null; uses: string | null; details: string | null; }`
  - `class CatalogExistsError extends Error {}`
  - `interface CreateCatalogInput { name: string; variety?: string | null; tempPref?: string | null; timeToMaturity?: string | null; careInstructions?: string | null; about?: string | null; uses?: string | null; details?: string | null; demo?: boolean; }`
  - `interface CatalogPatch { name?: string; variety?: string | null; tempPref?: string | null; timeToMaturity?: string | null; careInstructions?: string | null; about?: string | null; uses?: string | null; details?: string | null; }`
  - `listCatalog(db): Catalog[]` (ORDER BY name, variety)
  - `getCatalog(db, id: number): Catalog | null`
  - `createCatalog(db, input: CreateCatalogInput, now: string): Catalog` — throws `CatalogExistsError` on duplicate identity
  - `updateCatalog(db, id: number, patch: CatalogPatch): boolean`

- [ ] **Step 1: Write the failing test**

Create `backend/src/db/catalog.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from './database.js';
import {
  listCatalog, getCatalog, createCatalog, updateCatalog, CatalogExistsError,
} from './catalog.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let n = 0;
beforeEach(() => {
  db = getDb(`:memory:catalog-repo-${n++}`);
});

describe('catalog repo', () => {
  it('creates and reads back a catalog entry', () => {
    const c = createCatalog(db, { name: 'Basil', variety: 'Genovese', tempPref: '65-75F' }, '2026-07-17');
    expect(c.id).toBeGreaterThan(0);
    expect(c.name).toBe('Basil');
    expect(c.variety).toBe('Genovese');
    expect(c.tempPref).toBe('65-75F');
    expect(getCatalog(db, c.id)?.name).toBe('Basil');
  });

  it('rejects a duplicate (name, variety) identity including null-variety collapse', () => {
    createCatalog(db, { name: 'Thai Chili' }, '2026-07-17');
    expect(() => createCatalog(db, { name: 'Thai Chili', variety: null }, '2026-07-17')).toThrow(CatalogExistsError);
    // same name, different variety is fine
    expect(() => createCatalog(db, { name: 'Basil', variety: 'Genovese' }, '2026-07-17')).not.toThrow();
    expect(() => createCatalog(db, { name: 'Basil', variety: 'Thai' }, '2026-07-17')).not.toThrow();
  });

  it('lists entries ordered by name then variety', () => {
    createCatalog(db, { name: 'Basil', variety: 'Thai' }, '2026-07-17');
    createCatalog(db, { name: 'Basil', variety: 'Genovese' }, '2026-07-17');
    createCatalog(db, { name: 'Arugula' }, '2026-07-17');
    expect(listCatalog(db).map((c) => `${c.name}/${c.variety ?? ''}`)).toEqual([
      'Arugula/', 'Basil/Genovese', 'Basil/Thai',
    ]);
  });

  it('partial-updates reference fields and returns false for missing id', () => {
    const c = createCatalog(db, { name: 'Lettuce' }, '2026-07-17');
    expect(updateCatalog(db, c.id, { tempPref: '55-65F', variety: 'Butterhead' })).toBe(true);
    const got = getCatalog(db, c.id)!;
    expect(got.tempPref).toBe('55-65F');
    expect(got.variety).toBe('Butterhead');
    expect(got.name).toBe('Lettuce'); // untouched
    expect(updateCatalog(db, 9999, { tempPref: 'x' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/db/catalog.test.ts`
Expected: FAIL ("Cannot find module './catalog.js'").

- [ ] **Step 3: Implement `backend/src/db/catalog.ts`**

```typescript
import type Database from 'better-sqlite3';

export interface Catalog {
  id: number;
  name: string;
  variety: string | null;
  tempPref: string | null;
  timeToMaturity: string | null;
  careInstructions: string | null;
  about: string | null;
  uses: string | null;
  details: string | null;
}

interface CatalogRow {
  id: number;
  name: string;
  variety: string | null;
  temp_pref: string | null;
  time_to_maturity: string | null;
  care_instructions: string | null;
  about: string | null;
  uses: string | null;
  details: string | null;
}

export class CatalogExistsError extends Error {}

function toCatalog(r: CatalogRow): Catalog {
  return {
    id: r.id,
    name: r.name,
    variety: r.variety,
    tempPref: r.temp_pref,
    timeToMaturity: r.time_to_maturity,
    careInstructions: r.care_instructions,
    about: r.about,
    uses: r.uses,
    details: r.details,
  };
}

const SELECT = `SELECT id, name, variety, temp_pref, time_to_maturity,
  care_instructions, about, uses, details FROM catalog`;

export function listCatalog(db: Database.Database): Catalog[] {
  const rows = db
    .prepare(`${SELECT} ORDER BY name COLLATE NOCASE, COALESCE(variety, '') COLLATE NOCASE`)
    .all() as CatalogRow[];
  return rows.map(toCatalog);
}

export function getCatalog(db: Database.Database, id: number): Catalog | null {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id) as CatalogRow | undefined;
  return row ? toCatalog(row) : null;
}

export interface CreateCatalogInput {
  name: string;
  variety?: string | null;
  tempPref?: string | null;
  timeToMaturity?: string | null;
  careInstructions?: string | null;
  about?: string | null;
  uses?: string | null;
  details?: string | null;
  demo?: boolean;
}

export function createCatalog(
  db: Database.Database,
  input: CreateCatalogInput,
  now: string,
): Catalog {
  try {
    const result = db
      .prepare(
        `INSERT INTO catalog
         (name, variety, temp_pref, time_to_maturity, care_instructions, about, uses, details, demo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name,
        input.variety ?? null,
        input.tempPref ?? null,
        input.timeToMaturity ?? null,
        input.careInstructions ?? null,
        input.about ?? null,
        input.uses ?? null,
        input.details ?? null,
        input.demo ? 1 : 0,
        now,
      );
    return getCatalog(db, Number(result.lastInsertRowid))!;
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      throw new CatalogExistsError(`catalog entry for ${input.name}/${input.variety ?? ''} exists`);
    }
    throw err;
  }
}

export interface CatalogPatch {
  name?: string;
  variety?: string | null;
  tempPref?: string | null;
  timeToMaturity?: string | null;
  careInstructions?: string | null;
  about?: string | null;
  uses?: string | null;
  details?: string | null;
}

export function updateCatalog(db: Database.Database, id: number, patch: CatalogPatch): boolean {
  const existing = getCatalog(db, id);
  if (!existing) return false;
  const merged = {
    name: patch.name !== undefined ? patch.name : existing.name,
    variety: patch.variety !== undefined ? patch.variety : existing.variety,
    tempPref: patch.tempPref !== undefined ? patch.tempPref : existing.tempPref,
    timeToMaturity: patch.timeToMaturity !== undefined ? patch.timeToMaturity : existing.timeToMaturity,
    careInstructions:
      patch.careInstructions !== undefined ? patch.careInstructions : existing.careInstructions,
    about: patch.about !== undefined ? patch.about : existing.about,
    uses: patch.uses !== undefined ? patch.uses : existing.uses,
    details: patch.details !== undefined ? patch.details : existing.details,
  };
  db.prepare(
    `UPDATE catalog SET name = ?, variety = ?, temp_pref = ?, time_to_maturity = ?,
     care_instructions = ?, about = ?, uses = ?, details = ? WHERE id = ?`,
  ).run(
    merged.name,
    merged.variety,
    merged.tempPref,
    merged.timeToMaturity,
    merged.careInstructions,
    merged.about,
    merged.uses,
    merged.details,
    id,
  );
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/db/catalog.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/db/catalog.ts src/db/catalog.test.ts
git commit -m "feat: catalog repository (create/list/get/update)"
```

---

## Task 3: Plants repo rework (join, catalog-linked create, narrowed update, seed, clear-demo)

**Files:**
- Modify: `backend/src/db/plants.ts` (whole file rewrite below)
- Test: `backend/src/db/plants.test.ts` (rewrite the create/update/seed tests; keep archive/move coverage)

**Interfaces:**
- Consumes: `listGardens` from `./gardens.js`; `createCatalog`, `getCatalog` from `./catalog.js`.
- Produces:
  - `Plant` interface: `{ id; gardynId; col; position; catalogId; name; variety; tempPref; timeToMaturity; careInstructions; about; uses; details; plantedAt; notes; removedAt; removedReason }` (name/variety/reference fields resolved from catalog join; all string|null except ids/slot numbers and `name: string`).
  - `class CatalogMissingError extends Error {}` (plus existing `SlotOccupiedError`, `InvalidSlotError`).
  - `interface CreatePlantInput { gardynId: string; col: number; position: number; catalogId: number; plantedAt?: string | null; notes?: string | null; demo?: boolean; }`
  - `createPlant(db, input): Plant` — throws `CatalogMissingError` | `InvalidSlotError` | `SlotOccupiedError`.
  - `interface PlantPatch { plantedAt?: string | null; notes?: string | null; }` and `updatePlant(db, id, patch): boolean`.
  - `archivePlant`, `movePlant` unchanged signatures.
  - `seedFakePlants(db): void` (now seeds catalog + plants, demo=1).
  - `clearDemoData(db): void`.

- [ ] **Step 1: Write the failing tests**

Rewrite `backend/src/db/plants.test.ts` create/update/seed sections. Replace the whole file with:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from './database.js';
import { seedDefaultGardens } from './gardens.js';
import { createCatalog } from './catalog.js';
import {
  listPlants, getPlant, createPlant, updatePlant, archivePlant, movePlant,
  seedFakePlants, clearDemoData, CatalogMissingError, SlotOccupiedError, InvalidSlotError,
} from './plants.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let n = 0;
beforeEach(() => {
  db = getDb(`:memory:plants-${n++}`);
  seedDefaultGardens(db);
});

function basil(demo = false): number {
  return createCatalog(db, { name: 'Basil', variety: 'Genovese', careInstructions: 'Trim weekly', demo }, '2026-07-17').id;
}

describe('createPlant', () => {
  it('creates a plant linked to a catalog entry and resolves reference fields via join', () => {
    const cid = basil();
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid, plantedAt: '2026-07-01' });
    expect(p.catalogId).toBe(cid);
    expect(p.name).toBe('Basil');
    expect(p.variety).toBe('Genovese');
    expect(p.careInstructions).toBe('Trim weekly');
    expect(p.plantedAt).toBe('2026-07-01');
    expect(getPlant(db, p.id)?.name).toBe('Basil');
  });

  it('reflects a catalog rename on existing plants', () => {
    const cid = basil();
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    db.prepare('UPDATE catalog SET name = ? WHERE id = ?').run('Sweet Basil', cid);
    expect(getPlant(db, p.id)?.name).toBe('Sweet Basil');
  });

  it('throws CatalogMissingError for an unknown catalogId', () => {
    expect(() => createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: 9999 })).toThrow(CatalogMissingError);
  });

  it('throws InvalidSlotError for out-of-geometry slots', () => {
    const cid = basil();
    expect(() => createPlant(db, { gardynId: 'gardyn-1', col: 4, position: 1, catalogId: cid })).toThrow(InvalidSlotError);
    expect(() => createPlant(db, { gardynId: 'nope', col: 1, position: 1, catalogId: cid })).toThrow(InvalidSlotError);
  });

  it('throws SlotOccupiedError when the active slot is taken', () => {
    const cid = basil();
    createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    expect(() => createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid })).toThrow(SlotOccupiedError);
  });
});

describe('updatePlant (instance fields only)', () => {
  it('updates plantedAt and notes, returns false for missing/archived', () => {
    const cid = basil();
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    expect(updatePlant(db, p.id, { plantedAt: '2026-06-01', notes: 'leggy' })).toBe(true);
    const got = getPlant(db, p.id)!;
    expect(got.plantedAt).toBe('2026-06-01');
    expect(got.notes).toBe('leggy');
    expect(updatePlant(db, 9999, { notes: 'x' })).toBe(false);
    archivePlant(db, p.id, 'harvested', '2026-07-10');
    expect(updatePlant(db, p.id, { notes: 'y' })).toBe(false);
  });
});

describe('listPlants', () => {
  it('returns only active plants with joined names', () => {
    const cid = basil();
    const a = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 2, catalogId: cid });
    archivePlant(db, a.id, 'died', '2026-07-10');
    const active = listPlants(db);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('Basil');
  });
});

describe('movePlant', () => {
  it('moves into an empty slot', () => {
    const cid = basil();
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    expect(movePlant(db, p.id, { gardynId: 'gardyn-2', col: 2, position: 3 })).toBe('moved');
    const got = getPlant(db, p.id)!;
    expect(got.gardynId).toBe('gardyn-2');
    expect(got.col).toBe(2);
    expect(got.position).toBe(3);
  });

  it('swaps two occupied plants', () => {
    const cid = basil();
    const a = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    const b = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 2, catalogId: cid });
    expect(movePlant(db, a.id, { gardynId: 'gardyn-1', col: 1, position: 2 })).toBe('swapped');
    expect(getPlant(db, a.id)!.position).toBe(2);
    expect(getPlant(db, b.id)!.position).toBe(1);
  });
});

describe('seedFakePlants + clearDemoData', () => {
  it('seeds demo catalog + plants once, and clear removes only demo rows', () => {
    seedFakePlants(db);
    const seeded = listPlants(db).length;
    expect(seeded).toBeGreaterThan(0);
    // idempotent
    seedFakePlants(db);
    expect(listPlants(db).length).toBe(seeded);

    // a real (non-demo) plant survives clearDemoData
    const realCid = createCatalog(db, { name: 'Cilantro' }, '2026-07-17').id;
    createPlant(db, { gardynId: 'gardyn-2', col: 3, position: 10, catalogId: realCid });

    clearDemoData(db);
    const remaining = listPlants(db);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('Cilantro');
    // demo catalog gone, real catalog kept
    const names = db.prepare('SELECT name FROM catalog').all() as { name: string }[];
    expect(names.map((r) => r.name)).toEqual(['Cilantro']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/db/plants.test.ts`
Expected: FAIL (signatures changed; `clearDemoData`/`CatalogMissingError` not exported).

- [ ] **Step 3: Rewrite `backend/src/db/plants.ts`**

```typescript
import type Database from 'better-sqlite3';
import { listGardens } from './gardens.js';
import { createCatalog, getCatalog } from './catalog.js';

export type RemoveReason = 'harvested' | 'died' | 'other';

export interface Plant {
  id: number;
  gardynId: string;
  col: number;
  position: number;
  catalogId: number;
  name: string;
  variety: string | null;
  tempPref: string | null;
  timeToMaturity: string | null;
  careInstructions: string | null;
  about: string | null;
  uses: string | null;
  details: string | null;
  plantedAt: string | null;
  notes: string | null;
  removedAt: string | null;
  removedReason: string | null;
}

interface PlantRow {
  id: number;
  gardyn_id: string;
  col: number;
  position: number;
  catalog_id: number;
  name: string;
  variety: string | null;
  temp_pref: string | null;
  time_to_maturity: string | null;
  care_instructions: string | null;
  about: string | null;
  uses: string | null;
  details: string | null;
  planted_at: string | null;
  notes: string | null;
  removed_at: string | null;
  removed_reason: string | null;
}

function toPlant(r: PlantRow): Plant {
  return {
    id: r.id,
    gardynId: r.gardyn_id,
    col: r.col,
    position: r.position,
    catalogId: r.catalog_id,
    name: r.name,
    variety: r.variety,
    tempPref: r.temp_pref,
    timeToMaturity: r.time_to_maturity,
    careInstructions: r.care_instructions,
    about: r.about,
    uses: r.uses,
    details: r.details,
    plantedAt: r.planted_at,
    notes: r.notes,
    removedAt: r.removed_at,
    removedReason: r.removed_reason,
  };
}

const SELECT = `SELECT p.id, p.gardyn_id, p.col, p.position, p.catalog_id,
  c.name, c.variety, c.temp_pref, c.time_to_maturity, c.care_instructions,
  c.about, c.uses, c.details,
  p.planted_at, p.notes, p.removed_at, p.removed_reason
  FROM plants p JOIN catalog c ON c.id = p.catalog_id`;

export function listPlants(db: Database.Database): Plant[] {
  const rows = db
    .prepare(`${SELECT} WHERE p.removed_at IS NULL ORDER BY p.gardyn_id, p.col, p.position`)
    .all() as PlantRow[];
  return rows.map(toPlant);
}

export function getPlant(db: Database.Database, id: number): Plant | null {
  const row = db.prepare(`${SELECT} WHERE p.id = ?`).get(id) as PlantRow | undefined;
  return row ? toPlant(row) : null;
}

export interface PlantPatch {
  plantedAt?: string | null;
  notes?: string | null;
}

export function updatePlant(db: Database.Database, id: number, patch: PlantPatch): boolean {
  const existing = getPlant(db, id);
  if (!existing || existing.removedAt) return false;
  const merged = {
    plantedAt: patch.plantedAt !== undefined ? patch.plantedAt : existing.plantedAt,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
  };
  db.prepare('UPDATE plants SET planted_at = ?, notes = ? WHERE id = ?').run(
    merged.plantedAt,
    merged.notes,
    id,
  );
  return true;
}

export class SlotOccupiedError extends Error {}
export class InvalidSlotError extends Error {}
export class CatalogMissingError extends Error {}

function validateSlot(db: Database.Database, gardynId: string, col: number, position: number): void {
  const garden = listGardens(db).find((g) => g.id === gardynId);
  if (!garden || col < 1 || col > garden.cols || position < 1 || position > garden.positionsPerCol) {
    throw new InvalidSlotError(`no slot (${col}, ${position}) in ${gardynId}`);
  }
}

function activePlantAt(
  db: Database.Database,
  gardynId: string,
  col: number,
  position: number,
): { id: number } | undefined {
  return db
    .prepare(
      'SELECT id FROM plants WHERE gardyn_id = ? AND col = ? AND position = ? AND removed_at IS NULL',
    )
    .get(gardynId, col, position) as { id: number } | undefined;
}

export interface CreatePlantInput {
  gardynId: string;
  col: number;
  position: number;
  catalogId: number;
  plantedAt?: string | null;
  notes?: string | null;
  demo?: boolean;
}

export function createPlant(db: Database.Database, input: CreatePlantInput): Plant {
  if (!getCatalog(db, input.catalogId)) {
    throw new CatalogMissingError(`no catalog entry ${input.catalogId}`);
  }
  validateSlot(db, input.gardynId, input.col, input.position);
  if (activePlantAt(db, input.gardynId, input.col, input.position)) {
    throw new SlotOccupiedError(
      `slot (${input.col}, ${input.position}) in ${input.gardynId} is occupied`,
    );
  }
  const result = db
    .prepare(
      `INSERT INTO plants (gardyn_id, col, position, catalog_id, planted_at, notes, demo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.gardynId,
      input.col,
      input.position,
      input.catalogId,
      input.plantedAt ?? null,
      input.notes ?? null,
      input.demo ? 1 : 0,
    );
  return getPlant(db, Number(result.lastInsertRowid))!;
}

export function archivePlant(
  db: Database.Database,
  id: number,
  reason: RemoveReason,
  now: string,
): boolean {
  const plant = getPlant(db, id);
  if (!plant || plant.removedAt) return false;
  db.transaction(() => {
    db.prepare('UPDATE plants SET removed_at = ?, removed_reason = ? WHERE id = ?').run(
      now,
      reason,
      id,
    );
    // Open tasks are no longer actionable; completed history stays for analytics.
    db.prepare('DELETE FROM chores WHERE plant_id = ? AND completed_at IS NULL').run(id);
  })();
  return true;
}

export function movePlant(
  db: Database.Database,
  id: number,
  target: { gardynId: string; col: number; position: number },
): 'moved' | 'swapped' | 'missing' | 'invalid' {
  const plant = getPlant(db, id);
  if (!plant || plant.removedAt) return 'missing';
  try {
    validateSlot(db, target.gardynId, target.col, target.position);
  } catch {
    return 'invalid';
  }
  if (
    plant.gardynId === target.gardynId &&
    plant.col === target.col &&
    plant.position === target.position
  ) {
    return 'invalid';
  }
  const occupant = activePlantAt(db, target.gardynId, target.col, target.position);
  const setSlot = db.prepare('UPDATE plants SET gardyn_id = ?, col = ?, position = ? WHERE id = ?');
  const followTasks = db.prepare(
    'UPDATE chores SET gardyn_id = ? WHERE plant_id = ? AND completed_at IS NULL',
  );
  db.transaction(() => {
    if (occupant) {
      // Swap dance: park the moving plant on a temp position so the two active rows
      // never collide under the partial unique index while they trade slots.
      setSlot.run(plant.gardynId, plant.col, -id, id);
      setSlot.run(plant.gardynId, plant.col, plant.position, occupant.id);
      setSlot.run(target.gardynId, target.col, target.position, id);
      followTasks.run(plant.gardynId, occupant.id);
    } else {
      setSlot.run(target.gardynId, target.col, target.position, id);
    }
    followTasks.run(target.gardynId, id);
  })();
  return occupant ? 'swapped' : 'moved';
}

// Demo catalog + plants so the kiosk shows real-looking data before real inventory.
const FAKE_CATALOG = [
  { name: 'Basil', variety: 'Genovese', careInstructions: 'Trim above a leaf pair weekly; pinch flower buds.', about: 'Sweet Italian basil, fast grower under lights.', uses: 'Pesto, caprese, tomato sauces.' },
  { name: 'Cherry Tomato', variety: 'Red Robin', careInstructions: 'Hand-pollinate open flowers; support heavy trusses.', about: null, uses: null },
  { name: 'Lettuce', variety: 'Butterhead', careInstructions: null, about: null, uses: 'Salads; harvest outer leaves first.' },
  { name: 'Thai Chili', variety: null, careInstructions: null, about: 'Compact, very productive, quite hot.', uses: null },
  { name: 'Strawberry', variety: 'Alpine', careInstructions: null, about: null, uses: null },
  { name: 'Rainbow Chard', variety: null, careInstructions: null, about: null, uses: null },
];

const FAKE_PLACEMENTS: { catalogIndex: number; gardynId: string; col: number; position: number; plantedAt: string }[] = [
  { catalogIndex: 0, gardynId: 'gardyn-1', col: 1, position: 2, plantedAt: '2026-06-20' },
  { catalogIndex: 1, gardynId: 'gardyn-1', col: 2, position: 5, plantedAt: '2026-06-01' },
  { catalogIndex: 2, gardynId: 'gardyn-1', col: 3, position: 8, plantedAt: '2026-06-25' },
  { catalogIndex: 3, gardynId: 'gardyn-2', col: 1, position: 4, plantedAt: '2026-05-15' },
  { catalogIndex: 4, gardynId: 'gardyn-2', col: 2, position: 1, plantedAt: '2026-05-30' },
  { catalogIndex: 5, gardynId: 'gardyn-2', col: 3, position: 6, plantedAt: '2026-06-10' },
];

export function seedFakePlants(db: Database.Database): void {
  const existing = db.prepare('SELECT COUNT(*) as n FROM plants').get() as { n: number };
  if (existing.n > 0) return;
  const now = '2026-07-17T00:00:00.000Z';
  const ids = FAKE_CATALOG.map((c) => createCatalog(db, { ...c, demo: true }, now).id);
  for (const p of FAKE_PLACEMENTS) {
    createPlant(db, {
      gardynId: p.gardynId,
      col: p.col,
      position: p.position,
      catalogId: ids[p.catalogIndex],
      plantedAt: p.plantedAt,
      demo: true,
    });
  }
}

export function clearDemoData(db: Database.Database): void {
  db.transaction(() => {
    db.prepare(
      'DELETE FROM chores WHERE plant_id IN (SELECT id FROM plants WHERE demo = 1)',
    ).run();
    db.prepare('DELETE FROM plants WHERE demo = 1').run();
    db.prepare('DELETE FROM catalog WHERE demo = 1').run();
  })();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/db/plants.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/db/plants.ts src/db/plants.test.ts
git commit -m "feat: catalog-linked plants (join reads, catalogId create, demo seed + clear)"
```

---

## Task 4: Routes — catalog endpoints, reworked POST /plants, narrowed PUT, clear-demo

**Files:**
- Modify: `backend/src/routes/garden.ts`
- Test: `backend/src/routes/garden.test.ts`

**Interfaces:**
- Consumes: catalog + plants repos from Tasks 2-3.
- Produces HTTP: `GET /api/catalog`, `POST /api/catalog`, `PATCH /api/catalog/:id`, reworked `POST /api/plants` (body `{ gardynId, col, position, catalogId, plantedAt?, notes? }`), narrowed `PUT /api/plants/:id` (body `{ plantedAt?, notes? }`), `POST /api/clear-demo`.

- [ ] **Step 1: Write the failing tests**

This file uses a local `appWith(dbKey)` helper (returns `{ app, db }`, one fresh db per test) plus `seedDefaultGardens(db)`. Reuse it exactly. Add `import { seedFakePlants } from '../db/plants.js';` at the top alongside existing imports. Append this describe block:

```typescript
describe('catalog + catalog-linked plant routes', () => {
  let key = 0;
  const fresh = () => {
    const ctx = appWith(`:memory:catalog-routes-${key++}`);
    seedDefaultGardens(ctx.db);
    return ctx;
  };

  it('POST /api/catalog creates an entry, 409 on duplicate, 400 on empty name', async () => {
    const { app } = fresh();
    const ok = await request(app).post('/api/catalog').send({ name: 'Basil', variety: 'Genovese' });
    expect(ok.status).toBe(200);
    expect(ok.body.catalog.name).toBe('Basil');

    const dup = await request(app).post('/api/catalog').send({ name: 'Basil', variety: 'Genovese' });
    expect(dup.status).toBe(409);

    const bad = await request(app).post('/api/catalog').send({ name: '' });
    expect(bad.status).toBe(400);
  });

  it('GET /api/catalog lists entries', async () => {
    const { app } = fresh();
    await request(app).post('/api/catalog').send({ name: 'Mint' });
    const res = await request(app).get('/api/catalog');
    expect(res.status).toBe(200);
    expect(res.body.catalog.map((c: { name: string }) => c.name)).toContain('Mint');
  });

  it('PATCH /api/catalog/:id updates reference fields, 404 for missing', async () => {
    const { app } = fresh();
    const c = await request(app).post('/api/catalog').send({ name: 'Sage' });
    const id = c.body.catalog.id;
    const upd = await request(app).patch(`/api/catalog/${id}`).send({ tempPref: '60-70F' });
    expect(upd.status).toBe(200);
    const miss = await request(app).patch('/api/catalog/9999').send({ tempPref: 'x' });
    expect(miss.status).toBe(404);
  });

  it('POST /api/plants takes catalogId; 400 missing, 404 unknown, 409 occupied', async () => {
    const { app } = fresh();
    const c = await request(app).post('/api/catalog').send({ name: 'Dill' });
    const catalogId = c.body.catalog.id;

    const missing = await request(app).post('/api/plants').send({ gardynId: 'gardyn-1', col: 1, position: 1 });
    expect(missing.status).toBe(400);

    const unknown = await request(app).post('/api/plants').send({ gardynId: 'gardyn-1', col: 1, position: 1, catalogId: 9999 });
    expect(unknown.status).toBe(404);

    const ok = await request(app).post('/api/plants').send({ gardynId: 'gardyn-1', col: 1, position: 1, catalogId });
    expect(ok.status).toBe(200);
    expect(ok.body.plant.name).toBe('Dill');

    const occupied = await request(app).post('/api/plants').send({ gardynId: 'gardyn-1', col: 1, position: 1, catalogId });
    expect(occupied.status).toBe(409);
  });

  it('PUT /api/plants/:id updates only plantedAt/notes', async () => {
    const { app } = fresh();
    const c = await request(app).post('/api/catalog').send({ name: 'Chive' });
    const plant = await request(app).post('/api/plants').send({ gardynId: 'gardyn-1', col: 2, position: 2, catalogId: c.body.catalog.id });
    const id = plant.body.plant.id;
    const upd = await request(app).put(`/api/plants/${id}`).send({ notes: 'thriving', plantedAt: '2026-06-15' });
    expect(upd.status).toBe(200);
    const plants = await request(app).get('/api/plants');
    const got = plants.body.plants.find((p: { id: number }) => p.id === id);
    expect(got.notes).toBe('thriving');
  });

  it('POST /api/clear-demo removes seeded demo rows but keeps real ones', async () => {
    const { app, db } = fresh();
    seedFakePlants(db);
    const real = await request(app).post('/api/catalog').send({ name: 'Cilantro' });
    await request(app).post('/api/plants').send({ gardynId: 'gardyn-2', col: 3, position: 10, catalogId: real.body.catalog.id });

    const res = await request(app).post('/api/clear-demo');
    expect(res.status).toBe(200);
    const plants = await request(app).get('/api/plants');
    expect(plants.body.plants).toHaveLength(1);
    expect(plants.body.plants[0].name).toBe('Cilantro');
  });
});
```

Note: `appWith` builds `makeGardenRouter(db, () => new Date('2026-07-06T12:10:00.000Z'))`. The `Plant` API response has no `demo` field (it is internal), so the clear-demo test asserts by surviving count/name, not a `demo` flag. If any pre-existing test in this file created a plant with `name`/`careInstructions` in the POST body, update it to first POST a catalog entry and pass `catalogId` (those old-shape calls will now 400).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/routes/garden.test.ts`
Expected: FAIL (routes not defined; old POST /plants tests using `name` now 400).

- [ ] **Step 3: Update `backend/src/routes/garden.ts`**

Add imports at top:

```typescript
import { listCatalog, getCatalog, createCatalog, updateCatalog, CatalogExistsError } from '../db/catalog.js';
import { listPlants, updatePlant, createPlant, archivePlant, movePlant, clearDemoData, SlotOccupiedError, InvalidSlotError, CatalogMissingError } from '../db/plants.js';
```

(remove the old `createPlant`/`updatePlant` import line's obsolete members are covered by the line above; delete the previous `import { listPlants, updatePlant, createPlant, archivePlant, movePlant, SlotOccupiedError, InvalidSlotError } ...` line).

Replace the `PUT /plants/:id` handler (lines ~64-75) with:

```typescript
  router.put('/plants/:id', (req, res) => {
    const { plantedAt, notes } = req.body ?? {};
    const ok = updatePlant(db, Number(req.params.id), { plantedAt, notes });
    if (!ok) return res.status(404).json({ ok: false });
    res.json({ ok: true });
  });
```

Replace the `POST /plants` handler (lines ~109-120) with:

```typescript
  router.post('/plants', (req, res) => {
    const { gardynId, col, position, catalogId, plantedAt, notes } = req.body ?? {};
    if (catalogId === undefined || catalogId === null || typeof catalogId !== 'number') {
      return res.status(400).json({ error: 'catalogId required' });
    }
    try {
      const plant = createPlant(db, { gardynId, col, position, catalogId, plantedAt, notes });
      res.json({ plant });
    } catch (err) {
      if (err instanceof CatalogMissingError) return res.status(404).json({ error: 'catalog entry not found' });
      if (err instanceof SlotOccupiedError) return res.status(409).json({ error: 'slot occupied' });
      if (err instanceof InvalidSlotError) return res.status(400).json({ error: 'invalid slot' });
      throw err;
    }
  });
```

Add catalog + clear-demo routes (place near the plant routes, before `return router;`):

```typescript
  router.get('/catalog', (_req, res) => {
    res.json({ catalog: listCatalog(db) });
  });

  router.post('/catalog', (req, res) => {
    const { name, variety, tempPref, timeToMaturity, careInstructions, about, uses, details } = req.body ?? {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
    try {
      const catalog = createCatalog(
        db,
        { name, variety, tempPref, timeToMaturity, careInstructions, about, uses, details },
        now().toISOString(),
      );
      res.json({ catalog });
    } catch (err) {
      if (err instanceof CatalogExistsError) return res.status(409).json({ error: 'variety already exists' });
      throw err;
    }
  });

  router.patch('/catalog/:id', (req, res) => {
    const { name, variety, tempPref, timeToMaturity, careInstructions, about, uses, details } = req.body ?? {};
    if (name !== undefined && (name === null || name === '')) {
      return res.status(400).json({ error: 'name cannot be empty' });
    }
    const ok = updateCatalog(db, Number(req.params.id), {
      name, variety, tempPref, timeToMaturity, careInstructions, about, uses, details,
    });
    if (!ok) return res.status(404).json({ ok: false });
    res.json({ ok: true });
  });

  router.post('/clear-demo', (_req, res) => {
    clearDemoData(db);
    res.json({ ok: true });
  });
```

Also: the unused `getCatalog` import can be dropped if not referenced; keep imports lint-clean (remove any now-unused symbol).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/routes/garden.test.ts`
Expected: PASS. Then full backend suite: `cd backend && npm test` — expect all green.

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/routes/garden.ts src/routes/garden.test.ts
git commit -m "feat: catalog routes + catalog-linked POST /plants + clear-demo"
```

---

## Task 5: API client — catalog types + reworked plant calls

**Files:**
- Modify: `frontend/src/api.ts`

**Interfaces:**
- Produces (frontend):
  - `interface CatalogEntry { id: number; name: string; variety: string | null; tempPref: string | null; timeToMaturity: string | null; careInstructions: string | null; about: string | null; uses: string | null; details: string | null; }`
  - `Plant` gains `catalogId: number; tempPref: string | null; timeToMaturity: string | null; details: string | null;` (keeps existing name/variety/care/about/uses).
  - `fetchCatalog(): Promise<CatalogEntry[]>`
  - `createCatalogEntry(input): Promise<CatalogEntry>`
  - `updateCatalogEntry(id, patch): Promise<void>`
  - `createPlant(input: { gardynId; col; position; catalogId; plantedAt?; notes? }): Promise<Plant>`
  - `updatePlant(id, patch: { plantedAt?; notes? }): Promise<void>`
  - `clearDemoData(): Promise<void>`

- [ ] **Step 1: Update the `Plant` interface**

In `frontend/src/api.ts`, replace the `Plant` interface (lines ~36-50) with:

```typescript
export interface Plant {
  id: number;
  gardynId: string;
  col: number;
  position: number;
  catalogId: number;
  name: string;
  variety: string | null;
  tempPref: string | null;
  timeToMaturity: string | null;
  careInstructions: string | null;
  about: string | null;
  uses: string | null;
  details: string | null;
  plantedAt: string | null;
  notes: string | null;
  removedAt: string | null;
  removedReason: string | null;
}

export interface CatalogEntry {
  id: number;
  name: string;
  variety: string | null;
  tempPref: string | null;
  timeToMaturity: string | null;
  careInstructions: string | null;
  about: string | null;
  uses: string | null;
  details: string | null;
}
```

- [ ] **Step 2: Replace `createPlant` and `updatePlant`, add catalog + clear-demo functions**

Replace `updatePlant` (lines ~105-112) and `createPlant` (lines ~114-121) with:

```typescript
export async function updatePlant(
  id: number,
  patch: Partial<Pick<Plant, 'plantedAt' | 'notes'>>,
): Promise<void> {
  await sendJson(`/api/plants/${id}`, 'PUT', patch);
}

export async function createPlant(input: {
  gardynId: string; col: number; position: number; catalogId: number;
  plantedAt?: string | null; notes?: string | null;
}): Promise<Plant> {
  const body = await sendJson<{ plant: Plant }>('/api/plants', 'POST', input);
  return body.plant;
}

export async function fetchCatalog(): Promise<CatalogEntry[]> {
  const body = await getJson<{ catalog: CatalogEntry[] }>('/api/catalog');
  return body.catalog;
}

export async function createCatalogEntry(input: {
  name: string; variety?: string | null; tempPref?: string | null;
  timeToMaturity?: string | null; careInstructions?: string | null;
  about?: string | null; uses?: string | null; details?: string | null;
}): Promise<CatalogEntry> {
  const body = await sendJson<{ catalog: CatalogEntry }>('/api/catalog', 'POST', input);
  return body.catalog;
}

export async function updateCatalogEntry(
  id: number,
  patch: Partial<Omit<CatalogEntry, 'id'>>,
): Promise<void> {
  await sendJson(`/api/catalog/${id}`, 'PATCH', patch);
}

export async function clearDemoData(): Promise<void> {
  await sendJson('/api/clear-demo', 'POST');
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors ONLY in `AddPlantModal.tsx` / `PlantModal.tsx` (they still pass the old fields) — those are fixed in Tasks 6-7. If errors appear elsewhere, fix them here.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/api.ts
git commit -m "feat: catalog api client + catalogId-based createPlant + narrowed updatePlant"
```

---

## Task 6: AddPlantModal — pick from catalog or add new variety

**Files:**
- Modify: `frontend/src/components/AddPlantModal.tsx` (full rewrite below)

**Interfaces:**
- Consumes: `createPlant`, `createCatalogEntry`, `fetchCatalog`, `CatalogEntry` from `../api`.
- Props gain `catalog: CatalogEntry[]` and `onCatalogChanged: () => void` (App refetches catalog after add-new).

- [ ] **Step 1: Rewrite the component**

Replace `frontend/src/components/AddPlantModal.tsx` entirely:

```typescript
import { useState } from 'react';
import { createPlant, createCatalogEntry } from '../api';
import type { CatalogEntry } from '../api';

function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AddPlantModal({
  gardenId,
  gardenName,
  col,
  position,
  catalog,
  onClose,
  onAdded,
  onCatalogChanged,
}: {
  gardenId: string;
  gardenName: string;
  col: number;
  position: number;
  catalog: CatalogEntry[];
  onClose: () => void;
  onAdded: () => void;
  onCatalogChanged: () => void;
}) {
  const [mode, setMode] = useState<'pick' | 'new'>(catalog.length > 0 ? 'pick' : 'new');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [plantedAt, setPlantedAt] = useState(todayLocalDate());
  const [notes, setNotes] = useState('');
  // new-variety fields
  const [name, setName] = useState('');
  const [variety, setVariety] = useState('');
  const [tempPref, setTempPref] = useState('');
  const [timeToMaturity, setTimeToMaturity] = useState('');
  const [careInstructions, setCareInstructions] = useState('');
  const [about, setAbout] = useState('');
  const [uses, setUses] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selected = catalog.find((c) => c.id === selectedId) ?? null;
  const filtered = catalog.filter((c) =>
    `${c.name} ${c.variety ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const placeAt = async (catalogId: number) => {
    await createPlant({
      gardynId: gardenId,
      col,
      position,
      catalogId,
      plantedAt: plantedAt || null,
      notes: notes || null,
    });
    onAdded();
    onClose();
  };

  const submitPick = async () => {
    if (selectedId === null) {
      setError('Pick a variety first');
      return;
    }
    try {
      setError(null);
      await placeAt(selectedId);
    } catch (err) {
      console.error('add plant failed:', err);
      setError('That did not save, try again');
    }
  };

  const submitNew = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    try {
      setError(null);
      const entry = await createCatalogEntry({
        name: name.trim(),
        variety: variety || null,
        tempPref: tempPref || null,
        timeToMaturity: timeToMaturity || null,
        careInstructions: careInstructions || null,
        about: about || null,
        uses: uses || null,
        details: details || null,
      });
      onCatalogChanged();
      await placeAt(entry.id);
    } catch (err) {
      console.error('add variety failed:', err);
      setError('That did not save. That variety may already exist, try picking it.');
    }
  };

  const textInput = 'mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 text-slate-100';

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-2xl font-bold">Add a plant</h2>
          <button onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-1 hover:bg-slate-700">
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          {gardenName}, column {col}, position {position}
        </p>
        {error && <p className="mt-2 text-sm text-amber-500">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => { setMode('pick'); setError(null); }}
            className={`rounded-lg px-3 py-1 text-sm ${mode === 'pick' ? 'bg-emerald-700' : 'bg-slate-800 hover:bg-slate-700'}`}
            disabled={catalog.length === 0}
          >
            Pick a variety
          </button>
          <button
            onClick={() => { setMode('new'); setError(null); }}
            className={`rounded-lg px-3 py-1 text-sm ${mode === 'new' ? 'bg-emerald-700' : 'bg-slate-800 hover:bg-slate-700'}`}
          >
            + Add new variety
          </button>
        </div>

        {mode === 'pick' ? (
          <div className="mt-4 space-y-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search varieties..."
              className={textInput}
              autoFocus
            />
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {filtered.length === 0 && <p className="text-sm text-slate-500">No matches.</p>}
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                    selectedId === c.id ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  {c.name}{c.variety ? ` — ${c.variety}` : ''}
                </button>
              ))}
            </div>
            {selected && (
              <div className="rounded-xl bg-slate-800/60 p-3 text-xs text-slate-400">
                {selected.tempPref && <p>Temp: {selected.tempPref}</p>}
                {selected.timeToMaturity && <p>Maturity: {selected.timeToMaturity}</p>}
                {selected.careInstructions && <p>Care: {selected.careInstructions}</p>}
                {selected.uses && <p>Uses: {selected.uses}</p>}
              </div>
            )}
            <label className="block text-sm text-slate-400">
              Planted on
              <input type="date" value={plantedAt} onChange={(e) => setPlantedAt(e.target.value)} className={textInput} />
            </label>
            <label className="block text-sm text-slate-400">
              Notes for this plant
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={textInput} />
            </label>
            <button onClick={submitPick} className="rounded-lg bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600">
              Add plant
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <label className="block text-sm text-slate-400">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} className={textInput} autoFocus />
            </label>
            <label className="block text-sm text-slate-400">
              Variety
              <input value={variety} onChange={(e) => setVariety(e.target.value)} className={textInput} />
            </label>
            <label className="block text-sm text-slate-400">
              Temp preference
              <input value={tempPref} onChange={(e) => setTempPref(e.target.value)} placeholder="e.g. 65-75F" className={textInput} />
            </label>
            <label className="block text-sm text-slate-400">
              Time to maturity
              <input value={timeToMaturity} onChange={(e) => setTimeToMaturity(e.target.value)} placeholder="e.g. ~60 days" className={textInput} />
            </label>
            <label className="block text-sm text-slate-400">
              Care instructions
              <textarea value={careInstructions} onChange={(e) => setCareInstructions(e.target.value)} rows={2} className={textInput} />
            </label>
            <label className="block text-sm text-slate-400">
              About
              <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={2} className={textInput} />
            </label>
            <label className="block text-sm text-slate-400">
              Uses
              <textarea value={uses} onChange={(e) => setUses(e.target.value)} rows={2} className={textInput} />
            </label>
            <label className="block text-sm text-slate-400">
              Details (light, germination, difficulty, anything else)
              <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} className={textInput} />
            </label>
            <label className="block text-sm text-slate-400">
              Planted on
              <input type="date" value={plantedAt} onChange={(e) => setPlantedAt(e.target.value)} className={textInput} />
            </label>
            <label className="block text-sm text-slate-400">
              Notes for this plant
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={textInput} />
            </label>
            <button onClick={submitNew} className="rounded-lg bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600">
              Add variety and plant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: remaining errors only in `PlantModal.tsx` and `App.tsx` (fixed in Tasks 7-8).

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/AddPlantModal.tsx
git commit -m "feat: AddPlantModal pick-from-catalog or add-new-variety"
```

---

## Task 7: PlantModal — read-only reference fields + Edit variety affordance

**Files:**
- Create: `frontend/src/components/EditVarietyModal.tsx`
- Modify: `frontend/src/components/PlantModal.tsx`

**Interfaces:**
- `EditVarietyModal` props: `{ plant: Plant; onClose: () => void; onSaved: () => void; }` — edits the plant's catalog entry via `updateCatalogEntry(plant.catalogId, patch)`.
- `PlantModal`: `saveDetails` now only sends `{ plantedAt, notes }`; name/variety/care/about/uses/temp/maturity/details render read-only; a "Edit variety details" button opens `EditVarietyModal`.

- [ ] **Step 1: Create `EditVarietyModal.tsx`**

```typescript
import { useState } from 'react';
import { updateCatalogEntry } from '../api';
import type { Plant } from '../api';

export default function EditVarietyModal({
  plant,
  onClose,
  onSaved,
}: {
  plant: Plant;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(plant.name);
  const [variety, setVariety] = useState(plant.variety ?? '');
  const [tempPref, setTempPref] = useState(plant.tempPref ?? '');
  const [timeToMaturity, setTimeToMaturity] = useState(plant.timeToMaturity ?? '');
  const [careInstructions, setCareInstructions] = useState(plant.careInstructions ?? '');
  const [about, setAbout] = useState(plant.about ?? '');
  const [uses, setUses] = useState(plant.uses ?? '');
  const [details, setDetails] = useState(plant.details ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    try {
      setError(null);
      await updateCatalogEntry(plant.catalogId, {
        name: name.trim(),
        variety: variety || null,
        tempPref: tempPref || null,
        timeToMaturity: timeToMaturity || null,
        careInstructions: careInstructions || null,
        about: about || null,
        uses: uses || null,
        details: details || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error('edit variety failed:', err);
      setError('That did not save, try again');
    }
  };

  const textInput = 'mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 text-slate-100';

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-bold">Edit variety details</h2>
          <button onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-1 hover:bg-slate-700">
            Close
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Applies to every plant of this variety.</p>
        {error && <p className="mt-2 text-sm text-amber-500">{error}</p>}
        <div className="mt-4 space-y-2">
          <label className="block text-sm text-slate-400">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            Variety
            <input value={variety} onChange={(e) => setVariety(e.target.value)} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            Temp preference
            <input value={tempPref} onChange={(e) => setTempPref(e.target.value)} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            Time to maturity
            <input value={timeToMaturity} onChange={(e) => setTimeToMaturity(e.target.value)} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            Care instructions
            <textarea value={careInstructions} onChange={(e) => setCareInstructions(e.target.value)} rows={2} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            About
            <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={2} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            Uses
            <textarea value={uses} onChange={(e) => setUses(e.target.value)} rows={2} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            Details
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} className={textInput} />
          </label>
          <button onClick={save} className="rounded-lg bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600">
            Save variety
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `PlantModal.tsx`**

Add the import near the top (after the KIND_STYLES import):

```typescript
import EditVarietyModal from './EditVarietyModal';
```

Remove the now-invalid state for catalog-owned fields. Delete these lines (~31-37):

```typescript
  const [name, setName] = useState(plant.name);
  const [variety, setVariety] = useState(plant.variety ?? '');
  const [careInstructions, setCareInstructions] = useState(plant.careInstructions ?? '');
  const [about, setAbout] = useState(plant.about ?? '');
  const [uses, setUses] = useState(plant.uses ?? '');
```

Keep `plantedAt` and `notes` state. Add:

```typescript
  const [editingVariety, setEditingVariety] = useState(false);
```

Replace `saveDetails` (~71-82) with:

```typescript
  const saveDetails = () =>
    run(() =>
      updatePlant(plant.id, {
        plantedAt: plantedAt || null,
        notes: notes || null,
      }),
    );
```

Replace the details form block (the `<div className="mt-4 space-y-2">` containing Name/Variety/Care/About/Uses inputs, ~120-152) with a read-only reference panel + editable instance fields:

```typescript
        <div className="mt-4 space-y-2">
          <div className="rounded-xl bg-slate-800/60 p-3 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-100">
                {plant.name}{plant.variety ? ` — ${plant.variety}` : ''}
              </span>
              <button
                onClick={() => setEditingVariety(true)}
                className="rounded-lg bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
              >
                Edit variety details
              </button>
            </div>
            {plant.tempPref && <p className="mt-1 text-xs text-slate-400">Temp: {plant.tempPref}</p>}
            {plant.timeToMaturity && <p className="text-xs text-slate-400">Maturity: {plant.timeToMaturity}</p>}
            {plant.careInstructions && <p className="mt-1 text-xs text-slate-400">Care: {plant.careInstructions}</p>}
            {plant.about && <p className="text-xs text-slate-400">About: {plant.about}</p>}
            {plant.uses && <p className="text-xs text-slate-400">Uses: {plant.uses}</p>}
            {plant.details && <p className="text-xs text-slate-400">Details: {plant.details}</p>}
          </div>
          <label className="block text-sm text-slate-400">
            Planted on
            <input type="date" value={plantedAt} onChange={(e) => setPlantedAt(e.target.value)} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            Notes for this plant
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={textInput} />
          </label>
          <button onClick={saveDetails} className="rounded-lg bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600">
            Save details
          </button>
        </div>
```

At the end of the component, render the edit-variety modal. Just before the final closing `</div>` of the outer modal wrapper (after the Remove section `</div>`, ~308), add:

```typescript
        {editingVariety && (
          <EditVarietyModal
            plant={plant}
            onClose={() => setEditingVariety(false)}
            onSaved={onChanged}
          />
        )}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: remaining errors only in `App.tsx` (AddPlantModal now needs `catalog`/`onCatalogChanged` props) — fixed in Task 8.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/components/PlantModal.tsx src/components/EditVarietyModal.tsx
git commit -m "feat: read-only variety panel + Edit variety details affordance"
```

---

## Task 8: App wiring — load catalog, pass to AddPlantModal, clear-demo button; final verify

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `fetchCatalog`, `clearDemoData`, `CatalogEntry` from `./api`; reworked `AddPlantModal`. App has a single `load` useCallback (App.tsx:23-36) that `Promise.all`s status/chores/plants; catalog folds into it, and `load` is the single refresh used everywhere.

- [ ] **Step 1: Extend imports + the `load` callback**

Update the api import (App.tsx:2) to add `fetchCatalog` and `clearDemoData`:

```typescript
import { fetchStatus, fetchChores, fetchPlants, fetchCatalog, clearDemoData, completeChore, uncompleteChore } from './api';
```

Add `CatalogEntry` to the type import from `./api` (wherever `Plant`/`Chore` types are imported). Add state after the plants state (App.tsx:16):

```typescript
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
```

Fold catalog into the existing `load` (App.tsx:23-36) by adding `fetchCatalog()` to the `Promise.all` and setting it:

```typescript
  const load = useCallback(async () => {
    try {
      const [g, c, p, cat] = await Promise.all([fetchStatus(), fetchChores(), fetchPlants(), fetchCatalog()]);
      setGardens(g);
      setChores(c.chores);
      setDoneToday(c.doneToday);
      setPlants(p);
      setCatalog(cat);
      setSelectedPlant((cur) => (cur ? p.find((x) => x.id === cur.id) ?? null : null));
      setDegraded(false);
    } catch (err) {
      console.error('refresh failed:', err);
      setDegraded(true);
    }
  }, []);
```

- [ ] **Step 2: Pass new props to AddPlantModal**

At the `<AddPlantModal ... />` render site (App.tsx:130-137), add `catalog` and `onCatalogChanged` (existing `onAdded={() => void load()}` stays):

```typescript
        <AddPlantModal
          gardenId={garden.gardynId}
          gardenName={garden.name}
          col={addTarget.col}
          position={addTarget.position}
          catalog={catalog}
          onClose={() => setAddTarget(null)}
          onAdded={() => void load()}
          onCatalogChanged={() => void load()}
        />
```

- [ ] **Step 3: Add a "Clear demo data" control**

In the bottom `<nav>` controls area (App.tsx:140+) or the top header, add a small button. It calls clear then `load()`:

```typescript
          <button
            onClick={async () => {
              if (!window.confirm('Remove the demo plants and demo varieties? Your own entries are kept.')) return;
              try {
                await clearDemoData();
                await load();
              } catch (err) {
                console.error('clear demo failed:', err);
              }
            }}
            className="rounded-lg bg-slate-800 px-3 py-1 text-xs text-slate-400 hover:bg-slate-700"
          >
            Clear demo data
          </button>
```

- [ ] **Step 4: Typecheck + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: PASS (0 errors).

- [ ] **Step 5: Full backend suite + backend build**

Run: `cd backend && npm test && npm run build`
Expected: all tests green; `tsc -b` clean.

- [ ] **Step 6: Live smoke test**

Reseed (schema changed): `rm -f backend/drip-dash.db backend/drip-dash.db-shm backend/drip-dash.db-wal`
Start the app (hand to Mindi — she runs it): `npm run dev` from repo root (or the documented start command). Verify in the kiosk:
1. A garden page shows the 6 demo plants (names resolve).
2. Tap an empty slot → picker lists demo varieties; picking one + Add places it.
3. Add-new-variety creates a catalog entry and places the plant.
4. Open a plant → reference panel is read-only; "Edit variety details" opens the editor; saving a temp pref reflects on the plant.
5. "Clear demo data" empties the demo plants + varieties; a real entry survives.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/App.tsx
git commit -m "feat: App loads catalog, wires AddPlantModal + clear-demo control"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Catalog table + identity/reference fields → Task 1, 2. ✓
- Plants link + care/about/uses promotion + join reads → Task 1, 3. ✓
- Pick-from-catalog / add-new add flow → Task 6. ✓
- Editing reference fields (Decision B affordance) → Task 7. ✓
- Clear demo data (demo flag) → Task 1 (column), 3 (clearDemoData + seed), 4 (route), 8 (button). ✓
- API surface (GET/POST/PATCH catalog; reworked POST plants; narrowed PUT; clear-demo) → Task 4, 5. ✓
- Fresh-schema-reseed migration → Task 1 + Task 8 Step 7 reseed. ✓
- Testing (catalog repo, plant create w/ catalogId, read join, seed+clear) → Tasks 2, 3, 4. ✓

**Type consistency:** `Catalog`/`CatalogEntry` fields identical across backend (Task 2) and frontend (Task 5). `Plant` gains `catalogId/tempPref/timeToMaturity/details` in both `plants.ts` (Task 3) and `api.ts` (Task 5). `createPlant` takes `catalogId` in repo (Task 3), route (Task 4), client (Task 5), AddPlantModal (Task 6). `updatePlant` narrowed to `{plantedAt, notes}` in all three layers. `clearDemoData` (repo) vs `clearDemoData` (client) vs `POST /api/clear-demo` (route) consistent. ✓

**Placeholder scan:** No TBD/TODO. App.tsx steps (Task 8) reference "the existing reload function" because App.tsx wasn't read in full during planning — Step 1 explicitly instructs reading it first; this is a read-then-wire instruction, not a code placeholder. ✓
