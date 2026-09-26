/* "THE LIST OF SCHEDULE INCLUDES ALL THE SCHEDULE IN 1C... WE SHOULD BE ONLY
   PUTTING IN THE LIST THE COVERAGE OF CONDITION MONITORING."

   Plan vs Actual's main table (renderPlanActualTab/paRows) always listed
   EVERY 1C work order — a tyre change or an engine overhaul sits in the same
   table as a Magnetic Plug round, both scored by the identical columns, with
   nothing on the row saying one is a Condition Monitoring round and the
   other is 1C maintenance CM has never had an opinion on. Two screens ("no
   backend attached" vs "orphanPhotos still trusts the cache") have already
   taught this project that an unconfirmed number read as a stated one is
   worse than saying nothing — this is that shape at the top level: a table
   of "1C's plan" read, at a glance, as "Condition Monitoring's coverage".

   Two mockup options were put to the maintainer (color every row, or hide
   the ones CM doesn't track) and a third combining both was chosen: a
   toggle defaulting to CM-only (#paCmOnly, persisted as cm_pa_cmonly), a
   coverage percentage that stands regardless of the toggle (#paCoverage,
   computed from the same search/type/window-filtered set the KPI tiles
   read), and a coloured dot on every row's own Service cell so a row is
   never ambiguous even with the toggle off. paWeekData already excluded
   unmatched work orders on its own (see its own header comment) — untouched
   here, only the main table and its KPI tiles ever mixed the two.

   The phone's own Due tab was never part of this defect: data/schedule_slim
   .json is cut to CM-matched, open work orders at INGEST TIME (ingest_work_
   orders.py's own comment: 116 of 2,535 rows on the live fleet), so the List
   and Two weeks views are already, structurally, Condition Monitoring's own
   list — nothing to filter. A plain note (due_cm_note) says so in both
   views now, to answer the same question in the same words the dashboard
   does, without sending every phone the ~2,400 rows CM was never going to
   have an opinion on.

   Run: node tests/pacover.cjs   (needs the repo's own static files; spawns
   its own server) */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8531;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();

  console.log('1. THE DEFINITION: A ROW IS "COVERED" ONLY WHEN CM STILL OWNS IT');
  const ctx1 = await b.newContext();
  const p1 = await ctx1.newPage();
  const errs = []; p1.on('pageerror', e => errs.push(e.message));
  await p1.goto(`http://127.0.0.1:${PORT}/dashboard/index.html`, { waitUntil: 'load' });
  await p1.waitForFunction(() => !!window.CM_WO_DATA && typeof paCovered === 'function', null, { timeout: 25000 });
  const def = await p1.evaluate(() => ({
    resolved: paCovered({ info: { types: ['MP'] } }),
    unresolved: paCovered({ info: { types: null } }),
    heldOffEmpty: paCovered({ info: { types: [] } }),
    noInfo: paCovered({ info: null }),
  }));
  ok('a work order resolved to a real CM round is covered', def.resolved === true);
  ok('one 1C maintenance never maps to any CM round is not', def.unresolved === false);
  ok('one whose only round the site took off is not — CM is not watching it today either', def.heldOffEmpty === false);
  ok('a row with no info object at all does not throw', def.noInfo === false);

  console.log('\n2. THE MAIN TABLE DEFAULTS TO CM-ONLY, AND SAYS THE COVERAGE EITHER WAY');
  await p1.evaluate(() => showTab('planact'));
  await p1.waitForTimeout(150);
  const before = await p1.evaluate(() => {
    const rows = paRows();
    const covered = rows.filter(r => paCovered(r)).length;
    return {
      cmOnlyChecked: document.getElementById('paCmOnly').checked,
      coverageText: document.getElementById('paCoverage').textContent,
      totalRows: rows.length, covered,
      tableRows: document.querySelectorAll('#paList table.grid tbody tr').length,
      pagerText: (document.querySelector('#paList .pager .muted') || {}).textContent || '',
    };
  });
  ok('the toggle is ON by default — a fresh page opens on CM\'s own coverage', before.cmOnlyChecked === true);
  ok('the coverage line names both a percentage and the fraction', new RegExp('%').test(before.coverageText)
     && before.coverageText.indexOf(String(before.covered)) >= 0 && before.coverageText.indexOf(String(before.totalRows)) >= 0,
     before.coverageText);
  ok('  and it is strictly less than the full row count — there is real, unmatched 1C work in the fixture',
     before.covered > 0 && before.covered < before.totalRows, `${before.covered} of ${before.totalRows}`);
  const matchN = t => Number(String(t).match(/([\d,]+)\s*matching/)[1].replace(/,/g, ''));
  ok('with the toggle on, the pager\'s own total is capped at 25 on screen',
     before.tableRows === Math.min(25, matchN(before.pagerText)), `${before.tableRows} row(s) of ${matchN(before.pagerText)}`);

  console.log('\n3. TURNING IT OFF REVEALS THE REST OF 1C\'S PLAN, AND THE PERCENTAGE DOES NOT MOVE');
  const after = await p1.evaluate(() => {
    document.getElementById('paCmOnly').checked = false;
    document.getElementById('paCmOnly').onchange();
    const rows = paRows();
    return {
      coverageText: document.getElementById('paCoverage').textContent,
      tableRows: document.querySelectorAll('#paList table.grid tbody tr').length,
      totalRows: rows.length,
      pagerText: (document.querySelector('#paList .pager .muted') || {}).textContent || '',
    };
  });
  ok('the coverage line reads the same with the toggle off — it is not a function of what is shown',
     after.coverageText === before.coverageText, after.coverageText);
  /* The default scope ("Open") narrows the pager's own total the same way
     with the toggle on or off — 150 open+covered vs 273 open, covered or
     not — so what has to grow is the pager's count, not match paRows()'s
     unscoped total (2,641, open and completed work orders together). */
  ok('the pager now counts more of 1C\'s plan, not just the covered ones',
     matchN(after.pagerText) > matchN(before.pagerText), `${matchN(before.pagerText)} -> ${matchN(after.pagerText)}`);
  ok('  the visible page is still capped at 25',
     after.tableRows === Math.min(25, matchN(after.pagerText)), `${after.tableRows} of ${matchN(after.pagerText)}`);

  console.log('\n4. EVERY ROW CARRIES ITS OWN COVERAGE MARK, EVEN WITH EVERYTHING SHOWN');
  const dots = await p1.evaluate(() => {
    const rows = [...document.querySelectorAll('#paList table.grid tbody tr')];
    return rows.map(tr => {
      const cell = tr.children[2];               // equip, wo, svc, ...
      const dot = cell.querySelector('span span');
      return dot ? getComputedStyle(dot).backgroundColor : null;
    });
  });
  ok('every visible row has a coloured coverage dot', dots.length > 0 && dots.every(Boolean), dots.length + ' row(s)');
  ok('  and both colours actually appear once uncovered rows are shown',
     new Set(dots).size >= 2, [...new Set(dots)].join(' | '));

  console.log('\n5. THE TOGGLE PERSISTS ACROSS A RELOAD, LIKE EVERY OTHER SETTING ON THIS PAGE');
  await p1.reload({ waitUntil: 'load' });
  await p1.waitForFunction(() => !!window.CM_WO_DATA && typeof paCovered === 'function', null, { timeout: 25000 });
  await p1.evaluate(() => showTab('planact'));
  await p1.waitForTimeout(150);
  const persisted = await p1.evaluate(() => document.getElementById('paCmOnly').checked);
  ok('unchecking it earlier is remembered on the next load', persisted === false);
  await p1.evaluate(() => { localStorage.removeItem('cm_pa_cmonly'); });

  console.log('\n6. THE CSV EXPORT NEVER DEPENDS ON THE TOGGLE, AND SAYS COVERAGE PER ROW');
  const csv = await p1.evaluate(() => {
    document.getElementById('paCmOnly').checked = true; document.getElementById('paCmOnly').onchange();
    let got = null;
    const real = URL.createObjectURL;
    URL.createObjectURL = blob => { got = blob; return 'blob:stub'; };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    paCsv();
    URL.createObjectURL = real; HTMLAnchorElement.prototype.click = click;
    return got ? got.text() : '';
  });
  const csvLines = csv.trim().split('\n');
  const header = csvLines[0].split(',');
  ok('the export carries a cm_covered column', header.includes('cm_covered'), header.join(','));
  const covCol = header.indexOf('cm_covered');
  const dataRows = csvLines.slice(1).map(l => l.split(','));
  ok('the export is not filtered by the on-screen toggle — it holds more rows than the CM-only table did',
     dataRows.length > before.tableRows, `${dataRows.length} row(s) exported vs ${before.tableRows} shown`);
  ok('  and every value in that column is 0 or 1', dataRows.every(r => r[covCol] === '0' || r[covCol] === '1'));
  ok('  with at least one of each — the export actually distinguishes them',
     dataRows.some(r => r[covCol] === '1') && dataRows.some(r => r[covCol] === '0'));

  console.log('\n7. THE PHONE\'S OWN LIST NEEDED NO TOGGLE — IT SAYS SO PLAINLY INSTEAD');
  /* The static "This is Condition Monitoring's own list — 1C's other
     maintenance work is not shown here." note (#dueCmNote/#dueWeekCmNote,
     one copy under List, a second word-for-word under Two weeks) is retired:
     the redesign that replaced List/Two weeks with 1C PM/CM tabs
     (tests/duepm.cjs, tests/duecm.cjs) states the same distinction as the
     tabs' own names now, permanently on screen rather than in a paragraph —
     "before adding a second place to say something, check what the FIRST one
     already says" (CLAUDE.md). What survives here is the fact the note
     existed to protect: the CM tab is never 1C's plan wearing CM's label. */
  const ctx2 = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p2 = await ctx2.newPage();
  await p2.addInitScript(() => { try { localStorage.setItem('up_dests', '[]'); } catch (e) {} });
  await p2.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p2.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 25000 });
  await p2.evaluate(() => showPane('paneDue'));
  const tabs = await p2.evaluate(() => ({
    pm: (document.getElementById('dueViewPM') || {}).textContent || '',
    cm: (document.getElementById('dueViewCM') || {}).textContent || '',
  }));
  ok('the 1C tab is named for 1C, plainly, permanently on screen', /1C/.test(tabs.pm), tabs.pm);
  ok('and the CM tab is named for Condition Monitoring, not left to a note', /CM/.test(tabs.cm), tabs.cm);
  await ctx2.close();

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await ctx1.close(); await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); srv.close(); process.exit(1); });
