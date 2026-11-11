import { useEffect, useRef, useState } from 'react';
import { useGame } from '../data/game';
import { createDemoLeague } from '../engine/league';
import { ONLINE_AVAILABLE, api } from '../data/api';
import { Home } from './Home';
import { Log } from './Log';
import { Duels, type ChallengePrefill } from './Duels';
import { Major } from './Major';
import { Me } from './Me';

const TABS = ['league', 'duels', 'log', 'major', 'me'] as const;
type Tab = (typeof TABS)[number];

function tabFromHash(): Tab {
  const h = location.hash.replace('#', '');
  return (TABS as readonly string[]).includes(h) ? (h as Tab) : 'league';
}

export function App() {
  const { league, toastMsg, now, offline, session } = useGame();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [prefill, setPrefill] = useState<ChallengePrefill>();
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    const on = () => setTab(tabFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (t: string) => {
    if ((TABS as readonly string[]).includes(t)) {
      history.replaceState(null, '', `#${t}`);
      setTab(t as Tab);
      main.current?.scrollTo({ top: 0 });
    }
  };

  if (!league) {
    return session ? <div className="onboard"><div className="brand xl">Belted<i>.</i></div><p className="muted">Loading your league…</p></div> : <Onboarding />;
  }

  const incoming = league.duels.filter((d) => d.status === 'sent' && d.opponentId === league.meId).length
    + league.duels.filter((d) => d.status === 'reported' && d.reportedBy !== league.meId && (d.challengerId === league.meId || d.opponentId === league.meId)).length;
  const toVote = league.receipts.filter((r) => r.status === 'open' && r.memberId !== league.meId && !r.votes[league.meId] && !league.hiddenReceipts.includes(r.id) && !league.blocked.includes(r.memberId)).length;
  const myMajor = league.duels.some((d) => d.major && d.status === 'accepted' && (d.challengerId === league.meId || d.opponentId === league.meId) && !d.trivia?.answers[league.meId]);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">Belted<i>.</i></div>
        <div className="league-pill">{league.name} · {league.members.length}</div>
      </header>
      {offline && <div className="offline">Can’t reach the server. Showing the last thing we saw.</div>}
      <main className="screen" ref={main} key={tab}>
        {tab === 'league' && <Home go={go} />}
        {tab === 'duels' && <Duels prefill={prefill} clearPrefill={() => setPrefill(undefined)} />}
        {tab === 'log' && <Log done={() => go('league')} />}
        {tab === 'major' && <Major />}
        {tab === 'me' && <Me />}
      </main>
      <nav className="tabs" aria-label="Main">
        <TabBtn t="league" cur={tab} go={go} icon="🏆" label="League" badge={toVote} />
        <TabBtn t="duels" cur={tab} go={go} icon="⚔️" label="Duels" badge={incoming} />
        <button className={`tab plus ${tab === 'log' ? 'on' : ''}`} onClick={() => go('log')} aria-label="Log a receipt"><span className="ti">+</span></button>
        <TabBtn t="major" cur={tab} go={go} icon="👑" label="Major" badge={myMajor ? 1 : 0} />
        <TabBtn t="me" cur={tab} go={go} icon="👤" label="Me" />
      </nav>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      <span hidden>{now}</span>
    </div>
  );
}

function TabBtn({ t, cur, go, icon, label, badge }: { t: Tab; cur: Tab; go: (t: string) => void; icon: string; label: string; badge?: number }) {
  return (
    <button className={`tab ${cur === t ? 'on' : ''}`} onClick={() => go(t)} aria-current={cur === t ? 'page' : undefined}>
      <span className="ti">{icon}{badge ? <span className="badge dot">{badge}</span> : null}</span>
      {label}
    </button>
  );
}

function joinIdFromHash(): string | undefined {
  const m = /^#join-([a-z0-9]{12,40})$/.exec(location.hash);
  return m?.[1];
}

