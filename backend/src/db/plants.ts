import type Database from 'better-sqlite3';
import { listGardens } from './gardens.js';
import { createCatalog, getCatalog } from './catalog.js';

export type RemoveReason = 'harvested' | 'died' | 'other';

export interface Plant {
  id: number;
  gardynId: string;
  col: number;
  position: number;
  catalogId: number;
  name: string;
  variety: string | null;
  tempPref: string | null;
  timeToMaturity: string | null;
  careInstructions: string | null;
  about: string | null;
  uses: string | null;
  details: string | null;
  plantedAt: string | null;
  notes: string | null;
  removedAt: string | null;
  removedReason: string | null;
}

interface PlantRow {
  id: number;
  gardyn_id: string;
  col: number;
  position: number;
  catalog_id: number;
  name: string;
  variety: string | null;
  temp_pref: string | null;
  time_to_maturity: string | null;
  care_instructions: string | null;
  about: string | null;
  uses: string | null;
  details: string | null;
  planted_at: string | null;
  notes: string | null;
  removed_at: string | null;
  removed_reason: string | null;
}

function toPlant(r: PlantRow): Plant {
  return {
    id: r.id,
    gardynId: r.gardyn_id,
    col: r.col,
    position: r.position,
    catalogId: r.catalog_id,
    name: r.name,
    variety: r.variety,
    tempPref: r.temp_pref,
    timeToMaturity: r.time_to_maturity,
    careInstructions: r.care_instructions,
    about: r.about,
    uses: r.uses,
    details: r.details,
    plantedAt: r.planted_at,
    notes: r.notes,
    removedAt: r.removed_at,
    removedReason: r.removed_reason,
  };
}

const SELECT = `SELECT p.id, p.gardyn_id, p.col, p.position, p.catalog_id,
  c.name, c.variety, c.temp_pref, c.time_to_maturity, c.care_instructions,
  c.about, c.uses, c.details,
  p.planted_at, p.notes, p.removed_at, p.removed_reason
  FROM plants p JOIN catalog c ON c.id = p.catalog_id`;

export function listPlants(db: Database.Database): Plant[] {
  const rows = db
    .prepare(`${SELECT} WHERE p.removed_at IS NULL ORDER BY p.gardyn_id, p.col, p.position`)
    .all() as PlantRow[];
  return rows.map(toPlant);
}

export function getPlant(db: Database.Database, id: number): Plant | null {
  const row = db.prepare(`${SELECT} WHERE p.id = ?`).get(id) as PlantRow | undefined;
  return row ? toPlant(row) : null;
}

export interface PlantPatch {
  plantedAt?: string | null;
  notes?: string | null;
}

export function updatePlant(db: Database.Database, id: number, patch: PlantPatch): boolean {
  const existing = getPlant(db, id);
  if (!existing || existing.removedAt) return false;
  const merged = {
    plantedAt: patch.plantedAt !== undefined ? patch.plantedAt : existing.plantedAt,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
  };
  db.prepare('UPDATE plants SET planted_at = ?, notes = ? WHERE id = ?').run(
    merged.plantedAt,
    merged.notes,
    id,
  );
  return true;
}

export class SlotOccupiedError extends Error {}
export class InvalidSlotError extends Error {}
export class CatalogMissingError extends Error {}

function validateSlot(db: Database.Database, gardynId: string, col: number, position: number): void {
  const garden = listGardens(db).find((g) => g.id === gardynId);
  if (!garden || col < 1 || col > garden.cols || position < 1 || position > garden.positionsPerCol) {
    throw new InvalidSlotError(`no slot (${col}, ${position}) in ${gardynId}`);
  }
}

function activePlantAt(
  db: Database.Database,
  gardynId: string,
  col: number,
  position: number,
): { id: number } | undefined {
  return db
    .prepare(
      'SELECT id FROM plants WHERE gardyn_id = ? AND col = ? AND position = ? AND removed_at IS NULL',
    )
    .get(gardynId, col, position) as { id: number } | undefined;
}

export interface CreatePlantInput {
  gardynId: string;
  col: number;
  position: number;
  catalogId: number;
  plantedAt?: string | null;
  notes?: string | null;
  demo?: boolean;
}

