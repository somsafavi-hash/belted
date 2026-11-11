import { describe, expect, it } from 'vitest';
import { handle, type Req } from './handler';
import { MemoryStore } from './memoryStore';
import { QUESTIONS } from '../src/engine/trivia';
import type { League } from '../src/engine/types';
import { DAY } from '../src/engine/util';

const T0 = new Date(2026, 10, 11, 12).getTime();

type Body = Record<string, any>;
async function call(store: MemoryStore, method: string, path: string, body?: unknown, token?: string, now = T0) {
  const req: Req = { method, path, headers: token ? { authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined };
  const res = await handle(req, store, now);
  return { status: res.status, body: res.body as Body };
}

async function setup() {
  const store = new MemoryStore();
  const a = await call(store, 'POST', '/leagues', { name: 'Som', leagueName: 'The Boys' });
  expect(a.status).toBe(201);
  const leagueId = a.body.leagueId as string;
  const tokA = `${a.body.playerId}:${a.body.secret}`;
  const b = await call(store, 'POST', `/leagues/${leagueId}/join`, { name: 'Marco' });
  expect(b.status).toBe(201);
  const tokB = `${b.body.playerId}:${b.body.secret}`;
  return { store, leagueId, a: { id: a.body.playerId as string, tok: tokA }, b: { id: b.body.playerId as string, tok: tokB } };
}

describe('API', () => {
  it('creates a league, previews and joins it, and hides secrets', async () => {
    const { store, leagueId, a } = await setup();
    const p = await call(store, 'GET', `/leagues/${leagueId}/preview`);
    expect(p.body).toEqual({ name: 'The Boys', members: ['Som', 'Marco'] });
    const s = await call(store, 'GET', `/leagues/${leagueId}`, undefined, a.tok);
    const l = s.body.league as League;
    expect(l.meId).toBe(a.id);
    expect(l.members).toHaveLength(2);
    expect(JSON.stringify(s.body)).not.toContain('auth');
  });

  it('rejects missing or wrong sign-in', async () => {
    const { store, leagueId, a } = await setup();
    expect((await call(store, 'GET', `/leagues/${leagueId}`)).status).toBe(401);
    const wrong = `${a.id}:${'0'.repeat(64)}`;
    expect((await call(store, 'GET', `/leagues/${leagueId}`, undefined, wrong)).status).toBe(401);
  });

  it('refuses duplicate names', async () => {
    const { store, leagueId } = await setup();
    const r = await call(store, 'POST', `/leagues/${leagueId}/join`, { name: 'marco' });
    expect(r.status).toBe(400);
  });

  it('two players: receipt with uploaded proof, vote, and points', async () => {
    const { store, leagueId, a, b } = await setup();
    const up = await call(store, 'POST', `/leagues/${leagueId}/uploads`, { contentType: 'image/jpeg' }, a.tok);
    expect(up.status).toBe(200);
    const mediaId = up.body.mediaId as string;
    // Proof that never got uploaded is refused.
    const early = await call(store, 'POST', `/leagues/${leagueId}/actions`, { type: 'receipt.create', categoryId: 'water', value: 1, mediaId, mediaType: 'photo' }, a.tok);
    expect(early.status).toBe(400);
    store.media.set(`${leagueId}/${mediaId}`, { type: 'image/jpeg', data: Buffer.from('x') });
    const r = await call(store, 'POST', `/leagues/${leagueId}/actions`, { type: 'receipt.create', categoryId: 'water', value: 1, mediaId, mediaType: 'photo' }, a.tok);
    expect(r.status).toBe(200);
    const receiptId = r.body.result.receiptId as string;
    expect(r.body.mediaUrls[mediaId]).toContain(mediaId);

    // A can't vote on their own; B can.
    expect((await call(store, 'POST', `/leagues/${leagueId}/actions`, { type: 'receipt.vote', receiptId, verdict: 'legit' }, a.tok)).status).toBe(400);
    const v = await call(store, 'POST', `/leagues/${leagueId}/actions`, { type: 'receipt.vote', receiptId, verdict: 'legit' }, b.tok);
    const l = v.body.league as League;
    expect(l.receipts.find((x) => x.id === receiptId)!.status).toBe('legit');
    expect(l.ratings.some((e) => e.memberId === a.id && e.reason === 'receipt')).toBe(true);
  });

  it('cannot use someone else’s upload as proof', async () => {
    const { store, leagueId, a, b } = await setup();
    const up = await call(store, 'POST', `/leagues/${leagueId}/uploads`, { contentType: 'image/jpeg' }, a.tok);
    store.media.set(`${leagueId}/${up.body.mediaId}`, { type: 'image/jpeg', data: Buffer.from('x') });
    const r = await call(store, 'POST', `/leagues/${leagueId}/actions`, { type: 'receipt.create', categoryId: 'water', value: 1, mediaId: up.body.mediaId, mediaType: 'photo' }, b.tok);
    expect(r.status).toBe(400);
  });

  it('trivia duel between two real players is scored on the server', async () => {
    const { store, leagueId, a, b } = await setup();
    const c = await call(store, 'POST', `/leagues/${leagueId}/actions`, { type: 'duel.create', opponentId: b.id, template: 'trivia', stakes: 25 }, a.tok);
    const duelId = c.body.result.duelId as string;
    // Only the opponent can answer it.
    expect((await call(store, 'POST', `/leagues/${leagueId}/actions`, { type: 'duel.respond', duelId, accept: true }, a.tok)).status).toBe(400);
    const acc = await call(store, 'POST', `/leagues/${leagueId}/actions`, { type: 'duel.respond', duelId, accept: true }, b.tok);
    const qids = (acc.body.league as League).duels.find((d) => d.id === duelId)!.trivia!.questionIds;
    await call(store, 'POST', `/leagues/${leagueId}/actions`, { type: 'duel.trivia', duelId, answers: qids.map((q) => QUESTIONS[q].c) }, a.tok);
    const done = await call(store, 'POST', `/leagues/${leagueId}/actions`, { type: 'duel.trivia', duelId, answers: [-1, -1, -1, -1, -1] }, b.tok);
    const d = (done.body.league as League).duels.find((x) => x.id === duelId)!;
    expect(d.status).toBe('settled');
    expect(d.winnerId).toBe(a.id);
  });

  it('blocks are private to the player who blocked', async () => {
    const { store, leagueId, a, b } = await setup();
    await call(store, 'POST', `/leagues/${leagueId}/actions`, { type: 'member.block', memberId: b.id }, a.tok);
    const sa = await call(store, 'GET', `/leagues/${leagueId}`, undefined, a.tok);
    const sb = await call(store, 'GET', `/leagues/${leagueId}`, undefined, b.tok);
    expect((sa.body.league as League).blocked).toEqual([b.id]);
    expect((sb.body.league as League).blocked).toEqual([]);
  });

  it('the clock runs on read: unanswered duels expire', async () => {
    const { store, leagueId, a, b } = await setup();
    const c = await call(store, 'POST', `/leagues/${leagueId}/actions`, { type: 'duel.create', opponentId: b.id, template: 'hoops', stakes: 10 }, a.tok);
    const later = await call(store, 'GET', `/leagues/${leagueId}`, undefined, a.tok, T0 + 2 * DAY);
    expect((later.body.league as League).duels.find((d) => d.id === c.body.result.duelId)!.status).toBe('expired');
  });

  it('leaving deletes your receipts, media and sign-in', async () => {
    const { store, leagueId, a } = await setup();
    const up = await call(store, 'POST', `/leagues/${leagueId}/uploads`, { contentType: 'video/mp4' }, a.tok);
    store.media.set(`${leagueId}/${up.body.mediaId}`, { type: 'video/mp4', data: Buffer.from('x') });
    await call(store, 'POST', `/leagues/${leagueId}/actions`, { type: 'receipt.create', categoryId: 'gym-pr', value: 225, mediaId: up.body.mediaId, mediaType: 'video' }, a.tok);
    expect((await call(store, 'POST', `/leagues/${leagueId}/leave`, {}, a.tok)).status).toBe(200);
    expect(store.media.size).toBe(0);
    expect((await call(store, 'GET', `/leagues/${leagueId}`, undefined, a.tok)).status).toBe(401);
  });

  it('only photos and videos can be uploaded', async () => {
    const { store, leagueId, a } = await setup();
    expect((await call(store, 'POST', `/leagues/${leagueId}/uploads`, { contentType: 'text/html' }, a.tok)).status).toBe(400);
  });
});
