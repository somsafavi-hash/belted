import type { League } from '../engine/types';
import type { Action, ActionResult } from '../engine/actions';

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const ONLINE_AVAILABLE = !!API_URL;

export interface Session {
  leagueId: string;
  playerId: string;
  secret: string;
}

export interface LeagueView {
  league: League;
  mediaUrls: Record<string, string>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function req<T>(method: string, path: string, body?: unknown, s?: Session): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(s ? { Authorization: `Bearer ${s.playerId}:${s.secret}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No connection. Check your signal and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'Something went wrong.');
  return data as T;
}

type Joined = Session & LeagueView;

export const api = {
  create: (name: string, leagueName: string) => req<Joined>('POST', '/leagues', { name, leagueName }),
  preview: (leagueId: string) => req<{ name: string; members: string[] }>('GET', `/leagues/${leagueId}/preview`),
  join: (leagueId: string, name: string) => req<Joined>('POST', `/leagues/${leagueId}/join`, { name }),
  state: (s: Session) => req<LeagueView>('GET', `/leagues/${s.leagueId}`, undefined, s),
  act: (s: Session, a: Action) => req<LeagueView & { result: ActionResult }>('POST', `/leagues/${s.leagueId}/actions`, a, s),
  leave: (s: Session) => req<{ ok: true }>('POST', `/leagues/${s.leagueId}/leave`, {}, s),

  async upload(s: Session, blob: Blob): Promise<string> {
    const type = (blob.type || 'image/jpeg').split(';')[0];
    const { mediaId, upload } = await req<{ mediaId: string; upload: { method: 'PUT' | 'POST'; url: string; fields?: Record<string, string>; headers?: Record<string, string> } }>(
      'POST', `/leagues/${s.leagueId}/uploads`, { contentType: type }, s,
    );
    let res: Response;
    try {
      if (upload.method === 'POST') {
        const form = new FormData();
        Object.entries(upload.fields ?? {}).forEach(([k, v]) => form.append(k, v));
        form.append('file', blob);
        res = await fetch(upload.url, { method: 'POST', body: form });
      } else {
        res = await fetch(upload.url, { method: 'PUT', body: blob, headers: upload.headers });
      }
    } catch {
      throw new ApiError(0, 'Upload failed. Check your signal and try again.');
    }
    if (!res.ok) throw new ApiError(res.status, 'Upload failed. Videos can be up to 30 seconds.');
    return mediaId;
  },
};

export function inviteLink(leagueId: string): string {
  return `${location.origin}${location.pathname}#join-${leagueId}`;
}
