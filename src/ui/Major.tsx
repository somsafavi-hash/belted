import { useState } from 'react';
import { useLeague } from '../data/game';
import { monthPoints } from '../engine/rating';
import { nameOf } from '../engine/feed';
import { PUNISHMENTS, currentSeason, majorStartsAt, monthLabel, punishment, seedsFor, votePunishment } from '../engine/season';
import { monthKey } from '../engine/util';
import { Avatar, left } from './common';
import { TriviaGame } from './Trivia';

export function Major() {
  const { league, now, act, toast, me, skip } = useLeague();
  const [playing, setPlaying] = useState<string>();
  const month = monthKey(now);
  const season = currentSeason(league, now);
  const mj = season?.major;
  const seeds = seedsFor(league, month);
  const myVote = season?.punishmentVotes[me];

  function vote(p: string) {
    const err = act((l, n) => votePunishment(l, me, p, n));
    if (err) toast(err);
  }

  return (
    <>
      <section className="card rankcard">
        <div className="label">The {monthLabel(month)} Major</div>
        <div className="big">{mj ? (mj.done ? '👑 ' + nameOf(league, mj.championId) : 'Live') : left(majorStartsAt(now) - now)}</div>
        <div className="muted small">
          {mj ? (mj.done ? `Champion. Last place: ${nameOf(league, mj.lastPlaceId)}.` : 'Top 4 by monthly points. Semis, then the final. All trivia.')
            : 'until the bracket. Top 4 by points this month get in. Last place gets the punishment.'}
        </div>
        {!mj && <button className="btn sm ghost" onClick={() => skip(Math.max(0, majorStartsAt(now) - now) + 60_000)}>Skip to Major weekend (demo)</button>}
      </section>

      {mj && (
        <section className="sec">
          <h2>Bracket</h2>
          <div className="bracket">
            {(['semi', 'final'] as const).map((round) => (
              <div className="round" key={round}>
                <div className="label">{round === 'semi' ? 'Semifinals' : 'Final'}</div>
                {mj.matches.filter((m) => m.round === round).map((m) => {
                  const duel = m.duelId ? league.duels.find((d) => d.id === m.duelId) : undefined;
                  const myTurn = duel && duel.status === 'accepted' && !duel.trivia?.answers[me];
                  return (
                    <div className="card match" key={m.id}>
                      {[m.a, m.b].map((p) => (
                        <div className={`match-row ${m.winnerId === p ? 'win' : m.winnerId ? 'lose' : ''}`} key={p}>
                          <Avatar league={league} id={p} size={26} />
                          <span className="grow">{nameOf(league, p)}</span>
                          <span className="mono muted">#{mj.seeds.indexOf(p) + 1}</span>
                        </div>
                      ))}
                      {myTurn && <button className="btn sm" onClick={() => setPlaying(duel.id)}>Play your match</button>}
                      {duel && duel.status === 'accepted' && !myTurn && <small className="muted">Waiting on the other side</small>}
                    </div>
                  );
                })}
                {round === 'final' && !mj.matches.some((m) => m.round === 'final') && <div className="card muted small">Winners of the semis meet here.</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="sec">
        <div className="sec-head"><h2>Race for the top 4</h2><small className="muted">Points earned this month</small></div>
        <div className="card list">
          {seeds.map((id, i) => {
            const p = monthPoints(league, id, month);
            return (
              <div className={`row ${id === me ? 'me' : ''} ${i === 3 ? 'cutline' : ''}`} key={id}>
                <span className="mono muted">{i + 1}</span>
                <Avatar league={league} id={id} />
                <div className="grow"><b>{nameOf(league, id)}</b>{i < 4 ? <span className="chip gold sp">In</span> : i === seeds.length - 1 ? <span className="chip red sp">Last</span> : null}</div>
                <span className={`mono ${p > 0 ? 'up' : p < 0 ? 'down' : 'muted'}`}>{p > 0 ? '+' : ''}{p}</span>
              </div>
            );
          })}
        </div>
      </section>

      {season && (
        <section className="sec">
          <div className="sec-head"><h2>Last-place punishment</h2><small className="muted">{mj ? 'Voting closed' : 'Most votes wins'}</small></div>
          <div className="card list">
            {PUNISHMENTS.map((p) => {
              const n = Object.values(season.punishmentVotes).filter((v) => v === p).length;
              const leading = punishment(season) === p;
              return (
                <button key={p} className={`punish ${myVote === p ? 'sel' : ''}`} onClick={() => vote(p)} disabled={!!mj}>
                  <span className="grow">{p}{leading && <span className="chip gold sp">Leading</span>}</span>
                  <span className="mono muted">{n}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {playing && <TriviaGame duelId={playing} onClose={() => setPlaying(undefined)} />}
    </>
  );
}
