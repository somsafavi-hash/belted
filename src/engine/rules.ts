import type { League } from './types';
import { settleDueReceipts } from './receipts';
import { expireDuels } from './duels';
import { autoDrop, settleDrops } from './drops';
import { payBelts } from './belts';
import { advanceMajor, ensureSeason, majorWindowOpen, startMajor } from './season';
import type { Rng } from './util';

/**
 * Everything that happens on a clock rather than because someone tapped:
 * votes closing, duels expiring, Drops, belt pay, the monthly reset and the
 * Major. The server runs this before every read and write.
 */
export function rulesTick(l: League, now: number, rng: Rng = Math.random): void {
  settleDueReceipts(l, now);
  expireDuels(l, now);
  settleDrops(l, now);
  autoDrop(l, now);
  payBelts(l, now);
  ensureSeason(l, now, rng);
  if (majorWindowOpen(now)) startMajor(l, now, rng);
  advanceMajor(l, now, rng);
  l.lastTick = now;
}
