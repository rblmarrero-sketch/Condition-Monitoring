/* CM_CARDS_V1: no table scrolls sideways inside the page, at any width (site rule SITE_STD_V1 9.1).

   Both office pages, with the fleet fixture, in English and Russian:
     · at 1440 and 1280 a table a little too wide is FITTED (its fixed columns shrink, a column holding buttons
       keeps its width) and stays a table - the action register at 1280 included;
     · at 390 a table that does not fit becomes cards (table.ascards): every value under its column's name;
     · at every width no box around a table scrolls sideways;
     · labels follow the language; nothing runs past its card.
   Run: node tests/cards.cjs */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
const tag = (fs.readFileSync(path.join(ROOT, 'dashboard-next', 'index.html'), 'utf8').match(/magnetic_plug\.js\?v=([^"&]+)/) || [])[1];
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/mobile/sw.js') { r.writeHead(200, { 'content-type': 'application/javascript' }); r.end(`const BUILD = "${tag}";`); return; }
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
});
const FLEET = JSON.parse(fs.readFileSync(path.join(__dirname, 'fleet-fixture.json'), 'utf8'));
const TABS = ['overview', 'due', 'planact', 'actions', 'failure', 'equipment', 'cmwo'];
const SCAN = () => {
  const out = { bars: [], cards: [], tables: [], badLabel: [], past: [] };
  for (const t of document.querySelectorAll('main table.grid')) {
    if (!t.offsetParent) continue;
    const box = t.parentElement, id = (t.closest('[id]') || {}).id + ' table.' + [...t.classList].join('.');
    if (box.scrollWidth > box.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(box).overflowX)) out.bars.push(id + ' ' + box.clientWidth + '/' + box.scrollWidth);
    (t.classList.contains('ascards') ? out.cards : out.tables).push(id);
    if (t.classList.contains('ascards')) {
      const tr = t.tBodies[0] && [...t.tBodies[0].rows].find(r => r.cells.length > 1);
      if (tr) for (const td of tr.cells) {
        if (td.classList.contains('nolab')) continue;
        const l = td.getAttribute('data-label');
        if (!l) out.badLabel.push(id + ' cell ' + td.cellIndex);
        const r = td.getBoundingClientRect(), R = tr.getBoundingClientRect();
        if (r.right > R.right + 1) out.past.push(id + ' ' + l);
      }
    }
  }
  return out;
};
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch();
  for (const file of ['dashboard', 'dashboard-next']) for (const lang of ['en', 'ru']) for (const W of [1440, 1280, 390]) {
    console.log(`\n== ${file} ${lang} ${W}`);
    const ph = W < 600;
    const ctx = await b.newContext({ viewport: { width: W, height: 900 }, isMobile: ph, hasTouch: ph });
    await ctx.addInitScript(l => { localStorage.setItem('cm_dash_lang', l); }, lang);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${port}/${file}/index.html`); await p.waitForTimeout(1200);
    await p.evaluate(f => { window.CMDash.setDriveRecords(f); const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); }, FLEET);
    const all = { bars: [], cards: [], tables: [], badLabel: [], past: [] };
    for (const t of TABS) {
      await p.evaluate(t => showTab(t, true), t); await p.waitForTimeout(500);
      const s = await p.evaluate(SCAN); for (const k in all) all[k].push(...s[k].map(x => t + ': ' + x));
    }
    ok('no table box scrolls sideways', !all.bars.length, all.bars.join(' | '));
    if (!ph) {
      ok('on a desk every table stays a table', !all.cards.length, all.cards.join(' | '));
      if (W === 1280) ok('the action register at 1280 is a table, fitted', all.tables.some(x => x.startsWith('actions:')), all.tables.filter(x => x.startsWith('actions')).join(' '));
    } else {
      ok('on a phone the wide tables are cards', ['due:', 'actions:', 'cmwo:'].every(k => all.cards.some(x => x.startsWith(k))), all.cards.length + ' card table(s)');
      ok('every card value carries its column name', !all.badLabel.length, all.badLabel.slice(0, 4).join(' | '));
      ok('nothing runs past its card', !all.past.length, all.past.slice(0, 4).join(' | '));
      if (lang === 'ru') {
        await p.evaluate(() => showTab('actions', true)); await p.waitForTimeout(400);
        const l = await p.evaluate(() => { const td = document.querySelector('#actionTbl table.ascards tbody tr td[data-label]:not(.nolab)'); return td && td.getAttribute('data-label'); });
        ok('the card labels are in Russian', /[А-Яа-я]/.test(l || ''), l);
      }
    }
    ok('no page errors', !errs.length, errs.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed'); process.exit(fails.length ? 1 : 0);
})();
