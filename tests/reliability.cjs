/* MTBF, MTTR AND AVAILABILITY — the arithmetic, and the panel on both desks.

   dashboard/reliability.js is the one place the three numbers are worked out
   (from data/reliability.json, the hourly 1C pull's corrective work orders —
   tests/relingest.py proves the ingest half). This holds the arithmetic to
   figures worked by hand from a small fixture, then opens Reports on BOTH
   office pages (dashboard/ and dashboard-next/ are both permanent, CLAUDE.md)
   and reads what the panel prints:

     - a failure is a P1 or a counted breakdown inside the period; a P2 repair
       is not one, and neither is a P1 from before the period;
     - a failure with no downtime figure is COUNTED and said out loud, never
       read as zero hours;
     - a population with no failures has no MTBF — it says so in words;
     - no file yet (before the first hourly pull after this change) is a
       sentence, not a row of zeros;
     - the period and class controls redraw; Russian is Russian.

   Run: node tests/reliability.cjs */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const near = (a, b, eps) => a != null && Math.abs(a - b) <= (eps || 1e-6);

const FIX = {
  generated: '2026-10-01T00:00:00+00:00', relSince: '2025-08-27', relWindowDays: 400,
  relUnits: ['TK101', 'TK102', 'EX005'],
  relEvents: [
    { equip: 'TK101', wo: 'WO-2', priority: 'P1 Breakdown', start: '2026-09-21', startDt: '2026-09-21T08:00:00Z', endDt: '2026-09-21T20:00:00Z', downH: 12, durH: 9, bd: 1 },
    { equip: 'TK101', wo: 'WO-9', priority: 'P2 Urgent (Repair)', start: '2026-09-22', startDt: '2026-09-22T08:00:00Z', downH: 5, bd: 0 },
    { equip: 'EX005', wo: 'WO-3', priority: 'P3 Planned (Repair)', start: '2026-09-25', startDt: '2026-09-25T06:00:00Z', endDt: '2026-09-25T10:00:00Z', downH: null, durH: null, bd: 1 },
    { equip: 'TK102', wo: 'WO-5', priority: 'P1 Breakdown', start: '2026-09-28', startDt: '2026-09-28T08:00:00Z', endDt: null, downH: null, durH: null, bd: 0 },
    { equip: 'TK102', wo: 'WO-1', priority: 'P1 Breakdown', start: '2026-07-01', startDt: '2026-07-01T08:00:00Z', endDt: '2026-07-01T09:00:00Z', downH: 100, bd: 1 },
  ],
};
const CLS = { TK101: 'HT', TK102: 'HT', EX005: 'EXC' };

console.log('\n1. THE ARITHMETIC, AGAINST FIGURES WORKED BY HAND');
{
  global.window = undefined;
  require(path.join(ROOT, 'dashboard/reliability.js'));
  const R = globalThis.CMRel;
  const r = R.compute(FIX, { days: 30, classOf: u => CLS[u] });
  // T = 3 machines × 30 d × 24 h = 2160. Failures: TK101's P1, EX005's counted
  // breakdown, TK102's P1 (no downtime). TK101's P2 is not a failure; TK102's
  // July P1 is outside the period. D = 12 (docs) + 4 (EX005's start–end).
  ok('three machines, 2160 h', r.units === 3 && r.T === 2160, JSON.stringify([r.units, r.T]));
  ok('three failures: two P1 and one counted breakdown, not the P2, not the one from July', r.failures === 3, r.failures);
  ok('16 h of downtime: 12 from 1C\'s figure, 4 from the start–end dates', near(r.downH, 16) && r.fromDocs === 1 && r.fromDates === 1, JSON.stringify(r));
  ok('the failure with no downtime figure is counted and named', r.unknownN === 1 && r.knownN === 2);
  ok('MTTR = 16 ÷ 2 known = 8 h', near(r.mttr, 8), r.mttr);
  ok('MTBF = (2160 − 16) ÷ 3 = 714.67 h', near(r.mtbf, 2144 / 3), r.mtbf);
  ok('availability = 2144 ÷ 2160', near(r.avail, 2144 / 2160), r.avail);
  ok('the machines are ranked by downtime', r.rows.map(x => x.unit).join() === 'TK101,EX005,TK102', r.rows.map(x => x.unit).join());
  const ht = R.compute(FIX, { days: 30, cls: 'HT', classOf: u => CLS[u] });
  ok('class HT: two machines, two failures, MTBF (1440 − 12) ÷ 2 = 714', ht.units === 2 && ht.failures === 2 && near(ht.mtbf, 714), JSON.stringify([ht.units, ht.failures, ht.mtbf]));
  const ninety = R.compute(FIX, { days: 120, classOf: u => CLS[u] });
  ok('a longer period takes in July\'s breakdown too', ninety.failures === 4 && near(ninety.downH, 116), JSON.stringify([ninety.failures, ninety.downH]));
  const quiet = R.compute(Object.assign({}, FIX, { relEvents: FIX.relEvents.filter(e => e.equip !== 'TK101' && e.equip !== 'TK102' && e.equip !== 'EX005') }), { days: 30, classOf: u => CLS[u] });
  ok('no failures: no MTBF, no MTTR, availability 100%', quiet.mtbf === null && quiet.mttr === null && quiet.avail === 1, JSON.stringify([quiet.mtbf, quiet.mttr, quiet.avail]));
  ok('no file at all is null, not zeros', R.compute(null, {}) === null && R.compute({ generated: 'x' }, {}) === null);
}

