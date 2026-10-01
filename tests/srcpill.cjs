/* THE HEADER PILL NAMES WHAT IS MISSING.

   Audit of 2026-10-01: every screen of a fresh office browser said "No data
   yet — click to connect", while the 1C plan (data/work_orders.js, refreshed
   hourly by its own job and attached to nothing) was live on Plan vs Actual,
   Defects raised and the Inspection Schedule. The pill overstated how empty
   the page was. It now says the 1C half is there and the inspection half is
   not — and only says "no data" when neither is.

   Both office pages (both permanent, CLAUDE.md), both languages.

   Run: node tests/srcpill.cjs */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const I18N = {};

const PORT = 8149;
let NO_WO = false;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (NO_WO && u.pathname === '/data/work_orders.js') { res.writeHead(404); return res.end(); }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT);

async function open(b, file, lang) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } });
  await ctx.addInitScript(l => { localStorage.setItem('cm_dash_lang', l); }, lang);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/${file}`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMDash && document.getElementById('srcText'), null, { timeout: 15000 });
  await p.waitForTimeout(300);
  const st = await p.evaluate(() => {
    const c = document.getElementById('srcChip');
    return { text: document.getElementById('srcText').textContent, cls: c.className, title: c.title,
      want: { none: t('srcnone'), half: t('srcnone_1c'), tip: t('src_1c_t'), tt: t('srctitle') } };
  });
  return { ctx, p, errs, st };
}

(async () => {
  const b = await chromium.launch();
  for (const file of ['dashboard/index.html', 'dashboard-next/index.html']) {
    for (const lang of ['en', 'ru']) {
      console.log(`\n${file} · ${lang}`);
      NO_WO = false;
      const a = await open(b, file, lang);
      ok('with the 1C plan loaded and no inspection backend, the pill says the 1C half is live', a.st.text === a.st.want.half, a.st.text);
      ok('it does not say "no data"', a.st.text !== a.st.want.none);
      ok('the dot is the half-connected one, not the grey of nothing and not the green of everything', /\bhalf\b/.test(a.st.cls) && !/\blive\b/.test(a.st.cls), a.st.cls);
      ok('hovering explains which screens are which', a.st.title === a.st.want.tip && a.st.title.length > 40, a.st.title.slice(0, 80));
      if (lang === 'en') ok('in words that name 1C and the inspections', /1C/.test(a.st.text) && /inspections/i.test(a.st.text), a.st.text);
      else ok('in Russian', /1С/.test(a.st.text) && /осмотр/i.test(a.st.text), a.st.text);
      // records arrive — the ordinary connected state takes over
      await a.p.evaluate(() => CMDash.importRecords([{ equip: 'TK146', date: '2026-09-01', type: 'MP', by: 'x',
        items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 1 }] }], 'x.json'));
      await a.p.waitForTimeout(200);
      const live = await a.p.evaluate(() => ({ text: document.getElementById('srcText').textContent, cls: document.getElementById('srcChip').className, title: document.getElementById('srcChip').title, tt: t('srctitle') }));
      ok('once inspections are loaded the pill counts them and goes green', /\blive\b/.test(live.cls) && !/\bhalf\b/.test(live.cls) && /1/.test(live.text), JSON.stringify(live).slice(0, 160));
      ok('and the ordinary tooltip comes back', live.title === live.tt, live.title);
      ok('no page errors', a.errs.length === 0, a.errs.slice(0, 2).join(' | ') || 'none');
      await a.ctx.close();

      NO_WO = true;
      const n = await open(b, file, lang);
      ok('with neither source, it says there is no data', n.st.text === n.st.want.none, n.st.text);
      ok('with the grey dot', !/\bhalf\b|\blive\b/.test(n.st.cls), n.st.cls);
      await n.ctx.close();
    }
  }
  await b.close(); srv.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); srv.close(); process.exit(1); });
