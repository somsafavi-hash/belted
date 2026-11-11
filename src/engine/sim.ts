// Demo mode: the five made-up friends act on their own so a league feels
// alive on one phone. Everything they do goes through the same rules as a
// real player. When a backend exists, this file is the only one that goes away.

import type { Duel, League, Member, Scheduled, Verdict } from './types';
import { castVote, createReceipt } from './receipts';
import { rulesTick } from './rules';
import { confirmResult, createDuel, isLive, respondDuel, settleDuel, submitTrivia, DUEL_TEMPLATES, STAKES } from './duels';
import { botAnswers, triviaScore } from './trivia';
import { ensureSeason } from './season';
import { DAY, HOUR, MIN, Rng, between, pick, uid } from './util';

/** Long skips (or a phone left closed) replay at most three weeks of activity. */
const MAX_CATCHUP = 21 * DAY;

export function bots(l: League): Member[] {
  return l.members.filter((m) => m.isBot);
}

function schedule(l: League, s: Omit<Scheduled, 'id'>) {
  l.scheduled.push({ ...s, id: uid() });
}

/** After you post a receipt, the bots vote on it within a couple of minutes. */
export function onMyReceipt(l: League, receiptId: string, now: number, rng: Rng = Math.random): void {
  for (const b of bots(l)) {
    if (rng() < 0.1) continue; // someone always forgets to vote
    const verdict: Verdict = rng() < 0.9 ? 'legit' : 'cap';
    schedule(l, { at: now + between(15, 150, rng) * 1000, kind: 'vote', memberId: b.id, targetId: receiptId, verdict });
  }
}

/** After you challenge a bot, it answers within half a minute. */
export function onMyDuel(l: League, duel: Duel, now: number, rng: Rng = Math.random): void {
  schedule(l, { at: now + between(6, 25, rng) * 1000, kind: 'duelRespond', memberId: duel.opponentId, targetId: duel.id });
}

/** After you report a result, the bot confirms it. */
export function onMyReport(l: League, duel: Duel, now: number, rng: Rng = Math.random): void {
  const other = duel.challengerId === l.meId ? duel.opponentId : duel.challengerId;
  schedule(l, { at: now + between(4, 15, rng) * 1000, kind: 'duelConfirm', memberId: other, targetId: duel.id });
}

/** When you accept a bot's trivia duel, the bot's answers are locked in. */
export function onAcceptTrivia(l: League, duel: Duel, rng: Rng = Math.random): void {
  if (duel.type !== 'trivia' || !duel.trivia) return;
  const bot = duel.challengerId === l.meId ? duel.opponentId : duel.challengerId;
  const m = l.members.find((x) => x.id === bot);
  if (m?.isBot && !duel.trivia.answers[bot]) duel.trivia.answers[bot] = botAnswers(duel.trivia.questionIds, m.skill, rng);
}

function runScheduled(l: League, now: number, rng: Rng) {
  const due = l.scheduled.filter((s) => s.at <= now).sort((a, b) => a.at - b.at);
  l.scheduled = l.scheduled.filter((s) => s.at > now);
  for (const s of due) {
    try {
      if (s.kind === 'vote') {
        const r = l.receipts.find((x) => x.id === s.targetId);
        if (r?.status === 'open' && !r.votes[s.memberId]) castVote(l, r.id, s.memberId, s.verdict ?? 'legit', s.at);
      } else if (s.kind === 'duelRespond') {
        const d = l.duels.find((x) => x.id === s.targetId);
        if (d?.status !== 'sent') continue;
        const accept = rng() < (d.stakes >= 50 ? 0.6 : 0.82);
        respondDuel(l, d.id, accept, s.at);
        if (accept) onAcceptTrivia(l, d, rng);
      } else if (s.kind === 'duelConfirm') {
        const d = l.duels.find((x) => x.id === s.targetId);
        if (d?.status === 'reported') confirmResult(l, d.id, s.memberId, s.at);
      }
    } catch {
      // A scheduled action that no longer applies is skipped.
    }
  }
}

