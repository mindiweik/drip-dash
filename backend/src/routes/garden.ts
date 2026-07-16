import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getLatestSnapshot } from '../db/snapshots.js';
import { getOpenChores, completeChore, uncompleteChore, getChoresCompletedSince } from '../care/chores.js';
import { listGardens } from '../db/gardens.js';
import { listPlants, updatePlant, createPlant, archivePlant, movePlant, SlotOccupiedError, InvalidSlotError } from '../db/plants.js';
import type { RemoveReason } from '../db/plants.js';
import {
  getPlantTasks,
  createPlantTask,
  updatePlantTask,
  deletePlantTask,
} from '../care/plantTasks.js';
import type { TaskKind } from '../care/plantTasks.js';

const STALE_MINUTES = 45;
const TASK_KINDS: TaskKind[] = ['pollinate', 'roots', 'trim', 'harvest', 'other'];
const REMOVE_REASONS = ['harvested', 'died', 'other'];

function startOfLocalDay(d: Date): string {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return local.toISOString();
}

export function makeGardenRouter(db: Database.Database, now: () => Date = () => new Date()): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    const gardens = listGardens(db).map((garden) => {
      const snapshot = getLatestSnapshot(db, garden.id);
      let ageMinutes: number | null = null;
      let stale = true;
      if (snapshot) {
        ageMinutes = Math.round((now().getTime() - new Date(snapshot.takenAt).getTime()) / 60000);
        stale = ageMinutes > STALE_MINUTES;
      }
      return { gardynId: garden.id, name: garden.name, snapshot, ageMinutes, stale };
    });
    res.json({ gardens });
  });

  router.get('/chores', (_req, res) => {
    const at = now();
    res.json({
      chores: getOpenChores(db, at.toISOString()),
      doneToday: getChoresCompletedSince(db, startOfLocalDay(at)),
    });
  });

  router.post('/chores/:id/complete', (req, res) => {
    completeChore(db, Number(req.params.id), now().toISOString());
    res.json({ ok: true });
  });

  router.post('/chores/:id/uncomplete', (req, res) => {
    uncompleteChore(db, Number(req.params.id));
    res.json({ ok: true });
  });

  router.get('/plants', (_req, res) => {
    res.json({ plants: listPlants(db) });
  });

  router.put('/plants/:id', (req, res) => {
    const { name, variety, plantedAt, notes, careInstructions, about, uses } = req.body ?? {};
    // Guard against null or empty name
    if (name === null || name === '') {
      return res.status(400).json({ error: 'name cannot be empty' });
    }
    const ok = updatePlant(db, Number(req.params.id), {
      name, variety, plantedAt, notes, careInstructions, about, uses,
    });
    if (!ok) return res.status(404).json({ ok: false });
    res.json({ ok: true });
  });

  router.get('/plants/:id/tasks', (req, res) => {
    res.json({ tasks: getPlantTasks(db, Number(req.params.id)) });
  });

  router.post('/plants/:id/tasks', (req, res) => {
    const { title, kind, dueAt } = req.body ?? {};
    if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title required' });
    if (!TASK_KINDS.includes(kind)) return res.status(400).json({ error: 'invalid kind' });
    try {
      const task = createPlantTask(db, Number(req.params.id), { title, kind, dueAt }, now().toISOString());
      res.json({ task });
    } catch {
      res.status(404).json({ error: 'plant not found' });
    }
  });

  router.patch('/tasks/:id', (req, res) => {
    const { title, kind, dueAt } = req.body ?? {};
    if (kind !== undefined && !TASK_KINDS.includes(kind)) {
      return res.status(400).json({ error: 'invalid kind' });
    }
    const ok = updatePlantTask(db, Number(req.params.id), { title, kind, dueAt });
    if (!ok) return res.status(404).json({ ok: false });
    res.json({ ok: true });
  });

  router.delete('/tasks/:id', (req, res) => {
    const ok = deletePlantTask(db, Number(req.params.id));
    if (!ok) return res.status(404).json({ ok: false });
    res.json({ ok: true });
  });

  router.post('/plants', (req, res) => {
    const { gardynId, col, position, name, variety, plantedAt, notes, careInstructions, about, uses } = req.body ?? {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
    try {
      const plant = createPlant(db, { gardynId, col, position, name, variety, plantedAt, notes, careInstructions, about, uses });
      res.json({ plant });
    } catch (err) {
      if (err instanceof SlotOccupiedError) return res.status(409).json({ error: 'slot occupied' });
      if (err instanceof InvalidSlotError) return res.status(400).json({ error: 'invalid slot' });
      throw err;
    }
  });

  router.delete('/plants/:id', (req, res) => {
    const { reason } = req.body ?? {};
    if (!REMOVE_REASONS.includes(reason)) return res.status(400).json({ error: 'invalid reason' });
    const ok = archivePlant(db, Number(req.params.id), reason, now().toISOString());
    if (!ok) return res.status(404).json({ ok: false });
    res.json({ ok: true });
  });

  router.patch('/plants/:id/position', (req, res) => {
    const { gardynId, col, position } = req.body ?? {};
    const result = movePlant(db, Number(req.params.id), { gardynId, col, position });
    if (result === 'missing') return res.status(404).json({ ok: false });
    if (result === 'invalid') return res.status(400).json({ error: 'invalid target' });
    res.json({ ok: true, swapped: result === 'swapped' });
  });

  return router;
}
