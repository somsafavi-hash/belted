// Local API for development: `npm run api` → http://127.0.0.1:8787
// Same handler as production, with leagues and media kept in memory.
import { createServer } from 'node:http';
import { handle } from './handler';
import { MemoryStore } from './memoryStore';

const PORT = Number(process.env.PORT ?? 8787);
const base = `http://127.0.0.1:${PORT}`;
const store = new MemoryStore(base);

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-admin-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks);
  const path = (req.url ?? '/').split('?')[0];

  const media = /^\/media\/([a-z0-9]+)\/([a-z0-9_]+)$/.exec(path);
  if (media) {
    const key = `${media[1]}/${media[2]}`;
    if (req.method === 'PUT') {
      store.media.set(key, { type: String(req.headers['content-type'] ?? 'application/octet-stream'), data: raw });
      res.writeHead(200).end();
    } else {
      const m = store.media.get(key);
      if (!m) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': m.type, 'Cache-Control': 'max-age=3600' }).end(m.data);
    }
    return;
  }

  const out = await handle({ method: req.method ?? 'GET', path, headers: req.headers as Record<string, string>, body: raw.toString('utf8') }, store, Date.now(), {
    // Local admin key is "local-admin".
    adminKeyHash: '8aa203921e9b2adba121fbbe07504a30a9c1a647dd4961c1a355947280016649',
  });
  res.writeHead(out.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(out.body));
}).listen(PORT, '127.0.0.1', () => console.log(`Belted API on ${base}`));
