import type Database from 'better-sqlite3';

export interface Plant {
  id: number;
  gardynId: string;
  col: number;
  position: number;
  name: string;
  variety: string | null;
  plantedAt: string | null;
  notes: string | null;
  careInstructions: string | null;
  about: string | null;
  uses: string | null;
}

interface PlantRow {
  id: number;
  gardyn_id: string;
  col: number;
  position: number;
  name: string;
  variety: string | null;
  planted_at: string | null;
  notes: string | null;
  care_instructions: string | null;
  about: string | null;
  uses: string | null;
}

function toPlant(r: PlantRow): Plant {
  return {
    id: r.id,
    gardynId: r.gardyn_id,
    col: r.col,
    position: r.position,
    name: r.name,
    variety: r.variety,
    plantedAt: r.planted_at,
    notes: r.notes,
    careInstructions: r.care_instructions,
    about: r.about,
    uses: r.uses,
  };
}

export function listPlants(db: Database.Database): Plant[] {
  const rows = db
    .prepare('SELECT * FROM plants ORDER BY gardyn_id, col, position')
    .all() as PlantRow[];
  return rows.map(toPlant);
}

export function getPlant(db: Database.Database, id: number): Plant | null {
  const row = db.prepare('SELECT * FROM plants WHERE id = ?').get(id) as PlantRow | undefined;
  return row ? toPlant(row) : null;
}

export interface PlantPatch {
  name?: string;
  variety?: string | null;
  plantedAt?: string | null;
  notes?: string | null;
  careInstructions?: string | null;
  about?: string | null;
  uses?: string | null;
}

export function updatePlant(db: Database.Database, id: number, patch: PlantPatch): boolean {
  const existing = getPlant(db, id);
  if (!existing) return false;
  const merged = {
    name: patch.name !== undefined ? patch.name : existing.name,
    variety: patch.variety !== undefined ? patch.variety : existing.variety,
    plantedAt: patch.plantedAt !== undefined ? patch.plantedAt : existing.plantedAt,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    careInstructions:
      patch.careInstructions !== undefined ? patch.careInstructions : existing.careInstructions,
    about: patch.about !== undefined ? patch.about : existing.about,
    uses: patch.uses !== undefined ? patch.uses : existing.uses,
  };
  db.prepare(
    `UPDATE plants SET name = ?, variety = ?, planted_at = ?, notes = ?,
     care_instructions = ?, about = ?, uses = ? WHERE id = ?`,
  ).run(
    merged.name,
    merged.variety,
    merged.plantedAt,
    merged.notes,
    merged.careInstructions,
    merged.about,
    merged.uses,
    id,
  );
  return true;
}

// Fake plants so the kiosk demos with real-looking data before v1 real inventory.
const FAKE_PLANTS = [
  {
    gardynId: 'gardyn-1', col: 1, position: 2, name: 'Basil', variety: 'Genovese', plantedAt: '2026-06-20',
    careInstructions: 'Trim above a leaf pair weekly; pinch flower buds.', about: 'Sweet Italian basil, fast grower under lights.', uses: 'Pesto, caprese, tomato sauces.',
  },
  { gardynId: 'gardyn-1', col: 2, position: 5, name: 'Cherry Tomato', variety: 'Red Robin', plantedAt: '2026-06-01', careInstructions: 'Hand-pollinate open flowers; support heavy trusses.', about: null, uses: null },
  { gardynId: 'gardyn-1', col: 3, position: 8, name: 'Lettuce', variety: 'Butterhead', plantedAt: '2026-06-25', careInstructions: null, about: null, uses: 'Salads; harvest outer leaves first.' },
  { gardynId: 'gardyn-2', col: 1, position: 4, name: 'Thai Chili', variety: null, plantedAt: '2026-05-15', careInstructions: null, about: 'Compact, very productive, quite hot.', uses: null },
  { gardynId: 'gardyn-2', col: 2, position: 1, name: 'Strawberry', variety: 'Alpine', plantedAt: '2026-05-30', careInstructions: null, about: null, uses: null },
  { gardynId: 'gardyn-2', col: 3, position: 6, name: 'Rainbow Chard', variety: null, plantedAt: '2026-06-10', careInstructions: null, about: null, uses: null },
];

export function seedFakePlants(db: Database.Database): void {
  const existing = db.prepare('SELECT COUNT(*) as n FROM plants').get() as { n: number };
  if (existing.n > 0) return;
  const insert = db.prepare(
    `INSERT INTO plants (gardyn_id, col, position, name, variety, planted_at, care_instructions, about, uses)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const p of FAKE_PLANTS) {
    insert.run(p.gardynId, p.col, p.position, p.name, p.variety, p.plantedAt, p.careInstructions, p.about, p.uses);
  }
}
