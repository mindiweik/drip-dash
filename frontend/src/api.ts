export type LightState = 'on' | 'off';
export type TaskKind = 'pollinate' | 'roots' | 'trim' | 'harvest' | 'other';

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
  name: string;
  snapshot: GardynSnapshot | null;
  ageMinutes: number | null;
  stale: boolean;
}

export interface Chore {
  id: number;
  gardynId: string | null;
  title: string;
  source: 'schedule' | 'data-trigger' | 'plant';
  createdAt: string;
  completedAt: string | null;
  scheduleId?: number | null;
  plantId: number | null;
  plantName: string | null;
  kind: TaskKind | null;
  dueAt: string | null;
}

export interface Plant {
  id: number;
  gardynId: string;
  col: number;
  position: number;
  name: string;
  variety: string | null;
  plantedAt: string | null;
  notes: string | null;
  careInstructions: string | null;
  about: string | null;
  uses: string | null;
}

export interface PlantTask {
  id: number;
  plantId: number;
  title: string;
  kind: TaskKind;
  dueAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

async function checkOk(res: Response): Promise<Response> {
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await checkOk(await fetch(url));
  return res.json() as Promise<T>;
}

async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await checkOk(
    await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return res.json() as Promise<T>;
}

export async function fetchStatus(): Promise<GardenStatus[]> {
  const body = await getJson<{ gardens: GardenStatus[] }>('/api/status');
  return body.gardens;
}

export async function fetchChores(): Promise<{ chores: Chore[]; doneToday: Chore[] }> {
  return getJson<{ chores: Chore[]; doneToday: Chore[] }>('/api/chores');
}

export async function completeChore(id: number): Promise<void> {
  await sendJson(`/api/chores/${id}/complete`, 'POST');
}

export async function uncompleteChore(id: number): Promise<void> {
  await sendJson(`/api/chores/${id}/uncomplete`, 'POST');
}

export async function fetchPlants(): Promise<Plant[]> {
  const body = await getJson<{ plants: Plant[] }>('/api/plants');
  return body.plants;
}

export async function updatePlant(
  id: number,
  patch: Partial<
    Pick<Plant, 'name' | 'variety' | 'plantedAt' | 'notes' | 'careInstructions' | 'about' | 'uses'>
  >,
): Promise<void> {
  await sendJson(`/api/plants/${id}`, 'PUT', patch);
}

export async function fetchPlantTasks(plantId: number): Promise<PlantTask[]> {
  const body = await getJson<{ tasks: PlantTask[] }>(`/api/plants/${plantId}/tasks`);
  return body.tasks;
}

export async function createPlantTask(
  plantId: number,
  input: { title: string; kind: TaskKind; dueAt?: string | null },
): Promise<PlantTask> {
  const body = await sendJson<{ task: PlantTask }>(`/api/plants/${plantId}/tasks`, 'POST', input);
  return body.task;
}

export async function updatePlantTask(
  id: number,
  patch: { title?: string; kind?: TaskKind; dueAt?: string | null },
): Promise<void> {
  await sendJson(`/api/tasks/${id}`, 'PATCH', patch);
}

export async function deletePlantTask(id: number): Promise<void> {
  await sendJson(`/api/tasks/${id}`, 'DELETE');
}
