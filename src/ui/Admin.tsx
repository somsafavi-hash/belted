import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '../data/api';
import { ago } from './common';

const KEY = 'belted:admin-key';

interface Item {
  leagueId: string;
  leagueName: string;
  receiptId: string;
  reportId: string;
  reasons: string[];
  firstReportedAt: number;
  memberId: string;
  memberName: string;
  what: string;
  note?: string;
  flagged: boolean;
  mediaType?: 'photo' | 'video';
  mediaUrl?: string;
  postedAt: number;
}

/** Belted's own queue: every open report in every league. Opened at #admin with the admin key. */
export function AdminScreen() {
  const [key, setKey] = useState(() => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } });
  const [draft, setDraft] = useState('');
  const [items, setItems] = useState<Item[]>();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState<string>();

  const load = useCallback(async (k: string) => {
    setErr(undefined);
    try {
      const res = await fetch(`${API_URL}/admin/reports`, { headers: { 'x-admin-key': k } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Couldn’t load reports.');
      setItems(data.items);
      try { localStorage.setItem(KEY, k); } catch { /* ignore */ }
    } catch (e) {
      setItems(undefined);
      setErr(e instanceof Error ? e.message : 'Couldn’t load reports.');
    }
  }, []);

  useEffect(() => { if (key) void load(key); }, [key, load]);

  async function moderate(it: Item, body: Record<string, string>) {
    setBusy(it.receiptId);
    try {
      const res = await fetch(`${API_URL}/admin/leagues/${it.leagueId}/moderate`, {
        method: 'POST',
        headers: { 'x-admin-key': key, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'That didn’t work.');
      await load(key);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That didn’t work.');
    }
    setBusy(undefined);
  }

  const now = Date.now();
  return (
    <div className="app">
      <header className="top">
        <div className="brand">Belted<i>.</i> <span className="muted small">moderation</span></div>
        {key && <button className="link small" onClick={() => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } setKey(''); setItems(undefined); }}>Sign out</button>}
      </header>
      <main className="screen">
        {!key ? (
          <form className="card sec" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) setKey(draft.trim()); }}>
            <label className="label" htmlFor="ak">Admin key</label>
            <input id="ak" type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button className="btn" type="submit" disabled={!draft.trim()}>Open the queue</button>
            <p className="muted small">Only for the Belted team. Apple expects reports to be handled within 24 hours.</p>
          </form>
        ) : (
          <>
            <div className="sec-head">
              <h2>Open reports</h2>
              <button className="link small" onClick={() => load(key)}>Refresh</button>
            </div>
            {err && <p className="err">{err}</p>}
            {items && items.length === 0 && <div className="card muted">Nothing to review. 🧼</div>}
            {items?.map((it) => {
              const overdue = now - it.firstReportedAt > 20 * 3600_000;
              return (
                <article className="card proof" key={it.leagueId + it.receiptId}>
                  <div className="who">
                    <div className="grow">
                      <b>{it.memberName}</b> <small className="muted">in {it.leagueName}</small>
                      <div className="value mono">{it.what}</div>
                      <small className="muted">posted {ago(now - it.postedAt)}</small>
                    </div>
                    <span className={`chip ${overdue ? 'red' : 'gold'}`}>{overdue ? 'Due soon' : `reported ${ago(now - it.firstReportedAt)}`}</span>
                  </div>
                  {it.note && <p className="note">“{it.note}”</p>}
                  {it.mediaUrl ? (it.mediaType === 'video'
                    ? <video className="media" src={it.mediaUrl} controls playsInline preload="metadata" />
                    : <img className="media" src={it.mediaUrl} alt="Reported proof" />) : <div className="thumb"><span className="muted">No proof</span></div>}
                  <div className="reasons">{it.reasons.map((r, i) => <span className="chip red" key={i}>{r}</span>)}{it.flagged && <span className="chip">Hidden from league</span>}</div>
                  <div className="row3">
                    <button className="btn sm ghost" disabled={busy === it.receiptId} onClick={() => moderate(it, { type: 'dismiss', reportId: it.reportId })}>Keep</button>
                    <button className="btn sm danger" disabled={busy === it.receiptId} onClick={() => moderate(it, { type: 'remove', receiptId: it.receiptId })}>Remove</button>
                    <button className="btn sm danger" disabled={busy === it.receiptId} onClick={() => moderate(it, { type: 'kick', memberId: it.memberId })}>Remove poster</button>
                  </div>
                </article>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
