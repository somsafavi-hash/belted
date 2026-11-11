import type { Drop, League } from './types';
import { addRating } from './rating';
import { onCategoryWin } from './belts';
import { categoryOf, nameOf, post } from './feed';
import { fmtValue } from './receipts';
import { HOUR, uid } from './util';

export const DROP_AWARDS = [30, 20, 10];

/** The rotation the app runs on its own when no one has started a Drop. */
export const AUTO_DROPS: { categoryId: string; hours: number; title: string }[] = [
  { categoryId: 'water', hours: 48, title: '48-Hour Hydration Drop' },
  { categoryId: 'reading', hours: 72, title: 'Weekend Pages Drop' },
  { categoryId: 'steps', hours: 24, title: '24-Hour Step Drop' },
  { categoryId: 'workout', hours: 48, title: '48-Hour Grind Drop' },
  { categoryId: 'run', hours: 72, title: '3-Day Mileage Drop' },
];

export function activeDrop(l: League, now: number): Drop | undefined {
  return l.drops.find((d) => !d.settled && d.startsAt <= now && now < d.endsAt);
}

export function startDrop(l: League, categoryId: string, hours: number, now: number, title?: string): Drop {
  if (activeDrop(l, now)) throw new Error('A Drop is already live. Wait for it to end.');
  const cat = categoryOf(l, categoryId);
  if (!cat || !cat.loggable) throw new Error('Pick a category people can log.');
  const d: Drop = {
    id: uid(),
    categoryId,
    title: title || `${hours}-Hour ${cat.name} Drop`,
    startsAt: now,
    endsAt: now + hours * HOUR,
    settled: false,
  };
  l.drops.push(d);
  post(l, now, '💥', `${d.title} is live. Most ${cat.unit} by the end wins.`);
  return d;
}

export function dropTotals(l: League, d: Drop): { memberId: string; total: number }[] {
  const totals = new Map<string, number>(l.members.map((m) => [m.id, 0]));
  for (const r of l.receipts) {
    if (r.categoryId !== d.categoryId || r.status === 'cap') continue;
    if (r.createdAt < d.startsAt || r.createdAt >= d.endsAt) continue;
    totals.set(r.memberId, (totals.get(r.memberId) ?? 0) + r.value);
  }
  return [...totals].map(([memberId, total]) => ({ memberId, total })).sort((a, b) => b.total - a.total);
}

export function settleDrops(l: League, now: number): void {
  for (const d of l.drops) {
    if (d.settled || now < d.endsAt) continue;
    const res = dropTotals(l, d).filter((r) => r.total > 0);
    d.results = res;
    d.settled = true;
    const cat = categoryOf(l, d.categoryId);
    res.slice(0, DROP_AWARDS.length).forEach((r, i) => {
      addRating(l, {
        memberId: r.memberId, categoryId: d.categoryId, delta: DROP_AWARDS[i], reason: 'drop', refId: d.id, at: d.endsAt,
        label: `${['1st', '2nd', '3rd'][i]} in ${d.title}`,
      });
    });
    if (res[0]) {
      post(l, d.endsAt, '🏁', `${nameOf(l, res[0].memberId)} won the ${d.title} with ${fmtValue(res[0].total, cat?.unit)}.`);
      onCategoryWin(l, d.categoryId, res[0].memberId, undefined, d.endsAt);
    } else {
      post(l, d.endsAt, '🏁', `${d.title} ended with no receipts. Embarrassing for everyone.`);
    }
  }
}

/** Keeps one Drop running: a new one starts 6 hours after the last ends. */
export function autoDrop(l: League, now: number): void {
  if (activeDrop(l, now)) return;
  const last = l.drops.slice().sort((a, b) => b.endsAt - a.endsAt)[0];
  if (last && now - last.endsAt < 6 * HOUR) return;
  const idx = last ? (AUTO_DROPS.findIndex((a) => a.categoryId === last.categoryId) + 1) % AUTO_DROPS.length : 0;
  const next = AUTO_DROPS[idx];
  if (!categoryOf(l, next.categoryId)) return;
  startDrop(l, next.categoryId, next.hours, now, next.title);
}
