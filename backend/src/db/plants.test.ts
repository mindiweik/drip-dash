import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from './database.js';
import { seedDefaultGardens } from './gardens.js';
import { createCatalog } from './catalog.js';
import {
  listPlants, getPlant, createPlant, updatePlant, archivePlant, movePlant,
  seedFakePlants, clearDemoData, CatalogMissingError, SlotOccupiedError, InvalidSlotError,
} from './plants.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let n = 0;
beforeEach(() => {
  db = getDb(`:memory:plants-${n++}`);
  seedDefaultGardens(db);
});

function basil(demo = false): number {
  return createCatalog(db, { name: 'Basil', variety: 'Genovese', careInstructions: 'Trim weekly', demo }, '2026-07-17').id;
}

describe('createPlant', () => {
  it('creates a plant linked to a catalog entry and resolves reference fields via join', () => {
    const cid = basil();
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid, plantedAt: '2026-07-01' });
    expect(p.catalogId).toBe(cid);
    expect(p.name).toBe('Basil');
    expect(p.variety).toBe('Genovese');
    expect(p.careInstructions).toBe('Trim weekly');
    expect(p.plantedAt).toBe('2026-07-01');
    expect(getPlant(db, p.id)?.name).toBe('Basil');
  });

  it('reflects a catalog rename on existing plants', () => {
    const cid = basil();
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    db.prepare('UPDATE catalog SET name = ? WHERE id = ?').run('Sweet Basil', cid);
    expect(getPlant(db, p.id)?.name).toBe('Sweet Basil');
  });

  it('throws CatalogMissingError for an unknown catalogId', () => {
    expect(() => createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: 9999 })).toThrow(CatalogMissingError);
  });

  it('throws InvalidSlotError for out-of-geometry slots', () => {
    const cid = basil();
    expect(() => createPlant(db, { gardynId: 'gardyn-1', col: 4, position: 1, catalogId: cid })).toThrow(InvalidSlotError);
    expect(() => createPlant(db, { gardynId: 'nope', col: 1, position: 1, catalogId: cid })).toThrow(InvalidSlotError);
  });

  it('throws SlotOccupiedError when the active slot is taken', () => {
    const cid = basil();
    createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    expect(() => createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid })).toThrow(SlotOccupiedError);
  });
});

describe('updatePlant (instance fields only)', () => {
  it('updates plantedAt and notes, returns false for missing/archived', () => {
    const cid = basil();
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    expect(updatePlant(db, p.id, { plantedAt: '2026-06-01', notes: 'leggy' })).toBe(true);
    const got = getPlant(db, p.id)!;
    expect(got.plantedAt).toBe('2026-06-01');
    expect(got.notes).toBe('leggy');
    expect(updatePlant(db, 9999, { notes: 'x' })).toBe(false);
    archivePlant(db, p.id, 'harvested', '2026-07-10');
    expect(updatePlant(db, p.id, { notes: 'y' })).toBe(false);
  });
});

describe('listPlants', () => {
  it('returns only active plants with joined names', () => {
    const cid = basil();
    const a = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 2, catalogId: cid });
    archivePlant(db, a.id, 'died', '2026-07-10');
    const active = listPlants(db);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('Basil');
  });
});

function addOpenChore(gardynId: string, plantId: number): void {
  db.prepare(
    `INSERT INTO chores (gardyn_id, plant_id, title, source, created_at)
     VALUES (?, ?, 'Trim', 'manual', '2026-07-16T10:00:00.000Z')`,
  ).run(gardynId, plantId);
}

describe('movePlant', () => {
  it('moves into an empty slot', () => {
    const cid = basil();
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    expect(movePlant(db, p.id, { gardynId: 'gardyn-2', col: 2, position: 3 })).toBe('moved');
    const got = getPlant(db, p.id)!;
    expect(got.gardynId).toBe('gardyn-2');
    expect(got.col).toBe(2);
    expect(got.position).toBe(3);
  });

  it('swaps two occupied plants', () => {
    const cid = basil();
    const a = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    const b = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 2, catalogId: cid });
    expect(movePlant(db, a.id, { gardynId: 'gardyn-1', col: 1, position: 2 })).toBe('swapped');
    expect(getPlant(db, a.id)!.position).toBe(2);
    expect(getPlant(db, b.id)!.position).toBe(1);
  });

  it('returns missing for an unknown id and for an already-archived plant', () => {
    const cid = basil();
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    expect(movePlant(db, 9999, { gardynId: 'gardyn-1', col: 1, position: 2 })).toBe('missing');
    archivePlant(db, p.id, 'other', '2026-07-16T12:00:00.000Z');
    expect(movePlant(db, p.id, { gardynId: 'gardyn-1', col: 1, position: 2 })).toBe('missing');
  });

  it('returns invalid for an out-of-geometry target and for a same-slot no-op', () => {
    const cid = basil();
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    expect(movePlant(db, p.id, { gardynId: 'gardyn-1', col: 9, position: 1 })).toBe('invalid');
    expect(movePlant(db, p.id, { gardynId: 'gardyn-1', col: 1, position: 1 })).toBe('invalid');
  });

  it('relocates to an empty slot and open chores follow the garden', () => {
    const cid = basil();
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    addOpenChore(p.gardynId, p.id);
    expect(movePlant(db, p.id, { gardynId: 'gardyn-2', col: 3, position: 10 })).toBe('moved');
    const moved = getPlant(db, p.id)!;
    expect([moved.gardynId, moved.col, moved.position]).toEqual(['gardyn-2', 3, 10]);
    const chore: any = db.prepare('SELECT gardyn_id FROM chores WHERE plant_id = ?').get(p.id);
    expect(chore.gardyn_id).toBe('gardyn-2');
  });

  it('swaps atomically and both plants open chores follow their new gardens', () => {
    const cid = basil();
    const a = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    const b = createPlant(db, { gardynId: 'gardyn-2', col: 2, position: 5, catalogId: cid });
    addOpenChore(b.gardynId, b.id);
    expect(movePlant(db, a.id, { gardynId: 'gardyn-2', col: 2, position: 5 })).toBe('swapped');
    const A = getPlant(db, a.id)!;
    const B = getPlant(db, b.id)!;
    expect([A.gardynId, A.col, A.position]).toEqual(['gardyn-2', 2, 5]);
    expect([B.gardynId, B.col, B.position]).toEqual(['gardyn-1', 1, 1]);
    const bChore: any = db.prepare('SELECT gardyn_id FROM chores WHERE plant_id = ?').get(b.id);
    expect(bChore.gardyn_id).toBe('gardyn-1');
  });
});

