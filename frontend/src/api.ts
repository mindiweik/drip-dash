export type LightState = 'on' | 'off';

export interface GardynSnapshot {
  gardynId: string;
  takenAt: string;
  waterLevelPct: number;
  temperatureC: number;
  humidityPct: number;
  light: LightState;
}

export interface GardenStatus {
  gardynId: string;
  snapshot: GardynSnapshot | null;
  ageMinutes: number | null;
  stale: boolean;
}

export interface Chore {
  id: number;
  gardynId: string | null;
  title: string;
  source: 'schedule' | 'data-trigger';
  createdAt: string;
  completedAt: string | null;
  scheduleId?: number | null;
}

export interface PlantRow {
  id: number;
  gardyn_id: string;
  slot: number;
  name: string;
  variety: string | null;
  planted_at: string | null;
  notes: string | null;
}

// Helper to fetch and parse JSON with error handling
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchStatus(): Promise<GardenStatus[]> {
  const body = await getJson<{ gardens: GardenStatus[] }>('/api/status');
  return body.gardens;
}

export async function fetchChores(): Promise<Chore[]> {
  const body = await getJson<{ chores: Chore[] }>('/api/chores');
  return body.chores;
}

export async function fetchPlants(): Promise<PlantRow[]> {
  const body = await getJson<{ plants: PlantRow[] }>('/api/plants');
  return body.plants;
}

export async function completeChore(id: number): Promise<void> {
  const res = await fetch(`/api/chores/${id}/complete`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
}
