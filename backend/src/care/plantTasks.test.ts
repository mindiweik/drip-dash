import { describe, it, expect } from 'vitest';
import { getDb } from '../db/database.js';
import { seedDefaultGardens } from '../db/gardens.js';
import {
  getPlantTasks,
  createPlantTask,
  updatePlantTask,
  deletePlantTask,
} from './plantTasks.js';
import { getOpenChores, completeChore, uncompleteChore } from './chores.js';
import { archivePlant, createPlant } from '../db/plants.js';
import { createCatalog } from '../db/catalog.js';

const NOW = '2026-07-15T12:00:00.000Z';

let n = 0;
function dbWithPlant() {
  const db = getDb(`:memory:ptask-${n++}`);
  seedDefaultGardens(db);
  const catalogId = createCatalog(db, { name: 'Basil' }, NOW).id;
  const plant = createPlant(db, { gardynId: 'gardyn-1', col: 1, position: 1, catalogId });
  return { db, plantId: plant.id };
}

describe('plant tasks', () => {
  it('creates, lists, edits, and deletes a plant task', () => {
    const { db, plantId } = dbWithPlant();
    const task = createPlantTask(db, plantId, { title: 'Trim leggy stems', kind: 'trim' }, NOW);
    expect(getPlantTasks(db, plantId)).toHaveLength(1);
    expect(updatePlantTask(db, task.id, { kind: 'harvest', dueAt: '2026-08-01T00:00:00.000Z' })).toBe(true);
    const updated = getPlantTasks(db, plantId)[0];
    expect(updated.kind).toBe('harvest');
    expect(updated.dueAt).toBe('2026-08-01T00:00:00.000Z');
    expect(deletePlantTask(db, task.id)).toBe(true);
    expect(getPlantTasks(db, plantId)).toHaveLength(0);
  });

  it('due-now tasks reach the board, future ones do not', () => {
    const { db, plantId } = dbWithPlant();
    createPlantTask(db, plantId, { title: 'Pollinate flowers', kind: 'pollinate' }, NOW);
    createPlantTask(
      db, plantId,
      { title: 'Harvest', kind: 'harvest', dueAt: '2026-09-01T00:00:00.000Z' },
      NOW,
    );
    const board = getOpenChores(db, NOW);
    expect(board.some((c) => c.title === 'Pollinate flowers' && c.plantName === 'Basil')).toBe(true);
    expect(board.some((c) => c.title === 'Harvest')).toBe(false);
    expect(getPlantTasks(db, plantId)).toHaveLength(2);
  });

  it('completing a plant task does not touch care schedules; uncomplete reopens it', () => {
    const { db, plantId } = dbWithPlant();
    const task = createPlantTask(db, plantId, { title: 'Check roots', kind: 'roots' }, NOW);
    completeChore(db, task.id, NOW);
    expect(getPlantTasks(db, plantId)).toHaveLength(0);
    uncompleteChore(db, task.id);
    expect(getPlantTasks(db, plantId)).toHaveLength(1);
  });

  it('rejects tasks for a missing plant', () => {
    const { db } = dbWithPlant();
    expect(() => createPlantTask(db, 9999, { title: 'x', kind: 'other' }, NOW)).toThrow();
  });

  it('rejects tasks for an archived plant', () => {
    const { db, plantId } = dbWithPlant();
    archivePlant(db, plantId, 'other', NOW);
    expect(() => createPlantTask(db, plantId, { title: 'x', kind: 'other' }, NOW)).toThrow();
  });
});
