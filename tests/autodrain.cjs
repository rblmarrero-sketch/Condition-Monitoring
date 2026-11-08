/* THE FULL HISTORY ARRIVES BY ITSELF, AND STAYS OFFLINE (08.11.2026).

   Asked: "when online it downloads the latest by itself, offline it stays and
   does not disappear, no pressing Get full history or reload everything."

   A phone whose saved history was lost (storage full, a fresh install) holds a
   cursor and nothing, or less than the cursor says (cm_hist_short). The
   automatic pull reads one page, and the index answers a read from zero in
   pages (truncated + cursor). Before this build the rest came one page per
   five-minute pull, or by the button. This serves a three-page index and
   proves, with no button pressed:
     1. every page arrives on its own within seconds of opening the app;
     2. the short flag is cleared, so the next pull does not read it all again;
     3. a phone that is not short and has nothing pending makes one request;
     4. offline, a fresh start still shows every round.

   Run: node tests/autodrain.cjs   (serves the repo itself on 8164) */
const { chromium } = require(require('./pw.cjs'));
const until = require('./until.cjs');
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = 8164, BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const EMPTY = { edits: [], conflicts: [], deleted: [], deferrals: [] };
const PAGES = {
  0:   { truncated: true, cursor: 100, rows: [{ u: 'TK146', d: '2026-11-01', t: 'MP', by: 'A' }] },
  100: { truncated: true, cursor: 200, rows: [{ u: 'TK147', d: '2026-11-03', t: 'MP', by: 'B' }] },
  200: { rows: [{ u: 'TK148', d: '2026-11-06', t: 'MP', by: 'C' }] },
};
let CALLS = [];
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, BASE);
  if (u.pathname === '/exec') {
    const a = u.searchParams.get('action'); let out = { ok: true };
    if (a === 'index') {
      const since = Number(u.searchParams.get('since') || 0); CALLS.push(since);
      const pg = PAGES[since] || { rows: [] };
      out = Object.assign({ ok: true, v: 2, at: 300 }, pg, EMPTY);
    } else if (a === 'file') out = { ok: false, error: 'Not found' };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(out));
  }
  const f = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(url => {
    if (sessionStorage.getItem('b')) return; sessionStorage.setItem('b', '1');
    if (localStorage.getItem('__seeded')) return; localStorage.setItem('__seeded', '1');
    localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', on: true, url, sec: '', folder: '' }]));
    localStorage.setItem('cm_team_full_v1', '1');
    localStorage.setItem('cm_hist_full_v1', '1');
    /* what this week left on a phone whose storage had filled: a cursor that
       claims everything, and the history thrown away */
    localStorage.setItem('cm_team_cursor', '300');
    localStorage.setItem('cm_hist_short', '1');
  }, BASE + '/exec');
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));

  console.log('\n1. NO BUTTON PRESSED: EVERY PAGE ARRIVES BY ITSELF');
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  const got = await until(p, () => { try { const a = JSON.parse(localStorage.getItem('cm_team') || '[]');
    return ['TK146', 'TK147', 'TK148'].every(u => a.some(r => r.u === u)); } catch (e) { return false; } },
    null, { timeout: 20000 }).then(() => true, () => false);
  const st = await p.evaluate(() => ({ team: JSON.parse(localStorage.getItem('cm_team') || '[]').map(r => r.u).sort(),
    hist: Object.keys(JSON.parse(localStorage.getItem('cm_hist') || '{}')).sort(), short: !!localStorage.getItem('cm_hist_short') }));
  ok('all three pages are saved on the phone', got, JSON.stringify(st.team) + ' · calls ' + JSON.stringify(CALLS));
  ok('the pages were asked from their cursors', CALLS.includes(100) && CALLS.includes(200), JSON.stringify(CALLS));
  ok('the due history holds every machine', ['MP|TK146', 'MP|TK147', 'MP|TK148'].every(k => st.hist.includes(k)), JSON.stringify(st.hist));
  ok('2. the "short" mark is cleared', !st.short);

  console.log('\n3. A PHONE THAT HOLDS EVERYTHING ASKS ONCE');
  await p.waitForTimeout(800);
  CALLS = [];
  await p.evaluate(() => { teamLastAuto = 0; } ).catch(() => {});
  await p.evaluate(async () => { try { await teamPull(false); } catch (e) {} });
  await p.evaluate(() => (typeof autoDrainIfShort === 'function') && autoDrainIfShort());
  await p.waitForTimeout(800);
  ok('one request at most, no full re-read', CALLS.length <= 1 && !CALLS.includes(0), JSON.stringify(CALLS));

  console.log('\n4. NO SIGNAL, A FRESH START: IT IS ALL STILL THERE');
  await p.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready);
  await p.waitForTimeout(1000);
  await ctx.setOffline(true);
  const q = await ctx.newPage();
  q.on('pageerror', e => fails.push('PAGEERROR offline ' + e.message));
  await q.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await q.waitForFunction(() => typeof teamAll === 'function', null, { timeout: 20000 });
  await q.waitForTimeout(1500);
  const off = await q.evaluate(() => { renderTeam(); return { rows: teamAll().map(r => r.u).sort(), shown: document.querySelectorAll('#teamList > *').length }; });
  ok('every round is on the screen offline', off.rows.length === 3 && off.shown > 0, JSON.stringify(off));
  await ctx.setOffline(false);

  ok('no page errors', !fails.some(f => /^PAGEERROR/.test(f)), fails.filter(f => /^PAGEERROR/.test(f)).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
