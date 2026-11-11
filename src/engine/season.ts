import type { Duel, League, MajorMatch, Season } from './types';
import { BASE_RATING, addRating, monthPoints, rating } from './rating';
import { nameOf, post } from './feed';
import { pickQuestions } from './duels';
import { botAnswers } from './trivia';
import { DAY, Rng, daysInMonth, monthKey, uid } from './util';

export const MAJOR_BONUS = 50;
export const RESET_SHARE = 0.25;
export const PUNISHMENTS = [
  'Buys the whole league dinner',
  'Changes their profile pic to one the league picks for a week',
  'Wears the champion’s choice of outfit for a day',
  'Posts a league-written caption on their story',
];

export function currentSeason(l: League, now: number): Season | undefined {
  return l.seasons.find((s) => s.month === monthKey(now));
}

/** The Major runs over the last 3 days of the month. */
export function majorWindowOpen(now: number): boolean {
  return new Date(now).getDate() >= daysInMonth(now) - 2;
}

export function majorStartsAt(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), daysInMonth(now) - 2).getTime();
}

export function punishment(s: Season): string {
  const counts = new Map<string, number>();
  for (const v of Object.values(s.punishmentVotes)) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? PUNISHMENTS[0];
}

/** Starts the month's season. On a new month, everyone moves 25% back to 1,200. */
export function ensureSeason(l: League, now: number, rng: Rng = Math.random): Season {
  const month = monthKey(now);
  let s = l.seasons.find((x) => x.month === month);
  if (s) return s;
  const hadSeason = l.seasons.length > 0;
  if (hadSeason) {
    for (const m of l.members) {
      const r = rating(l, m.id);
      const delta = -Math.round((r - BASE_RATING) * RESET_SHARE);
      if (delta !== 0) addRating(l, { memberId: m.id, delta, reason: 'reset', at: now, label: 'Monthly reset (25% back to 1,200)' });
    }
    post(l, now, '🔄', 'New month. Ratings moved 25% back toward 1,200. Vote on this month’s punishment.');
  }
  s = { month, punishmentVotes: {} };
  for (const m of l.members) if (m.isBot) s.punishmentVotes[m.id] = PUNISHMENTS[Math.floor(rng() * PUNISHMENTS.length)];
  l.seasons.push(s);
  return s;
}

export function votePunishment(l: League, memberId: string, choice: string, now: number): void {
  const s = currentSeason(l, now);
  if (!s) throw new Error('No season running.');
  if (s.major) throw new Error('Voting closed when the Major started.');
  s.punishmentVotes[memberId] = choice;
}

export function seedsFor(l: League, month: string): string[] {
  return l.members
    .map((m) => ({ id: m.id, p: monthPoints(l, m.id, month), r: rating(l, m.id) }))
    .sort((a, b) => b.p - a.p || b.r - a.r)
    .map((x) => x.id);
}

function matchDuel(l: League, m: MajorMatch, now: number, rng: Rng): Duel {
  const d: Duel = {
    id: uid(), challengerId: m.a, opponentId: m.b, type: 'trivia', categoryId: 'trivia',
    title: m.round === 'final' ? 'Major final' : 'Major semifinal', stakes: 0, status: 'accepted',
    createdAt: now, expiresAt: Math.max(now + DAY, monthEnd(now)), major: true, trivia: { questionIds: pickQuestions(rng), answers: {} },
  };
  l.duels.push(d);
  m.duelId = d.id;
  return d;
}

/** Bots play bracket matches against each other by skill. */
function simulate(l: League, m: MajorMatch, rng: Rng): string {
  const sa = l.members.find((x) => x.id === m.a)!.skill;
  const sb = l.members.find((x) => x.id === m.b)!.skill;
  return rng() < sa / (sa + sb) ? m.a : m.b;
}

