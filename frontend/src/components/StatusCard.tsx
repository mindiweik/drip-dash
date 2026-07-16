import type { GardenStatus } from '../api';

// Snapshots store Celsius (sensor-native); the kiosk displays Fahrenheit.
function toFahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

export default function StatusCard({ garden }: { garden: GardenStatus }) {
  const s = garden.snapshot;
  const warn = garden.stale || !s;
  return (
    <div className={`rounded-2xl p-6 ${warn ? 'bg-red-950' : 'bg-slate-800'}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">{garden.name}</h2>
        <span className="text-sm text-slate-400">
          {garden.ageMinutes == null ? 'no data' : `updated ${garden.ageMinutes} min ago`}
        </span>
      </div>
      {s ? (
        <div className="mt-4 flex items-end gap-6">
          <div>
            <div className="text-5xl font-bold">{s.waterLevelPct}%</div>
            <div className="text-slate-400">water</div>
          </div>
          <div className="text-lg text-slate-300">
            <div>{toFahrenheit(s.temperatureC)}&deg;F</div>
            <div>{s.humidityPct}% humidity</div>
            <div>light {s.light}</div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-slate-300">Reconnect needed</p>
      )}
    </div>
  );
}
