/* The due list gets a tab, and its filters become pills.

   Two things a phone screenshot made obvious, back when this suite was
   written for the FIRST due-tab design (Phase 2, four scope pills — Overdue /
   Due soon / Never inspected / Put off — under one #dueList).

   The due list lived at the bottom of System, under "In the system" — which on
   a phone that has pulled the team's work means scrolling past forty-two rounds
   of archive to reach the one list that says what to walk. The archive and the
   worklist are different questions, and one of them is asked at the start of
   every shift. So: four tabs, and Due is second, after the app's own job and
   before everything that is about looking backwards. THAT part never moved and
   is still what section 1 proves.

   That first design's scope pills (#dueScopeF, #dueList) were retired by the
   redesign this file now follows: "List=1C PM and Two Weeks=CM... one merged
   agenda, color-coded" (tests/duecm.cjs, tests/duepm.cjs). The CM tab folds
   Overdue/Due soon/Never inspected/Put off into ONE list under a This day/All
   14 days span, so there is no separate "over" pill to click any more — a row
   is simply shown or not, by state, the same way tests/duecm.cjs proves for
   its own smaller (all-MP) fixture.

   What THIS suite still owns and duecm.cjs's simpler fixture does not: the
   real due.js interval bug regression across FOUR round types at once, and a
   badge/heading agreement check against a genuinely mixed fleet. Six machines
   are past their interval; one of them — DZ004 — was put off on purpose, which
   is a decision and not a miss; EX005 is deliberately NOT among the six (see
   the note on the fixture) — a build that reads an undercarriage round's
   interval without asking which MACHINE it is walking would put it there
   anyway, which is how every excavator on this site once got scheduled on the
   dozer's number.

   Run: node tests/duetab.cjs   (needs tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const on  = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/* A shift's worth of history across four round types, placed against the
   intervals the fleet actually stated, at 20 h/day:

     MP    250 h   magnetic plugs, every machine
     INSP  1000 h
     UC   1000 h   dozers       ·  4000 h  excavators (and drills)
     TB   2000 h   both truck types this round fits

   UC is TWO figures, not one, and EX005 is here to prove it: at
   2,400 hours it is comfortably inside an excavator's 4,000 and comfortably
   past a dozer's 1,000. A build that reads the ROUND's interval without asking
   which MACHINE it is walking puts EX005 on the missed list — which is how
   every excavator on this site came to be scheduled four times too often, with
   the correct figure sitting one argument away in due.js. */
const HIST = {
  'UC|EX004':   { d: ago(210), h: '4100' },  // 4200 h on an excavator's 4000 — missed
  'UC|EX005':   { d: ago(120), h: '3900' },  // 2400 h — fine on 4000, missed on 1000
  'UC|DZ001':   { d: ago(60),  h: '8800' },  // 1200 h on a dozer's 1000 — missed
  'UC|DZ004':   { d: ago(55),  h: '6100' },  // 1100 h — missed, but put off
  'UC|EX003':   { d: ago(6),   h: '5200' },  // fine
  'MP|TK160':   { d: ago(14),  h: '7725' },  // 280 h on a 250 h round — missed
  'MP|TK158':   { d: ago(20),  h: '7900' },  // 400 h — missed
  'MP|TK154':   { d: ago(5),   h: '7300' },  // fine
  'TB|TK105':   { d: ago(90),  h: '12400' }, // 1800 h on a truck's 2000 — due soon, not missed
  'INSP|TK101': { d: ago(52),  h: '10200' }, // 1040 h on a 1000 h round — missed
};
const DEFER = { 'UC|DZ004': { u: 'DZ004', t: 'UC', until: on(6),
  why: 'on a low-loader to the workshop', by: 'S. Volkov', at: ago(2) } };

const pills = (p, sel) => p.$$eval(sel + ' button',
  a => a.map(b => ({ k: b.dataset.sc || b.dataset.dt || b.dataset.dw, on: b.classList.contains('on'),
                     txt: b.textContent.replace(/\s+/g, ' ').trim(),
                     n: Number((b.querySelector('.n') || {}).textContent || -1) })));
