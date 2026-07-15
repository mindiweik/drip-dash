import { describe, it, expect } from 'vitest';
import { getDb } from '../db/database.js';
import { getLatestSnapshot } from '../db/snapshots.js';
import { getOpenChores } from '../care/chores.js';
import { GardynMockSource } from '../datasources/GardynMockSource.js';
import { pollOnce } from './poller.js';

describe('pollOnce', () => {
  it('writes a snapshot for each gardyn and runs chore computation', async () => {
    const db = getDb(':memory:poller-1');
    const source = new GardynMockSource({ seed: 0, now: () => new Date('2026-07-06T23:00:00Z') });
    await pollOnce(db, source, '2026-07-06T23:00:00.000Z', ['gardyn-1', 'gardyn-2']);
    expect(getLatestSnapshot(db, 'gardyn-1')).not.toBeNull();
    expect(getLatestSnapshot(db, 'gardyn-2')).not.toBeNull();
    // 23:00 UTC = very late in the mock day, water is low, so a chore should exist.
    expect(getOpenChores(db).length).toBeGreaterThan(0);
  });

  it('does not throw if the source fails for one gardyn', async () => {
    const db = getDb(':memory:poller-2');
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
