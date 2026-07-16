# Drip Dash Phase 1.6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Note:** code blocks are a reference implementation, not a verbatim mandate. Deviate where cleaner long-term as long as behavior, interfaces, and test coverage hold.

> **Working agreement:** genuinely new design/UX/domain questions the spec's Decisions log does not answer go back to Mindi (NEEDS_CONTEXT), never assumed.

**Goal:** Full plant lifecycle: tap-empty-slot add (rich form), archive-with-reason remove, and move/transplant with swap, per the Phase 1.6 spec.

**Architecture:** Plants gain `removed_at`/`removed_reason`; the slot uniqueness becomes a partial unique index over active plants only. Three new repo operations (`createPlant`, `archivePlant`, `movePlant`) with better-sqlite3 transactions for archive (cascades open-task deletion) and move (swap dance through a temp position). Three new routes. Frontend: empty slots become tappable (AddPlantModal), PlantModal gains Move and Remove flows.

**Tech Stack:** unchanged (Express 5 ESM + better-sqlite3 + Vitest; React 19 + Vite + Tailwind v4).

**Spec:** `docs/superpowers/specs/2026-07-16-drip-dash-phase-1-6-design.md` (Decisions log = settled)

## Global Constraints

- Branch `feat/phase-1-6` off current `main`. Repo `~/dev/educational-repos/drip-dash`.
- ESM `.js` relative imports; no emdashes anywhere; sentence casing for UI copy; no Co-Authored-By; author email `57885108+mindiweik@users.noreply.github.com`.
- TDD for all backend logic; Vitest; fresh `:memory:<suffix>` DBs.
- DB disposable: schema edits go straight into the SCHEMA block, no migrations.
- Remove reasons exactly: `'harvested' | 'died' | 'other'`.
- Archiving deletes the plant's OPEN tasks, keeps completed ones (spec decision 6).
- Swap allowed on occupied move targets (spec decision 4); all mutations of two rows happen in one transaction.
- Frontend verification = `npx tsc -b` + `npm run build`; no unit test runner.
- Do not auto-launch the app for the user.

---

### Task 1: Schema + plant lifecycle repo (create, archive, move)

**Files:**
- Modify: `backend/src/db/database.ts` (plants table: drop inline UNIQUE, add removed columns; add partial unique index)
- Modify: `backend/src/db/plants.ts` (Plant fields, active filtering, createPlant, archivePlant, movePlant)
- Modify: `backend/src/care/plantTasks.ts` (createPlantTask rejects archived plants)
- Test: `backend/src/db/plants.test.ts` (extend), `backend/src/care/plantTasks.test.ts` (extend)

