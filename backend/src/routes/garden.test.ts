import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../db/database.js';
import { insertSnapshot } from '../db/snapshots.js';
import { makeGardenRouter } from './garden.js';
import { seedDefaultGardens } from '../db/gardens.js';
import { seedFakePlants } from '../db/plants.js';
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
    seedDefaultGardens(db);
    const cat = await request(app).post('/api/catalog').send({ name: 'Basil', variety: 'Genovese' });
    await request(app).post('/api/plants').send({
      gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cat.body.catalog.id,
      plantedAt: '2026-07-01T00:00:00.000Z', notes: 'thriving',
    });
    const res = await request(app).get('/api/plants');
    expect(res.status).toBe(200);
    expect(res.body.plants.length).toBe(1);
    expect(res.body.plants[0].name).toBe('Basil');
    expect(res.body.plants[0].variety).toBe('Genovese');
    expect(res.body.plants[0].plantedAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('PUT /api/plants/:id partial update preserves unsent fields', async () => {
    const { app, db } = appWith(':memory:routes-5');
    seedDefaultGardens(db);
    const cat = await request(app).post('/api/catalog').send({ name: 'Basil', variety: 'Genovese' });
    const created = await request(app).post('/api/plants').send({
      gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cat.body.catalog.id,
      plantedAt: '2026-07-01T00:00:00.000Z', notes: 'old notes',
    });
    const id = created.body.plant.id;

    const res = await request(app).put(`/api/plants/${id}`).send({ notes: 'new' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const row: any = db.prepare('SELECT catalog_id, planted_at, notes FROM plants WHERE id = ?').get(id);
    expect(row.catalog_id).toBe(cat.body.catalog.id);
    expect(row.planted_at).toBe('2026-07-01T00:00:00.000Z');
    expect(row.notes).toBe('new');

    // Also verify camelCase response contract
    const get = await request(app).get('/api/plants');
    const updated = get.body.plants.find((p: any) => p.id === id);
    expect(updated.name).toBe('Basil');
    expect(updated.variety).toBe('Genovese');
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
    const cat = await request(app).post('/api/catalog').send({ name: 'Basil' });
    const plant = await request(app).post('/api/plants').send({
      gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cat.body.catalog.id,
    });
    const plantId = plant.body.plant.id;

    const created = await request(app)
      .post(`/api/plants/${plantId}/tasks`)
      .send({ title: 'Trim stems', kind: 'trim' });
    expect(created.status).toBe(200);
    const taskId = created.body.task.id;

    const list = await request(app).get(`/api/plants/${plantId}/tasks`);
    expect(list.body.tasks).toHaveLength(1);

    const patched = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .send({ dueAt: '2026-09-01T00:00:00.000Z' });
    expect(patched.status).toBe(200);

    await request(app).post(`/api/chores/${taskId}/complete`);
    const afterComplete = await request(app).get(`/api/plants/${plantId}/tasks`);
    expect(afterComplete.body.tasks).toHaveLength(0);

    await request(app).post(`/api/chores/${taskId}/uncomplete`);
    const afterUndo = await request(app).get(`/api/plants/${plantId}/tasks`);
    expect(afterUndo.body.tasks).toHaveLength(1);

    const deleted = await request(app).delete(`/api/tasks/${taskId}`);
    expect(deleted.status).toBe(200);
  });

  it('POST task validates input and 404s on missing plant', async () => {
    const { app, db } = appWith(':memory:routes-ptasks-2');
    seedDefaultGardens(db);
    const bad = await request(app).post('/api/plants/9999/tasks').send({ title: 'x', kind: 'trim' });
    expect(bad.status).toBe(404);
    const cat = await request(app).post('/api/catalog').send({ name: 'Basil' });
    const plant = await request(app).post('/api/plants').send({
      gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cat.body.catalog.id,
    });
    const noTitle = await request(app).post(`/api/plants/${plant.body.plant.id}/tasks`).send({ kind: 'trim' });
    expect(noTitle.status).toBe(400);
    const badKind = await request(app)
      .post(`/api/plants/${plant.body.plant.id}/tasks`)
      .send({ title: 'x', kind: 'water-dance' });
    expect(badKind.status).toBe(400);
  });

  it('rich fields (careInstructions, uses) round-trip via the catalog, not PUT /plants', async () => {
    const { app, db } = appWith(':memory:routes-rich');
    seedDefaultGardens(db);
    const cat = await request(app)
      .post('/api/catalog')
      .send({ name: 'Basil', careInstructions: 'Trim weekly', uses: 'Pesto' });
    await request(app).post('/api/plants').send({
      gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cat.body.catalog.id,
    });
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

  it('PATCH /api/catalog/:id guards against null name', async () => {
    const { app } = appWith(':memory:routes-null-guard');
    const cat = await request(app).post('/api/catalog').send({ name: 'Basil' });
    const res = await request(app)
      .patch(`/api/catalog/${cat.body.catalog.id}`)
      .send({ name: null });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name cannot be empty');
  });

  it('PATCH /api/catalog/:id guards against empty string name', async () => {
    const { app } = appWith(':memory:routes-empty-guard');
    const cat = await request(app).post('/api/catalog').send({ name: 'Basil' });
    const res = await request(app)
      .patch(`/api/catalog/${cat.body.catalog.id}`)
      .send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name cannot be empty');
  });

  it('PATCH /api/tasks/:id validates kind on update', async () => {
    const { app, db } = appWith(':memory:routes-patch-kind');
    seedDefaultGardens(db);
    const cat = await request(app).post('/api/catalog').send({ name: 'Basil' });
    const plant = await request(app).post('/api/plants').send({
      gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cat.body.catalog.id,
    });
    const created = await request(app)
      .post(`/api/plants/${plant.body.plant.id}/tasks`)
      .send({ title: 'Trim stems', kind: 'trim' });
    const taskId = created.body.task.id;

    const patched = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .send({ kind: 'invalid-kind' });
    expect(patched.status).toBe(400);
    expect(patched.body.error).toBe('invalid kind');
  });

  it('PATCH /api/tasks/:id rejects non-plant chores with 404', async () => {
    const { app, db } = appWith(':memory:routes-nonplant-patch');
    const insert = db
      .prepare(
        'INSERT INTO chores (gardyn_id, title, source, created_at, completed_at) VALUES (?, ?, ?, ?, NULL)',
      )
      .run('gardyn-1', 'Tank clean', 'schedule', '2026-07-06T12:00:00.000Z');
    const choreId = insert.lastInsertRowid;

    const patched = await request(app)
      .patch(`/api/tasks/${choreId}`)
      .send({ title: 'hijacked' });
    expect(patched.status).toBe(404);

    const row: any = db.prepare('SELECT * FROM chores WHERE id = ?').get(choreId);
    expect(row.title).toBe('Tank clean');
  });

  it('DELETE /api/tasks/:id rejects non-plant chores with 404', async () => {
    const { app, db } = appWith(':memory:routes-nonplant-delete');
    const insert = db
      .prepare(
        'INSERT INTO chores (gardyn_id, title, source, created_at, completed_at) VALUES (?, ?, ?, ?, NULL)',
      )
      .run('gardyn-1', 'Tank clean', 'schedule', '2026-07-06T12:00:00.000Z');
    const choreId = insert.lastInsertRowid;

    const deleted = await request(app).delete(`/api/tasks/${choreId}`);
    expect(deleted.status).toBe(404);

    const row: any = db.prepare('SELECT * FROM chores WHERE id = ?').get(choreId);
    expect(row).toBeDefined();
    expect(row.title).toBe('Tank clean');
  });

  it('POST /api/plants creates in an empty slot, 409s occupied, 400s bad input', async () => {
    const { app, db } = appWith(':memory:routes-create');
    seedDefaultGardens(db);
    const dill = await request(app).post('/api/catalog').send({ name: 'Dill', variety: 'Bouquet' });
    const mint = await request(app).post('/api/catalog').send({ name: 'Mint' });
    const ok = await request(app).post('/api/plants').send({
      gardynId: 'gardyn-1', col: 1, position: 3, catalogId: dill.body.catalog.id,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.plant.name).toBe('Dill');
    const dup = await request(app).post('/api/plants').send({
      gardynId: 'gardyn-1', col: 1, position: 3, catalogId: mint.body.catalog.id,
    });
    expect(dup.status).toBe(409);
    const noCatalogId = await request(app).post('/api/plants').send({ gardynId: 'gardyn-1', col: 1, position: 4 });
    expect(noCatalogId.status).toBe(400);
    const badSlot = await request(app).post('/api/plants').send({
      gardynId: 'gardyn-1', col: 9, position: 1, catalogId: mint.body.catalog.id,
    });
    expect(badSlot.status).toBe(400);
  });

  it('DELETE /api/plants/:id archives with a reason', async () => {
    const { app, db } = appWith(':memory:routes-archive');
    seedDefaultGardens(db);
    const cat = await request(app).post('/api/catalog').send({ name: 'Basil' });
    const created = await request(app).post('/api/plants').send({
      gardynId: 'gardyn-1', col: 1, position: 1, catalogId: cat.body.catalog.id,
    });
    const id = created.body.plant.id;
    const badReason = await request(app).delete(`/api/plants/${id}`).send({ reason: 'vanished' });
    expect(badReason.status).toBe(400);
    const ok = await request(app).delete(`/api/plants/${id}`).send({ reason: 'harvested' });
    expect(ok.status).toBe(200);
    const row: any = db.prepare('SELECT removed_reason FROM plants WHERE id = ?').get(id);
    expect(row.removed_reason).toBe('harvested');
    const again = await request(app).delete(`/api/plants/${id}`).send({ reason: 'other' });
    expect(again.status).toBe(404);
  });

  it('PATCH /api/plants/:id/position moves and swaps', async () => {
    const { app, db } = appWith(':memory:routes-move');
    seedDefaultGardens(db);
    const catA = await request(app).post('/api/catalog').send({ name: 'A' });
    const catB = await request(app).post('/api/catalog').send({ name: 'B' });
    const a = (await request(app).post('/api/plants').send({ gardynId: 'gardyn-1', col: 1, position: 1, catalogId: catA.body.catalog.id })).body.plant;
    const b = (await request(app).post('/api/plants').send({ gardynId: 'gardyn-2', col: 2, position: 5, catalogId: catB.body.catalog.id })).body.plant;
    const move = await request(app).patch(`/api/plants/${a.id}/position`).send({ gardynId: 'gardyn-1', col: 3, position: 7 });
    expect(move.status).toBe(200);
    expect(move.body.swapped).toBe(false);
    const swap = await request(app).patch(`/api/plants/${a.id}/position`).send({ gardynId: 'gardyn-2', col: 2, position: 5 });
    expect(swap.status).toBe(200);
    expect(swap.body.swapped).toBe(true);
    const bad = await request(app).patch(`/api/plants/${a.id}/position`).send({ gardynId: 'gardyn-1', col: 99, position: 1 });
    expect(bad.status).toBe(400);
    const missing = await request(app).patch('/api/plants/9999/position').send({ gardynId: 'gardyn-1', col: 1, position: 2 });
    expect(missing.status).toBe(404);
  });
});

describe('catalog + catalog-linked plant routes', () => {
  let key = 0;
  const fresh = () => {
    const ctx = appWith(`:memory:catalog-routes-${key++}`);
    seedDefaultGardens(ctx.db);
    return ctx;
  };

  it('POST /api/catalog creates an entry, 409 on duplicate, 400 on empty name', async () => {
    const { app } = fresh();
    const ok = await request(app).post('/api/catalog').send({ name: 'Basil', variety: 'Genovese' });
    expect(ok.status).toBe(200);
    expect(ok.body.catalog.name).toBe('Basil');

    const dup = await request(app).post('/api/catalog').send({ name: 'Basil', variety: 'Genovese' });
    expect(dup.status).toBe(409);

    const bad = await request(app).post('/api/catalog').send({ name: '' });
    expect(bad.status).toBe(400);
  });

  it('GET /api/catalog lists entries', async () => {
    const { app } = fresh();
    await request(app).post('/api/catalog').send({ name: 'Mint' });
    const res = await request(app).get('/api/catalog');
    expect(res.status).toBe(200);
    expect(res.body.catalog.map((c: { name: string }) => c.name)).toContain('Mint');
  });

  it('PATCH /api/catalog/:id updates reference fields, 404 for missing', async () => {
    const { app } = fresh();
    const c = await request(app).post('/api/catalog').send({ name: 'Sage' });
    const id = c.body.catalog.id;
    const upd = await request(app).patch(`/api/catalog/${id}`).send({ tempPref: '60-70F' });
    expect(upd.status).toBe(200);
    const miss = await request(app).patch('/api/catalog/9999').send({ tempPref: 'x' });
    expect(miss.status).toBe(404);
  });

  it('POST /api/plants takes catalogId; 400 missing, 404 unknown, 409 occupied', async () => {
    const { app } = fresh();
    const c = await request(app).post('/api/catalog').send({ name: 'Dill' });
    const catalogId = c.body.catalog.id;

    const missing = await request(app).post('/api/plants').send({ gardynId: 'gardyn-1', col: 1, position: 1 });
    expect(missing.status).toBe(400);

    const unknown = await request(app).post('/api/plants').send({ gardynId: 'gardyn-1', col: 1, position: 1, catalogId: 9999 });
    expect(unknown.status).toBe(404);

    const ok = await request(app).post('/api/plants').send({ gardynId: 'gardyn-1', col: 1, position: 1, catalogId });
    expect(ok.status).toBe(200);
    expect(ok.body.plant.name).toBe('Dill');

    const occupied = await request(app).post('/api/plants').send({ gardynId: 'gardyn-1', col: 1, position: 1, catalogId });
    expect(occupied.status).toBe(409);
  });

  it('PUT /api/plants/:id updates only plantedAt/notes', async () => {
    const { app } = fresh();
    const c = await request(app).post('/api/catalog').send({ name: 'Chive' });
    const plant = await request(app).post('/api/plants').send({ gardynId: 'gardyn-1', col: 2, position: 2, catalogId: c.body.catalog.id });
    const id = plant.body.plant.id;
    const upd = await request(app).put(`/api/plants/${id}`).send({ notes: 'thriving', plantedAt: '2026-06-15' });
    expect(upd.status).toBe(200);
    const plants = await request(app).get('/api/plants');
    const got = plants.body.plants.find((p: { id: number }) => p.id === id);
    expect(got.notes).toBe('thriving');
  });

  it('POST /api/clear-demo removes seeded demo rows but keeps real ones', async () => {
    const { app, db } = fresh();
    seedFakePlants(db);
    const real = await request(app).post('/api/catalog').send({ name: 'Cilantro' });
    await request(app).post('/api/plants').send({ gardynId: 'gardyn-2', col: 3, position: 10, catalogId: real.body.catalog.id });

    const res = await request(app).post('/api/clear-demo');
    expect(res.status).toBe(200);
    const plants = await request(app).get('/api/plants');
    expect(plants.body.plants).toHaveLength(1);
    expect(plants.body.plants[0].name).toBe('Cilantro');
  });
});
