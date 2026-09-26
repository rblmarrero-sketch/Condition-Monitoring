/* THE "1C PLAN" SCOPE ON THE DUE LIST.

   The List is built from what CM has WALKED — the last-done index — so a
   machine CM has no history for produces no row, and a round 1C has an open
   work order for is invisible there however urgent. The screen said so
   ("1C has 139 planned … see Two weeks") and pointed at the agenda, which is
   a calendar: fifteen day-columns, no search, no sort by urgency. Reported
   from the field as "still 0 in the list" while 1C had 139 waiting.

   The "1C plan" pill this scope lived behind is gone from the Due tab's own
   UI now — 1C's own data has a first-class tab of its own ("1C PM", built
   from SCHED.rtwOpen, see tests/duepm.cjs) and the CM tab's merged agenda
   never mixed CM's own judgement with 1C's, so there is nothing left on
   screen to click through to planRows()'s own output. planRows() itself is
   UNCHANGED — nothing about its logic moved — so what remains worth testing
   here is asserted directly against the function, the way this project's own
   rules ask for ("ask the app, not keep your own copy") rather than through
   a control that no longer exists:

   1. IT IS REAL WORK, NOT A COPY OF THE WORK-ORDER FILE. A round already
      walked since 1C asked for it is not work and must not be listed; a
      round the site has taken off a machine is never proposed here either,
      or the KAMAZ exclusion holds everywhere except the screen an inspector
      reads first.
   2. ONE ROW PER MACHINE AND ROUND. Two work orders in the window can
      resolve to the same round — the 1,000 h and the 4,000 h both carry the
      filter cut — and a list that counts one round twice cannot be counted.
   3. A ROUND AN INSPECTOR HAS DEFERRED IS NOT PROPOSED AS 1C'S PLAN EITHER —
      the identical gap the KAMAZ hold-off check above was written for, one
      function over.

   Run: node tests/dueplan.cjs   (starts its own server) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8462);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const day = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = day(0);

/* PLAN1  a round 1C wants in three days, nothing recorded — real work.
   PLAN2  planned four days AGO and still not walked — real work, and late.
   PLAN3  planned three days ago and WALKED two days ago — done, not work.
   PLAN4  planned twenty days out — beyond the agenda, not this fortnight.
   PLAN5  two work orders in the window both resolving to FC — one row.
   KAMAZ  the held-off make: its inspection must not be proposed here. */