**Interfaces:**
- Produces:
  - `Plant` gains `removedAt: string | null; removedReason: string | null`
  - `type RemoveReason = 'harvested' | 'died' | 'other'`
  - `listPlants(db)` returns ACTIVE plants only (`removed_at IS NULL`); `getPlant(db, id)` returns archived rows too (guards need them)
  - `createPlant(db, input: { gardynId: string; col: number; position: number; name: string; variety?: string | null; plantedAt?: string | null; notes?: string | null; careInstructions?: string | null; about?: string | null; uses?: string | null }): Plant` — throws `SlotOccupiedError` (active plant in slot) or `InvalidSlotError` (unknown garden / col/position outside geometry)
  - `class SlotOccupiedError extends Error`, `class InvalidSlotError extends Error` (exported)
  - `archivePlant(db, id: number, reason: RemoveReason, now: string): boolean` — false when missing or already archived; in one transaction stamps removed_at/removed_reason and DELETEs the plant's open tasks (`chores WHERE plant_id = ? AND completed_at IS NULL`); completed tasks untouched
  - `movePlant(db, id: number, target: { gardynId: string; col: number; position: number }): 'moved' | 'swapped' | 'missing' | 'invalid'` — 'missing' when plant absent/archived; 'invalid' when target garden/geometry bad or target === current slot; swap via temp-position dance in one transaction; open chores' `gardyn_id` updated to follow each moved plant (completed chores keep their historical gardyn_id)

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/db/plants.test.ts` (reuse the file's existing helpers/imports; add `createPlant, archivePlant, movePlant, SlotOccupiedError, InvalidSlotError` to the import):
```typescript
describe('plant lifecycle', () => {
  function lifecycleDb(key: string) {
    const db = getDb(key);
    seedDefaultGardens(db);
    return db;
  }

  it('createPlant inserts into an empty slot and returns the mapped plant', () => {
    const db = lifecycleDb(':memory:life-1');
    const p = createPlant(db, {
      gardynId: 'gardyn-1', col: 1, position: 3, name: 'Dill', variety: 'Bouquet',
      careInstructions: 'Harvest fronds from the outside.',
    });
    expect(p.name).toBe('Dill');
    expect(p.removedAt).toBeNull();
    expect(listPlants(db)).toHaveLength(1);
  });

  it('createPlant rejects occupied slots and invalid geometry', () => {
    const db = lifecycleDb(':memory:life-2');
    createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 3, name: 'Dill' });
    expect(() =>
      createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 3, name: 'Mint' }),
    ).toThrow(SlotOccupiedError);
    expect(() =>
      createPlant(db, { gardynId: 'gardyn-1', col: 4, position: 1, name: 'Mint' }),
    ).toThrow(InvalidSlotError);
    expect(() =>
      createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 11, name: 'Mint' }),
    ).toThrow(InvalidSlotError);
    expect(() =>
      createPlant(db, { gardynId: 'nope', col: 1, position: 1, name: 'Mint' }),
    ).toThrow(InvalidSlotError);
  });

  it('archivePlant frees the slot, keeps the row, and a new plant can take the slot', () => {
    const db = lifecycleDb(':memory:life-3');
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 2, position: 1, name: 'Basil' });
    expect(archivePlant(db, p.id, 'harvested', '2026-07-16T12:00:00.000Z')).toBe(true);
    expect(listPlants(db)).toHaveLength(0);
    expect(getPlant(db, p.id)?.removedReason).toBe('harvested');
    const again = createPlant(db, { gardynId: 'gardyn-1', col: 2, position: 1, name: 'Basil 2' });
    expect(again.name).toBe('Basil 2');
    expect(archivePlant(db, p.id, 'other', '2026-07-16T13:00:00.000Z')).toBe(false);
    expect(archivePlant(db, 9999, 'other', '2026-07-16T13:00:00.000Z')).toBe(false);
  });

  it('archivePlant deletes open tasks but keeps completed history', () => {
    const db = lifecycleDb(':memory:life-4');
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, name: 'Basil' });
    const open = createPlantTask(db, p.id, { title: 'Trim', kind: 'trim' }, '2026-07-16T10:00:00.000Z');
    const done = createPlantTask(db, p.id, { title: 'Pollinate', kind: 'pollinate' }, '2026-07-16T10:00:00.000Z');
    completeChore(db, done.id, '2026-07-16T11:00:00.000Z');
    archivePlant(db, p.id, 'died', '2026-07-16T12:00:00.000Z');
    expect(db.prepare('SELECT COUNT(*) as n FROM chores WHERE id = ?').get(open.id)).toEqual({ n: 0 });
    expect(db.prepare('SELECT completed_at FROM chores WHERE id = ?').get(done.id)).toBeTruthy();
  });

  it('movePlant relocates to an empty slot and open tasks follow the garden', () => {
    const db = lifecycleDb(':memory:life-5');
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, name: 'Basil' });
    createPlantTask(db, p.id, { title: 'Trim', kind: 'trim' }, '2026-07-16T10:00:00.000Z');
    expect(movePlant(db, p.id, { gardynId: 'gardyn-2', col: 3, position: 10 })).toBe('moved');
    const moved = getPlant(db, p.id)!;
    expect([moved.gardynId, moved.col, moved.position]).toEqual(['gardyn-2', 3, 10]);
    const chore: any = db.prepare('SELECT gardyn_id FROM chores WHERE plant_id = ?').get(p.id);
    expect(chore.gardyn_id).toBe('gardyn-2');
  });

  it('movePlant swaps with an occupied slot atomically', () => {
    const db = lifecycleDb(':memory:life-6');
    const a = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, name: 'A' });
    const b = createPlant(db, { gardynId: 'gardyn-2', col: 2, position: 5, name: 'B' });
    createPlantTask(db, b.id, { title: 'Trim', kind: 'trim' }, '2026-07-16T10:00:00.000Z');
    expect(movePlant(db, a.id, { gardynId: 'gardyn-2', col: 2, position: 5 })).toBe('swapped');
    const A = getPlant(db, a.id)!;
    const B = getPlant(db, b.id)!;
    expect([A.gardynId, A.col, A.position]).toEqual(['gardyn-2', 2, 5]);
    expect([B.gardynId, B.col, B.position]).toEqual(['gardyn-1', 1, 1]);
    const bChore: any = db.prepare('SELECT gardyn_id FROM chores WHERE plant_id = ?').get(b.id);
    expect(bChore.gardyn_id).toBe('gardyn-1');
  });

  it('movePlant rejects missing/archived plants, bad targets, and no-op moves', () => {
    const db = lifecycleDb(':memory:life-7');
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, name: 'A' });
    expect(movePlant(db, 9999, { gardynId: 'gardyn-1', col: 1, position: 2 })).toBe('missing');
    expect(movePlant(db, p.id, { gardynId: 'gardyn-1', col: 9, position: 1 })).toBe('invalid');
    expect(movePlant(db, p.id, { gardynId: 'gardyn-1', col: 1, position: 1 })).toBe('invalid');
    archivePlant(db, p.id, 'other', '2026-07-16T12:00:00.000Z');
    expect(movePlant(db, p.id, { gardynId: 'gardyn-1', col: 1, position: 2 })).toBe('missing');
  });
});
```
Add imports at top of the file: `createPlantTask` from `../care/plantTasks.js`, `completeChore` from `../care/chores.js`.

Append to `backend/src/care/plantTasks.test.ts`:
```typescript
it('rejects tasks for an archived plant', () => {
  const { db, plantId } = dbWithPlant();
  archivePlant(db, plantId, 'other', NOW);
  expect(() => createPlantTask(db, plantId, { title: 'x', kind: 'other' }, NOW)).toThrow();
});
```
Import `archivePlant` from `../db/plants.js`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/db/plants.test.ts src/care/plantTasks.test.ts`
Expected: FAIL (functions not exported).