function Onboarding() {
  const { startDemo, startOnline, toast } = useGame();
  const [joinId, setJoinId] = useState(joinIdFromHash);
  const [name, setName] = useState('');
  const [leagueName, setLeagueName] = useState('The Boys');
  const [preview, setPreview] = useState<{ name: string; members: string[] }>();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const on = () => setJoinId(joinIdFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    if (!joinId || !ONLINE_AVAILABLE) return;
    setErr(undefined);
    api.preview(joinId).then(setPreview).catch((e) => setErr(e instanceof Error ? e.message : 'Couldn’t load that league.'));
  }, [joinId]);

  async function go(fn: () => Promise<void>) {
    setBusy(true);
    setErr(undefined);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.'); }
    setBusy(false);
  }

  const create = () => go(async () => {
    const r = await api.create(name, leagueName);
    history.replaceState(null, '', '#league');
    startOnline({ leagueId: r.leagueId, playerId: r.playerId, secret: r.secret }, r);
    toast('League started. Invite your friends from the Me tab.');
  });
  const join = () => go(async () => {
    const r = await api.join(joinId!, name);
    history.replaceState(null, '', '#league');
    startOnline({ leagueId: r.leagueId, playerId: r.playerId, secret: r.secret }, r);
    toast(`You’re in ${r.league.name}. Post a receipt or call someone out.`);
  });
  const demo = () => { if (name.trim()) startDemo(createDemoLeague(leagueName, name, Date.now())); };

  if (joinId) {
    return (
      <div className="onboard">
        <div className="brand xl">Belted<i>.</i></div>
        {!ONLINE_AVAILABLE ? <p className="muted">This build can’t reach the server.</p> : preview ? (
          <>
            <h1>Join {preview.name}</h1>
            <p className="muted">{preview.members.join(', ')} {preview.members.length === 1 ? 'is' : 'are'} already in. Every flex needs a receipt, and the league votes legit or cap.</p>
            <form className="card sec" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void join(); }}>
              <label className="label" htmlFor="nm">Your name in the league</label>
              <input id="nm" autoComplete="given-name" placeholder="What the group chat calls you" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
              {err && <p className="err">{err}</p>}
              <button className="btn" type="submit" disabled={!name.trim() || busy}>{busy ? 'Joining…' : 'Join the league'}</button>
            </form>
            <p className="muted small">No password. This phone remembers you. By joining you agree to keep it clean: no nudity, no hate, nothing dangerous. Reported proof gets removed.</p>
          </>
        ) : err ? (
          <>
            <h1>Link doesn’t work</h1>
            <p className="muted">{err}</p>
            <button className="btn ghost" onClick={() => { history.replaceState(null, '', '#'); setJoinId(undefined); }}>Start my own league</button>
          </>
        ) : <p className="muted">Loading the league…</p>}
      </div>
    );
  }

  return (
    <div className="onboard">
      <div className="brand xl">Belted<i>.</i></div>
      <h1>Fantasy league for real life.</h1>
      <p className="muted">Lifting, reading, water, runs, trivia. Every flex needs a receipt, and your league votes legit or cap. Take belts, win the monthly Major, and don’t finish last.</p>
      <form className="card sec" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void (ONLINE_AVAILABLE ? create() : demo()); }}>
        <label className="label" htmlFor="nm">Your name</label>
        <input id="nm" autoComplete="given-name" placeholder="Som" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
        <label className="label" htmlFor="lg">League name</label>
        <input id="lg" placeholder="The Boys" value={leagueName} maxLength={28} onChange={(e) => setLeagueName(e.target.value)} />
        {err && <p className="err">{err}</p>}
        {ONLINE_AVAILABLE && <button className="btn" type="submit" disabled={!name.trim() || busy}>{busy ? 'Starting…' : 'Start a league with friends'}</button>}
        <button className={`btn ${ONLINE_AVAILABLE ? 'ghost' : ''}`} type={ONLINE_AVAILABLE ? 'button' : 'submit'} disabled={!name.trim() || busy} onClick={ONLINE_AVAILABLE ? demo : undefined}>Try it solo with 5 made-up friends</button>
      </form>
      <p className="muted small">{ONLINE_AVAILABLE ? 'Starting a league gives you an invite link for the group chat. No passwords: this phone remembers you.' : 'Demo mode: everything stays on this phone.'}</p>
      <p className="muted small">Tip: on iPhone, tap Share → Add to Home Screen to use it like an app.</p>
    </div>
  );
}
