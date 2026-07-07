# Drip Dash Revamp Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a glanceable garden dashboard + break-time chore board for two Gardyn systems, fed by a mock data source, running as one Node process on the Mac.

**Architecture:** Express + TypeScript backend with a `GardynDataSource` adapter (Phase 1 = `GardynMockSource`), an in-process `setInterval` poller that writes timestamped snapshots to SQLite and runs `computeChores()`, a small REST API, and a React/Vite kiosk-first frontend. The adapter interface is the seam that lets a real local Gardyn source swap in later with no UI change.

**Tech Stack:** Node 24, TypeScript (ESM), Express 5, better-sqlite3, Vitest, React 19, Vite, Tailwind v4.

**Ship target:** weekend of 2026-07-18/19 (low-pressure goal, not a deadline; mom visits the prior weekend).

## Global Constraints

- Repo: `~/dev/educational-repos/drip-dash`, work on branch `feat/revamp-spec` (spec already committed there).
- Backend and frontend are separate npm packages; `shared/types` is imported via the `@shared/*` path alias (already configured in `backend/tsconfig.json`).
- ESM everywhere (`"type": "module"`); relative imports in backend use `.js` extensions (tsx/tsc ESM requirement).
- No emdashes in any prose, comments, or UI copy (user writing rule).
- No Co-Authored-By trailers on commits (user rule).
- Commit author email must be the GitHub noreply `57885108+mindiweik@users.noreply.github.com` (already set repo-local; GitHub blocks the real email).
- SQLite via `better-sqlite3` (synchronous API). One file, no server.
- Two Gardyn units. Use stable string ids `"gardyn-1"` and `"gardyn-2"` throughout.
- Reminders stay in-app. Do NOT add Motion or any external notification integration.
- Test runner is Vitest in both packages. TDD: failing test first, then implementation.

---

### Task 1: Backend dependency swap and test runner

Remove MongoDB, add SQLite + Vitest, wire a test script. This unblocks every later backend task.

**Files:**
- Modify: `backend/package.json`
- Create: `backend/vitest.config.ts`
- Modify: `backend/src/index.ts` (remove MongoDB import/bootstrap)
- Delete: `backend/src/db/mongodb.ts`
- Delete: `backend/src/routes/systems.ts`, `backend/src/routes/tasks.ts`, `backend/src/routes/plants.ts` (stale stubs, replaced later)

**Interfaces:**
- Produces: a working `npm test` in `backend/` and a MongoDB-free `startServer()`.

- [ ] **Step 1: Install deps**

Run in `backend/`:
```bash
npm uninstall mongodb
npm install better-sqlite3
npm install -D vitest @types/better-sqlite3
```

- [ ] **Step 2: Add test script**

In `backend/package.json`, replace the `test` script line:
```json
"test": "vitest run",
"test:watch": "vitest",
```

- [ ] **Step 3: Create Vitest config**

Create `backend/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@shared': new URL('../shared', import.meta.url).pathname },
  },
});
```

- [ ] **Step 4: Strip MongoDB from the server entry**

Replace the full contents of `backend/src/index.ts`:
```typescript
import express from 'express';
import apiRouter from './routes/index.js';
import { Server } from 'http';

const app = express();
const PORT = process.env.PORT || 3001;
let server: Server | null = null;

app.use(express.json());
app.use('/api', apiRouter);

function startServer() {
  server = app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

function gracefulShutdown(signal: string) {
  console.log(`${signal} received: closing HTTP server`);
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();

export { app };
```

- [ ] **Step 5: Delete stale files**

```bash
rm backend/src/db/mongodb.ts backend/src/routes/systems.ts backend/src/routes/tasks.ts backend/src/routes/plants.ts
```

- [ ] **Step 6: Trim the router to health only**

Replace `backend/src/routes/index.ts`:
```typescript
import { Router } from 'express';
import healthRouter from './health.js';

const router = Router();
router.use('/health', healthRouter);

export default router;
```

- [ ] **Step 7: Verify it boots and tests run**

Run in `backend/`:
```bash
npm run test
npx tsx src/index.ts &
sleep 1 && curl -s localhost:3001/api/health && kill %1
```
Expected: Vitest reports "No test files found" (exit 0 is fine at this stage) and the health endpoint responds.

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "chore: swap MongoDB for SQLite, add Vitest, strip stale routes"
```

---

### Task 2: The GardynSnapshot shared type

Define the normalized shape every layer depends on. Modeled on the sensor set `garden-of-eden` proves is locally available, so the mock is realistic and a future local source has a known target.

**Files:**
- Create: `shared/types/gardyn.ts`
- Modify: `shared/types/index.ts`

**Interfaces:**
- Produces: `GardynSnapshot`, `LightState` types importable as `@shared/types`.

- [ ] **Step 1: Create the type**

Create `shared/types/gardyn.ts`:
```typescript
export type LightState = 'on' | 'off';