- [ ] **Step 3: Update the schema**

In `backend/src/db/database.ts`, replace the plants CREATE TABLE (drop the inline `UNIQUE(...)`) and add the partial index after it:
```sql
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
  removed_at TEXT,
  removed_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plants_active_slot
  ON plants (gardyn_id, col, position) WHERE removed_at IS NULL;
```

- [ ] **Step 4: Implement the repo operations**

In `backend/src/db/plants.ts`:
- Extend `Plant`/`PlantRow`/`toPlant` with `removedAt`/`removed_at` and `removedReason`/`removed_reason`.
- `listPlants`: add `WHERE removed_at IS NULL`.
- Add:
```typescript
import { listGardens } from './gardens.js';

export type RemoveReason = 'harvested' | 'died' | 'other';

export class SlotOccupiedError extends Error {}
export class InvalidSlotError extends Error {}

function validateSlot(db: Database.Database, gardynId: string, col: number, position: number): void {
  const garden = listGardens(db).find((g) => g.id === gardynId);
  if (!garden || col < 1 || col > garden.cols || position < 1 || position > garden.positionsPerCol) {
    throw new InvalidSlotError(`no slot (${col}, ${position}) in ${gardynId}`);
  }
}

function activePlantAt(db: Database.Database, gardynId: string, col: number, position: number): PlantRow | undefined {
  return db
    .prepare('SELECT * FROM plants WHERE gardyn_id = ? AND col = ? AND position = ? AND removed_at IS NULL')
    .get(gardynId, col, position) as PlantRow | undefined;
}

export function createPlant(db: Database.Database, input: {
  gardynId: string; col: number; position: number; name: string;
  variety?: string | null; plantedAt?: string | null; notes?: string | null;
  careInstructions?: string | null; about?: string | null; uses?: string | null;
}): Plant {
  validateSlot(db, input.gardynId, input.col, input.position);
  if (activePlantAt(db, input.gardynId, input.col, input.position)) {
    throw new SlotOccupiedError(`slot (${input.col}, ${input.position}) in ${input.gardynId} is occupied`);
  }
  const result = db
    .prepare(
      `INSERT INTO plants (gardyn_id, col, position, name, variety, planted_at, notes, care_instructions, about, uses)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.gardynId, input.col, input.position, input.name,
      input.variety ?? null, input.plantedAt ?? null, input.notes ?? null,
      input.careInstructions ?? null, input.about ?? null, input.uses ?? null,
    );
  return getPlant(db, Number(result.lastInsertRowid))!;
}

