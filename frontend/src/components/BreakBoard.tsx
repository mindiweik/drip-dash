import type { Chore } from '../api';

export default function BreakBoard({
  chores,
  onComplete,
}: {
  chores: Chore[];
  onComplete: (id: number) => void;
}) {
  if (chores.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-800 p-8 text-center text-xl text-slate-300">
        Garden is happy. Go enjoy your break.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      {chores.map((c) => (
        <button
          key={c.id}
          onClick={() => onComplete(c.id)}
          className="rounded-2xl bg-emerald-700 px-6 py-4 text-lg font-medium hover:bg-emerald-600"
        >
          {c.title}
        </button>
      ))}
    </div>
  );
}
