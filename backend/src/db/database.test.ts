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
