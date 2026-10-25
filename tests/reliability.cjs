/* RELIABILITY ON REPORTS — THE SITE'S OWN FIGURES, ON BOTH DESKS.

   Decided 2026-10-26 ("show the site figures"): the Reports panel prints the
   reliability site's official MTBF / MTTR / availability from /site_kpi.json
   (SITE_KPI_V1, written by PECHANKA's build next to the homepage, the same
   numbers as the homepage cards) and computes nothing itself. This opens
   Reports on BOTH office pages (dashboard/ and dashboard-next/ are both
   permanent, CLAUDE.md), with a made-up site file served at /site_kpi.json,
   and reads what the panel prints:

     - the week's availability, failures, MTBF and MTTR, exactly the strings
       the file says the homepage shows; week / MTD / YTD for Primary and All;
       the Weekly report's fleets; the data-as-of line; the links to the site;
     - data/reliability.json (the retired work-order calculation) is never
       requested;
     - a week with 0 failures has no MTBF or MTTR, in words;
     - no file (Firebase / GitHub Pages), or a host that answers with its own
       page instead of the file: one sentence saying where the figures are,
       with the link, and no numbers at all;
     - Russian is Russian; the CSV downloads; a day-old file says so.

   Run: node tests/reliability.cjs */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const siteNow = () => { const d = new Date(Date.now() + 12 * 3600e3); return d.toISOString().slice(0, 16).replace('T', ' '); };
const per = (pa, f, mtbf, mttr, units, plan) => ({ pa_pct: pa, failures: f, mtbf_h: mtbf, mttr_h: mttr, operating_h: 1, scheduled_h: 1, downtime_h: 1, units, plan_pct: plan == null ? null : plan,
  shown: { pa: Math.round(pa) + '%', mtbf: mtbf == null ? null : String(Math.round(mtbf)), mttr: mttr == null ? null : String(Math.round(mttr)) } });
function fixture(o) {
  o = o || {};
  const wk = o.zero ? per(100, 0, null, null, 145, 89) : per(81.2, 259, 75.2, 14.0, 145, 89);
  return {
    marker: 'SITE_KPI_V1', v: 1, source: 'site engine acd.json', source_detail: 'test',
    generated_site: siteNow(), data_as_of_site: o.asof || siteNow(),
    week: { label: '2026-W43', no: 43, from: '2026-10-19', to: '2026-10-25' },
    mtd: { from: '2026-10-01', to: '2026-10-25' }, ytd: { from: '2026-01-01', to: '2026-10-25' },
    scopes: {
      Primary: { units: 145, avail24_pct: 82.0, week: wk, mtd: per(79.6, 812, 78.4, 15.1, 145, 89), ytd: per(79.2, 10421, 75.6, 15.3, 145, 89) },
      All: { units: 637, avail24_pct: 85.0, week: per(84.3, 402, 160.1, 12.2, 637), mtd: per(84.0, 1300, 150.2, 12.9, 637), ytd: per(83.1, 16000, 140.4, 13.3, 637) },
    },
    home: { week_label: '2026-W43 · 10/19/2026–10/25/2026', units: '145', week: { actual: '81%', mtbf: '75', mttr: '14', plan: '89' } },
    fleets: [
      { k: 'exc', en: 'Excavator', ru: 'Экскаваторы', units: 22, pa_pct: 78.4, failures: 58, mtbf_h: 56.0, mttr_h: 5.0, shown: { pa: 78, mtbf: 56, mttr: 5 } },
      { k: 'drl', en: 'Drill', ru: 'Буровые', units: 9, pa_pct: 95.0, failures: 0, mtbf_h: null, mttr_h: null, shown: { pa: 95, mtbf: null, mttr: null } },
    ],
    fleets_note: 'Weekly report fleets', links: { home: '/', weekly_report: '/weekly_report.html' },
  };
}

const PORT = 8147;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
let MODE = 'ok', FIX = fixture(), HITS = [];
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (/reliability\.json$/.test(u.pathname)) HITS.push(u.pathname);
  if (u.pathname === '/site_kpi.json') {
    if (MODE === '404') { res.writeHead(404); return res.end('nope'); }
    if (MODE === 'spa') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><html><body>app</body></html>'); }
    if (MODE === 'other') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"hello":1}'); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(FIX));
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT);

async function panel(b, file, lang, mode, fix) {
  MODE = mode; FIX = fix || fixture(); HITS = [];
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(l => { localStorage.setItem('cm_dash_lang', l); }, lang);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/${file}#reports`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMRel && window.showTab, null, { timeout: 15000 });
  await p.evaluate(() => showTab('reports'));
  await p.waitForFunction(() => { const el = document.getElementById('relPanel'); return el && (el.querySelector('#relKpis') || el.querySelector('[data-rel="away"]')); },
    null, { timeout: 15000 }).catch(() => {});
  return { ctx, p, errs };
}
const read = p => p.evaluate(() => {
  const g = id => { const el = document.getElementById(id); return el ? el.innerText.replace(/\s+/g, ' ').trim() : null; };
  const el = document.getElementById('relPanel');
  return { av: g('relAvail'), f: g('relFails'), mtbf: g('relMtbf'), mttr: g('relMttr'),
    periods: [...document.querySelectorAll('#relPeriods tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ').trim()),
    fleets: [...document.querySelectorAll('#relFleets tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ').trim()),
    basis: (document.querySelector('[data-rel="basis"]') || {}).innerText || '',
    stale: !!document.querySelector('[data-rel="stale"]'),
    links: [...el.querySelectorAll('a')].map(a => a.href),
    away: (document.querySelector('[data-rel="away"]') || {}).innerText || '',
    h: (el.querySelector('h2') || {}).innerText || '', text: el.innerText };
});

