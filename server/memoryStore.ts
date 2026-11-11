import type { LeagueDoc, Store, Upload } from './store';

/** In-memory store for tests and the local dev server. */
export class MemoryStore implements Store {
  docs = new Map<string, { json: string; etag: string }>();
  media = new Map<string, { type: string; data: Buffer }>();
  private n = 0;
  constructor(private publicBase = 'http://localhost') {}

  async get(id: string) {
    const d = this.docs.get(id);
    return d ? { doc: JSON.parse(d.json) as LeagueDoc, etag: d.etag } : null;
  }
  async put(id: string, doc: LeagueDoc, etag: string | null) {
    const cur = this.docs.get(id);
    if ((etag === null && cur) || (etag !== null && cur?.etag !== etag)) return false;
    this.docs.set(id, { json: JSON.stringify(doc), etag: String(++this.n) });
    return true;
  }
  async uploadTarget(leagueId: string, mediaId: string, contentType: string): Promise<Upload> {
    return { method: 'PUT', url: `${this.publicBase}/media/${leagueId}/${mediaId}`, headers: { 'Content-Type': contentType } };
  }
  async mediaExists(leagueId: string, mediaId: string) {
    return this.media.has(`${leagueId}/${mediaId}`);
  }
  async mediaUrl(leagueId: string, mediaId: string) {
    return `${this.publicBase}/media/${leagueId}/${mediaId}`;
  }
  markers = new Set<string>();
  async setReportMarker(leagueId: string, open: boolean) {
    if (open) this.markers.add(leagueId); else this.markers.delete(leagueId);
  }
  async listReportMarkers() {
    return [...this.markers];
  }
  async deleteMedia(leagueId: string, ids: string[]) {
    for (const m of ids) this.media.delete(`${leagueId}/${m}`);
  }
}
