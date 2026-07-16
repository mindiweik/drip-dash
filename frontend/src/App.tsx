import { useEffect, useState, useCallback } from 'react';
import { fetchStatus, fetchChores, fetchPlants, completeChore, uncompleteChore } from './api';
import type { GardenStatus, Chore, Plant } from './api';
import GardenPage from './components/GardenPage';
import BreakBoard from './components/BreakBoard';
import PlantModal from './components/PlantModal';
import AddPlantModal from './components/AddPlantModal';

const REFRESH_MS = 60_000;
type Tab = 'gardyn' | 'todo';

function App() {
  const [gardens, setGardens] = useState<GardenStatus[]>([]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [doneToday, setDoneToday] = useState<Chore[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [tab, setTab] = useState<Tab>('gardyn');
  const [gardenIndex, setGardenIndex] = useState(0);
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [addTarget, setAddTarget] = useState<{ col: number; position: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [g, c, p] = await Promise.all([fetchStatus(), fetchChores(), fetchPlants()]);
      setGardens(g);
      setChores(c.chores);
      setDoneToday(c.doneToday);
      setPlants(p);
      setSelectedPlant((cur) => (cur ? p.find((x) => x.id === cur.id) ?? null : null));
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
      console.error('complete failed:', err);
      setDegraded(true);
    } finally {
      await load();
    }
  };

  const onUndo = async (id: number) => {
    try {
      await uncompleteChore(id);
    } catch (err) {
      console.error('undo failed:', err);
      setDegraded(true);
    } finally {
      await load();
    }
  };

  const garden = gardens[gardenIndex] ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col p-6 pb-24">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">Drip Dash</h1>
        {degraded && (
          <p className="text-sm text-amber-500">Backend unreachable, retrying every minute</p>
        )}
      </div>

      <div className="mt-6 flex-1">
        {tab === 'gardyn' && garden && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setGardenIndex((i) => (i - 1 + gardens.length) % gardens.length)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-lg hover:bg-slate-700"
                aria-label="Previous garden"
              >
                &lt;
              </button>
              <span className="text-sm text-slate-500">
                {gardenIndex + 1} of {gardens.length}
              </span>
              <button
                onClick={() => setGardenIndex((i) => (i + 1) % gardens.length)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-lg hover:bg-slate-700"
                aria-label="Next garden"
              >
                &gt;
              </button>
            </div>
            <GardenPage
              garden={garden}
              plants={plants}
              dueChores={chores}
              onPlantClick={setSelectedPlant}
              onEmptySlotClick={(col, position) => setAddTarget({ col, position })}
            />
          </div>
        )}
        {tab === 'todo' && (
          <BreakBoard
            gardens={gardens}
            chores={chores}
            doneToday={doneToday}
            onComplete={onComplete}
            onUndo={onUndo}
          />
        )}
      </div>

      {selectedPlant && (
        <PlantModal
          plant={selectedPlant}
          onClose={() => setSelectedPlant(null)}
          onChanged={() => void load()}
        />
      )}

      {addTarget && garden && (
        <AddPlantModal
          gardenId={garden.gardynId}
          gardenName={garden.name}
          col={addTarget.col}
          position={addTarget.position}
          onClose={() => setAddTarget(null)}
          onAdded={() => void load()}
        />
      )}

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-900/95">
        <div className="mx-auto flex max-w-4xl">
          {(['gardyn', 'todo'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-4 text-center text-sm font-medium uppercase tracking-wide ${
                tab === t ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t === 'gardyn' ? 'Gardyn' : 'To do'}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

export default App;
