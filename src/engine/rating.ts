import type { League, RatingEvent } from './types';
import { DAY, monthKey, uid } from './util';

export const BASE_RATING = 1200;

export const TIERS = [
  { name: 'Legend', min: 1550 },
  { name: 'Diamond', min: 1450 },
  { name: 'Gold', min: 1350 },
  { name: 'Silver', min: 1250 },
  { name: 'Bronze', min: -Infinity },
] as const;

export type TierName = (typeof TIERS)[number]['name'];

/**
 * A rating is never stored. It is the base plus every event in the ledger, so
 * every change has a reason the player can see.
 */
export function rating(l: League, memberId: string, categoryId?: string, before = Infinity): number {
  let r = BASE_RATING;
  for (const e of l.ratings) {
    if (e.memberId !== memberId || e.at > before) continue;
    if (categoryId !== undefined && e.categoryId !== categoryId) continue;
    r += e.delta;
  }
  return Math.round(r);
}

export function tier(r: number): TierName {
  return TIERS.find((t) => r >= t.min)!.name;
}

export function addRating(l: League, e: Omit<RatingEvent, 'id'>): RatingEvent {
  const ev = { ...e, id: uid() };
  l.ratings.push(ev);
  return ev;
}

export function expected(ra: number, rb: number): number {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

/**
 * Points that move in a duel. An even match moves the full stakes; beating
 * someone far below you moves less, an upset moves the full stakes.
 */
export function duelSwing(winnerRating: number, loserRating: number, stakes: number): number {
  if (stakes <= 0) return 0;
  const raw = Math.round(stakes * 2 * (1 - expected(winnerRating, loserRating)));
  return Math.max(1, Math.min(stakes, raw));
}

/** Points earned this month, which seed the Major. Resets don't count. */
export function monthPoints(l: League, memberId: string, month: string): number {
  let p = 0;
  for (const e of l.ratings) {
    if (e.memberId === memberId && e.reason !== 'reset' && e.reason !== 'seed' && monthKey(e.at) === month) p += e.delta;
  }
  return p;
}

export interface StandingRow {
  memberId: string;
  rating: number;
  tier: TierName;
  move: number; // places gained in the last 7 days
}

export function standings(l: League, now: number): StandingRow[] {
  const ids = l.members.filter((m) => !m.left).map((m) => m.id);
  const nowRank = ids.slice().sort((a, b) => rating(l, b) - rating(l, a));
  const weekAgo = now - 7 * DAY;
  const oldRank = ids.slice().sort((a, b) => rating(l, b, undefined, weekAgo) - rating(l, a, undefined, weekAgo));
  return nowRank.map((id, i) => {
    const r = rating(l, id);
    return { memberId: id, rating: r, tier: tier(r), move: oldRank.indexOf(id) - i };
  });
}
