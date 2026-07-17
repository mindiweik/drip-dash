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
});
