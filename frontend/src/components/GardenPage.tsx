import type { Plant, Chore, TaskKind, GardenStatus } from '../api';
import StatusCard from './StatusCard';

export const KIND_STYLES: Record<TaskKind, string> = {
  pollinate: 'bg-amber-700 hover:bg-amber-600',
  roots: 'bg-sky-800 hover:bg-sky-700',
  trim: 'bg-yellow-600 hover:bg-yellow-500',
  harvest: 'bg-emerald-700 hover:bg-emerald-600',
  other: 'bg-slate-600 hover:bg-slate-500',
};

export const KIND_LABELS: Record<TaskKind, string> = {
  pollinate: 'Pollinate',
  roots: 'Roots',
  trim: 'Trim',
  harvest: 'Harvest',
  other: 'Other',
};

const IDLE_STYLE = 'bg-slate-800 hover:bg-slate-700';
const COLS = 3;
const POSITIONS = 10;

export default function GardenPage({
  garden,
  plants,
  dueChores,
  onPlantClick,
  onEmptySlotClick,
}: {
  garden: GardenStatus;
  plants: Plant[];
  dueChores: Chore[];
  onPlantClick: (plant: Plant) => void;
  onEmptySlotClick: (col: number, position: number) => void;
}) {
  const mine = plants.filter((p) => p.gardynId === garden.gardynId);
  const dueKindByPlant = new Map<number, TaskKind>();
  for (const c of dueChores) {
    if (c.plantId != null && c.kind && !dueKindByPlant.has(c.plantId)) {
      dueKindByPlant.set(c.plantId, c.kind);
    }
  }
  return (
    <div className="space-y-6">
      <StatusCard garden={garden} />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: COLS }, (_, i) => i + 1).map((col) => (
          <div key={col} className="space-y-2">
            <div className="text-center text-xs uppercase tracking-wide text-slate-500">
              Column {col}
            </div>
            {/* Position 1 is the TOP slot of the physical column. */}
            {Array.from({ length: POSITIONS }, (_, i) => i + 1).map((position) => {
              const plant = mine.find((p) => p.col === col && p.position === position);
              if (!plant) {
                return (
                  <button
                    key={position}
                    onClick={() => onEmptySlotClick(col, position)}
                    className="w-full rounded-xl border border-dashed border-slate-800 px-3 py-2 text-center text-xs text-slate-700 hover:border-slate-600 hover:text-slate-500"
                  >
                    {position}
                  </button>
                );
              }
              const kind = dueKindByPlant.get(plant.id);
              return (
                <button
                  key={position}
                  onClick={() => onPlantClick(plant)}
                  className={`w-full rounded-xl px-3 py-2 text-sm font-medium ${kind ? KIND_STYLES[kind] : IDLE_STYLE}`}
                >
                  {plant.name}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
        {(Object.keys(KIND_LABELS) as TaskKind[])
          .filter((k) => k !== 'other')
          .map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`inline-block h-3 w-3 rounded-full ${KIND_STYLES[k].split(' ')[0]}`} />
              {KIND_LABELS[k]}
            </span>
          ))}
      </div>
    </div>
  );
}
