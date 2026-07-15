import type { GardynDataSource } from './GardynDataSource.js';
import type { GardynSnapshot, LightState } from '@shared/types';

interface MockOpts {
  seed?: number;
  now?: () => Date;
}

// Deterministic pseudo-random in [0,1) from an integer seed.
function rand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export class GardynMockSource implements GardynDataSource {
  private seed: number;
  private now: () => Date;

  constructor(opts: MockOpts = {}) {
    this.seed = opts.seed ?? 7;
    this.now = opts.now ?? (() => new Date());
  }

  async fetchSnapshot(gardynId: string): Promise<GardynSnapshot> {
    const at = this.now();
    const hour = at.getUTCHours();
    // Lights on 06:00-22:00 UTC, off overnight.
    const light: LightState = hour >= 6 && hour < 22 ? 'on' : 'off';
    // Seed jitter by gardynId so the two units differ.
    const idSalt = gardynId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const r = (n: number) => rand(this.seed + idSalt + n);
    // Water slowly drains across the day (100 at midnight down toward ~40).
    const waterLevelPct = Math.round(100 - (hour / 24) * 55 - r(1) * 5);
    const temperatureC = Math.round((21 + r(2) * 4) * 10) / 10;
    const humidityPct = Math.round(55 + r(3) * 15);
    return {
      gardynId,
      takenAt: at.toISOString(),
      waterLevelPct: Math.max(0, Math.min(100, waterLevelPct)),
      temperatureC,
      humidityPct,
      light,
    };
  }
}
