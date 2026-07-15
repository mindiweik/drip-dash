import { describe, it, expect } from 'vitest';
import { getDb } from './database.js';
import { insertSnapshot, getLatestSnapshot } from './snapshots.js';
import type { GardynSnapshot } from '@shared/types';

function snap(over: Partial<GardynSnapshot> = {}): GardynSnapshot {
  return {
    gardynId: 'gardyn-1',
    takenAt: '2026-07-06T12:00:00.000Z',
    waterLevelPct: 80,
    temperatureC: 22,
    humidityPct: 60,
    light: 'on',
    ...over,
  };
}

describe('snapshots repo', () => {
  it('returns null when there are no snapshots', () => {
    const db = getDb(':memory:');
    expect(getLatestSnapshot(db, 'gardyn-1')).toBeNull();
  });

  it('returns the most recent snapshot by takenAt', () => {
    const db = getDb(':memory:');
    insertSnapshot(db, snap({ takenAt: '2026-07-06T10:00:00.000Z', waterLevelPct: 90 }));
    insertSnapshot(db, snap({ takenAt: '2026-07-06T12:00:00.000Z', waterLevelPct: 70 }));
    const latest = getLatestSnapshot(db, 'gardyn-1');
    expect(latest?.waterLevelPct).toBe(70);
    expect(latest?.light).toBe('on');
  });
});
