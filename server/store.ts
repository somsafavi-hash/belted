import type { League } from '../src/engine/types';

/** One league as it is stored: the game, plus private things players never see. */
export interface LeagueDoc {
  v: 1;
  league: League;
  /** playerId → sha256 of that phone's secret. */
  auth: Record<string, string>;
  /** Per-player hidden receipts and blocks. */
  prefs: Record<string, { hidden: string[]; blocked: string[] }>;
}

export interface Upload {
  method: 'PUT' | 'POST';
  url: string;
  fields?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface Store {
  get(leagueId: string): Promise<{ doc: LeagueDoc; etag: string } | null>;
  /** Writes only if the stored copy still has `etag` (or doesn't exist when etag is null). False on conflict. */
  put(leagueId: string, doc: LeagueDoc, etag: string | null): Promise<boolean>;
  uploadTarget(leagueId: string, mediaId: string, contentType: string): Promise<Upload>;
  mediaExists(leagueId: string, mediaId: string): Promise<boolean>;
  mediaUrl(leagueId: string, mediaId: string): Promise<string>;
  deleteMedia(leagueId: string, mediaIds: string[]): Promise<void>;
}

export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;
