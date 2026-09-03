/* LEAVING THE UNIT DRAWER FOR ANOTHER PAGE HAS TO ARRIVE THERE AND STAY.

   The drawer pushes one history entry when it opens so that Back closes it.
   Its own buttons that go somewhere else — Full history, In the register,
   a recent round, an open finding, the class, Edit — used to close the
   drawer first, which queued a history.back() to pop that entry; the page
   then navigated and pushed its new address, and the queued back() landed
   on top of it: the hash flipped to the previous page, hashchange re-read
   it, and the reader watched the page they had asked for appear and go
   away again. Reported from the field on build 241 as "Full history doesn't
   load, then goes back".

   Each of those buttons now releases the drawer's entry (ovLeave) before
   closing, so nothing is popped after the navigation. What has to be true,
   1.2 s after the press: the page asked for is still the page, its address
   is the address, and the drawer is shut.

   Run: node tests/drwleave.cjs        (needs tests/mock.cjs on 8099, or CM_BASE) */
const { chromium } = require(require('./pw.cjs'));
const BASE = process.env.CM_BASE || 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
(async () => {
  const b = await chromium.launch();
  const q = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; q.on('pageerror', e => errs.push(e.message));
  await q.addInitScript(base => { localStorage.setItem('cm_drive_url', base + '/exec'); localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1'); }, BASE);
  await q.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  await q.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 10, null, { timeout: 60000 });
  await q.waitForTimeout(2000);
  const press = (sel, wantTab, wantHash) => q.evaluate(async ({ sel, wantTab, wantHash }) => {
    showTab('overview', true); clearFilters(); await new Promise(r => setTimeout(r, 300));
    const u = RECS[0].equip; openUnit(u); await new Promise(r => setTimeout(r, 300));
    const el = document.querySelector(sel); if (!el) return { missing: sel };
    el.click();
    const t0 = { tab: CUR_TAB, hash: location.hash };
    await new Promise(r => setTimeout(r, 1200));
    return { u, t0, tab: CUR_TAB, hash: location.hash, drw: !document.getElementById('drw').classList.contains('hidden'),
             sec: (document.querySelector('section:not(.hidden)') || {}).id,
             edit: document.getElementById('editOv') ? !document.getElementById('editOv').classList.contains('hidden') : null,
             foll: document.getElementById('follOv') ? !document.getElementById('follOv').classList.contains('hidden') : null,
             hist: document.querySelectorAll('#history .insp').length, stays: wantTab, wantHash };
  }, { sel, wantTab, wantHash });
  const h = await press('#uHist', 'equipment', /^#equipment/);
  ok('Full history goes to the Equipment page and stays there, with the unit\'s history drawn',
     !h.missing && h.tab === 'equipment' && /^#equipment/.test(h.hash) && !h.drw && h.hist > 0, JSON.stringify(h).slice(0, 300));
  const a = await press('#uActs', 'actions', /^#actions/);
  ok('In the register goes to Maintenance Actions filtered to the unit, and stays',
     !a.missing && a.tab === 'actions' && new RegExp('^#actions\\?.*unit=' + a.u).test(a.hash) && !a.drw, JSON.stringify(a).slice(0, 300));
  const r = await press('#drwBody [data-rk]', 'equipment', /^#equipment/);
  ok('a recent round goes to the history and stays', !r.missing && r.tab === 'equipment' && !r.drw, JSON.stringify(r).slice(0, 200));
  const e = await press('#drwEdit', null, null);
  ok('Edit opens the correction panel and it stays open', !e.missing && e.edit === true, JSON.stringify(e).slice(0, 200));
  await q.evaluate(() => { try { closeEdit(); } catch (e) {} });
  const f = await press('#drwBody [data-fu]', 'actions', /^#actions/);
  ok('an open finding goes to the register and its follow-up sheet stays open', f.missing || (f.tab === 'actions' && f.foll === true), JSON.stringify(f).slice(0, 200));
  /* And Back still closes a drawer that is simply open. */
  const back = await q.evaluate(async () => {
    showTab('overview', true); await new Promise(r => setTimeout(r, 200));
    openUnit(RECS[0].equip); await new Promise(r => setTimeout(r, 200));
    history.back(); await new Promise(r => setTimeout(r, 500));
    return { tab: CUR_TAB, drw: !document.getElementById('drw').classList.contains('hidden') };
  });
  ok('Back on an open drawer closes the drawer and keeps the page', back.tab === 'overview' && !back.drw, JSON.stringify(back));
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nALL PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(String(e && e.stack || e).slice(0, 600)); process.exit(1); });
