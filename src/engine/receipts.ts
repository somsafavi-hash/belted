import type { League, Receipt, Verdict } from './types';
import { addRating } from './rating';
import { activeMembers, categoryOf, isActive, nameOf, post } from './feed';
import { DAY, dayKey, uid } from './util';

export const RECEIPT_POINTS = 10;
export const CAP_PENALTY = 10;
export const FALSE_CAP_PENALTY = 2;
export const VOTE_WINDOW = DAY;

export interface NewReceipt {
  memberId: string;
  categoryId: string;
  value: number;
  note?: string;
  mediaId?: string;
  mediaType?: 'photo' | 'video';
  suspicious?: boolean;
}

export function createReceipt(l: League, input: NewReceipt, now: number): Receipt {
  const cat = categoryOf(l, input.categoryId);
  if (!cat || !cat.loggable) throw new Error('That category can’t take receipts.');
  if (!(input.value > 0)) throw new Error('Enter a number above zero.');
  if (cat.proof !== 'confirm' && !input.mediaId && !l.members.find((m) => m.id === input.memberId)?.isBot) {
    throw new Error('This category needs a live photo or video as proof.');
  }
  const r: Receipt = {
    id: uid(),
    ...input,
    createdAt: now,
    closesAt: now + VOTE_WINDOW,
    votes: {},
    status: 'open',
    scored: false,
  };
  l.receipts.push(r);
  return r;
}

export function eligibleVoters(l: League, r: Receipt): string[] {
  return activeMembers(l).filter((m) => m.id !== r.memberId).map((m) => m.id);
}

export function castVote(l: League, receiptId: string, voterId: string, verdict: Verdict, now: number): Receipt {
  const r = l.receipts.find((x) => x.id === receiptId);
  if (!r) throw new Error('Receipt not found.');
  if (r.memberId === voterId) throw new Error('You can’t vote on your own receipt.');
  if (r.status !== 'open') throw new Error('Voting on this receipt is closed.');
  if (!isActive(l, voterId)) throw new Error('Only league members can vote.');
  if (r.flagged || r.removed) throw new Error('This receipt is under review.');
  r.votes[voterId] = verdict;
  maybeSettle(l, r, now);
  return r;
}

export function maybeSettle(l: League, r: Receipt, now: number): void {
  if (r.status !== 'open') return;
  const voters = eligibleVoters(l, r);
  const allIn = voters.every((v) => r.votes[v]);
  if (allIn || now >= r.closesAt) settleReceipt(l, r, Math.min(now, r.closesAt));
}

export function tally(r: Receipt): { legit: number; cap: number } {
  let legit = 0;
  let cap = 0;
  for (const v of Object.values(r.votes)) v === 'cap' ? cap++ : legit++;
  return { legit, cap };
}

export function settleReceipt(l: League, r: Receipt, at: number): void {
  const { legit, cap } = tally(r);
  const cat = categoryOf(l, r.categoryId);
  const who = nameOf(l, r.memberId);
  if (cap > legit) {
    r.status = 'cap';
    addRating(l, {
      memberId: r.memberId, categoryId: r.categoryId, delta: -CAP_PENALTY, reason: 'cap', refId: r.id, at,
      label: `${cat?.name} receipt ruled cap`,
    });
    post(l, at, '🧢', `The league ruled ${who}’s ${cat?.name.toLowerCase()} receipt (${fmtValue(r.value, cat?.unit)}) cap, ${cap}–${legit}.`);
    return;
  }
  r.status = 'legit';
  const day = dayKey(r.createdAt);
  const alreadyScored = l.receipts.some(
    (o) => o.id !== r.id && o.scored && o.memberId === r.memberId && o.categoryId === r.categoryId && dayKey(o.createdAt) === day,
  );
  if (!alreadyScored) {
    r.scored = true;
    addRating(l, {
      memberId: r.memberId, categoryId: r.categoryId, delta: RECEIPT_POINTS, reason: 'receipt', refId: r.id, at,
      label: `${cat?.name} receipt confirmed`,
    });
  }
  for (const [voter, v] of Object.entries(r.votes)) {
    if (v === 'cap') {
      addRating(l, {
        memberId: voter, categoryId: r.categoryId, delta: -FALSE_CAP_PENALTY, reason: 'false_cap', refId: r.id, at,
        label: `Called cap on ${who}’s legit receipt`,
      });
    }
  }
}

export function settleDueReceipts(l: League, now: number): void {
  for (const r of l.receipts) if (r.status === 'open') maybeSettle(l, r, now);
}

export function fmtValue(v: number, unit = ''): string {
  const n = v >= 1000 ? Math.round(v).toLocaleString() : Number.isInteger(v) ? String(v) : v.toFixed(1);
  return unit ? `${n} ${unit}` : n;
}
