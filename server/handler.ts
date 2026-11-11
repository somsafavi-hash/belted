// The Belted API. Plain request in, plain response out, so it runs the same in
// AWS Lambda, in the local dev server and in tests.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { League } from '../src/engine/types';
import type { Action } from '../src/engine/actions';
import { applyAction } from '../src/engine/actions';
import { createOnlineLeague, newMember } from '../src/engine/league';
import { rulesTick } from '../src/engine/rules';
import { categoryOf, nameOf, post } from '../src/engine/feed';
import { dismissReport, openReports, removeMember, removeReceipt } from '../src/engine/moderation';
import { fmtValue } from '../src/engine/receipts';
import type { LeagueDoc, Store } from './store';

export interface Req {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: string;
}
export interface Res {
  status: number;
  body: unknown;
}

const ID = /^[a-z0-9]{12,40}$/;
const id = (bytes = 9) => randomBytes(bytes).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 16).padEnd(12, '0');
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function parse(body?: string): Record<string, unknown> {
  if (!body) return {};
  if (body.length > 20_000) throw new HttpError(413, 'Request too big.');
  try {
    const v = JSON.parse(body);
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw new HttpError(400, 'Bad JSON.');
  }
}

/** What one player is allowed to see. */
async function view(store: Store, doc: LeagueDoc, playerId: string) {
  const owner = doc.league.ownerId === playerId;
  const l: League = {
    ...doc.league,
    meId: playerId,
    hiddenReceipts: doc.prefs[playerId]?.hidden ?? [],
    blocked: doc.prefs[playerId]?.blocked ?? [],
    // The owner sees open reports to review, never who made them.
    reports: owner ? openReports(doc.league).map(({ reporterId: _r, ...rep }) => rep) : [],
    scheduled: [],
    // Removed receipts are gone for everyone. Ones under review stay visible only to their author and the owner.
    receipts: doc.league.receipts
      .filter((r) => !r.removed && (!r.flagged || owner || r.memberId === playerId))
      .map(({ suspicious: _s, ...r }) => r),
  };
  const mediaUrls: Record<string, string> = {};
  await Promise.all(
    l.receipts.filter((r) => r.mediaId).map(async (r) => { mediaUrls[r.mediaId!] = await store.mediaUrl(l.id, r.mediaId!); }),
  );
  return { league: l, mediaUrls };
}

function auth(doc: LeagueDoc, header?: string): string {
  const m = /^Bearer ([a-z0-9]+):([a-f0-9]{64})$/.exec(header ?? '');
  if (!m) throw new HttpError(401, 'Sign in again: open your league link.');
  const [, playerId, secret] = m;
  const h = doc.auth[playerId];
  if (!h || h !== hash(secret)) throw new HttpError(401, 'This phone isn’t signed in to that league.');
  return playerId;
}

/** Load, run the clock, change, save; retried if two phones write at once. */
async function mutate<T>(store: Store, leagueId: string, now: number, fn: (doc: LeagueDoc) => T | Promise<T>): Promise<{ doc: LeagueDoc; out: T }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const got = await store.get(leagueId);
    if (!got) throw new HttpError(404, 'That league doesn’t exist. Check the link.');
    const doc = structuredClone(got.doc);
    rulesTick(doc.league, now);
    const out = await fn(doc);
    if (await store.put(leagueId, doc, got.etag)) return { doc, out };
  }
  throw new HttpError(409, 'Busy. Try again.');
}

export interface Options {
  /** sha256 of the Belted admin key. Admin routes are off when unset. */
  adminKeyHash?: string;
}

/** Keeps the admin queue's marker in step with the league's open reports. */
async function syncMarker(store: Store, doc: LeagueDoc) {
  await store.setReportMarker(doc.league.id, openReports(doc.league).length > 0);
}

export async function handle(req: Req, store: Store, now = Date.now(), opts: Options = {}): Promise<Res> {
  try {
    return await route(req, store, now, opts);
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
    if (e instanceof Error && !(e instanceof TypeError) && !(e instanceof ReferenceError)) {
      // Rule errors from the engine are messages meant for the player.
      return { status: 400, body: { error: e.message } };
    }
    console.error(e);
    return { status: 500, body: { error: 'Something broke on our side.' } };
  }
}

