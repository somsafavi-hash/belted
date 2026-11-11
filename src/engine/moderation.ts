// Reports and takedowns. A league's owner can act on reports in their league;
// Belted (the admin screen) can act on any league. Both use these functions.

import type { League } from './types';
import { addRating } from './rating';
import { categoryOf, nameOf, post } from './feed';
import { uid } from './util';

/** This many different people reporting a receipt hides it from the league until someone reviews it. */
export const AUTO_HIDE_REPORTS = 2;

export function openReports(l: League) {
  return l.reports.filter((r) => (r.status ?? 'open') === 'open');
}

export function reportReceipt(l: League, reporterId: string, receiptId: string, reason: string, now: number) {
  const r = l.receipts.find((x) => x.id === receiptId && !x.removed);
  if (!r) throw new Error('Receipt not found.');
  if (r.memberId === reporterId) throw new Error('You can’t report your own receipt.');
  if (l.reports.some((x) => x.receiptId === receiptId && x.reporterId === reporterId)) {
    return undefined; // already reported by this person: just hide it for them
  }
  const report = { id: uid(), at: now, receiptId, reason: reason.slice(0, 60) || 'Reported', reporterId, status: 'open' as const };
  l.reports.push(report);
  const reporters = new Set(openReports(l).filter((x) => x.receiptId === receiptId).map((x) => x.reporterId));
  if (reporters.size >= AUTO_HIDE_REPORTS) r.flagged = true;
  return report;
}

/** Takes a receipt down, reverses whatever it scored, and returns its proof id so storage can delete it. */
export function removeReceipt(l: League, receiptId: string, by: 'owner' | 'belted', now: number): string | undefined {
  const r = l.receipts.find((x) => x.id === receiptId);
  if (!r) throw new Error('Receipt not found.');
  if (r.removed) return undefined;
  r.removed = true;
  r.flagged = false;
  const mediaId = r.mediaId;
  r.mediaId = undefined;
  r.mediaType = undefined;
  const earned = l.ratings.filter((e) => e.refId === r.id && e.memberId === r.memberId).reduce((s, e) => s + e.delta, 0);
  if (earned !== 0) {
    addRating(l, {
      memberId: r.memberId, categoryId: r.categoryId, delta: -earned, reason: 'cap', refId: r.id, at: now,
      label: `${categoryOf(l, r.categoryId)?.name} receipt removed by a moderator`,
    });
  }
  for (const rep of l.reports) {
    if (rep.receiptId === r.id && (rep.status ?? 'open') === 'open') {
      rep.status = 'removed';
      rep.resolvedAt = now;
      rep.resolvedBy = by;
    }
  }
  post(l, now, '🚫', `A receipt from ${nameOf(l, r.memberId)} was removed for breaking the rules.`);
  return mediaId;
}

/** Keeps the receipt. Clears every open report on it and un-hides it. */
export function dismissReport(l: League, reportId: string, by: 'owner' | 'belted', now: number): void {
  const rep = l.reports.find((x) => x.id === reportId);
  if (!rep) throw new Error('Report not found.');
  for (const x of l.reports) {
    if (x.receiptId === rep.receiptId && (x.status ?? 'open') === 'open') {
      x.status = 'dismissed';
      x.resolvedAt = now;
      x.resolvedBy = by;
    }
  }
  const r = l.receipts.find((x) => x.id === rep.receiptId);
  if (r) r.flagged = false;
}

/**
 * Takes someone out of the league, by their choice or a moderator's. Their
 * receipts go, live duels are called off, belts go vacant, and their name in
 * old results becomes "Deleted player". Returns proof ids to delete.
 */
export function removeMember(l: League, memberId: string, now: number, why: 'left' | 'removed'): string[] {
  const m = l.members.find((x) => x.id === memberId);
  if (!m || m.left) throw new Error('That person isn’t in the league.');
  const name = m.name;
  const media = l.receipts.filter((r) => r.memberId === memberId && r.mediaId).map((r) => r.mediaId!);
  l.receipts = l.receipts.filter((r) => r.memberId !== memberId);
  for (const d of l.duels) {
    if ((d.challengerId === memberId || d.opponentId === memberId) && ['sent', 'accepted', 'reported'].includes(d.status) && !d.major) {
      d.status = 'expired';
      d.settledAt = now;
    }
  }
  for (const b of l.belts) if (b.holderId === memberId) { b.holderId = undefined; b.wonAt = undefined; b.lastPaidAt = undefined; b.defenses = 0; }
  m.left = true;
  m.name = `Deleted player ${l.members.indexOf(m) + 1}`;
  post(l, now, '👋', why === 'left' ? `${name} left the league.` : `${name} was removed from the league.`);
  return media;
}

