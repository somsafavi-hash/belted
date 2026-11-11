import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { League } from '../engine/types';
import type { Action, ActionResult } from '../engine/actions';
import { applyAction } from '../engine/actions';
import { onAcceptTrivia, onMyDuel, onMyReceipt, onMyReport, tick } from '../engine/sim';
import { uid } from '../engine/util';
import { clearMedia, loadLeague, loadOffset, putMedia, saveLeague, saveOffset } from './store';
import { ApiError, api, type LeagueView, type Session } from './api';

export type Mode = 'demo' | 'online';

export interface RunResult {
  error?: string;
  result?: ActionResult;
}

interface Game {
  mode?: Mode;
  league?: League;
  now: number;
  session?: Session;
  /** Sends a player action. Demo: applied on this phone. Online: checked and applied by the server. */
  run: (a: Action) => Promise<RunResult>;
  /** Saves a photo or video and returns its id for a receipt. */
  saveProof: (blob: Blob) => Promise<{ mediaId?: string; error?: string }>;
  /** Online media is reached by signed link; demo media lives in this phone's storage. */
  onlineMediaUrl: (mediaId: string) => string | undefined;
  startDemo: (l: League) => void;
  startOnline: (s: Session, v: LeagueView) => void;
  skip: (ms: number) => void;
  /** Demo: wipe. Online: leave the league and delete my receipts and proof. */
  reset: () => Promise<string | undefined>;
  toast: (msg: string) => void;
  toastMsg?: string;
  offline: boolean;
}

const Ctx = createContext<Game | null>(null);
const SESSION_KEY = 'belted:session:v1';
const ONLINE_CACHE = 'belted:online-cache:v1';

function loadSession(): Session | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : undefined;
  } catch {
    return undefined;
  }
}
function saveSession(s?: Session) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(ONLINE_CACHE); }
  } catch { /* ignore */ }
}
function loadCache(): LeagueView | undefined {
  try {
    const raw = localStorage.getItem(ONLINE_CACHE);
    return raw ? (JSON.parse(raw) as LeagueView) : undefined;
  } catch {
    return undefined;
  }
}

