import { describe, it, expect } from 'vitest';
import { GardynMockSource } from './GardynMockSource.js';

describe('GardynMockSource', () => {
  it('returns a snapshot with the requested gardynId and in-range values', async () => {
    const src = new GardynMockSource({ seed: 1, now: () => new Date('2026-07-06T12:00:00Z') });
    const snap = await src.fetchSnapshot('gardyn-1');
    expect(snap.gardynId).toBe('gardyn-1');
    expect(snap.takenAt).toBe('2026-07-06T12:00:00.000Z');
    expect(snap.waterLevelPct).toBeGreaterThanOrEqual(0);
    expect(snap.waterLevelPct).toBeLessThanOrEqual(100);
    expect(['on', 'off']).toContain(snap.light);
  });

  it('is deterministic for the same seed and time', async () => {
    const opts = { seed: 42, now: () => new Date('2026-07-06T12:00:00Z') };
    const a = await new GardynMockSource(opts).fetchSnapshot('gardyn-1');
    const b = await new GardynMockSource(opts).fetchSnapshot('gardyn-1');
    expect(a).toEqual(b);
  });

  it('reports light off at night (02:00) and on during the day (12:00)', async () => {
    const night = await new GardynMockSource({ now: () => new Date('2026-07-06T02:00:00Z') }).fetchSnapshot('gardyn-1');
    const day = await new GardynMockSource({ now: () => new Date('2026-07-06T12:00:00Z') }).fetchSnapshot('gardyn-1');
    expect(night.light).toBe('off');
    expect(day.light).toBe('on');
  });
});
