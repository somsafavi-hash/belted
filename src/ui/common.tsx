import { useEffect, useState, type ReactNode } from 'react';
import type { League } from '../engine/types';
import { tier } from '../engine/rating';
import { mediaUrl } from '../data/store';
import { DAY, HOUR, MIN } from '../engine/util';

export function Avatar({ league, id, size = 34 }: { league: League; id: string; size?: number }) {
  const m = league.members.find((x) => x.id === id);
  const label = id === league.meId ? 'ME' : (m?.name[0] ?? '?');
  return (
    <div className="av" style={{ background: m?.color ?? '#888', width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {label}
    </div>
  );
}

export function TierPill({ r }: { r: number }) {
  const t = tier(r);
  return <span className={`tier t-${t.toLowerCase()}`}>{t}</span>;
}

export function ago(ms: number): string {
  if (ms < MIN) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  return `${Math.floor(ms / DAY)}d ago`;
}

export function left(ms: number): string {
  if (ms <= 0) return 'now';
  if (ms < HOUR) return `${Math.max(1, Math.ceil(ms / MIN))}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MIN)}m`;
  return `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h`;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Media({ id, type, className }: { id: string; type: 'photo' | 'video'; className?: string }) {
  const [url, setUrl] = useState<string>();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    mediaUrl(id).then((u) => { if (!live) return; if (u) setUrl(u); else setMissing(true); });
    return () => { live = false; };
  }, [id]);
  if (missing) return <div className={`thumb ${className ?? ''}`}><span className="muted">Proof not on this device</span></div>;
  if (!url) return <div className={`thumb ${className ?? ''}`} />;
  return type === 'video'
    ? <video className={`media ${className ?? ''}`} src={url} controls playsInline preload="metadata" />
    : <img className={`media ${className ?? ''}`} src={url} alt="Proof" />;
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <b>{title}</b>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}
