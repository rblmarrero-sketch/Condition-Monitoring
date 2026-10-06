/* THE OVERVIEW MACHINE PANEL STAYS OPEN — AND SO DOES "VIEW ALL EQUIPMENT".

   Reported plainly: on /dashboard-next/'s Overview tab, "View all equipment"
   (the button in "Equipment requiring attention" that expands the register
   past its own top ten) opens, then closes on its own within moments, with
   nobody touching anything else. Reproduced and root-caused: it was never an
   outside-click handler closing on its own trigger click. This preview
   branch's page-version self-update check (`look()`/`applyIfIdle()`, near the
   end of the inline script) polls the live `mobile/sw.js` for a newer BUILD,
   and a document-level, CAPTURE-phase `click` listener fires it 300ms after
   EVERY click on the page. Its `busy()` gate — "don't reload while the reader
   is mid-decision" — only ever checked elements carrying class `.ov` (plus
   `#pxPanel` by name). Two real pieces of in-progress state were invisible to
   it: `#drw`, the machine/position drawer `openUnit()`/`openPos()` open (it
   uses its own `drw` class for its slide-in transform, never `ov`), and
   `fleetAll`, the flag "View all equipment" sets (no dialog at all — an
   inline table expansion). At the time this was found, dashboard-next's own
   `?v=` tag was a preview-branch snapshot that lagged the mainline's
   constantly-bumped `mobile/sw.js` BUILD by design, so `dashWaiting` was
   essentially always set on a real visit — the very next click after
   opening EITHER of these reloaded the whole page out from under the
   reader, discarding whatever they had just opened. That lag is retired now
   that dashboard-next is a second permanent surface, not a preview branch
   (see CLAUDE.md's "TWO OFFICE DASHBOARDS, BOTH PERMANENT" entry — bump.cjs
   tracks both files' tags in lockstep), but the `busy()` gap this suite
   exists to prove closed was never really about the lag; the lag only made
   it easy to trigger. Neither drawer nor "View all equipment" is what a real
   user would ever call "browsing normally" not protected against; this is
   the identical shape CLAUDE.md's mobile history already states for
   `applyUpdateIfIdle`/`__swBusy()`: an update must never apply while the
   reader is in the middle of something.

   This suite forces that exact condition directly (a live mock of
   mobile/sw.js answering with a far larger BUILD than the page's own ?v=
   tag) rather than depend on the tag lag that used to make it happen on its
   own, so the gap stays proven closed even now that dashboard-next tracks
   BUILD like dashboard/ does. It proves the panel survives a REALISTIC
   wait, not a same-tick assertion, after the reload's own 300ms-post-click
   trigger has had every chance to fire.

   Self-contained, same harness as tests/tablekit-next.cjs.
   Run: node tests/equipment-panel-next.cjs */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SHOTDIR = path.join(ROOT, 'dashboard-next', 'screenshots');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  /* The one live thing dashboard-next's self-update check reads: force it to
     answer with a BUILD far ahead of the page's own ?v= tag, which is the
     condition a real preview-branch visit is in almost all the time (the
     mainline bumps mobile/sw.js's BUILD constantly; this branch's own tag is
     a snapshot from whenever it was cut). Every other -next suite leaves
     this request to 404, which is exactly why none of them saw this. */
  if (p === '/mobile/sw.js') { r.writeHead(200, { 'content-type': 'application/javascript' }); r.end(ARMED ? 'const BUILD = "999999999";' : 'const BUILD = "1";'); return; }
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
});
const FLEET = JSON.parse(fs.readFileSync(path.join(__dirname, 'fleet-fixture.json'), 'utf8'));
/* WHY THE NEWER BUILD IS SERVED ONLY ON CUE.
   Served from the first request, it made this suite flaky (failed 3 runs in 6
   on 2026-10-06, never alone): look() calls applyIfIdle() the moment it finds
   a newer build, and a page with nothing open is RIGHT to update, so the idle
   page replaced itself at ~4.5 s and again at ~8.9 s after load. The boot
   below clicks at ~7 s, and under load one of those self-replaces landed
   inside the 1.8 s watch window: a navigation the page made on its own,
   counted against the click. The condition this suite needs is "an update is
   waiting AND the reader opens something", so arm() builds exactly that:
   with a text box focused (busy() holds the reload) the mock starts
   answering newer and look() is asked; dashWaiting is armed with no reload;
   the box goes, and the very next click is the one that opens the panel.
   busy() must then hold the reload through the 300 ms post-click check and
   the whole wait. */
