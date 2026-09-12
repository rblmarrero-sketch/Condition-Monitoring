/* WHICH ROUNDS CARRY A DRAWING — AND BOTH SURFACES HAVE TO AGREE.

   Reported from the field: a Filter Cut sheet for an EX1200 excavator,
   printed from the phone, carried "Where the wear is" — two track frames,
   the numbered roller walk and the Serviceable / Watch / At-or-past-condemn
   key — over a page about two oil filters.

   The cause was that ucStatus() answers a question about the MACHINE ("does
   this model have a track reference?"), not about the ROUND, and the phone's
   rptMapInner() fell through to the undercarriage branch for every type that
   was not TB or GET. Measured on a tracked machine at the time: MP, FC, INSP,
   TEMP and LUBE each came back with a BYTE-IDENTICAL 44,617-character
   undercarriage drawing — the same picture, five times, on five sheets none
   of which is about the undercarriage.

   The office never had the fault: dashboard/report.js has always carried
   `if (rec.type !== "UC") return {html:""}`. So the same round printed as two
   different documents depending on which end printed it — one fact with two
   answers, which is the defect this project keeps producing.

   So this suite asks BOTH surfaces the same question, through the entry point
   each one actually uses (the phone's rptMap, which is what the history
   sheet's Report button assigns to norm.mapHTML; the office's
   CMReport.normalise, which is what its own pipeline calls), and requires
   the same answer from each.

   Run: node tests/rptmapty.cjs   (starts its own server on 8493) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8493);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});

/* The rounds that ARE about a measured or graded walk over the machine, and
   so have a picture of it: the undercarriage, the tray, the tools. Taken from
   the app's own TYPE_META rather than listed here, so this suite cannot drift
   from the table the app schedules by. */
const DRAWS = ['UC', 'TB', 'GET'];
const NODRAW = ['MP', 'FC', 'INSP', 'TEMP', 'LUBE'];

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const errs = [];

  console.log('1. THE PHONE');
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('phone: ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(800);

  const phone = await p.evaluate(async (types) => {
    await needMap();
    const names = (window.ASSETS || []).map(a => a.n);
    const tracked = names.find(n => { const a = ASSET_BY[n]; return a && window.WEAR && WEAR.map[a.m || '']; });
    const tray = names.find(n => { try { return bodyStatus(n).ok; } catch (e) { return false; } });
    const draw = (unit, ty) => {
      if (!unit) return null;
      try { const m = rptMap({ equip: unit, type: ty, date: '2026-08-30', items: [] }, [], ''); return (m && m.html) ? m.html.length : 0; }
      catch (e) { return 'ERR ' + e.message; }
    };
    const out = { tracked, tray, meta: {}, onTracked: {}, onTray: {} };
    types.forEach(ty => { const m = TYPE_META[ty] || {}; out.meta[ty] = !!(m.wear || m.get); });
    types.forEach(ty => { out.onTracked[ty] = draw(tracked, ty); out.onTray[ty] = draw(tray, ty); });
    return out;
  }, DRAWS.concat(NODRAW));

  ok('there is a tracked machine and a tray machine to ask about', !!phone.tracked && !!phone.tray,
     phone.tracked + ' / ' + phone.tray);
  /* The app's own table has to agree with what this suite calls a drawing
     round, or the lists below are testing a rule nobody else follows. */
  ok('TYPE_META marks exactly UC, TB and GET as walked-and-measured rounds',
     DRAWS.every(t => phone.meta[t]) && NODRAW.every(t => !phone.meta[t]), JSON.stringify(phone.meta));

  console.log('\n   on a tracked machine (' + phone.tracked + ')');
  NODRAW.forEach(ty => ok('  ' + ty + ' gets no drawing', phone.onTracked[ty] === 0, String(phone.onTracked[ty])));
  ok('  UC still gets its undercarriage drawing', phone.onTracked.UC > 1000, String(phone.onTracked.UC));
  /* The bug's own signature: the SAME picture on every type. If a filter cut
     and an undercarriage round ever come back the same size again, they are
     the same drawing again. */
  ok('  and a Filter Cut is not simply the undercarriage drawing again',
     phone.onTracked.FC !== phone.onTracked.UC, 'FC ' + phone.onTracked.FC + ' vs UC ' + phone.onTracked.UC);

  console.log('\n   on a tray machine (' + phone.tray + ')');
  ok('  TB gets its dump-body drawing', phone.onTray.TB > 100, String(phone.onTray.TB));
  ['FC', 'MP', 'LUBE'].forEach(ty => ok('  ' + ty + ' gets none', phone.onTray[ty] === 0, String(phone.onTray[ty])));

  console.log('\n2. THE OFFICE, ASKED THE SAME THING');
  const dp = await b.newPage({ viewport: { width: 1366, height: 768 } });
  dp.on('pageerror', e => errs.push('dash: ' + e.message));
  await dp.addInitScript(() => { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('cm_dash_lang', 'en'); });
  await dp.goto(`http://127.0.0.1:${PORT}/dashboard/index.html`, { waitUntil: 'load' });
  await dp.waitForTimeout(1500);

  const office = await dp.evaluate(async (args) => {
    const [unit, types] = args;
    const out = {};
    for (const ty of types) {
      const rec = { equip: unit, type: ty, date: '2026-08-30', cls: (ASSET_BY[unit] || {}).cls || '', items: [] };
      try { const n = await CMReport.normalise([rec]); out[ty] = (n && n[0] && n[0].mapHTML) ? n[0].mapHTML.length : 0; }
      catch (e) { out[ty] = 'ERR ' + e.message; }
    }
    return out;
  }, [phone.tracked, DRAWS.concat(NODRAW)]);

  NODRAW.forEach(ty => ok('  ' + ty + ' gets no drawing here either', office[ty] === 0, String(office[ty])));
  ok('  UC gets one', office.UC > 1000, String(office.UC));

  console.log('\n3. AND THE TWO ENDS AGREE, TYPE BY TYPE');
  /* Not "both are non-empty" — WHICH types draw has to be the same set on
     both surfaces, because a round printed at the mine and the same round
     printed at the office are supposed to be the same document. */
  const disagree = DRAWS.concat(NODRAW).filter(ty =>
    (phone.onTracked[ty] > 0) !== (office[ty] > 0));
  ok('no round type draws on one surface and not the other', disagree.length === 0,
     disagree.length ? disagree.map(t => t + ': phone ' + phone.onTracked[t] + ', office ' + office[t]).join(' | ') : 'agreed on all ' + (DRAWS.length + NODRAW.length));

  ok('no page errors on either surface', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');

  await b.close();
  srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
