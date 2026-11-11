import { useEffect, useRef, useState } from 'react';
import { useLeague } from '../data/game';
import { submitTrivia } from '../engine/duels';
import { QUESTIONS, TRIVIA_SECONDS } from '../engine/trivia';
import { nameOf } from '../engine/feed';
import { Avatar } from './common';

export function TriviaGame({ duelId, onClose }: { duelId: string; onClose: () => void }) {
  const { league, act, toast, me } = useLeague();
  const duel = league.duels.find((d) => d.id === duelId)!;
  const qids = duel.trivia!.questionIds;
  const other = duel.challengerId === me ? duel.opponentId : duel.challengerId;
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [picked, setPicked] = useState<number>();
  const [started, setStarted] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const submitted = useRef(false);
  const done = i >= qids.length;
  const myScore = answers.filter((a, k) => a === QUESTIONS[qids[k]].c).length;

  useEffect(() => {
    if (!started || done || picked !== undefined) return;
    const id = setInterval(() => setNowMs(Date.now()), 100);
    return () => clearInterval(id);
  }, [started, done, picked]);

  useEffect(() => {
    if (started && !done && picked === undefined && nowMs >= deadline) choose(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMs]);

  useEffect(() => {
    if (!done || submitted.current) return;
    submitted.current = true;
    const err = act((l, n) => { submitTrivia(l, duelId, me, answers, n); });
    if (err) toast(err);
  }, [done, act, answers, duelId, me, toast]);

  function begin() {
    setStarted(true);
    setDeadline(Date.now() + TRIVIA_SECONDS * 1000);
    setNowMs(Date.now());
  }

  function choose(k: number) {
    if (picked !== undefined) return;
    setPicked(k);
    setTimeout(() => {
      setAnswers((a) => [...a, k]);
      setPicked(undefined);
      setI((x) => x + 1);
      setDeadline(Date.now() + TRIVIA_SECONDS * 1000);
      setNowMs(Date.now());
    }, 900);
  }

  const live = league.duels.find((d) => d.id === duelId)!;
  const theirScore = live.scores?.[other];

  if (!started) {
    return (
      <div className="full">
        <div className="result">
          <div className="huge-ico">🧠</div>
          <h2>{duel.major ? duel.title : `Trivia vs ${nameOf(league, other)}`}</h2>
          <p className="muted">5 questions, {TRIVIA_SECONDS} seconds each. No Googling, the clock is running. {duel.major ? 'Winner moves on in the bracket.' : `${duel.stakes} rank points on the line.`}</p>
          <button className="btn" onClick={begin}>Start</button>
          <button className="btn ghost" onClick={onClose}>Not now</button>
        </div>
      </div>
    );
  }

  if (done) {
    const settled = live.status === 'settled';
    const won = settled && live.winnerId === me;
    const draw = settled && !live.winnerId;
    return (
      <div className="full">
        <div className="result">
          <div className="huge-ico">{!settled ? '⏳' : won ? '🏆' : draw ? '🤝' : '💀'}</div>
          <div className={`huge ${won ? 'up' : settled && !draw ? 'down' : ''}`}>{!settled ? `${myScore}/5` : won ? 'W' : draw ? 'Draw' : 'L'}</div>
          {settled ? (
            <>
              <div className="mono score-line">{myScore} – {theirScore}</div>
              <p className="muted">
                {duel.major ? (won ? 'You move on.' : draw ? 'Draw goes to the higher seed.' : 'Out of the Major.') :
                  won ? `+${live.swing} rank points.${live.extra ? ` ${nameOf(league, other)} owes you: ${live.extra.toLowerCase()}.` : ''}` :
                  draw ? 'No points move. Run it back.' : `−${live.swing} rank points.${live.extra ? ` You owe: ${live.extra.toLowerCase()}.` : ''}`}
              </p>
            </>
          ) : (
            <p className="muted">Locked in. Waiting on {nameOf(league, other)} to play.</p>
          )}
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  const q = QUESTIONS[qids[i]];
  const pct = Math.max(0, (deadline - nowMs) / (TRIVIA_SECONDS * 1000)) * 100;
  return (
    <div className="full">
      <div className="vs">
        <div><Avatar league={league} id={me} size={40} /><div className="mono score">{myScore}</div><small className="muted">You</small></div>
        <div className="muted mono">Q{i + 1}/5</div>
        <div><Avatar league={league} id={other} size={40} /><div className="mono score">?</div><small className="muted">{nameOf(league, other)}</small></div>
      </div>
      <div className="timer"><span style={{ width: `${picked === undefined ? pct : 0}%` }} /></div>
      <p className="q">{q.q}</p>
      <div className="answers">
        {q.a.map((a, k) => {
          const cls = picked === undefined ? '' : k === q.c ? 'right' : k === picked ? 'wrong' : '';
          return <button key={k} className={`ans ${cls}`} onClick={() => choose(k)} disabled={picked !== undefined}>{a}</button>;
        })}
      </div>
    </div>
  );
}