export function startMajor(l: League, now: number, rng: Rng = Math.random): void {
  const s = ensureSeason(l, now, rng);
  if (s.major) return;
  const seeds = seedsFor(l, s.month);
  const top = seeds.slice(0, 4);
  if (top.length < 4) return;
  s.major = {
    seeds: top,
    matches: [
      { id: uid(), round: 'semi', a: top[0], b: top[3] },
      { id: uid(), round: 'semi', a: top[1], b: top[2] },
    ],
    lastPlaceId: seeds[seeds.length - 1],
    done: false,
  };
  post(l, now, '🏆', `The ${monthLabel(s.month)} Major is on: ${nameOf(l, top[0])} vs ${nameOf(l, top[3])}, ${nameOf(l, top[1])} vs ${nameOf(l, top[2])}.`);
  for (const m of s.major.matches) prepMatch(l, m, now, rng);
}

/** Last moment of the month `now` is in. Bracket matches must be played by then. */
export function monthEnd(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1;
}

function prepMatch(l: League, m: MajorMatch, now: number, rng: Rng) {
  const a = l.members.find((x) => x.id === m.a)!;
  const b = l.members.find((x) => x.id === m.b)!;
  if (a.isBot && b.isBot) {
    m.winnerId = simulate(l, m, rng);
    return;
  }
  // A real player is in it: it's a trivia duel. Demo bots answer right away.
  const d = matchDuel(l, m, now, rng);
  for (const p of [a, b]) if (p.isBot) d.trivia!.answers[p.id] = botAnswers(d.trivia!.questionIds, p.skill, rng);
}

/** Moves the bracket forward when matches finish. */
export function advanceMajor(l: League, now: number, rng: Rng = Math.random): void {
  // The bracket can finish after the month rolls over, so look for any unfinished one.
  const s = l.seasons.find((x) => x.major && !x.major.done);
  const mj = s?.major;
  if (!s || !mj) return;
  for (const m of mj.matches) {
    if (m.winnerId || !m.duelId) continue;
    const d = l.duels.find((x) => x.id === m.duelId);
    if (d && d.status === 'accepted' && now > d.expiresAt) {
      // Time's up: whoever played wins; if nobody did, the higher seed goes through.
      const playedA = !!d.trivia?.answers[m.a];
      const playedB = !!d.trivia?.answers[m.b];
      const forfeitWinner = playedA !== playedB ? (playedA ? m.a : m.b) : mj.seeds.indexOf(m.a) < mj.seeds.indexOf(m.b) ? m.a : m.b;
      d.status = 'settled';
      d.settledAt = d.expiresAt;
      d.winnerId = forfeitWinner;
    }
    if (d?.status === 'settled') {
      // A drawn bracket match goes to the higher seed.
      m.winnerId = d.winnerId ?? (mj.seeds.indexOf(m.a) < mj.seeds.indexOf(m.b) ? m.a : m.b);
      post(l, now, '🏆', `${nameOf(l, m.winnerId)} won a Major ${m.round === 'final' ? 'final' : 'semifinal'}.`);
    }
  }
  const semis = mj.matches.filter((m) => m.round === 'semi');
  let final = mj.matches.find((m) => m.round === 'final');
  if (!final && semis.every((m) => m.winnerId)) {
    final = { id: uid(), round: 'final', a: semis[0].winnerId!, b: semis[1].winnerId! };
    mj.matches.push(final);
    post(l, now, '🏆', `Major final: ${nameOf(l, final.a)} vs ${nameOf(l, final.b)}.`);
    prepMatch(l, final, now, rng);
  }
  if (final?.winnerId && !mj.done) {
    mj.done = true;
    mj.championId = final.winnerId;
    addRating(l, { memberId: final.winnerId, delta: MAJOR_BONUS, reason: 'major', at: now, label: `Won the ${monthLabel(s.month)} Major` });
    post(l, now, '👑', `${nameOf(l, final.winnerId)} won the ${monthLabel(s.month)} Major (+${MAJOR_BONUS}). Last place: ${nameOf(l, mj.lastPlaceId)}, who now ${punishment(s).charAt(0).toLowerCase() + punishment(s).slice(1)}.`);
  }
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long' });
}
