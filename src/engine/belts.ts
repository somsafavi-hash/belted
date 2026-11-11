import type { League } from './types';
import { addRating } from './rating';
import { categoryOf, nameOf, post } from './feed';
import { DAY, uid } from './util';

export const BELT_WEEKLY = 5;

export function ensureBelts(l: League): void {
  for (const c of l.categories) {
    if (!l.belts.some((b) => b.categoryId === c.id)) {
      l.belts.push({ id: uid(), categoryId: c.id, defenses: 0 });
    }
  }
}

export function beltFor(l: League, categoryId?: string) {
  return categoryId ? l.belts.find((b) => b.categoryId === categoryId) : undefined;
}

/** Called after a duel or Drop win in a category. */
export function onCategoryWin(l: League, categoryId: string | undefined, winnerId: string, loserId: string | undefined, at: number): void {
  const belt = beltFor(l, categoryId);
  if (!belt) return;
  const cat = categoryOf(l, categoryId);
  if (!belt.holderId) {
    belt.holderId = winnerId;
    belt.wonAt = at;
    belt.lastPaidAt = at;
    belt.defenses = 0;
    post(l, at, '🥇', `${nameOf(l, winnerId)} claimed the vacant ${cat?.name} Belt.`);
  } else if (belt.holderId === winnerId) {
    if (loserId) {
      belt.defenses += 1;
      post(l, at, '🛡️', `${nameOf(l, winnerId)} defended the ${cat?.name} Belt against ${nameOf(l, loserId)}.`);
    }
  } else if (belt.holderId === loserId || !loserId) {
    const old = belt.holderId;
    belt.holderId = winnerId;
    belt.wonAt = at;
    belt.lastPaidAt = at;
    belt.defenses = 0;
    post(l, at, '🥇', `${nameOf(l, winnerId)} took the ${cat?.name} Belt from ${nameOf(l, old)}.`);
  }
}

/** +5 rating for every full week a belt is held. */
export function payBelts(l: League, now: number): void {
  for (const b of l.belts) {
    if (!b.holderId || b.lastPaidAt === undefined) continue;
    const weeks = Math.floor((now - b.lastPaidAt) / (7 * DAY));
    if (weeks < 1) continue;
    b.lastPaidAt += weeks * 7 * DAY;
    const cat = categoryOf(l, b.categoryId);
    addRating(l, {
      memberId: b.holderId, categoryId: b.categoryId, delta: BELT_WEEKLY * weeks, reason: 'belt', refId: b.id, at: b.lastPaidAt,
      label: `Held the ${cat?.name} Belt ${weeks === 1 ? 'a week' : `${weeks} weeks`}`,
    });
  }
}
