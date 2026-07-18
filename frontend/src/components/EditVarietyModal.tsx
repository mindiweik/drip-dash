import { useState } from 'react';
import { updateCatalogEntry } from '../api';
import type { Plant } from '../api';

export default function EditVarietyModal({
  plant,
  onClose,
  onSaved,
}: {
  plant: Plant;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(plant.name);
  const [variety, setVariety] = useState(plant.variety ?? '');
  const [tempPref, setTempPref] = useState(plant.tempPref ?? '');
  const [timeToMaturity, setTimeToMaturity] = useState(plant.timeToMaturity ?? '');
  const [careInstructions, setCareInstructions] = useState(plant.careInstructions ?? '');
  const [about, setAbout] = useState(plant.about ?? '');
  const [uses, setUses] = useState(plant.uses ?? '');
  const [details, setDetails] = useState(plant.details ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    try {
      setError(null);
      await updateCatalogEntry(plant.catalogId, {
        name: name.trim(),
        variety: variety || null,
        tempPref: tempPref || null,
        timeToMaturity: timeToMaturity || null,
        careInstructions: careInstructions || null,
        about: about || null,
        uses: uses || null,
        details: details || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error('edit variety failed:', err);
      setError('That did not save, try again');
    }
  };

  const textInput = 'mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 text-slate-100';

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-bold">Edit variety details</h2>
          <button onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-1 hover:bg-slate-700">
            Close
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Applies to every plant of this variety.</p>
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
            Temp preference
            <input value={tempPref} onChange={(e) => setTempPref(e.target.value)} className={textInput} />
          </label>
          <label className="block text-sm text-slate-400">
            Time to maturity
            <input value={timeToMaturity} onChange={(e) => setTimeToMaturity(e.target.value)} className={textInput} />
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
            Details
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} className={textInput} />
          </label>
          <button onClick={save} className="rounded-lg bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600">
            Save variety
          </button>
        </div>
      </div>
    </div>
  );
}
