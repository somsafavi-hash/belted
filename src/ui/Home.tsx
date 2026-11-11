import { useState } from 'react';
import { useLeague } from '../data/game';
import { standings } from '../engine/rating';
import { activeDrop, dropTotals } from '../engine/drops';
import { categoryOf, nameOf } from '../engine/feed';
import { fmtValue } from '../engine/receipts';
import { majorStartsAt, currentSeason, monthLabel } from '../engine/season';
import { monthKey } from '../engine/util';
import { Avatar, Empty, TierPill, ago, left } from './common';
import { ReceiptCard } from './ReceiptCard';
import { InviteCard } from './Invite';

export function Home({ go }: { go: (tab: string) => void }) {
  const { league, now, me, mode } = useLeague();
  const [feedTab, setFeedTab] = useState<'receipts' | 'activity'>('receipts');
  const drop = activeDrop(league, now);
  const rows = standings(league, now);
  const season = currentSeason(league, now);
  const majorLive = season?.major && !season.major.done;

  const receipts = league.receipts
    .filter((r) => !league.hiddenReceipts.includes(r.id) && !league.blocked.includes(r.memberId))
    .sort((a, b) => {
      // Ones still waiting on your vote come first.
      const wa = a.status === 'open' && a.memberId !== me && !a.votes[me] ? 1 : 0;
      const wb = b.status === 'open' && b.memberId !== me && !b.votes[me] ? 1 : 0;
      return wb - wa || b.createdAt - a.createdAt;
    })
    .slice(0, 25);
  const waiting = receipts.filter((r) => r.status === 'open' && r.memberId !== me && !r.votes[me]).length;
  const feed = league.feed.slice().sort((a, b) => b.at - a.at).slice(0, 30);

  return (
    <>
      {mode === 'online' && league.members.length < 4 && <InviteCard compact />}
      {drop ? (
        <section className="card drop">
          <div className="eyebrow">Live Drop · ends in {left(drop.endsAt - now)}</div>
          <h3>{drop.title}</h3>
          <div className="muted small">Most {categoryOf(league, drop.categoryId)?.unit} logged wins. Proof required, caps don’t count.</div>
          {dropTotals(league, drop).slice(0, 4).map((t) => (
            <div key={t.memberId} className={`bar-row ${t.memberId === me ? 'me' : ''}`}>
              <span>{nameOf(league, t.memberId)}</span>
              <div className="bar"><span style={{ width: `${Math.max(3, (t.total / Math.max(1, dropTotals(league, drop)[0].total)) * 100)}%` }} /></div>
              <span className="mono">{fmtValue(t.total, categoryOf(league, drop.categoryId)?.unit)}</span>
            </div>
          ))}
          <button className="btn sm" onClick={() => go('log')}>Log {categoryOf(league, drop.categoryId)?.name.toLowerCase()}</button>
        </section>
      ) : (
        <section className="card drop"><div className="eyebrow">No Drop live</div><div className="muted small">The next one starts soon.</div></section>
      )}

      <button className="card major-banner" onClick={() => go('major')}>
        <span className="big-ico">🏆</span>
        <span className="grow">
          <b>{majorLive ? `The ${monthLabel(monthKey(now))} Major is live` : `${monthLabel(monthKey(now))} Major`}</b>
          <small className="muted">{majorLive ? 'Bracket’s set. Go see who’s in.' : `Top 4 by monthly points · starts in ${left(majorStartsAt(now) - now)}`}</small>
        </span>
        <span className="muted">›</span>
      </button>

      <section className="sec">
        <div className="sec-head"><h2>Standings</h2><small className="muted">{league.members.length} {league.members.length === 1 ? 'member' : 'members'}</small></div>
        <div className="card list">
          {rows.map((s, i) => {
            const belts = league.belts.filter((b) => b.holderId === s.memberId).map((b) => categoryOf(league, b.categoryId)?.name);
            return (
              <div className={`row ${s.memberId === me ? 'me' : ''}`} key={s.memberId}>
                <span className="mono muted">{i + 1}</span>
                <Avatar league={league} id={s.memberId} />
                <div className="grow">
                  <b>{nameOf(league, s.memberId)}</b> <TierPill r={s.rating} />
                  {belts.length > 0 && <div className="belt-mini">🥇 {belts.join(', ')}</div>}
                </div>
                <div className="right">
                  <div className="mono">{s.rating.toLocaleString()}</div>
                  <small className={s.move > 0 ? 'up' : s.move < 0 ? 'down' : 'muted'}>{s.move > 0 ? `▲${s.move}` : s.move < 0 ? `▼${-s.move}` : '–'}</small>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="sec">
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={feedTab === 'receipts'} className={feedTab === 'receipts' ? 'on' : ''} onClick={() => setFeedTab('receipts')}>
            Receipts{waiting > 0 && <span className="badge">{waiting}</span>}
          </button>
          <button role="tab" aria-selected={feedTab === 'activity'} className={feedTab === 'activity' ? 'on' : ''} onClick={() => setFeedTab('activity')}>Activity</button>
        </div>
        {feedTab === 'receipts' ? (
          receipts.length ? receipts.map((r) => <ReceiptCard key={r.id} r={r} />) : (
            <Empty icon="🧾" title="No receipts yet">Post the first one and make everyone else look lazy.</Empty>
          )
        ) : (
          <div className="card list">
            {feed.map((f) => (
              <div className="event" key={f.id}>
                <span className="ico">{f.icon}</span>
                <span className="grow">{f.text}</span>
                <small className="muted nowrap">{ago(now - f.at)}</small>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
