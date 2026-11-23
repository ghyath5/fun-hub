// @ts-check
/**
 * The lobby hub on Cloudflare Workers: one Durable Object holds the hub, so
 * every player in the world meets in the same place.
 *
 *   npx wrangler deploy        # prints wss://command-front-lobby.<you>.workers.dev
 *
 * Settings (wrangler.toml [vars]):
 *   ORIGINS  comma-separated pages allowed to connect; empty allows any.
 */
import { DurableObject } from 'cloudflare:workers';
import { createHub } from './hub.js';

/** @param {any} env */
const origins = (env) => String(env.ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const CORS = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };

export class Lobby extends DurableObject {
  /** @param {any} ctx @param {any} env */
  constructor(ctx, env) {
    super(ctx, env);
    this.hub = createHub();
  }

  /** @param {Request} request */
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/stats' || url.pathname === '/health') return Response.json(this.hub.stats(), { headers: CORS });
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response(null, { status: 404, headers: CORS });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    const session = this.hub.connect({
      send: (text) => server.send(text),
      close: (code, reason) => { try { server.close(code, reason); } catch { /* already closed */ } },
      ip: request.headers.get('cf-connecting-ip') ?? '',
    });
    if (session) {
      server.addEventListener('message', (e) => { if (typeof e.data === 'string') session.message(e.data); });
      server.addEventListener('close', (e) => {
        // Answer the closing handshake, or the browser's socket lingers half-closed.
        try { server.close(e.code === 1005 || e.code === 1006 ? 1000 : e.code, e.reason); } catch { /* already closed */ }
        session.closed();
      });
      server.addEventListener('error', () => session.closed());
    }
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  /** @param {Request} request @param {any} env */
  async fetch(request, env) {
    const allowed = origins(env);
    const origin = request.headers.get('origin');
    const socket = request.headers.get('upgrade')?.toLowerCase() === 'websocket';
    if (socket && allowed.length && !(origin && allowed.includes(origin))) return new Response('origin not allowed', { status: 403 });
    // One hub for everyone. The hint places it near the first players; change it to suit yours.
    const id = env.LOBBY.idFromName('world');
    return env.LOBBY.get(id, { locationHint: env.LOCATION_HINT || undefined }).fetch(request);
  },
};
