import { useEffect, useState, useCallback } from 'react';
import {
  updatePlant,
  fetchPlantTasks,
  createPlantTask,
  updatePlantTask,
  deletePlantTask,
  completeChore,
  removePlant,
  movePlant,
} from '../api';
import type { Plant, PlantTask, TaskKind, GardenStatus, RemoveReason } from '../api';
import { KIND_STYLES } from './GardenPage';
import EditVarietyModal from './EditVarietyModal';

const KINDS: TaskKind[] = ['pollinate', 'roots', 'trim', 'harvest', 'other'];

export default function PlantModal({
  plant,
  onClose,
  onChanged,
  gardens,
  allPlants,
}: {
  plant: Plant;
  onClose: () => void;
  onChanged: () => void;
  gardens: GardenStatus[];
  allPlants: Plant[];
}) {
  const [tasks, setTasks] = useState<PlantTask[]>([]);
  const [plantedAt, setPlantedAt] = useState(plant.plantedAt ?? '');
  const [notes, setNotes] = useState(plant.notes ?? '');
  const [newTitle, setNewTitle] = useState('');
  const [newKind, setNewKind] = useState<TaskKind>('other');
  const [newDue, setNewDue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveGarden, setMoveGarden] = useState(plant.gardynId);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [editingVariety, setEditingVariety] = useState(false);

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
        plantedAt: plantedAt || null,
        notes: notes || null,
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
          <div className="rounded-xl bg-slate-800/60 p-3 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-100">
                {plant.name}{plant.variety ? `, ${plant.variety}` : ''}
              </span>
              <button
                onClick={() => setEditingVariety(true)}
                className="rounded-lg bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
              >
                Edit variety details
              </button>
            </div>
            {plant.tempPref && <p className="mt-1 text-xs text-slate-400">Temp: {plant.tempPref}</p>}
            {plant.timeToMaturity && <p className="text-xs text-slate-400">Maturity: {plant.timeToMaturity}</p>}
            {plant.careInstructions && <p className="mt-1 text-xs text-slate-400">Care: {plant.careInstructions}</p>}
            {plant.about && <p className="text-xs text-slate-400">About: {plant.about}</p>}
            {plant.uses && <p className="text-xs text-slate-400">Uses: {plant.uses}</p>}
            {plant.details && <p className="text-xs text-slate-400">Details: {plant.details}</p>}
          </div>
          <label className="block text-sm text-slate-400">
            Planted on
            <input type="date" value={plantedAt} onChange={(e) => setPlantedAt(e.target.value)} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            Notes for this plant
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

        <div className="mt-6 border-t border-slate-800 pt-4">
          {!moving ? (
            <button onClick={() => setMoving(true)} className="rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700">
              Move plant...
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-300">Move to</span>
                <select
                  value={moveGarden}
                  onChange={(e) => setMoveGarden(e.target.value)}
                  className="rounded-lg bg-slate-800 px-2 py-1 text-sm text-slate-100"
                >
                  {gardens.map((g) => (
                    <option key={g.gardynId} value={g.gardynId}>{g.name}</option>
                  ))}
                </select>
                <button onClick={() => setMoving(false)} className="ml-auto rounded-lg bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700">
                  Cancel
                </button>
              </div>
              <p className="text-xs text-slate-500">Tap a slot. Occupied slots swap the two plants.</p>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((col) => (
                  <div key={col} className="space-y-1">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((position) => {
                      const occupant = allPlants.find(
                        (p) => p.gardynId === moveGarden && p.col === col && p.position === position,
                      );
                      const isCurrent = occupant?.id === plant.id;
                      return (
                        <button
                          key={position}
                          disabled={isCurrent}
                          onClick={() =>
                            run(async () => {
                              await movePlant(plant.id, { gardynId: moveGarden, col, position });
                              setMoving(false);
                            })
                          }
                          className={`w-full rounded-lg px-2 py-1 text-xs ${
                            isCurrent
                              ? 'bg-emerald-900 text-emerald-300'
                              : occupant
                                ? 'bg-amber-900 text-amber-200 hover:bg-amber-800'
                                : 'border border-dashed border-slate-700 text-slate-500 hover:border-slate-500'
                          }`}
                        >
                          {occupant ? occupant.name : position}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-slate-800 pt-4">
          {!confirmingRemove ? (
            <button
              onClick={() => setConfirmingRemove(true)}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-red-400 hover:bg-red-950"
            >
              Remove plant...
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-300">Why is {plant.name} coming out?</p>
              <div className="flex flex-wrap gap-2">
                {(['harvested', 'died', 'other'] as RemoveReason[]).map((reason) => (
                  <button
                    key={reason}
                    onClick={() =>
                      run(async () => {
                        await removePlant(plant.id, reason);
                        onClose();
                      })
                    }
                    className="rounded-lg bg-red-900 px-4 py-2 text-sm font-medium capitalize hover:bg-red-800"
                  >
                    {reason}
                  </button>
                ))}
                <button
                  onClick={() => setConfirmingRemove(false)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-slate-500">
                The plant leaves the grid but its history is kept.
              </p>
            </div>
          )}
        </div>

        {editingVariety && (
          <EditVarietyModal
            plant={plant}
            onClose={() => setEditingVariety(false)}
            onSaved={onChanged}
          />
        )}
      </div>
    </div>
  );
}
