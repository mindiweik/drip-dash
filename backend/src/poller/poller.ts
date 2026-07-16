import type Database from 'better-sqlite3';
import type { GardynDataSource } from '../datasources/GardynDataSource.js';
import { insertSnapshot } from '../db/snapshots.js';
import { computeChores } from '../care/chores.js';
import { listGardens } from '../db/gardens.js';

export async function pollOnce(
  db: Database.Database,
  source: GardynDataSource,
  now: string,
  gardynIds?: string[],
): Promise<void> {
  const ids = gardynIds ?? listGardens(db).map((g) => g.id);
  for (const gardynId of ids) {
    try {
      const snap = await source.fetchSnapshot(gardynId);
      insertSnapshot(db, snap);
    } catch (err) {
      console.error(`poll failed for ${gardynId}:`, err);
    }
  }
  computeChores(db, now);
}

export function startPolling(
  db: Database.Database,
  source: GardynDataSource,
  opts: { intervalMs?: number } = {},
): () => void {
  const intervalMs = opts.intervalMs ?? 15 * 60 * 1000;
  const tick = () => {
    void pollOnce(db, source, new Date().toISOString());
  };
  tick(); // fire once on startup so a fresh boot is not blank
  const handle = setInterval(tick, intervalMs);
  return () => clearInterval(handle);
}
