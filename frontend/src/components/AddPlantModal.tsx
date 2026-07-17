import { useState } from 'react';
import { createPlant } from '../api';

function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AddPlantModal({
  gardenId,
  gardenName,
  col,
  position,
  onClose,
  onAdded,
}: {
  gardenId: string;
  gardenName: string;
  col: number;
  position: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [variety, setVariety] = useState('');
  const [plantedAt, setPlantedAt] = useState(todayLocalDate());
  const [careInstructions, setCareInstructions] = useState('');
  const [about, setAbout] = useState('');
  const [uses, setUses] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    try {
      setError(null);
      await createPlant({
        gardynId: gardenId,
        col,
        position,
        name: name.trim(),
        variety: variety || null,
        plantedAt: plantedAt || null,
        careInstructions: careInstructions || null,
        about: about || null,
        uses: uses || null,
        notes: notes || null,
      });
      onAdded();
      onClose();
    } catch (err) {
      console.error('add plant failed:', err);
      setError('That did not save, try again');
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
          <button onClick={submit} className="rounded-lg bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600">
            Add plant
          </button>
        </div>
      </div>
    </div>
  );
}
