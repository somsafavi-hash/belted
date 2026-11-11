import { useState } from 'react';
import { useLeague } from '../data/game';
import type { Duel } from '../engine/types';
import { DUEL_TEMPLATES, STAKES } from '../engine/duels';
import { categoryOf, nameOf } from '../engine/feed';
import { DAY } from '../engine/util';
import { Avatar, Empty, Sheet, ago, left } from './common';
import { TriviaGame } from './Trivia';

export interface ChallengePrefill { to?: string; template?: string }

export function Duels({ prefill, clearPrefill }: { prefill?: ChallengePrefill; clearPrefill: () => void }) {
  const { league, now, run, toast, me } = useLeague();
  const [challenge, setChallenge] = useState<ChallengePrefill | undefined>(prefill);
  const [playing, setPlaying] = useState<string>();
  const [reporting, setReporting] = useState<Duel>();

  const mine = league.duels.filter((d) => !d.major && (d.challengerId === me || d.opponentId === me));
  const incoming = mine.filter((d) => d.status === 'sent' && d.opponentId === me);
  const sent = mine.filter((d) => d.status === 'sent' && d.challengerId === me);
  const live = mine.filter((d) => d.status === 'accepted' || d.status === 'reported');
  const recent = mine.filter((d) => ['settled', 'ducked', 'expired'].includes(d.status) && now - (d.settledAt ?? d.createdAt) < 14 * DAY)
    .sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0)).slice(0, 10);

  async function respond(d: Duel, accept: boolean) {
    const { error: err } = await run({ type: 'duel.respond', duelId: d.id, accept });
    if (err) return toast(err);
    if (!accept) toast(`🐔 Ducked. The league can see that. −5`);
    else if (d.type === 'trivia') setPlaying(d.id);
  }

  return (
    <>
      <button className="btn" onClick={() => setChallenge({})}>⚔️ Challenge someone</button>

      <section className="sec">
        <div className="sec-head"><h2>Incoming</h2><small className="muted">24h to answer or it counts as a duck</small></div>
        {incoming.length ? incoming.map((d) => (
          <div className="card incoming" key={d.id}>
            <div className="duel-line">
              <Avatar league={league} id={d.challengerId} />
              <div className="grow">
                <b>{nameOf(league, d.challengerId)}</b> challenged you
                <div className="muted small">{d.title} · {d.stakes} pts{d.extra ? ` · ${d.extra}` : ''}{d.forBelt ? ' · 🥇 belt on the line' : ''}</div>
              </div>
              <span className="chip gold">{left(d.expiresAt - now)}</span>
            </div>
            <div className="act">
              <button className="btn sm" onClick={() => respond(d, true)}>{d.type === 'trivia' ? 'Accept & play' : 'Accept'}</button>
              <button className="btn sm danger" onClick={() => respond(d, false)}>Duck 🐔</button>
            </div>
          </div>
        )) : <div className="card muted small">No one’s called you out. Yet.</div>}
      </section>

      {live.length > 0 && (
        <section className="sec">
          <div className="sec-head"><h2>Live</h2></div>
          <div className="card list">
            {live.map((d) => {
              const other = d.challengerId === me ? d.opponentId : d.challengerId;
              const iPlayed = !!d.trivia?.answers[me];
              return (
                <div className="duel-line" key={d.id}>
                  <Avatar league={league} id={other} />
                  <div className="grow"><b>vs {nameOf(league, other)}</b><div className="muted small">{d.title} · {d.stakes} pts</div></div>
                  {d.type === 'trivia' ? (
                    iPlayed ? <span className="chip">Waiting on them</span> : <button className="btn sm" onClick={() => setPlaying(d.id)}>Play</button>
                  ) : d.status === 'reported' ? (
                    d.reportedBy === me ? <span className="chip">Waiting for confirm</span> : (
                      <span className="act-inline">
                        <button className="btn sm" onClick={async () => { const { error: e } = await run({ type: 'duel.confirm', duelId: d.id }); if (e) toast(e); }}>Confirm</button>
                        <button className="btn sm danger" onClick={async () => { const { error: e } = await run({ type: 'duel.dispute', duelId: d.id }); if (e) toast(e); }}>Dispute</button>
                      </span>
                    )
                  ) : (
                    <button className="btn sm" onClick={() => setReporting(d)}>Report result</button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {sent.length > 0 && (
        <section className="sec">
          <div className="sec-head"><h2>Sent</h2><small className="muted">Waiting for an answer</small></div>
          <div className="card list">
            {sent.map((d) => (
              <div className="duel-line" key={d.id}>
                <Avatar league={league} id={d.opponentId} />
                <div className="grow"><b>vs {nameOf(league, d.opponentId)}</b><div className="muted small">{d.title} · {d.stakes} pts</div></div>
                <span className="chip">{left(d.expiresAt - now)} left</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="sec">
        <div className="sec-head"><h2>Recent</h2></div>
        {recent.length ? (
          <div className="card list">
            {recent.map((d) => {
              const other = d.challengerId === me ? d.opponentId : d.challengerId;
              const won = d.winnerId === me;
              const ducked = d.status !== 'settled';
              const txt = ducked
                ? d.opponentId === me ? `You ducked ${nameOf(league, other)}` : `${nameOf(league, other)} ducked you`
                : !d.winnerId ? `Drew ${nameOf(league, other)} at ${d.title.toLowerCase()}` : won ? `Beat ${nameOf(league, other)} at ${d.title.toLowerCase()}` : `Lost to ${nameOf(league, other)} at ${d.title.toLowerCase()}`;
              const delta = ducked ? (d.opponentId === me ? '−5' : '🐔') : !d.winnerId ? '±0' : won ? `+${d.swing}` : `−${d.swing}`;
              return (
                <div className="duel-line" key={d.id}>
                  <span className="grow">{txt}<div className="muted small">{ago(now - (d.settledAt ?? d.createdAt))}</div></span>
                  <span className={`mono ${delta.startsWith('+') ? 'up' : delta.startsWith('−') ? 'down' : 'muted'}`}>{delta}</span>
                </div>
              );
            })}
          </div>
        ) : <Empty icon="⚔️" title="No duels yet">Call someone out. Trivia takes 60 seconds.</Empty>}
      </section>

      <Belts onChallenge={(to, template) => setChallenge({ to, template })} />

      {challenge && (
        <ChallengeSheet
          prefill={challenge}
          onClose={() => { setChallenge(undefined); clearPrefill(); }}
        />
      )}
      {playing && <TriviaGame duelId={playing} onClose={() => setPlaying(undefined)} />}
      {reporting && <ReportSheet duel={reporting} onClose={() => setReporting(undefined)} />}
    </>
  );
}

function Belts({ onChallenge }: { onChallenge: (to: string, template: string) => void }) {
  const { league, now, me } = useLeague();
  return (
    <section className="sec">
      <div className="sec-head"><h2>Title belts</h2><small className="muted">Beat the holder, take the belt</small></div>
      <div className="belts">
        {league.belts.map((b) => {
          const cat = categoryOf(league, b.categoryId);
          const tpl = DUEL_TEMPLATES.find((t) => t.categoryId === b.categoryId);
          const mineBelt = b.holderId === me;
          return (
            <div className={`belt ${mineBelt ? 'mine' : ''}`} key={b.id}>
              <div className="plate">{cat?.icon}</div>
              <b>{cat?.name} Belt</b>
              <small className="muted">{b.holderId ? (mineBelt ? 'You hold it' : `Held by ${nameOf(league, b.holderId)}`) : 'Vacant'}</small>
              <small className="mono muted">{b.wonAt ? `${Math.max(0, Math.floor((now - b.wonAt) / DAY))}d · ${b.defenses} ${b.defenses === 1 ? 'defense' : 'defenses'}` : '—'}</small>
              {mineBelt ? <span className="chip gold">Defending</span> : tpl ? (
                <button className="btn sm" onClick={() => onChallenge(b.holderId ?? '', tpl.key)}>{b.holderId ? 'Challenge' : 'Claim it'}</button>
              ) : <small className="muted">Win the next {cat?.name.toLowerCase()} Drop</small>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ChallengeSheet({ prefill, onClose }: { prefill: ChallengePrefill; onClose: () => void }) {
  const { league, run, toast, me } = useLeague();
  const others = league.members.filter((m) => m.id !== me && !m.left && !league.blocked.includes(m.id));
  const [to, setTo] = useState(prefill.to && prefill.to !== me ? prefill.to : others[0]?.id);
  const [tplKey, setTplKey] = useState(prefill.template ?? 'trivia');
  const [stakes, setStakes] = useState<number>(25);
  const [extra, setExtra] = useState('');
  const [custom, setCustom] = useState('');
  const tpl = DUEL_TEMPLATES.find((t) => t.key === tplKey)!;
  const belt = league.belts.find((b) => b.categoryId === tpl.categoryId);

  async function send() {
    const { error: err } = await run({ type: 'duel.create', opponentId: to, template: tpl.key, title: custom, stakes, extra: extra || undefined });
    if (err) return toast(err);
    toast(`⚔️ Sent. ${nameOf(league, to)} has 24h to accept or duck.`);
    onClose();
  }

  return (
    <Sheet title="Call someone out" onClose={onClose}>
      <div className="label">Opponent</div>
      <div className="opts">
        {others.map((m) => (
          <button key={m.id} className={`opt ${to === m.id ? 'sel' : ''}`} onClick={() => setTo(m.id)}>{m.name}</button>
        ))}
      </div>
      <div className="label">Challenge</div>
      <div className="opts">
        {DUEL_TEMPLATES.map((t) => (
          <button key={t.key} className={`opt ${tplKey === t.key ? 'sel' : ''}`} onClick={() => setTplKey(t.key)}>{t.title}</button>
        ))}
      </div>
      {tplKey === 'custom' && <input aria-label="Custom challenge" placeholder="Free throws, best of 10" value={custom} maxLength={40} onChange={(e) => setCustom(e.target.value)} />}
      <div className="muted small">Proof: {tpl.proof}{belt?.holderId === to ? ` 🥇 ${nameOf(league, to)} holds the ${categoryOf(league, belt.categoryId)?.name} Belt. Win and it’s yours.` : ''}</div>
      <div className="label">Stakes</div>
      <div className="opts">
        {STAKES.map((s) => (
          <button key={s} className={`opt ${stakes === s ? 'sel' : ''}`} onClick={() => setStakes(s)}>{s} rank pts</button>
        ))}
      </div>
      <div className="opts">
        {['', 'Loser buys coffee', 'Loser buys wings', 'Loser posts an L on their story'].map((x) => (
          <button key={x || 'none'} className={`opt ${extra === x ? 'sel' : ''}`} onClick={() => setExtra(x)}>{x || 'Just points'}</button>
        ))}
      </div>
      <button className="btn" disabled={!to} onClick={send}>Send challenge</button>
    </Sheet>
  );
}

function ReportSheet({ duel, onClose }: { duel: Duel; onClose: () => void }) {
  const { league, run, toast, me } = useLeague();
  const other = duel.challengerId === me ? duel.opponentId : duel.challengerId;
  const [winner, setWinner] = useState<string | 'draw'>(me);
  const [note, setNote] = useState('');
  async function send() {
    const { error: err } = await run({ type: 'duel.report', duelId: duel.id, winnerId: winner === 'draw' ? null : winner, note });
    if (err) return toast(err);
    toast(`Sent to ${nameOf(league, other)} to confirm.`);
    onClose();
  }
  return (
    <Sheet title={`${duel.title} vs ${nameOf(league, other)}`} onClose={onClose}>
      <div className="label">Who won?</div>
      <div className="opts">
        <button className={`opt ${winner === me ? 'sel' : ''}`} onClick={() => setWinner(me)}>I won</button>
        <button className={`opt ${winner === other ? 'sel' : ''}`} onClick={() => setWinner(other)}>{nameOf(league, other)} won</button>
        <button className={`opt ${winner === 'draw' ? 'sel' : ''}`} onClick={() => setWinner('draw')}>Draw</button>
      </div>
      <label className="label" htmlFor="rn">Score or result (optional)</label>
      <input id="rn" placeholder="21–17" value={note} maxLength={40} onChange={(e) => setNote(e.target.value)} />
      <p className="muted small">{nameOf(league, other)} has to confirm. If they dispute it, you run it back.</p>
      <button className="btn" onClick={send}>Send for confirmation</button>
    </Sheet>
  );
}
