/* The worksheet table kit, run against /dashboard-next/ (the parallel redesign
   copy) instead of the live /dashboard/. Same suite as tests/tablekit.cjs,
   retargeted only in its .goto() call — the live dashboard is untouched, this
   is the new page's own acceptance check.

   Self-contained: serves the repo on a private port and loads the fleet fixture.
   Run: node tests/tablekit-next.cjs */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
/* /mobile/sw.js is served here as a STATIC MOCK, pinned to dashboard-next's own
   live ?v= tag (read off the real file, never a copied-in number) -- the same
   fix tests/tablekit-scale-next.cjs and tests/period-filter-next.cjs already
   carry, for the identical reason: dashboard-next's own self-update watcher
   (BUILT/look()/applyIfIdle() near the end of the file) fetches the real
   /mobile/sw.js and reloads the page the moment it reads "newer" -- which,
   since dashboard-next's own tag lags the mainline's constantly-bumped BUILD
   by design, it almost always does. A document-level click (capture phase)
   schedules that reload 300ms later, and a plain click on a button or row
   holds no focus busy() recognises, so nothing here held it back -- a real
   navigation mid-test, discarding whatever in-memory state (setDriveRecords,
   a CMDrive stub, window.__writes) the test had just set up. Confirmed via
   tests/period-filter-next.cjs's own investigation: the reload only shows up
   once enough wall-clock time has passed for look()'s first 4-second timer to
   have already fired before a later click, so it is a genuine, if timing-
   dependent, race -- not a one-off flake -- and it can hit ANY -next.cjs
   suite that clicks around dashboard-next without this mock. Pinning it to
   the page's own real (lower) tag makes `newer` false for the length of this
   run, for both pages -- dashboard/'s own identical self-update check reads
   the same mocked file and never sees a build higher than its own. */