const FIXTURE = {
  generated: new Date().toISOString(),
  byUnit: {
    TK001: [{ wo: 'WO-030001', hours: 250, types: ['MP'], plan: day(3), priority: 'P3 Planned (PM)' }],
    TK002: [{ wo: 'WO-030002', hours: 250, types: ['MP'], plan: day(-4), priority: 'P3 Planned (PM)' }],
    TK003: [{ wo: 'WO-030003', hours: 250, types: ['MP'], plan: day(-3), priority: 'P3 Planned (PM)' }],
    TK004: [{ wo: 'WO-030004', hours: 250, types: ['MP'], plan: day(20), priority: 'P3 Planned (PM)' }],
    TK005: [{ wo: 'WO-030005', hours: 1000, types: ['FC'], plan: day(5), priority: 'P3 Planned (PM)' },
            { wo: 'WO-030006', hours: 4000, types: ['FC', 'MP'], plan: day(2), priority: 'P3 Planned (PM)' }],
  },
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
  await p.addInitScript(h => {
    localStorage.setItem('up_dests', '[]');
    /* TK003's plug round was walked two days ago, after 1C asked for it. */
    localStorage.setItem('cm_hist', JSON.stringify(h));
    localStorage.setItem('cm_hist_at', JSON.stringify({ at: Date.now(), n: 1 }));
  }, { ['MP|TK003']: { d: day(-2), h: '5000' } });
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.evaluate(() => showPane('paneDue'));
  /* NOT window.SCHED — a top-level let is not a property of window. Both Due
     tabs fetch the schedule unconditionally now (renderDue()'s own SCHED
     kick), so simply opening the pane is enough to populate it. */
  await p.waitForFunction(() => typeof SCHED !== 'undefined' && SCHED && SCHED.byUnit && SCHED.byUnit.TK001,
    null, { timeout: 25000 });

  console.log('\n1. WHAT 1C HAS ASKED FOR, AND ONLY THAT');
  const rows = await p.evaluate(() => planRows('').map(r => r.unit + '|' + r.ty + '|' + r.plan));
  ok('the plug round 1C wants in three days is listed',
     rows.some(r => r.startsWith('TK001|MP')), rows.join('  '));
  ok('  and the one it wanted four days ago and nobody walked',
     rows.some(r => r.startsWith('TK002|MP')), rows.join('  '));
  ok('a round already walked since 1C asked for it is NOT work',
     !rows.some(r => r.startsWith('TK003|')), rows.join('  '));
  ok('  nor is one planned beyond the fortnight', !rows.some(r => r.startsWith('TK004|')),
     rows.join('  '));
  const fc = rows.filter(r => r.startsWith('TK005|FC'));
  ok('two work orders resolving to one round make ONE row', fc.length === 1, JSON.stringify(fc));
  ok('  dated by the earlier of them — that is when the work is wanted',
     fc[0] && fc[0].endsWith(day(2)), fc[0]);

  console.log('\n2. THE ROUNDS THE SITE HAS TAKEN OFF A MACHINE ARE NOT PROPOSED HERE EITHER');
  const km = await p.evaluate(d => {
    const a = ASSETS.find(x => /KAMAZ/i.test(String(x.m || '') + ' ' + String(x.mk || '')) && x.cls === 'HT');
    if (!a) return null;
    SCHED.byUnit[a.n] = [{ wo: 'WO-030099', hours: 4000, types: ['FC', 'INSP', 'MP', 'TB'],
                           plan: d, priority: 'P3 Planned (PM)' }];
    const got = planRows('').filter(r => r.unit === a.n).map(r => r.ty).sort();
    delete SCHED.byUnit[a.n];
    /* ASKED, NOT REMEMBERED. This held the literal ["FC"] — a copy of which
       rounds the site had taken a KAMAZ off on 12 September — so when they
       took it off the rest on the 14th the suite failed on correct code and
       said the opposite of the truth. The rule lives in due.js; what belongs
       here is that the 1C plan OBEYS it. */
    return { unit: a.n, got,
             held: got.filter(ty => !!DUE.offRound(ty, a)),
             onAny: ['MP','FC','INSP','TEMP','UC','GET','TB','LUBE']
                      .filter(ty => !DUE.offRound(ty, a)) };
  }, day(1));
  ok('a round the site has taken off a machine is never proposed here',
     km && km.held.length === 0, km && km.unit + ' -> ' + JSON.stringify(km.got));
  ok('  and with a KAMAZ off every round, the 1C plan proposes none',
     km && km.onAny.length === 0 && km.got.length === 0,
     km && 'still on ' + JSON.stringify(km.onAny));

  console.log('\n3. A ROUND AN INSPECTOR HAS DEFERRED IS NOT PROPOSED AS 1C\'S PLAN EITHER');
  /* dueRows() and dueWeekRows() both ask deferOf()/deferState() before
     listing a round; planRows() -- the THIRD reader of the same schedule --
     never did, so "Not being done" recorded on the List went on being
     contradicted by the agenda's own "1C plan" scope the moment the work
     order came due. Same shape as the KAMAZ hold-off above, one function
     over: two readers of one fact, one of them never asked. */
  const deferred = await p.evaluate(u => {
    deferPut('MP', u, { until: null, why: 'test defer', whyKey: '', by: 'test', at: new Date().toISOString() });
    const got = planRows('').map(r => r.unit + '|' + r.ty);
    deferClear('MP', u);
    const restored = planRows('').map(r => r.unit + '|' + r.ty);
    return { got, restored };
  }, 'TK001');
  ok('a round on an open deferral is not proposed as 1C\'s plan',
     !deferred.got.some(r => r === 'TK001|MP'), deferred.got.join('  '));
  ok('  clearing the deferral brings it back',
     deferred.restored.some(r => r === 'TK001|MP'), deferred.restored.join('  '));

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close(); server.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); process.exit(1); });
