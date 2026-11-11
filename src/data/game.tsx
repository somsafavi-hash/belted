import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { League } from '../engine/types';
import { tick } from '../engine/sim';
import { clearMedia, loadLeague, loadOffset, saveLeague, saveOffset } from './store';

interface Game {
  league?: League;
  now: number;
  /** Runs a rule change on a copy of the league. Returns an error message if a rule said no. */
  act: (fn: (l: League, now: number) => void) => string | undefined;
  start: (l: League) => void;
  skip: (ms: number) => void;
  reset: () => Promise<void>;
  toast: (msg: string) => void;
  toastMsg?: string;
}

const Ctx = createContext<Game | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [offset, setOffset] = useState(loadOffset);
  const [league, setLeague] = useState<League | undefined>(loadLeague);
  const [now, setNow] = useState(() => Date.now() + offset);
  const [toastMsg, setToastMsg] = useState<string>();
  const leagueRef = useRef(league);
  leagueRef.current = league;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  const commit = useCallback((l: League | undefined) => {
    leagueRef.current = l;
    setLeague(l);
    saveLeague(l);
  }, []);

  const act = useCallback<Game['act']>((fn) => {
    const cur = leagueRef.current;
    if (!cur) return 'No league yet.';
    const t = Date.now() + offsetRef.current;
    const copy = structuredClone(cur);
    try {
      fn(copy, t);
      tick(copy, t);
    } catch (e) {
      return e instanceof Error ? e.message : 'Something went wrong.';
    }
    commit(copy);
    setNow(t);
    return undefined;
  }, [commit]);

  // The clock: every few seconds the league catches up (votes land, duels get answered).
  useEffect(() => {
    const run = () => {
      const t = Date.now() + offsetRef.current;
      setNow(t);
      if (leagueRef.current) act(() => {});
    };
    run();
    const id = setInterval(run, 3000);
    const vis = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [act]);

  const toastTimer = useRef<number>();
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(undefined), 3200);
  }, []);

  const value = useMemo<Game>(() => ({
    league,
    now,
    act,
    toast,
    toastMsg,
    start: (l) => commit(l),
    skip: (ms) => {
      const next = offsetRef.current + ms;
      offsetRef.current = next;
      setOffset(next);
      saveOffset(next);
      act(() => {});
    },
    reset: async () => {
      commit(undefined);
      offsetRef.current = 0;
      setOffset(0);
      saveOffset(0);
      await clearMedia();
    },
  }), [league, now, act, toast, toastMsg, commit]);

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
