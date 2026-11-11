import { useEffect, useRef, useState } from 'react';
import { useGame } from '../data/game';
import { createDemoLeague } from '../engine/league';
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
  const { league, toastMsg, now } = useGame();
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

  if (!league) return <Onboarding />;

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

function Onboarding() {
  const { start } = useGame();
  const [name, setName] = useState('');
  const [leagueName, setLeagueName] = useState('The Boys');
  return (
    <div className="onboard">
      <div className="brand xl">Belted<i>.</i></div>
      <h1>Fantasy league for real life.</h1>
      <p className="muted">Lifting, reading, water, runs, trivia. Every flex needs a receipt, and your league votes legit or cap. Take belts, win the monthly Major, and don’t finish last.</p>
      <form className="card sec" onSubmit={(e) => { e.preventDefault(); if (name.trim()) start(createDemoLeague(leagueName, name, Date.now())); }}>
        <label className="label" htmlFor="nm">Your name</label>
        <input id="nm" autoComplete="given-name" placeholder="Som" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
        <label className="label" htmlFor="lg">League name</label>
        <input id="lg" placeholder="The Boys" value={leagueName} maxLength={28} onChange={(e) => setLeagueName(e.target.value)} />
        <button className="btn" type="submit" disabled={!name.trim()}>Start the league</button>
      </form>
      <div className="card demo-note">
        <b>Demo mode</b>
        <p className="muted small">You’ll get 5 made-up friends who post, vote and challenge you on their own, so you can try everything on one phone. Real leagues with your actual friends come with the next version. Everything stays on this device.</p>
      </div>
      <p className="muted small">Tip: on iPhone, tap Share → Add to Home Screen to use it like an app.</p>
    </div>
  );
}
