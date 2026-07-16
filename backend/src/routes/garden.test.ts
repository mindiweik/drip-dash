import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../db/database.js';
import { insertSnapshot } from '../db/snapshots.js';
import { makeGardenRouter } from './garden.js';
import type { GardynSnapshot } from '@shared/types';

function appWith(dbKey: string) {
  const db = getDb(dbKey);
  const app = express();
  app.use(express.json());
  app.use('/api', makeGardenRouter(db, () => new Date('2026-07-06T12:10:00.000Z')));
  return { app, db };
}

const snap: GardynSnapshot = {
  gardynId: 'gardyn-1',
  takenAt: '2026-07-06T12:00:00.000Z',
  waterLevelPct: 80,
  temperatureC: 22,
  humidityPct: 60,
  light: 'on',
};

describe('garden routes', () => {
  it('GET /api/status reports snapshot age and stale=false when recent', async () => {
    const { app, db } = appWith(':memory:routes-1');
    insertSnapshot(db, snap);
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    const g1 = res.body.gardens.find((g: any) => g.gardynId === 'gardyn-1');
    expect(g1.snapshot.waterLevelPct).toBe(80);
    expect(g1.ageMinutes).toBe(10);
    expect(g1.stale).toBe(false);
  });

  it('POST /api/chores/:id/complete closes the chore', async () => {
    const { app, db } = appWith(':memory:routes-2');
    db.prepare(
      'INSERT INTO chores (gardyn_id, title, source, created_at, completed_at) VALUES (?, ?, ?, ?, NULL)',
    ).run('gardyn-1', 'Top up water (gardyn-1)', 'data-trigger', '2026-07-06T12:00:00.000Z');
    const list = await request(app).get('/api/chores');
    const id = list.body.chores[0].id;
    const res = await request(app).post(`/api/chores/${id}/complete`);
    expect(res.status).toBe(200);
    const after = await request(app).get('/api/chores');
    expect(after.body.chores.length).toBe(0);
  });

  it('GET /api/status reports snapshot null and stale=true when there is no snapshot', async () => {
    const { app } = appWith(':memory:routes-3');
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    const g1 = res.body.gardens.find((g: any) => g.gardynId === 'gardyn-1');
    expect(g1.snapshot).toBe(null);
    expect(g1.ageMinutes).toBe(null);
    expect(g1.stale).toBe(true);
  });

  it('GET /api/plants returns seeded rows', async () => {
    const { app, db } = appWith(':memory:routes-4');
    db.prepare(
      'INSERT INTO plants (gardyn_id, col, position, name, variety, planted_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run('gardyn-1', 1, 1, 'Basil', 'Genovese', '2026-07-01T00:00:00.000Z', 'thriving');
    const res = await request(app).get('/api/plants');
    expect(res.status).toBe(200);
    expect(res.body.plants.length).toBe(1);
    expect(res.body.plants[0].name).toBe('Basil');
    expect(res.body.plants[0].variety).toBe('Genovese');
  });

  it('PUT /api/plants/:id partial update preserves unsent fields', async () => {
    const { app, db } = appWith(':memory:routes-5');
    const insert = db
      .prepare('INSERT INTO plants (gardyn_id, col, position, name, variety, planted_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('gardyn-1', 1, 1, 'Basil', 'Genovese', '2026-07-01T00:00:00.000Z', 'old notes');
    const id = insert.lastInsertRowid;

    const res = await request(app).put(`/api/plants/${id}`).send({ notes: 'new' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const row: any = db.prepare('SELECT * FROM plants WHERE id = ?').get(id);
    expect(row.name).toBe('Basil');
    expect(row.variety).toBe('Genovese');
    expect(row.planted_at).toBe('2026-07-01T00:00:00.000Z');
    expect(row.notes).toBe('new');
  });

  it('PUT /api/plants/:id on a nonexistent id returns 404', async () => {
    const { app } = appWith(':memory:routes-6');
    const res = await request(app).put('/api/plants/999').send({ notes: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});
