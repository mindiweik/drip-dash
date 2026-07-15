import type Database from 'better-sqlite3';
import { getLatestSnapshot } from '../db/snapshots.js';

export { seedDefaultSchedules } from './seed.js';

export const WATER_LOW_THRESHOLD = 45;
const GARDYN_IDS = ['gardyn-1', 'gardyn-2'];

export interface Chore {
  id: number;
  gardynId: string | null;
  title: string;
  source: 'schedule' | 'data-trigger';
  createdAt: string;
  completedAt: string | null;
  // Set only for schedule-sourced chores; links back to the care_schedules
  // row that generated it so completion can stamp last_done_at precisely.
  scheduleId?: number | null;
}

interface ChoreRow {
  id: number;
  gardyn_id: string | null;
  title: string;
  source: Chore['source'];
  created_at: string;
  completed_at: string | null;
  schedule_id: number | null;
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
  };
}

export function getOpenChores(db: Database.Database): Chore[] {
  const rows = db
    .prepare('SELECT * FROM chores WHERE completed_at IS NULL ORDER BY created_at ASC')
    .all() as ChoreRow[];
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
  for (const gardynId of GARDYN_IDS) {
    const snap = getLatestSnapshot(db, gardynId);
    if (snap && snap.waterLevelPct < WATER_LOW_THRESHOLD) {
      insertChore(db, gardynId, `Top up water + plant food (${gardynId})`, 'data-trigger', now);
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