export function createPlant(db: Database.Database, input: CreatePlantInput): Plant {
  if (!getCatalog(db, input.catalogId)) {
    throw new CatalogMissingError(`no catalog entry ${input.catalogId}`);
  }
  validateSlot(db, input.gardynId, input.col, input.position);
  if (activePlantAt(db, input.gardynId, input.col, input.position)) {
    throw new SlotOccupiedError(
      `slot (${input.col}, ${input.position}) in ${input.gardynId} is occupied`,
    );
  }
  const result = db
    .prepare(
      `INSERT INTO plants (gardyn_id, col, position, catalog_id, planted_at, notes, demo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.gardynId,
      input.col,
      input.position,
      input.catalogId,
      input.plantedAt ?? null,
      input.notes ?? null,
      input.demo ? 1 : 0,
    );
  return getPlant(db, Number(result.lastInsertRowid))!;
}

export function archivePlant(
  db: Database.Database,
  id: number,
  reason: RemoveReason,
  now: string,
): boolean {
  const plant = getPlant(db, id);
  if (!plant || plant.removedAt) return false;
  db.transaction(() => {
    db.prepare('UPDATE plants SET removed_at = ?, removed_reason = ? WHERE id = ?').run(
      now,
      reason,
      id,
    );
    // Open tasks are no longer actionable; completed history stays for analytics.
    db.prepare('DELETE FROM chores WHERE plant_id = ? AND completed_at IS NULL').run(id);
  })();
  return true;
}

export function movePlant(
  db: Database.Database,
  id: number,
  target: { gardynId: string; col: number; position: number },
): 'moved' | 'swapped' | 'missing' | 'invalid' {
  const plant = getPlant(db, id);
  if (!plant || plant.removedAt) return 'missing';
  try {
    validateSlot(db, target.gardynId, target.col, target.position);
  } catch {
    return 'invalid';
  }
  if (
    plant.gardynId === target.gardynId &&
    plant.col === target.col &&
    plant.position === target.position
  ) {
    return 'invalid';
  }
  const occupant = activePlantAt(db, target.gardynId, target.col, target.position);
  const setSlot = db.prepare('UPDATE plants SET gardyn_id = ?, col = ?, position = ? WHERE id = ?');
  const followTasks = db.prepare(
    'UPDATE chores SET gardyn_id = ? WHERE plant_id = ? AND completed_at IS NULL',
  );
  db.transaction(() => {
    if (occupant) {
      // Swap dance: park the moving plant on a temp position so the two active rows
      // never collide under the partial unique index while they trade slots.
      setSlot.run(plant.gardynId, plant.col, -id, id);
      setSlot.run(plant.gardynId, plant.col, plant.position, occupant.id);
      setSlot.run(target.gardynId, target.col, target.position, id);
      followTasks.run(plant.gardynId, occupant.id);
    } else {
      setSlot.run(target.gardynId, target.col, target.position, id);
    }
    followTasks.run(target.gardynId, id);
  })();
  return occupant ? 'swapped' : 'moved';
}

// Demo catalog + plants so the kiosk shows real-looking data before real inventory.
const FAKE_CATALOG = [
  { name: 'Basil', variety: 'Genovese', careInstructions: 'Trim above a leaf pair weekly; pinch flower buds.', about: 'Sweet Italian basil, fast grower under lights.', uses: 'Pesto, caprese, tomato sauces.' },
  { name: 'Cherry Tomato', variety: 'Red Robin', careInstructions: 'Hand-pollinate open flowers; support heavy trusses.', about: null, uses: null },
  { name: 'Lettuce', variety: 'Butterhead', careInstructions: null, about: null, uses: 'Salads; harvest outer leaves first.' },
  { name: 'Thai Chili', variety: null, careInstructions: null, about: 'Compact, very productive, quite hot.', uses: null },
  { name: 'Strawberry', variety: 'Alpine', careInstructions: null, about: null, uses: null },
  { name: 'Rainbow Chard', variety: null, careInstructions: null, about: null, uses: null },
];

const FAKE_PLACEMENTS: { catalogIndex: number; gardynId: string; col: number; position: number; plantedAt: string }[] = [
  { catalogIndex: 0, gardynId: 'gardyn-1', col: 1, position: 2, plantedAt: '2026-06-20' },
  { catalogIndex: 1, gardynId: 'gardyn-1', col: 2, position: 5, plantedAt: '2026-06-01' },
  { catalogIndex: 2, gardynId: 'gardyn-1', col: 3, position: 8, plantedAt: '2026-06-25' },
  { catalogIndex: 3, gardynId: 'gardyn-2', col: 1, position: 4, plantedAt: '2026-05-15' },
  { catalogIndex: 4, gardynId: 'gardyn-2', col: 2, position: 1, plantedAt: '2026-05-30' },
  { catalogIndex: 5, gardynId: 'gardyn-2', col: 3, position: 6, plantedAt: '2026-06-10' },
];

export function seedFakePlants(db: Database.Database): void {
  const existing = db.prepare('SELECT COUNT(*) as n FROM plants').get() as { n: number };
  if (existing.n > 0) return;
  const now = '2026-07-17T00:00:00.000Z';
  const ids = FAKE_CATALOG.map((c) => createCatalog(db, { ...c, demo: true }, now).id);
  for (const p of FAKE_PLACEMENTS) {
    createPlant(db, {
      gardynId: p.gardynId,
      col: p.col,
      position: p.position,
      catalogId: ids[p.catalogIndex],
      plantedAt: p.plantedAt,
      demo: true,
    });
  }
}

export function clearDemoData(db: Database.Database): void {
  db.transaction(() => {
    db.prepare(
      'DELETE FROM chores WHERE plant_id IN (SELECT id FROM plants WHERE demo = 1)',
    ).run();
    db.prepare('DELETE FROM plants WHERE demo = 1').run();
    db.prepare('DELETE FROM catalog WHERE demo = 1').run();
  })();
}
