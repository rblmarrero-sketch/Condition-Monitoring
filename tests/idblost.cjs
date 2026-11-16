/* A LOST INDEXEDDB CONNECTION IS REOPENED ON A READ (build 637).
   DRGZCS, 15.11.2026: WebKit answered "Connection to Indexed Database server
   lost" and every queue read failed for twenty minutes, because only three
   failed writes reopened the connection. Here the open connection is made to
   fail every transaction with that sentence: the first read fails, the next
   one works on a new connection. Against build 636 the second read fails too.
   Run: node tests/idblost.cjs   (starts its own server on 8492) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8492);
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const srv = http.createServer((q, s) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('x'); }
  s.end(fs.readFileSync(p));
});
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 412, height: 915 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]'); });
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof dbAll === 'function', null, { timeout: 20000 });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => {
    await dbPut({ id: 'MP__TK151__2026-11-16__X__1', type: 'MP', equip: 'TK151', date: '2026-11-16', positions: {} });
    const dead = await idb();
    const real = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...a) {
      if (this === dead) { const e = new Error('Connection to Indexed Database server lost. Refresh the page to try again'); e.name = 'UnknownError'; throw e; }
      return real.apply(this, a);
    };
    const out = {};
    try { await dbAll(); out.first = 'ok'; } catch (e) { out.first = e.message; }
    try { out.second = (await dbAll()).length; } catch (e) { out.second = e.message; }
    try { await dbGet('MP__TK151__2026-11-16__X__1'); out.get = 'ok'; } catch (e) { out.get = e.message; }
    out.lost = (window.__slog || []).length;
    IDBDatabase.prototype.transaction = real;
    return out;
  });
  ok(/server lost/.test(r.first), 'the read on the lost connection fails, with the engine’s own words', JSON.stringify(r));
  ok(r.second === 1, 'the next read opens a new connection and finds the round', JSON.stringify(r));
  ok(r.get === 'ok', 'and a single read works too', JSON.stringify(r));
  const r2 = await p.evaluate(async () => {
    const real = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function () { const e = new Error('some other failure'); e.name = 'DataError'; throw e; };
    const before = await idb(); let after;
    try { await dbAll(); } catch (e) {}
    after = await idb();
    IDBDatabase.prototype.transaction = real;
    return before === after;
  });
  ok(r2, 'any other read error keeps the connection');
  ok(!errs.length, 'no page errors', errs.join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
