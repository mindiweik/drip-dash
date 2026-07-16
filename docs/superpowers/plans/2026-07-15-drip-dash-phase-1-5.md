# Drip Dash Phase 1.5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Note:** the code blocks in this plan are a reference implementation, not a verbatim mandate. Deviate wherever it makes the code cleaner or more editable long-term, as long as behavior, interfaces, and test coverage hold. Review against behavior and interfaces, not plan-text match.

> **Working agreement:** this project is nuanced and personal. When implementation surfaces a genuinely new design/UX/domain question the spec's decisions log does not answer, report it back rather than assuming (see `feedback_drip_dash_ask_questions.md`). The spec's "Decisions log" answers eight already-settled questions; do not relitigate them.

**Goal:** Named gardens, tabbed kiosk (Gardyn pages with back/next + ToDo tab with filter chips), column-aware plant grid with tap-to-open plant modal (rich fields), editable per-plant tasks, seeded fake plants, and completed-chore undo, per the Phase 1.5 spec.

**Architecture:** A `gardens` table replaces hardcoded garden ids and carries display names + column geometry. Plants get `(col, position)` (position 1 = top of column) plus rich TEXT fields (care instructions, about, uses). Per-plant tasks are chores rows with `plant_id`, `kind`, and optional `due_at`; the ToDo tab shows due items, the plant modal manages the full list. The frontend becomes a two-tab app: Gardyn tab (one garden per screen, status card + pill grid + legend, back/next) and ToDo tab (chips + board + done-today undo).

**Tech Stack:** unchanged from Phase 1 — Express 5 + TypeScript ESM + better-sqlite3 + Vitest backend; React 19 + Vite + Tailwind v4 frontend.

**Spec:** `docs/superpowers/specs/2026-07-15-drip-dash-phase-1-5-design.md` (includes the eight-entry decisions log from Mindi, 2026-07-15)

## Global Constraints

- Repo: `~/dev/educational-repos/drip-dash`, branch `feat/phase-1-5` off `main`. Phase 1 is merged; this is a fresh branch.
- ESM everywhere; relative backend imports use `.js` extensions.
- No emdashes in any prose, comments, or UI copy. Sentence casing for UI copy.
- No Co-Authored-By trailers. Commit author email `57885108+mindiweik@users.noreply.github.com` (repo-local config already set).
- TDD for all backend logic: failing test first. Test runner Vitest; fresh in-memory DBs via unique `:memory:<suffix>` keys.
- Dev DB is disposable: schema changes edit CREATE TABLE directly, no migrations. `rm drip-dash.db*` + restart re-seeds.
- Garden display names are exactly: `gardyn-1` = "Weik & Wander", `gardyn-2` = "Mystical Menagerie".
- Stable ids `gardyn-1`/`gardyn-2` remain the internal keys everywhere; only display changes.
- Position 1 = the TOP slot of a physical column; grids render position 1 first (top).
- The `GardynDataSource` adapter seam is untouched.
- Frontend has no unit test runner; frontend tasks verify via `npx tsc -b` + `npm run build` + smoke boot.
- Do not auto-launch the app for the user; hand over run commands.

---

### Task 1: Schema v2 + gardens repo

Add the `gardens` table, convert plants to `(col, position)` with rich fields, extend chores with `plant_id`/`kind`/`due_at`, and build the gardens repository with seeding.

**Files:**
- Modify: `backend/src/db/database.ts` (SCHEMA constant)
- Create: `backend/src/db/gardens.ts`
- Test: `backend/src/db/gardens.test.ts`

**Interfaces:**
- Produces:
  - `interface Garden { id: string; name: string; type: 'gardyn' | 'nursery'; cols: number; positionsPerCol: number }`
  - `listGardens(db): Garden[]` (ordered by id)
  - `seedDefaultGardens(db): void` (idempotent, count-guarded)
  - Tables: `gardens(id, name, type, cols, positions_per_col)`; `plants` now has `col`, `position` (replacing `slot`), `care_instructions`, `about`, `uses`, with `UNIQUE(gardyn_id, col, position)`; `chores` gains `plant_id INTEGER`, `kind TEXT`, `due_at TEXT`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/db/gardens.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getDb } from './database.js';
import { listGardens, seedDefaultGardens } from './gardens.js';

