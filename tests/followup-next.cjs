/* THE FOLLOW-UP PLAN DIALOG (#follOv) -- owner, due date, status, action,
   the five whys, root cause, corrective/preventive -- all written through
   saveFollow() -> window.CMDrive.saveEdit(). Same technique as
   tests/editround-next.cjs and tests/follow.cjs: identical finding on both
   pages, drive the real dialog through the real "Plan" button, diff the
   captured write.

   Run: node tests/followup-next.cjs */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
});

const iso = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const RECS = [
  { equip: 'TK902', date: '2026-09-12', type: 'MP', cls: 'HT', by: 'R. Marrero',
    items: [{ key: '4C', label: 'LR Final Drive', grade: 'X', defect: 'Ferrous debris — heavy',
              defectCode: 'DT14-03', cause: 'Gear wear', causeCode: 'CS7-01',
              action: 'REP', actionLabel: 'Repair now' }] },
];

async function loadAndSetup(b, port, url) {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1200 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate(recs => {
    window.__writes = [];
    window.CMDrive = window.CMDrive || {};
    CMDrive.configured = () => true;
    CMDrive.saveEdit = d => { window.__writes.push(d); return Promise.resolve({ ok: true }); };
    try { localStorage.setItem('cm_drive_url', 'https://stub/exec'); } catch (e) {}
    try { localStorage.removeItem('cm_dash_who'); } catch (e) {}
    CMDash.importRecords(recs);
    document.getElementById('dataOv').classList.add('hidden');
    const q = document.getElementById('fQ'); if (q) { q.value = 'TK902'; q.dispatchEvent(new Event('input')); }
    window.actView = 'unit'; if (window.renderActions) renderActions(); showTab('actions');
  }, RECS);
  await p.waitForTimeout(800);
  return { p, errs };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const { p: a, errs: errsA } = await loadAndSetup(b, port, 'dashboard/index.html');
  const { p: n, errs: errsB } = await loadAndSetup(b, port, 'dashboard-next/index.html');

  const clickPlan = async p => {
    /* The register's row itself is the button (current markup:
       tr.hrow[data-fu="unit|date|type"][data-fi="item-key"]) -- clicking it
       opens the follow-up plan for that one finding. A real MouseEvent
       dispatch, not Playwright's own synthetic page.click(): the sticky
       filter header row (.cwfh) that sits over the scrollbox intercepts a
       coordinate-based click at this viewport size on both pages equally --
       that is a pre-existing scroll/overlap quirk of the shared table kit,
       not a Stage 6 change, and orthogonal to what this test is proving
       (the write path), so it is worked around rather than investigated
       further here. */
    await p.waitForSelector('#actionTbl tr.hrow[data-fu^="TK902"]', { timeout: 5000 });
    await p.evaluate(() => {
      const tr = document.querySelector('#actionTbl tr.hrow[data-fu^="TK902"]');
      if (!tr) throw new Error('no register row found for TK902');
      tr.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };
  await clickPlan(a); await clickPlan(n);
  await a.waitForTimeout(300); await n.waitForTimeout(300);

  ok('dashboard/: follow-up plan opens on the clicked finding', /TK902/.test(await a.evaluate(() => $('follTitle').textContent)));
  ok('dashboard-next: follow-up plan opens on the clicked finding', /TK902/.test(await n.evaluate(() => $('follTitle').textContent)));
  ok('dashboard-next: the direct cause is shown, read not retyped', /Gear wear/.test(await n.evaluate(() => $('follDirect').textContent)));
  ok('dashboard-next: five whys offered', (await n.evaluate(() => document.querySelectorAll('#follWhys input').length)) === 5);

  const fill = async p => {
    await p.fill('#follOwner', 'A. Sokolov');
    await p.fill('#follDue', iso(-3));
    await p.selectOption('#follStatus', 'WIP');
    await p.fill('#follPlan', 'Drain, cut the filter, change the final drive oil');
    await p.fill('#follWhy0', 'The gear teeth are spalling');
    await p.fill('#follWhy1', 'The oil was contaminated');
    await p.fill('#follWhy2', 'The breather was blocked with mud');
    await p.fill('#follRoot', 'Breather is not on the wash-down checklist');
    await p.fill('#follCorr', 'Replace the final drive on TK902');
    await p.fill('#follPrev', 'Add breather to the wash-down card for all 44 trucks');
    await p.fill('#follBy', 'V. Petrov');
  };
  await fill(a); await fill(n);
  await a.click('#follSave'); await n.click('#follSave');
  await a.waitForTimeout(500); await n.waitForTimeout(500);

  const writesA = await a.evaluate(() => window.__writes);
  const writesB = await n.evaluate(() => window.__writes);
  console.log('dashboard/     wrote: ' + JSON.stringify(writesA));
  console.log('dashboard-next wrote: ' + JSON.stringify(writesB));
  ok('CMDrive.saveEdit called exactly once on each page', writesA.length === 1 && writesB.length === 1, `A=${writesA.length} B=${writesB.length}`);
  if (writesA.length === 1 && writesB.length === 1) {
    const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const stripTimes = v => { if (Array.isArray(v)) return v.map(stripTimes);
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = stripTimes(v[k]); return o; }
      return (typeof v === 'string' && ISO_RE.test(v)) ? '<ts>' : v; };
    ok('the saved follow-up document is field-for-field identical (timestamps excluded)',
       JSON.stringify(stripTimes(writesA[0])) === JSON.stringify(stripTimes(writesB[0])),
       `A=${JSON.stringify(stripTimes(writesA[0]))} B=${JSON.stringify(stripTimes(writesB[0]))}`);
  }
  ok('dashboard/: plan closes on save', await a.evaluate(() => $('follOv').classList.contains('hidden')));
  ok('dashboard-next: plan closes on save', await n.evaluate(() => $('follOv').classList.contains('hidden')));

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
