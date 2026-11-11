// Demo-mode storage: the league as JSON in localStorage, photos and videos as
// blobs in IndexedDB. Everything stays on this phone.

import type { League } from '../engine/types';

const KEY = 'belted:league:v1';
const OFFSET_KEY = 'belted:clock:v1';

export function loadLeague(): League | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as League) : undefined;
  } catch {
    return undefined;
  }
}

export function saveLeague(l: League | undefined): void {
  try {
    if (l) localStorage.setItem(KEY, JSON.stringify(l));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage full or blocked: the session keeps working in memory.
  }
}

export function loadOffset(): number {
  try {
    return Number(localStorage.getItem(OFFSET_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveOffset(ms: number): void {
  try {
    localStorage.setItem(OFFSET_KEY, String(ms));
  } catch { /* ignore */ }
}

// ---- media ----

const DB = 'belted';
const STORE = 'media';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const memory = new Map<string, Blob>();
const urls = new Map<string, string>();

export async function putMedia(id: string, blob: Blob): Promise<void> {
  memory.set(id, blob);
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Falls back to memory for this session.
  }
}

export async function mediaUrl(id: string): Promise<string | undefined> {
  const cached = urls.get(id);
  if (cached) return cached;
  let blob = memory.get(id);
  if (!blob) {
    try {
      const d = await db();
      blob = await new Promise<Blob | undefined>((resolve) => {
        const req = d.transaction(STORE).objectStore(STORE).get(id);
        req.onsuccess = () => resolve(req.result as Blob | undefined);
        req.onerror = () => resolve(undefined);
      });
    } catch {
      return undefined;
    }
  }
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

export async function clearMedia(): Promise<void> {
  memory.clear();
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls.clear();
  try {
    const d = await db();
    d.transaction(STORE, 'readwrite').objectStore(STORE).clear();
  } catch { /* ignore */ }
}
