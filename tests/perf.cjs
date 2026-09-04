/* THE OFFICE ANSWERS INSIDE A SECOND, AND THE SUITE HOLDS IT THERE.

   The audit of build 253 timed the dashboard at 74 inspections: 3.2 s to
   move between tabs, over 3 s to change the grade filter, to open a unit's
   history, to switch a report. The cause was one shape twice over: every
   change rendered EVERY tab — nine renderers for one visible panel — and the
   lubrication tab alone walked all 1,128 assets through LUBE.of eight times,
   once per sub-panel, resolving the same machine against the same programme
   again and again.

   Build 254 renders the visible tab and marks the rest dirty, to be drawn
   when they are first shown; and lubeOf memoises the resolution per machine
   per pass. This suite holds the budgets, at the folder's size today and at
   five times it, so a regression is a number and not a feeling in the office:

     · a full render, a tab change, a grade filter, a unit's history and a
       report switch each finish inside the budget at 80 rounds;
     · a hidden tab is drawn once, when it is first shown, and not before;
     · the tab shown after a filter change is the one that was rendered, so
       "render the visible tab only" never becomes "render a stale tab";
     · at 400 rounds every interaction still finishes inside a generous bound.

   The budgets are of scripting alone in a headless browser — photographs and
   the network are outside them and outside what a render should be waiting
   on. Run: node tests/perf.cjs        (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());

/* Budgets in milliseconds. The audit's target was "about a second"; the
   scripting share of that, measured here without pictures, is held well
   under it so that photographs and the radio have the rest. */
const BUDGET = { 80: { all: 400, tab: 150, filter: 300, history: 300, report: 300 },
                 400: { all: 1500, tab: 500, filter: 1000, history: 800, report: 1000 } };

const MEASURE = `(async function(){
  const T = {}; const time = (k, f) => { const t0 = performance.now(); f(); T[k] = Math.round(performance.now() - t0); };
  showTab('overview', true);
  time('renderAll', () => renderAll());
  const tabs = ['failure', 'wear', 'actions', 'due', 'equipment', 'lube', 'sync', 'reports', 'overview'];
  let worst = 0, worstTab = '';
  for (const tab of tabs) { const t0 = performance.now(); showTab(tab, true); const d = performance.now() - t0; if (d > worst) { worst = d; worstTab = tab; } }
  T.tab = Math.round(worst); T.tabWorst = worstTab;
  showTab('overview', true);
  time('filter', () => { $('fGrade').value = '5'; $('fGrade').dispatchEvent(new Event('change')); });
  time('filterOff', () => { $('fGrade').value = ''; $('fGrade').dispatchEvent(new Event('change')); });
  showTab('equipment', true);
  time('history', () => { $('equipSel').value = RECS[0].equip; $('equipSel').dispatchEvent(new Event('change')); });
  showTab('reports', true);
  time('report', () => { $('rScope').value = 'unit'; refreshReportTargets(); });
  time('reportOne', () => { $('rScope').value = 'one'; refreshReportTargets(); });
  showTab('overview', true);
  return Object.assign({ records: RECS.length }, T);
})()`;

async function boot(b, n) {
  await reset('n=' + n);
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1'); }, BASE + '/exec');
  await p.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForFunction(m => typeof RECS !== 'undefined' && RECS.length >= m, Math.min(n, 60), { timeout: 90000 });
  await p.waitForTimeout(2500);
  return { p, errs };
}
const under = (T, B, k, key) => ok(`  ${k} inside ${B[key]} ms`, T[k] <= B[key], T[k] + ' ms' + (k === 'tab' ? ' (worst: ' + T.tabWorst + ')' : ''));

