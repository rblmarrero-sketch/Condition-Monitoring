/* THE OVERVIEW ANSWERS "WHAT NEEDS ME TODAY", AND EVERY NUMBER ON IT IS A DOOR.

   Six headlines — Critical equipment, Degraded equipment, Overdue inspections,
   Open maintenance actions, Unassigned actions, Grade review required — each
   of which opens the page that holds the list behind it, already filtered to
   what the headline counted, with the address following so Back returns.

   Every count is cross-checked against the page's own functions, because a
   headline that disagrees with the list behind it is this project's defect
   in its purest form: a real value, rendered as a different real value.

   Compliance and the condition trend share one row; the ten machines that
   matter most are a table with the work each is waiting on; one "Definitions"
   control explains the page instead of six "How this is counted" boxes; and
   nothing on the page draws the whole dataset.

   Run: node tests/overview2.cjs        (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const BASE = process.env.CM_BASE || 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const note = (n, d) => console.log('  ....  ' + n + (d !== undefined ? '   ' + d : ''));
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());

(async () => {
  /* Forty rounds, a few of them with a grade the stored severity does not
     explain, so the review headline has something to count. */
  await reset('n=40');
  await reset('keyless=TK115,2026-08-05,TB,6,have');
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
  await p.waitForTimeout(2000);

  console.log('\n1. SIX HEADLINES, EACH A BUTTON, AND THE STRIP FITS');
  const strip = await p.evaluate(() => {
    const k = document.getElementById('kpis');
    const kids = [...k.children];
    return { ids: kids.map(x => x.id), buttons: kids.filter(x => x.tagName === 'BUTTON').length,
             h: Math.round(k.getBoundingClientRect().height),
             rows: new Set(kids.map(x => Math.round(x.getBoundingClientRect().top))).size,
             defs: document.querySelectorAll('#tab-overview details.method').length,
             hasDefs: !!document.getElementById('ovDefs'),
             defsOpen: !!(document.getElementById('ovDefs') || {}).open };
  });
  note('tiles', strip.ids.join(' · '));
  ['kpiCrit', 'kpiDeg', 'kpiOver', 'kpiAct', 'kpiNoown', 'kpiReview'].forEach(id =>
    ok('the strip has ' + id, strip.ids.includes(id)));
  ok('all six are buttons', strip.buttons === 6, String(strip.buttons));
  ok('the strip is one row at 1366', strip.rows === 1, strip.rows + ' row(s)');
  ok('and fits 120px', strip.h <= 120, strip.h + 'px');
  ok('no card on the page carries its own "How this is counted"', strip.defs === 0, String(strip.defs));
  ok('  one page-level Definitions control does instead', strip.hasDefs && !strip.defsOpen);

  console.log('\n2. EVERY HEADLINE AGREES WITH THE PAGE\'S OWN ARITHMETIC');
  /* One finding whose stored severity its grade cannot explain — the case
     the review headline exists for — so that headline has something to
     count and somewhere to go. Made with the page's own rule, not a copy. */
  await p.evaluate(() => {
    const r = RECS.find(x => !x._void && x.items && x.items[0] && x.items[0].grade === 1);
    if (r) { r.items[0].sev = 'DEG'; renderAll(); }
  });
  await p.waitForTimeout(300);
  const tally = await p.evaluate(() => {
    const v = id => Number((document.querySelector('#' + id + ' .v') || {}).textContent || NaN);
    const recs = filtered(), f = findings(recs);
    const latest = {};
    recs.forEach(r => { if (!latest[r.equip] || (r.date || '') > (latest[r.equip].date || '')) latest[r.equip] = r; });
    let crit = 0, deg = 0;
    Object.values(latest).forEach(r => { const w = worstOf(r); if (w === 5) crit++; else if (w === 3) deg++; });
    const act = f.filter(x => actionRequired(x.r, x.i)).length;
    const noown = f.filter(x => actionRequired(x.r, x.i) && !x.i.owner).length;
    const over = dueTabRows().filter(r => r.st === 'over').length;
    const review = sevConflicts().length;
    const navAct = Number($('nbAct').textContent || 0), navDue = Number($('nbDue').textContent || 0);
    return { shown: { crit: v('kpiCrit'), deg: v('kpiDeg'), over: v('kpiOver'), act: v('kpiAct'),
                      noown: v('kpiNoown'), review: v('kpiReview') },
             truth: { crit, deg, over, act, noown, review }, navAct, navDue,
             units: Object.keys(latest).length };
  });
  console.log('   shown ' + JSON.stringify(tally.shown));
  console.log('   truth ' + JSON.stringify(tally.truth));
  Object.keys(tally.truth).forEach(k =>
    ok(k.padEnd(7) + ' headline equals the predicate', tally.shown[k] === tally.truth[k],
       tally.shown[k] + ' vs ' + tally.truth[k]));
  ok('critical + degraded machines never exceed the machines in view',
     tally.shown.crit + tally.shown.deg <= tally.units, (tally.shown.crit + tally.shown.deg) + ' of ' + tally.units);
  ok('open actions agree with the navigation badge', tally.shown.act === tally.navAct,
     tally.shown.act + ' vs ' + tally.navAct);
  ok('overdue inspections agree with the navigation badge', tally.shown.over === tally.navDue,
     tally.shown.over + ' vs ' + tally.navDue);
  ok('there is something to review in this fixture, so the routing below is real', tally.truth.review > 0,
     String(tally.truth.review));

  console.log('\n3. EACH HEADLINE OPENS THE RIGHT PAGE, ALREADY FILTERED, AND THE ADDRESS FOLLOWS');
  const press = async id => {
    await p.evaluate(() => { showTab('overview'); clearFilters(); });
    await p.waitForTimeout(250);
    return p.evaluate(async id2 => {
      document.getElementById(id2).click();
      await new Promise(r => setTimeout(r, 450));
      const pagerTotal = () => {
        const el = document.querySelector('#actionTbl .pager .muted');
        if (el) { const m = /of\s*([\d.,  ]+)/.exec(el.textContent || ''); if (m) return Number(m[1].replace(/\D/g, '')); }
        return document.querySelectorAll('#actionTbl tbody tr').length;
      };
      return { tab: CUR_TAB, hash: location.hash, af: aFilt(), sev: drill.sev,
               dd: (document.getElementById('ddScope') || {}).value,
               actRows: pagerTotal(),
               dueRows: document.querySelectorAll('#ddList tbody tr, #ddList .duerow, #ddList tr').length,
               fleetRows: document.querySelectorAll('#fleetTbl tbody tr').length,
               fleetSevs: [...document.querySelectorAll('#fleetTbl tbody tr td:nth-child(2)')].map(x => x.textContent.trim()) };
    }, id);
  };
  let r = await press('kpiCrit');
  ok('Critical equipment stays on Overview and filters the table to Critical',
     r.tab === 'overview' && r.sev === 5, r.tab + ' · sev=' + r.sev);
  ok('  the address says so', /#overview\?.*sev=5/.test(r.hash), r.hash);
  ok('  and every row shown is Critical', r.fleetRows > 0 && r.fleetSevs.every(s => /critical/i.test(s)),
     r.fleetRows + ' rows: ' + r.fleetSevs.slice(0, 3).join(' | '));
  r = await press('kpiDeg');
  ok('Degraded equipment filters the table to Degraded', r.tab === 'overview' && r.sev === 3, r.tab + ' · sev=' + r.sev);
  ok('  and every row shown is Degraded', r.fleetRows > 0 && r.fleetSevs.every(s => /degraded/i.test(s)),
     r.fleetRows + ' rows: ' + r.fleetSevs.slice(0, 3).join(' | '));
  r = await press('kpiOver');
  ok('Overdue inspections opens the Inspection Schedule on the overdue list', r.tab === 'due' && r.dd === 'over',
     r.tab + ' · scope=' + r.dd);
  ok('  the address names the page', /^#due/.test(r.hash), r.hash);
  r = await press('kpiAct');
  ok('Open maintenance actions opens Maintenance Actions on the open list', r.tab === 'actions' && r.af === 'open',
     r.tab + ' · filter=' + r.af);
  ok('  and the register holds exactly what the headline counted', r.actRows === tally.shown.act,
     r.actRows + ' vs ' + tally.shown.act);
  r = await press('kpiNoown');
  ok('Unassigned actions opens Maintenance Actions filtered to unassigned', r.tab === 'actions' && r.af === 'noown',
     r.tab + ' · filter=' + r.af);
  r = await press('kpiReview');
  ok('Grade review opens Data & Sync', r.tab === 'sync' && /^#sync/.test(r.hash), r.tab + ' ' + r.hash);
  const flashed = await p.evaluate(() => {
    const box = document.getElementById('sySevBox');
    return { flash: !!box && box.classList.contains('flash'),
             inView: !!box && box.getBoundingClientRect().top < innerHeight };
  });
  ok('  and lands on the grade review panel', flashed.flash && flashed.inView, JSON.stringify(flashed));

  console.log('\n4. BACK RETURNS TO THE OVERVIEW');
  await p.goBack(); await p.waitForTimeout(500);
  const back = await p.evaluate(() => ({ tab: CUR_TAB, hash: location.hash }));
  ok('Back from a headline\'s page returns to Overview', back.tab === 'overview', back.hash + ' · ' + back.tab);

  console.log('\n5. COMPLIANCE AND TREND SHARE A ROW; THE TABLE CARRIES THE WORK');
  await p.evaluate(() => { showTab('overview'); clearFilters(); });
  await p.waitForTimeout(300);
  const lay = await p.evaluate(() => {
    const y = sel => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().top) : null; };
    const comp = document.getElementById('covComp');
    const cols = [...document.querySelectorAll('#fleetTbl thead th')].map(t => t.dataset.sort);
    const rows = [...document.querySelectorAll('#fleetTbl tbody tr')];
    const cell = (tr, k) => (tr.children[cols.indexOf(k)] || {}).textContent || '';
    const machines = new Set(filtered().map(r => r.equip)).size;
    return { covY: y('#covTbl'), trendY: y('#trendChart'),
             comp: (comp ? comp.innerText : '').replace(/\s+/g, ' ').trim(),
             compBtn: !!(comp && comp.querySelector('button')),
             cols, rows: rows.length, machines,
             firstRowY: rows[0] ? Math.round(rows[0].getBoundingClientRect().top) : null,
             sample: rows.slice(0, 3).map(tr => ({ u: cell(tr, 'equip').trim(), g: cell(tr, 'sev').trim(),
               act: cell(tr, 'act').replace(/\s+/g, ' ').trim().slice(0, 60),
               st: ((tr.children[cols.indexOf('act')] || {}).querySelector
                    ? ((tr.children[cols.indexOf('act')].querySelector('.fstat') || {}).textContent || cell(tr, 'act')) : '').trim() })),
             shown: (document.getElementById('fleetShown') || {}).textContent || '' };
  });
  ok('compliance and trend sit on one row', lay.covY !== null && lay.trendY !== null && Math.abs(lay.covY - lay.trendY) < 60,
     lay.covY + ' vs ' + lay.trendY);
  ok('the compliance figure carries its denominator and is a door to the schedule',
     /\d+\s*of\s*\d+/.test(lay.comp) && lay.compBtn, lay.comp.slice(0, 60));
  ['equip', 'sev', 'defect', 'act', 'owner', 'adue', 'due'].forEach(k =>
    ok('the table has a ' + k + ' column', lay.cols.includes(k), lay.cols.join(',')));
  ok('the table shows at most ten machines on Overview', lay.rows > 0 && lay.rows <= 10, lay.rows + ' of ' + lay.machines);
  ok('  and says how many there are in all', new RegExp('\\b' + lay.machines + '\\b').test(lay.shown), lay.shown);
  ok('  its first row is above the fold', lay.firstRowY !== null && lay.firstRowY < 768, String(lay.firstRowY));
  note('rows', JSON.stringify(lay.sample));
  ok('the grade column names the severity, not a code', lay.sample.every(s => /critical|degraded|incipient|normal|no failure/i.test(s.g)),
     lay.sample.map(s => s.g).join(' | '));
  ok('the action cell carries its status, in plain words',
     lay.sample.every(s => /planning required|open|planned|in progress|no open work/i.test(s.st)),
     lay.sample.map(s => s.st).join(' | '));
  const wide = await p.evaluate(() => {
    const w = document.querySelector('#fleetTbl').closest('.tblwrap');
    return { table: document.querySelector('#fleetTbl').scrollWidth, box: w ? w.clientWidth : 0 };
  });
  ok('and the whole table fits the screen at 1366, with no sideways scroll inside it',
     wide.table <= wide.box + 1, wide.table + ' in ' + wide.box);

  console.log('\n6. THE DEFINITIONS CONTROL EXPLAINS EVERY HEADLINE, IN BOTH LANGUAGES');
  for (const L of ['en', 'ru']) {
    await p.click('.lang button[data-lang="' + L + '"]'); await p.waitForTimeout(400);
    const d = await p.evaluate(() => {
      const box = document.getElementById('ovDefs');
      box.open = true;
      const dts = [...box.querySelectorAll('dt')].map(x => x.textContent.trim());
      const dds = [...box.querySelectorAll('dd')].map(x => x.textContent.trim());
      const raw = dds.filter(x => /^[a-z_0-9]+$/.test(x));       // an untranslated key
      const heads = [...document.querySelectorAll('#kpis .k')].map(x => x.textContent.trim());
      const r = box.querySelector('.defsbody').getBoundingClientRect();
      box.open = false;
      return { dts, raw, heads, onScreen: r.right <= innerWidth + 1 && r.left >= 0 };
    });
    ok(L + ': every headline has a definition', d.heads.slice(0, 6).every(h => d.dts.some(t => t.toLowerCase() === h.toLowerCase())),
       d.heads.slice(0, 6).filter(h => !d.dts.some(t => t.toLowerCase() === h.toLowerCase())).join(' | ') || 'all six');
    ok(L + ': and none of them is a raw key', d.raw.length === 0, d.raw.join(','));
    ok(L + ': the popover stays on screen', d.onScreen);
    const fit = await p.evaluate(() => {
      const tw = document.querySelector('#fleetTbl'), box = tw.closest('.tblwrap');
      return { table: tw.scrollWidth, box: box.clientWidth,
               strip: Math.round(document.getElementById('kpis').getBoundingClientRect().height) };
    });
    ok(L + ': the attention table fits the screen', fit.table <= fit.box + 1, fit.table + ' in ' + fit.box);
    ok(L + ': and the strip still fits 120px', fit.strip <= 120, fit.strip + 'px');
  }
  await p.click('.lang button[data-lang="en"]'); await p.waitForTimeout(300);
  const esc2 = await p.evaluate(async () => {
    const box = document.getElementById('ovDefs'); box.open = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    const afterEsc = box.open;
    box.open = true;
    document.getElementById('kpis').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    return { afterEsc, afterOutside: box.open };
  });
  ok('Escape closes it', esc2.afterEsc === false);
  ok('and so does a press outside it', esc2.afterOutside === false);

  console.log('\n7. NOTHING ON THE PAGE DRAWS THE WHOLE DATASET');
  await reset('scale=600,600');
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 500, null, { timeout: 90000 });
  await p.waitForTimeout(2500);
  const big = await p.evaluate(() => ({
    recs: RECS.length,
    fleetRows: document.querySelectorAll('#fleetTbl tbody tr').length,
    covRows: document.querySelectorAll('#covTbl tbody tr').length,
    months: document.querySelectorAll('#trendChart .tmon').length,
    tall: +(document.documentElement.scrollHeight / innerHeight).toFixed(2),
    wide: document.documentElement.scrollWidth > innerWidth + 1,
    stripH: Math.round(document.getElementById('kpis').getBoundingClientRect().height) }));
  console.log('   ' + JSON.stringify(big));
  ok('600 inspections loaded', big.recs >= 600, String(big.recs));
  ok('the attention table still draws ten', big.fleetRows <= 10, String(big.fleetRows));
  ok('coverage draws a handful of rounds', big.covRows <= 8, String(big.covRows));
  ok('the trend draws at most twelve months', big.months <= 12, String(big.months));
  /* Two screens on the live folder (checked at deployment); a fleet-sized
     folder adds rounds to the coverage table and months to the trend, and
     that — not the table, which stays at ten rows — is the extra fifth. */
  ok('the page stays near two screens at 1366 with 600 inspections loaded', big.tall <= 2.3, big.tall + ' screens');
  ok('and never scrolls sideways', !big.wide);
  ok('the strip still fits', big.stripH <= 120, big.stripH + 'px');

  ok('no application errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nALL PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(String(e && e.stack || e).slice(0, 600)); process.exit(1); });
