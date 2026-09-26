/* THE CM TAB — 1C's schedule, resolved to CM's round types, drawn as a
   day-by-day calendar. This is dueWeekRows()/renderDueWeek() again: the
   redesign that introduced the "1C PM"/"CM" tabs first replaced this with a
   merged Overdue/Due-soon/Never-inspected/Deferred list, on the reading
   that "CM" meant "whatever CM's own interval math has an opinion about."
   The maintainer's own correction, read plainly: "Same as the Two weeks
   before, only CM we change the name. But I like the additional tab you
   put." This suite is tests/dueweek.cjs's own fixture and assertions,
   carried over onto the CM tab's new ids (#dueCmWrap/#dueCmList/#dueCmSub,
   dueView "cm" in place of "week") beside the 1C PM tab the maintainer
   kept, in place of the retired flat List tab dueweek.cjs used to sit next
   to.

   Three things this suite still exists to prove, each a real bug found
   building the original view and therefore still worth guarding:

   1. THE INSP PRE-CHECK SPLIT, mirroring the dashboard's own paWeekData: a
      P3/P4 PM that includes General Inspection gets INSP pulled onto its
      own earlier day (plan minus SCHED_PREINSP_DAYS), clamped forward to
      today if that day has already passed, and suppressed entirely once
      schedPreInspDone() says this PM's own inspection is already walked.
   2. THE WINDOW is one week back and one week ahead (DUE.AGENDA_BACK /
      AGENDA_FWD, the same two numbers the office's grid draws) — nothing
      beyond either edge — and the empty state names itself rather than
      showing a blank box. The days behind today are drawn AND marked
      late, because a past plan date drawn like a future one says the
      opposite of what it is.
   3. THE AGENDA OBEYS THE HOLD-OFF, and agrees with planRows() (the flat
      List's own retired "1C plan" scope, still directly tested elsewhere)
      about which rounds a held-off machine is actually on.

   The server below intercepts only GET /data/schedule_slim.json, same
   pattern as duesched.cjs used; the real (git-tracked, hourly-regenerated)
   file is never touched.

   Run: node tests/duecm.cjs   (starts its own server) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8457);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const today = new Date();
const plus = n => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// CM1: FC+INSP, P3, plan +5 -- FC stays on day 5, INSP splits to day 2.
// CM2: MP alone, P3, plan +10 -- outside the window ahead, must not appear.
// CM3: INSP alone, P1 (not P3/P4) -- not a PM shift candidate, INSP stays
//   right on its own plan date (day 3), no separate pre-check entry.
// CM4: TB alone, P4, plan +1 -- no INSP in the order at all, one entry.
// CM5: INSP alone, P3, plan +1 -- the wanted pre-check day (plan-3) is
//   already in the past, so it clamps FORWARD to today, never dropped.
// CM6: FC+INSP, P3, plan +2 -- but this unit's cm_hist already carries a
//   recent INSP for this exact PM, so schedPreInspDone() must suppress the
//   pre-check entry; only the FC entry on day 2 survives.
const FIXTURE = {
  generated: new Date().toISOString(),
  byUnit: {
    CM1: [{ wo: 'WO-030001', hours: 500, types: ['FC', 'INSP'], plan: plus(5), priority: 'P3 Planned (PM)' }],
    CM2: [{ wo: 'WO-030002', hours: 250, types: ['MP'], plan: plus(10), priority: 'P3 Planned (PM)' }],
    CM3: [{ wo: 'WO-030003', hours: 500, types: ['INSP'], plan: plus(3), priority: 'P1 Emergency' }],
    CM4: [{ wo: 'WO-030004', hours: 4000, types: ['TB'], plan: plus(1), priority: 'P4 Planned (PM)' }],
    CM5: [{ wo: 'WO-030005', hours: 500, types: ['INSP'], plan: plus(1), priority: 'P3 Planned (PM)' }],
    CM6: [{ wo: 'WO-030006', hours: 500, types: ['FC', 'INSP'], plan: plus(2), priority: 'P3 Planned (PM)' }],
    // The week that has already gone: CM7 is inside the window behind
    // today; CM8 is one day beyond its far edge and must still be absent.
    CM7: [{ wo: 'WO-030007', hours: 250, types: ['MP'], plan: plus(-4), priority: 'P3 Planned (PM)' }],
    CM8: [{ wo: 'WO-030008', hours: 250, types: ['MP'], plan: plus(-8), priority: 'P3 Planned (PM)' }],
    // The clamp still has a job: CM9's wanted pre-check day (plan-3) is
    // eight days back, past the window's own edge, so it is pulled forward
    // to today rather than lost off the front.
    CM9: [{ wo: 'WO-030009', hours: 500, types: ['INSP'], plan: plus(-5), priority: 'P3 Planned (PM)' }],
    // One order, several rounds: a 4,000 h order on a haul truck resolves
    // to three rounds at once, and each needs its own row.
    CM10: [{ wo: 'WO-030010', hours: 4000, types: ['FC', 'MP', 'TB'], plan: plus(4), priority: 'P3 Planned (PM)' }],
  },
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/data/schedule_slim.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(FIXTURE));
    return;
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
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
  await p.addInitScript(() => {
    const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    // CM6 already had its own General Inspection walked 4 days ago -- well
    // inside SCHED_PREINSP_LOOKBACK (14d) of a plan 2 days from now, so
    // THIS PM's pre-check is done.
    localStorage.setItem('cm_hist', JSON.stringify({
      'INSP|CM6': { d: ago(4), h: 8000 },
    }));
  });
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(300);

  console.log('\nstarts on 1C PM, and the segmented control says so');
  ok('1C PM is the default view', await p.evaluate(() => $('dueViewPM').classList.contains('on')));
  ok('1C PM tab is aria-selected', await p.evaluate(() => $('dueViewPM').getAttribute('aria-selected') === 'true'));
  ok('CM tab is not', await p.evaluate(() => $('dueViewCM').getAttribute('aria-selected') === 'false'));
  ok('exactly one tab has a keyboard stop', await p.evaluate(() =>
    ($('dueViewPM').tabIndex >= 0 ? 1 : 0) + ($('dueViewCM').tabIndex >= 0 ? 1 : 0) === 1));
  ok('the 1C PM panel is visible, the CM panel is not', await p.evaluate(() =>
    !$('duePmWrap').classList.contains('hidden') && $('dueCmWrap').classList.contains('hidden')));

  console.log('\nswitching to CM shows this fixture');
  await p.click('#dueViewCM');
  await p.waitForTimeout(1200);
  ok('CM tab is now the selected one', await p.evaluate(() => $('dueViewCM').getAttribute('aria-selected') === 'true'));
  ok('the CM panel is visible, the 1C PM panel is not', await p.evaluate(() =>
    $('duePmWrap').classList.contains('hidden') && !$('dueCmWrap').classList.contains('hidden')));
  const cmText = await p.evaluate(() => document.getElementById('dueCmList').innerText);
  ok('CM1 shows up in it', cmText.includes('CM1'), cmText.slice(0, 120));

  console.log('\nthe day-grouping and the INSP pre-check split');
  const groups = await p.evaluate(() => [...document.querySelectorAll('#dueCmList .daygroup')].map(g => g.innerText));
  const groupWith = s => groups.find(g => g.includes(s)) || '';
  ok('CM1 FC sits on its own plan date (+5)', /FC/.test(groupWith('CM1')) && groupWith('CM1').includes('WO-030001'));
  ok('CM1 also gets a separate INSP pre-check entry, 3 days earlier', groups.some(g => /INSP/.test(g) && g.includes('CM1') && /walk ahead of PM/i.test(g)));
  ok('CM2 (10 days out) is beyond the far edge ahead', !groups.some(g => g.includes('CM2')));
  /* THE HALF THAT WAS MISSING. A round the plan wanted four days ago and
     nobody walked is the whole point of reading plan against actual, and a
     forward-only window could not draw it at all. */
  ok('CM7 (4 days BEHIND today) is drawn', groups.some(g => g.includes('CM7')),
     groupWith('CM7').replace(/\n/g, ' ').slice(0, 120));
  ok('  and its day is marked late, not left looking like work still to come',
     /late|просроч/i.test(groupWith('CM7')), groupWith('CM7').replace(/\n/g, ' ').slice(0, 120));
  ok('CM8 (8 days behind) is beyond the far edge back — this looks back one week, not for ever',
     !groups.some(g => g.includes('CM8')));
  ok('CM3 (P1, not P3/P4) keeps INSP on its own plan date, no split', groupWith('CM3').includes('INSP') && !/walk ahead of PM/i.test(groupWith('CM3')));
  ok('CM4 (TB, no INSP in the order) is a single plain entry', groupWith('CM4').includes('TB') && groupWith('CM4').includes('WO-030004'));
  const c10 = await p.evaluate(() =>
    [...document.querySelectorAll('#dueCmList .agitem')]
      .filter(b => b.dataset.u === 'CM10').map(b => b.dataset.t).sort());
  ok('a 4,000 h order resolving to three rounds draws all three, not the first',
     JSON.stringify(c10) === '["FC","MP","TB"]', JSON.stringify(c10));

  console.log('\na pre-check in the past sits on the day it was wanted; one beyond the window still clamps');
  const dayOf = await p.evaluate(unit => {
    const out = [];
    document.querySelectorAll('#dueCmList .daygroup').forEach(g => {
      const hd = (g.querySelector('.dayhd b') || {}).textContent || '';
      g.querySelectorAll('.agitem').forEach(b => { if (b.dataset.u === unit) out.push(hd.trim()); });
    });
    return out;
  }, 'CM5');
  const todayWord = await p.evaluate(() => t('due_week_today'));
  ok("CM5's pre-check sits on the day it was wanted, two days back — not pulled to today",
     dayOf.length === 1 && dayOf[0].indexOf(todayWord) < 0, JSON.stringify(dayOf));
  ok('  and that day says it is late', /late|просроч/i.test(dayOf[0] || ''), JSON.stringify(dayOf));
  const day9 = await p.evaluate(unit => {
    const out = [];
    document.querySelectorAll('#dueCmList .daygroup').forEach(g => {
      const hd = (g.querySelector('.dayhd b') || {}).textContent || '';
      g.querySelectorAll('.agitem').forEach(b => { if (b.dataset.u === unit) out.push(hd.trim()); });
    });
    return out;
  }, 'CM9');
  ok('CM9, wanted eight days back, is still pulled forward to today rather than lost',
     day9.length === 1 && day9[0].indexOf(todayWord) >= 0, JSON.stringify(day9));

  console.log('\na PM whose own inspection is already walked gets no pre-check line');
  const cm6Rows = await p.evaluate(() =>
    [...document.querySelectorAll('#dueCmList .agitem')].filter(b => b.dataset.u === 'CM6').map(b => b.innerText));
  ok('CM6 shows its FC entry', cm6Rows.some(r => /FC/.test(r) && r.includes('WO-030006')));
  ok('but no pre-check note for it -- schedPreInspDone() suppressed it',
    cm6Rows.length === 1 && !cm6Rows.some(r => /walk ahead of PM/i.test(r)), cm6Rows.join(' | '));

  console.log('\nsearch narrows the calendar to one machine');
  await p.fill('#dueFind', 'CM4');
  await p.waitForTimeout(400);
  const narrowed = await p.evaluate(() => document.getElementById('dueCmList').innerText);
  ok('only CM4 is drawn', narrowed.includes('CM4') && !narrowed.includes('CM1'), narrowed.slice(0, 200));
  await p.fill('#dueFind', 'ZZZNOMATCH');
  await p.waitForTimeout(400);
  const nomatch = await p.evaluate(() => document.getElementById('dueCmList').innerText);
  ok('a query matching nothing says so by name, not a blank box', nomatch.trim().length > 0, nomatch.slice(0, 120));
  await p.fill('#dueFind', '');
  await p.waitForTimeout(400);

  console.log('\ntapping an agenda row opens that unit on that round');
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('#dueCmList .agitem')].find(b => b.dataset.u === 'CM4');
    if (btn) btn.click();
  });
  await p.waitForTimeout(400);
  ok('the capture pane opened', await p.evaluate(() => !document.getElementById('paneCapture').classList.contains('hidden')));
  ok('on the right unit', await p.evaluate(() => curEquip === 'CM4'));
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(300);
  if (!(await p.evaluate(() => $('dueViewCM').classList.contains('on')))) {
    await p.click('#dueViewCM');
    await p.waitForTimeout(600);
  }

  console.log('\nan empty fortnight is named, not shown blank');
  await p.evaluate(() => { SCHED = { generated: new Date().toISOString(), byUnit: {} }; renderDue(); });
  await p.waitForTimeout(200);
  const emptyCm = await p.evaluate(() => document.getElementById('dueCmList').innerText);
  /* ASK THE APP FOR THE WORDS, not a copy of the sentence kept here. */
  const emptyWant = await p.evaluate(() => t('due_week_none'));
  ok('the empty state says so by name', emptyCm.indexOf(emptyWant) >= 0,
     emptyCm + '  (wanted: ' + emptyWant + ')');
  // Put the real fixture back for what follows, via a clean reload.
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(300);

  console.log('\narrow keys move focus AND selection between the two tabs, keyboard-only');
  await p.evaluate(() => $('dueViewPM').focus());
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(500);
  ok('focus moved to the CM tab', await p.evaluate(() => document.activeElement.id === 'dueViewCM'));
  ok('and it is now the selected one', await p.evaluate(() => $('dueViewCM').getAttribute('aria-selected') === 'true'));
  await p.keyboard.press('ArrowLeft');
  await p.waitForTimeout(500);
  ok('ArrowLeft moves back to 1C PM', await p.evaluate(() => document.activeElement.id === 'dueViewPM' && $('dueViewPM').getAttribute('aria-selected') === 'true'));

  console.log('\nthe chosen view survives a reload');
  await p.click('#dueViewCM');
  await p.waitForTimeout(600);
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(800);
  ok('CM is remembered as the active view', await p.evaluate(() => $('dueViewCM').classList.contains('on') && !$('dueCmWrap').classList.contains('hidden')));

  console.log('\nevery tab has a real, existing, labelled panel (tabsa11y\'s own four rules, for this control)');
  const wiring = await p.evaluate(() => {
    const chk = (tabId, panelId) => {
      const tab = document.getElementById(tabId), panel = document.getElementById(panelId);
      if (!tab || !panel) return false;
      if (tab.getAttribute('aria-controls') !== panelId) return false;
      if (panel.getAttribute('role') !== 'tabpanel') return false;
      const lbl = panel.getAttribute('aria-labelledby');
      return !!lbl && document.getElementById(lbl) === tab;
    };
    return chk('dueViewPM', 'duePmWrap') && chk('dueViewCM', 'dueCmWrap');
  });
  ok('both tabs wire to a real, role=tabpanel, correctly-labelled panel', wiring);
  ok('the tablist itself is labelled', await p.evaluate(() => {
    const tl = document.querySelector('.viewseg[role="tablist"]');
    return !!tl && !!(tl.getAttribute('aria-label') || tl.getAttribute('aria-labelledby'));
  }));

  /* A ROUND THE SITE HAS TAKEN OFF A MACHINE IS NOT ON THE CALENDAR EITHER.
     Every other reader of the schedule applies DUE.offRound — planRows,
     dueRows, neverRows, the office's duePlanRows — and dueWeekRows must
     too, or the CM tab draws a round for a machine the site holds off it
     while every other screen agrees the machine is off. Asserted against
     DUE.offRound rather than a list of round codes, so the next machine
     the site holds off needs no change here. */
  console.log('\nthe agenda obeys the hold-off, and agrees with planRows()');
  const held = await p.evaluate(() => {
    const a = ASSETS.find(x => /KAMAZ/i.test(String(x.m || '') + ' ' + String(x.mk || '')));
    if (!a || !window.DUE || !DUE.offRound) return null;
    const TYPES = ['MP', 'FC', 'INSP', 'TEMP', 'UC', 'GET', 'TB', 'LUBE'];
    const day = DUE.today();
    SCHED.byUnit = SCHED.byUnit || {};
    SCHED.byUnit[a.n] = [{ wo: 'WO-AGENDA', hours: 4000, types: TYPES.slice(),
                           plan: day, priority: 'P3 Planned (PM)' }];
    const agenda = dueWeekRows().filter(r => r.unit === a.n).map(r => r.code).sort();
    const list = planRows('').filter(r => r.unit === a.n).map(r => r.ty).sort();
    const anyHeld = dueWeekRows()
      .filter(r => DUE.offRound(r.code, ASSET_BY[r.unit]))
      .map(r => r.unit + ' ' + r.code);
    delete SCHED.byUnit[a.n];
    return { unit: a.n, agenda, list, anyHeld,
             onAny: TYPES.filter(ty => !DUE.offRound(ty, a)) };
  });
  if (held) {
    ok('a held-off machine planned for every round draws nothing on the agenda',
       held.agenda.length === 0, held.unit + ' -> ' + JSON.stringify(held.agenda));
    ok('  the agenda and planRows() give the SAME answer',
       JSON.stringify(held.agenda) === JSON.stringify(held.list),
       'agenda ' + JSON.stringify(held.agenda) + ' vs planRows ' + JSON.stringify(held.list));
    ok('  and it really is held off every round, so the test can see a failure',
       held.onAny.length === 0, 'still on ' + JSON.stringify(held.onAny));
    ok('  no row anywhere on the agenda is a round its machine is off',
       held.anyHeld.length === 0, held.anyHeld.slice(0, 4).join(', ') || 'none');
  } else {
    ok('a KAMAZ and DUE.offRound are both present to test against', false);
  }

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));

  await b.close();
  server.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
