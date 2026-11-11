import { describe, expect, it } from 'vitest';
import { createDemoLeague, addCustomCategory } from '../src/engine/league';
import { BASE_RATING, duelSwing, rating, tier, monthPoints } from '../src/engine/rating';
import { castVote, createReceipt, settleDueReceipts, RECEIPT_POINTS, CAP_PENALTY, FALSE_CAP_PENALTY } from '../src/engine/receipts';
import { confirmResult, createDuel, expireDuels, reportResult, respondDuel, submitTrivia, DUCK_PENALTY } from '../src/engine/duels';
import { activeDrop, dropTotals, settleDrops, startDrop } from '../src/engine/drops';
import { advanceMajor, ensureSeason, startMajor } from '../src/engine/season';
import { QUESTIONS } from '../src/engine/trivia';
import { tick } from '../src/engine/sim';
import { DAY, HOUR, monthKey, seeded } from '../src/engine/util';
import type { League } from '../src/engine/types';

const T0 = new Date(2026, 10, 11, 12, 0, 0).getTime(); // Nov 11 2026, noon

function fresh(): League {
  const l = createDemoLeague('Test League', 'Som', T0, seeded(1));
  l.receipts = [];
  l.duels = [];
  l.scheduled = [];
  return l;
}
const ids = (l: League) => l.members.map((m) => m.id);

describe('ratings', () => {
  it('tiers by threshold', () => {
    expect(tier(1200)).toBe('Bronze');
    expect(tier(1250)).toBe('Silver');
    expect(tier(1360)).toBe('Gold');
    expect(tier(1450)).toBe('Diamond');
    expect(tier(1600)).toBe('Legend');
  });

  it('even duel moves full stakes, mismatch moves less, never more than stakes', () => {
    expect(duelSwing(1300, 1300, 25)).toBe(25);
    expect(duelSwing(1600, 1200, 25)).toBeLessThan(10);
    expect(duelSwing(1200, 1600, 25)).toBe(25);
    expect(duelSwing(1200, 1200, 0)).toBe(0);
  });
});

describe('receipts', () => {
  it('needs proof for photo and video categories', () => {
    const l = fresh();
    expect(() => createReceipt(l, { memberId: l.meId, categoryId: 'water', value: 1 }, T0)).toThrow(/proof/);
  });

  it('majority legit scores once per category per day, false cap calls cost the voter', () => {
    const l = fresh();
    const [me, a, b, c, d, e] = ids(l);
    const before = rating(l, me);
    const r1 = createReceipt(l, { memberId: me, categoryId: 'water', value: 1, mediaId: 'm1', mediaType: 'photo' }, T0);
    castVote(l, r1.id, a, 'legit', T0);
    castVote(l, r1.id, b, 'legit', T0);
    castVote(l, r1.id, c, 'cap', T0);
    castVote(l, r1.id, d, 'legit', T0);
    castVote(l, r1.id, e, 'legit', T0);
    expect(r1.status).toBe('legit');
    expect(rating(l, me)).toBe(before + RECEIPT_POINTS);
    expect(l.ratings.some((x) => x.memberId === c && x.reason === 'false_cap' && x.delta === -FALSE_CAP_PENALTY)).toBe(true);

    const r2 = createReceipt(l, { memberId: me, categoryId: 'water', value: 1, mediaId: 'm2', mediaType: 'photo' }, T0 + HOUR);
    settleDueReceipts(l, T0 + 2 * DAY);
    expect(r2.status).toBe('legit');
    expect(r2.scored).toBe(false);
    expect(rating(l, me)).toBe(before + RECEIPT_POINTS);
  });

  it('a cap ruling takes points away', () => {
    const l = fresh();
    const [me, a, b] = ids(l);
    const before = rating(l, me);
    const r = createReceipt(l, { memberId: me, categoryId: 'gym-pr', value: 500, mediaId: 'v', mediaType: 'video' }, T0);
    castVote(l, r.id, a, 'cap', T0);
    castVote(l, r.id, b, 'cap', T0);
    settleDueReceipts(l, T0 + DAY + 1);
    expect(r.status).toBe('cap');
    expect(rating(l, me)).toBe(before - CAP_PENALTY);
  });

  it('you cannot vote on your own receipt', () => {
    const l = fresh();
    const r = createReceipt(l, { memberId: l.meId, categoryId: 'water', value: 1, mediaId: 'm', mediaType: 'photo' }, T0);
    expect(() => castVote(l, r.id, l.meId, 'legit', T0)).toThrow();
  });
});

