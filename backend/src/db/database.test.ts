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
