export type LightState = 'on' | 'off';

// Normalized reading from one Gardyn at one moment.
// Every data source (mock now, local later) returns exactly this shape.
export interface GardynSnapshot {
  gardynId: string;
  takenAt: string; // ISO timestamp
  waterLevelPct: number; // 0-100
  temperatureC: number;
  humidityPct: number; // 0-100
  light: LightState;
}
