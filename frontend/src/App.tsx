import { useEffect, useState, useCallback } from 'react';
import { fetchStatus, fetchChores, fetchPlants, completeChore } from './api';
import type { GardenStatus, Chore, PlantRow } from './api';
import StatusStrip from './components/StatusStrip';
import BreakBoard from './components/BreakBoard';
import PlantGrid from './components/PlantGrid';

const REFRESH_MS = 60_000;

function App() {
  const [gardens, setGardens] = useState<GardenStatus[]>([]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [degraded, setDegraded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, c, p] = await Promise.all([fetchStatus(), fetchChores(), fetchPlants()]);
      setGardens(g);
      setChores(c);
      setPlants(p);
      setDegraded(false);
    } catch (err) {
      console.error('refresh failed:', err);
      setDegraded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const handle = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(handle);
  }, [load]);

  const onComplete = async (id: number) => {
    try {
      await completeChore(id);
    } catch (err) {
      console.error('refresh failed:', err);
      setDegraded(true);
    } finally {
      await load();
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <h1 className="text-3xl font-bold">Drip Dash</h1>
      {degraded && (
        <p className="text-sm text-amber-500">Backend unreachable, retrying every minute</p>
      )}
      <StatusStrip gardens={gardens} />
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Break board</h2>
        <BreakBoard chores={chores} onComplete={onComplete} />
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Plants</h2>
        <PlantGrid plants={plants} />
      </section>
    </main>
  );
}

export default App;
