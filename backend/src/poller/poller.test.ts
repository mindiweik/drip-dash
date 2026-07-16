import { describe, it, expect } from 'vitest';
import { getDb } from '../db/database.js';
import { getLatestSnapshot } from '../db/snapshots.js';
import { getOpenChores } from '../care/chores.js';
import { WATER_LOW_THRESHOLD } from '../care/chores.js';
import { seedDefaultGardens } from '../db/gardens.js';
import { GardynMockSource } from '../datasources/GardynMockSource.js';
import { pollOnce } from './poller.js';
import type { GardynSnapshot } from '@shared/types';

describe('pollOnce', () => {
  it('writes a snapshot for each gardyn and runs chore computation', async () => {
    const db = getDb(':memory:poller-1');
    seedDefaultGardens(db);
    const fixedSource = {
      fetchSnapshot: async (id: string): Promise<GardynSnapshot> => {
        const takenAt = '2026-07-06T12:00:00.000Z';
        if (id === 'gardyn-1') {
          return {
            gardynId: 'gardyn-1',
            takenAt,
            waterLevelPct: WATER_LOW_THRESHOLD - 5, // Explicitly low to trigger chore
            temperatureC: 22,
            humidityPct: 60,
            light: 'on',
          };
        }
        return {
          gardynId: 'gardyn-2',
          takenAt,
          waterLevelPct: 80, // Normal level
          temperatureC: 22,
          humidityPct: 60,
          light: 'on',
        };
      },
    };
    await pollOnce(db, fixedSource, '2026-07-06T12:00:00.000Z', ['gardyn-1', 'gardyn-2']);
    expect(getLatestSnapshot(db, 'gardyn-1')).not.toBeNull();
    expect(getLatestSnapshot(db, 'gardyn-2')).not.toBeNull();
    // gardyn-1 has low water, should trigger a data-driven chore
    const open = getOpenChores(db);
    expect(open.some((c) => c.gardynId === 'gardyn-1' && c.source === 'data-trigger')).toBe(true);
    // gardyn-2 has normal water, should not trigger a data chore
    expect(open.some((c) => c.gardynId === 'gardyn-2' && c.source === 'data-trigger')).toBe(false);
  });

  it('does not throw if the source fails for one gardyn', async () => {
    const db = getDb(':memory:poller-2');
    seedDefaultGardens(db);
    const flaky = {
      fetchSnapshot: async (id: string) => {
        if (id === 'gardyn-2') throw new Error('boom');
        return new GardynMockSource().fetchSnapshot(id);
      },
    };
    await expect(pollOnce(db, flaky, '2026-07-06T20:00:00.000Z', ['gardyn-1', 'gardyn-2'])).resolves.toBeUndefined();
    expect(getLatestSnapshot(db, 'gardyn-1')).not.toBeNull();
    expect(getLatestSnapshot(db, 'gardyn-2')).toBeNull();
  });
});
