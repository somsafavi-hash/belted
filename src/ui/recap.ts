import type { League } from '../engine/types';
import { rating, standings, tier } from '../engine/rating';
import { categoryOf, nameOf } from '../engine/feed';
import { fmtValue } from '../engine/receipts';
import { DAY } from '../engine/util';

/** Draws the weekly recap as a 1080×1350 image for the group chat. */
export async function recapImage(l: League, now: number): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#2a2208');
  g.addColorStop(0.45, '#1a2638');
  g.addColorStop(1, '#121b2b');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  const weekAgo = now - 7 * DAY;
  const rows = standings(l, now);
  const week = l.receipts.filter((r) => r.createdAt >= weekAgo);
  const pr = week.filter((r) => r.categoryId === 'gym-pr' && r.status !== 'cap').sort((a, b) => b.value - a.value)[0];
  const caps = week.filter((r) => r.status === 'cap');
  const duels = l.duels.filter((d) => d.status === 'settled' && !d.major && (d.settledAt ?? 0) >= weekAgo);
  const ducks = l.duels.filter((d) => (d.status === 'ducked' || d.status === 'expired') && (d.settledAt ?? 0) >= weekAgo);
  const beltChanges = l.feed.filter((f) => f.at >= weekAgo && f.text.includes('took the'));
  const me = l.meId;
  const myPos = rows.findIndex((r) => r.memberId === me) + 1;

  x.fillStyle = '#f2b632';
  x.font = '800 44px system-ui, sans-serif';
  x.fillText('BELTED', 80, 120);
  x.fillStyle = '#8c9bb3';
  x.font = '500 34px system-ui, sans-serif';
  x.fillText(`${l.name} · weekly recap`, 80, 172);

  x.fillStyle = '#eef2f8';
  x.font = '800 92px system-ui, sans-serif';
  x.fillText(`👑 ${nameOf(l, rows[0].memberId)}`, 80, 320);
  x.font = '500 36px system-ui, sans-serif';
  x.fillStyle = '#8c9bb3';
  x.fillText(`on top at ${rows[0].rating.toLocaleString()} (${tier(rows[0].rating)})`, 84, 374);

  const lines: [string, string][] = [
    ['🏅', `You: #${myPos} of ${rows.length}, ${rating(l, me).toLocaleString()} rating`],
    ['💪', pr ? `Biggest PR: ${nameOf(l, pr.memberId)}, ${fmtValue(pr.value, categoryOf(l, pr.categoryId)?.unit)}` : 'Biggest PR: nobody lifted. Concerning.'],
    ['🧢', caps.length ? `Cap of the week: ${nameOf(l, caps[0].memberId)}’s ${categoryOf(l, caps[0].categoryId)?.name.toLowerCase()}` : 'Cap of the week: nobody got caught'],
    ['⚔️', `${duels.length} duels settled`],
    ['🐔', ducks.length ? `Ducked: ${[...new Set(ducks.map((d) => nameOf(l, d.opponentId)))].join(', ')}` : 'Nobody ducked. Respect.'],
    ['🥇', beltChanges.length ? `${beltChanges.length} belt${beltChanges.length > 1 ? 's' : ''} changed hands` : 'Every belt held'],
  ];
  let y = 500;
  for (const [ico, t] of lines) {
    x.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(x, 70, y - 64, W - 140, 104, 24);
    x.fill();
    x.fillStyle = '#eef2f8';
    x.font = '48px system-ui, sans-serif';
    x.fillText(ico, 100, y + 4);
    x.fillStyle = '#eef2f8';
    x.font = '600 38px system-ui, sans-serif';
    x.fillText(clip(x, t, W - 300), 180, y);
    y += 128;
  }
  x.fillStyle = '#8c9bb3';
  x.font = '500 30px system-ui, sans-serif';
  x.fillText('Pics or it didn’t happen.', 80, H - 70);

  return new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/png'));
}

function roundRect(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + w, Y, X + w, Y + h, r);
  x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r);
  x.arcTo(X, Y, X + w, Y, r);
  x.closePath();
}

function clip(x: CanvasRenderingContext2D, t: string, max: number): string {
  if (x.measureText(t).width <= max) return t;
  let s = t;
  while (s.length > 4 && x.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s + '…';
}
