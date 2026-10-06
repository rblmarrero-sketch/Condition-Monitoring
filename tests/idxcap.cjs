/* A FAILED INDEX READ IS NOT "THIS BACKEND HAS NO INDEX".

   Both surfaces remember whether the backend answers action=index, so a
   deployment without it is not asked on every pull. Until build 531 they
   remembered "no" after ANY failure: a timeout, a network error, or the HTML
   page Google serves for its six-minute limit or "unable to open the file".
   From then on the browser (cm_drive_index) or the phone (up_index) used the
   records path for good — on Google that walks the whole Drive folder
   (~200 s), outruns TEAM_TIMEOUT / TEAM_TIMEOUT_FULL every time, and the
   phone silently stopped receiving team rounds.

   The rule, for both: "no index" is stored ONLY when the backend answers JSON
   {ok:false, error:/unknown action/i}. Anything else falls back for that run
   and stores nothing, so the next run asks the index again. A valid index
   reply stores "yes". The keys are new (cm_drive_index2, up_index2) so
   anything already stuck on "no" heals; the old keys are removed.

   Backend: a local server whose index answer is chosen per URL; no real
   /exec is ever named or reached. */
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const MODES = ['valid', 'unknown', 'html', 'neterr', 'abort', 'other'];
const hits = {};                       // mode -> index requests seen
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
const json = (r, o) => { r.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); r.end(JSON.stringify(o)); };
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const m = u.pathname.match(/^\/exec\/(\w+)$/);
  if (m) {
    const mode = m[1], action = u.searchParams.get('action');
    if (action === 'index' && !u.searchParams.get('rebuild')) {
      hits[mode] = (hits[mode] || 0) + 1;
      if (mode === 'valid') return json(r, { ok: true, v: 2, rows: [], records: [], at: Date.now(), upToDate: true });
      if (mode === 'unknown') return json(r, { ok: false, error: 'Unknown action: index' });
      if (mode === 'other') return json(r, { ok: false, error: 'Exceeded maximum execution time' });
      if (mode === 'html') { r.writeHead(200, { 'content-type': 'text/html', 'access-control-allow-origin': '*' });
        return r.end('<!DOCTYPE html><html><body>Google Apps Script: Sorry, unable to open the file at this time.</body></html>'); }
      if (mode === 'neterr') return q.socket.destroy();
      if (mode === 'abort') return;                    // aborted by the page (route) below
    }
    if (action === 'records') return json(r, { ok: true, records: [], edits: [], conflicts: [], at: Date.now(), complete: true });
    return json(r, { ok: true, files: [], items: [] });
  }
  let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
});

(async () => {
  await new Promise(r => srv.listen(0, r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch();

  const ctxFor = async (mode, seed) => {
    const ctx = await b.newContext();
    const url = `${BASE}/exec/${mode}`;
    await ctx.addInitScript(([url, seed]) => {
      if (sessionStorage.getItem('seeded')) return;      // seed once; a reload must keep what the app stored
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', on: true, url, sec: '', folder: '' }]));
      localStorage.setItem('cm_drive_url', url);
      for (const k in (seed || {})) localStorage.setItem(k, seed[k]);
    }, [url, seed]);
    if (mode === 'abort') await ctx.route(/\/exec\/abort\?.*action=index/, rt => { hits.abort = (hits.abort || 0) + 1; rt.abort('aborted'); });
    return { ctx, url };
  };

  /* ---------------- the phone ---------------- */
  const phone = async (mode, seed) => {
    hits[mode] = 0;
    const { ctx, url } = await ctxFor(mode, seed);
    const p = await ctx.newPage();
    await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof teamPull === 'function', null, { timeout: 30000 });
    await p.waitForTimeout(800);
    const pull = () => p.evaluate(() => teamPull(true, false).catch(() => {}));
    const read = () => p.evaluate(u => { const c = JSON.parse(localStorage.getItem('up_index2') || '{}'); return { v: c[u], old: localStorage.getItem('up_index') }; }, url);
    await pull(); const first = await read(); const n1 = hits[mode];
    await pull(); const second = await read(); const n2 = hits[mode];
    await ctx.close();
    return { first, second, n1, n2 };
  };

  let r = await phone('valid');
  ok('phone, valid index reply: true is stored', r.first.v === true, JSON.stringify(r));
  r = await phone('unknown');
  ok('phone, {ok:false,"Unknown action: index"}: false is stored', r.first.v === false, JSON.stringify(r));
  ok('phone, and the next pull does not ask the index again', r.n2 === r.n1, JSON.stringify(r));
  for (const mode of ['html', 'neterr', 'abort', 'other']) {
    r = await phone(mode);
    ok(`phone, ${mode}: nothing stored`, r.first.v === undefined && r.second.v === undefined, JSON.stringify(r));
    ok(`phone, ${mode}: the next pull asks the index again`, r.n2 > r.n1 && r.n1 >= 1, JSON.stringify(r));
  }
  r = await phone('valid', { up_index: JSON.stringify({ [`${BASE}/exec/valid`]: false }) });
  ok('phone, an old "up_index" false is ignored: the index is asked and true stored', r.n1 >= 1 && r.first.v === true, JSON.stringify(r));
  ok('phone, and the old key is removed', r.first.old === null, JSON.stringify(r.first));

  /* ---------------- the office ---------------- */
  const desk = async (mode, seed, page) => {
    hits[mode] = 0;
    const { ctx } = await ctxFor(mode, seed);
    const p = await ctx.newPage();
    await p.goto(BASE + '/' + (page || 'dashboard') + '/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => window.CMDrive && typeof CMDrive.load === 'function', null, { timeout: 30000 });
    await p.waitForTimeout(800);
    const load = () => p.evaluate(() => CMDrive.load(null, {}).then(() => 'ok', e => 'threw: ' + e.message));
    const read = () => p.evaluate(() => ({ v: localStorage.getItem('cm_drive_index2'), old: localStorage.getItem('cm_drive_index') }));
    await load(); const first = await read(); const n1 = hits[mode];
    await load(); const second = await read(); const n2 = hits[mode];
    await ctx.close();
    return { first, second, n1, n2 };
  };

  for (const page of ['dashboard', 'dashboard-next']) {
    r = await desk('valid', null, page);
    ok(`${page}, valid index reply: "1" is stored`, r.first.v === '1', JSON.stringify(r));
    r = await desk('unknown', null, page);
    ok(`${page}, "Unknown action: index": "0" is stored`, r.first.v === '0', JSON.stringify(r));
    ok(`${page}, and the next load does not ask the index again`, r.n2 === r.n1, JSON.stringify(r));
    for (const mode of ['html', 'neterr', 'abort', 'other']) {
      r = await desk(mode, null, page);
      ok(`${page}, ${mode}: nothing stored`, r.first.v === null && r.second.v === null, JSON.stringify(r));
      ok(`${page}, ${mode}: the next load asks the index again`, r.n2 > r.n1 && r.n1 >= 1, JSON.stringify(r));
    }
    r = await desk('valid', { cm_drive_index: '0' }, page);
    ok(`${page}, an old "cm_drive_index" = "0" is ignored: the index is asked and "1" stored`, r.n1 >= 1 && r.first.v === '1', JSON.stringify(r));
    ok(`${page}, and the old key is removed`, r.first.old === null, JSON.stringify(r.first));
  }

  await b.close(); srv.close();
  console.log('\n' + (fails.length ? 'FAILED ' + fails.length + '\n  ' + fails.join('\n  ') : 'all passed'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
