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