async function route(req: Req, store: Store, now: number, opts: Options): Promise<Res> {
  const parts = req.path.replace(/^\/+|\/+$/g, '').split('/');
  const method = req.method.toUpperCase();
  const authz = req.headers.authorization ?? req.headers.Authorization;

  if (parts[0] === 'health') return { status: 200, body: { ok: true } };
  if (parts[0] === 'admin') return admin(req, parts, method, store, now, opts);
  if (parts[0] !== 'leagues') throw new HttpError(404, 'Not found.');

  // POST /leagues  → start a league
  if (parts.length === 1 && method === 'POST') {
    const b = parse(req.body);
    const leagueId = id(12);
    const playerId = id();
    const secret = randomBytes(32).toString('hex');
    const owner = newMember(undefined, playerId, String(b.name ?? ''));
    const league = createOnlineLeague(leagueId, String(b.leagueName ?? ''), owner, now);
    const doc: LeagueDoc = { v: 1, league, auth: { [playerId]: hash(secret) }, prefs: {} };
    if (!(await store.put(leagueId, doc, null))) throw new HttpError(409, 'Try again.');
    return { status: 201, body: { leagueId, playerId, secret, ...(await view(store, doc, playerId)) } };
  }

  const leagueId = parts[1];
  if (!ID.test(leagueId ?? '')) throw new HttpError(404, 'That league doesn’t exist. Check the link.');
  const sub = parts[2];

  // GET /leagues/:id/preview → name and members, for the join screen
  if (sub === 'preview' && method === 'GET') {
    const got = await store.get(leagueId);
    if (!got) throw new HttpError(404, 'That league doesn’t exist. Check the link.');
    const l = got.doc.league;
    return { status: 200, body: { name: l.name, members: l.members.filter((m) => !m.name.startsWith('Deleted')).map((m) => m.name) } };
  }

  // POST /leagues/:id/join → become a member
  if (sub === 'join' && method === 'POST') {
    const b = parse(req.body);
    const playerId = id();
    const secret = randomBytes(32).toString('hex');
    const { doc } = await mutate(store, leagueId, now, (d) => {
      const m = newMember(d.league, playerId, String(b.name ?? ''));
      d.league.members.push(m);
      d.auth[playerId] = hash(secret);
      post(d.league, now, '👋', `${m.name} joined ${d.league.name}.`);
    });
    return { status: 201, body: { leagueId, playerId, secret, ...(await view(store, doc, playerId)) } };
  }

  // Everything else needs a signed-in player.
  if (!sub && method === 'GET') {
    const got = await store.get(leagueId);
    if (!got) throw new HttpError(404, 'That league doesn’t exist. Check the link.');
    const playerId = auth(got.doc, authz);
    const doc = structuredClone(got.doc);
    const before = doc.league.lastTick;
    rulesTick(doc.league, now);
    // Save what the clock changed; if someone else wrote first, theirs wins and the next read catches up.
    if (doc.league.lastTick !== before) await store.put(leagueId, doc, got.etag);
    return { status: 200, body: await view(store, doc, playerId) };
  }

  if (sub === 'actions' && method === 'POST') {
    const action = parse(req.body) as unknown as Action;
    if (typeof action.type !== 'string') throw new HttpError(400, 'Missing action.');
    let playerId = '';
    const { doc, out } = await mutate(store, leagueId, now, async (d) => {
      playerId = auth(d, authz);
      if (action.type === 'receipt.create' && action.mediaId) {
        if (!action.mediaId.startsWith(`${playerId}_`) || !(await store.mediaExists(leagueId, action.mediaId))) {
          throw new HttpError(400, 'Your proof didn’t finish uploading. Try again.');
        }
      }
      // Hides and blocks are per player: load theirs into the league, apply, store them back.
      const prefs = d.prefs[playerId] ?? { hidden: [], blocked: [] };
      d.league.hiddenReceipts = prefs.hidden;
      d.league.blocked = prefs.blocked;
      const result = applyAction(d.league, playerId, action, now);
      d.prefs[playerId] = { hidden: d.league.hiddenReceipts, blocked: d.league.blocked };
      d.league.hiddenReceipts = [];
      d.league.blocked = [];
      if (action.type === 'mod.kick') { delete d.auth[action.memberId]; delete d.prefs[action.memberId]; }
      return result;
    });
    if (out.deleteMedia?.length) await store.deleteMedia(leagueId, out.deleteMedia);
    if (action.type === 'receipt.report' || action.type.startsWith('mod.')) await syncMarker(store, doc);
    const { deleteMedia: _d, ...result } = out;
    return { status: 200, body: { result, ...(await view(store, doc, playerId)) } };
  }

  // POST /leagues/:id/uploads → where to send a photo or video
  if (sub === 'uploads' && method === 'POST') {
    const got = await store.get(leagueId);
    if (!got) throw new HttpError(404, 'That league doesn’t exist.');
    const playerId = auth(got.doc, authz);
    const b = parse(req.body);
    const type = String(b.contentType ?? '');
    if (!/^(image\/(jpeg|png|webp)|video\/(mp4|webm|quicktime))(;.*)?$/.test(type)) throw new HttpError(400, 'Photos and videos only.');
    const mediaId = `${playerId}_${id()}`;
    return { status: 200, body: { mediaId, upload: await store.uploadTarget(leagueId, mediaId, type.split(';')[0]) } };
  }

  // POST /leagues/:id/leave → delete my data
  if (sub === 'leave' && method === 'POST') {
    let mine: string[] = [];
    const { doc } = await mutate(store, leagueId, now, (d) => {
      const playerId = auth(d, authz);
      mine = removeMember(d.league, playerId, now, 'left');
      delete d.auth[playerId];
      delete d.prefs[playerId];
      // Reports they made stay (the receipts still need review); reports on their receipts close.
      for (const rep of d.league.reports) {
        if (!d.league.receipts.some((r) => r.id === rep.receiptId) && (rep.status ?? 'open') === 'open') rep.status = 'dismissed';
      }
    });
    await store.deleteMedia(leagueId, mine);
    await syncMarker(store, doc);
    return { status: 200, body: { ok: true } };
  }

  throw new HttpError(404, 'Not found.');
}

