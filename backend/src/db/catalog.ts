import type Database from 'better-sqlite3';

export interface Catalog {
  id: number;
  name: string;
  variety: string | null;
  tempPref: string | null;
  timeToMaturity: string | null;
  careInstructions: string | null;
  about: string | null;
  uses: string | null;
  details: string | null;
}

interface CatalogRow {
  id: number;
  name: string;
  variety: string | null;
  temp_pref: string | null;
  time_to_maturity: string | null;
  care_instructions: string | null;
  about: string | null;
  uses: string | null;
  details: string | null;
}

export class CatalogExistsError extends Error {}

function toCatalog(r: CatalogRow): Catalog {
  return {
    id: r.id,
    name: r.name,
    variety: r.variety,
    tempPref: r.temp_pref,
    timeToMaturity: r.time_to_maturity,
    careInstructions: r.care_instructions,
    about: r.about,
    uses: r.uses,
    details: r.details,
  };
}

const SELECT = `SELECT id, name, variety, temp_pref, time_to_maturity,
  care_instructions, about, uses, details FROM catalog`;

export function listCatalog(db: Database.Database): Catalog[] {
  const rows = db
    .prepare(`${SELECT} ORDER BY name COLLATE NOCASE, COALESCE(variety, '') COLLATE NOCASE`)
    .all() as CatalogRow[];
  return rows.map(toCatalog);
}

export function getCatalog(db: Database.Database, id: number): Catalog | null {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id) as CatalogRow | undefined;
  return row ? toCatalog(row) : null;
}

export interface CreateCatalogInput {
  name: string;
  variety?: string | null;
  tempPref?: string | null;
  timeToMaturity?: string | null;
  careInstructions?: string | null;
  about?: string | null;
  uses?: string | null;
  details?: string | null;
  demo?: boolean;
}

export function createCatalog(
  db: Database.Database,
  input: CreateCatalogInput,
  now: string,
): Catalog {
  try {
    const result = db
      .prepare(
        `INSERT INTO catalog
         (name, variety, temp_pref, time_to_maturity, care_instructions, about, uses, details, demo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name,
        input.variety ?? null,
        input.tempPref ?? null,
        input.timeToMaturity ?? null,
        input.careInstructions ?? null,
        input.about ?? null,
        input.uses ?? null,
        input.details ?? null,
        input.demo ? 1 : 0,
        now,
      );
    return getCatalog(db, Number(result.lastInsertRowid))!;
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      throw new CatalogExistsError(`catalog entry for ${input.name}/${input.variety ?? ''} exists`);
    }
    throw err;
  }
}

export interface CatalogPatch {
  name?: string;
  variety?: string | null;
  tempPref?: string | null;
  timeToMaturity?: string | null;
  careInstructions?: string | null;
  about?: string | null;
  uses?: string | null;
  details?: string | null;
}

export function updateCatalog(db: Database.Database, id: number, patch: CatalogPatch): boolean {
  const existing = getCatalog(db, id);
  if (!existing) return false;
  const merged = {
    name: patch.name !== undefined ? patch.name : existing.name,
    variety: patch.variety !== undefined ? patch.variety : existing.variety,
    tempPref: patch.tempPref !== undefined ? patch.tempPref : existing.tempPref,
    timeToMaturity: patch.timeToMaturity !== undefined ? patch.timeToMaturity : existing.timeToMaturity,
    careInstructions:
      patch.careInstructions !== undefined ? patch.careInstructions : existing.careInstructions,
    about: patch.about !== undefined ? patch.about : existing.about,
    uses: patch.uses !== undefined ? patch.uses : existing.uses,
    details: patch.details !== undefined ? patch.details : existing.details,
  };
  db.prepare(
    `UPDATE catalog SET name = ?, variety = ?, temp_pref = ?, time_to_maturity = ?,
     care_instructions = ?, about = ?, uses = ?, details = ? WHERE id = ?`,
  ).run(
    merged.name,
    merged.variety,
    merged.tempPref,
    merged.timeToMaturity,
    merged.careInstructions,
    merged.about,
    merged.uses,
    merged.details,
    id,
  );
  return true;
}
