import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from './database.js';
import {
  listCatalog, getCatalog, createCatalog, updateCatalog, CatalogExistsError,
} from './catalog.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let n = 0;
beforeEach(() => {
  db = getDb(`:memory:catalog-repo-${n++}`);
});

describe('catalog repo', () => {
  it('creates and reads back a catalog entry', () => {
    const c = createCatalog(db, { name: 'Basil', variety: 'Genovese', tempPref: '65-75F' }, '2026-07-17');
    expect(c.id).toBeGreaterThan(0);
    expect(c.name).toBe('Basil');
    expect(c.variety).toBe('Genovese');
    expect(c.tempPref).toBe('65-75F');
    expect(getCatalog(db, c.id)?.name).toBe('Basil');
  });

  it('rejects a duplicate (name, variety) identity including null-variety collapse', () => {
    createCatalog(db, { name: 'Thai Chili' }, '2026-07-17');
    expect(() => createCatalog(db, { name: 'Thai Chili', variety: null }, '2026-07-17')).toThrow(CatalogExistsError);
    // same name, different variety is fine
    expect(() => createCatalog(db, { name: 'Basil', variety: 'Genovese' }, '2026-07-17')).not.toThrow();
    expect(() => createCatalog(db, { name: 'Basil', variety: 'Thai' }, '2026-07-17')).not.toThrow();
  });

  it('lists entries ordered by name then variety', () => {
    createCatalog(db, { name: 'Basil', variety: 'Thai' }, '2026-07-17');
    createCatalog(db, { name: 'Basil', variety: 'Genovese' }, '2026-07-17');
    createCatalog(db, { name: 'Arugula' }, '2026-07-17');
    expect(listCatalog(db).map((c) => `${c.name}/${c.variety ?? ''}`)).toEqual([
      'Arugula/', 'Basil/Genovese', 'Basil/Thai',
    ]);
  });

  it('partial-updates reference fields and returns false for missing id', () => {
    const c = createCatalog(db, { name: 'Lettuce' }, '2026-07-17');
    expect(updateCatalog(db, c.id, { tempPref: '55-65F', variety: 'Butterhead' })).toBe(true);
    const got = getCatalog(db, c.id)!;
    expect(got.tempPref).toBe('55-65F');
    expect(got.variety).toBe('Butterhead');
    expect(got.name).toBe('Lettuce'); // untouched
    expect(updateCatalog(db, 9999, { tempPref: 'x' })).toBe(false);
  });
});
