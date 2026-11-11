// Every change a player can make, as plain data. The phone sends one of these;
// the server checks it and applies it with the actor it got from sign-in, so a
// player can never act as someone else. Demo mode runs the same function locally.

import type { League, Verdict } from './types';
import { castVote, createReceipt } from './receipts';
import { DUEL_TEMPLATES, STAKES, confirmResult, createDuel, disputeResult, reportResult, respondDuel, submitTrivia } from './duels';
import { addCustomCategory } from './league';
import { PUNISHMENTS, votePunishment } from './season';
import { TRIVIA_ROUND } from './trivia';
import { type Rng } from './util';
import { isActive } from './feed';
import { dismissReport, removeMember, removeReceipt, reportReceipt } from './moderation';

export type Action =
  | { type: 'receipt.create'; categoryId: string; value: number; note?: string; mediaId?: string; mediaType?: 'photo' | 'video' }
  | { type: 'receipt.vote'; receiptId: string; verdict: Verdict }
  | { type: 'receipt.report'; receiptId: string; reason: string }
  | { type: 'member.block'; memberId: string }
  | { type: 'member.unblock'; memberId: string }
  | { type: 'category.add'; name: string; icon: string; unit: string; proof: 'photo' | 'video' }
  | { type: 'duel.create'; opponentId: string; template: string; title?: string; stakes: number; extra?: string }
  | { type: 'duel.respond'; duelId: string; accept: boolean }
  | { type: 'duel.trivia'; duelId: string; answers: number[] }
  | { type: 'duel.report'; duelId: string; winnerId: string | null; note: string }
  | { type: 'duel.confirm'; duelId: string }
  | { type: 'duel.dispute'; duelId: string }
  | { type: 'punishment.vote'; choice: string }
  // League owner only:
  | { type: 'mod.remove'; receiptId: string }
  | { type: 'mod.dismiss'; reportId: string }
  | { type: 'mod.kick'; memberId: string };

/** What an action created, so the caller can follow up (e.g. demo bots react). */
export interface ActionResult {
  receiptId?: string;
  duelId?: string;
  categoryId?: string;
  /** Proof the server should delete from storage. */
  deleteMedia?: string[];
}

function ownerOnly(l: League, actorId: string) {
  if (!l.ownerId || l.ownerId !== actorId) throw new Error('Only the person who started the league can do that.');
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const EXTRAS = ['Loser buys coffee', 'Loser buys wings', 'Loser posts an L on their story'];

export function applyAction(l: League, actorId: string, a: Action, now: number, rng: Rng = Math.random): ActionResult {
  if (!isActive(l, actorId)) throw new Error('You’re not in this league.');
  switch (a.type) {
    case 'receipt.create': {
      const value = Number(a.value);
      if (!Number.isFinite(value) || value <= 0 || value > 1e7) throw new Error('Enter a real number.');
      const r = createReceipt(l, {
        memberId: actorId, categoryId: str(a.categoryId, 40), value: Math.round(value * 100) / 100,
        note: str(a.note, 80).trim() || undefined, mediaId: a.mediaId ? str(a.mediaId, 40) : undefined,
        mediaType: a.mediaType === 'video' ? 'video' : a.mediaType === 'photo' ? 'photo' : undefined,
      }, now);
      return { receiptId: r.id };
    }
    case 'receipt.vote':
      if (a.verdict !== 'legit' && a.verdict !== 'cap') throw new Error('Vote legit or cap.');
      castVote(l, a.receiptId, actorId, a.verdict, now);
      return {};
    case 'receipt.report': {
      reportReceipt(l, actorId, a.receiptId, str(a.reason, 60), now);
      if (!l.hiddenReceipts.includes(a.receiptId)) l.hiddenReceipts.push(a.receiptId);
      return {};
    }
    case 'mod.remove': {
      ownerOnly(l, actorId);
      const m = removeReceipt(l, a.receiptId, 'owner', now);
      return { deleteMedia: m ? [m] : [] };
    }
    case 'mod.dismiss':
      ownerOnly(l, actorId);
      dismissReport(l, a.reportId, 'owner', now);
      return {};
    case 'mod.kick':
      ownerOnly(l, actorId);
      if (a.memberId === actorId) throw new Error('You can’t remove yourself. Leave from the Me tab instead.');
      return { deleteMedia: removeMember(l, a.memberId, now, 'removed') };
    case 'member.block':
      if (a.memberId === actorId) throw new Error('You can’t block yourself.');
      if (!l.blocked.includes(a.memberId)) l.blocked.push(a.memberId);
      return {};
    case 'member.unblock':
      l.blocked = l.blocked.filter((b) => b !== a.memberId);
      return {};
    case 'category.add': {
      if (l.categories.length >= 30) throw new Error('This league has enough categories.');
      const c = addCustomCategory(l, {
        name: str(a.name, 24), icon: str(a.icon, 8), unit: str(a.unit, 10), proof: a.proof === 'photo' ? 'photo' : 'video',
      });
      return { categoryId: c.id };
    }
    case 'duel.create': {
      const tpl = DUEL_TEMPLATES.find((t) => t.key === a.template);
      if (!tpl) throw new Error('Pick a challenge.');
      if (!(STAKES as readonly number[]).includes(a.stakes)) throw new Error('Pick 10, 25 or 50 points.');
      const d = createDuel(l, {
        challengerId: actorId, opponentId: a.opponentId, type: tpl.type, categoryId: tpl.categoryId,
        title: tpl.key === 'custom' ? str(a.title, 40).trim() || 'Custom' : tpl.title,
        stakes: a.stakes, extra: a.extra && EXTRAS.includes(a.extra) ? a.extra : undefined,
      }, now, rng);
      return { duelId: d.id };
    }
    case 'duel.respond': {
      const d = l.duels.find((x) => x.id === a.duelId);
      if (!d || d.opponentId !== actorId) throw new Error('This challenge isn’t yours to answer.');
      respondDuel(l, a.duelId, !!a.accept, now);
      return { duelId: d.id };
    }
    case 'duel.trivia': {
      if (!Array.isArray(a.answers) || a.answers.length !== TRIVIA_ROUND || !a.answers.every((x) => Number.isInteger(x) && x >= -1 && x <= 3)) {
        throw new Error('Bad answers.');
      }
      submitTrivia(l, a.duelId, actorId, a.answers, now);
      return { duelId: a.duelId };
    }
    case 'duel.report':
      reportResult(l, a.duelId, actorId, a.winnerId ?? undefined, str(a.note, 40), now);
      return { duelId: a.duelId };
    case 'duel.confirm':
      confirmResult(l, a.duelId, actorId, now);
      return {};
    case 'duel.dispute':
      disputeResult(l, a.duelId, actorId, now);
      return {};
    case 'punishment.vote':
      if (!PUNISHMENTS.includes(a.choice)) throw new Error('Pick one of the options.');
      votePunishment(l, actorId, a.choice, now);
      return {};
    default:
      throw new Error('Unknown action.');
  }
}
