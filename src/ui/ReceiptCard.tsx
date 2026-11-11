import { useState } from 'react';
import type { Receipt } from '../engine/types';
import { eligibleVoters, fmtValue, tally } from '../engine/receipts';
import { categoryOf, nameOf } from '../engine/feed';
import { useLeague } from '../data/game';
import { Avatar, Media, Sheet, ago, left } from './common';

export function ReceiptCard({ r }: { r: Receipt }) {
  const { league, now, run, toast, me } = useLeague();
  const [menu, setMenu] = useState(false);
  const cat = categoryOf(league, r.categoryId);
  const mine = r.memberId === me;
  const myVote = r.votes[me];
  const t = tally(r);
  const voters = eligibleVoters(league, r).length;
  const isBot = league.members.find((m) => m.id === r.memberId)?.isBot;

  async function vote(v: 'legit' | 'cap') {
    const { error: err } = await run({ type: 'receipt.vote', receiptId: r.id, verdict: v });
    if (err) toast(err);
    else if (v === 'cap') toast('🧢 Cap called. If the league agrees, they lose the points.');
  }

  async function report(reason: string) {
    const { error } = await run({ type: 'receipt.report', receiptId: r.id, reason });
    setMenu(false);
    if (error) return toast(error);
    toast('Reported and hidden for you. The league owner and Belted review reports within 24 hours.');
  }

  async function block() {
    const { error } = await run({ type: 'member.block', memberId: r.memberId });
    setMenu(false);
    if (error) return toast(error);
    toast(`${nameOf(league, r.memberId)} is blocked. You won’t see their receipts.`);
  }

  return (
    <article className="card proof">
      <div className="who">
        <Avatar league={league} id={r.memberId} />
        <div className="grow">
          <b>{nameOf(league, r.memberId)}</b>
          <small className="muted"> {cat?.icon} {cat?.name} · {ago(now - r.createdAt)}</small>
          <div className="value mono">{fmtValue(r.value, cat?.unit)}</div>
        </div>
        {r.flagged ? <span className="chip red">Under review</span> : <Status r={r} now={now} />}
        {!mine && <button className="dots" onClick={() => setMenu(true)} aria-label="More options">⋯</button>}
      </div>

      {r.note && <p className="note">“{r.note}”</p>}

      {r.mediaId && r.mediaType ? (
        <Media id={r.mediaId} type={r.mediaType} />
      ) : (
        <div className="thumb">
          <div className="thumb-icon">{cat?.icon}</div>
          <span className="tag mono">{fmtValue(r.value, cat?.unit).toUpperCase()}</span>
          {isBot && <span className="demo-tag">DEMO FRIEND · NO PHOTO</span>}
        </div>
      )}

      {r.flagged ? (
        <div className="tally muted small">{mine ? 'People reported this. It’s hidden from the league until the owner reviews it.' : 'Reported. Hidden from the league until reviewed.'}</div>
      ) : mine || r.status !== 'open' ? (
        <div className="tally muted small">
          ✅ {t.legit} legit · 🧢 {t.cap} cap{r.status === 'open' ? ` · ${voters - t.legit - t.cap} still to vote` : ''}
          {mine && r.status === 'legit' && (r.scored ? ' · +10 to you' : ' · already scored today in this category')}
        </div>
      ) : (
        <div className="vote">
          <button className={myVote === 'legit' ? 'on-legit' : ''} onClick={() => vote('legit')} aria-pressed={myVote === 'legit'}>
            ✅ Legit <span className="mono">{t.legit}</span>
          </button>
          <button className={myVote === 'cap' ? 'on-cap' : ''} onClick={() => vote('cap')} aria-pressed={myVote === 'cap'}>
            🧢 Cap <span className="mono">{t.cap}</span>
          </button>
        </div>
      )}

      {menu && (
        <Sheet title="This receipt" onClose={() => setMenu(false)}>
          <button className="btn ghost" onClick={() => report('Fake or misleading')}>Report as fake</button>
          <button className="btn ghost" onClick={() => report('Inappropriate')}>Report as inappropriate</button>
          <button className="btn danger" onClick={block}>Block {nameOf(league, r.memberId)}</button>
        </Sheet>
      )}
    </article>
  );
}

function Status({ r, now }: { r: Receipt; now: number }) {
  if (r.status === 'legit') return <span className="chip green">Legit</span>;
  if (r.status === 'cap') return <span className="chip red">Cap</span>;
  return <span className="chip">{left(r.closesAt - now)}</span>;
}
