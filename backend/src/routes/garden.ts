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
    const id = Number(req.params.id);
    const existing: any = db.prepare('SELECT * FROM plants WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ ok: false });
      return;
    }
    const body = req.body ?? {};
    const name = body.name !== undefined ? body.name : existing.name;
    const variety = body.variety !== undefined ? body.variety : existing.variety;
    const planted_at = body.planted_at !== undefined ? body.planted_at : existing.planted_at;
    const notes = body.notes !== undefined ? body.notes : existing.notes;
    db.prepare('UPDATE plants SET name = ?, variety = ?, planted_at = ?, notes = ? WHERE id = ?').run(
      name,
      variety,
      planted_at,
      notes,
      id,
    );
    res.json({ ok: true });
  });

  return router;
}