const nextHtmlForSw = fs.readFileSync(path.join(ROOT, 'dashboard-next', 'index.html'), 'utf8');
const pinnedSwBuild = (nextHtmlForSw.match(/magnetic_plug\.js\?v=([^"&]+)/) || [])[1];
if (!pinnedSwBuild) throw new Error('could not read dashboard-next\'s own ?v= tag to pin the mobile/sw.js mock to');
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/mobile/sw.js') { r.writeHead(200, { 'content-type': 'application/javascript' }); r.end(`const BUILD = "${pinnedSwBuild}";`); return; }
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
});
const FLEET = JSON.parse(fs.readFileSync(path.join(__dirname, 'fleet-fixture.json'), 'utf8'));

/* [tab, table id, a column key to filter on, whether the table has paging] */
const TABLES = [['failure', 'failAffTbl'], ['wear', 'wearTbl'], ['overview', 'covTbl'], ['overview', 'fleetTbl']];

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await p.goto(`http://127.0.0.1:${port}/dashboard-next/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await p.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await p.waitForTimeout(1200);

  const rows = id => p.evaluate(id => [...document.querySelectorAll('#' + id + ' tbody tr')].filter(r => !r.querySelector('td.empty')).map(r => [...r.children].map(c => c.textContent.trim())), id);
  const go = tab => p.evaluate(t => document.querySelector(`nav.tabs button[data-tab="${t}"]`).click(), tab).then(() => p.waitForTimeout(700));

  for (const [tab, id] of TABLES) {
    await go(tab);
    /* Stage 3c item 7: covTbl now sits behind a closed <details class="covdetails">
       on the Overview page (Main.dc.html's own compliance card holds only the
       percentage, caption and bar by default) -- open it before touching the
       filter box inside, the same way a person would. */
    if (id === 'covTbl') {
      await p.evaluate(() => { const d = document.querySelector('.covdetails'); if (d) d.open = true; });
      await p.waitForTimeout(150);
    }
    console.log(`\n${id}`);
    const ths = await p.$$(`#${id} thead tr:first-child th`);
    const fin = await p.$$(`#${id} thead input.cwcf`);
    ok(`${id}: has a filter box`, fin.length > 0, fin.length + ' boxes');
    ok(`${id}: has sortable headers`, (await p.$$(`#${id} thead th.sortable`)).length >= 3);
    const all = await rows(id);
    ok(`${id}: has rows to work on`, all.length > 0, all.length + ' on page');

    /* filter: pick a word from the first data cell of the first filterable column, type it, rows shrink or stay and all match */
    const idx = await p.evaluate(id => [...document.querySelectorAll(`#${id} thead input.cwcf`)].map(i => i.dataset.k), id);
    const firstInput = await p.$(`#${id} thead input.cwcf`);
    const colPos = await p.evaluate(id => { const i = document.querySelector(`#${id} thead input.cwcf`); return [...i.closest('tr').children].indexOf(i.closest('th')); }, id);
    const word = (all[0][colPos] || '').split(/\s+/)[0];
    if (word) {
      await firstInput.click();
      await firstInput.type(word.slice(0, 4), { delay: 20 });
      await p.waitForTimeout(400);
      const f = await rows(id);
      ok(`${id}: filter keeps only matching rows`, f.length > 0 && f.every(r => r[colPos].toLowerCase().includes(word.slice(0, 4).toLowerCase())), f.length + ' rows');
      const still = await p.evaluate(id => document.activeElement && document.activeElement.classList.contains('cwcf') && document.activeElement.value, id);
      ok(`${id}: typing keeps focus and text`, still === word.slice(0, 4), JSON.stringify(still));
      /* nonsense empties gracefully and keeps the box */
      await p.keyboard.type('zzqq9', { delay: 10 }); await p.waitForTimeout(400);
      ok(`${id}: filtered to nothing keeps its filter box`, (await p.$$(`#${id} thead input.cwcf`)).length === fin.length);
      for (let i = 0; i < 12; i++) await p.keyboard.press('Backspace');
      await p.waitForTimeout(400);
      const back = await rows(id);
      ok(`${id}: clearing the filter restores the list`, back.length === all.length, back.length + ' vs ' + all.length);
    }

    /* sort: click the first sortable header, then again, then again */
    const sortable = await p.$$(`#${id} thead th.sortable`);
    if (sortable.length) {
      const before = JSON.stringify(await rows(id));
      await sortable[0].click(); await p.waitForTimeout(300);
      const a = await rows(id);
      const th0 = await p.$(`#${id} thead th.sortable`);
      ok(`${id}: first click sorts ascending`, (await th0.getAttribute('aria-sort')) === 'ascending' || JSON.stringify(a) !== before, await th0.getAttribute('aria-sort'));
      await (await p.$(`#${id} thead th.sortable`)).click(); await p.waitForTimeout(300);
      const d = await rows(id);
      ok(`${id}: second click reverses`, JSON.stringify(d) !== JSON.stringify(a) || a.length < 2);
    }

    const hs = await p.evaluate(() => [...document.querySelectorAll('main *')].filter(e => e.scrollWidth > e.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowX) && e.offsetParent).length);
    ok(`${id}: nothing scrolls sideways at 1366`, hs === 0, hs + ' scrollers');
  }

  /* whole-list sort: on the wear register (paged) descending "worn" puts the true maximum first */
  await go('wear');
  const hdr = await p.evaluate(() => [...document.querySelectorAll('#wearTbl thead th.sortable')].map(t => t.dataset.sort));
  ok('wear: sortable columns are keyed', hdr.length >= 5, hdr.join(','));

  /* sort runs over the whole list: after sorting by mm-left ascending, every value on
     page 2 is >= every value on page 1 (a per-page sort would fail this) */
  const pos = await p.evaluate(() => { const th = document.querySelector('#wearTbl thead th.sortable[data-sort="mm"]'); return [...th.parentElement.children].indexOf(th); });
  await p.click('#wearTbl thead th.sortable[data-sort="mm"]');
  await p.waitForFunction(() => { const t = document.querySelector('#wearTbl thead th.sortable[data-sort="mm"]'); return t && t.getAttribute('aria-sort') === 'ascending'; });
  await p.waitForTimeout(300);
  const num = t => parseFloat(String(t).replace(/[^0-9.\-]/g, ''));
  const p1 = (await rows('wearTbl')).map(r => num(r[pos]));
  const first1 = JSON.stringify(await rows('wearTbl'));
  await p.evaluate(() => { const b = [...document.querySelectorAll('#tab-wear .pager .btn')].find(x => /next/i.test(x.textContent)); b && b.click(); });
  await p.waitForFunction(f => { const r = [...document.querySelectorAll('#wearTbl tbody tr')].map(x => [...x.children].map(c => c.textContent.trim())); return JSON.stringify(r) !== f; }, first1);
  await p.waitForTimeout(300);
  const p2 = (await rows('wearTbl')).map(r => num(r[pos]));
  ok('wear: ascending sort holds across pages (whole-list sort)', p1.length > 1 && p2.length > 0 && Math.max(...p1) <= Math.min(...p2), `p1 max ${Math.max(...p1)} <= p2 min ${Math.min(...p2)}`);

  /* equipment history: one shared filter/sort over every round's table */
  await go('equipment');
  const hb = await p.evaluate(() => ({ boxes: document.querySelectorAll('#history input.cwcf').length, sortable: document.querySelectorAll('#history th.sortable').length, rows: document.querySelectorAll('#history tr.hrow').length }));
  ok('history: filter boxes and sort over the visit tables', hb.boxes >= 6 && hb.sortable >= 6 && hb.rows > 0, JSON.stringify(hb));
  const w = await p.evaluate(() => { const r = document.querySelector('#history tr.hrow td:nth-child(2)'); return r ? r.textContent.trim().split(/\s+/)[0] : ''; });
  if (w) {
    await p.evaluate(() => document.querySelectorAll('#history input.cwcf')[1].focus());
    await p.keyboard.type(w.slice(0, 4), { delay: 20 }); await p.waitForTimeout(400);
    const hr = await p.evaluate(() => [...document.querySelectorAll('#history tr.hrow td:nth-child(2)')].map(t => t.textContent.toLowerCase()));
    ok('history: column filter narrows every visit table', hr.length > 0 && hr.every(x => x.includes(w.slice(0, 4).toLowerCase())), hr.length + ' rows');
    ok('history: typing keeps focus', await p.evaluate(() => document.activeElement.classList.contains('cwcf')), await p.evaluate(() => { const a = document.activeElement; return a.tagName + '.' + a.className + '#' + a.id + ' inputs=' + [...document.querySelectorAll('#history input.cwcf')].map(i => i.value).join('|'); }));
    for (let i = 0; i < 6; i++) await p.keyboard.press('Backspace');
    await p.waitForTimeout(300);
  }

  /* lubrication gap lists */
  await go('lube');
  const lg = await p.evaluate(() => ({ a: document.querySelectorAll('#lgNoRef input.cwcf').length, b: document.querySelectorAll('#lgNoMach input.cwcf').length }));
  ok('lube gap lists have filter boxes', lg.a === 4 && lg.b === 3, JSON.stringify(lg));

  /* status is coloured text, not a chip */
  await go('overview');
  const chip = await p.evaluate(() => { const e = document.querySelector('main .pill'); if (!e) return null; const s = getComputedStyle(e); return { bg: s.backgroundColor, br: s.borderRadius, pad: s.paddingLeft }; });
  ok('pills carry no background, radius or padding', !chip || (chip.bg === 'rgba(0, 0, 0, 0)' && chip.pad === '0px'), JSON.stringify(chip));

  /* row density: a data row is compact */
  const rh = await p.evaluate(() => { const r = document.querySelector('#covTbl tbody tr'); return r ? r.getBoundingClientRect().height : 0; });
  ok('worksheet rows are compact (<= 56 px, most one line)', rh > 0 && rh <= 56, rh + ' px');

  /* every tab draws with no script error */
  for (const t of ['overview','failure','wear','actions','due','planact','cmwo','equipment','lube','sync','reports']) await go(t);
  ok('no page errors across all 11 tabs', errs.length === 0, errs.slice(0, 2).join(' | '));

  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length ? 1 : 0);
})();