// Normalized reading from one Gardyn at one moment.
// Every data source (mock now, local later) returns exactly this shape.
export interface GardynSnapshot {
  gardynId: string;
  takenAt: string; // ISO timestamp
  waterLevelPct: number; // 0-100
  temperatureC: number;
  humidityPct: number; // 0-100
  light: LightState;
}
```

- [ ] **Step 2: Re-export it**

Replace `shared/types/index.ts`:
```typescript
export * from './plants';
export * from './system';
export * from './task';
export * from './gardyn';
```

- [ ] **Step 3: Commit**

```bash
git add shared/
git commit -m "feat: add GardynSnapshot shared type"
```

---

### Task 3: GardynDataSource interface and GardynMockSource

The adapter seam plus the Phase 1 mock. TDD the mock's determinism and its lifelike drift.

**Files:**
- Create: `backend/src/datasources/GardynDataSource.ts`
- Create: `backend/src/datasources/GardynMockSource.ts`
- Test: `backend/src/datasources/GardynMockSource.test.ts`

**Interfaces:**
- Consumes: `GardynSnapshot`, `LightState` from `@shared/types`.
- Produces:
  - `interface GardynDataSource { fetchSnapshot(gardynId: string): Promise<GardynSnapshot> }`
  - `class GardynMockSource implements GardynDataSource` with constructor `new GardynMockSource(opts?: { seed?: number; now?: () => Date })`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/datasources/GardynMockSource.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { GardynMockSource } from './GardynMockSource.js';

describe('GardynMockSource', () => {
  it('returns a snapshot with the requested gardynId and in-range values', async () => {
    const src = new GardynMockSource({ seed: 1, now: () => new Date('2026-07-06T12:00:00Z') });
    const snap = await src.fetchSnapshot('gardyn-1');
    expect(snap.gardynId).toBe('gardyn-1');
    expect(snap.takenAt).toBe('2026-07-06T12:00:00.000Z');
    expect(snap.waterLevelPct).toBeGreaterThanOrEqual(0);
    expect(snap.waterLevelPct).toBeLessThanOrEqual(100);
    expect(['on', 'off']).toContain(snap.light);
  });

  it('is deterministic for the same seed and time', async () => {
    const opts = { seed: 42, now: () => new Date('2026-07-06T12:00:00Z') };
    const a = await new GardynMockSource(opts).fetchSnapshot('gardyn-1');
    const b = await new GardynMockSource(opts).fetchSnapshot('gardyn-1');
    expect(a).toEqual(b);
  });

  it('reports light off at night (02:00) and on during the day (12:00)', async () => {
    const night = await new GardynMockSource({ now: () => new Date('2026-07-06T02:00:00Z') }).fetchSnapshot('gardyn-1');
    const day = await new GardynMockSource({ now: () => new Date('2026-07-06T12:00:00Z') }).fetchSnapshot('gardyn-1');
    expect(night.light).toBe('off');
    expect(day.light).toBe('on');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run src/datasources/GardynMockSource.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the interface**

Create `backend/src/datasources/GardynDataSource.ts`:
```typescript
import type { GardynSnapshot } from '@shared/types';

export interface GardynDataSource {
  fetchSnapshot(gardynId: string): Promise<GardynSnapshot>;
}
```

- [ ] **Step 4: Write the mock**

Create `backend/src/datasources/GardynMockSource.ts`:
```typescript
import type { GardynDataSource } from './GardynDataSource.js';
import type { GardynSnapshot, LightState } from '@shared/types';

interface MockOpts {
  seed?: number;
  now?: () => Date;
}

