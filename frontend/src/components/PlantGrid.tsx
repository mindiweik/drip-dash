import type { PlantRow } from '../api';

export default function PlantGrid({ plants }: { plants: PlantRow[] }) {
  if (plants.length === 0) {
    return <p className="text-slate-500">No plants added yet.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {plants.map((p) => (
        <div key={p.id} className="rounded-xl bg-slate-800 p-4">
          <div className="font-medium">{p.name}</div>
          {p.variety && <div className="text-sm text-slate-400">{p.variety}</div>}
        </div>
      ))}
    </div>
  );
}
