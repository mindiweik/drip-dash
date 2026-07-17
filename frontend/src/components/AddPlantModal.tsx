import { useState } from 'react';
import { createPlant, createCatalogEntry } from '../api';
import type { CatalogEntry } from '../api';

function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AddPlantModal({
  gardenId,
  gardenName,
  col,
  position,
  catalog,
  onClose,
  onAdded,
  onCatalogChanged,
}: {
  gardenId: string;
  gardenName: string;
  col: number;
  position: number;
  catalog: CatalogEntry[];
  onClose: () => void;
  onAdded: () => void;
  onCatalogChanged: () => void;
}) {
  const [mode, setMode] = useState<'pick' | 'new'>(catalog.length > 0 ? 'pick' : 'new');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [plantedAt, setPlantedAt] = useState(todayLocalDate());
  const [notes, setNotes] = useState('');
  // new-variety fields
  const [name, setName] = useState('');
  const [variety, setVariety] = useState('');
  const [tempPref, setTempPref] = useState('');
  const [timeToMaturity, setTimeToMaturity] = useState('');
  const [careInstructions, setCareInstructions] = useState('');
  const [about, setAbout] = useState('');
  const [uses, setUses] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selected = catalog.find((c) => c.id === selectedId) ?? null;
  const filtered = catalog.filter((c) =>
    `${c.name} ${c.variety ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const placeAt = async (catalogId: number) => {
    await createPlant({
      gardynId: gardenId,
      col,
      position,
      catalogId,
      plantedAt: plantedAt || null,
      notes: notes || null,
    });
    onAdded();
    onClose();
  };

  const submitPick = async () => {
    if (selectedId === null) {
      setError('Pick a variety first');
      return;
    }
    try {
      setError(null);
      await placeAt(selectedId);
    } catch (err) {
      console.error('add plant failed:', err);
      setError('That did not save, try again');
    }
  };

  const submitNew = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    try {
      setError(null);
      const entry = await createCatalogEntry({
        name: name.trim(),
        variety: variety || null,
        tempPref: tempPref || null,
        timeToMaturity: timeToMaturity || null,
        careInstructions: careInstructions || null,
        about: about || null,
        uses: uses || null,
        details: details || null,
      });
      onCatalogChanged();
      await placeAt(entry.id);
    } catch (err) {
      console.error('add variety failed:', err);
      setError('That did not save. That variety may already exist, try picking it.');
    }
  };

  const textInput = 'mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 text-slate-100';

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-2xl font-bold">Add a plant</h2>
          <button onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-1 hover:bg-slate-700">
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          {gardenName}, column {col}, position {position}
        </p>
        {error && <p className="mt-2 text-sm text-amber-500">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => { setMode('pick'); setError(null); }}
            className={`rounded-lg px-3 py-1 text-sm ${mode === 'pick' ? 'bg-emerald-700' : 'bg-slate-800 hover:bg-slate-700'}`}
            disabled={catalog.length === 0}
          >
            Pick a variety
          </button>
          <button
            onClick={() => { setMode('new'); setError(null); }}
            className={`rounded-lg px-3 py-1 text-sm ${mode === 'new' ? 'bg-emerald-700' : 'bg-slate-800 hover:bg-slate-700'}`}
          >
            + Add new variety
          </button>
        </div>

        {mode === 'pick' ? (
          <div className="mt-4 space-y-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search varieties..."
              className={textInput}
              autoFocus
            />
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {filtered.length === 0 && <p className="text-sm text-slate-500">No matches.</p>}
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                    selectedId === c.id ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  {c.name}{c.variety ? `, ${c.variety}` : ''}
                </button>
              ))}
            </div>
            {selected && (
              <div className="rounded-xl bg-slate-800/60 p-3 text-xs text-slate-400">
                {selected.tempPref && <p>Temp: {selected.tempPref}</p>}
                {selected.timeToMaturity && <p>Maturity: {selected.timeToMaturity}</p>}
                {selected.careInstructions && <p>Care: {selected.careInstructions}</p>}
                {selected.uses && <p>Uses: {selected.uses}</p>}
              </div>
            )}
            <label className="block text-sm text-slate-400">
              Planted on
              <input type="date" value={plantedAt} onChange={(e) => setPlantedAt(e.target.value)} className={textInput} />
            </label>
            <label className="block text-sm text-slate-400">
              Notes for this plant
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={textInput} />
            </label>
            <button onClick={submitPick} className="rounded-lg bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600">
              Add plant
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <label className="block text-sm text-slate-400">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} className={textInput} autoFocus />
            </label>
            <label className="block text-sm text-slate-400">
              Variety
              <input value={variety} onChange={(e) => setVariety(e.target.value)} className={textInput} />
            </label>
            <label className="block text-sm text-slate-400">
              Temp preference
              <input value={tempPref} onChange={(e) => setTempPref(e.target.value)} placeholder="e.g. 65-75F" className={textInput} />
            </label>
            <label className="block text-sm text-slate-400">
              Time to maturity
              <input value={timeToMaturity} onChange={(e) => setTimeToMaturity(e.target.value)} placeholder="e.g. ~60 days" className={textInput} />
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
              Details (light, germination, difficulty, anything else)
              <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} className={textInput} />
            </label>
            <label className="block text-sm text-slate-400">
              Planted on
              <input type="date" value={plantedAt} onChange={(e) => setPlantedAt(e.target.value)} className={textInput} />
            </label>
            <label className="block text-sm text-slate-400">
              Notes for this plant
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={textInput} />
            </label>
            <button onClick={submitNew} className="rounded-lg bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600">
              Add variety and plant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
