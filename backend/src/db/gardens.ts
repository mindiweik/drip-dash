import type Database from 'better-sqlite3';

export interface Garden {
  id: string;
  name: string;
  type: 'gardyn' | 'nursery';
  cols: number;
  positionsPerCol: number;
}

interface GardenRow {
  id: string;
  name: string;
  type: string;
  cols: number;
  positions_per_col: number;
}

export function listGardens(db: Database.Database): Garden[] {
  const rows = db.prepare('SELECT * FROM gardens ORDER BY id').all() as GardenRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type as Garden['type'],
    cols: r.cols,
    positionsPerCol: r.positions_per_col,
  }));
}

export function seedDefaultGardens(db: Database.Database): void {
  const existing = db.prepare('SELECT COUNT(*) as n FROM gardens').get() as { n: number };
  if (existing.n > 0) return;
  const insert = db.prepare(
    'INSERT INTO gardens (id, name, type, cols, positions_per_col) VALUES (?, ?, ?, ?, ?)',
  );
  insert.run('gardyn-1', 'Weik & Wander', 'gardyn', 3, 10);
  insert.run('gardyn-2', 'Mystical Menagerie', 'gardyn', 3, 10);
}
