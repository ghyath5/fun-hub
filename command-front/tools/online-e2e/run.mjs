// Online play in two real browsers against the real lobby server (started here, so the test can
// cut its connections and restart it): quick match, a match in lockstep, the direct link, falling back
// to the relay, both paths lost at once, a server restart mid-match, and leaving.
//
//   cd command-front/server && npm install
//   python3 -m http.server 8123                     # from the site's root, in another terminal
//   PLAYWRIGHT=<path to playwright/index.mjs> CHROME=<chrome binary> node command-front/tools/online-e2e/run.mjs
import assert from 'node:assert/strict';
import { startServer } from '../../server/node.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const SITE = process.env.SITE ?? 'http://localhost:8123/command-front/';
const PORT = Number(process.env.LOBBY_PORT) || 8799;
const BASE = `${SITE}?server=ws://localhost:${PORT}`;
let lobby = await startServer({ port: PORT, quiet: true });
const stats = () => lobby.hub.stats();

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
/** @type {string[]} */ const problems = [];
let desyncs = 0;
async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, locale: 'en-US', serviceWorkers: 'block' });
  // Keep hold of every peer connection the page makes, so the test can kill the direct link.
  await ctx.addInitScript(() => {
    const Real = window.RTCPeerConnection;
    window.__pcs = [];
    window.RTCPeerConnection = function (...args) { const pc = new Real(...args); window.__pcs.push(pc); return pc; };
    window.RTCPeerConnection.prototype = Real.prototype;
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (/desync/.test(m.text())) desyncs++;
    if (m.type() === 'error' && !/ERR_|Failed to load resource|WebSocket connection/.test(m.text())) problems.push(`${name}: ${m.text()}`);
  });
  return page;
}
const killDirect = (page) => page.evaluate(() => { let n = 0; for (const pc of window.__pcs) if (pc.connectionState !== 'closed') { pc.close(); n++; } return n; });
const path = (page) => page.evaluate(() => document.querySelector('.link-badge')?.textContent ?? '');
const tick = (page) => page.evaluate(() => window.__cf?.world?.tick ?? -1);
const card = (page) => page.evaluate(() => window.__cf?.store?.get().link ?? null);
const step = async (what, fn) => { const t = Date.now(); await fn(); console.log(`ok  ${what} (${Date.now() - t} ms)`); };
/** Wait until both phones' simulations have moved on by `n` ticks. */
async function advance(a, b, n, ms = 30000) {
  const [a0, b0] = [await tick(a), await tick(b)];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await tick(a)) >= a0 + n && (await tick(b)) >= b0 + n) return;
    await a.waitForTimeout(100);
  }
  assert.fail(`the match did not advance ${n} ticks (host ${a0}→${await tick(a)}, guest ${b0}→${await tick(b)})`);
}