/** Demo-mode friends react to what you do. */
function demoFollowUp(l: League, a: Action, r: ActionResult, now: number) {
  if (a.type === 'receipt.create' && r.receiptId) onMyReceipt(l, r.receiptId, now);
  const d = r.duelId ? l.duels.find((x) => x.id === r.duelId) : undefined;
  if (a.type === 'duel.create' && d) onMyDuel(l, d, now);
  if (a.type === 'duel.respond' && a.accept && d) onAcceptTrivia(l, d);
  if (a.type === 'duel.report' && d) onMyReport(l, d, now);
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | undefined>(loadSession);
  const [offset, setOffset] = useState(loadOffset);
  const [demo, setDemo] = useState<League | undefined>(() => (loadSession() ? undefined : loadLeague()));
  const [online, setOnline] = useState<LeagueView | undefined>(() => (loadSession() ? loadCache() : undefined));
  const [now, setNow] = useState(() => Date.now());
  const [toastMsg, setToastMsg] = useState<string>();
  const [offline, setOffline] = useState(false);

  const mode: Mode | undefined = session ? 'online' : demo ? 'demo' : undefined;
  const demoRef = useRef(demo);
  demoRef.current = demo;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const toastTimer = useRef<number>();
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(undefined), 3200);
  }, []);

  const commitDemo = useCallback((l: League | undefined) => {
    demoRef.current = l;
    setDemo(l);
    saveLeague(l);
  }, []);

  const setView = useCallback((v: LeagueView) => {
    setOnline(v);
    setOffline(false);
    try { localStorage.setItem(ONLINE_CACHE, JSON.stringify(v)); } catch { /* full */ }
  }, []);

  const signedOut = useCallback(() => {
    saveSession(undefined);
    sessionRef.current = undefined;
    setSession(undefined);
    setOnline(undefined);
    toast('You’re no longer in that league. Start a new one or open an invite link.');
  }, [toast]);

  const demoNow = () => Date.now() + offsetRef.current;

  const runDemo = useCallback((fn: (l: League, t: number) => ActionResult | void): RunResult => {
    const cur = demoRef.current;
    if (!cur) return { error: 'No league yet.' };
    const t = Date.now() + offsetRef.current;
    const copy = structuredClone(cur);
    let result: ActionResult | void;
    try {
      result = fn(copy, t);
      tick(copy, t);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Something went wrong.' };
    }
    commitDemo(copy);
    setNow(t);
    return { result: result || {} };
  }, [commitDemo]);

  const refresh = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    try {
      setView(await api.state(s));
    } catch (e) {
      // 401: removed or left. 404: the league is gone. Either way this phone isn't in it anymore.
      if (e instanceof ApiError && (e.status === 401 || e.status === 404)) signedOut();
      else setOffline(true);
    }
  }, [setView, signedOut]);

  // The clock. Demo: friends act and rules run on this phone. Online: fetch the latest from the server.
  useEffect(() => {
    const run = () => {
      if (sessionRef.current) {
        setNow(Date.now());
        if (document.visibilityState === 'visible') void refresh();
      } else {
        setNow(demoNow());
        if (demoRef.current) runDemo(() => {});
      }
    };
    run();
    const id = setInterval(run, sessionRef.current ? 5000 : 3000);
    const vis = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, runDemo, refresh]);

  const run = useCallback<Game['run']>(async (a) => {
    const s = sessionRef.current;
    if (!s) {
      const me = demoRef.current?.meId ?? '';
      return runDemo((l, t) => {
        const r = applyAction(l, me, a, t);
        demoFollowUp(l, a, r, t);
        return r;
      });
    }
    try {
      const out = await api.act(s, a);
      setView(out);
      return { result: out.result };
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) signedOut();
      return { error: e instanceof Error ? e.message : 'Something went wrong.' };
    }
  }, [runDemo, setView, signedOut]);

  const saveProof = useCallback<Game['saveProof']>(async (blob) => {
    const s = sessionRef.current;
    if (!s) {
      const mediaId = uid();
      await putMedia(mediaId, blob);
      return { mediaId };
    }
    try {
      return { mediaId: await api.upload(s, blob) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Upload failed.' };
    }
  }, []);

  const league = session ? online?.league : demo;
  const value = useMemo<Game>(() => ({
    mode,
    league,
    now: session ? now : now,
    session,
    run,
    saveProof,
    onlineMediaUrl: (id) => online?.mediaUrls[id],
    startDemo: (l) => {
      saveSession(undefined);
      setSession(undefined);
      commitDemo(l);
    },
    startOnline: (s, v) => {
      saveSession(s);
      sessionRef.current = s;
      setSession(s);
      setView(v);
      setNow(Date.now());
    },
    skip: (ms) => {
      if (sessionRef.current) return;
      const next = offsetRef.current + ms;
      offsetRef.current = next;
      setOffset(next);
      saveOffset(next);
      runDemo(() => {});
    },
    reset: async () => {
      const s = sessionRef.current;
      if (s) {
        try {
          await api.leave(s);
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 401)) return e instanceof Error ? e.message : 'Couldn’t reach the server.';
        }
        saveSession(undefined);
        sessionRef.current = undefined;
        setSession(undefined);
        setOnline(undefined);
        return undefined;
      }
      commitDemo(undefined);
      offsetRef.current = 0;
      setOffset(0);
      saveOffset(0);
      await clearMedia();
      return undefined;
    },
    toast,
    toastMsg,
    offline,
  }), [mode, league, now, session, run, saveProof, online, commitDemo, setView, runDemo, toast, toastMsg, offline]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame(): Game {
  const g = useContext(Ctx);
  if (!g) throw new Error('useGame outside GameProvider');
  return g;
}

/** For screens that only render inside a league. */
export function useLeague() {
  const g = useGame();
  if (!g.league) throw new Error('No league');
  return { ...g, league: g.league, me: g.league.meId };
}