describe('archivePlant', () => {
  it('deletes the plant open chores but keeps completed history', () => {
    const cid = basil();
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    const open = db
      .prepare(
        `INSERT INTO chores (gardyn_id, plant_id, title, source, created_at)
         VALUES (?, ?, 'Trim', 'manual', '2026-07-16T10:00:00.000Z')`,
      )
      .run(p.gardynId, p.id);
    const done = db
      .prepare(
        `INSERT INTO chores (gardyn_id, plant_id, title, source, created_at, completed_at)
         VALUES (?, ?, 'Pollinate', 'manual', '2026-07-16T10:00:00.000Z', '2026-07-16T11:00:00.000Z')`,
      )
      .run(p.gardynId, p.id);
    archivePlant(db, p.id, 'died', '2026-07-16T12:00:00.000Z');
    expect(db.prepare('SELECT COUNT(*) as n FROM chores WHERE id = ?').get(open.lastInsertRowid)).toEqual({
      n: 0,
    });
    expect(db.prepare('SELECT completed_at FROM chores WHERE id = ?').get(done.lastInsertRowid)).toBeTruthy();
  });

  it('returns false for a missing id and for an already-archived plant', () => {
    const cid = basil();
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cid });
    expect(archivePlant(db, 9999, 'other', '2026-07-16T13:00:00.000Z')).toBe(false);
    expect(archivePlant(db, p.id, 'harvested', '2026-07-16T12:00:00.000Z')).toBe(true);
    expect(archivePlant(db, p.id, 'other', '2026-07-16T13:00:00.000Z')).toBe(false);
  });

  it('frees the slot so a new plant can be created there', () => {
    const cid = basil();
    const p = createPlant(db, { gardynId: 'gardyn-1', col: 2, position: 1, catalogId: cid });
    expect(archivePlant(db, p.id, 'harvested', '2026-07-16T12:00:00.000Z')).toBe(true);
    const again = createPlant(db, { gardynId: 'gardyn-1', col: 2, position: 1, catalogId: cid });
    expect(again.id).not.toBe(p.id);
    expect(getPlant(db, again.id)?.removedAt).toBeNull();
  });
});

describe('seedFakePlants + clearDemoData', () => {
  it('seeds demo catalog + plants once, and clear removes only demo rows', () => {
    seedFakePlants(db);
    const seeded = listPlants(db).length;
    expect(seeded).toBeGreaterThan(0);
    // idempotent
    seedFakePlants(db);
    expect(listPlants(db).length).toBe(seeded);

    // a real (non-demo) plant survives clearDemoData
    const realCid = createCatalog(db, { name: 'Cilantro' }, '2026-07-17').id;
    createPlant(db, { gardynId: 'gardyn-2', col: 3, position: 10, catalogId: realCid });

    clearDemoData(db);
    const remaining = listPlants(db);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('Cilantro');
    // demo catalog gone, real catalog kept
    const names = db.prepare('SELECT name FROM catalog').all() as { name: string }[];
    expect(names.map((r) => r.name)).toEqual(['Cilantro']);
  });

  it('promotes a demo catalog variety to real when a real plant links to it, and survives clearDemoData', () => {
    seedFakePlants(db);
    const basilCatalog = db.prepare("SELECT id, demo FROM catalog WHERE name = 'Basil'").get() as {
      id: number;
      demo: number;
    };
    expect(basilCatalog.demo).toBe(1);

    // A real plant (no demo flag) placed via the picker onto the seeded Basil variety.
    const realPlant = createPlant(db, {
      gardynId: 'gardyn-2',
      col: 3,
      position: 10,
      catalogId: basilCatalog.id,
    });

    const promoted = db.prepare('SELECT demo FROM catalog WHERE id = ?').get(basilCatalog.id) as {
      demo: number;
    };
    expect(promoted.demo).toBe(0);

    clearDemoData(db);

    const remaining = listPlants(db);
    const survivor = remaining.find((p) => p.id === realPlant.id);
    expect(survivor).toBeTruthy();
    expect(survivor?.name).toBe('Basil');
    expect(survivor?.gardynId).toBe('gardyn-2');
    expect(survivor?.col).toBe(3);
    expect(survivor?.position).toBe(10);

    const catalogSurvivor = db.prepare('SELECT id FROM catalog WHERE id = ?').get(basilCatalog.id);
    expect(catalogSurvivor).toBeTruthy();
  });
});