(async () => {
  const b = await chromium.launch();
  for (const file of ['dashboard/index.html', 'dashboard-next/index.html']) {
    console.log(`\n1. ${file}: THE SITE'S FIGURES ON REPORTS`);
    const { ctx, p, errs } = await panel(b, file, 'en', 'ok');
    const t = await read(p);
    ok('the panel is on the Reports tab, with four tiles', t.av !== null && t.mttr !== null, JSON.stringify(t).slice(0, 160));
    ok('availability = the homepage string, 81% (week 43)', /Week 43/i.test(t.av) && /\b81%/.test(t.av) && /plan 89%/.test(t.av), t.av);
    ok('failures 259, ISO count from the file', /\b259\b/.test(t.f) && /145 Primary units/.test(t.f), t.f);
    ok('MTBF 75 h', /\b75 h\b/.test(t.mtbf), t.mtbf);
    ok('MTTR 14 h', /\b14 h\b/.test(t.mttr), t.mttr);
    ok('week, MTD, YTD for Primary and All (2 headings + 6 rows)', t.periods.length === 8 && /Year to date 79% 10421 76 15/.test(t.periods.join('|')) && /All equipment \(637 units\)/.test(t.periods.join('|')), t.periods.join(' | '));
    ok('the Weekly report fleets, a 0-failure fleet without MTBF / MTTR', t.fleets.length === 2 && /^Excavator 22 78% 58 56 5$/.test(t.fleets[0]) && /^Drill 9 95% 0 — —$/.test(t.fleets[1]), t.fleets.join(' | '));
    ok('data-as-of and the week dates in the site\'s date style', /Data as of \d\d\.\d\d\.\d{4} \d\d:\d\d site/.test(t.basis) && /19\.10\.2026 – 25\.10\.2026/.test(t.basis), t.basis);
    ok('"same figures as the homepage", linked to the site and the Weekly report',
      /Same figures as the reliability site homepage/.test(t.text) && t.links.includes('https://maintenance.vegadevelopment.com/') && t.links.includes('https://maintenance.vegadevelopment.com/weekly_report.html'), t.links.join(' '));
    ok('a fresh file carries no stale warning', !t.stale);
    ok('data/reliability.json (the retired work-order calculation) is never requested', HITS.length === 0, HITS.join(','));
    ok('no work-order wording left (no "corrective work orders", no period / class pickers)', !/corrective work orders/i.test(t.text) && !(await p.$('#relDays')) && !(await p.$('#relCls')));
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#relCsv')]);
    let csv = ''; if (dl) { const fp = await dl.path(); csv = fs.readFileSync(fp, 'utf8'); }
    ok('the CSV downloads: Primary / All periods, fleets, the source', /^\ufeff?scope,period,from,to/.test(csv) && /Primary,week,2026-10-19,2026-10-25,145,81\.2,259,75\.2,14/.test(csv) && /fleet:Excavator/.test(csv) && /site engine acd\.json/.test(csv), csv.slice(0, 200));
    ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
    await ctx.close();

    console.log(`\n2. ${file}: A WEEK WITH NO FAILURES, A FILE A DAY OLD`);
    const z = await panel(b, file, 'en', 'ok', fixture({ zero: true, asof: '2026-01-02 08:00' }));
    const tz = await read(z.p);
    ok('0 failures: MTBF and MTTR are "—" and say why', /—/.test(tz.mtbf) && /no failures this week/.test(tz.mtbf) && /—/.test(tz.mttr), tz.mtbf + ' / ' + tz.mttr);
    ok('availability 100%', /100%/.test(tz.av), tz.av);
    ok('an old file says it is old', tz.stale, tz.basis);
    await z.ctx.close();

    for (const mode of ['404', 'spa', 'other']) {
      console.log(`\n3. ${file}: NO SITE FILE (${mode === '404' ? 'Firebase / GitHub Pages: 404' : mode === 'spa' ? 'a host answering with its own page' : 'some other JSON'})`);
      const n = await panel(b, file, 'en', mode);
      const tn = await read(n.p);
      ok('one sentence saying where the figures are, linked', /Site reliability figures are on maintenance\.vegadevelopment\.com/.test(tn.away) && tn.links.includes('https://maintenance.vegadevelopment.com/'), tn.away);
      ok('and no numbers at all: no tiles, no tables, no digits but the address', tn.av === null && !tn.periods.length && !tn.fleets.length && !/\d/.test(tn.text.replace(/maintenance\.vegadevelopment\.com/g, '')), tn.text.slice(0, 120));
      ok('data/reliability.json is not read as a fallback', HITS.length === 0, HITS.join(','));
      ok('no page errors', n.errs.length === 0, n.errs.slice(0, 2).join(' | ') || 'none');
      await n.ctx.close();
    }

    console.log(`\n4. ${file}: IN RUSSIAN`);
    const r = await panel(b, file, 'ru', 'ok');
    const ru = await read(r.p);
    ok('the heading is Russian', /Надёжность/.test(ru.h), ru.h);
    ok('and so are the tiles, the fleets and the source line', /Готовность · Неделя 43/i.test(ru.av) && /Экскаваторы/.test(ru.fleets.join()) && /Те же показатели, что на главной странице/.test(ru.text), ru.av + ' | ' + ru.fleets[0]);
    ok('the numbers are the same strings', /\b81%/.test(ru.av) && /\b75 ч/.test(ru.mtbf), ru.mtbf);
    await r.ctx.close();
    const ra = await panel(b, file, 'ru', '404');
    const ta = await read(ra.p);
    ok('Russian, no file: the sentence is Russian', /Показатели надёжности сайта — на maintenance\.vegadevelopment\.com/.test(ta.away), ta.away);
    await ra.ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); srv.close(); process.exit(1); });