let ARMED = false;
async function arm(p) {
  let navs = 0; const onNav = f => { if (f === p.mainFrame()) navs++; };
  p.on('framenavigated', onNav);
  ARMED = true;
  await p.evaluate(() => {
    const i = document.createElement('input'); i.id = '__armHold'; document.body.appendChild(i); i.focus();
    window.dispatchEvent(new Event('online'));
  });
  const armed = await p.waitForFunction(() => document.getElementById('dashVer').classList.contains('stale'), null, { timeout: 15000 })
    .then(() => true, () => false);
  await p.evaluate(() => { const i = document.getElementById('__armHold'); if (i) i.remove(); });
  p.off('framenavigated', onNav);
  ok('(precondition) an update is waiting, armed without a reload', armed && navs === 0, `armed ${armed}, navigations ${navs}`);
}
const WAIT_MS = 1800; // a REAL wait — long enough to see the bug survive, not a same-tick check

async function boot(b, port, lang) {
  ARMED = false;                      // a page with nothing open must not be made to update during boot
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { Object.defineProperty(navigator, 'onLine', { get: () => true }); });
  await p.goto(`http://127.0.0.1:${port}/dashboard-next/index.html`, { waitUntil: 'load' });
  if (lang) await p.evaluate(l => { try { localStorage.setItem('cm_dash_lang', l); } catch (e) {} }, lang);
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1000);
  await p.evaluate(f => { window.CMDash.setDriveRecords(f); }, FLEET);
  await p.waitForTimeout(1000);
  /* Give look() (scheduled at +4s in the page's own script) time to find the
     mocked "newer" build and arm dashWaiting -- the state a real visit is in
     almost immediately, and the state every earlier -next suite never hit. */
  await p.waitForTimeout(4200);
  return { p, errs };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  /* ── 1. "View all equipment" itself: the literal report ────────────────── */
  {
    const { p, errs } = await boot(b, port);
    let navs = 0; p.on('framenavigated', () => navs++);
    const before = await p.$$eval('#fleetTbl tbody tr[data-u]', rs => rs.length);
    await arm(p);
    navs = 0; // ignore the boot-time navigation(s); count only from here
    await p.click('#fleetAllBtn');
    await p.waitForTimeout(50);
    const rightAfter = await p.$$eval('#fleetTbl tbody tr[data-u]', rs => rs.length);
    ok('View all equipment: expands past the default ten', rightAfter > before, `${before} -> ${rightAfter}`);
    await p.waitForTimeout(WAIT_MS);
    const stillRows = await p.$$eval('#fleetTbl tbody tr[data-u]', rs => rs.length).catch(() => 0);
    ok(`View all equipment: still expanded after ${WAIT_MS}ms (no self-reload undid it)`, stillRows === rightAfter, `rows now ${stillRows}`);
    ok('View all equipment: the page never navigated/reloaded in that window', navs === 0, `navigations seen: ${navs}`);
    ok('no page errors', errs.length === 0, errs.join(' | '));
  }

  /* ── 2. A unit ID in the attention table opens the machine drawer ──────── */
  {
    const { p, errs } = await boot(b, port);
    await arm(p);
    await p.click('#fleetTbl tbody tr[data-u]');
    await p.waitForTimeout(50);
    const openedRight = await p.$eval('#drw', el => !el.classList.contains('hidden'));
    ok('Overview row: drawer opens', openedRight);
    await p.waitForTimeout(WAIT_MS);
    const stillOpen = await p.$eval('#drw', el => !el.classList.contains('hidden')).catch(() => false);
    ok(`Overview row: drawer still open after ${WAIT_MS}ms`, stillOpen);
    ok('Overview row: drawer still shows a title (not a blanked/reloaded page)', (await p.$eval('#drwTitle', el => el.textContent.trim()).catch(() => '')).length > 0);
    ok('no page errors', errs.length === 0, errs.join(' | '));
  }

  /* ── 3. Equipment History: a machine's own record opens the Edit drawer ─── */
  {
    const { p, errs } = await boot(b, port);
    await p.click('button[data-tab="equipment"]');
    await p.waitForTimeout(600);
    const editBtn = await p.$('[data-edit]');
    ok('Equipment History: a record to edit exists in the fixture', !!editBtn);
    if (editBtn) {
      await arm(p);
      await editBtn.click();
      await p.waitForTimeout(50);
      const openedRight = await p.$eval('#editOv', el => !el.classList.contains('hidden'));
      ok('Equipment History: Edit inspection drawer opens', openedRight);
      await p.waitForTimeout(WAIT_MS);
      const stillOpen = await p.$eval('#editOv', el => !el.classList.contains('hidden')).catch(() => false);
      ok(`Equipment History: Edit drawer still open after ${WAIT_MS}ms`, stillOpen);
    }
    ok('no page errors', errs.length === 0, errs.join(' | '));
  }

  /* ── 4. Actions register: a row opens the follow-up drawer ─────────────── */
  {
    const { p, errs } = await boot(b, port);
    await p.click('button[data-tab="actions"]');
    await p.waitForTimeout(600);
    /* The unit cell, not the row's middle: owner, due, status and work order
       edit in place on a click. */
    const row = await p.$('#actionTbl tr.hrow td:not(.selcol):not(.ed) b');
    ok('Actions register: an open finding exists in the fixture', !!row);
    if (row) {
      await arm(p);
      await row.click();
      await p.waitForTimeout(50);
      const openedRight = await p.$eval('#follOv', el => !el.classList.contains('hidden'));
      ok('Actions register: follow-up drawer opens', openedRight);
      await p.waitForTimeout(WAIT_MS);
      const stillOpen = await p.$eval('#follOv', el => !el.classList.contains('hidden')).catch(() => false);
      ok(`Actions register: follow-up drawer still open after ${WAIT_MS}ms`, stillOpen);
    }
    ok('no page errors', errs.length === 0, errs.join(' | '));
  }

  /* ── 5. Wear & life: a position row opens the same machine drawer ──────── */
  {
    const { p, errs } = await boot(b, port);
    await p.click('button[data-tab="wear"]');
    await p.waitForTimeout(600);
    const row = await p.$('#wearTbl tr[data-rk]');
    if (row) {
      await arm(p);
      await row.click();
      await p.waitForTimeout(50);
      const openedRight = await p.$eval('#drw', el => !el.classList.contains('hidden'));
      ok('Wear & life: position drawer opens', openedRight);
      await p.waitForTimeout(WAIT_MS);
      const stillOpen = await p.$eval('#drw', el => !el.classList.contains('hidden')).catch(() => false);
      ok(`Wear & life: position drawer still open after ${WAIT_MS}ms`, stillOpen);
    } else {
      console.log('  ....  Wear & life: no measured position in this fixture to open (not a failure of this fix)');
    }
    ok('no page errors', errs.length === 0, errs.join(' | '));
  }

  /* ── 6. The one legitimate outside-click-to-close on this page must still
         work: the Definitions popover (#ovDefs) is untouched. ──────────── */
  {
    const { p, errs } = await boot(b, port);
    const summary = await p.$('#ovDefs summary');
    if (summary) {
      await summary.click();
      const openRight = await p.$eval('#ovDefs', el => el.open);
      ok('Definitions popover: opens on its own click', openRight);
      await p.click('#fleetAllBtn').catch(() => {});
      const closedAfterOutside = await p.$eval('#ovDefs', el => !el.open);
      ok('Definitions popover: still closes on an outside click (unaffected by this fix)', closedAfterOutside);
    }
    ok('no page errors', errs.length === 0, errs.join(' | '));
  }

  /* ── 7. Screenshots: the panel open and stable, EN and RU, 1366px ──────── */
  fs.mkdirSync(SHOTDIR, { recursive: true });
  for (const lang of ['en', 'ru']) {
    const { p } = await boot(b, port, lang);
    await arm(p);
    await p.click('#fleetAllBtn');
    await p.click('#fleetTbl tbody tr[data-u]');
    await p.waitForTimeout(WAIT_MS);
    const stillOpen = await p.$eval('#drw', el => !el.classList.contains('hidden')).catch(() => false);
    ok(`Screenshot (${lang}): drawer is open and stable before capture`, stillOpen);
    const file = path.join(SHOTDIR, `equipment-panel-stable-${lang}-1366.png`);
    await p.screenshot({ path: file });
    ok(`Screenshot (${lang}) saved`, fs.existsSync(file), file);
  }

  await b.close();
  srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n` + fails.join('\n') : '\nAll passed.');
  process.exit(fails.length ? 1 : 0);
})();
