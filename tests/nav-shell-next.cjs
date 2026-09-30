/* THE NAV SHELL, ON /dashboard-next/ ONLY.

   Stage 1 of the redesign groups the sidebar into Monitor / Act / Assets /
   System (brief §4) WITHOUT renaming or reordering a single data-tab id or
   hash route — "the URL hash and query parameters are a public contract."
   This suite proves that promise rather than trusting the diff:

     · every existing hash route still opens the matching tab and panel;
     · the four new group labels exist, are not part of the keyboard tab
       order (this is a nav, not a tablist — see tests/tabsa11y.cjs's own
       header comment for the rule this borrows), and translate with the
       rest of the page;
     · the i18n dictionary stays symmetric: nothing added to EN is missing
       from RU or the reverse ("Both EN and RU dictionaries must stay
       complete" — brief §14, task instructions);
     · #overview?sev=4 opens with a VISIBLE filter chip, never a hidden
       filter (brief §5.2).

   Self-contained: serves the repo on a private port and loads the fleet
   fixture, the same way tests/tablekit-next.cjs does.
   Run: node tests/nav-shell-next.cjs */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
/* /mobile/sw.js is served here as a STATIC MOCK, pinned to dashboard-next's own
   live ?v= tag (read off the real file, never a copied-in number) -- the same
   fix tests/tablekit-scale-next.cjs and tests/period-filter-next.cjs already
   carry, for the identical reason: dashboard-next's own self-update watcher
   (BUILT/look()/applyIfIdle() near the end of the file) fetches the real
   /mobile/sw.js and reloads the page the moment it reads "newer". dashboard-
   next's own tag is now kept in the same BUILD lockstep dashboard/'s already
   is -- bump.cjs tracks both files, see CLAUDE.md's "TWO OFFICE DASHBOARDS,
   BOTH PERMANENT" entry -- but this mock stays as a backstop for the one
   moment that guarantee can still slip: between a mainline bump landing and
   dashboard-next's own tag catching up in the same commit, which is exactly
   the gap that produced this incident once already. A document-level click
   (capture phase)
   schedules that reload 300ms later, and a plain click on a button or row
   holds no focus busy() recognises, so nothing here held it back -- a real
   navigation mid-test, discarding whatever in-memory state (setDriveRecords,
   a CMDrive stub, window.__writes) the test had just set up. Confirmed via
   tests/period-filter-next.cjs's own investigation: the reload only shows up
   once enough wall-clock time has passed for look()'s first 4-second timer to
   have already fired before a later click, so it is a genuine, if timing-
   dependent, race -- not a one-off flake -- and it can hit ANY -next.cjs
   suite that clicks around dashboard-next without this mock. Pinning it to
   the page's own real tag (now always equal to BUILD, not lower by design)
   makes `newer` false for the length of this run, for both pages --
   dashboard/'s own identical self-update check reads the same mocked file
   and never sees a build higher than its own. */
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

/* [hash route, data-tab id, section id] — every route this branch's markup
   carries, read off the nav itself rather than hand-copied, further down. */
const ROUTES = ['overview', 'failure', 'wear', 'actions', 'due', 'planact', 'cmwo', 'equipment', 'lube', 'sync', 'reports'];

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

  /* ── every data-tab id in the nav still names a real route ────────────── */
  const navTabs = await p.$$eval('nav.tabs button[data-tab]', bs => bs.map(b => b.dataset.tab));
  ok('every existing tab id is still in the nav, none renamed or dropped',
     ROUTES.every(r => navTabs.includes(r)) && navTabs.length === ROUTES.length,
     navTabs.join(','));

  for (const tab of ROUTES) {
    await p.evaluate(t => { location.hash = '#' + t; }, tab);
    await p.waitForTimeout(400);
    const state = await p.evaluate(t => {
      const btn = document.querySelector(`nav.tabs button[data-tab="${t}"]`);
      const sec = document.getElementById('tab-' + t);
      return {
        active: btn && btn.classList.contains('active'),
        shown: sec && !sec.classList.contains('hidden') && !sec.hidden,
        hash: location.hash,
      };
    }, tab);
    ok(`#${tab} opens the matching tab and panel`, state.active && state.shown, JSON.stringify(state));
  }

  /* ── the four group labels exist, are not buttons, are out of tab order ─ */
  const groups = await p.$$eval('nav.tabs .navgrp', els => els.map(e => ({
    text: e.textContent.trim(), tag: e.tagName, tabIndex: e.tabIndex,
  })));
  ok('four group labels exist (Monitor/Act/Assets/System)', groups.length === 4, JSON.stringify(groups));
  ok('group labels are not buttons and not in the tab order',
     groups.every(g => g.tag !== 'BUTTON' && g.tabIndex < 0), JSON.stringify(groups));

  /* ── switching to Russian translates the group labels too ─────────────── */
  await p.evaluate(() => { const b = document.querySelector('.lang button[data-lang="ru"]'); if (b) b.click(); });
  await p.waitForTimeout(300);
  const groupsRu = await p.$$eval('nav.tabs .navgrp', els => els.map(e => e.textContent.trim()));
  ok('group labels translate to Russian', groupsRu.every((t, i) => t !== groups[i].text) && groupsRu.every(t => /[Ѐ-ӿ]/.test(t)),
     JSON.stringify(groupsRu));
  await p.evaluate(() => { const b = document.querySelector('.lang button[data-lang="en"]'); if (b) b.click(); });
  await p.waitForTimeout(300);

  /* ── the i18n dictionary is still symmetric: EN and RU carry the same keys ─
     Read the app's OWN dictionary object, not a hand-kept list of new keys —
     CLAUDE.md's own testing rule ("ask the app, don't keep your own copy"). */
  const dictCheck = await p.evaluate(() => {
    const en = Object.keys(typeof I18N!=='undefined' ? I18N.en : {});
    const ru = Object.keys(typeof I18N!=='undefined' ? I18N.ru : {});
    const missingFromRu = en.filter(k => !ru.includes(k));
    const missingFromEn = ru.filter(k => !en.includes(k));
    return { enN: en.length, ruN: ru.length, missingFromRu, missingFromEn };
  });
  ok('EN and RU dictionaries carry exactly the same keys',
     dictCheck.missingFromRu.length === 0 && dictCheck.missingFromEn.length === 0,
     JSON.stringify(dictCheck));
  const newKeys = await p.evaluate(() => {
    const need = ['nav_grp_monitor', 'nav_grp_act', 'nav_grp_assets', 'nav_grp_system', 'win_90', 'win_all', 'ov_genrpt'];
    return need.every(k => I18N.en[k] && I18N.ru[k]);
  });
  ok('every key this stage added is really in both dictionaries (not just on screen)', newKeys);

  /* ── #overview?sev=4 opens with a VISIBLE chip, never a hidden filter ──── */
  await p.evaluate(() => { location.hash = '#overview?sev=4'; });
  await p.waitForTimeout(500);
  const chipState = await p.evaluate(() => {
    const chips = [...document.querySelectorAll('#chips .chip')];
    return { n: chips.length, text: chips.map(c => c.textContent.trim()).join(' | '), drillSev: typeof drill!=='undefined' ? drill.sev : null };
  });
  ok('#overview?sev=4 shows a visible active-filter chip',
     chipState.n > 0 && /4/.test(chipState.text) && String(chipState.drillSev) === '4',
     JSON.stringify(chipState));

  console.log(errs.length ? '\nPAGE ERRORS:\n' + errs.join('\n') : '');
  b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errs.length ? 1 : 0);
})();
