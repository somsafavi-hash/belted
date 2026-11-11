import type { Duel, DuelType, League } from './types';
import { addRating, duelSwing, rating } from './rating';
import { beltFor, onCategoryWin } from './belts';
import { categoryOf, isActive, nameOf, post } from './feed';
import { QUESTIONS, TRIVIA_ROUND, triviaScore } from './trivia';
import { DAY, Rng, shuffle, uid } from './util';

export const DUEL_WINDOW = DAY;
export const DUCK_PENALTY = 5;
export const STAKES = [10, 25, 50] as const;

export interface DuelTemplate {
  key: string;
  title: string;
  type: DuelType;
  categoryId?: string;
  proof: string;
}

export const DUEL_TEMPLATES: DuelTemplate[] = [
  { key: 'trivia', title: 'Trivia', type: 'trivia', categoryId: 'trivia', proof: 'Played in the app and scored automatically.' },
  { key: 'lift', title: 'Max lift', type: 'measured', categoryId: 'gym-pr', proof: 'Live video, one take, plates in frame. Loser confirms.' },
  { key: 'mile', title: 'Mile race', type: 'measured', categoryId: 'run', proof: 'Screenshot of each run app or a live photo of the watch. Loser confirms.' },
  { key: 'pushups', title: 'Push-up max', type: 'measured', categoryId: 'workout', proof: 'Live video, full reps. Loser confirms.' },
  { key: 'steps', title: 'Most steps today', type: 'measured', categoryId: 'steps', proof: 'Photo of each step count at midnight. Loser confirms.' },
  { key: 'hoops', title: '1v1 hoops', type: 'irl', proof: 'Both of you confirm the score.' },
  { key: 'custom', title: 'Custom', type: 'irl', proof: 'Both of you confirm the result.' },
];

export interface NewDuel {
  challengerId: string;
  opponentId: string;
  type: DuelType;
  title: string;
  categoryId?: string;
  stakes: number;
  extra?: string;
}

export function createDuel(l: League, input: NewDuel, now: number, rng: Rng = Math.random): Duel {
  if (input.challengerId === input.opponentId) throw new Error('You can’t duel yourself.');
  if (!isActive(l, input.opponentId)) throw new Error('Pick someone in your league.');
  const open = l.duels.find(
    (d) =>
      ['sent', 'accepted', 'reported'].includes(d.status) && !d.major &&
      ((d.challengerId === input.challengerId && d.opponentId === input.opponentId) ||
        (d.challengerId === input.opponentId && d.opponentId === input.challengerId)),
  );
  if (open) throw new Error(`You already have an open duel with ${nameOf(l, input.opponentId)}.`);
  const belt = beltFor(l, input.categoryId);
  const d: Duel = {
    id: uid(),
    ...input,
    status: 'sent',
    createdAt: now,
    expiresAt: now + DUEL_WINDOW,
    forBelt: !!belt?.holderId && (belt.holderId === input.opponentId || belt.holderId === input.challengerId),
  };
  if (d.type === 'trivia') d.trivia = { questionIds: pickQuestions(rng), answers: {} };
  l.duels.push(d);
  return d;
}

export function pickQuestions(rng: Rng): number[] {
  return shuffle(QUESTIONS.map((_, i) => i), rng).slice(0, TRIVIA_ROUND);
}

function getDuel(l: League, id: string): Duel {
  const d = l.duels.find((x) => x.id === id);
  if (!d) throw new Error('Duel not found.');
  return d;
}

export function respondDuel(l: League, duelId: string, accept: boolean, now: number): Duel {
  const d = getDuel(l, duelId);
  if (d.status !== 'sent') throw new Error('This duel was already answered.');
  if (now > d.expiresAt) {
    expireDuels(l, now);
    throw new Error('This duel expired.');
  }
  if (accept) {
    d.status = 'accepted';
    post(l, now, '⚔️', `${nameOf(l, d.opponentId)} accepted ${nameOf(l, d.challengerId)}’s ${d.title.toLowerCase()} duel.`);
  } else {
    duck(l, d, now, 'ducked');
  }
  return d;
}

function duck(l: League, d: Duel, at: number, status: 'ducked' | 'expired') {
  d.status = status;
  d.settledAt = at;
  addRating(l, {
    memberId: d.opponentId, delta: -DUCK_PENALTY, reason: 'duck', refId: d.id, at,
    label: `${status === 'ducked' ? 'Ducked' : 'Ignored'} ${nameOf(l, d.challengerId)}’s duel`,
  });
  post(l, at, '🐔', `${nameOf(l, d.opponentId)} ${status === 'ducked' ? 'ducked' : 'ignored'} ${nameOf(l, d.challengerId)}’s ${d.title.toLowerCase()} duel.`);
}

export function expireDuels(l: League, now: number): void {
  for (const d of l.duels) if (d.status === 'sent' && now > d.expiresAt) duck(l, d, d.expiresAt, 'expired');
}

