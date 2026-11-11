import { useState } from 'react';
import { useLeague } from '../data/game';
import { inviteLink } from '../data/api';

export function InviteCard({ compact }: { compact?: boolean }) {
  const { league, toast } = useLeague();
  const [copied, setCopied] = useState(false);
  const link = inviteLink(league.id);

  async function share() {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: `Join ${league.name} on Belted`, text: `Join ${league.name} on Belted. Pics or it didn’t happen.`, url: link });
        return;
      } catch { /* cancelled, fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast('Invite link copied. Paste it in the group chat.');
    } catch {
      toast('Copy the link below and paste it in the group chat.');
    }
  }

  return (
    <section className={`card invite ${compact ? 'compact' : ''}`}>
      <b>Get the group chat in here</b>
      <p className="muted small">Anyone with this link can join {league.name}. {league.members.length < 4 ? 'The monthly Major needs at least 4 people.' : ''}</p>
      <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
      <button className="btn" onClick={share}>{copied ? 'Copied ✓' : '📲 Share invite link'}</button>
    </section>
  );
}
