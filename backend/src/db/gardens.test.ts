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
