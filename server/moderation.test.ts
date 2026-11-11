import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { handle } from './handler';
import { MemoryStore } from './memoryStore';
import type { League } from '../src/engine/types';

const T0 = new Date(2026, 10, 11, 12).getTime();
const ADMIN = 'test-admin-key';
const opts = { adminKeyHash: createHash('sha256').update(ADMIN).digest('hex') };
type Body = Record<string, any>;

async function call(store: MemoryStore, method: string, path: string, body?: unknown, token?: string, extra: Record<string, string> = {}) {
  const res = await handle({ method, path, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined }, store, T0, opts);
  return { status: res.status, body: res.body as Body };
}

/** Owner + two members, and the owner... no: member A posts a receipt with proof. */
async function setup() {
  const store = new MemoryStore();
  const o = await call(store, 'POST', '/leagues', { name: 'Owner', leagueName: 'Mods' });
  const id = o.body.leagueId as string;
  const tok = (b: Body) => `${b.playerId}:${b.secret}`;
  const owner = { id: o.body.playerId as string, tok: tok(o.body) };
  const ja = await call(store, 'POST', `/leagues/${id}/join`, { name: 'Poster' });
  const jb = await call(store, 'POST', `/leagues/${id}/join`, { name: 'Reporter1' });
  const jc = await call(store, 'POST', `/leagues/${id}/join`, { name: 'Reporter2' });
  const a = { id: ja.body.playerId as string, tok: tok(ja.body) };
  const b = { id: jb.body.playerId as string, tok: tok(jb.body) };
  const c = { id: jc.body.playerId as string, tok: tok(jc.body) };
  const up = await call(store, 'POST', `/leagues/${id}/uploads`, { contentType: 'image/jpeg' }, a.tok);
  store.media.set(`${id}/${up.body.mediaId}`, { type: 'image/jpeg', data: Buffer.from('x') });
  const r = await call(store, 'POST', `/leagues/${id}/actions`, { type: 'receipt.create', categoryId: 'water', value: 2, mediaId: up.body.mediaId, mediaType: 'photo' }, a.tok);
  return { store, id, owner, a, b, c, receiptId: r.body.result.receiptId as string };
}
const act = (s: Awaited<ReturnType<typeof setup>>, tok: string, body: unknown) => call(s.store, 'POST', `/leagues/${s.id}/actions`, body, tok);
const state = async (s: Awaited<ReturnType<typeof setup>>, tok: string) => (await call(s.store, 'GET', `/leagues/${s.id}`, undefined, tok)).body.league as League;

