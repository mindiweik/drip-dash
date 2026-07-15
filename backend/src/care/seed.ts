import type Database from 'better-sqlite3';

// Every gardyn gets this same baseline set of recurring care schedules.
const GARDYN_IDS = ['gardyn-1', 'gardyn-2'];

const DEFAULT_SCHEDULES = [
  { name: 'Add nutrients', everyDays: 14 },
  { name: 'Deep clean', everyDays: 60 },
];

// Idempotent: only seeds when care_schedules is empty, so re-running on an
// already-seeded db (or a restart) is a no-op.
export function seedDefaultSchedules(db: Database.Database): void {
  const existing = db.prepare('SELECT COUNT(*) as n FROM care_schedules').get() as { n: number };
  if (existing.n > 0) return;

  const insert = db.prepare(
    'INSERT INTO care_schedules (gardyn_id, name, every_days, last_done_at) VALUES (?, ?, ?, NULL)',
  );
  for (const gardynId of GARDYN_IDS) {
    for (const schedule of DEFAULT_SCHEDULES) {
      insert.run(gardynId, schedule.name, schedule.everyDays);
    }
  }
}
