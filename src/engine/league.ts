import type { Category, League, Member } from './types';
import { ensureBelts } from './belts';
import { addRating } from './rating';
import { createReceipt } from './receipts';
import { createDuel } from './duels';
import { autoDrop } from './drops';
import { ensureSeason } from './season';
import { post } from './feed';
import { DAY, HOUR, MIN, Rng, uid } from './util';

export const PRESET_CATEGORIES: Category[] = [
  { id: 'gym-pr', name: 'Gym PR', icon: '🏋️', unit: 'lb', proof: 'video', preset: true, loggable: true, typical: [135, 315] },
  { id: 'workout', name: 'Workout', icon: '💪', unit: 'min', proof: 'photo', preset: true, loggable: true, typical: [30, 90] },
  { id: 'water', name: 'Water', icon: '💧', unit: 'L', proof: 'photo', preset: true, loggable: true, typical: [0.5, 1.2] },
  { id: 'reading', name: 'Reading', icon: '📚', unit: 'pages', proof: 'photo', preset: true, loggable: true, typical: [10, 50] },
  { id: 'run', name: 'Run', icon: '🏃', unit: 'mi', proof: 'photo', preset: true, loggable: true, typical: [1, 6] },
  { id: 'steps', name: 'Steps', icon: '👟', unit: 'steps', proof: 'photo', preset: true, loggable: true, typical: [6000, 15000] },
  { id: 'trivia', name: 'Trivia', icon: '🧠', unit: 'pts', proof: 'confirm', preset: true, loggable: false, typical: [0, 5] },
];

export const MEMBER_COLORS = ['#f2b632', '#6aa8ff', '#3ecf8e', '#ff9f6b', '#c49bff', '#8fd3ff', '#ff7aa8', '#b8e05a'];

const BOTS: Omit<Member, 'id' | 'color' | 'isBot'>[] = [
  { name: 'Marco', skill: 0.8, honesty: 0.95 },
  { name: 'Dre', skill: 0.7, honesty: 0.9 },
  { name: 'Jay', skill: 0.6, honesty: 0.85 },
  { name: 'Tyler', skill: 0.5, honesty: 0.55 },
  { name: 'Nate', skill: 0.4, honesty: 0.8 },
];

