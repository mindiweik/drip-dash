import { useEffect, useState, useCallback } from 'react';
import {
  updatePlant,
  fetchPlantTasks,
  createPlantTask,
  updatePlantTask,
  deletePlantTask,
  completeChore,
} from '../api';
import type { Plant, PlantTask, TaskKind } from '../api';
import { KIND_STYLES } from './GardenPage';

const KINDS: TaskKind[] = ['pollinate', 'roots', 'trim', 'harvest', 'other'];

export default function PlantModal({
  plant,
  onClose,
  onChanged,
}: {
  plant: Plant;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tasks, setTasks] = useState<PlantTask[]>([]);
  const [name, setName] = useState(plant.name);
  const [variety, setVariety] = useState(plant.variety ?? '');
  const [plantedAt, setPlantedAt] = useState(plant.plantedAt ?? '');
  const [notes, setNotes] = useState(plant.notes ?? '');
  const [careInstructions, setCareInstructions] = useState(plant.careInstructions ?? '');
  const [about, setAbout] = useState(plant.about ?? '');
  const [uses, setUses] = useState(plant.uses ?? '');
  const [newTitle, setNewTitle] = useState('');
  const [newKind, setNewKind] = useState<TaskKind>('other');
  const [newDue, setNewDue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await fetchPlantTasks(plant.id));
    } catch (err) {
      console.error('load tasks failed:', err);
      setError('Could not load tasks');
    }
  }, [plant.id]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      setError(null);
      await action();
      await loadTasks();
      onChanged();
    } catch (err) {
      console.error('plant action failed:', err);
      setError('That did not save, try again');
    }
  };

  const saveDetails = () =>
    run(() =>
      updatePlant(plant.id, {
        name,
        variety: variety || null,
        plantedAt: plantedAt || null,
        notes: notes || null,
        careInstructions: careInstructions || null,
        about: about || null,
        uses: uses || null,
      }),
    );

  const addTask = () => {
    if (!newTitle.trim()) return;
    return run(async () => {
      await createPlantTask(plant.id, {
        title: newTitle.trim(),
        kind: newKind,
        dueAt: newDue ? new Date(newDue).toISOString() : null,
      });
      setNewTitle('');
      setNewDue('');
      setNewKind('other');
    });
  };

  const textInput = 'mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 text-slate-100';

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-2xl font-bold">{plant.name}</h2>
          <button onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-1 hover:bg-slate-700">
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Column {plant.col}, position {plant.position}
        </p>
        {error && <p className="mt-2 text-sm text-amber-500">{error}</p>}

        <div className="mt-4 space-y-2">
          <label className="block text-sm text-slate-400">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            Variety
            <input value={variety} onChange={(e) => setVariety(e.target.value)} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            Planted on
            <input type="date" value={plantedAt} onChange={(e) => setPlantedAt(e.target.value)} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            Care instructions
            <textarea value={careInstructions} onChange={(e) => setCareInstructions(e.target.value)} rows={2} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            About
            <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={2} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            Uses
            <textarea value={uses} onChange={(e) => setUses(e.target.value)} rows={2} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={textInput} />
          </label>
          <button onClick={saveDetails} className="rounded-lg bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600">
            Save details
          </button>
        </div>

        <h3 className="mt-6 text-lg font-semibold">Tasks</h3>
        <ul className="mt-2 space-y-2">
          {tasks.length === 0 && <li className="text-sm text-slate-500">No open tasks.</li>}
          {tasks.map((t) => (
            <li key={t.id} className="rounded-xl bg-slate-800 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${KIND_STYLES[t.kind]}`}>{t.kind}</span>
                <span className="flex-1 text-sm">{t.title}</span>
                <button onClick={() => run(() => completeChore(t.id))} className="rounded-lg bg-emerald-700 px-2 py-1 text-xs hover:bg-emerald-600">
                  Done
                </button>
                <button onClick={() => run(() => deletePlantTask(t.id))} className="rounded-lg bg-slate-700 px-2 py-1 text-xs hover:bg-red-900">
                  Delete
                </button>
              </div>
              <label className="mt-2 block text-xs text-slate-400">
                Due
                <input
                  type="date"
                  value={t.dueAt ? t.dueAt.slice(0, 10) : ''}
                  onChange={(e) =>
                    run(() =>
                      updatePlantTask(t.id, {
                        dueAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                      }),
                    )
                  }
                  className="mt-1 rounded-lg bg-slate-900 px-2 py-1 text-slate-100"
                />
                <span className="ml-2 text-slate-500">{t.dueAt ? '' : 'due now'}</span>
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl bg-slate-800 p-3">
          <div className="text-sm font-medium">Add a task</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What needs doing?"
              className="min-w-40 flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
            <select value={newKind} onChange={(e) => setNewKind(e.target.value as TaskKind)} className="rounded-lg bg-slate-900 px-2 py-2 text-sm text-slate-100">
              {KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} className="rounded-lg bg-slate-900 px-2 py-2 text-sm text-slate-100" />
            <button onClick={addTask} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium hover:bg-emerald-600">
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
