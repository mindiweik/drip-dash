import type Database from 'better-sqlite3';
import { getLatestSnapshot } from '../db/snapshots.js';
import { listGardens } from '../db/gardens.js';

export { seedDefaultSchedules } from './seed.js';

export const WATER_LOW_THRESHOLD = 45;

export interface Chore {
  id: number;
  gardynId: string | null;
  title: string;
  source: 'schedule' | 'data-trigger' | 'plant';
  createdAt: string;
  completedAt: string | null;
  // Set only for schedule-sourced chores; links back to the care_schedules
  // row that generated it so completion can stamp last_done_at precisely.
  scheduleId?: number | null;
  // Set only for plant-sourced chores (per-plant tasks).
  plantId: number | null;
  plantName: string | null;
  kind: string | null;
  dueAt: string | null;
}

interface ChoreRow {
  id: number;
  gardyn_id: string | null;
  title: string;
  source: Chore['source'];
  created_at: string;
  completed_at: string | null;
  schedule_id: number | null;
  plant_id: number | null;
  kind: string | null;
  due_at: string | null;
  plant_name?: string | null;
}

interface CareScheduleRow {
  id: number;
  gardyn_id: string | null;
  name: string;
  every_days: number;
  last_done_at: string | null;
}

function toChore(row: ChoreRow): Chore {
  return {
    id: row.id,
    gardynId: row.gardyn_id,
    title: row.title,
    source: row.source,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    scheduleId: row.schedule_id,
    plantId: row.plant_id,
    plantName: row.plant_name ?? null,
    kind: row.kind,
    dueAt: row.due_at,
  };
}

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

export function completeChore(db: Database.Database, id: number, now: string): void {
  const chore = db.prepare('SELECT * FROM chores WHERE id = ?').get(id) as ChoreRow | undefined;
  if (!chore) return;

  db.prepare('UPDATE chores SET completed_at = ? WHERE id = ?').run(now, id);

  if (chore.source === 'schedule' && chore.schedule_id != null) {
    db.prepare('UPDATE care_schedules SET last_done_at = ? WHERE id = ?').run(now, chore.schedule_id);
  }
}

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

// Data-trigger chores have no schedule_id, so they're deduped by (gardyn_id, title).
function hasOpenChoreByTitle(db: Database.Database, gardynId: string | null, title: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM chores WHERE completed_at IS NULL AND title = ? AND gardyn_id IS ?')
    .get(title, gardynId);
  return !!row;
}

// Schedule-sourced chores are deduped by (gardyn_id, schedule_id) so renaming a
// care_schedules.name while a chore is still open does not create a duplicate.
function hasOpenChoreBySchedule(db: Database.Database, gardynId: string | null, scheduleId: number): boolean {
  const row = db
    .prepare('SELECT 1 FROM chores WHERE completed_at IS NULL AND schedule_id = ? AND gardyn_id IS ?')
    .get(scheduleId, gardynId);
  return !!row;
}

function insertChore(
  db: Database.Database,
  gardynId: string | null,
  title: string,
  source: Chore['source'],
  now: string,
  scheduleId: number | null = null,
): void {
  const alreadyOpen =
    source === 'schedule' && scheduleId != null
      ? hasOpenChoreBySchedule(db, gardynId, scheduleId)
      : hasOpenChoreByTitle(db, gardynId, title);
  if (alreadyOpen) return;
  db.prepare(
    'INSERT INTO chores (gardyn_id, title, source, created_at, completed_at, schedule_id) VALUES (?, ?, ?, ?, NULL, ?)',
  ).run(gardynId, title, source, now, scheduleId);
}

function daysBetween(aIso: string, bIso: string): number {
  return (new Date(bIso).getTime() - new Date(aIso).getTime()) / (1000 * 60 * 60 * 24);
}

export function computeChores(db: Database.Database, now: string): void {
  // Data-driven: low water per gardyn.
  for (const garden of listGardens(db)) {
    const snap = getLatestSnapshot(db, garden.id);
    if (snap && snap.waterLevelPct < WATER_LOW_THRESHOLD) {
      insertChore(db, garden.id, `Top up water + plant food (${garden.id})`, 'data-trigger', now);
    }
  }

  // Schedule-driven.
  const schedules = db.prepare('SELECT * FROM care_schedules').all() as CareScheduleRow[];
  for (const schedule of schedules) {
    const due = !schedule.last_done_at || daysBetween(schedule.last_done_at, now) >= schedule.every_days;
    if (!due) continue;
    const suffix = schedule.gardyn_id ? ` (${schedule.gardyn_id})` : '';
    insertChore(db, schedule.gardyn_id, `${schedule.name}${suffix}`, 'schedule', now, schedule.id);
  }
}
