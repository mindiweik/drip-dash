import type Database from 'better-sqlite3';
import type { GardynSnapshot } from '@shared/types';

export function insertSnapshot(db: Database.Database, snap: GardynSnapshot): void {
  db.prepare('INSERT INTO snapshots (gardyn_id, taken_at, data) VALUES (?, ?, ?)').run(
    snap.gardynId,
    snap.takenAt,
    JSON.stringify(snap),
  );
}

export function getLatestSnapshot(db: Database.Database, gardynId: string): GardynSnapshot | null {
  const row: any = db
    .prepare('SELECT data FROM snapshots WHERE gardyn_id = ? ORDER BY taken_at DESC LIMIT 1')
    .get(gardynId);
  return row ? (JSON.parse(row.data) as GardynSnapshot) : null;
}