export function archivePlant(db: Database.Database, id: number, reason: RemoveReason, now: string): boolean {
  const plant = getPlant(db, id);
  if (!plant || plant.removedAt) return false;
  const tx = db.transaction(() => {
    db.prepare('UPDATE plants SET removed_at = ?, removed_reason = ? WHERE id = ?').run(now, reason, id);
    // Open tasks are no longer actionable; completed history stays for v1 analytics.
    db.prepare('DELETE FROM chores WHERE plant_id = ? AND completed_at IS NULL').run(id);
  });
  tx();
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
  if (plant.gardynId === target.gardynId && plant.col === target.col && plant.position === target.position) {
    return 'invalid';
  }
  const occupant = activePlantAt(db, target.gardynId, target.col, target.position);
  const setSlot = db.prepare('UPDATE plants SET gardyn_id = ?, col = ?, position = ? WHERE id = ?');
  const followTasks = db.prepare('UPDATE chores SET gardyn_id = ? WHERE plant_id = ? AND completed_at IS NULL');
  const tx = db.transaction(() => {
    if (occupant) {
      // Swap dance: park the moving plant on a temp position to satisfy the partial unique index.
      setSlot.run(plant.gardynId, plant.col, -id, id);
      setSlot.run(plant.gardynId, plant.col, plant.position, occupant.id);
      setSlot.run(target.gardynId, target.col, target.position, id);
      followTasks.run(plant.gardynId, occupant.id);
    } else {
      setSlot.run(target.gardynId, target.col, target.position, id);
    }
    followTasks.run(target.gardynId, id);
  });
  tx();
  return occupant ? 'swapped' : 'moved';
}
```

In `backend/src/care/plantTasks.ts`, `createPlantTask`: after fetching the plant, also throw when `plant.removedAt` is set:
```typescript
if (!plant || plant.removedAt) throw new Error(`plant ${plantId} not found or archived`);
```

- [ ] **Step 5: Run the tests, full suite, commit**

Run: `cd backend && npx vitest run src/db/plants.test.ts src/care/plantTasks.test.ts && npm test`
Expected: all PASS (the old gardens.test.ts UNIQUE test still passes: it inserts two ACTIVE plants at the same slot, now caught by the partial index).

```bash
git add backend/src/
git commit -m "feat: plant lifecycle repo (create, archive with reason, move with swap)"
```

---

### Task 2: Lifecycle routes

**Files:**
- Modify: `backend/src/routes/garden.ts`
- Test: extend `backend/src/routes/garden.test.ts`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces (HTTP):
  - `POST /api/plants` body `{ gardynId, col, position, name, variety?, plantedAt?, notes?, careInstructions?, about?, uses? }` -> `{ plant }`; 400 missing/empty name or invalid slot; 409 occupied slot
  - `DELETE /api/plants/:id` body `{ reason: 'harvested' | 'died' | 'other' }` -> `{ ok: true }`; 400 bad reason; 404 missing/already archived
  - `PATCH /api/plants/:id/position` body `{ gardynId, col, position }` -> `{ ok: true, swapped: boolean }`; 400 invalid target; 404 missing/archived

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/routes/garden.test.ts`:
```typescript
it('POST /api/plants creates in an empty slot, 409s occupied, 400s bad input', async () => {
  const { app } = appWith(':memory:routes-create');
  const ok = await request(app).post('/api/plants').send({
    gardynId: 'gardyn-1', col: 1, position: 3, name: 'Dill', variety: 'Bouquet',
  });
  expect(ok.status).toBe(200);
  expect(ok.body.plant.name).toBe('Dill');
  const dup = await request(app).post('/api/plants').send({
    gardynId: 'gardyn-1', col: 1, position: 3, name: 'Mint',
  });
  expect(dup.status).toBe(409);
  const noName = await request(app).post('/api/plants').send({ gardynId: 'gardyn-1', col: 1, position: 4 });
  expect(noName.status).toBe(400);
  const badSlot = await request(app).post('/api/plants').send({
    gardynId: 'gardyn-1', col: 9, position: 1, name: 'Mint',
  });
  expect(badSlot.status).toBe(400);
});

it('DELETE /api/plants/:id archives with a reason', async () => {
  const { app, db } = appWith(':memory:routes-archive');
  const created = await request(app).post('/api/plants').send({
    gardynId: 'gardyn-1', col: 1, position: 1, name: 'Basil',
  });
  const id = created.body.plant.id;
  const badReason = await request(app).delete(`/api/plants/${id}`).send({ reason: 'vanished' });
  expect(badReason.status).toBe(400);
  const ok = await request(app).delete(`/api/plants/${id}`).send({ reason: 'harvested' });
  expect(ok.status).toBe(200);
  const row: any = db.prepare('SELECT removed_reason FROM plants WHERE id = ?').get(id);
  expect(row.removed_reason).toBe('harvested');
  const again = await request(app).delete(`/api/plants/${id}`).send({ reason: 'other' });
  expect(again.status).toBe(404);
});

it('PATCH /api/plants/:id/position moves and swaps', async () => {
  const { app } = appWith(':memory:routes-move');
  const a = (await request(app).post('/api/plants').send({ gardynId: 'gardyn-1', col: 1, position: 1, name: 'A' })).body.plant;
  const b = (await request(app).post('/api/plants').send({ gardynId: 'gardyn-2', col: 2, position: 5, name: 'B' })).body.plant;
  const move = await request(app).patch(`/api/plants/${a.id}/position`).send({ gardynId: 'gardyn-1', col: 3, position: 7 });
  expect(move.status).toBe(200);
  expect(move.body.swapped).toBe(false);
  const swap = await request(app).patch(`/api/plants/${a.id}/position`).send({ gardynId: 'gardyn-2', col: 2, position: 5 });
  expect(swap.status).toBe(200);
  expect(swap.body.swapped).toBe(true);
  const bad = await request(app).patch(`/api/plants/${a.id}/position`).send({ gardynId: 'gardyn-1', col: 99, position: 1 });
  expect(bad.status).toBe(400);
  const missing = await request(app).patch('/api/plants/9999/position').send({ gardynId: 'gardyn-1', col: 1, position: 2 });
  expect(missing.status).toBe(404);
});
```
Note: these tests call `seedDefaultGardens` via `appWith` if the helper already seeds; if not, add `seedDefaultGardens(db)` per test (follow the file's existing pattern).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/routes/garden.test.ts`
Expected: new tests FAIL (routes missing).

- [ ] **Step 3: Implement the routes**

In `backend/src/routes/garden.ts` (inside `makeGardenRouter`), import `createPlant, archivePlant, movePlant, SlotOccupiedError, InvalidSlotError` and `RemoveReason` type from `../db/plants.js`:
```typescript
const REMOVE_REASONS = ['harvested', 'died', 'other'];

router.post('/plants', (req, res) => {
  const { gardynId, col, position, name, variety, plantedAt, notes, careInstructions, about, uses } = req.body ?? {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
  try {
    const plant = createPlant(db, { gardynId, col, position, name, variety, plantedAt, notes, careInstructions, about, uses });
    res.json({ plant });
  } catch (err) {
    if (err instanceof SlotOccupiedError) return res.status(409).json({ error: 'slot occupied' });
    if (err instanceof InvalidSlotError) return res.status(400).json({ error: 'invalid slot' });
    throw err;
  }
});

router.delete('/plants/:id', (req, res) => {
  const { reason } = req.body ?? {};
  if (!REMOVE_REASONS.includes(reason)) return res.status(400).json({ error: 'invalid reason' });
  const ok = archivePlant(db, Number(req.params.id), reason, now().toISOString());
  if (!ok) return res.status(404).json({ ok: false });
  res.json({ ok: true });
});

router.patch('/plants/:id/position', (req, res) => {
  const { gardynId, col, position } = req.body ?? {};
  const result = movePlant(db, Number(req.params.id), { gardynId, col, position });
  if (result === 'missing') return res.status(404).json({ ok: false });
  if (result === 'invalid') return res.status(400).json({ error: 'invalid target' });
  res.json({ ok: true, swapped: result === 'swapped' });
});
```
Route-ordering note: register `PATCH /plants/:id/position` and it will not clash with `PUT /plants/:id` (different method/path).

- [ ] **Step 4: Full suite, commit**

Run: `cd backend && npm test`
Expected: all PASS.

```bash
git add backend/src/routes/
git commit -m "feat: plant lifecycle routes (create, archive, move/swap)"
```

---

### Task 3: Frontend api client additions

**Files:**
- Modify: `frontend/src/api.ts`

**Interfaces:**
- Produces:
  - `Plant` gains `removedAt: string | null; removedReason: string | null` (returned by POST; list stays active-only)
  - `type RemoveReason = 'harvested' | 'died' | 'other'`
  - `createPlant(input: { gardynId: string; col: number; position: number; name: string; variety?: string | null; plantedAt?: string | null; notes?: string | null; careInstructions?: string | null; about?: string | null; uses?: string | null }): Promise<Plant>`
  - `removePlant(id: number, reason: RemoveReason): Promise<void>`
  - `movePlant(id: number, target: { gardynId: string; col: number; position: number }): Promise<{ swapped: boolean }>`

- [ ] **Step 1: Implement**

Add to `frontend/src/api.ts` (sendJson already exists):
```typescript
export type RemoveReason = 'harvested' | 'died' | 'other';

export async function createPlant(input: {
  gardynId: string; col: number; position: number; name: string;
  variety?: string | null; plantedAt?: string | null; notes?: string | null;
  careInstructions?: string | null; about?: string | null; uses?: string | null;
}): Promise<Plant> {
  const body = await sendJson<{ plant: Plant }>('/api/plants', 'POST', input);
  return body.plant;
}

export async function removePlant(id: number, reason: RemoveReason): Promise<void> {
  await sendJson(`/api/plants/${id}`, 'DELETE', { reason });
}

export async function movePlant(
  id: number,
  target: { gardynId: string; col: number; position: number },
): Promise<{ swapped: boolean }> {
  const body = await sendJson<{ ok: true; swapped: boolean }>(`/api/plants/${id}/position`, 'PATCH', target);
  return { swapped: body.swapped };
}
```
Extend the `Plant` interface with `removedAt: string | null; removedReason: string | null`.

- [ ] **Step 2: Verify build, commit**

Run: `cd frontend && npx tsc -b && npm run build`
Expected: clean.

```bash
git add frontend/src/api.ts
git commit -m "feat: api client plant lifecycle (create, remove, move)"
```

---

### Task 4: Tap-empty-slot add form

**Files:**
- Create: `frontend/src/components/AddPlantModal.tsx`
- Modify: `frontend/src/components/GardenPage.tsx` (empty slots become buttons; new `onEmptySlotClick` prop)
- Modify: `frontend/src/App.tsx` (addTarget state, render AddPlantModal)

**Interfaces:**
- Consumes: `createPlant` from `../api`.
- Produces:
  - `<AddPlantModal gardenId={string} gardenName={string} col={number} position={number} onClose={() => void} onAdded={() => void} />`
  - `GardenPage` gains prop `onEmptySlotClick: (col: number, position: number) => void`

- [ ] **Step 1: AddPlantModal**

Create `frontend/src/components/AddPlantModal.tsx` (rich form per spec decision 5; same dark modal styling as PlantModal):
```tsx
import { useState } from 'react';
import { createPlant } from '../api';

function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AddPlantModal({
  gardenId,
  gardenName,
  col,
  position,
  onClose,
  onAdded,
}: {
  gardenId: string;
  gardenName: string;
  col: number;
  position: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [variety, setVariety] = useState('');
  const [plantedAt, setPlantedAt] = useState(todayLocalDate());
  const [careInstructions, setCareInstructions] = useState('');
  const [about, setAbout] = useState('');
  const [uses, setUses] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    try {
      setError(null);
      await createPlant({
        gardynId: gardenId,
        col,
        position,
        name: name.trim(),
        variety: variety || null,
        plantedAt: plantedAt || null,
        careInstructions: careInstructions || null,
        about: about || null,
        uses: uses || null,
        notes: notes || null,
      });
      onAdded();
      onClose();
    } catch (err) {
      console.error('add plant failed:', err);
      setError('That did not save, try again');
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
          <button onClick={submit} className="rounded-lg bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600">
            Add plant
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: GardenPage empty slots become buttons**

In `frontend/src/components/GardenPage.tsx`, add `onEmptySlotClick: (col: number, position: number) => void` to the props and replace the empty-slot `<div>` with:
```tsx
<button
  key={position}
  onClick={() => onEmptySlotClick(col, position)}
  className="w-full rounded-xl border border-dashed border-slate-800 px-3 py-2 text-center text-xs text-slate-700 hover:border-slate-600 hover:text-slate-500"
>
  {position}
</button>
```

- [ ] **Step 3: App wiring**

In `frontend/src/App.tsx`:
```tsx
import AddPlantModal from './components/AddPlantModal';
// state:
const [addTarget, setAddTarget] = useState<{ col: number; position: number } | null>(null);
// pass to GardenPage:
onEmptySlotClick={(col, position) => setAddTarget({ col, position })}
// render (near PlantModal render; garden is the currently paged garden):
{addTarget && garden && (
  <AddPlantModal
    gardenId={garden.gardynId}
    gardenName={garden.name}
    col={addTarget.col}
    position={addTarget.position}
    onClose={() => setAddTarget(null)}
    onAdded={() => void load()}
  />
)}
```

- [ ] **Step 4: Verify build, commit**

Run: `cd frontend && npx tsc -b && npm run build`
Expected: clean.

```bash
git add frontend/src/
git commit -m "feat: tap an empty slot to add a plant"
```

---

### Task 5: Remove and move flows in the plant modal

**Files:**
- Modify: `frontend/src/components/PlantModal.tsx` (Remove with reason confirm; Move with slot picker)

**Interfaces:**
- Consumes: `removePlant`, `movePlant`, `RemoveReason` from `../api`; needs `gardens: GardenStatus[]` and `plants: Plant[]` as new props (for the move picker's target grid) — App already has both; add props `gardens` and `allPlants` to PlantModal and pass from App.

- [ ] **Step 1: Remove flow**

In `PlantModal.tsx`, add state `const [confirmingRemove, setConfirmingRemove] = useState(false);` and a section below the tasks block:
```tsx
<div className="mt-6 border-t border-slate-800 pt-4">
  {!confirmingRemove ? (
    <button
      onClick={() => setConfirmingRemove(true)}
      className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-red-400 hover:bg-red-950"
    >
      Remove plant...
    </button>
  ) : (
    <div className="space-y-2">
      <p className="text-sm text-slate-300">Why is {plant.name} coming out?</p>
      <div className="flex flex-wrap gap-2">
        {(['harvested', 'died', 'other'] as RemoveReason[]).map((reason) => (
          <button
            key={reason}
            onClick={() =>
              run(async () => {
                await removePlant(plant.id, reason);
                onClose();
              })
            }
            className="rounded-lg bg-red-900 px-4 py-2 text-sm font-medium capitalize hover:bg-red-800"
          >
            {reason}
          </button>
        ))}
        <button
          onClick={() => setConfirmingRemove(false)}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-slate-500">
        The plant leaves the grid but its history is kept.
      </p>
    </div>
  )}
</div>
```
Import `removePlant` and the `RemoveReason` type.

- [ ] **Step 2: Move flow**

Add props `gardens: GardenStatus[]` and `allPlants: Plant[]`, state `const [moving, setMoving] = useState(false);` and `const [moveGarden, setMoveGarden] = useState(plant.gardynId);`, and a Move section (above Remove):
```tsx
<div className="mt-6 border-t border-slate-800 pt-4">
  {!moving ? (
    <button onClick={() => setMoving(true)} className="rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700">
      Move plant...
    </button>
  ) : (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-300">Move to</span>
        <select
          value={moveGarden}
          onChange={(e) => setMoveGarden(e.target.value)}
          className="rounded-lg bg-slate-800 px-2 py-1 text-sm text-slate-100"
        >
          {gardens.map((g) => (
            <option key={g.gardynId} value={g.gardynId}>{g.name}</option>
          ))}
        </select>
        <button onClick={() => setMoving(false)} className="ml-auto rounded-lg bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700">
          Cancel
        </button>
      </div>
      <p className="text-xs text-slate-500">Tap a slot. Occupied slots swap the two plants.</p>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((col) => (
          <div key={col} className="space-y-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((position) => {
              const occupant = allPlants.find(
                (p) => p.gardynId === moveGarden && p.col === col && p.position === position,
              );
              const isCurrent = occupant?.id === plant.id;
              return (
                <button
                  key={position}
                  disabled={isCurrent}
                  onClick={() =>
                    run(async () => {
                      await movePlant(plant.id, { gardynId: moveGarden, col, position });
                      setMoving(false);
                    })
                  }
                  className={`w-full rounded-lg px-2 py-1 text-xs ${
                    isCurrent
                      ? 'bg-emerald-900 text-emerald-300'
                      : occupant
                        ? 'bg-amber-900 text-amber-200 hover:bg-amber-800'
                        : 'border border-dashed border-slate-700 text-slate-500 hover:border-slate-500'
                  }`}
                >
                  {occupant ? occupant.name : position}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  )}
</div>
```
Import `movePlant`. In `App.tsx`, pass `gardens={gardens}` and `allPlants={plants}` to PlantModal.
Note: the move grid hardcodes 3x10 like GardenPage; if geometry ever varies per garden, both read from `gardens` — acceptable to keep the constant for now, matching GardenPage.

- [ ] **Step 3: Verify build, commit**

Run: `cd frontend && npx tsc -b && npm run build`
Expected: clean.

```bash
git add frontend/src/
git commit -m "feat: move (with swap) and remove (archive with reason) in the plant modal"
```

---

### Task 6: E2E verification + README

**Files:**
- Modify: `README.md` (one feature bullet: full plant lifecycle)

- [ ] **Step 1: Full backend suite**

Run: `cd backend && npm test`
Expected: green.

- [ ] **Step 2: Production build + live smoke**

```bash
rm -f backend/drip-dash.db* drip-dash.db*
npm run build && npm start &
sleep 2
PLANT=$(curl -s -X POST localhost:3001/api/plants -H 'Content-Type: application/json' -d '{"gardynId":"gardyn-1","col":1,"position":1,"name":"Smoke Dill"}')
echo "$PLANT" | head -c 200
ID=$(echo "$PLANT" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).plant.id))")
curl -s -X PATCH localhost:3001/api/plants/$ID/position -H 'Content-Type: application/json' -d '{"gardynId":"gardyn-2","col":1,"position":2}' | head -c 100
curl -s -X DELETE localhost:3001/api/plants/$ID -H 'Content-Type: application/json' -d '{"reason":"other"}' | head -c 100
curl -s localhost:3001/api/plants | node -e "process.stdin.on('data',d=>console.log('active plants:', JSON.parse(d).plants.length))"
kill %1
```
Expected: create returns the plant; move returns swapped:false; delete ok:true; active count back to the seeded 6.

- [ ] **Step 3: README bullet + commit**

Add one Features bullet: full plant lifecycle (tap an empty slot to add, move or swap from the modal, remove with a reason and kept history). No emdashes.

```bash
git add README.md
git commit -m "docs: phase 1.6 lifecycle notes"
```

- [ ] **Step 4: Hand off run commands (do not auto-launch)**

---

## Self-Review

**Spec coverage:** tap-empty-slot rich add -> Tasks 2 (POST), 3, 4 (decision 5). Archive + reason + history kept + open tasks deleted -> Tasks 1, 2, 5 (decisions 2, 3, 6). Swap on occupied -> Tasks 1, 2, 5 (decision 4). Partial unique index -> Task 1. Slot geometry validation from gardens table -> Task 1. Active-only listPlants -> Task 1. Tasks follow plant on move (open chores' gardyn_id) -> Task 1. Archived plants invisible in UI -> listPlants filter. createPlantTask archived guard -> Task 1.

**Placeholder scan:** all code steps complete.

**Type consistency:** `createPlant`/`archivePlant`/`movePlant`/`RemoveReason`/`SlotOccupiedError`/`InvalidSlotError` (Tasks 1-2), client `createPlant`/`removePlant`/`movePlant` (Tasks 3-5), `Plant.removedAt`/`removedReason` (Tasks 1, 3), `onEmptySlotClick` (Task 4), PlantModal new props `gardens`/`allPlants` (Task 5) — consistent.

**Known risks:**
- Swap dance parks at `position = -id`, which violates no CHECK constraint (none exists) and is inside a transaction — safe single-process.
- Old gardens.test.ts slot-uniqueness test now relies on the partial index instead of the table constraint; behavior identical for active plants.
- Move grid in the modal hardcodes 3x10 like GardenPage (both should read garden geometry when gardens diversify — nursery era).
