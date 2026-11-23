// @ts-check
/**
 * The lobby hub on Node: one process, WebSocket on `/`, JSON on `/stats`.
 *
 *   npm install && npm start            # ws://localhost:8787
 *   PORT=9000 ORIGINS=https://funhub.super-dar.com npm start
 *
 * Put it behind a TLS proxy (Caddy, nginx, a load balancer): the game is
 * served over https, and a browser only lets such a page open wss://.
 * Behind a proxy set TRUST_PROXY=1 so the per-address limit reads
 * X-Forwarded-For instead of the proxy's own address.
 */
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createHub, DEFAULTS } from './hub.js';

const PORT = Number(process.env.PORT) || 8787;
/** Pages allowed to connect; empty allows any (development). */
const ORIGINS = (process.env.ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
/** A socket silent for two of these is closed (ms). */
const PING_MS = 25_000;

/**
 * @param {{ port?: number, origins?: string[], trustProxy?: boolean, config?: Partial<typeof DEFAULTS>, quiet?: boolean }} [o]
 */
export function startServer({ port = PORT, origins = ORIGINS, trustProxy = TRUST_PROXY, config = {}, quiet = false } = {}) {
  const log = quiet ? () => {} : (/** @type {string} */ line) => console.log(`${new Date().toISOString()} ${line}`);
  const hub = createHub({ config, log });
  const originOk = (/** @type {string | undefined} */ o) => !origins.length || (!!o && origins.includes(o));

  const http = createServer((req, res) => {
    const cors = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
    if (req.url === '/stats' || req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json', ...cors });
      res.end(JSON.stringify(hub.stats()));
    } else {
      res.writeHead(404, cors);
      res.end();
    }
  });
  const wss = new WebSocketServer({ server: http, maxPayload: DEFAULTS.maxRelayChars * 4, perMessageDeflate: false, verifyClient: ({ origin }) => originOk(origin) });

  wss.on('connection', (ws, req) => {
    const forwarded = trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
    const session = hub.connect({
      send: (text) => { if (ws.readyState === ws.OPEN) ws.send(text); },
      close: (code, reason) => ws.close(code, reason),
      ip: forwarded || req.socket.remoteAddress || '',
    });
    if (!session) return;
    let alive = true;
    ws.on('pong', () => { alive = true; });
    const beat = setInterval(() => {
      if (!alive) { ws.terminate(); return; }
      alive = false;
      ws.ping();
    }, PING_MS);
    ws.on('message', (data, binary) => { alive = true; if (!binary) session.message(data.toString()); });
    ws.on('close', () => { clearInterval(beat); session.closed(); });
    ws.on('error', () => ws.terminate());
  });

  return new Promise((resolve) => {
    http.listen(port, () => {
      const address = /** @type {import('node:net').AddressInfo} */ (http.address());
      log(`lobby hub listening on :${address.port}${origins.length ? ` for ${origins.join(', ')}` : ' (any origin)'}`);
      resolve({
        port: address.port,
        hub,
        /** Cut every socket without a goodbye (tests: a server that vanishes). */
        dropAll: () => { for (const ws of wss.clients) ws.terminate(); },
        close: () => new Promise((done) => { for (const ws of wss.clients) ws.terminate(); wss.close(); http.close(() => done(undefined)); }),
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) startServer();
