import { useState } from 'react';
import { useLeague } from '../data/game';
import { Camera } from './Camera';
import { Sheet } from './common';

const PROOF_TEXT: Record<string, string> = {
  video: 'Live video, one take. Show the weight or the result in frame.',
  photo: 'Live photo, right now. Show the number: the bottle, the page, the watch, the screen.',
};

export function Log({ done }: { done: () => void }) {
  const { league, run, toast, saveProof, mode } = useLeague();
  const [busy, setBusy] = useState(false);
  const cats = league.categories.filter((c) => c.loggable);
  const [catId, setCatId] = useState(cats[0].id);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'details' | 'camera'>('details');
  const [creating, setCreating] = useState(false);
  const cat = cats.find((c) => c.id === catId)!;
  const num = Number(value);

  async function captured(blob: Blob, type: 'photo' | 'video') {
    if (busy) return;
    setBusy(true);
    toast(type === 'video' ? 'Uploading your video…' : 'Uploading your proof…');
    const saved = await saveProof(blob);
    if (!saved.mediaId) { setBusy(false); toast(saved.error ?? 'Upload failed.'); return; }
    const { error: err } = await run({ type: 'receipt.create', categoryId: cat.id, value: num, note: note.trim() || undefined, mediaId: saved.mediaId, mediaType: type });
    setBusy(false);
    if (err) { toast(err); return; }
    toast('🧾 Receipt posted. Your league has 24h to vote legit or cap.');
    done();
  }

  if (step === 'camera') {
    return (
      <section className="sec">
        <div className="sec-head">
          <h2>{cat.icon} {value} {cat.unit}</h2>
          <button className="link" onClick={() => setStep('details')}>Back</button>
        </div>
        <div className="card rule"><span>🧾</span><span>{PROOF_TEXT[cat.proof] ?? PROOF_TEXT.photo}</span></div>
        <Camera mode={cat.proof === 'video' ? 'video' : 'photo'} stamp={`${value} ${cat.unit.toUpperCase()}`} onCapture={captured} allowSample={mode === 'demo' || import.meta.env.DEV} />
      </section>
    );
  }

  return (
    <>
      <section className="sec">
        <h2>Log a receipt</h2>
        <div className="cats">
          {cats.map((c) => (
            <button key={c.id} className={`cat ${c.id === catId ? 'sel' : ''}`} onClick={() => setCatId(c.id)} aria-pressed={c.id === catId}>
              <span>{c.icon}</span>{c.name}
            </button>
          ))}
          <button className="cat add" onClick={() => setCreating(true)}><span>＋</span>New</button>
        </div>
      </section>

      <section className="card sec">
        <label className="label" htmlFor="val">How much? ({cat.unit})</label>
        <div className="input-unit">
          <input id="val" inputMode="decimal" type="number" min="0" step="any" placeholder={String(cat.typical[1])} value={value} onChange={(e) => setValue(e.target.value)} />
          <span className="muted">{cat.unit}</span>
        </div>
        <label className="label" htmlFor="note">Caption (optional)</label>
        <input id="note" maxLength={80} placeholder={cat.id === 'gym-pr' ? 'Bench. Finally.' : 'Say something'} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="rule small"><span>🧾</span><span><b>Proof:</b> {cat.proof === 'video' ? 'live video' : 'live photo'}. No camera roll. Your league votes legit or cap.</span></div>
        <button className="btn" disabled={!(num > 0)} onClick={() => setStep('camera')}>Next: take the proof</button>
      </section>

      {creating && <NewCategory onClose={() => setCreating(false)} onMade={(id) => { setCatId(id); setCreating(false); }} />}
    </>
  );
}

function NewCategory({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const { run, toast } = useLeague();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🧊');
  const [unit, setUnit] = useState('min');
  const [proof, setProof] = useState<'photo' | 'video'>('video');
  async function save() {
    const { error: err, result } = await run({ type: 'category.add', name, icon, unit, proof });
    if (err) toast(err);
    else { toast(`${icon} ${name} added. It has its own belt now.`); onMade(result?.categoryId ?? ''); }
  }
  return (
    <Sheet title="New category" onClose={onClose}>
      <label className="label" htmlFor="cn">Name</label>
      <input id="cn" placeholder="Cold plunge" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
      <div className="row2">
        <div>
          <label className="label" htmlFor="ci">Emoji</label>
          <input id="ci" value={icon} maxLength={4} onChange={(e) => setIcon(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="cu">Unit</label>
          <input id="cu" value={unit} maxLength={10} onChange={(e) => setUnit(e.target.value)} />
        </div>
      </div>
      <div className="label">Proof</div>
      <div className="opts">
        <button className={`opt ${proof === 'video' ? 'sel' : ''}`} onClick={() => setProof('video')}>Live video</button>
        <button className={`opt ${proof === 'photo' ? 'sel' : ''}`} onClick={() => setProof('photo')}>Live photo</button>
      </div>
      <p className="muted small">No alcohol, drugs, weapons or anything dangerous. Keep it something you’d show your mom.</p>
      <button className="btn" disabled={!name.trim()} onClick={save}>Add category</button>
    </Sheet>
  );
}