function botReceipt(l: League, b: Member, at: number, rng: Rng) {
  // `at` is already clamped to the present by the caller.
  const cats = l.categories.filter((c) => c.loggable && c.preset);
  const cat = pick(cats, rng);
  const honest = rng() < b.honesty;
  let value = between(cat.typical[0], cat.typical[1], rng) * (0.7 + b.skill * 0.6);
  if (!honest) value *= 1.6;
  value = cat.unit === 'lb' ? Math.round(value / 5) * 5 : cat.unit === 'steps' ? Math.round(value / 10) * 10 : cat.unit === 'L' || cat.unit === 'mi' ? Math.round(value * 10) / 10 : Math.round(value);
  const r = createReceipt(l, { memberId: b.id, categoryId: cat.id, value, suspicious: !honest }, at);
  for (const v of bots(l)) {
    if (v.id === b.id || rng() < 0.15) continue;
    const verdict: Verdict = r.suspicious ? (rng() < 0.7 ? 'cap' : 'legit') : rng() < 0.06 ? 'cap' : 'legit';
    schedule(l, { at: at + between(10 * MIN, 8 * HOUR, rng), kind: 'vote', memberId: v.id, targetId: r.id, verdict });
  }
}

function botChallengesMe(l: League, at: number, rng: Rng) {
  if (l.duels.filter((d) => d.opponentId === l.meId && d.status === 'sent').length >= 2) return;
  const b = pick(bots(l), rng);
  const tpl = rng() < 0.6 ? DUEL_TEMPLATES[0] : pick(DUEL_TEMPLATES.slice(1, 6), rng);
  try {
    createDuel(l, {
      challengerId: b.id, opponentId: l.meId, type: tpl.type, title: tpl.title, categoryId: tpl.categoryId,
      stakes: pick(STAKES, rng), extra: rng() < 0.4 ? pick(['Loser buys coffee', 'Loser buys wings', 'Loser posts an L on their story'], rng) : undefined,
    }, at, rng);
  } catch { /* already dueling */ }
}

function botVsBot(l: League, at: number, cap: number, rng: Rng) {
  const c = (x: number) => Math.min(x, cap);
  const bs = bots(l);
  const a = pick(bs, rng);
  const others = bs.filter((x) => x.id !== a.id);
  const b = pick(others, rng);
  const tpl = rng() < 0.5 ? DUEL_TEMPLATES[0] : pick(DUEL_TEMPLATES.slice(1, 6), rng);
  let d: Duel;
  try {
    d = createDuel(l, { challengerId: a.id, opponentId: b.id, type: tpl.type, title: tpl.title, categoryId: tpl.categoryId, stakes: pick(STAKES, rng) }, at, rng);
  } catch { return; }
  if (rng() < 0.12) { respondDuel(l, d.id, false, c(at + 20 * MIN)); return; }
  respondDuel(l, d.id, true, c(at + 10 * MIN));
  if (d.type === 'trivia' && d.trivia) {
    submitTrivia(l, d.id, a.id, botAnswers(d.trivia.questionIds, a.skill, rng), c(at + 30 * MIN));
    submitTrivia(l, d.id, b.id, botAnswers(d.trivia.questionIds, b.skill, rng), c(at + 40 * MIN));
  } else {
    settleDuel(l, d, rng() < a.skill / (a.skill + b.skill) ? a.id : b.id, c(at + 2 * HOUR));
  }
}

/** Ambient activity for one simulated hour starting at `t`. */
function ambientHour(l: League, t: number, cap: number, rng: Rng) {
  const when = () => Math.min(t + rng() * HOUR, cap);
  const hour = new Date(t).getHours();
  const awake = hour >= 7 && hour <= 23;
  if (!awake) return;
  for (const b of bots(l)) if (rng() < 2.2 / 17) botReceipt(l, b, when(), rng);
  if (rng() < 0.9 / 17) botChallengesMe(l, when(), rng);
  if (rng() < 1.2 / 17) botVsBot(l, when(), cap, rng);
}

/**
 * Brings the league up to `now`: bot activity for each hour that passed, then
 * every rule that runs on a clock (votes closing, duels expiring, Drops,
 * belts, the monthly reset and the Major).
 */
export function tick(l: League, now: number, rng: Rng = Math.random): void {
  const t = Math.max(l.lastTick, now - MAX_CATCHUP);
  // Only whole hours get ambient activity, so a 3-second refresh does nothing.
  const startHour = Math.floor(t / HOUR);
  const endHour = Math.floor(now / HOUR);
  for (let h = startHour + 1; h <= endHour; h++) {
    const at = h * HOUR;
    ensureSeason(l, at, rng);
    ambientHour(l, at, now, rng);
    rules(l, at, rng);
  }
  runScheduled(l, now, rng);
  rules(l, now, rng);
  l.lastTick = now;
}

function rules(l: League, now: number, rng: Rng) {
  runScheduled(l, now, rng);
  rulesTick(l, now, rng);
}

export { isLive, triviaScore };