describe('moderation', () => {
  it('owner sees the report but not who made it; others see no reports', async () => {
    const s = await setup();
    await act(s, s.b.tok, { type: 'receipt.report', receiptId: s.receiptId, reason: 'Inappropriate' });
    const ownerView = await state(s, s.owner.tok);
    expect(ownerView.reports).toHaveLength(1);
    expect(JSON.stringify(ownerView.reports)).not.toContain(s.b.id);
    expect((await state(s, s.c.tok)).reports).toHaveLength(0);
    // Reporter no longer sees it; everyone else still does after one report.
    expect((await state(s, s.b.tok)).hiddenReceipts).toContain(s.receiptId);
    expect((await state(s, s.c.tok)).receipts.some((r) => r.id === s.receiptId)).toBe(true);
  });

  it('two reports hide it from the league until reviewed, but not from its author or the owner', async () => {
    const s = await setup();
    await act(s, s.b.tok, { type: 'receipt.report', receiptId: s.receiptId, reason: 'Fake' });
    await act(s, s.b.tok, { type: 'receipt.report', receiptId: s.receiptId, reason: 'Fake again' }); // same person: no double count
    expect((await state(s, s.owner.tok)).reports).toHaveLength(1);
    await act(s, s.c.tok, { type: 'receipt.report', receiptId: s.receiptId, reason: 'Inappropriate' });
    expect((await state(s, s.c.tok)).receipts.some((r) => r.id === s.receiptId)).toBe(false);
    expect((await state(s, s.a.tok)).receipts.find((r) => r.id === s.receiptId)?.flagged).toBe(true);
    expect((await state(s, s.owner.tok)).receipts.some((r) => r.id === s.receiptId)).toBe(true);
  });

  it('only the owner can moderate', async () => {
    const s = await setup();
    expect((await act(s, s.b.tok, { type: 'mod.remove', receiptId: s.receiptId })).status).toBe(400);
    expect((await act(s, s.b.tok, { type: 'mod.kick', memberId: s.a.id })).status).toBe(400);
  });

  it('owner removes a receipt: proof deleted, points reversed, report closed', async () => {
    const s = await setup();
    await act(s, s.b.tok, { type: 'receipt.vote', receiptId: s.receiptId, verdict: 'legit' });
    await act(s, s.c.tok, { type: 'receipt.vote', receiptId: s.receiptId, verdict: 'legit' });
    await act(s, s.owner.tok, { type: 'receipt.vote', receiptId: s.receiptId, verdict: 'legit' });
    await act(s, s.b.tok, { type: 'receipt.report', receiptId: s.receiptId, reason: 'Inappropriate' });
    expect(s.store.markers.has(s.id)).toBe(true);
    const r = await act(s, s.owner.tok, { type: 'mod.remove', receiptId: s.receiptId });
    expect(r.status).toBe(200);
    const l = r.body.league as League;
    expect(l.receipts.some((x) => x.id === s.receiptId)).toBe(false);
    expect(l.reports).toHaveLength(0);
    expect(s.store.media.size).toBe(0);
    expect(s.store.markers.has(s.id)).toBe(false);
    const net = l.ratings.filter((e) => e.memberId === s.a.id && e.refId === s.receiptId).reduce((t, e) => t + e.delta, 0);
    expect(net).toBe(0);
  });

  it('owner keeps a reported receipt', async () => {
    const s = await setup();
    await act(s, s.b.tok, { type: 'receipt.report', receiptId: s.receiptId, reason: 'Fake' });
    await act(s, s.c.tok, { type: 'receipt.report', receiptId: s.receiptId, reason: 'Fake' });
    const reportId = (await state(s, s.owner.tok)).reports[0].id;
    await act(s, s.owner.tok, { type: 'mod.dismiss', reportId });
    expect((await state(s, s.c.tok)).receipts.some((x) => x.id === s.receiptId)).toBe(true);
    expect((await state(s, s.owner.tok)).reports).toHaveLength(0);
  });

  it('owner removes a member: signed out, proof gone, out of standings', async () => {
    const s = await setup();
    const r = await act(s, s.owner.tok, { type: 'mod.kick', memberId: s.a.id });
    expect(r.status).toBe(200);
    expect((await call(s.store, 'GET', `/leagues/${s.id}`, undefined, s.a.tok)).status).toBe(401);
    expect(s.store.media.size).toBe(0);
    const l = r.body.league as League;
    expect(l.members.find((m) => m.id === s.a.id)?.left).toBe(true);
    // Removed people can't be challenged.
    expect((await act(s, s.b.tok, { type: 'duel.create', opponentId: s.a.id, template: 'trivia', stakes: 10 })).status).toBe(400);
  });

  it('Belted admin queue lists reports across leagues and can act on them', async () => {
    const s = await setup();
    expect((await call(s.store, 'GET', '/admin/reports')).status).toBe(401);
    expect((await call(s.store, 'GET', '/admin/reports', undefined, undefined, { 'x-admin-key': 'wrong' })).status).toBe(401);
    await act(s, s.b.tok, { type: 'receipt.report', receiptId: s.receiptId, reason: 'Nudity' });
    const q = await call(s.store, 'GET', '/admin/reports', undefined, undefined, { 'x-admin-key': ADMIN });
    expect(q.body.items).toHaveLength(1);
    expect(q.body.items[0]).toMatchObject({ leagueName: 'Mods', memberName: 'Poster', reasons: ['Nudity'] });
    expect(q.body.items[0].mediaUrl).toBeTruthy();
    const done = await call(s.store, 'POST', `/admin/leagues/${s.id}/moderate`, { type: 'remove', receiptId: s.receiptId }, undefined, { 'x-admin-key': ADMIN });
    expect(done.status).toBe(200);
    expect((await call(s.store, 'GET', '/admin/reports', undefined, undefined, { 'x-admin-key': ADMIN })).body.items).toHaveLength(0);
    expect(s.store.media.size).toBe(0);
  });
});