(async () => {
  const b = await chromium.launch();
  try {
    console.log('── at the folder\'s size today: 80 rounds');
    {
      const { p, errs } = await boot(b, 80);
      /* Warm once: the first pass builds memos and fonts that every later
         interaction shares, and the office does not restart the page per click. */
      await p.evaluate(MEASURE);
      const T = await p.evaluate(MEASURE);
      console.log('   ' + JSON.stringify(T));
      ok('80 rounds loaded', T.records >= 60, T.records);
      const B = BUDGET[80];
      under(T, B, 'renderAll', 'all'); under(T, B, 'tab', 'tab'); under(T, B, 'filter', 'filter'); under(T, B, 'filterOff', 'filter');
      under(T, B, 'history', 'history'); under(T, B, 'report', 'report'); under(T, B, 'reportOne', 'report');

      console.log('\n── a hidden tab is drawn once, when it is first shown');
      const lazy = await p.evaluate(() => {
        showTab('overview', true);
        const calls = {}; const orig = {};
        Object.keys(TAB_RENDER).forEach(k => { orig[k] = TAB_RENDER[k]; calls[k] = 0; TAB_RENDER[k] = () => { calls[k]++; return orig[k](); }; });
        renderAll();
        const afterAll = Object.assign({}, calls);
        const dirtyAfterAll = [...TAB_DIRTY];
        showTab('lube', true);
        const afterLube = Object.assign({}, calls);
        showTab('lube', true); showTab('overview', true); showTab('lube', true);
        const afterAgain = Object.assign({}, calls);
        Object.keys(orig).forEach(k => { TAB_RENDER[k] = orig[k]; });
        return { afterAll, dirtyAfterAll, afterLube, afterAgain, tabs: Object.keys(TAB_RENDER) };
      });
      const hidden = lazy.tabs.filter(k => k !== 'overview');
      ok('renderAll drew the visible tab and none of the hidden ones', lazy.afterAll.overview === 1 && hidden.every(k => lazy.afterAll[k] === 0), JSON.stringify(lazy.afterAll));
      ok('  and marked every hidden tab dirty', hidden.every(k => lazy.dirtyAfterAll.indexOf(k) >= 0), lazy.dirtyAfterAll.join(','));
      ok('showing the lube tab drew it, once', lazy.afterLube.lube === 1, lazy.afterLube.lube);
      ok('  and showing it again did not redraw it', lazy.afterAgain.lube === 1 && lazy.afterAgain.overview === 1, JSON.stringify(lazy.afterAgain));

      console.log('\n── a filter change reaches the tab that is shown');
      const txt = 'tab => ($("tab-" + tab).innerText || "").replace(/\\s+/g, " ")';
      const fresh = await p.evaluate(`(() => { const txt = ${txt};
        /* Rendered in view, filtered and unfiltered: the reference. */
        showTab('failure', true);
        $('fGrade').value = '5'; $('fGrade').dispatchEvent(new Event('change')); const seen5 = txt('failure');
        $('fGrade').value = ''; $('fGrade').dispatchEvent(new Event('change')); const seenAll = txt('failure');
        /* Now the same filter is changed while the tab is HIDDEN, and the tab
           is shown afterwards: it has to come up under the filter in force. */
        showTab('wear', true);
        $('fGrade').value = '5'; $('fGrade').dispatchEvent(new Event('change'));
        showTab('failure', true); const hidden5 = txt('failure');
        showTab('wear', true);
        $('fGrade').value = ''; $('fGrade').dispatchEvent(new Event('change'));
        showTab('failure', true); const hiddenAll = txt('failure');
        return { n5: seen5.length, nAll: seenAll.length, differs: seen5 !== seenAll, h5: hidden5 === seen5, hAll: hiddenAll === seenAll };
      })()`);
      ok('the failure tab redrew under the grade filter and again without it', fresh.differs && fresh.n5 > 0, JSON.stringify({ f5: fresh.n5, fAll: fresh.nAll }));
      ok('a tab shown after the filter changed while hidden comes up under that filter', fresh.h5, fresh.h5 ? 'same as when rendered in view' : 'differs from the in-view render');
      ok('  and under the filter\'s removal', fresh.hAll, fresh.hAll ? 'same as when rendered in view' : 'differs from the in-view render');
      ok('no page errors', errs.length === 0, errs.join(' | ') || 'none');
      await p.close();
    }

    console.log('\n── at five times the folder: 400 rounds');
    {
      const { p, errs } = await boot(b, 400);
      await p.evaluate(MEASURE);
      const T = await p.evaluate(MEASURE);
      console.log('   ' + JSON.stringify(T));
      ok('400 rounds loaded', T.records >= 300, T.records);
      const B = BUDGET[400];
      under(T, B, 'renderAll', 'all'); under(T, B, 'tab', 'tab'); under(T, B, 'filter', 'filter'); under(T, B, 'history', 'history'); under(T, B, 'report', 'report');
      ok('no page errors', errs.length === 0, errs.join(' | ') || 'none');
      await p.close();
    }
  } finally {
    await reset('n=40').catch(() => {});
    await b.close();
  }
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); reset('n=40').catch(() => {}).then(() => process.exit(1)); });