export function addCustomCategory(
  l: League,
  input: { name: string; icon: string; unit: string; proof: 'photo' | 'video' },
): Category {
  const name = input.name.trim();
  if (!name) throw new Error('Give the category a name.');
  if (l.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new Error('That category already exists.');
  if (BLOCKED_WORDS.some((w) => name.toLowerCase().includes(w))) {
    throw new Error('Belted doesn’t allow alcohol, drug, weapon or dangerous categories.');
  }
  const c: Category = {
    id: uid(), name, icon: input.icon.trim() || '✨', unit: input.unit.trim() || 'pts',
    proof: input.proof, preset: false, loggable: true, typical: [1, 10],
  };
  l.categories.push(c);
  ensureBelts(l);
  return c;
}

export const BLOCKED_WORDS = ['beer', 'shot', 'drunk', 'drink', 'alcohol', 'vodka', 'weed', 'vape', 'gun', 'knife', 'pill', 'chug', 'fight'];

/**
 * A new league in demo mode: you plus five made-up friends with a little
 * history, so every screen has something on it from the first second.
 */
export function createDemoLeague(leagueName: string, myName: string, now: number, rng: Rng = Math.random): League {
  const me: Member = { id: uid(), name: myName.trim() || 'You', color: MEMBER_COLORS[0], isBot: false, skill: 0.6, honesty: 1 };
  const bots: Member[] = BOTS.map((b, i) => ({ ...b, id: uid(), color: MEMBER_COLORS[i + 1], isBot: true }));
  const l: League = {
    id: uid(), name: leagueName.trim() || 'The Boys', createdAt: now, meId: me.id, ownerId: me.id,
    members: [me, ...bots], categories: PRESET_CATEGORIES.map((c) => ({ ...c })),
    receipts: [], duels: [], belts: [], drops: [], ratings: [], feed: [], seasons: [], scheduled: [],
    reports: [], hiddenReceipts: [], blocked: [], lastTick: now,
  };
  ensureBelts(l);
  ensureSeason(l, now, rng);

  // Starting spread so the standings aren't a six-way tie.
  const spread = [0, 140, 95, 60, 20, -30];
  l.members.forEach((m, i) => {
    if (spread[i]) addRating(l, { memberId: m.id, delta: spread[i], reason: 'seed', at: now - 14 * DAY, label: 'Starting rating' });
  });

  // Belts start with the bots, so there's something to take.
  const holders: Record<string, string> = { trivia: bots[0].id, 'gym-pr': bots[1].id, run: bots[2].id, workout: bots[3].id, reading: bots[4].id, water: bots[0].id };
  for (const b of l.belts) {
    const h = holders[b.categoryId];
    if (h) { b.holderId = h; b.wonAt = now - Math.floor(rng() * 10 + 2) * DAY; b.lastPaidAt = now - 2 * DAY; b.defenses = Math.floor(rng() * 4); }
  }

  // A few recent receipts from the bots, still open for your vote.
  const recent: [number, string, number, number][] = [
    [1, 'gym-pr', 245, 38 * MIN],
    [2, 'run', 3.1, 3 * HOUR],
    [3, 'reading', 42, 5 * HOUR],
    [0, 'water', 1, 7 * HOUR],
  ];
  for (const [bi, cat, value, ago] of recent) {
    const r = createReceipt(l, { memberId: bots[bi].id, categoryId: cat, value, suspicious: bots[bi].honesty < 0.6 }, now - ago);
    for (const voter of bots) {
      if (voter.id === r.memberId || rng() < 0.4) continue;
      r.votes[voter.id] = r.suspicious && rng() < 0.7 ? 'cap' : 'legit';
    }
  }

  post(l, now - 2 * DAY, '🥇', `${bots[0].name} took the Trivia Belt from ${bots[3].name}, 5–3.`);
  post(l, now - DAY, '🐔', `${bots[4].name} ducked ${bots[1].name}’s push-up duel.`);
  post(l, now, '👋', `${me.name} started ${l.name}. Post a receipt or call someone out.`);

  // Jay already wants smoke.
  createDuel(l, { challengerId: bots[2].id, opponentId: me.id, type: 'trivia', title: 'Trivia', categoryId: 'trivia', stakes: 25, extra: 'Loser buys coffee' }, now - 2 * HOUR, rng);

  autoDrop(l, now);
  return l;
}

/** A real league: starts with just its creator. Everyone else joins by link. */
export function createOnlineLeague(id: string, leagueName: string, owner: Member, now: number, rng: Rng = Math.random): League {
  const l: League = {
    id, name: leagueName.trim().slice(0, 28) || 'The Boys', createdAt: now, meId: '', ownerId: owner.id,
    members: [owner], categories: PRESET_CATEGORIES.map((c) => ({ ...c })),
    receipts: [], duels: [], belts: [], drops: [], ratings: [], feed: [], seasons: [], scheduled: [],
    reports: [], hiddenReceipts: [], blocked: [], lastTick: now,
  };
  ensureBelts(l);
  ensureSeason(l, now, rng);
  post(l, now, '👋', `${owner.name} started ${l.name}. Drop the invite link in the group chat.`);
  autoDrop(l, now);
  return l;
}

export function newMember(l: League | undefined, id: string, rawName: string): Member {
  const name = rawName.trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!name) throw new Error('Pick a name.');
  if (l?.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) throw new Error(`Someone in this league is already called ${name}.`);
  if (l && l.members.filter((m) => !m.left).length >= 30) throw new Error('This league is full (30 people).');
  const color = MEMBER_COLORS[(l?.members.length ?? 0) % MEMBER_COLORS.length];
  return { id, name, color, isBot: false, skill: 0.5, honesty: 1 };
}