const rows = p => p.$$eval('#dueCmList .duerow', a => a.length);
const rowTypes = p => p.$$eval('#dueCmList .dueitem', a => a.map(b => b.dataset.t).filter(Boolean));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(([h, d]) => {
    localStorage.setItem('cm_hist', JSON.stringify(h));
    localStorage.setItem('cm_due_defer', JSON.stringify(d));
    localStorage.setItem('cm_due_view', 'cm');
    /* upload-defaults.js carries the real endpoint; pin it somewhere dead. */
    localStorage.setItem('up_dests', JSON.stringify(
      [{ id: 'gas', on: true, url: 'http://127.0.0.1:9/dead', sec: '', folder: '' }]));
  }, [HIST, DEFER]);
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1300);

  console.log('four tabs, in the order of the shift');
  const tabs = await p.$$eval('#tabbar button[data-pane]', a => a.map(x => x.dataset.pane));
  ok('there are four of them', tabs.length === 4, tabs.join(' '));
  /* Inspect · Saved · Due · Sync since Phase 2: the order of the shift is
     capture, what was captured, what is next, and the link. */
  ok('and Due is one, third after Inspect and Saved',
     tabs[0] === 'paneCapture' && tabs[1] === 'paneQueue' && tabs[2] === 'paneDue', tabs.join(' > '));
  ok('every tab opens a pane that exists',
     await p.evaluate(t => t.every(x => !!document.getElementById(x)), tabs));
  /* It used to be three screens down inside System. */
  ok('the due list is no longer buried in the archive',
     await p.evaluate(() => !document.querySelector('#paneSystem #dueCmList')
                         && !!document.querySelector('#paneDue #dueCmList')));
  ok('the archive is still its own tab', tabs.includes('paneSystem'));

  console.log('\nthe badge, the CM heading and the merged list agree');
  await p.evaluate(() => { showPane('paneDue'); }); await p.waitForTimeout(200);
  await p.evaluate(() => { dueView = 'cm'; renderDue(); });
  await p.waitForTimeout(400);
  const badge = await p.evaluate(() => document.getElementById('tabD').textContent.trim());
  const head  = await p.evaluate(() => document.getElementById('dueCount').textContent.trim());
  const trueOver = await p.evaluate(() => dueRows('').filter(dueCmToday).length);
  /* Six machines are past their interval; one of them was put off on purpose,
     which is a decision and not a miss. EX005 is deliberately NOT among the
     six — see the note on the fixture. */
  ok('the true overdue count (the app\'s own rule) is 5, not 6', trueOver === 5, String(trueOver));
  ok('the tab badge says the same', Number(badge) === trueOver, badge + ' vs ' + trueOver);
  ok('and so does the CM heading badge', Number(head) === trueOver, head + ' vs ' + trueOver);
  /* The badge counted only the round type the capture screen was armed with,
     so it read 1 beside a list of six. */
  ok('the badge is not scoped to whichever round Capture is set to',
     await (async () => {
       await p.evaluate(() => { const s = document.getElementById('typeSel');
         if (s) { s.value = 'TB'; s.dispatchEvent(new Event('change')); } });
       await p.waitForTimeout(350);
       return (await p.evaluate(() => document.getElementById('tabD').textContent.trim())) === badge;
     })(), 'still ' + badge);

  /* THE ONE THAT NAMES THE BUG. EX005 is 2,400 hours into an undercarriage
     round. On the excavator figure the fleet stated — 4,000 h — it is fine; on
     the dozer's 1,000 it is 1,400 hours late. Both figures have been in due.js
     since the fleet gave them, and neither due list asked which machine it was
     scheduling, so every excavator on site was walked on the dozer's number.
     A count of five catches that too, but only this says which machine and
     why, which is the difference between a failing test and a fixed bug. */
  const missedUnits = await p.$$eval('#dueCmList .duerow',
    a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  ok('an excavator inside its own 4,000 h is comfortably not due, and absent',
     !missedUnits.some(t => /EX005/.test(t)),
     missedUnits.find(t => /EX005/.test(t)) || 'not present (correct)');
  ok('and the excavator that is genuinely past 4,000 h is',
     missedUnits.some(t => /EX004/.test(t)));

  console.log('\npills, not dropdowns');
  ok('the two <select>s are gone',
     await p.evaluate(() => !document.getElementById('dueScope') && !document.getElementById('dueType')));
  const span = await pills(p, '#dueSpanF');
  ok('the span pills carry their own counts', span.every(x => x.n >= 0), span.map(x => x.txt).join(' | '));
  ok('one of them is lit, so the reader knows which list this is',
     span.filter(x => x.on).length === 1, span.filter(x => x.on).map(x => x.k).join(','));
  ok('and the badge counts overdue work regardless of which span is lit',
     (span.find(x => x.k === 'today') || {}).n === trueOver);

  console.log('\nthe round-type pills describe every round in Due, not one scope\'s worth');
  let ty = await pills(p, '#dueTypeF');
  ok('the round pills are built from the rounds that actually appear',
     ty.length > 1 && ty.filter(x => x.k).every(x => x.n > 0),
     ty.map(x => x.txt).join(' | '));
  /* Unlike the retired scope-pill design, a round due only SOON still gets a
     pill — the merged agenda has no separate "missed" scope for the pill
     counts to be relative to any more. */
  ok('TB gets a pill even though it is only due soon, not missed',
     ty.some(x => x.k === 'TB' && x.n > 0), ty.map(x => x.txt).join(' | '));
  ok('and their counts add up to the "all rounds" total',
     ty.filter(x => x.k).reduce((s, x) => s + x.n, 0) === (ty.find(x => !x.k) || {}).n,
     ty.filter(x => x.k).map(x => x.txt).join(' + '));
  ok('pressing one narrows the list to that type alone', await (async () => {
    await p.click('#dueTypeF [data-dt="UC"]'); await p.waitForTimeout(300);
    const seen = await rowTypes(p);
    return seen.length > 0 && seen.every(t => t === 'UC');
  })());
  await p.click('#dueTypeF [data-dt=""]'); await p.waitForTimeout(200);

  console.log('\nput off on purpose');
  const txt = await p.textContent('#dueCmList');
  ok('the put-off pill lists the machine and the reason it was put off',
     /DZ004/.test(txt) && /low-loader/.test(txt), txt.replace(/\s+/g, ' ').trim().slice(0, 200));
  ok('and that machine is not counted as missed',
     !(await p.evaluate(() => dueRows('').filter(dueCmToday).map(r => r.unit))).includes('DZ004'));

  console.log('\nRussian');
  await p.evaluate(() => { lang = 'ru'; applyLang(); renderDue(); });
  await p.waitForTimeout(300);
  const ruTabs = await p.$$eval('#tabbar button', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  ok('the new tab is translated', /[А-Яа-я]/.test(ruTabs[1] || ''), ruTabs.join(' | '));
  const ruSpan = await pills(p, '#dueSpanF');
  ok('and so are the span pills', ruSpan.every(x => /[А-Яа-я]/.test(x.txt)), ruSpan.map(x => x.txt).join(' | '));
  ok('with the counts still on them', ruSpan.every(x => x.n >= 0));
  await p.evaluate(() => { lang = 'en'; applyLang(); renderDue(); });

  console.log('\nthe screen fits the phone it is read on');
  for (const [w, h, tag] of [[320, 720, 'small'], [412, 915, 'phone']]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(300);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(tag + ': the page does not scroll sideways', over <= 0, over + ' px over');
    /* The pills scroll INSIDE their own row; that is the point of the row. */
    const small = await p.$$eval('#dueSpanF button, #dueTypeF button, #tabbar button',
      a => a.map(x => x.getBoundingClientRect())
            .filter(r => r.height < 44 && r.height > 0).length);
    ok(tag + ': nothing a gloved thumb must hit is under 44 px', small === 0, small + ' too small');
    const lines = await p.evaluate(() => {
      const r = [...document.querySelectorAll('#dueSpanF button')].map(b => Math.round(b.getBoundingClientRect().top));
      return new Set(r).size;
    });
    ok(tag + ': the span pills stay on one line', lines === 1, lines + ' line(s)');
  }

  console.log(fails.length ? '\nFAILURES:\n  ' + [...new Set(fails)].join('\n  ')
                           : '\nall due-tab checks passed');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