const host = await phone('host');
const guest = await phone('guest');
try {
  await step('quick match with nobody waiting opens a game', async () => {
    await host.goto(`${BASE}#/online`);
    await host.waitForSelector('.net-badge.ok');
    await host.locator('button', { hasText: 'Quick match' }).click();
    await host.waitForSelector('.lobby-strip');
    assert.match(host.url(), /#\/online\/g\/[A-Z0-9]{5}$/, 'the lobby has its own address');
    assert.equal(await host.locator('button', { hasText: 'Start' }).isDisabled(), true, 'no match without a second player');
  });

  await step('a second quick match joins it; both see each other and the link turns direct', async () => {
    await guest.goto(`${BASE}#/online`);
    await guest.waitForSelector('.game-row');
    assert.equal((await stats()).online, 2);
    await guest.locator('button', { hasText: 'Quick match' }).click();
    await guest.waitForSelector('.guest-lobby');
    await host.waitForSelector('.peer-chip');
    await host.waitForFunction(() => /direct/.test(document.querySelector('.link-badge')?.textContent ?? ''), null, { timeout: 20000 });
    await host.waitForFunction(() => !document.querySelector('.screen-head .btn.primary')?.disabled);
  });

  await step('the match starts on both and runs in lockstep with no desync', async () => {
    await host.locator('.screen-head .btn.primary').click();
    await host.waitForFunction(() => window.__cf?.world, null, { timeout: 60000 });
    await guest.waitForFunction(() => window.__cf?.world, null, { timeout: 60000 });
    await advance(host, guest, 150, 60000);
    assert.equal((await stats()).open, 0, 'a game being played is not offered to others');
  });

  await step("every socket to the server is cut: the direct link carries the match on, and the seats are taken back", async () => {
    lobby.dropAll();
    await advance(host, guest, 60);
    assert.equal(await card(host), null);
    await host.waitForFunction(() => true); // let the reconnects land
    for (let i = 0; i < 50 && stats().online < 2; i++) await host.waitForTimeout(100);
    assert.deepEqual([stats().online, stats().games], [2, 1], 'both players are back in their seats');
  });

  await step('the direct link dies: the match moves to the relay without stopping', async () => {
    assert.ok((await killDirect(host)) > 0, 'a direct connection existed');
    await advance(host, guest, 90, 45000);
    assert.deepEqual([await card(host), await card(guest)], [null, null]);
  });

  await step('the direct link is rebuilt by itself', async () => {
    await host.waitForFunction(() => window.__pcs.some((pc) => pc.connectionState === 'connected'), null, { timeout: 30000 });
    await advance(host, guest, 30);
  });

  await step('both paths lost at once: the match holds with a card, then resumes by itself', async () => {
    const before = await tick(host);
    lobby.dropAll();
    await killDirect(host);
    await advance(host, guest, 90, 45000);
    assert.deepEqual([await card(host), await card(guest)], [null, null]);
    assert.ok((await tick(host)) > before);
  });

  await step('the server is gone for good and the direct link too: the match holds and says the player is lost', async () => {
    await host.waitForFunction(() => window.__pcs.some((pc) => pc.connectionState === 'connected'), null, { timeout: 30000 });
    await lobby.close();
    await killDirect(host);
    await host.waitForFunction(() => window.__cf?.store?.get().link === 'reconnecting', null, { timeout: 20000 });
    const held = await tick(host);
    await host.waitForTimeout(1500);
    assert.ok((await tick(host)) - held <= 6, 'the match is held while the other player cannot be reached');
    // A restarted server has forgotten every seat, so this pair cannot be put back together: the card says so.
    lobby = await startServer({ port: PORT, quiet: true });
    await host.waitForFunction(() => window.__cf?.store?.get().link === 'lost', null, { timeout: 30000 });
  });

  await step('"Play on alone" lets the host finish against the computer', async () => {
    await host.locator('button', { hasText: 'Play on alone' }).click();
    const t0 = await tick(host);
    await host.waitForFunction((t) => window.__cf.world.tick > t + 30, t0, { timeout: 15000 });
  });

  await step('no desync happened anywhere', async () => { assert.equal(desyncs, 0); });

  // ---- Second pair: links, leaving, and Back.
  const h2 = await phone('host2');
  const g2 = await phone('guest2');
  let code = '';
  await step('…/#/online/new creates a game straight from the link', async () => {
    await h2.goto(`${BASE}#/online/new`);
    await h2.waitForSelector('.lobby-strip');
    code = (await h2.locator('.code-chip').textContent()).trim();
    assert.match(h2.url(), new RegExp(`#/online/g/${code}$`));
  });

  await step('…/#/online/g/<code> joins it straight from the link; the game is listed as full', async () => {
    await g2.goto(`${BASE}#/online/g/${code.toLowerCase()}`);
    await g2.waitForSelector('.guest-lobby');
    await h2.waitForSelector('.peer-chip');
    assert.equal(stats().open, 0);
  });

  await step('a link to a game that does not exist lands in the browser with the reason', async () => {
    const lost = await phone('lost');
    await lost.goto(`${BASE}#/online/g/ZZZZZ`);
    await lost.waitForSelector('.setup-error');
    assert.match(await lost.locator('.setup-error').textContent(), /no longer open/);
    assert.match(lost.url(), /#\/online$/);
    await lost.close();
  });

  await step('the guest leaves the lobby: the host keeps the game open for the next player', async () => {
    await g2.locator('.screen-head .btn', { hasText: 'Leave' }).click();
    await g2.waitForSelector('.screen.online');
    await h2.waitForSelector('.opp.remote.empty');
    for (let i = 0; i < 30 && stats().open < 1; i++) await h2.waitForTimeout(100);
    assert.equal(stats().open, 1);
  });

  await step('the next player joins from the list, the match starts, and a guest who leaves mid-match is announced', async () => {
    await g2.waitForSelector('.game-row .btn.primary');
    await g2.locator('.game-row .btn.primary').click();
    await g2.waitForSelector('.guest-lobby');
    await h2.waitForFunction(() => !document.querySelector('.screen-head .btn.primary')?.disabled, null, { timeout: 20000 });
    await h2.locator('.screen-head .btn.primary').click();
    await h2.waitForFunction(() => window.__cf?.world, null, { timeout: 60000 });
    await g2.waitForFunction(() => window.__cf?.world, null, { timeout: 60000 });
    await advance(h2, g2, 60, 60000);
    await g2.locator('[aria-label="Pause"]').click();
    await g2.locator('button', { hasText: 'Leave the match' }).click();
    await g2.waitForSelector('.screen.online');
    await h2.waitForFunction(() => window.__cf?.store?.get().link === 'left', null, { timeout: 15000 });
  });

  await step('Back after leaving a match does not walk back into that game', async () => {
    await g2.goBack();
    await g2.waitForTimeout(600);
    assert.ok(await g2.locator('.screen.online').count(), 'still the browser');
    assert.match(g2.url(), /#\/online$/);
  });

  await step('from the main menu: Play online has its own address, and Back returns to the menu and disconnects', async () => {
    const p = await phone('visitor');
    await p.goto(BASE);
    await p.waitForSelector('.menu-mark');
    await p.waitForSelector('.count-badge', { timeout: 10000 }); // the menu shows who is online
    const before = stats().online;
    await p.locator('button', { hasText: 'Play online' }).click();
    await p.waitForSelector('.net-badge.ok');
    assert.match(p.url(), /#\/online$/);
    assert.equal(stats().online, before + 1);
    await p.goBack();
    await p.waitForSelector('.menu-mark');
    assert.doesNotMatch(p.url(), /#/);
    for (let i = 0; i < 30 && stats().online > before; i++) await p.waitForTimeout(100);
    assert.equal(stats().online, before);
    await p.goForward();
    await p.waitForSelector('.screen.online');
    await p.close();
  });

  await step('the two-phone WiFi menu has its address too and is unchanged', async () => {
    const p = await phone('wifi');
    await p.goto(`${SITE}#/wifi`);
    await p.waitForSelector('.choice-grid');
    await p.locator('.choice', { hasText: 'Host a match' }).click();
    await p.waitForSelector('.pair-screen .qr-box');
    await p.close();
  });

  if (problems.length) assert.fail(`page errors:\n${problems.join('\n')}`);
  console.log('all good');
} finally {
  await browser.close();
  await lobby.close();
}
