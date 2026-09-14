/* THE ROUND ALREADY KNOWS WHICH WORK ORDER IT IS, AND BY WHEN.

   Two things an inspector was being asked to supply that the phone was
   already holding:

   THE WORK ORDER. It is printed on the row they tapped to get here —
   "WO-016609 · 1000h" — and the position form then asked them to type it
   again, with gloves on, from memory of a screen they have left.

   THE TARGET DATE. Filled from the grade since build 361. But the rule was
   "the round's interval rendered to the calendar", which is right for the
   rounds it was specified against (MP 250 h = 13 days, INSP 1,000 h = 50) and
   wrong for the long ones: a 3 on an excavator's undercarriage (4,000 h) came
   out at 200 days — April 2027 — and a haul truck's body liner at 100. "Plan
   the repair" with a date two seasons away is "never" with a date on it. The
   interval is capped by 1C's own next planned service for the machine, and
   only ever pulled IN: a machine 1C has nothing booked for still gets the
   interval, so nothing silently drifts later.

   THE TRAP THIS SUITE EXISTS FOR. The first cut of schedOrdersFor guarded on
   `window.SCHED && ...`. SCHED is declared `let SCHED = null` at module
   scope, so it is never a property of window and the guard is always false —
   the function would have answered "1C has nothing planned" for all 1,128
   machines, for ever, with no error and no empty field to notice. §1 plants a
   schedule and asserts the lookup SEES it, which is the only assertion that
   would have caught it.

   Run: node tests/schedwo.cjs   (starts its own server on 8481) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8481);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = http.createServer((q, s) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('x'); }
  s.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof schedOrdersFor === 'function'
    && typeof defaultTargetFor === 'function' && typeof roundWO === 'function',
    null, { timeout: 30000 });

  /* One fixture for the whole suite: an excavator 1C has a UC order on today
     for, and a separate 1,000 h service twenty days out. */
  const plant = () => p.evaluate(() => {
    const today = todayISO();
    SCHED = { generated: today, byUnit: {
      EX001: [{ wo: 'WO-777', hours: 4000, types: ['UC'], plan: today, priority: 'P3 Planned (PM)' },
              { wo: 'WO-888', hours: 1000, types: ['INSP', 'FC'], plan: DUE.shift(today, 20), priority: 'P3 Planned (PM)' }],
    } };
    return today;
  });
  const today = await plant();

  console.log('1. THE LOOKUP ACTUALLY SEES THE SCHEDULE  (the window.SCHED trap)');
  const seen = await p.evaluate(() => {
    const o = schedOrdersFor('EX001', 'UC');
    /* "next" is asked WITHOUT a round filter, the way defaultTargetFor asks
       it: when is this machine next open for anything — a different question
       from which order this round belongs to, and answered from a wider set. */
    const any = schedOrdersFor('EX001', null);
    return { near: o.near && o.near.wo, next: any.next && any.next.wo,
             nextUC: o.next && o.next.wo,
             winProp: Object.prototype.hasOwnProperty.call(window, 'SCHED') };
  });
  ok('a planted order is found — the guard is not reading window.SCHED',
     seen.near === 'WO-777', 'near=' + seen.near);
  ok('  and SCHED genuinely is NOT a window property, so the trap was real',
     seen.winProp === false, 'window.SCHED own-property: ' + seen.winProp);
  ok('  "next" is the soonest still to COME, a different question from "near"',
     seen.next === 'WO-888', 'next=' + seen.next);
  ok('  and asked WITH a round filter it stays inside that round',
     !seen.nextUC, 'next(UC)=' + JSON.stringify(seen.nextUC));

  console.log('\n2. THE WORK ORDER IS FILLED IN, NEVER BORROWED');
  const wo = await p.evaluate(() => {
    const out = {};
    curEquip = 'EX001'; type = 'UC'; draft = { positions: {} };
    out.covered = roundWO();
    /* MP is not on WO-777's types and nothing else covers it: an empty field
       is the right answer, because a number from another job sends the office
       to the wrong work. */
    curEquip = 'EX001'; type = 'MP'; draft = { positions: {} };
    out.notCovered = roundWO();
    /* a machine 1C has nothing at all for */
    curEquip = 'EX005'; type = 'UC'; draft = { positions: {} };
    out.noPlan = roundWO();
    /* and it is per round: switching type does not carry the old number */
    curEquip = 'EX001'; type = 'UC'; draft = { positions: {} };
    const first = roundWO(); type = 'MP'; draft = { positions: {} };
    out.afterSwitch = roundWO(); out.first = first;
    return out;
  });
  ok('the order covering this round on this machine is used', wo.covered === 'WO-777', wo.covered);
  ok('  a round no order covers gets nothing, not another job\'s number',
     wo.notCovered === '', JSON.stringify(wo.notCovered));
  ok('  a machine 1C has nothing planned for gets nothing',
     wo.noPlan === '', JSON.stringify(wo.noPlan));
  ok('  and it does not survive a change of round type',
     wo.first === 'WO-777' && wo.afterSwitch === '', wo.first + ' -> ' + JSON.stringify(wo.afterSwitch));

  console.log('\n3. IT REACHES THE FIELD, AND IS WRITTEN DOWN, AND IS NEVER OVERWRITTEN');
  const form = await p.evaluate(() => {
    curEquip = 'EX001'; type = 'UC'; draft = { positions: {} };
    const k = (items()[0] || {}).k; if (!k) return null;
    curItem = k; loadPos();
    const shown = document.getElementById('wo').value;
    const stored = (draft.positions[k] || {}).wo;
    /* what the inspector types wins, and survives coming back to the position */
    document.getElementById('wo').value = 'WO-MINE'; saveCur();
    curItem = k; loadPos();
    return { shown, stored, kept: document.getElementById('wo').value,
             keptStored: (draft.positions[k] || {}).wo };
  });
  if (form) {
    ok('the position form opens with the work order already in it', form.shown === 'WO-777', form.shown);
    ok('  and it is in the RECORD, not only on the screen', form.stored === 'WO-777', form.stored);
    ok('  a number the inspector types is never overwritten',
       form.kept === 'WO-MINE' && form.keptStored === 'WO-MINE', form.kept + ' / ' + form.keptStored);
  } else ok('the round has a position to open', false);

  console.log('\n4. THE TARGET DATE THE GRADE IMPLIES');
  const tgt = await p.evaluate(t0 => {
    const d = (g) => DUE.dayDiff(t0, defaultTargetFor(g));
    const out = {};
    curEquip = 'TK146'; type = 'MP'; draft = { positions: {} };
    out.mp3 = d(3); out.g4 = d(4); out.g5 = d(5);
    /* capped: the interval says 200 days, 1C has the machine open in 20 */
    curEquip = 'EX001'; type = 'UC'; draft = { positions: {} };
    out.capped = d(3);
    /* uncapped: same round, a machine 1C has nothing booked for */
    curEquip = 'EX005'; type = 'UC'; draft = { positions: {} };
    out.uncapped = d(3);
    out.g1 = defaultTargetFor(1); out.g2 = defaultTargetFor(2);
    return out;
  }, today);
  /* ASKED, NOT REMEMBERED: 13 and 50 are due.js's numbers, not this file's. */
  const want = await p.evaluate(() => ({
    mp: Math.round(DUE.days('MP', null, null, 'HT', 'TK146')),
    uc: Math.round(DUE.days('UC', null, null, 'EXC', 'EX005')),
  }));
  ok('grade 3 is the round\'s own interval on the calendar',
     tgt.mp3 === want.mp, tgt.mp3 + 'd, due.js says ' + want.mp);
  ok('grade 4 is seven days', tgt.g4 === 7, tgt.g4 + 'd');
  ok('grade 5 is tomorrow', tgt.g5 === 1, tgt.g5 + 'd');
  ok('a long interval is capped by 1C\'s next service for that machine',
     tgt.capped === 20, tgt.capped + 'd (interval alone would be ' + want.uc + 'd)');
  ok('  and the cap only pulls IN — no 1C plan, no change',
     tgt.uncapped === want.uc, tgt.uncapped + 'd');
  ok('  1 and 2 propose nothing: they are not findings and ask for no date',
     tgt.g1 === null && tgt.g2 === null, JSON.stringify([tgt.g1, tgt.g2]));

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
