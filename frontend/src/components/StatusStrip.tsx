import type { GardenStatus } from '../api';

export default function StatusStrip({ gardens }: { gardens: GardenStatus[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {gardens.map((g) => {
        const s = g.snapshot;
        const warn = g.stale || !s;
        return (
          <div
            key={g.gardynId}
            className={`rounded-2xl p-6 ${warn ? 'bg-red-950' : 'bg-slate-800'}`}
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-semibold capitalize">{g.gardynId.replace('-', ' ')}</h2>
              <span className="text-sm text-slate-400">
                {g.ageMinutes == null ? 'no data' : `updated ${g.ageMinutes} min ago`}
              </span>
            </div>
            {s ? (
              <div className="mt-4 flex items-end gap-6">
                <div>
                  <div className="text-5xl font-bold">{s.waterLevelPct}%</div>
                  <div className="text-slate-400">water</div>
                </div>
                <div className="text-lg text-slate-300">
                  <div>{s.temperatureC}&deg;C</div>
                  <div>{s.humidityPct}% humidity</div>
                  <div>light {s.light}</div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-slate-300">Reconnect needed</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