export function submitTrivia(l: League, duelId: string, memberId: string, answers: number[], now: number): Duel {
  const d = getDuel(l, duelId);
  if (d.type !== 'trivia' || !d.trivia) throw new Error('Not a trivia duel.');
  if (d.status !== 'accepted') throw new Error('This duel isn’t live.');
  if (memberId !== d.challengerId && memberId !== d.opponentId) throw new Error('You’re not in this duel.');
  if (d.trivia.answers[memberId]) throw new Error('You already played this one.');
  d.trivia.answers[memberId] = answers.slice(0, TRIVIA_ROUND);
  const a = d.trivia.answers[d.challengerId];
  const b = d.trivia.answers[d.opponentId];
  if (a && b) {
    const sa = triviaScore(d.trivia.questionIds, a);
    const sb = triviaScore(d.trivia.questionIds, b);
    d.scores = { [d.challengerId]: sa, [d.opponentId]: sb };
    settleDuel(l, d, sa === sb ? undefined : sa > sb ? d.challengerId : d.opponentId, now);
  }
  return d;
}

/** For measured and IRL duels: one side reports, the other confirms. */
export function reportResult(l: League, duelId: string, reporterId: string, winnerId: string | undefined, note: string, now: number): Duel {
  const d = getDuel(l, duelId);
  if (d.type === 'trivia') throw new Error('Trivia duels are scored by the app.');
  if (d.status !== 'accepted') throw new Error('This duel isn’t live.');
  if (reporterId !== d.challengerId && reporterId !== d.opponentId) throw new Error('You’re not in this duel.');
  if (winnerId && winnerId !== d.challengerId && winnerId !== d.opponentId) throw new Error('The winner has to be in the duel.');
  d.status = 'reported';
  d.reportedBy = reporterId;
  d.winnerId = winnerId;
  d.reportNote = note.trim() || undefined;
  d.settledAt = now;
  return d;
}

export function confirmResult(l: League, duelId: string, confirmerId: string, now: number): Duel {
  const d = getDuel(l, duelId);
  if (d.status !== 'reported') throw new Error('Nothing to confirm yet.');
  if (confirmerId === d.reportedBy) throw new Error('The other side has to confirm.');
  if (confirmerId !== d.challengerId && confirmerId !== d.opponentId) throw new Error('You’re not in this duel.');
  settleDuel(l, d, d.winnerId, now);
  return d;
}

export function disputeResult(l: League, duelId: string, disputerId: string, now: number): Duel {
  const d = getDuel(l, duelId);
  if (d.status !== 'reported' || disputerId === d.reportedBy) throw new Error('Nothing to dispute.');
  d.status = 'accepted';
  d.winnerId = undefined;
  d.reportedBy = undefined;
  post(l, now, '🤨', `${nameOf(l, disputerId)} disputed the ${d.title.toLowerCase()} result. Run it back.`);
  return d;
}

export function settleDuel(l: League, d: Duel, winnerId: string | undefined, now: number): void {
  d.status = 'settled';
  d.settledAt = now;
  d.winnerId = winnerId;
  const score = d.scores ? ` ${d.scores[d.challengerId]}–${d.scores[d.opponentId]}` : '';
  if (d.major) return; // the bracket handles it
  if (!winnerId) {
    d.swing = 0;
    post(l, now, '🤝', `${nameOf(l, d.challengerId)} and ${nameOf(l, d.opponentId)} drew their ${d.title.toLowerCase()} duel${score}.`);
    return;
  }
  const loserId = winnerId === d.challengerId ? d.opponentId : d.challengerId;
  const swing = duelSwing(rating(l, winnerId), rating(l, loserId), d.stakes);
  d.swing = swing;
  const cat = categoryOf(l, d.categoryId);
  addRating(l, { memberId: winnerId, categoryId: d.categoryId, delta: swing, reason: 'duel', refId: d.id, at: now, label: `Beat ${nameOf(l, loserId)} at ${d.title.toLowerCase()}` });
  addRating(l, { memberId: loserId, categoryId: d.categoryId, delta: -swing, reason: 'duel', refId: d.id, at: now, label: `Lost to ${nameOf(l, winnerId)} at ${d.title.toLowerCase()}` });
  const scoreTxt = d.scores ? `${Math.max(...Object.values(d.scores))}–${Math.min(...Object.values(d.scores))}` : '';
  post(l, now, '⚔️', `${nameOf(l, winnerId)} beat ${nameOf(l, loserId)} at ${d.title.toLowerCase()}${scoreTxt ? ' ' + scoreTxt : ''} (+${swing}).${d.extra ? ` ${nameOf(l, loserId)} owes: ${d.extra.toLowerCase()}.` : ''}`);
  if (cat) onCategoryWin(l, cat.id, winnerId, loserId, now);
}

export function isLive(d: Duel): boolean {
  return d.status === 'sent' || d.status === 'accepted' || d.status === 'reported';
}
