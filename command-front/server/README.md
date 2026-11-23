# Command Front lobby server

The small server behind **Play online**. It does three things:

* counts who is connected and lists the open games;
* seats two players in a game (from the list, by Quick match, or by a shared link);
* passes their traffic to each other — the match itself while no direct connection
  exists (the *relay*), and the handshake that lets the two browsers connect directly.

It never runs the game: the match is simulated on both players' devices, and the
server only forwards messages it does not read. A player whose connection drops
keeps their seat for 90 seconds and takes it back on reconnecting.

`hub.js` is all of the logic and has no dependencies. Two thin adapters run it:

| | File | Good for |
|---|---|---|
| Cloudflare Workers | `worker.js`, `wrangler.toml` | No machine to look after, TLS included, a free plan that covers a hobby game |
| Node | `node.mjs`, `Dockerfile` | Your own VPS or any container host |

Use one. Both speak the same protocol and pass the same tests.

## Deploy on Cloudflare (recommended)

```sh
cd command-front/server
npm install
npx wrangler login          # once
npx wrangler deploy
```

It prints an address such as `https://command-front-lobby.<your-subdomain>.workers.dev`.
The game needs it as `wss://…` — see *Point the game at it* below.

Settings live in `wrangler.toml`:

* `ORIGINS` — the pages allowed to connect. Leave it as the game's address so
  other sites cannot use your server.
* `LOCATION_HINT` — where the hub runs. Pick the region nearest most of your
  players (`weur`, `me`, `enam`, …): relayed matches are faster the closer it is.

One Durable Object holds every player, which is what lets everyone see the same
list. It stays in memory while anyone is connected; on the free plan that fits
inside the daily allowance for a single always-on object, but check the usage
page if the game gets busy.

## Deploy with Node or Docker

```sh
cd command-front/server
npm install --omit=dev
PORT=8787 ORIGINS=https://funhub.super-dar.com TRUST_PROXY=1 npm start
```

or

```sh
docker build -t command-front-lobby .
docker run -d --restart=always -p 8787:8787 \
  -e ORIGINS=https://funhub.super-dar.com -e TRUST_PROXY=1 command-front-lobby
```

Put it behind something that terminates TLS (Caddy, nginx, a load balancer):
the game is served over https, and browsers only let an https page open
`wss://`. `TRUST_PROXY=1` makes the per-address connection limit read
`X-Forwarded-For`. With Caddy the whole proxy is:

```
lobby.example.com {
    reverse_proxy localhost:8787
}
```

## Point the game at it

Edit `command-front/src/data/online.js`:

```js
servers: ['wss://command-front-lobby.<your-subdomain>.workers.dev'],
```

then bump the build (`BUILD` in `src/data/build.js` and `CACHE` in `sw.js`,
together) and publish the site. More than one address may be listed; the game
tries them in turn. Until an address is set, the Online screen says online play
is not set up and everything else works as before.

Check a running server at `https://<address>/stats`:

```json
{ "online": 12, "games": 4, "open": 2, "uptime": 86400, "protocol": 1 }
```

The main menu reads the same address for its "players online" badge.

## Try it locally

```sh
cd command-front/server && npm install && npm start      # ws://localhost:8787
cd ../..               && python3 -m http.server 8123
```

Open `http://localhost:8123/command-front/?server=ws://localhost:8787#/online`
in two windows. The `?server=` override only works on localhost.

## Tests

```sh
cd command-front
node --test 'tests/online*.test.mjs'     # hub, message layer, client and room — no network, no install
cd server && npm test                    # the Node adapter over real sockets
```

To run the socket tests against the Worker as well: `npm run dev:worker` in one
terminal, `WORKER_URL=ws://localhost:8787 npm test` in another.
`tools/online-e2e/run.mjs` plays whole matches in two real browsers (it needs
Playwright and Chrome; the header of the file says how to run it).

## Limits and abuse

Defaults are in `hub.js` (`DEFAULTS`): 16 connections per address, 5000 in all,
1000 games, a per-connection message allowance sized for the fastest game
speed, 96 KiB per relayed message. Names are stripped of control and
text-direction characters and cut to 24 characters (game names to 32). A
connection that floods or sends oversized messages is closed.

The direct connection between two players shows each one's network address to
the other, as in any peer-to-peer game. Set `direct: false` in
`src/data/online.js` to keep every match on the relay instead.
