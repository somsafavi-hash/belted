// Shapes of everything in a league. Kept free of UI and storage so the same
// rules can later run on a server (see docs/MVP-SCOPE.md, "Data model").

export type ProofKind = 'photo' | 'video' | 'confirm';
export type Verdict = 'legit' | 'cap';

export interface Member {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  /** 0..1, how good a bot is at things (trivia accuracy, lift size). */
  skill: number;
  /** 0..1, chance a bot's receipt is honest. */
  honesty: number;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  unit: string;
  proof: ProofKind;
  preset: boolean;
  /** False for categories that only exist for duels and belts (trivia). */
  loggable: boolean;
  /** Typical value of one receipt, used for bots and input hints. */
  typical: [number, number];
}

export interface Receipt {
  id: string;
  memberId: string;
  categoryId: string;
  value: number;
  note?: string;
  mediaId?: string;
  mediaType?: 'photo' | 'video';
  createdAt: number;
  closesAt: number;
  votes: Record<string, Verdict>;
  status: 'open' | 'legit' | 'cap';
  /** True when this receipt earned the daily points for its category. */
  scored: boolean;
  /** Simulation only: a bot inflated this one. Never shown in the UI. */
  suspicious?: boolean;
}

export type DuelType = 'trivia' | 'measured' | 'irl';
export type DuelStatus = 'sent' | 'accepted' | 'reported' | 'ducked' | 'expired' | 'settled';

export interface Duel {
  id: string;
  challengerId: string;
  opponentId: string;
  type: DuelType;
  categoryId?: string;
  title: string;
  stakes: number;
  extra?: string;
  status: DuelStatus;
  createdAt: number;
  expiresAt: number;
  settledAt?: number;
  /** Undefined winner on a settled duel means a draw. */
  winnerId?: string;
  swing?: number;
  scores?: Record<string, number>;
  reportedBy?: string;
  reportNote?: string;
  trivia?: { questionIds: number[]; answers: Record<string, number[]> };
  /** Major bracket match: no rating swing, no belts. */
  major?: boolean;
  forBelt?: boolean;
}

export interface Belt {
  id: string;
  categoryId: string;
  holderId?: string;
  wonAt?: number;
  lastPaidAt?: number;
  defenses: number;
}

export interface Drop {
  id: string;
  categoryId: string;
  title: string;
  startsAt: number;
  endsAt: number;
  settled: boolean;
  results?: { memberId: string; total: number }[];
}

export type RatingReason =
  | 'receipt' | 'cap' | 'false_cap' | 'duel' | 'duck' | 'drop' | 'belt' | 'major' | 'reset' | 'seed';

export interface RatingEvent {
  id: string;
  memberId: string;
  /** Omitted for events that only move the overall rating (resets). */
  categoryId?: string;
  delta: number;
  reason: RatingReason;
  refId?: string;
  at: number;
  label: string;
}

export interface FeedEvent {
  id: string;
  at: number;
  icon: string;
  text: string;
}

export interface MajorMatch {
  id: string;
  round: 'semi' | 'final';
  a: string;
  b: string;
  winnerId?: string;
  duelId?: string;
}

export interface Season {
  month: string; // YYYY-MM
  punishmentVotes: Record<string, string>;
  major?: {
    seeds: string[];
    matches: MajorMatch[];
    championId?: string;
    lastPlaceId?: string;
    done: boolean;
  };
}

export interface Scheduled {
  id: string;
  at: number;
  kind: 'vote' | 'duelRespond' | 'duelConfirm';
  memberId: string;
  targetId: string;
  verdict?: Verdict;
}

export interface Report {
  id: string;
  at: number;
  receiptId: string;
  reason: string;
}

export interface League {
  id: string;
  name: string;
  createdAt: number;
  meId: string;
  members: Member[];
  categories: Category[];
  receipts: Receipt[];
  duels: Duel[];
  belts: Belt[];
  drops: Drop[];
  ratings: RatingEvent[];
  feed: FeedEvent[];
  seasons: Season[];
  scheduled: Scheduled[];
  reports: Report[];
  hiddenReceipts: string[];
  blocked: string[];
  lastTick: number;
}
