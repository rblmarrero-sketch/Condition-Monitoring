/* THE "1C PM" TAB — a mechanic's own repair queue, raised by the office.

   Asked for by name: "I need help in redesign this... make it simple. List
   put List=1C PM ... Inside 1C is P1 P2 P3 P4 P5... The goal is for
   Mechanics to use this app to see their Repair jobs... In that list I want
   to see the CMMSWork order status... we can tap and View or RTW... In the
   Information view, Equipment no, Component, Work request number, Type of
   Defect, Defect description, WODefect cause."

   This tab replaced the small "Return to Work" entry card and its own Pick
   overlay — both retired, since this tab IS that list now, reached with no
   extra tap. It reads SCHED.rtwOpen exactly as the old Pick screen did
   (ingest/ingest_work_orders.py's build_rtw_open, proven directly against
   the real function in tests/rtwopen.py) — every open work order 1C holds,
   service and repair alike — and adds nothing of its own beyond priority
   filtering and the day-grouped, chronological layout asked for in as many
   words ("sorted same as you did in the 14 days, with dates").

   Sections 10-12 are carried over from the retired tests/duetoday.cjs (the
   old 1C-schedule agenda, dueWeekRows()/#dueWeekList, is gone — this tab
   supersedes it) — SCHED_MS/SCHED_STALE_MS/schedTimer/schedEnsureLoaded are
   generic auto-refresh plumbing, not week-view-specific, and this tab is now
   the one screen that actually depends on SCHED arriving by itself, so the
   proof moved here rather than being lost. tests/dueplan.cjs still proves
   schedWalkedFor()/planRows() directly — that rule has no UI display in
   this tab (a raw open work order, not a CM round) and never did here.

   Run: node tests/duepm.cjs   (starts its own server) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8478);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const today = new Date();
const plus = n => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* PM1 — a planned service, no defect fields at all: status only.
   DEF1 — a repair work order carrying every defect field, priority P1,
     plan date today.
   DEF2 — a repair work order, priority P2, 3 days out — same day as PM1,
     to prove BOTH show under the same day group.
   DEF3 — priority P3, 3 days back — must still show, marked late, since a
     job 1C still calls open is never dropped for its date.
   DEF4 — no date at all (both plan and raised blank) — the "no date" group. */
