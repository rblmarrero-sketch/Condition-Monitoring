/* THE DUE TAB'S "THIS WEEK" AGENDA — the phone's own answer to "what does my
   week look like", built entirely from 1C's schedule (schedule_slim.json),
   independent of the List view's cm_hist-based due math.

   Three things this suite exists to prove, because each was a real bug
   found while building this view:

   1. THE WEEK VIEW MUST RENDER EVEN WHEN THE LIST IS EMPTY. renderDue()
      used to `return` the moment its own List had nothing to show (a fresh
      phone, an empty scope, a search with no hits) — before ever reaching
      the code that toggles the view segment and calls renderDueWeek(). A
      real week's worth of 1C schedule sat behind a List that happened to
      be blank and never rendered. Reproduced here with a search that
      matches nothing, which is the simplest way to force show.length===0
      without needing an actually-empty fleet.
   2. THE INSP PRE-CHECK SPLIT, mirroring the dashboard's own paWeekData:
      a P3/P4 PM that includes General Inspection gets INSP pulled onto
      its own earlier day (today+SCHED_PREINSP_DAYS-losing... i.e. plan
      minus SCHED_PREINSP_DAYS), clamped forward to today if that day has
      already passed, and suppressed entirely once schedPreInspDone() says
      this PM's own inspection is already walked.
   3. THE WINDOW is one week back and one week ahead (DUE.AGENDA_BACK /
      AGENDA_FWD, the same two numbers the office's grid draws) — nothing
      beyond either edge — and the empty state names itself rather than
      showing a blank box.

      It looked FORWARD ONLY until 2026-09-12. A plan is not only what is
      coming: the week just gone is where the work that did not happen is,
      and a window starting at today can only ever show a clean sheet. The
      days behind today are drawn AND marked late, because a past plan date
      drawn like a future one says the opposite of what it is.

   The server below intercepts only GET /data/schedule_slim.json, same
   pattern as duesched.cjs; the real (git-tracked, hourly-regenerated) file
   is never touched.

   Run: node tests/dueweek.cjs   (starts its own server) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8456);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const today = new Date();
const plus = n => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// WEEK1: FC+INSP, P3, plan +5 -- FC stays on day 5, INSP splits to day 2.
// WEEK2: MP alone, P3, plan +10 -- outside the window ahead, must not appear.
// WEEK3: INSP alone, P1 (not P3/P4) -- not a PM shift candidate, INSP stays
//   right on its own plan date (day 3), no separate pre-check entry.
// WEEK4: TB alone, P4, plan +1 -- no INSP in the order at all, one entry.
// WEEK5: INSP alone, P3, plan +1 -- the wanted pre-check day (plan-3) is
//   already in the past, so it clamps FORWARD to today, never dropped.
// WEEK6: FC+INSP, P3, plan +2 -- but this unit's cm_hist already carries a
//   recent INSP for this exact PM, so schedPreInspDone() must suppress the
//   pre-check entry; only the FC entry on day 2 survives.
const FIXTURE = {
  generated: new Date().toISOString(),
  byUnit: {
    WEEK1: [{ wo: 'WO-020001', hours: 500, types: ['FC', 'INSP'], plan: plus(5), priority: 'P3 Planned (PM)' }],
    WEEK2: [{ wo: 'WO-020002', hours: 250, types: ['MP'], plan: plus(10), priority: 'P3 Planned (PM)' }],
    WEEK3: [{ wo: 'WO-020003', hours: 500, types: ['INSP'], plan: plus(3), priority: 'P1 Emergency' }],
    WEEK4: [{ wo: 'WO-020004', hours: 4000, types: ['TB'], plan: plus(1), priority: 'P4 Planned (PM)' }],
    WEEK5: [{ wo: 'WO-020005', hours: 500, types: ['INSP'], plan: plus(1), priority: 'P3 Planned (PM)' }],
    WEEK6: [{ wo: 'WO-020006', hours: 500, types: ['FC', 'INSP'], plan: plus(2), priority: 'P3 Planned (PM)' }],
    /* THE WEEK THAT HAS ALREADY GONE. The agenda looked forward only until
       2026-09-12, so a round the plan wanted last Tuesday and nobody walked
       simply was not drawn — the half of plan-versus-actual that carries the
       failures was the half being cropped off. WEEK7 is inside the new
       window behind today; WEEK8 is one day beyond its far edge and must
       still be absent, or "looks back" has quietly become "looks back for
       ever" and the screen fills with history. */
    WEEK7: [{ wo: 'WO-020007', hours: 250, types: ['MP'], plan: plus(-4), priority: 'P3 Planned (PM)' }],
    WEEK8: [{ wo: 'WO-020008', hours: 250, types: ['MP'], plan: plus(-8), priority: 'P3 Planned (PM)' }],
    /* THE CLAMP STILL HAS A JOB. WEEK5's wanted pre-check day (plan-3) used
       to be in the past and was pulled forward to today so it could not
       fall off the front of a forward-only window; now the window holds it
       and it sits on the day it was actually wanted. What still cannot be
       held is a pre-check wanted BEFORE the window opens — plan-3 here is
       eight days back — and that one must still be pulled forward, or the
       rule the clamp was written for ("do not go silent on an overdue
       thing") has been quietly dropped along with the code. */
    WEEK9: [{ wo: 'WO-020009', hours: 500, types: ['INSP'], plan: plus(-5), priority: 'P3 Planned (PM)' }],
    /* ONE ORDER, SEVERAL ROUNDS. Since a service tier includes the tiers
       below it, a 4,000 h order on a haul truck resolves to four rounds at
       once. The agenda drew the FIRST of them and dropped the rest — TK156
       showed Filter Cut where four rounds were due — so this holds the
       agenda to drawing one row per ROUND, not per work order. */
    WEEK10: [{ wo: 'WO-020010', hours: 4000, types: ['FC', 'MP', 'TB'], plan: plus(4), priority: 'P3 Planned (PM)' }],
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
    // WEEK6 already had its own General Inspection walked 4 days ago -- well
    // inside SCHED_PREINSP_LOOKBACK (14d) of a plan 2 days from now, so THIS
    // PM's pre-check is done. Every other unit has no history at all, which
    // is exactly the fleet shape that used to leave the List empty and,
    // before the fix, the Week view along with it.
    localStorage.setItem('cm_hist', JSON.stringify({
      'INSP|WEEK6': { d: ago(4), h: 8000 },
    }));
  });
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(300);

  console.log('\nstarts on List, and the segmented control says so');
  ok('List is the default view', await p.evaluate(() => $('dueViewList').classList.contains('on')));
  ok('List tab is aria-selected', await p.evaluate(() => $('dueViewList').getAttribute('aria-selected') === 'true'));
  ok('Week tab is not', await p.evaluate(() => $('dueViewWeek').getAttribute('aria-selected') === 'false'));
  ok('exactly one tab has a keyboard stop', await p.evaluate(() =>
    ($('dueViewList').tabIndex >= 0 ? 1 : 0) + ($('dueViewWeek').tabIndex >= 0 ? 1 : 0) === 1));
  ok('the List panel is visible, the Week panel is not', await p.evaluate(() =>
    !$('dueListWrap').classList.contains('hidden') && $('dueWeekWrap').classList.contains('hidden')));

  console.log('\nTHE WEEK VIEW RENDERS EVEN WHEN THE LIST HAS NOTHING TO SHOW');
  // A search that matches no unit and no register entry empties the List
  // (show.length===0) without needing an actually history-less fleet.
  await p.fill('#dueFind', 'ZZZNOMATCH');
  await p.waitForTimeout(300);
  const listEmptyState = await p.evaluate(() => ({
    rows: document.querySelectorAll('#dueList .duerow').length,
    hasEmptyDiv: !!document.querySelector('#dueList .empty'),
    text: document.getElementById('dueList').innerText,
  }));
  ok('the List is genuinely empty under this search', listEmptyState.rows === 0 && listEmptyState.hasEmptyDiv, listEmptyState.text.slice(0, 80));
  await p.click('#dueViewWeek');
  await p.waitForTimeout(1200);
  ok('Week tab is now the selected one', await p.evaluate(() => $('dueViewWeek').getAttribute('aria-selected') === 'true'));
  ok('the Week panel is visible, the List panel is not', await p.evaluate(() =>
    $('dueListWrap').classList.contains('hidden') && !$('dueWeekWrap').classList.contains('hidden')));
  const weekWithEmptyList = await p.evaluate(() => document.getElementById('dueWeekList').innerText);
  ok('and it is NOT empty -- this is the build-320-era bug', !/nothing open falls/i.test(weekWithEmptyList) && weekWithEmptyList.trim().length > 0, weekWithEmptyList.slice(0, 120));
  ok('WEEK1 shows up in it, search notwithstanding (Week ignores dueFind)', weekWithEmptyList.includes('WEEK1'));
  await p.fill('#dueFind', '');
  await p.waitForTimeout(400);

  console.log('\nthe day-grouping and the INSP pre-check split');
  const groups = await p.evaluate(() => [...document.querySelectorAll('#dueWeekList .daygroup')].map(g => g.innerText));
  const groupWith = s => groups.find(g => g.includes(s)) || '';
  ok('WEEK1 FC sits on its own plan date (+5)', /FC/.test(groupWith('WEEK1')) && groupWith('WEEK1').includes('WO-020001'));
  ok('WEEK1 also gets a separate INSP pre-check entry, 3 days earlier', groups.some(g => /INSP/.test(g) && g.includes('WEEK1') && /walk ahead of PM/i.test(g)));
  ok('WEEK2 (10 days out) is beyond the far edge ahead', !groups.some(g => g.includes('WEEK2')));
  /* THE HALF THAT WAS MISSING. A round the plan wanted four days ago and
     nobody walked is the whole point of reading plan against actual, and a
     forward-only window could not draw it at all. */
  ok('WEEK7 (4 days BEHIND today) is drawn', groups.some(g => g.includes('WEEK7')),
     groupWith('WEEK7').replace(/\n/g, ' ').slice(0, 120));
  ok('  and its day is marked late, not left looking like work still to come',
     /late|просроч/i.test(groupWith('WEEK7')), groupWith('WEEK7').replace(/\n/g, ' ').slice(0, 120));
  ok('WEEK8 (8 days behind) is beyond the far edge back — this looks back one week, not for ever',
     !groups.some(g => g.includes('WEEK8')));
  ok('WEEK3 (P1, not P3/P4) keeps INSP on its own plan date, no split', groupWith('WEEK3').includes('INSP') && !/walk ahead of PM/i.test(groupWith('WEEK3')));
  ok('WEEK4 (TB, no INSP in the order) is a single plain entry', groupWith('WEEK4').includes('TB') && groupWith('WEEK4').includes('WO-020004'));
  /* Every round the order calls for, each its own row — the inspector has
     three things to do at that machine and has to be able to see three. */
  const w10 = await p.evaluate(() =>
    [...document.querySelectorAll('#dueWeekList .agitem')]
      .filter(b => b.dataset.u === 'WEEK10').map(b => b.dataset.t).sort());
  ok('a 4,000 h order resolving to three rounds draws all three, not the first',
     JSON.stringify(w10) === '["FC","MP","TB"]', JSON.stringify(w10));

  console.log('\na pre-check in the past sits on the day it was wanted; one beyond the window still clamps');
  /* NOT gs[0] any more. Today used to be the first group because the window
     started there; it is now in the middle, and reading "the first group"
     would have been reading whichever past day happened to have work on it
     — a test passing or failing on the fixture's shape rather than on the
     behaviour. Ask the app which day is today. */
  const dayOf = await p.evaluate(unit => {
    const out = [];
    document.querySelectorAll('#dueWeekList .daygroup').forEach(g => {
      const hd = (g.querySelector('.dayhd b') || {}).textContent || '';
      g.querySelectorAll('.agitem').forEach(b => { if (b.dataset.u === unit) out.push(hd.trim()); });
    });
    return out;
  }, 'WEEK5');
  const todayWord = await p.evaluate(() => t('due_week_today'));
  ok("WEEK5's pre-check sits on the day it was wanted, two days back — not pulled to today",
     dayOf.length === 1 && dayOf[0].indexOf(todayWord) < 0, JSON.stringify(dayOf));
  ok('  and that day says it is late', /late|просроч/i.test(dayOf[0] || ''), JSON.stringify(dayOf));
  const day9 = await p.evaluate(unit => {
    const out = [];
    document.querySelectorAll('#dueWeekList .daygroup').forEach(g => {
      const hd = (g.querySelector('.dayhd b') || {}).textContent || '';
      g.querySelectorAll('.agitem').forEach(b => { if (b.dataset.u === unit) out.push(hd.trim()); });
    });
    return out;
  }, 'WEEK9');
  ok('WEEK9, wanted eight days back, is still pulled forward to today rather than lost',
     day9.length === 1 && day9[0].indexOf(todayWord) >= 0, JSON.stringify(day9));

  console.log('\na PM whose own inspection is already walked gets no pre-check line');
  // Read WEEK6's OWN rows, not the day group's text -- WEEK6's plain FC entry
  // shares a day with WEEK1's genuine (unsuppressed) INSP pre-check, so a
  // day-group-wide text search would find "walk ahead of PM" from the wrong
  // unit's row and pass for the wrong reason.
  const week6Rows = await p.evaluate(() =>
    [...document.querySelectorAll('#dueWeekList .agitem')].filter(b => b.dataset.u === 'WEEK6').map(b => b.innerText));
  ok('WEEK6 shows its FC entry', week6Rows.some(r => /FC/.test(r) && r.includes('WO-020006')));
  ok('but no pre-check note for it -- schedPreInspDone() suppressed it',
    week6Rows.length === 1 && !week6Rows.some(r => /walk ahead of PM/i.test(r)), week6Rows.join(' | '));

  console.log('\ntapping an agenda row opens that unit on that round');
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('#dueWeekList .agitem')].find(b => b.dataset.u === 'WEEK4');
    if (btn) btn.click();
  });
  await p.waitForTimeout(400);
  ok('the capture pane opened', await p.evaluate(() => !document.getElementById('paneCapture').classList.contains('hidden')));
  ok('on the right unit', await p.evaluate(() => curEquip === 'WEEK4'));
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(300);
  // Reselect the Week tab -- showPane doesn't change dueView, but re-enter cleanly.
  if (!(await p.evaluate(() => $('dueViewWeek').classList.contains('on')))) {
    await p.click('#dueViewWeek');
    await p.waitForTimeout(600);
  }

  console.log('\nan empty week is named, not shown blank');
  await p.evaluate(() => { SCHED = { generated: new Date().toISOString(), byUnit: {} }; renderDue(); });
  await p.waitForTimeout(200);
  const emptyWeek = await p.evaluate(() => document.getElementById('dueWeekList').innerText);
  /* ASK THE APP FOR THE WORDS. This held its own copy of the sentence and
     went red the moment the agenda widened to a fortnight — a suite failing
     on working code because it kept a duplicate of something the app owns,
     which CLAUDE.md lists among the traps this project has already paid
     for four times. */
  const emptyWant = await p.evaluate(() => t('due_week_none'));
  ok('the empty state says so by name', emptyWeek.indexOf(emptyWant) >= 0,
     emptyWeek + '  (wanted: ' + emptyWant + ')');
  // Put the real fixture back for what follows, via a clean reload.
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(300);

  console.log('\narrow keys move focus AND selection between the two tabs, keyboard-only');
  await p.evaluate(() => $('dueViewList').focus());
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(500);
  ok('focus moved to the Week tab', await p.evaluate(() => document.activeElement.id === 'dueViewWeek'));
  ok('and it is now the selected one', await p.evaluate(() => $('dueViewWeek').getAttribute('aria-selected') === 'true'));
  await p.keyboard.press('ArrowLeft');
  await p.waitForTimeout(500);
  ok('ArrowLeft moves back to List', await p.evaluate(() => document.activeElement.id === 'dueViewList' && $('dueViewList').getAttribute('aria-selected') === 'true'));

  console.log('\nthe chosen view survives a reload');
  await p.click('#dueViewWeek');
  await p.waitForTimeout(600);
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(800);
  ok('Week is remembered as the active view', await p.evaluate(() => $('dueViewWeek').classList.contains('on') && !$('dueWeekWrap').classList.contains('hidden')));

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
    return chk('dueViewList', 'dueListWrap') && chk('dueViewWeek', 'dueWeekWrap');
  });
  ok('both tabs wire to a real, role=tabpanel, correctly-labelled panel', wiring);
  ok('the tablist itself is labelled', await p.evaluate(() => {
    const tl = document.querySelector('.viewseg[role="tablist"]');
    return !!tl && !!(tl.getAttribute('aria-label') || tl.getAttribute('aria-labelledby'));
  }));

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));

  await b.close();
  server.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
