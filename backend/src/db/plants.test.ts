import { describe, it, expect } from 'vitest';
import { getDb } from './database.js';
import { seedDefaultGardens } from './gardens.js';
import {
  listPlants,
  getPlant,
  updatePlant,
  seedFakePlants,
  createPlant,
  archivePlant,
  movePlant,
  SlotOccupiedError,
  InvalidSlotError,
} from './plants.js';
import { createPlantTask } from '../care/plantTasks.js';
import { completeChore } from '../care/chores.js';

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

  it('updatePlant refuses archived plants', () => {
    const db = getDb(':memory:plants-3');
    db.prepare(
      "INSERT INTO plants (gardyn_id, col, position, name, removed_at, removed_reason) VALUES ('gardyn-1', 1, 1, 'Basil', '2026-07-16T12:00:00.000Z', 'harvested')",
    ).run();
    const archived: any = db.prepare('SELECT id FROM plants').get();
    expect(updatePlant(db, archived.id, { notes: 'x' })).toBe(false);
    const row: any = db.prepare('SELECT notes FROM plants WHERE id = ?').get(archived.id);
    expect(row.notes).toBeNull();
  });
});

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
