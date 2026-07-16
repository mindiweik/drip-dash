import { useState } from 'react';
import type { Chore, GardenStatus } from '../api';
import { KIND_STYLES } from './GardenPage';

type Filter = 'all' | 'plants' | string; // string = gardynId

function choreLabel(c: Chore): string {
  return c.plantName ? `${c.plantName}: ${c.title}` : c.title;
}

// Garden-level chores get their own colors: cleaning schedules violet, water top-ups cyan.
function choreStyle(c: Chore): string {
  if (c.kind) return KIND_STYLES[c.kind];
  if (c.source === 'data-trigger') return 'bg-cyan-700 hover:bg-cyan-600';
  return 'bg-violet-800 hover:bg-violet-700';
}

function matches(c: Chore, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'plants') return c.plantId != null;
  return c.gardynId === filter;
}

export default function BreakBoard({
  gardens,
  chores,
  doneToday,
  onComplete,
  onUndo,
}: {
  gardens: GardenStatus[];
  chores: Chore[];
  doneToday: Chore[];
  onComplete: (id: number) => void;
  onUndo: (id: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const chips: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'All' },
    ...gardens.map((g) => ({ key: g.gardynId as Filter, label: g.name })),
    { key: 'plants', label: 'Plants' },
  ];
  const visible = chores.filter((c) => matches(c, filter));
  const visibleDone = doneToday.filter((c) => matches(c, filter));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            onClick={() => setFilter(chip.key)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              filter === chip.key
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl bg-slate-800 p-8 text-center text-xl text-slate-300">
          Garden is happy. Go enjoy your break.
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {visible.map((c) => (
            <button
              key={c.id}
              onClick={() => onComplete(c.id)}
              className={`rounded-2xl px-6 py-4 text-lg font-medium ${
                choreStyle(c)
              }`}
            >
              {choreLabel(c)}
            </button>
          ))}
        </div>
      )}

      {visibleDone.length > 0 && (
        <div className="rounded-2xl bg-slate-900 p-4">
          <div className="text-sm text-slate-500">Done today</div>
          <ul className="mt-2 space-y-1">
            {visibleDone.map((c) => (
              <li key={c.id} className="flex items-center gap-3 text-slate-400">
                <span className="line-through">✓ {choreLabel(c)}</span>
                <button
                  onClick={() => onUndo(c.id)}
                  className="rounded-lg bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