describe('gardens', () => {
  it('seeds both gardyns with display names, idempotently', () => {
    const db = getDb(':memory:gardens-1');
    seedDefaultGardens(db);
    seedDefaultGardens(db);
    const gardens = listGardens(db);
    expect(gardens).toHaveLength(2);
    expect(gardens[0]).toEqual({
      id: 'gardyn-1',
      name: 'Weik & Wander',
      type: 'gardyn',
      cols: 3,
      positionsPerCol: 10,
    });
    expect(gardens[1].name).toBe('Mystical Menagerie');
  });

  it('plants table enforces one plant per (gardyn, col, position) and stores rich fields', () => {
    const db = getDb(':memory:gardens-2');
    const insert = db.prepare(
      'INSERT INTO plants (gardyn_id, col, position, name, care_instructions, about, uses) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    insert.run('gardyn-1', 1, 2, 'Basil', 'Trim weekly', 'Sweet Italian herb', 'Pesto, caprese');
    expect(() => insert.run('gardyn-1', 1, 2, 'Tomato', null, null, null)).toThrow();
    const row: any = db.prepare('SELECT * FROM plants').get();
    expect(row.care_instructions).toBe('Trim weekly');
  });

  it('chores table accepts plant_id, kind, and due_at', () => {
    const db = getDb(':memory:gardens-3');
    db.prepare('INSERT INTO plants (gardyn_id, col, position, name) VALUES (?, ?, ?, ?)').run(
      'gardyn-1', 1, 1, 'Basil',
    );
    db.prepare(
      "INSERT INTO chores (gardyn_id, plant_id, title, source, kind, due_at, created_at) VALUES ('gardyn-1', 1, 'Trim basil', 'plant', 'trim', '2026-08-01T00:00:00.000Z', '2026-07-15T00:00:00.000Z')",
    ).run();
    const row: any = db.prepare('SELECT * FROM chores WHERE plant_id = 1').get();
    expect(row.kind).toBe('trim');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/db/gardens.test.ts`
Expected: FAIL (module `./gardens.js` not found).

- [ ] **Step 3: Update the schema**

In `backend/src/db/database.ts`, replace the `plants` and `chores` CREATE TABLEs and add `gardens`, inside the existing SCHEMA string:
```sql
CREATE TABLE IF NOT EXISTS gardens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'gardyn',
  cols INTEGER NOT NULL,
  positions_per_col INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gardyn_id TEXT,
  plant_id INTEGER,
  schedule_id INTEGER,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT,
  due_at TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS plants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gardyn_id TEXT NOT NULL,
  col INTEGER NOT NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  variety TEXT,
  planted_at TEXT,
  notes TEXT,
  care_instructions TEXT,
  about TEXT,
  uses TEXT,
  UNIQUE(gardyn_id, col, position)
);
```
Keep `snapshots` and `care_schedules` exactly as they are. Preserve the existing `schedule_id` column on chores (added in Phase 1).

- [ ] **Step 4: Write the gardens repo**

Create `backend/src/db/gardens.ts`:
```typescript
import type Database from 'better-sqlite3';

export interface Garden {
  id: string;
  name: string;
  type: 'gardyn' | 'nursery';
  cols: number;
  positionsPerCol: number;
}

interface GardenRow {
  id: string;
  name: string;
  type: string;
  cols: number;
  positions_per_col: number;
}

export function listGardens(db: Database.Database): Garden[] {
  const rows = db.prepare('SELECT * FROM gardens ORDER BY id').all() as GardenRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type as Garden['type'],
    cols: r.cols,
    positionsPerCol: r.positions_per_col,
  }));
}

export function seedDefaultGardens(db: Database.Database): void {
  const existing = db.prepare('SELECT COUNT(*) as n FROM gardens').get() as { n: number };
  if (existing.n > 0) return;
  const insert = db.prepare(
    'INSERT INTO gardens (id, name, type, cols, positions_per_col) VALUES (?, ?, ?, ?, ?)',
  );
  insert.run('gardyn-1', 'Weik & Wander', 'gardyn', 3, 10);
  insert.run('gardyn-2', 'Mystical Menagerie', 'gardyn', 3, 10);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run src/db/gardens.test.ts`
Expected: PASS (3 tests). Then run the whole suite (`npm test`) — the Phase 1 route test that inserts a chore by explicit column list still passes because all new columns are nullable.

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/
git commit -m "feat: gardens table, plant (col, position) + rich fields, chores plant_id/kind/due_at"
```

---

### Task 2: Wire gardens through chores, poller, and status route

Replace every hardcoded `GARDYN_IDS` constant with reads from the gardens table; `GET /api/status` gains the display name.

**Files:**
- Modify: `backend/src/care/chores.ts` (computeChores garden loop)
- Modify: `backend/src/care/seed.ts` (seedDefaultSchedules iterates gardens table)
- Modify: `backend/src/poller/poller.ts` (default ids from gardens table)
- Modify: `backend/src/routes/garden.ts` (status includes name)
- Modify: `backend/src/index.ts` (seed order: gardens first)
- Test: extend `backend/src/routes/garden.test.ts`, `backend/src/care/chores.test.ts`

**Interfaces:**
- Consumes: `listGardens`, `seedDefaultGardens` from Task 1.
- Produces: `GET /api/status` items become `{ gardynId, name, snapshot, ageMinutes, stale }`. `pollOnce(db, source, now, gardynIds?)` unchanged signature; when `gardynIds` omitted it reads the gardens table. `computeChores(db, now)` unchanged signature; iterates gardens from the table. `seedDefaultSchedules(db)` now requires gardens to be seeded first.

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/routes/garden.test.ts` (inside the existing describe, using the existing `appWith` helper):
```typescript
it('GET /api/status includes garden display names', async () => {
  const { app, db } = appWith(':memory:routes-names');
  seedDefaultGardens(db);
  const res = await request(app).get('/api/status');
  const names = res.body.gardens.map((g: any) => g.name);
  expect(names).toEqual(['Weik & Wander', 'Mystical Menagerie']);
});
```
Add the import: `import { seedDefaultGardens } from '../db/gardens.js';`

Append to `backend/src/care/chores.test.ts`:
```typescript
it('computeChores covers every garden in the gardens table', () => {
  const db = freshDb();
  seedDefaultGardens(db);
  db.prepare('INSERT INTO gardens (id, name, type, cols, positions_per_col) VALUES (?, ?, ?, ?, ?)')
    .run('gardyn-3', 'Test Garden', 'gardyn', 3, 10);
  insertSnapshot(db, snap({ gardynId: 'gardyn-3', waterLevelPct: 10 }));
  computeChores(db, '2026-07-15T12:00:00.000Z');
  expect(getOpenChores(db).some((c) => c.gardynId === 'gardyn-3')).toBe(true);
});
```
Add the import: `import { seedDefaultGardens } from '../db/gardens.js';`

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/routes/garden.test.ts src/care/chores.test.ts`
Expected: the two new tests FAIL (no `name` in status; gardyn-3 not visited).

- [ ] **Step 3: Replace the constants**

In `backend/src/care/chores.ts`: delete `const GARDYN_IDS = [...]`; in `computeChores`, replace the loop source:
```typescript
import { listGardens } from '../db/gardens.js';
// ...
for (const garden of listGardens(db)) {
  const snap = getLatestSnapshot(db, garden.id);
  if (snap && snap.waterLevelPct < WATER_LOW_THRESHOLD) {
    insertChore(db, garden.id, `Top up water + plant food (${garden.id})`, 'data-trigger', now);
  }
}
```

In `backend/src/care/seed.ts`: delete its local `GARDYN_IDS`; iterate `listGardens(db)` instead:
```typescript
import { listGardens } from '../db/gardens.js';
// inside seedDefaultSchedules, after the count guard:
for (const garden of listGardens(db)) {
  for (const schedule of DEFAULT_SCHEDULES) {
    insert.run(garden.id, schedule.name, schedule.everyDays);
  }
}
```

In `backend/src/poller/poller.ts`: delete `DEFAULT_IDS`; resolve at call time:
```typescript
import { listGardens } from '../db/gardens.js';

export async function pollOnce(
  db: Database.Database,
  source: GardynDataSource,
  now: string,
  gardynIds?: string[],
): Promise<void> {
  const ids = gardynIds ?? listGardens(db).map((g) => g.id);
  for (const gardynId of ids) {
    // ... unchanged body
  }
  computeChores(db, now);
}
```

In `backend/src/routes/garden.ts`: replace the local `GARDYN_IDS` with `listGardens(db)` and include the name:
```typescript
import { listGardens } from '../db/gardens.js';
// in GET /status:
const gardens = listGardens(db).map((garden) => {
  const snapshot = getLatestSnapshot(db, garden.id);
  // ... unchanged age/stale math ...
  return { gardynId: garden.id, name: garden.name, snapshot, ageMinutes, stale };
});
```

In `backend/src/index.ts`, inside `startServer()`, seed gardens before schedules:
```typescript
import { seedDefaultGardens } from './db/gardens.js';
// ...
const db = getDb();
seedDefaultGardens(db);
seedDefaultSchedules(db);
```

- [ ] **Step 4: Fix any Phase 1 tests that relied on implicit ids**

The poller tests pass explicit `['gardyn-1', 'gardyn-2']` arrays, so they are unaffected. Any chores test that relied on `computeChores` visiting gardyn-1 without gardens seeded now needs `seedDefaultGardens(db)` after `freshDb()` — update those tests accordingly (the water-trigger and dedupe tests).

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/
git commit -m "feat: gardens table drives chores, poller, and named status"
```

---

### Task 3: Plants repo + fake plant seeding

Typed plants access with camelCase mapping (replacing raw-row passthrough) and idempotent fake-plant seeding, including rich-field sample text.

**Files:**
- Create: `backend/src/db/plants.ts`
- Test: `backend/src/db/plants.test.ts`
- Modify: `backend/src/index.ts` (call seedFakePlants)

**Interfaces:**
- Produces:
  - `interface Plant { id: number; gardynId: string; col: number; position: number; name: string; variety: string | null; plantedAt: string | null; notes: string | null; careInstructions: string | null; about: string | null; uses: string | null }`
  - `listPlants(db): Plant[]` (ordered gardyn_id, col, position)
  - `getPlant(db, id): Plant | null`
  - `updatePlant(db, id, patch): boolean` — patch keys: name, variety, plantedAt, notes, careInstructions, about, uses; merge semantics: undefined = keep, null = clear (name may not be cleared)
  - `seedFakePlants(db): void` (idempotent count guard; 1-2 plants per column, both gardens, rich text on some)

- [ ] **Step 1: Write the failing test**

Create `backend/src/db/plants.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getDb } from './database.js';
import { seedDefaultGardens } from './gardens.js';
import { listPlants, getPlant, updatePlant, seedFakePlants } from './plants.js';

describe('plants repo', () => {
  it('seeds fake plants across both gardens and all columns, idempotently, with rich text somewhere', () => {
    const db = getDb(':memory:plants-1');
    seedDefaultGardens(db);
    seedFakePlants(db);
    seedFakePlants(db);
    const plants = listPlants(db);
    const gardens = new Set(plants.map((p) => p.gardynId));
    expect(gardens).toEqual(new Set(['gardyn-1', 'gardyn-2']));
    for (const g of ['gardyn-1', 'gardyn-2']) {
      const cols = new Set(plants.filter((p) => p.gardynId === g).map((p) => p.col));
      expect(cols).toEqual(new Set([1, 2, 3]));
    }
    expect(plants.some((p) => p.careInstructions !== null)).toBe(true);
  });

  it('updatePlant merges: undefined keeps, null clears, missing id returns false', () => {
    const db = getDb(':memory:plants-2');
    db.prepare(
      "INSERT INTO plants (gardyn_id, col, position, name, variety, notes, about) VALUES ('gardyn-1', 1, 1, 'Basil', 'Genovese', 'old note', 'herb')",
    ).run();
    const before = listPlants(db)[0];
    expect(updatePlant(db, before.id, { notes: 'new note', variety: null, careInstructions: 'Trim weekly' })).toBe(true);
    const after = getPlant(db, before.id)!;
    expect(after.name).toBe('Basil');
    expect(after.variety).toBeNull();
    expect(after.notes).toBe('new note');
    expect(after.about).toBe('herb');
    expect(after.careInstructions).toBe('Trim weekly');
    expect(updatePlant(db, 9999, { notes: 'x' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/db/plants.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the plants repo**

Create `backend/src/db/plants.ts`:
```typescript
import type Database from 'better-sqlite3';

export interface Plant {
  id: number;
  gardynId: string;
  col: number;
  position: number;
  name: string;
  variety: string | null;
  plantedAt: string | null;
  notes: string | null;
  careInstructions: string | null;
  about: string | null;
  uses: string | null;
}

interface PlantRow {
  id: number;
  gardyn_id: string;
  col: number;
  position: number;
  name: string;
  variety: string | null;
  planted_at: string | null;
  notes: string | null;
  care_instructions: string | null;
  about: string | null;
  uses: string | null;
}

function toPlant(r: PlantRow): Plant {
  return {
    id: r.id,
    gardynId: r.gardyn_id,
    col: r.col,
    position: r.position,
    name: r.name,
    variety: r.variety,
    plantedAt: r.planted_at,
    notes: r.notes,
    careInstructions: r.care_instructions,
    about: r.about,
    uses: r.uses,
  };
}

export function listPlants(db: Database.Database): Plant[] {
  const rows = db
    .prepare('SELECT * FROM plants ORDER BY gardyn_id, col, position')
    .all() as PlantRow[];
  return rows.map(toPlant);
}

export function getPlant(db: Database.Database, id: number): Plant | null {
  const row = db.prepare('SELECT * FROM plants WHERE id = ?').get(id) as PlantRow | undefined;
  return row ? toPlant(row) : null;
}

export interface PlantPatch {
  name?: string;
  variety?: string | null;
  plantedAt?: string | null;
  notes?: string | null;
  careInstructions?: string | null;
  about?: string | null;
  uses?: string | null;
}

export function updatePlant(db: Database.Database, id: number, patch: PlantPatch): boolean {
  const existing = getPlant(db, id);
  if (!existing) return false;
  const merged = {
    name: patch.name !== undefined ? patch.name : existing.name,
    variety: patch.variety !== undefined ? patch.variety : existing.variety,
    plantedAt: patch.plantedAt !== undefined ? patch.plantedAt : existing.plantedAt,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    careInstructions:
      patch.careInstructions !== undefined ? patch.careInstructions : existing.careInstructions,
    about: patch.about !== undefined ? patch.about : existing.about,
    uses: patch.uses !== undefined ? patch.uses : existing.uses,
  };
  db.prepare(
    `UPDATE plants SET name = ?, variety = ?, planted_at = ?, notes = ?,
     care_instructions = ?, about = ?, uses = ? WHERE id = ?`,
  ).run(
    merged.name,
    merged.variety,
    merged.plantedAt,
    merged.notes,
    merged.careInstructions,
    merged.about,
    merged.uses,
    id,
  );
  return true;
}

// Fake plants so the kiosk demos with real-looking data before v1 real inventory.
const FAKE_PLANTS = [
  {
    gardynId: 'gardyn-1', col: 1, position: 2, name: 'Basil', variety: 'Genovese', plantedAt: '2026-06-20',
    careInstructions: 'Trim above a leaf pair weekly; pinch flower buds.', about: 'Sweet Italian basil, fast grower under lights.', uses: 'Pesto, caprese, tomato sauces.',
  },
  { gardynId: 'gardyn-1', col: 2, position: 5, name: 'Cherry Tomato', variety: 'Red Robin', plantedAt: '2026-06-01', careInstructions: 'Hand-pollinate open flowers; support heavy trusses.', about: null, uses: null },
  { gardynId: 'gardyn-1', col: 3, position: 8, name: 'Lettuce', variety: 'Butterhead', plantedAt: '2026-06-25', careInstructions: null, about: null, uses: 'Salads; harvest outer leaves first.' },
  { gardynId: 'gardyn-2', col: 1, position: 4, name: 'Thai Chili', variety: null, plantedAt: '2026-05-15', careInstructions: null, about: 'Compact, very productive, quite hot.', uses: null },
  { gardynId: 'gardyn-2', col: 2, position: 1, name: 'Strawberry', variety: 'Alpine', plantedAt: '2026-05-30', careInstructions: null, about: null, uses: null },
  { gardynId: 'gardyn-2', col: 3, position: 6, name: 'Rainbow Chard', variety: null, plantedAt: '2026-06-10', careInstructions: null, about: null, uses: null },
];

export function seedFakePlants(db: Database.Database): void {
  const existing = db.prepare('SELECT COUNT(*) as n FROM plants').get() as { n: number };
  if (existing.n > 0) return;
  const insert = db.prepare(
    `INSERT INTO plants (gardyn_id, col, position, name, variety, planted_at, care_instructions, about, uses)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const p of FAKE_PLANTS) {
    insert.run(p.gardynId, p.col, p.position, p.name, p.variety, p.plantedAt, p.careInstructions, p.about, p.uses);
  }
}
```

- [ ] **Step 4: Wire seeding into startup**

In `backend/src/index.ts` `startServer()`, after `seedDefaultSchedules(db)`:
```typescript
import { seedFakePlants } from './db/plants.js';
// ...
seedFakePlants(db);
```

- [ ] **Step 5: Run tests, then commit**

Run: `cd backend && npx vitest run src/db/plants.test.ts && npm test`
Expected: PASS.

```bash
git add backend/src/db/plants.ts backend/src/db/plants.test.ts backend/src/index.ts
git commit -m "feat: plants repo with camelCase mapping, rich fields, fake plant seed"
```

---

### Task 4: Per-plant tasks + chores due-filter + uncomplete

The logic core of this phase. Plant tasks live in the chores table with `source = 'plant'`. The board query gains a due filter; completion gets an undo.

**Files:**
- Create: `backend/src/care/plantTasks.ts`
- Modify: `backend/src/care/chores.ts` (Chore interface, getOpenChores due filter + plant join, uncompleteChore, getChoresCompletedSince)
- Test: `backend/src/care/plantTasks.test.ts`, extend `backend/src/care/chores.test.ts`

**Interfaces:**
- Consumes: `getPlant` from Task 3.
- Produces:
  - `type TaskKind = 'pollinate' | 'roots' | 'trim' | 'harvest' | 'other'`
  - `interface PlantTask { id: number; plantId: number; title: string; kind: TaskKind; dueAt: string | null; createdAt: string; completedAt: string | null }`
  - `getPlantTasks(db, plantId): PlantTask[]` (open only, due-now first then by dueAt)
  - `createPlantTask(db, plantId, input: { title: string; kind: TaskKind; dueAt?: string | null }, now: string): PlantTask` (throws if plant missing)
  - `updatePlantTask(db, id, patch: { title?: string; kind?: TaskKind; dueAt?: string | null }): boolean`
  - `deletePlantTask(db, id): boolean`
  - `seedFakePlantTasks(db, now: string): void` (idempotent; every kind represented somewhere, at least one future-dated)
  - `Chore` gains `plantId: number | null`, `plantName: string | null`, `kind: string | null`, `dueAt: string | null`; `source` union gains `'plant'`
  - `getOpenChores(db, now?: string): Chore[]` — with `now`, rows with `due_at > now` are excluded (future plant tasks stay off the board); without `now`, all open rows return (back-compat)
  - `uncompleteChore(db, id): void` — clears `completed_at`; schedule-sourced chores also clear the schedule's `last_done_at`
  - `getChoresCompletedSince(db, sinceIso): Chore[]` (completed_at >= since, newest first)

- [ ] **Step 1: Write the failing tests**

Create `backend/src/care/plantTasks.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getDb } from '../db/database.js';
import { seedDefaultGardens } from '../db/gardens.js';
import {
  getPlantTasks,
  createPlantTask,
  updatePlantTask,
  deletePlantTask,
} from './plantTasks.js';
import { getOpenChores, completeChore, uncompleteChore } from './chores.js';

let n = 0;
function dbWithPlant() {
  const db = getDb(`:memory:ptask-${n++}`);
  seedDefaultGardens(db);
  db.prepare(
    "INSERT INTO plants (gardyn_id, col, position, name) VALUES ('gardyn-1', 1, 1, 'Basil')",
  ).run();
  const plant: any = db.prepare('SELECT id FROM plants').get();
  return { db, plantId: plant.id as number };
}

const NOW = '2026-07-15T12:00:00.000Z';

describe('plant tasks', () => {
  it('creates, lists, edits, and deletes a plant task', () => {
    const { db, plantId } = dbWithPlant();
    const task = createPlantTask(db, plantId, { title: 'Trim leggy stems', kind: 'trim' }, NOW);
    expect(getPlantTasks(db, plantId)).toHaveLength(1);
    expect(updatePlantTask(db, task.id, { kind: 'harvest', dueAt: '2026-08-01T00:00:00.000Z' })).toBe(true);
    const updated = getPlantTasks(db, plantId)[0];
    expect(updated.kind).toBe('harvest');
    expect(updated.dueAt).toBe('2026-08-01T00:00:00.000Z');
    expect(deletePlantTask(db, task.id)).toBe(true);
    expect(getPlantTasks(db, plantId)).toHaveLength(0);
  });

  it('due-now tasks reach the board, future ones do not', () => {
    const { db, plantId } = dbWithPlant();
    createPlantTask(db, plantId, { title: 'Pollinate flowers', kind: 'pollinate' }, NOW);
    createPlantTask(
      db, plantId,
      { title: 'Harvest', kind: 'harvest', dueAt: '2026-09-01T00:00:00.000Z' },
      NOW,
    );
    const board = getOpenChores(db, NOW);
    expect(board.some((c) => c.title === 'Pollinate flowers' && c.plantName === 'Basil')).toBe(true);
    expect(board.some((c) => c.title === 'Harvest')).toBe(false);
    expect(getPlantTasks(db, plantId)).toHaveLength(2);
  });

  it('completing a plant task does not touch care schedules; uncomplete reopens it', () => {
    const { db, plantId } = dbWithPlant();
    const task = createPlantTask(db, plantId, { title: 'Check roots', kind: 'roots' }, NOW);
    completeChore(db, task.id, NOW);
    expect(getPlantTasks(db, plantId)).toHaveLength(0);
    uncompleteChore(db, task.id);
    expect(getPlantTasks(db, plantId)).toHaveLength(1);
  });

  it('rejects tasks for a missing plant', () => {
    const { db } = dbWithPlant();
    expect(() => createPlantTask(db, 9999, { title: 'x', kind: 'other' }, NOW)).toThrow();
  });
});
```

Append to `backend/src/care/chores.test.ts`:
```typescript
it('uncompleting a schedule chore clears the schedule last_done_at', () => {
  const db = freshDb();
  seedDefaultGardens(db);
  db.prepare(
    'INSERT INTO care_schedules (gardyn_id, name, every_days, last_done_at) VALUES (?, ?, ?, ?)',
  ).run('gardyn-1', 'Tank clean', 56, '2026-05-01T12:00:00.000Z');
  computeChores(db, '2026-07-15T12:00:00.000Z');
  const chore = getOpenChores(db).find((c) => c.title.includes('Tank clean'))!;
  completeChore(db, chore.id, '2026-07-15T13:00:00.000Z');
  uncompleteChore(db, chore.id);
  expect(getOpenChores(db).some((c) => c.id === chore.id)).toBe(true);
  const sched: any = db.prepare('SELECT last_done_at FROM care_schedules').get();
  expect(sched.last_done_at).toBeNull();
});

it('getChoresCompletedSince returns todays completions newest first', () => {
  const db = freshDb();
  seedDefaultGardens(db);
  insertSnapshot(db, snap({ waterLevelPct: 10 }));
  computeChores(db, '2026-07-15T12:00:00.000Z');
  const chore = getOpenChores(db)[0];
  completeChore(db, chore.id, '2026-07-15T14:00:00.000Z');
  const done = getChoresCompletedSince(db, '2026-07-15T00:00:00.000Z');
  expect(done).toHaveLength(1);
  expect(done[0].id).toBe(chore.id);
  expect(getChoresCompletedSince(db, '2026-07-16T00:00:00.000Z')).toHaveLength(0);
});
```
Add imports for `uncompleteChore`, `getChoresCompletedSince`, `seedDefaultGardens` where needed.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/care/plantTasks.test.ts src/care/chores.test.ts`
Expected: FAIL (modules/functions not found).

- [ ] **Step 3: Extend chores.ts**

In `backend/src/care/chores.ts`:

Update the interface and row mapping:
```typescript
export interface Chore {
  id: number;
  gardynId: string | null;
  title: string;
  source: 'schedule' | 'data-trigger' | 'plant';
  createdAt: string;
  completedAt: string | null;
  scheduleId?: number | null;
  plantId: number | null;
  plantName: string | null;
  kind: string | null;
  dueAt: string | null;
}
```
`toChore` maps the new columns (`plant_id`, `kind`, `due_at`) and `plant_name` from the join below.

Replace `getOpenChores`:
```typescript
export function getOpenChores(db: Database.Database, now?: string): Chore[] {
  const dueFilter = now ? 'AND (c.due_at IS NULL OR c.due_at <= ?)' : '';
  const stmt = db.prepare(
    `SELECT c.*, p.name AS plant_name FROM chores c
     LEFT JOIN plants p ON p.id = c.plant_id
     WHERE c.completed_at IS NULL ${dueFilter}
     ORDER BY c.created_at ASC`,
  );
  const rows = (now ? stmt.all(now) : stmt.all()) as ChoreRow[];
  return rows.map(toChore);
}
```

Add:
```typescript
export function uncompleteChore(db: Database.Database, id: number): void {
  const chore: any = db.prepare('SELECT * FROM chores WHERE id = ?').get(id);
  if (!chore) return;
  db.prepare('UPDATE chores SET completed_at = NULL WHERE id = ?').run(id);
  if (chore.source === 'schedule' && chore.schedule_id != null) {
    // Reopened chore satisfies dedupe, so clearing the stamp cannot double-fire.
    db.prepare('UPDATE care_schedules SET last_done_at = NULL WHERE id = ?').run(chore.schedule_id);
  }
}

export function getChoresCompletedSince(db: Database.Database, sinceIso: string): Chore[] {
  const rows = db
    .prepare(
      `SELECT c.*, p.name AS plant_name FROM chores c
       LEFT JOIN plants p ON p.id = c.plant_id
       WHERE c.completed_at IS NOT NULL AND c.completed_at >= ?
       ORDER BY c.completed_at DESC`,
    )
    .all(sinceIso) as ChoreRow[];
  return rows.map(toChore);
}
```

- [ ] **Step 4: Write plantTasks.ts**

Create `backend/src/care/plantTasks.ts`:
```typescript
import type Database from 'better-sqlite3';
import { getPlant } from '../db/plants.js';

export type TaskKind = 'pollinate' | 'roots' | 'trim' | 'harvest' | 'other';

export interface PlantTask {
  id: number;
  plantId: number;
  title: string;
  kind: TaskKind;
  dueAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface TaskRow {
  id: number;
  plant_id: number;
  title: string;
  kind: string | null;
  due_at: string | null;
  created_at: string;
  completed_at: string | null;
}

function toTask(r: TaskRow): PlantTask {
  return {
    id: r.id,
    plantId: r.plant_id,
    title: r.title,
    kind: (r.kind ?? 'other') as TaskKind,
    dueAt: r.due_at,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

export function getPlantTasks(db: Database.Database, plantId: number): PlantTask[] {
  const rows = db
    .prepare(
      `SELECT * FROM chores WHERE plant_id = ? AND completed_at IS NULL
       ORDER BY due_at IS NOT NULL, due_at ASC, created_at ASC`,
    )
    .all(plantId) as TaskRow[];
  return rows.map(toTask);
}

export function createPlantTask(
  db: Database.Database,
  plantId: number,
  input: { title: string; kind: TaskKind; dueAt?: string | null },
  now: string,
): PlantTask {
  const plant = getPlant(db, plantId);
  if (!plant) throw new Error(`plant ${plantId} not found`);
  const result = db
    .prepare(
      `INSERT INTO chores (gardyn_id, plant_id, title, source, kind, due_at, created_at, completed_at)
       VALUES (?, ?, ?, 'plant', ?, ?, ?, NULL)`,
    )
    .run(plant.gardynId, plantId, input.title, input.kind, input.dueAt ?? null, now);
  const row = db
    .prepare('SELECT * FROM chores WHERE id = ?')
    .get(result.lastInsertRowid) as TaskRow;
  return toTask(row);
}

export function updatePlantTask(
  db: Database.Database,
  id: number,
  patch: { title?: string; kind?: TaskKind; dueAt?: string | null },
): boolean {
  const row = db
    .prepare("SELECT * FROM chores WHERE id = ? AND source = 'plant'")
    .get(id) as TaskRow | undefined;
  if (!row) return false;
  db.prepare('UPDATE chores SET title = ?, kind = ?, due_at = ? WHERE id = ?').run(
    patch.title !== undefined ? patch.title : row.title,
    patch.kind !== undefined ? patch.kind : row.kind,
    patch.dueAt !== undefined ? patch.dueAt : row.due_at,
    id,
  );
  return true;
}

export function deletePlantTask(db: Database.Database, id: number): boolean {
  const result = db
    .prepare("DELETE FROM chores WHERE id = ? AND source = 'plant'")
    .run(id);
  return result.changes > 0;
}

// Seeded examples so pills, board labels, chips, and the modal demo with mixed states.
export function seedFakePlantTasks(db: Database.Database, now: string): void {
  const existing = db
    .prepare("SELECT COUNT(*) as n FROM chores WHERE source = 'plant'")
    .get() as { n: number };
  if (existing.n > 0) return;
  const plants = db.prepare('SELECT id, name FROM plants ORDER BY id').all() as Array<{
    id: number;
    name: string;
  }>;
  const inAWeek = new Date(new Date(now).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const byName = new Map(plants.map((p) => [p.name, p.id]));
  const seedTask = (name: string, title: string, kind: TaskKind, dueAt: string | null) => {
    const id = byName.get(name);
    if (id != null) createPlantTask(db, id, { title, kind, dueAt }, now);
  };
  seedTask('Cherry Tomato', 'Hand-pollinate open flowers', 'pollinate', null);
  seedTask('Basil', 'Trim leggy stems', 'trim', null);
  seedTask('Rainbow Chard', 'Check and trim roots', 'roots', null);
  seedTask('Strawberry', 'Harvest ripe berries', 'harvest', null);
  seedTask('Lettuce', 'Harvest outer leaves', 'harvest', inAWeek);
  seedTask('Thai Chili', 'Stake leaning stem', 'other', inAWeek);
}
```

- [ ] **Step 5: Wire seed into startup**

In `backend/src/index.ts` after `seedFakePlants(db)`:
```typescript
import { seedFakePlantTasks } from './care/plantTasks.js';
// ...
seedFakePlantTasks(db, new Date().toISOString());
```

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all PASS (existing getOpenChores callers pass no `now` and keep prior behavior).

- [ ] **Step 7: Commit**

```bash
git add backend/src/care/ backend/src/index.ts
git commit -m "feat: per-plant tasks, board due-filter, chore undo"
```

---

### Task 5: Routes for plants, plant tasks, uncomplete, and done-today

**Files:**
- Modify: `backend/src/routes/garden.ts`
- Test: extend `backend/src/routes/garden.test.ts`

**Interfaces:**
- Consumes: Task 3 + Task 4 exports.
- Produces (HTTP):
  - `GET /api/plants` -> `{ plants: Plant[] }` (camelCase via `listPlants`, incl. rich fields)
  - `PUT /api/plants/:id` -> body `{ name?, variety?, plantedAt?, notes?, careInstructions?, about?, uses? }` (camelCase), 404 when missing, `{ ok: true }`
  - `GET /api/plants/:id/tasks` -> `{ tasks: PlantTask[] }`
  - `POST /api/plants/:id/tasks` -> body `{ title, kind, dueAt? }`, 400 on missing title/invalid kind, 404 on missing plant, `{ task }`
  - `PATCH /api/tasks/:id` -> `{ ok: true }` / 404; 400 on invalid kind
  - `DELETE /api/tasks/:id` -> `{ ok: true }` / 404
  - `POST /api/chores/:id/uncomplete` -> `{ ok: true }`
  - `GET /api/chores` -> `{ chores: Chore[], doneToday: Chore[] }` (chores = due-filtered via `getOpenChores(db, now)`; doneToday = `getChoresCompletedSince` from local midnight of `now()`)

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/routes/garden.test.ts`:
```typescript
it('plant task lifecycle over HTTP: create, list, patch, complete, undo, delete', async () => {
  const { app, db } = appWith(':memory:routes-ptasks');
  seedDefaultGardens(db);
  db.prepare(
    "INSERT INTO plants (gardyn_id, col, position, name) VALUES ('gardyn-1', 1, 1, 'Basil')",
  ).run();
  const plant: any = db.prepare('SELECT id FROM plants').get();

  const created = await request(app)
    .post(`/api/plants/${plant.id}/tasks`)
    .send({ title: 'Trim stems', kind: 'trim' });
  expect(created.status).toBe(200);
  const taskId = created.body.task.id;

  const list = await request(app).get(`/api/plants/${plant.id}/tasks`);
  expect(list.body.tasks).toHaveLength(1);

  const patched = await request(app)
    .patch(`/api/tasks/${taskId}`)
    .send({ dueAt: '2026-09-01T00:00:00.000Z' });
  expect(patched.status).toBe(200);

  await request(app).post(`/api/chores/${taskId}/complete`);
  const afterComplete = await request(app).get(`/api/plants/${plant.id}/tasks`);
  expect(afterComplete.body.tasks).toHaveLength(0);

  await request(app).post(`/api/chores/${taskId}/uncomplete`);
  const afterUndo = await request(app).get(`/api/plants/${plant.id}/tasks`);
  expect(afterUndo.body.tasks).toHaveLength(1);

  const deleted = await request(app).delete(`/api/tasks/${taskId}`);
  expect(deleted.status).toBe(200);
});

it('POST task validates input and 404s on missing plant', async () => {
  const { app, db } = appWith(':memory:routes-ptasks-2');
  seedDefaultGardens(db);
  const bad = await request(app).post('/api/plants/9999/tasks').send({ title: 'x', kind: 'trim' });
  expect(bad.status).toBe(404);
  db.prepare(
    "INSERT INTO plants (gardyn_id, col, position, name) VALUES ('gardyn-1', 1, 1, 'Basil')",
  ).run();
  const plant: any = db.prepare('SELECT id FROM plants').get();
  const noTitle = await request(app).post(`/api/plants/${plant.id}/tasks`).send({ kind: 'trim' });
  expect(noTitle.status).toBe(400);
  const badKind = await request(app)
    .post(`/api/plants/${plant.id}/tasks`)
    .send({ title: 'x', kind: 'water-dance' });
  expect(badKind.status).toBe(400);
});

it('PUT /api/plants/:id round-trips rich fields in camelCase', async () => {
  const { app, db } = appWith(':memory:routes-rich');
  seedDefaultGardens(db);
  db.prepare(
    "INSERT INTO plants (gardyn_id, col, position, name) VALUES ('gardyn-1', 1, 1, 'Basil')",
  ).run();
  const plant: any = db.prepare('SELECT id FROM plants').get();
  const res = await request(app)
    .put(`/api/plants/${plant.id}`)
    .send({ careInstructions: 'Trim weekly', uses: 'Pesto' });
  expect(res.status).toBe(200);
  const after = await request(app).get('/api/plants');
  expect(after.body.plants[0].careInstructions).toBe('Trim weekly');
  expect(after.body.plants[0].uses).toBe('Pesto');
  expect(after.body.plants[0].name).toBe('Basil');
});

it('GET /api/chores returns doneToday completions', async () => {
  const { app, db } = appWith(':memory:routes-done');
  seedDefaultGardens(db);
  db.prepare(
    "INSERT INTO chores (gardyn_id, title, source, created_at, completed_at) VALUES ('gardyn-1', 'Tank clean (gardyn-1)', 'schedule', '2026-07-06T12:00:00.000Z', '2026-07-06T12:05:00.000Z')",
  ).run();
  const res = await request(app).get('/api/chores');
  expect(res.body.doneToday).toHaveLength(1);
  expect(res.body.chores).toHaveLength(0);
});
```
Note the `appWith` helper injects `now = 2026-07-06T12:10:00Z`, so a completion at 12:05 the same day is "today."

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/routes/garden.test.ts`
Expected: new tests FAIL (404s on unknown routes; old plants passthrough shape).

- [ ] **Step 3: Implement the routes**

In `backend/src/routes/garden.ts` (inside `makeGardenRouter`):
```typescript
import { listPlants, updatePlant } from '../db/plants.js';
import {
  getPlantTasks,
  createPlantTask,
  updatePlantTask,
  deletePlantTask,
} from '../care/plantTasks.js';
import type { TaskKind } from '../care/plantTasks.js';
import { getOpenChores, completeChore, uncompleteChore, getChoresCompletedSince } from '../care/chores.js';

const TASK_KINDS: TaskKind[] = ['pollinate', 'roots', 'trim', 'harvest', 'other'];

function startOfLocalDay(d: Date): string {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return local.toISOString();
}

// GET /chores becomes:
router.get('/chores', (_req, res) => {
  const at = now();
  res.json({
    chores: getOpenChores(db, at.toISOString()),
    doneToday: getChoresCompletedSince(db, startOfLocalDay(at)),
  });
});

router.post('/chores/:id/uncomplete', (req, res) => {
  uncompleteChore(db, Number(req.params.id));
  res.json({ ok: true });
});

// GET /plants becomes:
router.get('/plants', (_req, res) => {
  res.json({ plants: listPlants(db) });
});

// PUT /plants/:id becomes (camelCase body incl. rich fields; merge semantics live in updatePlant):
router.put('/plants/:id', (req, res) => {
  const { name, variety, plantedAt, notes, careInstructions, about, uses } = req.body ?? {};
  const ok = updatePlant(db, Number(req.params.id), {
    name, variety, plantedAt, notes, careInstructions, about, uses,
  });
  if (!ok) return res.status(404).json({ ok: false });
  res.json({ ok: true });
});

router.get('/plants/:id/tasks', (req, res) => {
  res.json({ tasks: getPlantTasks(db, Number(req.params.id)) });
});

router.post('/plants/:id/tasks', (req, res) => {
  const { title, kind, dueAt } = req.body ?? {};
  if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title required' });
  if (!TASK_KINDS.includes(kind)) return res.status(400).json({ error: 'invalid kind' });
  try {
    const task = createPlantTask(db, Number(req.params.id), { title, kind, dueAt }, now().toISOString());
    res.json({ task });
  } catch {
    res.status(404).json({ error: 'plant not found' });
  }
});

router.patch('/tasks/:id', (req, res) => {
  const { title, kind, dueAt } = req.body ?? {};
  if (kind !== undefined && !TASK_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'invalid kind' });
  }
  const ok = updatePlantTask(db, Number(req.params.id), { title, kind, dueAt });
  if (!ok) return res.status(404).json({ ok: false });
  res.json({ ok: true });
});

router.delete('/tasks/:id', (req, res) => {
  const ok = deletePlantTask(db, Number(req.params.id));
  if (!ok) return res.status(404).json({ ok: false });
  res.json({ ok: true });
});
```
Existing Phase 1 route tests that asserted the old snake_case PUT body or raw-row plants shape must be updated to the camelCase contract in the same commit.

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/
git commit -m "feat: plant + plant-task routes, chore undo endpoint, doneToday"
```

---

### Task 6: Frontend API client v2

**Files:**
- Modify: `frontend/src/api.ts`
- Modify (minimal consumer fixes so the commit builds): `frontend/src/App.tsx`, `frontend/src/components/PlantGrid.tsx`

**Interfaces:**
- Produces (all consumed by Tasks 7-9):
  - `GardenStatus` gains `name: string`
  - `Plant` replaces `PlantRow`: `{ id, gardynId, col, position, name, variety, plantedAt, notes, careInstructions, about, uses }` (camelCase)
  - `Chore` gains `plantId: number | null; plantName: string | null; kind: TaskKind | null; dueAt: string | null`; `source` union gains `'plant'`
  - `type TaskKind = 'pollinate' | 'roots' | 'trim' | 'harvest' | 'other'`
  - `interface PlantTask { id: number; plantId: number; title: string; kind: TaskKind; dueAt: string | null; createdAt: string; completedAt: string | null }`
  - `fetchChores(): Promise<{ chores: Chore[]; doneToday: Chore[] }>` (return shape change)
  - `fetchPlants(): Promise<Plant[]>`
  - `updatePlant(id: number, patch: Partial<Pick<Plant, 'name' | 'variety' | 'plantedAt' | 'notes' | 'careInstructions' | 'about' | 'uses'>>): Promise<void>`
  - `fetchPlantTasks(plantId: number): Promise<PlantTask[]>`
  - `createPlantTask(plantId: number, input: { title: string; kind: TaskKind; dueAt?: string | null }): Promise<PlantTask>`
  - `updatePlantTask(id: number, patch: { title?: string; kind?: TaskKind; dueAt?: string | null }): Promise<void>`
  - `deletePlantTask(id: number): Promise<void>`
  - `uncompleteChore(id: number): Promise<void>`

- [ ] **Step 1: Rewrite `frontend/src/api.ts`**

```typescript
export type LightState = 'on' | 'off';
export type TaskKind = 'pollinate' | 'roots' | 'trim' | 'harvest' | 'other';

export interface GardynSnapshot {
  gardynId: string;
  takenAt: string;
  waterLevelPct: number;
  temperatureC: number;
  humidityPct: number;
  light: LightState;
}

export interface GardenStatus {
  gardynId: string;
  name: string;
  snapshot: GardynSnapshot | null;
  ageMinutes: number | null;
  stale: boolean;
}

export interface Chore {
  id: number;
  gardynId: string | null;
  title: string;
  source: 'schedule' | 'data-trigger' | 'plant';
  createdAt: string;
  completedAt: string | null;
  scheduleId?: number | null;
  plantId: number | null;
  plantName: string | null;
  kind: TaskKind | null;
  dueAt: string | null;
}

export interface Plant {
  id: number;
  gardynId: string;
  col: number;
  position: number;
  name: string;
  variety: string | null;
  plantedAt: string | null;
  notes: string | null;
  careInstructions: string | null;
  about: string | null;
  uses: string | null;
}

export interface PlantTask {
  id: number;
  plantId: number;
  title: string;
  kind: TaskKind;
  dueAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

async function checkOk(res: Response): Promise<Response> {
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await checkOk(await fetch(url));
  return res.json() as Promise<T>;
}

async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await checkOk(
    await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return res.json() as Promise<T>;
}

export async function fetchStatus(): Promise<GardenStatus[]> {
  const body = await getJson<{ gardens: GardenStatus[] }>('/api/status');
  return body.gardens;
}

export async function fetchChores(): Promise<{ chores: Chore[]; doneToday: Chore[] }> {
  return getJson<{ chores: Chore[]; doneToday: Chore[] }>('/api/chores');
}

export async function completeChore(id: number): Promise<void> {
  await sendJson(`/api/chores/${id}/complete`, 'POST');
}

export async function uncompleteChore(id: number): Promise<void> {
  await sendJson(`/api/chores/${id}/uncomplete`, 'POST');
}

export async function fetchPlants(): Promise<Plant[]> {
  const body = await getJson<{ plants: Plant[] }>('/api/plants');
  return body.plants;
}

export async function updatePlant(
  id: number,
  patch: Partial<
    Pick<Plant, 'name' | 'variety' | 'plantedAt' | 'notes' | 'careInstructions' | 'about' | 'uses'>
  >,
): Promise<void> {
  await sendJson(`/api/plants/${id}`, 'PUT', patch);
}

export async function fetchPlantTasks(plantId: number): Promise<PlantTask[]> {
  const body = await getJson<{ tasks: PlantTask[] }>(`/api/plants/${plantId}/tasks`);
  return body.tasks;
}

export async function createPlantTask(
  plantId: number,
  input: { title: string; kind: TaskKind; dueAt?: string | null },
): Promise<PlantTask> {
  const body = await sendJson<{ task: PlantTask }>(`/api/plants/${plantId}/tasks`, 'POST', input);
  return body.task;
}

export async function updatePlantTask(
  id: number,
  patch: { title?: string; kind?: TaskKind; dueAt?: string | null },
): Promise<void> {
  await sendJson(`/api/tasks/${id}`, 'PATCH', patch);
}

export async function deletePlantTask(id: number): Promise<void> {
  await sendJson(`/api/tasks/${id}`, 'DELETE');
}
```

- [ ] **Step 2: Minimal consumer fixes so this commit builds**

Run: `cd frontend && npx tsc -b` — errors will appear only in `App.tsx`/`PlantGrid.tsx` (changed shapes). Apply minimal fixes (Tasks 7-9 replace these files anyway):
- `App.tsx`: destructure `const { chores: c } = await fetchChores()`; switch `plants` state to `Plant[]`.
- `PlantGrid.tsx`: import `Plant` instead of `PlantRow`; the render uses `name`/`variety` which are unchanged.
If errors appear inside `api.ts` itself, fix them now.

- [ ] **Step 3: Verify build passes**

Run: `cd frontend && npx tsc -b && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: frontend api client v2 (named gardens, rich plants, plant tasks, undo)"
```

---

### Task 7: Tab shell + garden pages (status card, pill grid, legend, back/next)

The mockup's navigation: bottom tabs [Gardyn] [ToDo]; the Gardyn tab shows one garden per screen with its own status card, the 3x10 pill grid (position 1 at top), the kind legend, and back/next arrows.

**Files:**
- Create: `frontend/src/components/GardenPage.tsx`
- Create: `frontend/src/components/StatusCard.tsx` (single-garden card, extracted from StatusStrip)
- Delete: `frontend/src/components/StatusStrip.tsx`, `frontend/src/components/PlantGrid.tsx`
- Modify: `frontend/src/App.tsx` (tab state, garden pager state, tab bar)

**Interfaces:**
- Consumes: `Plant`, `Chore`, `TaskKind`, `GardenStatus` from `../api`.
- Produces:
  - `KIND_STYLES: Record<TaskKind, string>` and `KIND_LABELS: Record<TaskKind, string>` exported from `GardenPage.tsx` (reused by Tasks 8-9)
  - `<StatusCard garden={GardenStatus} />` — one garden's sensor card (water %, temp in F, humidity, light, updated-ago, red tint when stale/no data; same behavior as Phase 1's StatusStrip per-card body)
  - `<GardenPage garden={GardenStatus} plants={Plant[]} dueChores={Chore[]} onPlantClick={(plant: Plant) => void} />`
  - App-level: `tab: 'gardyn' | 'todo'` state, `gardenIndex: number` state, bottom tab bar, degraded banner stays global above tab content

- [ ] **Step 1: Extract StatusCard**

Create `frontend/src/components/StatusCard.tsx` (body lifted from Phase 1's StatusStrip, single garden, name from the API):
```tsx
import type { GardenStatus } from '../api';

// Snapshots store Celsius (sensor-native); the kiosk displays Fahrenheit.
function toFahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

export default function StatusCard({ garden }: { garden: GardenStatus }) {
  const s = garden.snapshot;
  const warn = garden.stale || !s;
  return (
    <div className={`rounded-2xl p-6 ${warn ? 'bg-red-950' : 'bg-slate-800'}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">{garden.name}</h2>
        <span className="text-sm text-slate-400">
          {garden.ageMinutes == null ? 'no data' : `updated ${garden.ageMinutes} min ago`}
        </span>
      </div>
      {s ? (
        <div className="mt-4 flex items-end gap-6">
          <div>
            <div className="text-5xl font-bold">{s.waterLevelPct}%</div>
            <div className="text-slate-400">water</div>
          </div>
          <div className="text-lg text-slate-300">
            <div>{toFahrenheit(s.temperatureC)}&deg;F</div>
            <div>{s.humidityPct}% humidity</div>
            <div>light {s.light}</div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-slate-300">Reconnect needed</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write GardenPage with grid + legend**

Create `frontend/src/components/GardenPage.tsx`:
```tsx
import type { Plant, Chore, TaskKind, GardenStatus } from '../api';
import StatusCard from './StatusCard';

export const KIND_STYLES: Record<TaskKind, string> = {
  pollinate: 'bg-amber-700 hover:bg-amber-600',
  roots: 'bg-sky-800 hover:bg-sky-700',
  trim: 'bg-violet-800 hover:bg-violet-700',
  harvest: 'bg-emerald-700 hover:bg-emerald-600',
  other: 'bg-slate-600 hover:bg-slate-500',
};

export const KIND_LABELS: Record<TaskKind, string> = {
  pollinate: 'Pollinate',
  roots: 'Roots',
  trim: 'Trim',
  harvest: 'Harvest',
  other: 'Other',
};

const IDLE_STYLE = 'bg-slate-800 hover:bg-slate-700';
const COLS = 3;
const POSITIONS = 10;

export default function GardenPage({
  garden,
  plants,
  dueChores,
  onPlantClick,
}: {
  garden: GardenStatus;
  plants: Plant[];
  dueChores: Chore[];
  onPlantClick: (plant: Plant) => void;
}) {
  const mine = plants.filter((p) => p.gardynId === garden.gardynId);
  const dueKindByPlant = new Map<number, TaskKind>();
  for (const c of dueChores) {
    if (c.plantId != null && c.kind && !dueKindByPlant.has(c.plantId)) {
      dueKindByPlant.set(c.plantId, c.kind);
    }
  }
  return (
    <div className="space-y-6">
      <StatusCard garden={garden} />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: COLS }, (_, i) => i + 1).map((col) => (
          <div key={col} className="space-y-2">
            <div className="text-center text-xs uppercase tracking-wide text-slate-500">
              Column {col}
            </div>
            {/* Position 1 is the TOP slot of the physical column. */}
            {Array.from({ length: POSITIONS }, (_, i) => i + 1).map((position) => {
              const plant = mine.find((p) => p.col === col && p.position === position);
              if (!plant) {
                return (
                  <div
                    key={position}
                    className="rounded-xl border border-dashed border-slate-800 px-3 py-2 text-center text-xs text-slate-700"
                  >
                    {position}
                  </div>
                );
              }
              const kind = dueKindByPlant.get(plant.id);
              return (
                <button
                  key={position}
                  onClick={() => onPlantClick(plant)}
                  className={`w-full rounded-xl px-3 py-2 text-sm font-medium ${kind ? KIND_STYLES[kind] : IDLE_STYLE}`}
                >
                  {plant.name}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
        {(Object.keys(KIND_LABELS) as TaskKind[])
          .filter((k) => k !== 'other')
          .map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`inline-block h-3 w-3 rounded-full ${KIND_STYLES[k].split(' ')[0]}`} />
              {KIND_LABELS[k]}
            </span>
          ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rebuild App around tabs**

Replace `frontend/src/App.tsx`:
```tsx
import { useEffect, useState, useCallback } from 'react';
import { fetchStatus, fetchChores, fetchPlants, completeChore, uncompleteChore } from './api';
import type { GardenStatus, Chore, Plant } from './api';
import GardenPage from './components/GardenPage';
import BreakBoard from './components/BreakBoard';

const REFRESH_MS = 60_000;
type Tab = 'gardyn' | 'todo';

function App() {
  const [gardens, setGardens] = useState<GardenStatus[]>([]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [doneToday, setDoneToday] = useState<Chore[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [tab, setTab] = useState<Tab>('gardyn');
  const [gardenIndex, setGardenIndex] = useState(0);
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);

  const load = useCallback(async () => {
    try {
      const [g, c, p] = await Promise.all([fetchStatus(), fetchChores(), fetchPlants()]);
      setGardens(g);
      setChores(c.chores);
      setDoneToday(c.doneToday);
      setPlants(p);
      setSelectedPlant((cur) => (cur ? p.find((x) => x.id === cur.id) ?? null : null));
      setDegraded(false);
    } catch (err) {
      console.error('refresh failed:', err);
      setDegraded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const handle = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(handle);
  }, [load]);

  const onComplete = async (id: number) => {
    try {
      await completeChore(id);
    } catch (err) {
      console.error('complete failed:', err);
      setDegraded(true);
    } finally {
      await load();
    }
  };

  const onUndo = async (id: number) => {
    try {
      await uncompleteChore(id);
    } catch (err) {
      console.error('undo failed:', err);
      setDegraded(true);
    } finally {
      await load();
    }
  };

  const garden = gardens[gardenIndex] ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col p-6 pb-24">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">Drip Dash</h1>
        {degraded && (
          <p className="text-sm text-amber-500">Backend unreachable, retrying every minute</p>
        )}
      </div>

      <div className="mt-6 flex-1">
        {tab === 'gardyn' && garden && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setGardenIndex((i) => (i - 1 + gardens.length) % gardens.length)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-lg hover:bg-slate-700"
                aria-label="Previous garden"
              >
                &lt;
              </button>
              <span className="text-sm text-slate-500">
                {gardenIndex + 1} of {gardens.length}
              </span>
              <button
                onClick={() => setGardenIndex((i) => (i + 1) % gardens.length)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-lg hover:bg-slate-700"
                aria-label="Next garden"
              >
                &gt;
              </button>
            </div>
            <GardenPage
              garden={garden}
              plants={plants}
              dueChores={chores}
              onPlantClick={setSelectedPlant}
            />
          </div>
        )}
        {tab === 'todo' && (
          <BreakBoard
            gardens={gardens}
            chores={chores}
            doneToday={doneToday}
            onComplete={onComplete}
            onUndo={onUndo}
          />
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-900/95">
        <div className="mx-auto flex max-w-4xl">
          {(['gardyn', 'todo'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-4 text-center text-sm font-medium uppercase tracking-wide ${
                tab === t ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t === 'gardyn' ? 'Gardyn' : 'To do'}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

export default App;
```
Note: `BreakBoard`'s new props land in Task 9; to keep this commit building, Task 7 may temporarily keep the Task 6 minimal BreakBoard call shape (chores + onComplete only) and omit `doneToday`/`gardens`/`onUndo` until Task 9 — or land Tasks 7 and 9's BreakBoard changes in whichever order keeps `tsc -b` green. State the choice in the commit.
Delete `frontend/src/components/StatusStrip.tsx` and `frontend/src/components/PlantGrid.tsx`.

- [ ] **Step 4: Verify build**

Run: `cd frontend && npx tsc -b && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat: tabbed kiosk with per-garden pages, pill grid, legend"
```

---

### Task 8: Plant modal (rich details + task management)

**Files:**
- Create: `frontend/src/components/PlantModal.tsx`
- Modify: `frontend/src/App.tsx` (render the modal)

**Interfaces:**
- Consumes: api client fns (`updatePlant`, `fetchPlantTasks`, `createPlantTask`, `updatePlantTask`, `deletePlantTask`, `completeChore`), `KIND_STYLES` from `./GardenPage`.
- Produces: `<PlantModal plant={Plant} onClose={() => void} onChanged={() => void} />` — `onChanged` fires after any mutation so App reloads.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/PlantModal.tsx`:
```tsx
import { useEffect, useState, useCallback } from 'react';
import {
  updatePlant,
  fetchPlantTasks,
  createPlantTask,
  updatePlantTask,
  deletePlantTask,
  completeChore,
} from '../api';
import type { Plant, PlantTask, TaskKind } from '../api';
import { KIND_STYLES } from './GardenPage';

const KINDS: TaskKind[] = ['pollinate', 'roots', 'trim', 'harvest', 'other'];

export default function PlantModal({
  plant,
  onClose,
  onChanged,
}: {
  plant: Plant;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tasks, setTasks] = useState<PlantTask[]>([]);
  const [name, setName] = useState(plant.name);
  const [variety, setVariety] = useState(plant.variety ?? '');
  const [plantedAt, setPlantedAt] = useState(plant.plantedAt ?? '');
  const [notes, setNotes] = useState(plant.notes ?? '');
  const [careInstructions, setCareInstructions] = useState(plant.careInstructions ?? '');
  const [about, setAbout] = useState(plant.about ?? '');
  const [uses, setUses] = useState(plant.uses ?? '');
  const [newTitle, setNewTitle] = useState('');
  const [newKind, setNewKind] = useState<TaskKind>('other');
  const [newDue, setNewDue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await fetchPlantTasks(plant.id));
    } catch (err) {
      console.error('load tasks failed:', err);
      setError('Could not load tasks');
    }
  }, [plant.id]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      setError(null);
      await action();
      await loadTasks();
      onChanged();
    } catch (err) {
      console.error('plant action failed:', err);
      setError('That did not save, try again');
    }
  };

  const saveDetails = () =>
    run(() =>
      updatePlant(plant.id, {
        name,
        variety: variety || null,
        plantedAt: plantedAt || null,
        notes: notes || null,
        careInstructions: careInstructions || null,
        about: about || null,
        uses: uses || null,
      }),
    );

  const addTask = () => {
    if (!newTitle.trim()) return;
    return run(async () => {
      await createPlantTask(plant.id, {
        title: newTitle.trim(),
        kind: newKind,
        dueAt: newDue ? new Date(newDue).toISOString() : null,
      });
      setNewTitle('');
      setNewDue('');
      setNewKind('other');
    });
  };

  const textInput = 'mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 text-slate-100';

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-2xl font-bold">{plant.name}</h2>
          <button onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-1 hover:bg-slate-700">
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Column {plant.col}, position {plant.position}
        </p>
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
            Planted on
            <input type="date" value={plantedAt} onChange={(e) => setPlantedAt(e.target.value)} className={textInput} />
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
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={textInput} />
          </label>
          <button onClick={saveDetails} className="rounded-lg bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600">
            Save details
          </button>
        </div>

        <h3 className="mt-6 text-lg font-semibold">Tasks</h3>
        <ul className="mt-2 space-y-2">
          {tasks.length === 0 && <li className="text-sm text-slate-500">No open tasks.</li>}
          {tasks.map((t) => (
            <li key={t.id} className="rounded-xl bg-slate-800 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${KIND_STYLES[t.kind]}`}>{t.kind}</span>
                <span className="flex-1 text-sm">{t.title}</span>
                <button onClick={() => run(() => completeChore(t.id))} className="rounded-lg bg-emerald-700 px-2 py-1 text-xs hover:bg-emerald-600">
                  Done
                </button>
                <button onClick={() => run(() => deletePlantTask(t.id))} className="rounded-lg bg-slate-700 px-2 py-1 text-xs hover:bg-red-900">
                  Delete
                </button>
              </div>
              <label className="mt-2 block text-xs text-slate-400">
                Due
                <input
                  type="date"
                  value={t.dueAt ? t.dueAt.slice(0, 10) : ''}
                  onChange={(e) =>
                    run(() =>
                      updatePlantTask(t.id, {
                        dueAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                      }),
                    )
                  }
                  className="mt-1 rounded-lg bg-slate-900 px-2 py-1 text-slate-100"
                />
                <span className="ml-2 text-slate-500">{t.dueAt ? '' : 'due now'}</span>
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl bg-slate-800 p-3">
          <div className="text-sm font-medium">Add a task</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What needs doing?"
              className="min-w-40 flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
            <select value={newKind} onChange={(e) => setNewKind(e.target.value as TaskKind)} className="rounded-lg bg-slate-900 px-2 py-2 text-sm text-slate-100">
              {KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} className="rounded-lg bg-slate-900 px-2 py-2 text-sm text-slate-100" />
            <button onClick={addTask} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium hover:bg-emerald-600">
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render from App**

In `frontend/src/App.tsx`, after the `<nav>`:
```tsx
import PlantModal from './components/PlantModal';
// ...
{selectedPlant && (
  <PlantModal
    plant={selectedPlant}
    onClose={() => setSelectedPlant(null)}
    onChanged={() => void load()}
  />
)}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc -b && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: plant modal with rich editable details and per-plant tasks"
```

---

### Task 9: ToDo tab (filter chips, plant labels, done-today undo)

**Files:**
- Modify: `frontend/src/components/BreakBoard.tsx`

**Interfaces:**
- Consumes: `Chore`, `GardenStatus`, `TaskKind` from `../api`, `KIND_STYLES` from `./GardenPage`.
- Produces: `<BreakBoard gardens={GardenStatus[]} chores={Chore[]} doneToday={Chore[]} onComplete={(id) => void} onUndo={(id) => void} />` with chips: All / <garden names> / Plants.

- [ ] **Step 1: Rewrite the component**

Replace `frontend/src/components/BreakBoard.tsx`:
```tsx
import { useState } from 'react';
import type { Chore, GardenStatus } from '../api';
import { KIND_STYLES } from './GardenPage';

type Filter = 'all' | 'plants' | string; // string = gardynId

function choreLabel(c: Chore): string {
  return c.plantName ? `${c.plantName}: ${c.title}` : c.title;
}

function matches(c: Chore, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'plants') return c.plantId != null;
  return c.gardynId === filter;
}

export default function BreakBoard({
  gardens,
  chores,
  doneToday,
  onComplete,
  onUndo,
}: {
  gardens: GardenStatus[];
  chores: Chore[];
  doneToday: Chore[];
  onComplete: (id: number) => void;
  onUndo: (id: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const chips: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'All' },
    ...gardens.map((g) => ({ key: g.gardynId as Filter, label: g.name })),
    { key: 'plants', label: 'Plants' },
  ];
  const visible = chores.filter((c) => matches(c, filter));
  const visibleDone = doneToday.filter((c) => matches(c, filter));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            onClick={() => setFilter(chip.key)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              filter === chip.key
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl bg-slate-800 p-8 text-center text-xl text-slate-300">
          Garden is happy. Go enjoy your break.
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {visible.map((c) => (
            <button
              key={c.id}
              onClick={() => onComplete(c.id)}
              className={`rounded-2xl px-6 py-4 text-lg font-medium ${
                c.kind ? KIND_STYLES[c.kind] : 'bg-emerald-700 hover:bg-emerald-600'
              }`}
            >
              {choreLabel(c)}
            </button>
          ))}
        </div>
      )}

      {visibleDone.length > 0 && (
        <div className="rounded-2xl bg-slate-900 p-4">
          <div className="text-sm text-slate-500">Done today</div>
          <ul className="mt-2 space-y-1">
            {visibleDone.map((c) => (
              <li key={c.id} className="flex items-center gap-3 text-slate-400">
                <span className="line-through">✓ {choreLabel(c)}</span>
                <button
                  onClick={() => onUndo(c.id)}
                  className="rounded-lg bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```
If Task 7 landed with a temporary reduced BreakBoard call, align `App.tsx` to the full prop set now.

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc -b && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat: todo tab with filter chips, plant labels, done-today undo"
```

---

### Task 10: End-to-end verification + README

**Files:**
- Modify: `README.md` (feature bullets)

- [ ] **Step 1: Full backend suite**

Run: `cd backend && npm test`
Expected: all suites green.

- [ ] **Step 2: Production build + live smoke**

```bash
rm -f backend/drip-dash.db* drip-dash.db*
npm run build
npm start &
sleep 2
curl -s localhost:3001/api/status | head -c 300        # two gardens WITH names
curl -s localhost:3001/api/chores | head -c 400         # chores + doneToday keys
curl -s localhost:3001/api/plants | head -c 400         # 6 fake plants, camelCase, rich fields
PLANT_ID=$(curl -s localhost:3001/api/plants | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).plants[0].id))")
curl -s localhost:3001/api/plants/$PLANT_ID/tasks | head -c 300
kill %1
```
Expected: names "Weik & Wander" / "Mystical Menagerie" in status; `doneToday` present; plants + tasks respond.

- [ ] **Step 3: Update README feature bullets**

In `README.md`, extend the features/overview section with one line each: named gardens with tabbed per-garden pages, column pill grid with task-kind tints, tap-a-plant modal with rich details and editable per-plant tasks, ToDo tab with filter chips and done-today undo. Match the existing tone; no emdashes.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: phase 1.5 feature notes"
```

- [ ] **Step 5: Hand off run commands (do not auto-launch)**

Tell Mindi: `npm run dev` from repo root; kiosk at the Vite URL. Fresh DB seeds gardens, schedules, fake plants, and example plant tasks automatically.

---

## Self-Review

**Spec coverage:**
- Gardens table + exact names -> Tasks 1, 2. (col, position), position 1 = top -> Tasks 1, 7. Rich plant fields -> Tasks 1, 3, 5, 6, 8. Per-plant tasks (manual, editable, complete/add/edit/delete) -> Tasks 4, 5, 8. Due-filter + plant labels -> Tasks 4, 5, 9. Tabs + back/next + status card per garden page -> Task 7 (decisions 1, 5). Whole-pill tint + legend -> Task 7 (decision 2). ToDo chips -> Task 9 (decision 6). Fake plants incl. rich text + example tasks -> Tasks 3, 4 (decision 7). Photos deferred -> nowhere, correctly (decision 8). Done-today linger + undo -> Tasks 4, 5, 9. Degraded banner global -> Task 7 App.
- Deferred per spec: nurseries, inventory view + tab, add/remove plant UI + POST /api/plants, photos, rotation, auto-generated tasks.

**Placeholder scan:** every code step shows complete code; the one intentional flexibility (Task 7/9 BreakBoard prop-ordering across commits) states both acceptable orders explicitly.

**Type consistency:** `Garden`/`listGardens`/`seedDefaultGardens` (Tasks 1-3), `Plant`/`PlantPatch`/`listPlants`/`getPlant`/`updatePlant`/`seedFakePlants` (Tasks 3, 5, 6, 8), `PlantTask`/`TaskKind`/`getPlantTasks`/`createPlantTask`/`updatePlantTask`/`deletePlantTask`/`seedFakePlantTasks` (Tasks 4, 5, 6, 8), `getOpenChores(db, now?)`/`uncompleteChore`/`getChoresCompletedSince` (Tasks 4, 5, 9), `fetchChores` -> `{ chores, doneToday }` (Tasks 6, 7, 9), `KIND_STYLES`/`KIND_LABELS` from `GardenPage` (Tasks 7, 8, 9) — names and signatures match across tasks.

**Known risks:**
- Task 7 and Task 9 both touch the BreakBoard call site; the plan allows either ordering as long as each commit builds (stated in Task 7 Step 3).
- `seedFakePlantTasks` computes a relative future date at startup (runtime `new Date`) — fine in the server; seeded due dates differ per fresh DB, acceptable for demo data.
- The chores table now hosts three sources; if a future phase splits plant tasks into their own table, `getPlantTasks`'s WHERE clause is the seam.
- Tab state is client-only (resets to Gardyn tab on reload) — acceptable for a kiosk; revisit if annoying.
