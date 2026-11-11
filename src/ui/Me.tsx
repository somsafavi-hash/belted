import { useEffect, useState } from 'react';
import { useLeague } from '../data/game';
import { rating, standings, tier } from '../engine/rating';
import { categoryOf, nameOf } from '../engine/feed';
import { DAY, HOUR } from '../engine/util';
import { TierPill, ago } from './common';
import { recapImage } from './recap';
import { InviteCard } from './Invite';

export function Me() {
  const { league, now, me, skip, reset, toast, run, mode } = useLeague();
  const [confirmReset, setConfirmReset] = useState(false);
  const [recapUrl, setRecapUrl] = useState<string>();
  const [recapBlob, setRecapBlob] = useState<Blob>();
  const r = rating(league, me);
  const pos = standings(league, now).findIndex((s) => s.memberId === me) + 1;
  const history = league.ratings.filter((e) => e.memberId === me && e.reason !== 'seed').sort((a, b) => b.at - a.at).slice(0, 25);
  const myName = league.members.find((m) => m.id === me)?.name;

  useEffect(() => () => { if (recapUrl) URL.revokeObjectURL(recapUrl); }, [recapUrl]);

  async function makeRecap() {
    const b = await recapImage(league, now);
    setRecapBlob(b);
    setRecapUrl(URL.createObjectURL(b));
  }

  async function share() {
    if (!recapBlob) return;
    const file = new File([recapBlob], 'belted-recap.png', { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], text: `${league.name} weekly recap 🥇` }); } catch { /* cancelled */ }
    } else {
      const a = document.createElement('a');
      a.href = recapUrl!;
      a.download = 'belted-recap.png';
      a.click();
      toast('Saved the recap image. Drop it in the group chat.');
    }
  }

  return (
    <>
      <section className="card rankcard">
        <div className="label">{myName} · overall</div>
        <div className="big">{tier(r)}</div>
        <div className="muted mono">{r.toLocaleString()} rating · #{pos} in {league.name}</div>
      </section>

      <section className="sec">
        <h2>By category</h2>
        <div className="card cat-ranks">
          {league.categories.map((c) => {
            const cr = rating(league, me, c.id);
            const belt = league.belts.find((b) => b.categoryId === c.id && b.holderId === me);
            return (
              <div className="cr" key={c.id}>
                <span>{c.icon} {c.name}</span>
                <TierPill r={cr} />
                <span className="mono muted right">{belt ? '🥇 Belt' : cr.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="sec">
        <div className="sec-head"><h2>Weekly recap</h2><small className="muted">For the group chat</small></div>
        {recapUrl ? (
          <div className="card sec">
            <img src={recapUrl} alt="Weekly recap card" className="recap-img" />
            <div className="row2">
              <button className="btn ghost" onClick={makeRecap}>Refresh</button>
              <button className="btn" onClick={share}>Share</button>
            </div>
          </div>
        ) : (
          <button className="btn ghost" onClick={makeRecap}>📲 Make this week’s recap card</button>
        )}
      </section>

      <section className="sec">
        <h2>Why my rating moved</h2>
        <div className="card list">
          {history.length ? history.map((e) => (
            <div className="duel-line" key={e.id}>
              <span className="grow">{e.label}<div className="muted small">{categoryOf(league, e.categoryId)?.name ?? 'Overall'} · {ago(now - e.at)}</div></span>
              <span className={`mono ${e.delta > 0 ? 'up' : 'down'}`}>{e.delta > 0 ? '+' : '−'}{Math.abs(e.delta)}</span>
            </div>
          )) : <div className="muted small">Nothing yet. Post a receipt or win a duel.</div>}
        </div>
      </section>

      {league.blocked.length > 0 && (
        <section className="sec">
          <h2>Blocked</h2>
          <div className="card list">
            {league.blocked.map((id) => (
              <div className="duel-line" key={id}>
                <span className="grow">{nameOf(league, id)}</span>
                <button className="btn sm ghost" onClick={() => void run({ type: 'member.unblock', memberId: id })}>Unblock</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {mode === 'online' && <InviteCard />}

      {mode === 'online' ? (
        <section className="sec">
          <h2>Account</h2>
          <div className="card sec">
            <p className="muted small">You’re signed in on this phone only. To use another phone, open the invite link there and join with a new name.</p>
            {confirmReset ? (
              <>
                <p className="small">This removes you from {league.name} and deletes your receipts and proof. Your name in old results becomes “Deleted player”. It can’t be undone.</p>
                <div className="row2">
                  <button className="btn ghost" onClick={() => setConfirmReset(false)}>Keep it</button>
                  <button className="btn danger" onClick={async () => { const e = await reset(); if (e) toast(e); }}>Leave and delete</button>
                </div>
              </>
            ) : (
              <button className="btn sm danger" onClick={() => setConfirmReset(true)}>Leave the league and delete my data</button>
            )}
          </div>
        </section>
      ) : (
      <section className="sec">
        <div className="sec-head"><h2>Demo controls</h2><small className="muted">Speed up time to see more</small></div>
        <div className="card sec">
          <p className="muted small">This is demo mode: your league’s other 5 members are made up and play on their own. Everything is saved on this phone only.</p>
          <div className="row3">
            <button className="btn sm ghost" onClick={() => { skip(HOUR); toast('Skipped 1 hour'); }}>+1 hour</button>
            <button className="btn sm ghost" onClick={() => { skip(DAY); toast('Skipped 1 day'); }}>+1 day</button>
            <button className="btn sm ghost" onClick={() => { skip(7 * DAY); toast('Skipped 1 week'); }}>+1 week</button>
          </div>
          {confirmReset ? (
            <div className="row2">
              <button className="btn ghost" onClick={() => setConfirmReset(false)}>Keep it</button>
              <button className="btn danger" onClick={() => reset()}>Delete everything</button>
            </div>
          ) : (
            <button className="btn sm danger" onClick={() => setConfirmReset(true)}>Delete my data and start over</button>
          )}
        </div>
      </section>
      )}
    </>
  );
}