describe('duels', () => {
  it('trivia is scored by the app and moves rating both ways', () => {
    const l = fresh();
    const [me, a] = ids(l);
    const d = createDuel(l, { challengerId: me, opponentId: a, type: 'trivia', title: 'Trivia', categoryId: 'trivia', stakes: 25 }, T0, seeded(2));
    respondDuel(l, d.id, true, T0);
    const right = d.trivia!.questionIds.map((q) => QUESTIONS[q].c);
    const wrong = right.map((x) => (x + 1) % 4);
    const rMe = rating(l, me);
    const rA = rating(l, a);
    submitTrivia(l, d.id, me, right, T0);
    submitTrivia(l, d.id, a, wrong, T0);
    expect(d.status).toBe('settled');
    expect(d.winnerId).toBe(me);
    expect(rating(l, me) - rMe).toBe(d.swing);
    expect(rating(l, a) - rA).toBe(-d.swing!);
  });

  it('winning against the belt holder takes the belt', () => {
    const l = fresh();
    const me = l.meId;
    const belt = l.belts.find((b) => b.categoryId === 'gym-pr')!;
    const holder = belt.holderId!;
    const d = createDuel(l, { challengerId: me, opponentId: holder, type: 'measured', title: 'Max lift', categoryId: 'gym-pr', stakes: 25 }, T0);
    expect(d.forBelt).toBe(true);
    respondDuel(l, d.id, true, T0);
    reportResult(l, d.id, me, me, '', T0);
    expect(() => confirmResult(l, d.id, me, T0)).toThrow(/other side/);
    confirmResult(l, d.id, holder, T0);
    expect(belt.holderId).toBe(me);
  });

  it('ducking or ignoring costs the opponent', () => {
    const l = fresh();
    const [me, a, b] = ids(l);
    const d1 = createDuel(l, { challengerId: me, opponentId: a, type: 'irl', title: '1v1 hoops', stakes: 10 }, T0);
    const ra = rating(l, a);
    respondDuel(l, d1.id, false, T0);
    expect(rating(l, a)).toBe(ra - DUCK_PENALTY);
    const d2 = createDuel(l, { challengerId: me, opponentId: b, type: 'irl', title: '1v1 hoops', stakes: 10 }, T0);
    expireDuels(l, T0 + DAY + 1);
    expect(d2.status).toBe('expired');
  });

  it('one open duel per pair', () => {
    const l = fresh();
    const [me, a] = ids(l);
    createDuel(l, { challengerId: me, opponentId: a, type: 'irl', title: 'x', stakes: 10 }, T0);
    expect(() => createDuel(l, { challengerId: a, opponentId: me, type: 'irl', title: 'y', stakes: 10 }, T0)).toThrow(/already/);
  });
});

describe('drops', () => {
  it('sums values in the window and pays the top three', () => {
    const l = fresh();
    l.drops = [];
    const [me, a, b] = ids(l);
    const drop = startDrop(l, 'water', 48, T0);
    expect(activeDrop(l, T0 + HOUR)?.id).toBe(drop.id);
    createReceipt(l, { memberId: me, categoryId: 'water', value: 3, mediaId: 'x', mediaType: 'photo' }, T0 + HOUR);
    createReceipt(l, { memberId: a, categoryId: 'water', value: 2, mediaId: 'x', mediaType: 'photo' }, T0 + HOUR);
    createReceipt(l, { memberId: b, categoryId: 'water', value: 1, mediaId: 'x', mediaType: 'photo' }, T0 + HOUR);
    createReceipt(l, { memberId: b, categoryId: 'water', value: 9, mediaId: 'x', mediaType: 'photo' }, T0 + 50 * HOUR); // after it ends
    expect(dropTotals(l, drop)[0]).toEqual({ memberId: me, total: 3 });
    settleDrops(l, T0 + 48 * HOUR);
    expect(drop.settled).toBe(true);
    expect(l.ratings.filter((r) => r.reason === 'drop').map((r) => r.delta)).toEqual([30, 20, 10]);
    expect(l.belts.find((x) => x.categoryId === 'water')!.holderId).toBe(me);
  });
});

describe('season and Major', () => {
  it('monthly reset moves ratings 25% toward base', () => {
    const l = fresh();
    const marco = ids(l)[1];
    const r = rating(l, marco);
    const next = new Date(2026, 11, 1, 9).getTime();
    ensureSeason(l, next);
    expect(rating(l, marco)).toBe(r - Math.round((r - BASE_RATING) * 0.25));
  });

  it('bracket runs to a champion who gets the bonus', () => {
    const l = fresh();
    const rng = seeded(3);
    const t = new Date(2026, 10, 29, 10).getTime();
    startMajor(l, t, rng);
    const mj = l.seasons.find((s) => s.month === monthKey(t))!.major!;
    expect(mj.seeds).toHaveLength(4);
    // Play out any match I'm in by answering everything right.
    for (let i = 0; i < 3; i++) {
      for (const d of l.duels.filter((x) => x.major && x.status === 'accepted')) {
        submitTrivia(l, d.id, l.meId, d.trivia!.questionIds.map((q) => QUESTIONS[q].c), t);
      }
      advanceMajor(l, t, rng);
    }
    expect(mj.done).toBe(true);
    expect(l.ratings.some((r) => r.reason === 'major' && r.memberId === mj.championId)).toBe(true);
  });
});

describe('custom categories', () => {
  it('blocks drinking categories', () => {
    const l = fresh();
    expect(() => addCustomCategory(l, { name: 'Beer mile', icon: '🍺', unit: 'cans', proof: 'video' })).toThrow();
    const c = addCustomCategory(l, { name: 'Cold plunge', icon: '🧊', unit: 'min', proof: 'video' });
    expect(l.belts.some((b) => b.categoryId === c.id)).toBe(true);
  });
});

describe('simulation', () => {
  it('a week of bot activity keeps the league consistent', () => {
    const l = createDemoLeague('Sim', 'Som', T0, seeded(9));
    const rng = seeded(10);
    for (let h = 1; h <= 7 * 24; h++) tick(l, T0 + h * HOUR, rng);
    expect(l.receipts.length).toBeGreaterThan(20);
    expect(l.receipts.filter((r) => r.status !== 'open').every((r) => r.closesAt <= T0 + 7 * DAY + 1 || Object.keys(r.votes).length === 5)).toBe(true);
    expect(l.drops.some((d) => d.settled)).toBe(true);
    // The ledger always explains the rating.
    for (const m of l.members) {
      const sum = l.ratings.filter((r) => r.memberId === m.id).reduce((s, r) => s + r.delta, BASE_RATING);
      expect(rating(l, m.id)).toBe(Math.round(sum));
    }
    expect(monthPoints(l, l.members[1].id, monthKey(T0))).not.toBeNaN();
    // No event lands in the future.
    expect(l.feed.every((f) => f.at <= T0 + 7 * DAY)).toBe(true);
  });
});
