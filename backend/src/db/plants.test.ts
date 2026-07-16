import { describe, it, expect } from 'vitest';
import { getDb } from './database.js';
import { seedDefaultGardens } from './gardens.js';
import { listPlants, getPlant, updatePlant, seedFakePlants } from './plants.js';

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
});
