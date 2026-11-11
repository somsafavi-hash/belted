import { useState } from 'react';
import { useLeague } from '../data/game';
import { categoryOf, nameOf } from '../engine/feed';
import { fmtValue } from '../engine/receipts';
import type { Report } from '../engine/types';
import { Avatar, Media, ago } from './common';

/** Open reports grouped by receipt, oldest first. */
export function reportGroups(reports: Report[]) {
  const map = new Map<string, Report[]>();
  for (const r of reports) if ((r.status ?? 'open') === 'open') map.set(r.receiptId, [...(map.get(r.receiptId) ?? []), r]);
  return [...map.values()].sort((a, b) => a[0].at - b[0].at);
}

/** The league owner's review queue and member list. Full screen, opened from the Me tab. */
export function ModScreen({ onClose }: { onClose: () => void }) {
  const { league, now, run, toast, me } = useLeague();
  const [confirmKick, setConfirmKick] = useState<string>();
  const groups = reportGroups(league.reports);
  const members = league.members.filter((m) => !m.left && m.id !== me);

  async function act(a: Parameters<typeof run>[0], ok: string) {
    const { error } = await run(a);
    toast(error ?? ok);
  }

  return (
    <div className="full mod">
      <div className="sec-head">
        <h2>Moderation</h2>
        <button className="link" onClick={onClose}>Done</button>
      </div>
      <p className="muted small">You started {league.name}, so you review its reports. Reporters stay anonymous. Belted also sees every report and can step in.</p>

      <section className="sec">
        <div className="sec-head"><h2>Reports</h2><small className="muted">{groups.length ? `${groups.length} to review` : 'All clear'}</small></div>
        {groups.length === 0 && <div className="card muted small">No open reports. 🧼</div>}
        {groups.map((reps) => {
          const r = league.receipts.find((x) => x.id === reps[0].receiptId);
          if (!r) return null;
          const cat = categoryOf(league, r.categoryId);
          return (
            <article className="card proof" key={r.id}>
              <div className="who">
                <Avatar league={league} id={r.memberId} />
                <div className="grow">
                  <b>{nameOf(league, r.memberId)}</b>
                  <small className="muted"> {cat?.icon} {cat?.name} · posted {ago(now - r.createdAt)}</small>
                  <div className="value mono">{fmtValue(r.value, cat?.unit)}</div>
                </div>
                {r.flagged && <span className="chip red">Hidden</span>}
              </div>
              {r.note && <p className="note">“{r.note}”</p>}
              {r.mediaId && r.mediaType ? <Media id={r.mediaId} type={r.mediaType} /> : <div className="thumb"><span className="muted">No proof attached</span></div>}
              <div className="reasons">
                {reps.map((x) => <span key={x.id} className="chip red">{x.reason}</span>)}
                <small className="muted">first reported {ago(now - reps[0].at)}</small>
              </div>
              <div className="row2">
                <button className="btn ghost" onClick={() => act({ type: 'mod.dismiss', reportId: reps[0].id }, 'Kept. The receipt is back for everyone.')}>Keep it</button>
                <button className="btn danger" onClick={() => act({ type: 'mod.remove', receiptId: r.id }, 'Removed. Proof deleted and points taken back.')}>Remove</button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="sec">
        <div className="sec-head"><h2>Members</h2><small className="muted">Remove someone who won’t play fair</small></div>
        <div className="card list">
          {members.length === 0 && <div className="muted small duel-line">Nobody else yet.</div>}
          {members.map((m) => (
            <div className="duel-line" key={m.id}>
              <Avatar league={league} id={m.id} />
              <span className="grow">{m.name}</span>
              {confirmKick === m.id ? (
                <span className="act-inline">
                  <button className="btn sm ghost" onClick={() => setConfirmKick(undefined)}>Cancel</button>
                  <button className="btn sm danger" onClick={async () => { setConfirmKick(undefined); await act({ type: 'mod.kick', memberId: m.id }, `${m.name} was removed. Their receipts and proof are deleted.`); }}>Remove {m.name}</button>
                </span>
              ) : (
                <button className="btn sm danger" onClick={() => setConfirmKick(m.id)}>Remove</button>
              )}
            </div>
          ))}
        </div>
        <p className="muted small">Removing someone signs them out, deletes their receipts and proof, and frees any belts they held. It can’t be undone.</p>
      </section>
    </div>
  );
}
