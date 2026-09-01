/* AN ADDRESS FOR EVERY VIEW, AND A CEILING ON EVERY PAGE.

   The dashboard had one URL for nine pages. So Back left the site from the
   fourth screen in, a reload always dropped the reader on Overview with their
   filters gone, and "look at the overdue rounds for TK149" could not be sent
   to anybody as a link — it had to be a set of instructions.

   And a page with no scrollbar of its own is not automatically a good page:
   taking the box off the wear table replaced a 620 px window with 26,726 px of
   table, and then with five screens. Neither is something a reader can scan.
   Fewer rows is the answer, and 25 is this table's — its rows are twice the
   height of an action row.

   Run: node tests/urlstate.cjs        (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const note = (n, d) => console.log('  ....  ' + n + (d !== undefined ? '   ' + d : ''));
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());

(async () => {
  await reset('n=40');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem('cm_drive_url', u);
    localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0');
    localStorage.setItem('cm_swap_off', '1');
  }, BASE + '/exec');
  await p.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 5, null, { timeout: 60000 });
  await p.waitForTimeout(2500);

  console.log('\n1. EVERY PAGE HAS AN ADDRESS');
  const seen = [];
  for (const tb of ['actions', 'wear', 'due', 'sync']) {
    await p.evaluate(t => showTab(t, true), tb);
    await p.waitForTimeout(350);
    const h = await p.evaluate(() => location.hash);
    seen.push(h);
    ok('opening ' + tb.padEnd(8) + ' names it in the address', h.indexOf('#' + tb) === 0, h);
  }

  console.log('\n2. BACK RETURNS TO THE PREVIOUS PAGE, NOT OFF THE SITE');
  await p.goBack(); await p.waitForTimeout(500);
  const back1 = await p.evaluate(() => ({ hash: location.hash, tab: CUR_TAB }));
  ok('back goes to the page before it', back1.hash.indexOf('#due') === 0,
     back1.hash + ' · showing ' + back1.tab);
  ok('  and the page actually changed, not only the address', back1.tab === 'due', back1.tab);
  await p.goForward(); await p.waitForTimeout(500);
  const fwd = await p.evaluate(() => ({ hash: location.hash, tab: CUR_TAB }));
  ok('and forward returns', fwd.tab === 'sync', fwd.hash + ' · ' + fwd.tab);

  console.log('\n3. A FILTER IS IN THE ADDRESS, AND TRAVELS WITH THE PAGE');
  await p.evaluate(() => showTab('actions', true));
  await p.waitForTimeout(300);
  const filtered = await p.evaluate(async () => {
    const ty = [...document.getElementById('fType').options].map(o => o.value).filter(Boolean)[0];
    document.getElementById('fType').value = ty;
    document.getElementById('fQ').value = 'TK';
    renderAll(); await new Promise(r => setTimeout(r, 300));
    return { hash: location.hash, ty };
  });
  console.log('   ' + filtered.hash);
  ok('the type filter is in the address', filtered.hash.indexOf('type=' + filtered.ty) > 0, filtered.hash);
  ok('  and so is the search text', /q=TK/.test(filtered.hash), filtered.hash);
  /* Changing a filter must NOT bury the previous page under history entries —
     one per keystroke would make Back useless. */
  await p.evaluate(async () => {
    document.getElementById('fQ').value = 'TK1'; renderAll();
    await new Promise(r => setTimeout(r, 200));
    document.getElementById('fQ').value = 'TK10'; renderAll();
    await new Promise(r => setTimeout(r, 200));
  });
  await p.goBack(); await p.waitForTimeout(500);
  const afterBack = await p.evaluate(() => ({ tab: CUR_TAB, hash: location.hash }));
  ok('typing does not fill the history with entries',
     afterBack.tab !== 'actions', 'back landed on ' + afterBack.tab);

  console.log('\n4. A LINK RESTORES THE PAGE AND ITS FILTERS');
  /* A FRESH TAB, which is what "somebody sent me a link" actually is.

     Navigating the SAME page to a URL that differs only in its hash is a
     same-document navigation — the document never reloads, so a test doing that
     is exercising hashchange, not arrival. Both paths have to work and they are
     different code: arrival is read at boot, hashchange is read by its own
     listener. This checks arrival; the hashchange path is checked below. */
  const link = BASE + '/dashboard/index.html#wear?q=TK1';
  const p2 = await b.newPage({ viewport: { width: 1366, height: 768 } });
  await p2.addInitScript(u => {
    localStorage.setItem('cm_drive_url', u);
    localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0');
    localStorage.setItem('cm_swap_off', '1');
  }, BASE + '/exec');
  await p2.goto(link, { waitUntil: 'load' });
  await p2.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 5, null, { timeout: 60000 });
  await p2.waitForTimeout(2500);
  const restored = await p2.evaluate(() => ({
    tab: CUR_TAB, q: document.getElementById('fQ').value,
    shown: !document.getElementById('tab-wear').classList.contains('hidden') }));
  console.log('   ' + JSON.stringify(restored));
  ok('the linked page is the one on screen', restored.tab === 'wear' && restored.shown, restored.tab);
  ok('  with the filter it named', restored.q === 'TK1', restored.q);
  /* And the other path: the address changed under a page that is already open. */
  const hopped = await p2.evaluate(async () => {
    location.hash = '#actions?q=DZ';
    await new Promise(r => setTimeout(r, 800));
    return { tab: CUR_TAB, q: document.getElementById('fQ').value };
  });
  ok('changing the address of an open page moves it too',
     hopped.tab === 'actions' && hopped.q === 'DZ', JSON.stringify(hopped));
  await p2.close();

  console.log('\n5. NO PAGE IS TALLER THAN THREE SCREENS AT 1366×768');
  /* The ceiling the brief sets. Measured per page, at the width a supervisor's
     laptop actually runs. */
  const tall = {};
  for (const tb of ['overview', 'failure', 'wear', 'actions', 'due', 'equipment', 'lube', 'sync', 'reports']) {
    await p.evaluate(t => { showTab(t); window.scrollTo(0, 0); }, tb);
    await p.waitForTimeout(400);
    tall[tb] = await p.evaluate(() =>
      +(document.documentElement.scrollHeight / window.innerHeight).toFixed(1));
  }
  Object.entries(tall).forEach(([k, v]) => note(k, v + ' screens'));
  const over = Object.entries(tall).filter(([, v]) => v > 3);
  ok('every page fits in three screens or fewer', over.length === 0,
     over.map(([k, v]) => k + ' ' + v).join(', ') || 'all within');

  console.log('\n6. AND THE WEAR TABLE DRAWS 25 ROWS, NOT FIFTY');
  const w = await p.evaluate(async () => {
    showTab('wear');
    const seg = document.querySelector('[data-wb="all"]'); if (seg) seg.click();
    await new Promise(r => setTimeout(r, 400));
    const m = String((document.getElementById('wearShown') || {}).textContent || '')
      .match(/(\d[\d\s, ]*)\D+(\d[\d\s, ]*)/);
    return { rows: document.querySelectorAll('#wearTbl tbody tr').length,
             total: m ? Number(m[2].replace(/\D/g, '')) : null,
             pager: !!document.querySelector('[data-pg^="wear"]') };
  });
  console.log('   ' + JSON.stringify(w));
  ok('the page is 25 rows', w.rows <= 25, w.rows + ' drawn');
  ok('  with a pager to reach the rest', w.pager || w.total <= 25, 'pager ' + w.pager);
  ok('  while the total still counts everything', w.total === null || w.total >= w.rows,
     w.rows + ' of ' + w.total);

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
