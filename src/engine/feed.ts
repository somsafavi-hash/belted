import type { League } from './types';
import { uid } from './util';

export function post(l: League, at: number, icon: string, text: string): void {
  l.feed.push({ id: uid(), at, icon, text });
  if (l.feed.length > 300) l.feed.splice(0, l.feed.length - 300);
}

export function nameOf(l: League, id?: string): string {
  if (!id) return 'Nobody';
  if (id === l.meId) return 'You';
  return l.members.find((m) => m.id === id)?.name ?? 'Someone';
}

export function categoryOf(l: League, id?: string) {
  return l.categories.find((c) => c.id === id);
}