// ---- Belted admin: every league's open reports, and the power to act on them ----

function adminAuth(req: Req, opts: Options) {
  const key = req.headers['x-admin-key'] ?? req.headers['X-Admin-Key'];
  if (!opts.adminKeyHash || !key) throw new HttpError(401, 'Admin key required.');
  const a = Buffer.from(hash(key), 'hex');
  const b = Buffer.from(opts.adminKeyHash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Wrong admin key.');
}

async function admin(req: Req, parts: string[], method: string, store: Store, now: number, opts: Options): Promise<Res> {
  adminAuth(req, opts);

  // GET /admin/reports → every open report, grouped by receipt
  if (parts[1] === 'reports' && method === 'GET') {
    const items = [];
    for (const leagueId of await store.listReportMarkers()) {
      const got = await store.get(leagueId);
      if (!got) { await store.setReportMarker(leagueId, false); continue; }
      const l = got.doc.league;
      const byReceipt = new Map<string, ReturnType<typeof openReports>>();
      for (const rep of openReports(l)) byReceipt.set(rep.receiptId, [...(byReceipt.get(rep.receiptId) ?? []), rep]);
      for (const [receiptId, reps] of byReceipt) {
        const r = l.receipts.find((x) => x.id === receiptId);
        if (!r) continue;
        const cat = categoryOf(l, r.categoryId);
        items.push({
          leagueId, leagueName: l.name, receiptId, reportId: reps[0].id,
          reasons: reps.map((x) => x.reason), firstReportedAt: Math.min(...reps.map((x) => x.at)),
          memberId: r.memberId, memberName: nameOf(l, r.memberId),
          what: `${cat?.icon ?? ''} ${cat?.name ?? ''} · ${fmtValue(r.value, cat?.unit)}`, note: r.note,
          flagged: !!r.flagged, mediaType: r.mediaType,
          mediaUrl: r.mediaId ? await store.mediaUrl(leagueId, r.mediaId) : undefined,
          postedAt: r.createdAt,
        });
      }
    }
    items.sort((a, b) => a.firstReportedAt - b.firstReportedAt);
    return { status: 200, body: { items } };
  }

  // POST /admin/leagues/:id/moderate {type: remove|dismiss|kick, receiptId|reportId|memberId}
  if (parts[1] === 'leagues' && parts[3] === 'moderate' && method === 'POST') {
    const leagueId = parts[2];
    if (!ID.test(leagueId ?? '')) throw new HttpError(404, 'No such league.');
    const b = parse(req.body);
    let media: string[] = [];
    const { doc } = await mutate(store, leagueId, now, (d) => {
      if (b.type === 'remove') {
        const m = removeReceipt(d.league, String(b.receiptId), 'belted', now);
        media = m ? [m] : [];
      } else if (b.type === 'dismiss') {
        dismissReport(d.league, String(b.reportId), 'belted', now);
      } else if (b.type === 'kick') {
        const id = String(b.memberId);
        media = removeMember(d.league, id, now, 'removed');
        delete d.auth[id];
        delete d.prefs[id];
        for (const rep of d.league.reports) {
          if (!d.league.receipts.some((r) => r.id === rep.receiptId) && (rep.status ?? 'open') === 'open') {
            rep.status = 'removed'; rep.resolvedAt = now; rep.resolvedBy = 'belted';
          }
        }
      } else {
        throw new HttpError(400, 'Unknown moderation action.');
      }
    });
    await store.deleteMedia(leagueId, media);
    await syncMarker(store, doc);
    return { status: 200, body: { ok: true } };
  }

  throw new HttpError(404, 'Not found.');
}
