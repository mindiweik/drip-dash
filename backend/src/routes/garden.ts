import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getLatestSnapshot } from '../db/snapshots.js';
import { getOpenChores, completeChore } from '../care/chores.js';

const GARDYN_IDS = ['gardyn-1', 'gardyn-2'];
const STALE_MINUTES = 45;

export function makeGardenRouter(db: Database.Database, now: () => Date = () => new Date()): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    const gardens = GARDYN_IDS.map((gardynId) => {
      const snapshot = getLatestSnapshot(db, gardynId);
      let ageMinutes: number | null = null;
      let stale = true;
      if (snapshot) {
        ageMinutes = Math.round((now().getTime() - new Date(snapshot.takenAt).getTime()) / 60000);
        stale = ageMinutes > STALE_MINUTES;
      }
      return { gardynId, snapshot, ageMinutes, stale };
    });
    res.json({ gardens });
  });

  router.get('/chores', (_req, res) => {
    res.json({ chores: getOpenChores(db) });
  });

  router.post('/chores/:id/complete', (req, res) => {
    completeChore(db, Number(req.params.id), now().toISOString());
    res.json({ ok: true });
  });

  router.get('/plants', (_req, res) => {
    const rows = db.prepare('SELECT * FROM plants').all();
    res.json({ plants: rows });
  });

  router.put('/plants/:id', (req, res) => {
    const { name, variety, planted_at, notes } = req.body ?? {};
    db.prepare('UPDATE plants SET name = ?, variety = ?, planted_at = ?, notes = ? WHERE id = ?').run(
      name ?? null,
      variety ?? null,
      planted_at ?? null,
      notes ?? null,
      Number(req.params.id),
    );
    res.json({ ok: true });
  });

  return router;
}