// Deterministic pseudo-random in [0,1) from an integer seed.
function rand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export class GardynMockSource implements GardynDataSource {
  private seed: number;
  private now: () => Date;

  constructor(opts: MockOpts = {}) {
    this.seed = opts.seed ?? 7;
    this.now = opts.now ?? (() => new Date());
  }

  async fetchSnapshot(gardynId: string): Promise<GardynSnapshot> {
    const at = this.now();
    const hour = at.getUTCHours();
    // Lights on 06:00-22:00 UTC, off overnight.
    const light: LightState = hour >= 6 && hour < 22 ? 'on' : 'off';
    // Seed jitter by gardynId so the two units differ.
    const idSalt = gardynId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const r = (n: number) => rand(this.seed + idSalt + n);
    // Water slowly drains across the day (100 at midnight down toward ~40).
    const waterLevelPct = Math.round(100 - (hour / 24) * 55 - r(1) * 5);
    const temperatureC = Math.round((21 + r(2) * 4) * 10) / 10;
    const humidityPct = Math.round(55 + r(3) * 15);
    return {
      gardynId,
      takenAt: at.toISOString(),
      waterLevelPct: Math.max(0, Math.min(100, waterLevelPct)),
      temperatureC,
      humidityPct,
      light,
    };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx vitest run src/datasources/GardynMockSource.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/datasources/
git commit -m "feat: add GardynDataSource interface and deterministic GardynMockSource"
```

---

### Task 4: SQLite schema and connection

One database module: opens the file, creates the four tables if absent, exposes the handle. Snapshot persistence is proven with a round-trip test.

**Files:**
- Create: `backend/src/db/database.ts`
- Test: `backend/src/db/database.test.ts`

**Interfaces:**
- Produces:
  - `getDb(path?: string): Database` (better-sqlite3 instance; defaults to `process.env.DB_PATH ?? 'drip-dash.db'`; in-memory when passed `':memory:'`).
  - Tables: `snapshots(id, gardyn_id, taken_at, data)`, `care_schedules(id, gardyn_id, name, every_days, last_done_at)`, `chores(id, gardyn_id, title, source, created_at, completed_at)`, `plants(id, gardyn_id, slot, name, variety, planted_at, notes)`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/db/database.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getDb } from './database.js';

describe('database', () => {
  it('creates the four tables', () => {
    const db = getDb(':memory:');
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    expect(rows).toEqual(expect.arrayContaining(['snapshots', 'care_schedules', 'chores', 'plants']));
  });

  it('round-trips a snapshot row', () => {
    const db = getDb(':memory:');
    db.prepare('INSERT INTO snapshots (gardyn_id, taken_at, data) VALUES (?, ?, ?)').run(
      'gardyn-1',
      '2026-07-06T12:00:00.000Z',
      JSON.stringify({ waterLevelPct: 80 }),
    );
    const row: any = db.prepare('SELECT * FROM snapshots WHERE gardyn_id = ?').get('gardyn-1');
    expect(JSON.parse(row.data).waterLevelPct).toBe(80);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run src/db/database.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the database module**

Create `backend/src/db/database.ts`:
```typescript
import Database from 'better-sqlite3';

let instances = new Map<string, Database.Database>();

const SCHEMA = `
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gardyn_id TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS care_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gardyn_id TEXT,
  name TEXT NOT NULL,
  every_days INTEGER NOT NULL,
  last_done_at TEXT
);
CREATE TABLE IF NOT EXISTS chores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gardyn_id TEXT,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS plants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gardyn_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  name TEXT NOT NULL,
  variety TEXT,
  planted_at TEXT,
  notes TEXT
);
`;

export function getDb(path?: string): Database.Database {
  const key = path ?? process.env.DB_PATH ?? 'drip-dash.db';
  let db = instances.get(key);
  if (!db) {
    db = new Database(key);
    db.pragma('journal_mode = WAL');
    db.exec(SCHEMA);
    instances.set(key, db);
  }
  return db;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run src/db/database.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/
git commit -m "feat: SQLite schema and connection module"
```

---

### Task 5: Snapshot repository

Thin data-access functions over the `snapshots` table: insert a `GardynSnapshot`, read the latest per Gardyn.

**Files:**
- Create: `backend/src/db/snapshots.ts`
- Test: `backend/src/db/snapshots.test.ts`

**Interfaces:**
- Consumes: `getDb`, `GardynSnapshot`.
- Produces:
  - `insertSnapshot(db, snap: GardynSnapshot): void`
  - `getLatestSnapshot(db, gardynId: string): GardynSnapshot | null`

- [ ] **Step 1: Write the failing test**

Create `backend/src/db/snapshots.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getDb } from './database.js';
import { insertSnapshot, getLatestSnapshot } from './snapshots.js';
import type { GardynSnapshot } from '@shared/types';

function snap(over: Partial<GardynSnapshot> = {}): GardynSnapshot {
  return {
    gardynId: 'gardyn-1',
    takenAt: '2026-07-06T12:00:00.000Z',
    waterLevelPct: 80,
    temperatureC: 22,
    humidityPct: 60,
    light: 'on',
    ...over,
  };
}

describe('snapshots repo', () => {
  it('returns null when there are no snapshots', () => {
    const db = getDb(':memory:');
    expect(getLatestSnapshot(db, 'gardyn-1')).toBeNull();
  });

  it('returns the most recent snapshot by takenAt', () => {
    const db = getDb(':memory:');
    insertSnapshot(db, snap({ takenAt: '2026-07-06T10:00:00.000Z', waterLevelPct: 90 }));
    insertSnapshot(db, snap({ takenAt: '2026-07-06T12:00:00.000Z', waterLevelPct: 70 }));
    const latest = getLatestSnapshot(db, 'gardyn-1');
    expect(latest?.waterLevelPct).toBe(70);
    expect(latest?.light).toBe('on');
  });
});
```

Note: `getDb(':memory:')` returns the same cached in-memory handle within a test file run, so give each test its own data expectations accordingly. Here the first test reads before any insert, the second inserts its own rows; if cross-test isolation is ever needed, pass a unique key like `':memory:1'`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run src/db/snapshots.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the repository**

Create `backend/src/db/snapshots.ts`:
```typescript
import type Database from 'better-sqlite3';
import type { GardynSnapshot } from '@shared/types';

export function insertSnapshot(db: Database.Database, snap: GardynSnapshot): void {
  db.prepare('INSERT INTO snapshots (gardyn_id, taken_at, data) VALUES (?, ?, ?)').run(
    snap.gardynId,
    snap.takenAt,
    JSON.stringify(snap),
  );
}

export function getLatestSnapshot(db: Database.Database, gardynId: string): GardynSnapshot | null {
  const row: any = db
    .prepare('SELECT data FROM snapshots WHERE gardyn_id = ? ORDER BY taken_at DESC LIMIT 1')
    .get(gardynId);
  return row ? (JSON.parse(row.data) as GardynSnapshot) : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run src/db/snapshots.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/snapshots.ts backend/src/db/snapshots.test.ts
git commit -m "feat: snapshot repository (insert + latest)"
```

---

### Task 6: Care schedules, chores repo, and computeChores()

The only real logic in the system. TDD it hard: schedule due, trigger fires, dedupe, completion stamping.

**Files:**
- Create: `backend/src/care/chores.ts` (repo helpers + `computeChores`)
- Create: `backend/src/care/seed.ts` (default schedules)
- Test: `backend/src/care/chores.test.ts`

**Interfaces:**
- Consumes: `getDb`, `getLatestSnapshot`, `GardynSnapshot`.
- Produces:
  - `interface Chore { id: number; gardynId: string | null; title: string; source: 'schedule' | 'data-trigger'; createdAt: string; completedAt: string | null }`
  - `getOpenChores(db): Chore[]`
  - `completeChore(db, id: number, now: string): void`
  - `computeChores(db, now: string): void`
  - `seedDefaultSchedules(db): void`
  - `WATER_LOW_THRESHOLD = 45`

- [ ] **Step 1: Write the failing test**

Create `backend/src/care/chores.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getDb } from '../db/database.js';
import { insertSnapshot } from '../db/snapshots.js';
import {
  computeChores,
  getOpenChores,
  completeChore,
  seedDefaultSchedules,
  WATER_LOW_THRESHOLD,
} from './chores.js';
import type { GardynSnapshot } from '@shared/types';

let dbCounter = 0;
function freshDb() {
  return getDb(`:memory:care-${dbCounter++}`);
}

function snap(over: Partial<GardynSnapshot> = {}): GardynSnapshot {
  return {
    gardynId: 'gardyn-1',
    takenAt: '2026-07-06T12:00:00.000Z',
    waterLevelPct: 80,
    temperatureC: 22,
    humidityPct: 60,
    light: 'on',
    ...over,
  };
}

describe('computeChores', () => {
  it('creates a water top-up chore when water is below threshold', () => {
    const db = freshDb();
    insertSnapshot(db, snap({ waterLevelPct: WATER_LOW_THRESHOLD - 1 }));
    computeChores(db, '2026-07-06T12:00:00.000Z');
    const open = getOpenChores(db);
    expect(open.some((c) => c.source === 'data-trigger' && c.title.includes('water'))).toBe(true);
  });

  it('does not duplicate an open water chore on repeated runs', () => {
    const db = freshDb();
    insertSnapshot(db, snap({ waterLevelPct: 10 }));
    computeChores(db, '2026-07-06T12:00:00.000Z');
    computeChores(db, '2026-07-06T12:15:00.000Z');
    const water = getOpenChores(db).filter((c) => c.title.includes('water'));
    expect(water.length).toBe(1);
  });

  it('creates a schedule chore when a schedule is past due', () => {
    const db = freshDb();
    db.prepare(
      'INSERT INTO care_schedules (gardyn_id, name, every_days, last_done_at) VALUES (?, ?, ?, ?)',
    ).run('gardyn-1', 'Add nutrients', 14, '2026-06-01T12:00:00.000Z');
    computeChores(db, '2026-07-06T12:00:00.000Z');
    expect(getOpenChores(db).some((c) => c.title.includes('nutrients'))).toBe(true);
  });

  it('does not create a schedule chore before it is due', () => {
    const db = freshDb();
    db.prepare(
      'INSERT INTO care_schedules (gardyn_id, name, every_days, last_done_at) VALUES (?, ?, ?, ?)',
    ).run('gardyn-1', 'Add nutrients', 14, '2026-07-05T12:00:00.000Z');
    computeChores(db, '2026-07-06T12:00:00.000Z');
    expect(getOpenChores(db).length).toBe(0);
  });

  it('completing a schedule chore stamps the schedule last_done_at', () => {
    const db = freshDb();
    db.prepare(
      'INSERT INTO care_schedules (gardyn_id, name, every_days, last_done_at) VALUES (?, ?, ?, ?)',
    ).run('gardyn-1', 'Add nutrients', 14, '2026-06-01T12:00:00.000Z');
    computeChores(db, '2026-07-06T12:00:00.000Z');
    const chore = getOpenChores(db).find((c) => c.title.includes('nutrients'))!;
    completeChore(db, chore.id, '2026-07-06T13:00:00.000Z');
    expect(getOpenChores(db).length).toBe(0);
    const sched: any = db.prepare('SELECT last_done_at FROM care_schedules WHERE name = ?').get('Add nutrients');
    expect(sched.last_done_at).toBe('2026-07-06T13:00:00.000Z');
    // And it does not immediately re-open (14 days not elapsed).
    computeChores(db, '2026-07-06T13:05:00.000Z');
    expect(getOpenChores(db).length).toBe(0);
  });

  it('seedDefaultSchedules inserts schedules for both gardyns once', () => {
    const db = freshDb();
    seedDefaultSchedules(db);
    seedDefaultSchedules(db);
    const count: any = db.prepare('SELECT COUNT(*) as n FROM care_schedules').get();
    expect(count.n).toBeGreaterThan(0);
    // idempotent: second call adds nothing
    const names = db.prepare('SELECT DISTINCT name FROM care_schedules').all();
    expect(names.length * 2).toBe(count.n); // one row per (name, gardyn) pair, 2 gardyns
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run src/care/chores.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the chores module**

Create `backend/src/care/chores.ts`:
```typescript
import type Database from 'better-sqlite3';
import { getLatestSnapshot } from '../db/snapshots.js';

export const WATER_LOW_THRESHOLD = 45;
const GARDYN_IDS = ['gardyn-1', 'gardyn-2'];

export interface Chore {
  id: number;
  gardynId: string | null;
  title: string;
  source: 'schedule' | 'data-trigger';
  createdAt: string;
  completedAt: string | null;
}

export function getOpenChores(db: Database.Database): Chore[] {
  const rows: any[] = db
    .prepare('SELECT * FROM chores WHERE completed_at IS NULL ORDER BY created_at ASC')
    .all();
  return rows.map((r) => ({
    id: r.id,
    gardynId: r.gardyn_id,
    title: r.title,
    source: r.source,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  }));
}

export function completeChore(db: Database.Database, id: number, now: string): void {
  const chore: any = db.prepare('SELECT * FROM chores WHERE id = ?').get(id);
  if (!chore) return;
  db.prepare('UPDATE chores SET completed_at = ? WHERE id = ?').run(now, id);
  if (chore.source === 'schedule') {
    // Match the schedule by the title we generated from its name.
    db.prepare(
      'UPDATE care_schedules SET last_done_at = ? WHERE ? LIKE \'%\' || name || \'%\' AND (gardyn_id IS ? OR gardyn_id IS NULL)',
    ).run(now, chore.title, chore.gardyn_id);
  }
}

function hasOpenChore(db: Database.Database, gardynId: string | null, title: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM chores WHERE completed_at IS NULL AND title = ? AND (gardyn_id IS ?)')
    .get(title, gardynId);
  return !!row;
}

function insertChore(
  db: Database.Database,
  gardynId: string | null,
  title: string,
  source: Chore['source'],
  now: string,
): void {
  if (hasOpenChore(db, gardynId, title)) return;
  db.prepare(
    'INSERT INTO chores (gardyn_id, title, source, created_at, completed_at) VALUES (?, ?, ?, ?, NULL)',
  ).run(gardynId, title, source, now);
}

function daysBetween(aIso: string, bIso: string): number {
  return (new Date(bIso).getTime() - new Date(aIso).getTime()) / (1000 * 60 * 60 * 24);
}

export function computeChores(db: Database.Database, now: string): void {
  // Data-driven: low water per gardyn.
  for (const gardynId of GARDYN_IDS) {
    const snap = getLatestSnapshot(db, gardynId);
    if (snap && snap.waterLevelPct < WATER_LOW_THRESHOLD) {
      insertChore(db, gardynId, `Top up water (${gardynId})`, 'data-trigger', now);
    }
  }
  // Schedule-driven.
  const schedules: any[] = db.prepare('SELECT * FROM care_schedules').all();
  for (const s of schedules) {
    const due = !s.last_done_at || daysBetween(s.last_done_at, now) >= s.every_days;
    if (due) {
      const suffix = s.gardyn_id ? ` (${s.gardyn_id})` : '';
      insertChore(db, s.gardyn_id ?? null, `${s.name}${suffix}`, 'schedule', now);
    }
  }
}

export function seedDefaultSchedules(db: Database.Database): void {
  const existing: any = db.prepare('SELECT COUNT(*) as n FROM care_schedules').get();
  if (existing.n > 0) return;
  const defaults = [
    { name: 'Add nutrients', everyDays: 14 },
    { name: 'Deep clean', everyDays: 60 },
  ];
  for (const gardynId of GARDYN_IDS) {
    for (const d of defaults) {
      db.prepare(
        'INSERT INTO care_schedules (gardyn_id, name, every_days, last_done_at) VALUES (?, ?, ?, NULL)',
      ).run(gardynId, d.name, d.everyDays);
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run src/care/chores.test.ts`
Expected: PASS (7 tests). If the completion-match test fails, inspect the generated title vs schedule name and adjust the LIKE match; the title always contains the schedule `name` as a substring by construction.

- [ ] **Step 5: Commit**

```bash
git add backend/src/care/
git commit -m "feat: care schedules, chores repo, and computeChores logic"
```

---

### Task 7: The poller

`setInterval` loop wrapped in try/catch, fires once on startup, wired to the mock source. Kept thin and injectable so it is testable without real timers.

**Files:**
- Create: `backend/src/poller/poller.ts`
- Test: `backend/src/poller/poller.test.ts`

**Interfaces:**
- Consumes: `GardynDataSource`, `getDb`, `insertSnapshot`, `computeChores`.
- Produces:
  - `pollOnce(db, source, now: string, gardynIds?: string[]): Promise<void>` (single cycle, used by tests and startup)
  - `startPolling(db, source, opts?: { intervalMs?: number }): () => void` (returns a stop function)

- [ ] **Step 1: Write the failing test**

Create `backend/src/poller/poller.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getDb } from '../db/database.js';
import { getLatestSnapshot } from '../db/snapshots.js';
import { getOpenChores } from '../care/chores.js';
import { GardynMockSource } from '../datasources/GardynMockSource.js';
import { pollOnce } from './poller.js';

describe('pollOnce', () => {
  it('writes a snapshot for each gardyn and runs chore computation', async () => {
    const db = getDb(':memory:poller-1');
    const source = new GardynMockSource({ now: () => new Date('2026-07-06T20:00:00Z') });
    await pollOnce(db, source, '2026-07-06T20:00:00.000Z', ['gardyn-1', 'gardyn-2']);
    expect(getLatestSnapshot(db, 'gardyn-1')).not.toBeNull();
    expect(getLatestSnapshot(db, 'gardyn-2')).not.toBeNull();
    // 20:00 UTC = late in the mock day, water is low, so a chore should exist.
    expect(getOpenChores(db).length).toBeGreaterThan(0);
  });

  it('does not throw if the source fails for one gardyn', async () => {
    const db = getDb(':memory:poller-2');
    const flaky = {
      fetchSnapshot: async (id: string) => {
        if (id === 'gardyn-2') throw new Error('boom');
        return new GardynMockSource().fetchSnapshot(id);
      },
    };
    await expect(pollOnce(db, flaky, '2026-07-06T20:00:00.000Z', ['gardyn-1', 'gardyn-2'])).resolves.toBeUndefined();
    expect(getLatestSnapshot(db, 'gardyn-1')).not.toBeNull();
    expect(getLatestSnapshot(db, 'gardyn-2')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run src/poller/poller.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the poller**

Create `backend/src/poller/poller.ts`:
```typescript
import type Database from 'better-sqlite3';
import type { GardynDataSource } from '../datasources/GardynDataSource.js';
import { insertSnapshot } from '../db/snapshots.js';
import { computeChores } from '../care/chores.js';

const DEFAULT_IDS = ['gardyn-1', 'gardyn-2'];

export async function pollOnce(
  db: Database.Database,
  source: GardynDataSource,
  now: string,
  gardynIds: string[] = DEFAULT_IDS,
): Promise<void> {
  for (const gardynId of gardynIds) {
    try {
      const snap = await source.fetchSnapshot(gardynId);
      insertSnapshot(db, snap);
    } catch (err) {
      console.error(`poll failed for ${gardynId}:`, err);
    }
  }
  computeChores(db, now);
}

export function startPolling(
  db: Database.Database,
  source: GardynDataSource,
  opts: { intervalMs?: number } = {},
): () => void {
  const intervalMs = opts.intervalMs ?? 15 * 60 * 1000;
  const tick = () => {
    void pollOnce(db, source, new Date().toISOString());
  };
  tick(); // fire once on startup so a fresh boot is not blank
  const handle = setInterval(tick, intervalMs);
  return () => clearInterval(handle);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run src/poller/poller.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/poller/
git commit -m "feat: in-process poller with per-gardyn failure isolation"
```

---

### Task 8: REST API routes

Four endpoints over the repos. `status` includes a staleness flag computed from the latest snapshot age.

**Files:**
- Create: `backend/src/routes/garden.ts`
- Modify: `backend/src/routes/index.ts`
- Test: `backend/src/routes/garden.test.ts`

**Interfaces:**
- Consumes: `getDb`, `getLatestSnapshot`, `getOpenChores`, `completeChore`.
- Produces (HTTP):
  - `GET /api/status` -> `{ gardens: Array<{ gardynId, snapshot: GardynSnapshot | null, stale: boolean, ageMinutes: number | null }> }`
  - `GET /api/chores` -> `{ chores: Chore[] }`
  - `POST /api/chores/:id/complete` -> `{ ok: true }`
  - `GET /api/plants` / `PUT /api/plants/:id` (metadata; minimal)

- [ ] **Step 1: Write the failing test**

Create `backend/src/routes/garden.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../db/database.js';
import { insertSnapshot } from '../db/snapshots.js';
import { makeGardenRouter } from './garden.js';
import type { GardynSnapshot } from '@shared/types';

function appWith(dbKey: string) {
  const db = getDb(dbKey);
  const app = express();
  app.use(express.json());
  app.use('/api', makeGardenRouter(db, () => new Date('2026-07-06T12:10:00.000Z')));
  return { app, db };
}

const snap: GardynSnapshot = {
  gardynId: 'gardyn-1',
  takenAt: '2026-07-06T12:00:00.000Z',
  waterLevelPct: 80,
  temperatureC: 22,
  humidityPct: 60,
  light: 'on',
};

describe('garden routes', () => {
  it('GET /api/status reports snapshot age and stale=false when recent', async () => {
    const { app, db } = appWith(':memory:routes-1');
    insertSnapshot(db, snap);
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    const g1 = res.body.gardens.find((g: any) => g.gardynId === 'gardyn-1');
    expect(g1.snapshot.waterLevelPct).toBe(80);
    expect(g1.ageMinutes).toBe(10);
    expect(g1.stale).toBe(false);
  });

  it('POST /api/chores/:id/complete closes the chore', async () => {
    const { app, db } = appWith(':memory:routes-2');
    db.prepare(
      'INSERT INTO chores (gardyn_id, title, source, created_at, completed_at) VALUES (?, ?, ?, ?, NULL)',
    ).run('gardyn-1', 'Top up water (gardyn-1)', 'data-trigger', '2026-07-06T12:00:00.000Z');
    const list = await request(app).get('/api/chores');
    const id = list.body.chores[0].id;
    const res = await request(app).post(`/api/chores/${id}/complete`);
    expect(res.status).toBe(200);
    const after = await request(app).get('/api/chores');
    expect(after.body.chores.length).toBe(0);
  });
});
```

- [ ] **Step 2: Install supertest and run the test to verify it fails**

Run in `backend/`:
```bash
npm install -D supertest @types/supertest
npx vitest run src/routes/garden.test.ts
```
Expected: FAIL (module `./garden.js` not found).

- [ ] **Step 3: Write the router**

Create `backend/src/routes/garden.ts`:
```typescript
import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getLatestSnapshot } from '../db/snapshots.js';
import { getOpenChores, completeChore } from '../care/chores.js';

const GARDYN_IDS = ['gardyn-1', 'gardyn-2'];
const STALE_MINUTES = 45;

export function makeGardenRouter(db: Database.Database, now: () => Date = () => new Date()): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    const gardens = GARDYN_IDS.map((gardynId) => {
      const snapshot = getLatestSnapshot(db, gardynId);
      let ageMinutes: number | null = null;
      let stale = true;
      if (snapshot) {
        ageMinutes = Math.round((now().getTime() - new Date(snapshot.takenAt).getTime()) / 60000);
        stale = ageMinutes > STALE_MINUTES;
      }
      return { gardynId, snapshot, ageMinutes, stale };
    });
    res.json({ gardens });
  });

  router.get('/chores', (_req, res) => {
    res.json({ chores: getOpenChores(db) });
  });

  router.post('/chores/:id/complete', (req, res) => {
    completeChore(db, Number(req.params.id), now().toISOString());
    res.json({ ok: true });
  });

  router.get('/plants', (_req, res) => {
    const rows = db.prepare('SELECT * FROM plants').all();
    res.json({ plants: rows });
  });

  router.put('/plants/:id', (req, res) => {
    const { name, variety, planted_at, notes } = req.body ?? {};
    db.prepare('UPDATE plants SET name = ?, variety = ?, planted_at = ?, notes = ? WHERE id = ?').run(
      name ?? null,
      variety ?? null,
      planted_at ?? null,
      notes ?? null,
      Number(req.params.id),
    );
    res.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 4: Wire the router into the app with real startup**

Replace `backend/src/routes/index.ts`:
```typescript
import { Router } from 'express';
import healthRouter from './health.js';
import { makeGardenRouter } from './garden.js';
import { getDb } from '../db/database.js';

const router = Router();
router.use('/health', healthRouter);
router.use('/', makeGardenRouter(getDb()));

export default router;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx vitest run src/routes/garden.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat: garden REST API (status, chores, plants)"
```

---

### Task 9: Wire poller + seed into server startup

Startup seeds default schedules and starts the poller against the mock source. Verified by a live curl.

**Files:**
- Modify: `backend/src/index.ts`

**Interfaces:**
- Consumes: `getDb`, `seedDefaultSchedules`, `startPolling`, `GardynMockSource`.

- [ ] **Step 1: Update the server entry**

Replace `backend/src/index.ts`:
```typescript
import express from 'express';
import apiRouter from './routes/index.js';
import { Server } from 'http';
import { getDb } from './db/database.js';
import { seedDefaultSchedules } from './care/chores.js';
import { startPolling } from './poller/poller.js';
import { GardynMockSource } from './datasources/GardynMockSource.js';

const app = express();
const PORT = process.env.PORT || 3001;
let server: Server | null = null;
let stopPolling: (() => void) | null = null;

app.use(express.json());
app.use('/api', apiRouter);

function startServer() {
  const db = getDb();
  seedDefaultSchedules(db);
  stopPolling = startPolling(db, new GardynMockSource());
  server = app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

function gracefulShutdown(signal: string) {
  console.log(`${signal} received: shutting down`);
  if (stopPolling) stopPolling();
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();

export { app };
```

- [ ] **Step 2: Verify live**

Run in `backend/`:
```bash
rm -f drip-dash.db drip-dash.db-wal drip-dash.db-shm
npx tsx src/index.ts &
sleep 2
curl -s localhost:3001/api/status | head -c 400
echo
curl -s localhost:3001/api/chores | head -c 400
kill %1
```
Expected: `status` returns two gardens with populated snapshots; `chores` returns any seeded/triggered chores.

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: seed schedules and start poller on server boot"
```

---

### Task 10: Frontend API client and types

A tiny fetch client the view consumes. No test (thin IO wrapper); correctness is proven by the view working against the live backend.

**Files:**
- Create: `frontend/src/api.ts`
- Modify: `frontend/vite.config.ts` (dev proxy to backend)

**Interfaces:**
- Produces: `fetchStatus(): Promise<StatusResponse>`, `fetchChores(): Promise<Chore[]>`, `completeChore(id: number): Promise<void>`.

- [ ] **Step 1: Add a dev proxy so the frontend can call the backend**

In `frontend/vite.config.ts`, add a `server.proxy` entry inside the config object:
```typescript
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
```

- [ ] **Step 2: Write the API client**

Create `frontend/src/api.ts`:
```typescript
export type LightState = 'on' | 'off';

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
  snapshot: GardynSnapshot | null;
  ageMinutes: number | null;
  stale: boolean;
}

export interface Chore {
  id: number;
  gardynId: string | null;
  title: string;
  source: 'schedule' | 'data-trigger';
  createdAt: string;
  completedAt: string | null;
}

export async function fetchStatus(): Promise<GardenStatus[]> {
  const res = await fetch('/api/status');
  const body = await res.json();
  return body.gardens;
}

export async function fetchChores(): Promise<Chore[]> {
  const res = await fetch('/api/chores');
  const body = await res.json();
  return body.chores;
}

export async function completeChore(id: number): Promise<void> {
  await fetch(`/api/chores/${id}/complete`, { method: 'POST' });
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.ts frontend/vite.config.ts
git commit -m "feat: frontend API client and dev proxy"
```

---

### Task 11: The kiosk view

One responsive dark page: status strip, break board, plant grid. Auto-refresh on a timer. This is the deliverable you look at.

**Files:**
- Create: `frontend/src/components/StatusStrip.tsx`
- Create: `frontend/src/components/BreakBoard.tsx`
- Create: `frontend/src/components/PlantGrid.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/index.css` (dark background base)

**Interfaces:**
- Consumes: `fetchStatus`, `fetchChores`, `completeChore`, `GardenStatus`, `Chore` from `./api`.

- [ ] **Step 1: Dark base styles**

In `frontend/src/index.css`, ensure a dark base (append if the file already has Tailwind directives):
```css
:root { color-scheme: dark; }
body { margin: 0; background: #0d1117; color: #e6edf3; font-family: system-ui, sans-serif; }
```

- [ ] **Step 2: Status strip component**

Create `frontend/src/components/StatusStrip.tsx`:
```tsx
import type { GardenStatus } from '../api';

export default function StatusStrip({ gardens }: { gardens: GardenStatus[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {gardens.map((g) => {
        const s = g.snapshot;
        const warn = g.stale || !s;
        return (
          <div
            key={g.gardynId}
            className={`rounded-2xl p-6 ${warn ? 'bg-red-950' : 'bg-slate-800'}`}
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-semibold capitalize">{g.gardynId.replace('-', ' ')}</h2>
              <span className="text-sm text-slate-400">
                {g.ageMinutes == null ? 'no data' : `updated ${g.ageMinutes} min ago`}
              </span>
            </div>
            {s ? (
              <div className="mt-4 flex items-end gap-6">
                <div>
                  <div className="text-5xl font-bold">{s.waterLevelPct}%</div>
                  <div className="text-slate-400">water</div>
                </div>
                <div className="text-lg text-slate-300">
                  <div>{s.temperatureC}&deg;C</div>
                  <div>{s.humidityPct}% humidity</div>
                  <div>light {s.light}</div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-slate-300">Reconnect needed</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Break board component**

Create `frontend/src/components/BreakBoard.tsx`:
```tsx
import type { Chore } from '../api';

export default function BreakBoard({
  chores,
  onComplete,
}: {
  chores: Chore[];
  onComplete: (id: number) => void;
}) {
  if (chores.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-800 p-8 text-center text-xl text-slate-300">
        Garden is happy. Go enjoy your break.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      {chores.map((c) => (
        <button
          key={c.id}
          onClick={() => onComplete(c.id)}
          className="rounded-2xl bg-emerald-700 px-6 py-4 text-lg font-medium hover:bg-emerald-600"
        >
          {c.title}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Plant grid component (read-only for Phase 1)**

Create `frontend/src/components/PlantGrid.tsx`:
```tsx
interface PlantRow {
  id: number;
  gardyn_id: string;
  slot: number;
  name: string;
  variety: string | null;
  planted_at: string | null;
}

export default function PlantGrid({ plants }: { plants: PlantRow[] }) {
  if (plants.length === 0) {
    return <p className="text-slate-500">No plants added yet.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {plants.map((p) => (
        <div key={p.id} className="rounded-xl bg-slate-800 p-4">
          <div className="font-medium">{p.name}</div>
          {p.variety && <div className="text-sm text-slate-400">{p.variety}</div>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Assemble the App with auto-refresh**

Replace `frontend/src/App.tsx`:
```tsx
import { useEffect, useState, useCallback } from 'react';
import { fetchStatus, fetchChores, completeChore } from './api';
import type { GardenStatus, Chore } from './api';
import StatusStrip from './components/StatusStrip';
import BreakBoard from './components/BreakBoard';
import PlantGrid from './components/PlantGrid';

const REFRESH_MS = 60_000;

function App() {
  const [gardens, setGardens] = useState<GardenStatus[]>([]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [plants, setPlants] = useState<any[]>([]);

  const load = useCallback(async () => {
    const [g, c] = await Promise.all([fetchStatus(), fetchChores()]);
    setGardens(g);
    setChores(c);
    const p = await fetch('/api/plants').then((r) => r.json());
    setPlants(p.plants ?? []);
  }, []);

  useEffect(() => {
    void load();
    const handle = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(handle);
  }, [load]);

  const onComplete = async (id: number) => {
    await completeChore(id);
    await load();
  };

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <h1 className="text-3xl font-bold">Drip Dash</h1>
      <StatusStrip gardens={gardens} />
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Break board</h2>
        <BreakBoard chores={chores} onComplete={onComplete} />
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Plants</h2>
        <PlantGrid plants={plants} />
      </section>
    </main>
  );
}

export default App;
```

- [ ] **Step 6: Verify end to end**

In two terminals:
```bash
# terminal 1
cd backend && npx tsx src/index.ts
# terminal 2
cd frontend && npm run dev
```
Open the Vite URL. Expected: two garden cards with live-looking values, a break board (chores or the happy empty state), and a plants section. Complete a chore and watch it vanish.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: kiosk view (status strip, break board, plant grid, auto-refresh)"
```

---

### Task 12: Single-process production serving + dev runner + README

Serve the built frontend from Express so production is one process (the Pi target). A root dev script runs both. README documents run steps.

**Files:**
- Create: `package.json` (root, dev convenience only)
- Modify: `backend/src/index.ts` (serve static frontend build)
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run dev` at repo root; a single `node dist/index.js` that serves API + UI in production.

- [ ] **Step 1: Serve the frontend build from Express**

In `backend/src/index.ts`, add static serving after the API mount (inside the file, before `startServer()` definition add the import and after `app.use('/api', apiRouter);` add the static block):
```typescript
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
```
Note: keep the `/api` mount ABOVE this static mount so API routes win.

- [ ] **Step 2: Root dev script**

Install concurrently and create the root `package.json`:
```bash
npm init -y
npm install -D concurrently
```
Then set its `scripts`:
```json
"scripts": {
  "dev": "concurrently -n backend,frontend \"npm --prefix backend run dev\" \"npm --prefix frontend run dev\"",
  "build": "npm --prefix frontend run build && npm --prefix backend run build",
  "start": "node backend/dist/index.js",
  "test": "npm --prefix backend test"
}
```

- [ ] **Step 3: Update the README**

Replace the "Getting Started" section of `README.md` with:
```markdown
## Getting started

Development (backend on :3001, frontend on Vite with an /api proxy):

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
npm run dev
```

Phase 1 runs against a mock Gardyn data source (no hardware needed). See
`docs/superpowers/specs/2026-07-06-drip-dash-revamp-design.md` for the roadmap:
a real local data source is a separate later phase.

Production (single Node process serving API + built UI):

```bash
npm run build
npm start
```
```

- [ ] **Step 4: Verify the production path**

```bash
npm run build && npm start &
sleep 2
curl -s localhost:3001/api/status | head -c 200
curl -s localhost:3001/ | head -c 100   # should return the built index.html
kill %1
```
Expected: API responds and `/` serves the built HTML.

- [ ] **Step 5: Commit**

```bash
git add package.json README.md backend/src/index.ts
git commit -m "chore: single-process prod serving, root dev runner, README"
```

- [ ] **Step 6: Full test sweep**

```bash
npm --prefix backend test
```
Expected: all suites green (mock, database, snapshots, chores, poller, routes).

---

## Self-Review

**Spec coverage:**
- Mock-first data source -> Task 3. Adapter interface -> Task 3. SQLite over Mongo -> Tasks 1, 4. Four-table model -> Task 4. Snapshot history kept -> Task 5 (insert-only). computeChores as a function -> Task 6. Poller with failure isolation + startup fire -> Task 7. Four-endpoint API + staleness -> Task 8. Single kiosk view (status strip, break board, plant grid, dark, auto-refresh, empty state) -> Task 11. Mac dev, single-process prod for Pi -> Task 12. Testing on computeChores + mock -> Tasks 3, 6. In-app reminders only (no Motion) -> honored throughout.
- Deferred correctly (not in this plan): real local source, camera photos, plant edit UI form (API PUT exists in Task 8, the tap-to-edit form is minimal/omitted from the view; acceptable for Phase 1 since plants seed rarely and can be edited via API. If you want the form in Phase 1, it is a small add to Task 11).
- Gap noted: the spec mentions "tap a plant to edit metadata" as the only form. Phase 1 ships plant grid read-only with a working PUT endpoint. This is a deliberate scope trim for the ship date; flag to Mindi.

**Placeholder scan:** No TBD/TODO left in steps. Every code step shows complete code.

**Type consistency:** `GardynSnapshot` fields (gardynId, takenAt, waterLevelPct, temperatureC, humidityPct, light) are identical across shared type, mock, repo, routes, and frontend client. `Chore` shape consistent between backend `chores.ts` and frontend `api.ts`. `computeChores`, `getOpenChores`, `completeChore`, `pollOnce`, `startPolling`, `makeGardenRouter`, `seedDefaultSchedules` names match between definition and consumer tasks.

**Known risk:** `getDb(':memory:...')` caches by key; tests use unique keys (`:memory:care-N`, `:memory:poller-1`) to avoid cross-test bleed. If a suite shows state leakage, give each test a unique key.
