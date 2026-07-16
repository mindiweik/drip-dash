import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../db/database.js';
import { insertSnapshot } from '../db/snapshots.js';
import { makeGardenRouter } from './garden.js';
import { seedDefaultGardens } from '../db/gardens.js';
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
    seedDefaultGardens(db);
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
    const { app, db } = appWith(':memory:routes-3');
    seedDefaultGardens(db);
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    const g1 = res.body.gardens.find((g: any) => g.gardynId === 'gardyn-1');
    expect(g1.snapshot).toBe(null);
    expect(g1.ageMinutes).toBe(null);
    expect(g1.stale).toBe(true);
  });

  it('GET /api/plants returns seeded rows in camelCase', async () => {
    const { app, db } = appWith(':memory:routes-4');
    db.prepare(
      'INSERT INTO plants (gardyn_id, col, position, name, variety, planted_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run('gardyn-1', 1, 1, 'Basil', 'Genovese', '2026-07-01T00:00:00.000Z', 'thriving');
    const res = await request(app).get('/api/plants');
    expect(res.status).toBe(200);
    expect(res.body.plants.length).toBe(1);
    expect(res.body.plants[0].name).toBe('Basil');
    expect(res.body.plants[0].variety).toBe('Genovese');
    expect(res.body.plants[0].plantedAt).toBe('2026-07-01T00:00:00.000Z');
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

    // Also verify camelCase response contract
    const get = await request(app).get('/api/plants');
    const updated = get.body.plants.find((p: any) => p.id === id);
    expect(updated.notes).toBe('new');
    expect(updated.plantedAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('PUT /api/plants/:id on a nonexistent id returns 404', async () => {
    const { app } = appWith(':memory:routes-6');
    const res = await request(app).put('/api/plants/999').send({ notes: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  it('GET /api/status includes garden display names', async () => {
    const { app, db } = appWith(':memory:routes-names');
    seedDefaultGardens(db);
    const res = await request(app).get('/api/status');
    const names = res.body.gardens.map((g: any) => g.name);
    expect(names).toEqual(['Weik & Wander', 'Mystical Menagerie']);
  });

  it('plant task lifecycle over HTTP: create, list, patch, complete, undo, delete', async () => {
    const { app, db } = appWith(':memory:routes-ptasks');
    seedDefaultGardens(db);
    db.prepare(
      "INSERT INTO plants (gardyn_id, col, position, name) VALUES ('gardyn-1', 1, 1, 'Basil')",
    ).run();
    const plant: any = db.prepare('SELECT id FROM plants').get();

    const created = await request(app)
      .post(`/api/plants/${plant.id}/tasks`)
      .send({ title: 'Trim stems', kind: 'trim' });
    expect(created.status).toBe(200);
    const taskId = created.body.task.id;

    const list = await request(app).get(`/api/plants/${plant.id}/tasks`);
    expect(list.body.tasks).toHaveLength(1);

    const patched = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .send({ dueAt: '2026-09-01T00:00:00.000Z' });
    expect(patched.status).toBe(200);

    await request(app).post(`/api/chores/${taskId}/complete`);
    const afterComplete = await request(app).get(`/api/plants/${plant.id}/tasks`);
    expect(afterComplete.body.tasks).toHaveLength(0);

    await request(app).post(`/api/chores/${taskId}/uncomplete`);
    const afterUndo = await request(app).get(`/api/plants/${plant.id}/tasks`);
    expect(afterUndo.body.tasks).toHaveLength(1);

    const deleted = await request(app).delete(`/api/tasks/${taskId}`);
    expect(deleted.status).toBe(200);
  });

  it('POST task validates input and 404s on missing plant', async () => {
    const { app, db } = appWith(':memory:routes-ptasks-2');
    seedDefaultGardens(db);
    const bad = await request(app).post('/api/plants/9999/tasks').send({ title: 'x', kind: 'trim' });
    expect(bad.status).toBe(404);
    db.prepare(
      "INSERT INTO plants (gardyn_id, col, position, name) VALUES ('gardyn-1', 1, 1, 'Basil')",
    ).run();
    const plant: any = db.prepare('SELECT id FROM plants').get();
    const noTitle = await request(app).post(`/api/plants/${plant.id}/tasks`).send({ kind: 'trim' });
    expect(noTitle.status).toBe(400);
    const badKind = await request(app)
      .post(`/api/plants/${plant.id}/tasks`)
      .send({ title: 'x', kind: 'water-dance' });
    expect(badKind.status).toBe(400);
  });

  it('PUT /api/plants/:id round-trips rich fields in camelCase', async () => {
    const { app, db } = appWith(':memory:routes-rich');
    seedDefaultGardens(db);
    db.prepare(
      "INSERT INTO plants (gardyn_id, col, position, name) VALUES ('gardyn-1', 1, 1, 'Basil')",
    ).run();
    const plant: any = db.prepare('SELECT id FROM plants').get();
    const res = await request(app)
      .put(`/api/plants/${plant.id}`)
      .send({ careInstructions: 'Trim weekly', uses: 'Pesto' });
    expect(res.status).toBe(200);
    const after = await request(app).get('/api/plants');
    expect(after.body.plants[0].careInstructions).toBe('Trim weekly');
    expect(after.body.plants[0].uses).toBe('Pesto');
    expect(after.body.plants[0].name).toBe('Basil');
  });

  it('GET /api/chores returns doneToday completions', async () => {
    const { app, db } = appWith(':memory:routes-done');
    seedDefaultGardens(db);
    db.prepare(
      "INSERT INTO chores (gardyn_id, title, source, created_at, completed_at) VALUES ('gardyn-1', 'Tank clean (gardyn-1)', 'schedule', '2026-07-06T12:00:00.000Z', '2026-07-06T12:05:00.000Z')",
    ).run();
    const res = await request(app).get('/api/chores');
    expect(res.body.doneToday).toHaveLength(1);
    expect(res.body.chores).toHaveLength(0);
  });

  it('PUT /api/plants/:id guards against null name', async () => {
    const { app, db } = appWith(':memory:routes-null-guard');
    seedDefaultGardens(db);
    db.prepare(
      "INSERT INTO plants (gardyn_id, col, position, name) VALUES ('gardyn-1', 1, 1, 'Basil')",
    ).run();
    const plant: any = db.prepare('SELECT id FROM plants').get();
    const res = await request(app)
      .put(`/api/plants/${plant.id}`)
      .send({ name: null });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name cannot be empty');
  });

  it('PUT /api/plants/:id guards against empty string name', async () => {
    const { app, db } = appWith(':memory:routes-empty-guard');
    seedDefaultGardens(db);
    db.prepare(
      "INSERT INTO plants (gardyn_id, col, position, name) VALUES ('gardyn-1', 1, 1, 'Basil')",
    ).run();
    const plant: any = db.prepare('SELECT id FROM plants').get();
    const res = await request(app)
      .put(`/api/plants/${plant.id}`)
      .send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name cannot be empty');
  });

  it('PATCH /api/tasks/:id validates kind on update', async () => {
    const { app, db } = appWith(':memory:routes-patch-kind');
    seedDefaultGardens(db);
    db.prepare(
      "INSERT INTO plants (gardyn_id, col, position, name) VALUES ('gardyn-1', 1, 1, 'Basil')",
    ).run();
    const plant: any = db.prepare('SELECT id FROM plants').get();
    const created = await request(app)
      .post(`/api/plants/${plant.id}/tasks`)
      .send({ title: 'Trim stems', kind: 'trim' });
    const taskId = created.body.task.id;

    const patched = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .send({ kind: 'invalid-kind' });
    expect(patched.status).toBe(400);
    expect(patched.body.error).toBe('invalid kind');
  });
});