const FIXTURE = {
  generated: new Date().toISOString(),
  byUnit: {},
  rtwOpen: [
    { wo: 'WO-1', equip: 'PM1', cls: 'HT', comp: '', desc: '4000h service',
      priority: 'P4 Planned (PM)', raised: plus(3), type: '4000 Hours service Planned',
      hours: 4000, plan: plus(3), status: 'Released', request: '', defType: '', cause: '' },
    { wo: 'WO-2', equip: 'DEF1', cls: '', comp: 'Rear Differential',
      desc: 'Ferrous debris — heavy', priority: 'P1 Critical', raised: today.toISOString().slice(0, 10),
      type: '4.1', hours: null, plan: today.toISOString().slice(0, 10), status: 'In Progress',
      request: 'DR-000100', defType: '4.1', cause: 'Contamination' },
    { wo: 'WO-3', equip: 'DEF2', cls: '', comp: 'Frame / guards',
      desc: 'Abnormal wear', priority: 'P2 Severe', raised: plus(3),
      type: '2.1', hours: null, plan: plus(3), status: 'Registered',
      request: 'DR-000101', defType: '2.1', cause: '' },
    { wo: 'WO-4', equip: 'DEF3', cls: '', comp: 'Boom',
      desc: 'Crack reported', priority: 'P3 Planned', raised: plus(-3),
      type: '1.1', hours: null, plan: plus(-3), status: 'Registered',
      request: 'DR-000102', defType: '1.1', cause: '' },
    { wo: 'WO-5', equip: 'DEF4', cls: '', comp: 'Engine',
      desc: 'Oil leak', priority: 'P3 Planned', raised: '',
      type: '5.1', hours: null, plan: '', status: 'Registered',
      request: 'DR-000103', defType: '5.1', cause: '' },
  ],
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/data/schedule_slim.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(FIXTURE));
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForFunction(() => typeof SCHED !== 'undefined' && SCHED && SCHED.rtwOpen && SCHED.rtwOpen.length === 5,
    null, { timeout: 25000 });
  await p.waitForTimeout(300);

  console.log('\n1. 1C PM is the tab that opens by default');
  ok('the 1C PM tab is selected', await p.evaluate(() => $('dueViewPM').classList.contains('on')));
  ok('the 1C PM panel is visible, CM is not', await p.evaluate(() =>
    !$('duePmWrap').classList.contains('hidden') && $('dueCmWrap').classList.contains('hidden')));

  console.log('\n2. every open work order is listed, one row per WO');
  const rows0 = await p.evaluate(() => [...document.querySelectorAll('#duePmList [data-wo]')].map(b => b.dataset.wo));
  ok('all five rtwOpen entries are on the list', rows0.length === 5, JSON.stringify(rows0));

  console.log('\n3. grouped by day, chronological, and a day already gone is marked late');
  const groups = await p.evaluate(() => [...document.querySelectorAll('#duePmList .daygroup')].map(g => g.innerText));
  ok('DEF3 (3 days back) is drawn, not dropped for being open and overdue',
     groups.some(g => g.includes('DEF3')), JSON.stringify(groups.map(g => g.slice(0, 30))));
  ok('  and its day reads late', groups.find(g => g.includes('DEF3') && /late|просроч/i.test(g)) !== undefined);
  ok('PM1 and DEF2 share one day group — same plan date', (() => {
    const g = groups.find(x => x.includes('PM1'));
    return !!g && g.includes('DEF2');
  })());
  ok('DEF4 (no date at all) sits in its own trailing group', groups.some(g => g.includes('DEF4') && !/\d/.test(g.split('\n')[0])));
  const order = groups.map(g => (g.match(/PM1|DEF1|DEF2|DEF3|DEF4/) || [''])[0]);
  const idxOf = u => order.findIndex(x => x === u);
  ok('DEF3 (earliest date, 3 days back) sorts before DEF1 (today)', idxOf('DEF3') < groups.findIndex(g => g.includes('DEF1')));

  console.log('\n4. priority chips — only the codes actually present, with real counts');
  const chips = await p.evaluate(() => [...document.querySelectorAll('#pmPrioF [data-pp]')].map(b => ({ pp: b.dataset.pp, n: (b.querySelector('.n') || {}).textContent })));
  ok('P1, P2, P3, P4 all appear (one WO each) and no P5 (none in the fixture)',
     JSON.stringify(chips.map(c => c.pp).sort()) === JSON.stringify(['', 'P1', 'P2', 'P3', 'P4']), JSON.stringify(chips));
  ok('the All chip counts every open WO', chips.find(c => c.pp === '').n === '5', JSON.stringify(chips));
  await p.click('#pmPrioF [data-pp="P1"]');
  await p.waitForTimeout(200);
  const p1rows = await p.evaluate(() => [...document.querySelectorAll('#duePmList [data-wo]')].map(b => b.dataset.wo));
  ok('filtering to P1 shows only DEF1\'s work order', JSON.stringify(p1rows) === '["WO-2"]', JSON.stringify(p1rows));
  await p.click('#pmPrioF [data-pp=""]');
  await p.waitForTimeout(200);

  console.log('\n5. the info sheet — a repair work order carries every defect field named');
  await p.click('#duePmList [data-wo="WO-2"]');
  await p.waitForTimeout(150);
  ok('the sheet names the work order', (await p.textContent('#pmInfoWo')).trim() === 'WO-2');
  const def1 = (await p.textContent('#pmInfoBody')).replace(/\s+/g, ' ');
  ok('Equipment no.', def1.includes('DEF1'));
  ok('Component', def1.includes('Rear Differential'));
  ok('Work request number', def1.includes('DR-000100'));
  ok('Type of defect', /4\.1/.test(def1));
  ok('Defect description', def1.includes('Ferrous debris'));
  ok('Cause (WODefect cause)', def1.includes('Contamination'));
  ok('CMMS status', def1.includes('In Progress'));
  ok('Priority', def1.includes('P1 Critical'));
  await p.click('#pmInfoBack');
  await p.waitForTimeout(100);
  ok('Back closes the sheet', !(await p.isVisible('#pmOv')));

  console.log('\n6. a planned PM service carries no defect fields — nothing invented');
  await p.click('#duePmList [data-wo="WO-1"]');
  await p.waitForTimeout(150);
  const pm1 = (await p.textContent('#pmInfoBody')).replace(/\s+/g, ' ');
  ok('the service still names the equipment and status', pm1.includes('PM1') && pm1.includes('Released'));
  ok('no component, request number or cause are shown for a service', !/Component|Work request number|Cause/.test(pm1));
  ok('the description reads as the service, not a defect', pm1.includes('4000h service'));
  await p.click('#pmInfoBack');
  await p.waitForTimeout(100);

  console.log('\n7. search reaches equipment and work order number both');
  await p.fill('#dueFind', 'DEF2');
  await p.waitForTimeout(200);
  ok('searching by equipment narrows to its own work order', JSON.stringify(
    await p.evaluate(() => [...document.querySelectorAll('#duePmList [data-wo]')].map(b => b.dataset.wo))
  ) === '["WO-3"]');
  await p.fill('#dueFind', 'WO-4');
  await p.waitForTimeout(200);
  ok('searching by WO number finds the same record the other way', JSON.stringify(
    await p.evaluate(() => [...document.querySelectorAll('#duePmList [data-wo]')].map(b => b.dataset.wo))
  ) === '["WO-4"]');
  await p.fill('#dueFind', 'ZZZNOMATCH');
  await p.waitForTimeout(200);
  ok('a search with no hits says so, not a blank box', /nothing|ничего/i.test(await p.textContent('#duePmList')));
  await p.fill('#dueFind', '');
  await p.waitForTimeout(200);

  console.log('\n8. Start Return to Work hands the row straight to the real checklist');
  await p.click('#duePmList [data-wo="WO-3"]');
  await p.waitForTimeout(150);
  await p.click('#pmStartRtwBtn');
  await p.waitForTimeout(200);
  ok('the RTW overlay opens on the checklist, not a picker', await p.isVisible('#rtwChecklistScr'));
  ok('the equipment and work order carried straight through', (await p.textContent('#rtwChecklistBody')).includes('DEF2'));
  await p.click('#rtwChecklistBack');
  await p.waitForTimeout(150);

  console.log('\n9. an empty queue says so, not a blank box');
  await p.evaluate(() => { SCHED = { generated: new Date().toISOString(), byUnit: {}, rtwOpen: [] }; renderDue(); });
  await p.waitForTimeout(200);
  ok('nothing open reads as a real sentence', /nothing|ничего/i.test(await p.textContent('#duePmList')));
  ok('no priority chips when there is nothing to filter', (await p.evaluate(() => document.getElementById('pmPrioF').innerHTML)).trim() === '');

  console.log('\n10. it asks for the file by itself (carried from the retired agenda\'s own proof — the timer is generic, not week-view-specific)');
  await p.evaluate(() => { SCHED = null; try{ localStorage.removeItem('cm_sched'); }catch(e){} });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForFunction(() => typeof SCHED !== 'undefined' && SCHED && SCHED.rtwOpen && SCHED.rtwOpen.length === 5,
    null, { timeout: 25000 });
  await p.waitForTimeout(300);
  const wired = await p.evaluate(() => ({ ms: SCHED_MS, stale: SCHED_STALE_MS, timer: !!schedTimer }));
  ok('a timer is running', wired.timer === true);
  ok('  at ten minutes or better, for an hourly source', wired.ms > 0 && wired.ms <= 600000,
     Math.round(wired.ms / 60000) + ' min');
  ok('  and the copy in hand goes stale well inside the hour', wired.stale <= 900000,
     Math.round(wired.stale / 60000) + ' min');

  console.log('\n11. a pull that has moved lands without anybody pressing anything');
  const before = await p.evaluate(() => SCHED.generated);
  FIXTURE.generated = new Date(Date.now() + 1000).toISOString();
  FIXTURE.rtwOpen = FIXTURE.rtwOpen.concat([{ wo: 'WO-9', equip: 'DEF9', cls: '', comp: 'Bucket',
    desc: 'New crack', priority: 'P1 Critical', raised: today.toISOString().slice(0, 10),
    type: '1.2', hours: null, plan: today.toISOString().slice(0, 10), status: 'Registered',
    request: 'DR-000199', defType: '1.2', cause: '' }]);
  const moved = await p.evaluate(() => schedEnsureLoaded(true));
  ok('the file is asked for and the page takes the newer pull', moved === true
     && (await p.evaluate(() => SCHED.generated)) !== before, before);
  await p.evaluate(() => renderDue());
  await p.waitForTimeout(200);
  ok('  the new work order is on the list without a reload',
     (await p.evaluate(() => [...document.querySelectorAll('#duePmList [data-wo]')].map(b => b.dataset.wo))).includes('WO-9'));

  console.log('\n12. the same pull twice is not a change, and does not repaint');
  const same = await p.evaluate(() => schedEnsureLoaded(true));
  ok('an unchanged file reports nothing to do', same === false, String(same));

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));

  await b.close();
  server.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); server.close(); process.exit(1); });
