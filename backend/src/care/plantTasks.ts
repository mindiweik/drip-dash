import type Database from 'better-sqlite3';
import { getPlant } from '../db/plants.js';

export type TaskKind = 'pollinate' | 'roots' | 'trim' | 'harvest' | 'other';

export interface PlantTask {
  id: number;
  plantId: number;
  title: string;
  kind: TaskKind;
  dueAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface TaskRow {
  id: number;
  plant_id: number;
  title: string;
  kind: string | null;
  due_at: string | null;
  created_at: string;
  completed_at: string | null;
}

function toTask(r: TaskRow): PlantTask {
  return {
    id: r.id,
    plantId: r.plant_id,
    title: r.title,
    kind: (r.kind ?? 'other') as TaskKind,
    dueAt: r.due_at,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

export function getPlantTasks(db: Database.Database, plantId: number): PlantTask[] {
  const rows = db
    .prepare(
      `SELECT * FROM chores WHERE plant_id = ? AND completed_at IS NULL
       ORDER BY due_at IS NOT NULL, due_at ASC, created_at ASC`,
    )
    .all(plantId) as TaskRow[];
  return rows.map(toTask);
}

export function createPlantTask(
  db: Database.Database,
  plantId: number,
  input: { title: string; kind: TaskKind; dueAt?: string | null },
  now: string,
): PlantTask {
  const plant = getPlant(db, plantId);
  if (!plant) throw new Error(`plant ${plantId} not found`);
  const result = db
    .prepare(
      `INSERT INTO chores (gardyn_id, plant_id, title, source, kind, due_at, created_at, completed_at)
       VALUES (?, ?, ?, 'plant', ?, ?, ?, NULL)`,
    )
    .run(plant.gardynId, plantId, input.title, input.kind, input.dueAt ?? null, now);
  const row = db
    .prepare('SELECT * FROM chores WHERE id = ?')
    .get(result.lastInsertRowid) as TaskRow;
  return toTask(row);
}

export function updatePlantTask(
  db: Database.Database,
  id: number,
  patch: { title?: string; kind?: TaskKind; dueAt?: string | null },
): boolean {
  const row = db
    .prepare("SELECT * FROM chores WHERE id = ? AND source = 'plant'")
    .get(id) as TaskRow | undefined;
  if (!row) return false;
  db.prepare('UPDATE chores SET title = ?, kind = ?, due_at = ? WHERE id = ?').run(
    patch.title !== undefined ? patch.title : row.title,
    patch.kind !== undefined ? patch.kind : row.kind,
    patch.dueAt !== undefined ? patch.dueAt : row.due_at,
    id,
  );
  return true;
}

export function deletePlantTask(db: Database.Database, id: number): boolean {
  const result = db
    .prepare("DELETE FROM chores WHERE id = ? AND source = 'plant'")
    .run(id);
  return result.changes > 0;
}

// Seeded examples so pills, board labels, chips, and the modal demo with mixed states.
export function seedFakePlantTasks(db: Database.Database, now: string): void {
  const existing = db
    .prepare("SELECT COUNT(*) as n FROM chores WHERE source = 'plant'")
    .get() as { n: number };
  if (existing.n > 0) return;
  const plants = db.prepare('SELECT id, name FROM plants ORDER BY id').all() as Array<{
    id: number;
    name: string;
  }>;
  const inAWeek = new Date(new Date(now).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const byName = new Map(plants.map((p) => [p.name, p.id]));
  const seedTask = (name: string, title: string, kind: TaskKind, dueAt: string | null) => {
    const id = byName.get(name);
    if (id != null) createPlantTask(db, id, { title, kind, dueAt }, now);
  };
  seedTask('Cherry Tomato', 'Hand-pollinate open flowers', 'pollinate', null);
  seedTask('Basil', 'Trim leggy stems', 'trim', null);
  seedTask('Rainbow Chard', 'Check and trim roots', 'roots', null);
  seedTask('Strawberry', 'Harvest ripe berries', 'harvest', null);
  seedTask('Lettuce', 'Harvest outer leaves', 'harvest', inAWeek);
  seedTask('Thai Chili', 'Stake leaning stem', 'other', inAWeek);
}