const PORT = 8147;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
let SERVE_REL = true;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/data/reliability.json') {
    if (!SERVE_REL) { res.writeHead(404); return res.end('nope'); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(FIX));
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT);

async function panel(b, file, lang, serve) {
  SERVE_REL = serve;
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(l => { localStorage.setItem('cm_dash_lang', l); }, lang);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/${file}#reports`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMRel && window.showTab, null, { timeout: 15000 });
  await p.evaluate(() => showTab('reports'));
  await p.waitForFunction(s => { const el = document.getElementById('relPanel'); return el && (s ? el.querySelector('#relKpis') : el.querySelector('[data-rel="nodata"]')); },
    serve, { timeout: 10000 }).catch(() => {});
  return { ctx, p, errs };
}

(async () => {
  const b = await chromium.launch();
  for (const file of ['dashboard/index.html', 'dashboard-next/index.html']) {
    console.log(`\n2. ${file}: THE PANEL ON REPORTS`);
    const { ctx, p, errs } = await panel(b, file, 'en', true);
    const t = await p.evaluate(() => {
      const g = id => { const el = document.getElementById(id); return el ? el.innerText : null; };
      return { mtbf: g('relMtbf'), mttr: g('relMttr'), av: g('relAvail'), f: g('relFails'),
        basis: (document.querySelector('[data-rel="basis"]') || {}).innerText || '',
        unknown: !!document.querySelector('[data-rel="unknown"]'),
        classes: [...document.querySelectorAll('#relByClass tbody tr')].map(r => r.dataset.cls),
        top: [...document.querySelectorAll('#relTop tbody tr')].map(r => r.dataset.unit) };
    });
    ok('the panel is on the Reports tab', t.mtbf !== null, JSON.stringify(t).slice(0, 200));
    // The panel opens on 90 days: T = 3 × 90 × 24 = 6480, MTBF = (6480 − 16) ÷ 3.
    ok('MTBF reads 2 155 h — (6480 − 16) ÷ 3, rounded', /2\s?155\s*h/.test(t.mtbf || ''), t.mtbf);
    ok('MTTR reads 8.0 h', /8\.0\s*h/.test(t.mttr || ''), t.mttr);
    ok('availability reads 99.8% — 6464 ÷ 6480', /99\.8%/.test(t.av || ''), t.av);
    ok('three failures over three machines', /^Failures\s*3/.test((t.f || '').replace(/\n/g, ' ')) || /\b3\b/.test(t.f || ''), t.f);
    ok('the basis is printed: machines × days × 24', /3 machines × 90 days × 24 h/.test(t.basis), t.basis);
    ok('the failure with no downtime figure is said out loud', t.unknown);
    const want = await p.evaluate(() => [...new Set(['TK101', 'TK102', 'EX005'].map(u => (ASSET_BY[u] && ASSET_BY[u].cls) || ''))].sort());
    ok('one row per class, read off the page\'s own register', t.classes.join() === want.join(), t.classes.join() + ' vs ' + want.join());
    ok('machines ranked by downtime', t.top.join() === 'TK101,EX005,TK102', t.top.join());
    // controls
    await p.selectOption('#relDays', '365');
    const f365 = await p.evaluate(() => document.getElementById('relFails').innerText);
    ok('365 days takes in July\'s breakdown: four failures', /\b4\b/.test(f365), f365);
    const tkCls = await p.evaluate(() => (ASSET_BY.TK101 && ASSET_BY.TK101.cls) || '');
    await p.selectOption('#relCls', tkCls);
    const ht = await p.evaluate(() => ({ f: document.getElementById('relFails').innerText, d: document.getElementById('relDays').value,
      rows: [...document.querySelectorAll('#relTop tbody tr')].map(r => r.dataset.unit) }));
    ok('a class keeps the period and narrows to its own machines', ht.d === '365' && !ht.rows.includes('EX005') && ht.rows.includes('TK101'), JSON.stringify(ht));
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#relCsv')]);
    let csv = '';
    if (dl) { const fp = await dl.path(); csv = fs.readFileSync(fp, 'utf8'); }
    ok('the CSV downloads with a row per class and per machine', /^﻿?scope,class,unit/.test(csv) && /,TK101,/.test(csv), csv.slice(0, 160));
    ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
    await ctx.close();

    console.log(`\n3. ${file}: NO FILE YET`);
    const n = await panel(b, file, 'en', false);
    const nd = await n.p.evaluate(() => ({ msg: (document.querySelector('[data-rel="nodata"]') || {}).innerText || '', kpis: !!document.getElementById('relKpis') }));
    ok('says the figures arrive with the hourly 1C pull', /hourly 1C pull/.test(nd.msg), nd.msg);
    ok('and prints no tiles — no zeros standing in for a measurement', !nd.kpis);
    await n.ctx.close();

    console.log(`\n4. ${file}: IN RUSSIAN`);
    const r = await panel(b, file, 'ru', true);
    const ru = await r.p.evaluate(() => ({ h: (document.querySelector('#relPanel h2') || {}).innerText || '', av: (document.getElementById('relAvail') || {}).innerText || '' }));
    ok('the heading is Russian', /Надёжность/.test(ru.h), ru.h);
    ok('and so are the tiles', /Готовность/i.test(ru.av), ru.av);
    await r.ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); srv.close(); process.exit(1); });
