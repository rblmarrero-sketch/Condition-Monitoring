/* PHASE 3 — THE THREE WORKING PAGES: MAINTENANCE ACTIONS, INSPECTION SCHEDULE,
   EQUIPMENT HISTORY.

   Each is asked to do what a planner does on it, and every count it shows is
   checked against the page's own predicate rather than a copy of it:

     Maintenance Actions  — 25 a page; Critical, then late, then oldest, by
                            default; owner and date editable in the row; the
                            row opens the plan; ticking rows raises the bulk
                            bar; CSV; the filter travels in the address.
     Inspection Schedule  — four named tabs (Overdue · Due soon · Deferred ·
                            All) whose counts equal the rows behind them;
                            "Start inspection" and "Defer inspection" on
                            every row; the deferral dialog opens; the view
                            travels in the address; the Overview door lands
                            on Overdue.
     Equipment History    — the picker narrows as you type; the timeline is a
                            table whose rows open the position drawer; the
                            photo view is a 4 / 2 / 1 grid by width; a
                            photograph opens the lightbox, and the editor
                            offers rotate, crop, zoom and reset.

   Run: node tests/phase3.cjs        (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const BASE = process.env.CM_BASE || 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const note = (n, d) => console.log('  ....  ' + n + (d !== undefined ? '   ' + d : ''));
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());
const shown = (p, sel) => p.evaluate(s => { const e = document.querySelector(s);
  return !!e && getComputedStyle(e).display !== 'none' && !e.hidden && !e.classList.contains('hidden'); }, sel);

(async () => {
  await reset('n=60');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem('cm_drive_url', u);
    localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0');
    localStorage.setItem('cm_swap_off', '1');
    localStorage.removeItem('cm_dash_actview');
    localStorage.removeItem('cm_dash_histview');
  }, BASE + '/exec');
  await p.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 5, null, { timeout: 60000 });
  await p.waitForTimeout(2000);

  /* ───────────────────────── MAINTENANCE ACTIONS ───────────────────────── */
  console.log('\n1. MAINTENANCE ACTIONS');
  await p.evaluate(() => { showTab('actions', true); actView = 'table'; setAFilt('open'); });
  await p.waitForTimeout(400);
  const A = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#actionTbl tbody tr.hrow')];
    const keys = rows.map(tr => ({ rk: tr.dataset.fu, ik: tr.dataset.fi }));
    const rank = keys.map(k => { const r = RECS.find(x => ekOf(x) === k.rk); const i = r.items.find(x => x.key === k.ik);
      return { sev: sevRank(sevOf(r, i)), late: fOverdue(i) ? 1 : 0, age: fAgeDays(r, i) || 0 }; });
    let ordered = true;
    for (let n = 1; n < rank.length; n++) {
      const a = rank[n - 1], c = rank[n];
      const cmp = (c.sev - a.sev) || (c.late - a.late) || (c.age - a.age);
      if (cmp > 0) { ordered = false; break; }
    }
    const predicate = findings(filtered()).filter(x => actionRequired(x.r, x.i)).length;
    const pager = document.querySelector('#actionTbl .pager .muted');
    const m = pager && /([\d.,\u00a0\u202f]+)\s*matching/.exec(pager.textContent || '');
    return { title: (document.querySelector('#tab-actions .pagehd h1') || document.querySelector('#tab-actions h2') || {}).textContent, rows: rows.length, ordered,
             predicate, stated: m ? Number(m[1].replace(/\D/g, '')) : null,
             fields: document.querySelectorAll('#actionTbl tbody input:not(.asel), #actionTbl tbody select').length,
             owner: !!document.querySelector('#actionTbl tbody .who'), status: !!document.querySelector('#actionTbl tbody .st'),
             sizes: [...document.querySelectorAll('#actionTbl .pgsz button')].map(b => b.textContent.trim()).join(','),
             showAll: !!document.querySelector('#actionTbl [data-pg$=":all"]'),
             csv: !!document.getElementById('csvBtn'), hash: location.hash };
  });
  ok('the page is called Maintenance Actions', /Maintenance Actions/.test(A.title || ''), A.title);
  ok('one page is at most 25 actions', A.rows > 0 && A.rows <= 25, A.rows + ' rows');
  ok('  and the pager states the whole outstanding set', A.stated === A.predicate, A.stated + ' vs ' + A.predicate);
  ok('the default order is Critical, then overdue, then oldest', A.ordered);
  ok('the rows are read-outs — no owner, date or status control in every row', A.fields === 0 && A.owner && A.status, A.fields + ' field(s)');
  ok('  25, 50 or 100 rows a page, and no "show all"', A.sizes === '25,50,100' && !A.showAll, A.sizes);
  ok('CSV export is offered', A.csv);
  ok('the address names the page', /^#actions/.test(A.hash), A.hash);

  /* the row opens the plan */
  await p.click('#actionTbl tbody tr.hrow');
  await p.waitForTimeout(300);
  ok('a row opens the follow-up drawer', await shown(p, '#follOv'));
  const follTitle = await p.textContent('#follTitle');
  ok('  titled with the machine and the point', /[A-Z]{2}\d+/.test(follTitle || ''), follTitle);
  await p.click('#follX'); await p.waitForTimeout(200);
  ok('  and closes', !(await shown(p, '#follOv')));

  /* ticking rows raises the bulk bar */
  await p.evaluate(() => { const cbs = document.querySelectorAll('#actionTbl .asel'); cbs[0].click(); cbs[1].click(); });
  await p.waitForTimeout(200);
  const bulk = await p.evaluate(() => ({ shown: !document.getElementById('selBar').hidden,
    txt: document.getElementById('selBar').innerText.replace(/\s+/g, ' ').trim().slice(0, 80),
    owner: !!document.querySelector('#selBar input[list="bulkOwners"], #selBar input[type="text"]') }));
  ok('ticking two rows raises the bulk assignment bar', bulk.shown && bulk.owner, bulk.txt);
  await p.evaluate(() => { document.getElementById('aAll').checked = false; document.getElementById('aAll').onchange(); });
  await p.waitForTimeout(150);
  ok('  and clearing the ticks hides it', await p.evaluate(() => document.getElementById('selBar').hidden));

  /* the filter travels in the address, both ways */
  await p.click('#aSeg [data-af="noown"]'); await p.waitForTimeout(300);
  const afHash = await p.evaluate(() => location.hash);
  ok('choosing "Unassigned actions" writes af=noown to the address', /af=noown/.test(afHash), afHash);
  await p.evaluate(() => { location.hash = '#actions?af=triage'; });
  await p.waitForTimeout(500);
  const afRead = await p.evaluate(() => ({ af: aFilt(), on: (document.querySelector('#aSeg button.on') || {}).dataset.af,
    rows: document.querySelectorAll('#actionTbl tbody tr.hrow').length,
    predicate: findings(filtered()).filter(x => actionState(x.r, x.i).k === 'triage').length }));
  ok('arriving on #actions?af=triage selects that filter', afRead.af === 'triage' && afRead.on === 'triage', JSON.stringify(afRead));
  ok('  and the register shows exactly the planning-required findings (one page of them)',
     afRead.rows === Math.min(25, afRead.predicate), afRead.rows + ' of ' + afRead.predicate);
  await p.evaluate(() => { location.hash = '#actions?af=bogus'; });
  await p.waitForTimeout(400);
  ok('a filter the address names wrongly falls back to Open, not to nothing',
     (await p.evaluate(() => aFilt())) === 'open');

  /* ───────────────────────── INSPECTION SCHEDULE ───────────────────────── */
  console.log('\n2. INSPECTION SCHEDULE');
  await p.evaluate(() => { showTab('overview', true); clearFilters(); });
  await p.waitForTimeout(300);
  await p.click('#kpiOver'); await p.waitForTimeout(500);
  const D = await p.evaluate(() => {
    const tabs = [...document.querySelectorAll('#ddSeg [role="tab"]')].map(b => ({ k: b.dataset.dd,
      label: b.childNodes[0].textContent.trim(), n: Number(b.querySelector('.n').textContent), on: b.getAttribute('aria-selected') === 'true' }));
    const st = {}; dueTabRows().forEach(r => { st[r.st] = (st[r.st] || 0) + 1; });
    const rows = document.querySelectorAll('#ddList tbody tr').length;
    const starts = [...document.querySelectorAll('#ddList .ddact a')].map(a => a.textContent.trim());
    const defers = [...document.querySelectorAll('#ddList .ddact button')].map(a => a.textContent.trim());
    return { title: (document.querySelector('#tab-due .pagehd h1') || document.querySelector('#tab-due h2') || {}).textContent, tabs, st, rows, hash: location.hash,
             scope: document.getElementById('ddScope').value, starts: [...new Set(starts)], defers: [...new Set(defers)],
             all: dueTabRows().length, never: (typeof dueNeverRows === 'function' ? dueNeverRows().length : 0) };
  });
  note('tabs', D.tabs.map(x => x.label + ' ' + x.n).join(' · '));
  ok('the page is called Inspection Schedule', /Inspection Schedule/.test(D.title || ''), D.title);
  /* The page size, from the page: 25 since build 271, and never a number this suite owns. */
  const PAGE_SIZE_DEFAULT_T = await p.evaluate(() => PAGE_SIZE_DEFAULT);
  /* Six since Phase 4: Never inspected and Completed joined the four, and the
     five add up to All. Counts are read by KEY, never by position. */
  const tb = k => D.tabs.find(x => x.k === k) || { n: -1 };
  ok('six named tabs: Overdue, Due soon, Never inspected, Deferred, Completed, All', D.tabs.map(x => x.k).join(',') === 'over,soon,never,put,done,all'
     && D.tabs.map(x => x.label).join('|') === 'Overdue|Due soon|Never inspected|Deferred|Completed|All', D.tabs.map(x => x.label).join('|'));
  ok('the Overview door lands on the Overdue tab', D.scope === 'over' && D.tabs[0].on, D.scope);
  ok('  and the address says so', /^#due/.test(D.hash), D.hash);
  ok('Overdue counts what the schedule calls overdue', tb('over').n === (D.st.over || 0), tb('over').n + ' vs ' + (D.st.over || 0));
  ok('Due soon counts only due soon', tb('soon').n === (D.st.soon || 0), tb('soon').n + ' vs ' + (D.st.soon || 0));
  ok('Deferred counts the put-off rounds', tb('put').n === ((D.st.put || 0) + (D.st.off || 0)), String(tb('put').n));
  ok('Completed counts the rounds walked within their interval', tb('done').n === (D.st.ok || 0), tb('done').n + ' vs ' + (D.st.ok || 0));
  ok('Never inspected counts the machines no round of that type has reached', tb('never').n === D.never && D.never > 0, String(tb('never').n));
  ok('All counts every unit-round with history plus the never-inspected', tb('all').n === D.all + D.never, tb('all').n + ' vs ' + (D.all + D.never));
  ok('the Overdue list draws one page of exactly the overdue rows', D.rows === Math.min(PAGE_SIZE_DEFAULT_T, D.st.over || 0), D.rows + ' of ' + (D.st.over || 0));
  ok('every row offers "Start inspection"', D.starts.length === 1 && D.starts[0] === 'Start inspection', D.starts.join('|'));
  ok('  and "Defer inspection"', D.defers.length === 1 && D.defers[0] === 'Defer inspection', D.defers.join('|'));

  await p.click('#ddSeg [data-dd="all"]'); await p.waitForTimeout(300);
  const allTab = await p.evaluate(() => ({ hash: location.hash, scope: document.getElementById('ddScope').value,
    rows: document.querySelectorAll('#ddList tbody tr').length, n: dueTabRows().length + dueNeverRows().length }));
  ok('pressing All shows every row (one page of them) and writes dd=all', allTab.scope === 'all' && /dd=all/.test(allTab.hash)
     && allTab.rows === Math.min(PAGE_SIZE_DEFAULT_T, allTab.n), JSON.stringify(allTab));
  await p.evaluate(() => { location.hash = '#due?dd=put'; });
  await p.waitForTimeout(500);
  const putTab = await p.evaluate(() => ({ scope: document.getElementById('ddScope').value,
    on: (document.querySelector('#ddSeg [aria-selected="true"]') || {}).dataset.dd }));
  ok('arriving on #due?dd=put selects the Deferred tab', putTab.scope === 'put' && putTab.on === 'put', JSON.stringify(putTab));
  await p.evaluate(() => { location.hash = '#due'; });
  await p.waitForTimeout(400);
  ok('and #due alone means Overdue', (await p.evaluate(() => document.getElementById('ddScope').value)) === 'over');

  /* keyboard walks the tabs */
  await p.focus('#ddSeg [data-dd="over"]');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(250);
  ok('Right arrow moves to the next tab', (await p.evaluate(() => document.getElementById('ddScope').value)) === 'soon');

  /* deferring */
  await p.click('#ddSeg [data-dd="over"]'); await p.waitForTimeout(300);
  await p.click('#ddList .ddact button[data-defer]'); await p.waitForTimeout(250);
  const df = await p.evaluate(() => ({ open: !document.getElementById('dfBox').classList.contains('hidden'),
    what: document.getElementById('dfWhat').textContent, why: !!document.getElementById('dfWhy') }));
  ok('"Defer inspection" opens the deferral dialog for that machine and round', df.open && /[A-Z]{2}\d+/.test(df.what) && df.why, df.what);
  await p.evaluate(() => dfClose());
  const startHref = await p.getAttribute('#ddList .ddact a', 'href');
  ok('"Start inspection" hands the phone the unit and the round', /mobile\/index\.html\?unit=[A-Z]+\d+&type=/.test(startHref || ''), startHref);

  /* ───────────────────────── EQUIPMENT HISTORY ───────────────────────── */
  console.log('\n3. EQUIPMENT HISTORY');
  await p.evaluate(() => { showTab('equipment', true); });
  await p.waitForTimeout(300);
  const before = await p.evaluate(() => ({ n: document.querySelectorAll('#equipSel option').length,
    sel: document.getElementById('equipSel').value }));
  await p.fill('#equipQ', 'TK15'); await p.waitForTimeout(300);
  const H = await p.evaluate(() => ({
    opts: [...document.querySelectorAll('#equipSel option')].map(o => o.value),
    sel: document.getElementById('equipSel').value,
    title: document.getElementById('histTitle').textContent }));
  /* The machine already chosen stays in the list whatever is typed — a select
     whose value is not among its options reads as empty — so it is the one
     option allowed not to match. */
  ok('typing in the picker narrows it', H.opts.length < before.n && H.opts.filter(u => u !== before.sel).every(u => /TK15/.test(u)),
     H.opts.join(',') || '(none)');
  ok('  and the history follows the selection', new RegExp(H.sel).test(H.title), H.title);
  await p.fill('#equipQ', ''); await p.waitForTimeout(200);

  await p.click('#histView [data-hv="list"]'); await p.waitForTimeout(300);
  const L = await p.evaluate(() => ({ rows: document.querySelectorAll('#history table.grid tbody tr.hrow').length,
    blocks: document.querySelectorAll('#history .insp').length,
    heads: [...document.querySelectorAll('#history .insp .head .date')].map(x => x.textContent.trim()) }));
  ok('the timeline is a table, one block per visit, newest first', L.rows > 0 && L.blocks > 0
     && L.heads.every((d, n) => n === 0 || d <= L.heads[n - 1]), L.blocks + ' visits, ' + L.rows + ' rows');
  await p.click('#history table.grid tbody tr.hrow'); await p.waitForTimeout(300);
  const drw = await p.evaluate(() => ({ open: !document.getElementById('drw').classList.contains('hidden'),
    title: document.getElementById('drwTitle').textContent }));
  ok('a row opens the position drawer', drw.open && /[A-Z]{2}\d+ · .+ · \d{4}-\d{2}-\d{2}/.test(drw.title), drw.title);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok('  Escape closes it', await p.evaluate(() => document.getElementById('drw').classList.contains('hidden')));

  /* The fixture's rounds carry one position each, and a one-card round is
     laid out as one card on purpose. Give the selected round four positions
     — the app's own record, extended — so the grid has something to wrap. */
  await p.evaluate(() => {
    const u = document.getElementById('equipSel').value;
    const r = RECS.find(x => x.equip === u && x.items && x.items.length);
    if (r && r.items.length < 4) for (let k = r.items.length; k < 4; k++) r.items.push(Object.assign({}, r.items[0], { key: 'P' + k }));
  });
  await p.click('#histView [data-hv="photo"]'); await p.waitForTimeout(400);
  const cols = async () => p.evaluate(() => {
    const g = document.querySelector('#history .pos-grid:not(.one)') || document.querySelector('#history .pos-grid');
    return g ? getComputedStyle(g).gridTemplateColumns.trim().split(/\s+/).length : 0; });
  ok('the photo view is a grid of position cards', (await p.evaluate(() => document.querySelectorAll('#history .pos').length)) > 0);
  const c1366 = await cols();
  await p.setViewportSize({ width: 1024, height: 768 }); await p.waitForTimeout(250);
  const c1024 = await cols();
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(250);
  const c390 = await cols();
  await p.setViewportSize({ width: 1366, height: 768 }); await p.waitForTimeout(250);
  ok('four cards per row on a laptop, two on a tablet, one on a phone', c1366 === 4 && c1024 === 2 && c390 === 1,
     c1366 + ' / ' + c1024 + ' / ' + c390);
  const hasPhoto = await p.evaluate(() => !!document.querySelector('#history .pos [data-i]'));
  if (hasPhoto) {
    await p.click('#history .pos [data-i]'); await p.waitForTimeout(400);
    const lb = await p.evaluate(() => ({ open: getComputedStyle(document.getElementById('lb')).display !== 'none'
        && (document.getElementById('lb').classList.contains('open') || document.getElementById('lb').classList.contains('on') || getComputedStyle(document.getElementById('lb')).visibility !== 'hidden'),
      tools: ['pxRotL', 'pxRotR', 'pxZoom', 'pxReset', 'pxSave', 'pxCrop'].filter(id => !!document.getElementById(id)) }));
    ok('a photograph opens the lightbox', lb.open, JSON.stringify(lb));
    ok('  which carries rotate, zoom, crop, reset and save', lb.tools.length === 6, lb.tools.join(','));
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  } else {
    note('no photograph in this fixture to open');
  }

  /* ───────────────────────── BOTH LANGUAGES ───────────────────────── */
  console.log('\n4. NOTHING ON THESE PAGES IS A RAW KEY, IN EITHER LANGUAGE');
  for (const Lg of ['ru', 'en']) {
    await p.click('.lang button[data-lang="' + Lg + '"]'); await p.waitForTimeout(500);
    const raw = await p.evaluate(() => {
      const txt = ['#tab-actions', '#tab-due', '#tab-equipment'].map(s => document.querySelector(s).innerText).join(' ');
      /* Case-insensitive: a table heading is rendered in capitals, and
         "TH_POINT" is the same raw key as "th_point". */
      return (txt.match(/\b(dd|a|s|hh|hv|th|ov|eq)_[a-z_0-9]+\b/gi) || []).slice(0, 5);
    });
    ok(Lg + ': no raw key on the three pages', raw.length === 0, raw.join(','));
    if (Lg === 'ru') {
      const cyr = await p.evaluate(() => ({ tabs: document.getElementById('ddSeg').innerText, act: document.querySelector('#tab-actions h2').textContent,
        start: (document.querySelector('#ddList .ddact a') || {}).textContent }));
      ok('ru: the schedule tabs, the actions title and the row buttons are in Russian',
         /[А-Яа-я]/.test(cyr.tabs) && /[А-Яа-я]/.test(cyr.act) && /[А-Яа-я]/.test(cyr.start || 'x'), JSON.stringify(cyr).slice(0, 100));
    }
  }

  ok('no application errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nALL PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(String(e && e.stack || e).slice(0, 600)); process.exit(1); });
