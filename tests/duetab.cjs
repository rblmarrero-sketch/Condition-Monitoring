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

   That first design's scope pills (#dueScopeF, #dueList) were retired by an
   earlier redesign this session, which for a time replaced them with a
   merged Overdue/Due-soon/Never-inspected/Deferred list under one CM tab
   with its own round-type filter (#dueTypeF). The maintainer's own
   correction — "Same as the Two weeks before, only CM we change the name"
   — retired THAT in turn: the CM tab is dueWeekRows()/renderDueWeek() again,
   1C's own schedule resolved to CM round types and drawn as a day-by-day
   calendar (tests/duecm.cjs). #dueTypeF, the flat #dueCmList .dueitem rows,
   and the "put off on purpose" text this suite used to read straight off the
   CM list are gone with it — dueRows()'s own interval math (the four-round-
   type regression, the dozer-vs-excavator UC figure) is proven directly at
   the function level in tests/duehours.cjs, which needs no UI at all to
   prove it and is not repeated here.

   What THIS suite still owns: the tab order and the archive/worklist split,
   the retired dropdown controls staying retired, the #dueSpanF pills'
   presence and translation, and the screen fitting a phone at two widths.

   Run: node tests/duetab.cjs   (needs tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const pills = (p, sel) => p.$$eval(sel + ' button',
  a => a.map(b => ({ k: b.dataset.sc || b.dataset.dt || b.dataset.dw, on: b.classList.contains('on'),
                     txt: b.textContent.replace(/\s+/g, ' ').trim(),
                     n: Number((b.querySelector('.n') || {}).textContent || -1) })));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(() => {
    localStorage.setItem('cm_due_view', 'cm');
    /* upload-defaults.js carries the real endpoint; pin it somewhere dead. */
    localStorage.setItem('up_dests', JSON.stringify(
      [{ id: 'gas', on: true, url: 'http://127.0.0.1:9/dead', sec: '', folder: '' }]));
  });
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

  console.log('\nthe bottom-tab badge and the CM heading agree, whatever Capture is set to');
  await p.evaluate(() => { showPane('paneDue'); dueView = 'cm'; renderDue(); });
  await p.waitForTimeout(400);
  const badge = await p.evaluate(() => document.getElementById('tabD').textContent.trim());
  const head  = await p.evaluate(() => document.getElementById('dueCount').textContent.trim());
  ok('the tab badge and the CM heading badge agree', badge === head, badge + ' vs ' + head);
  /* dueWeekRows() reads 1C's own schedule and has nothing to do with which
     round the capture screen happens to be armed with — the historical bug
     this once caught (a badge scoped to Capture's own round type) cannot
     recur structurally now, but the invariant is still worth asserting. */
  ok('the badge is not scoped to whichever round Capture is set to',
     await (async () => {
       await p.evaluate(() => { const s = document.getElementById('typeSel');
         if (s) { s.value = 'TB'; s.dispatchEvent(new Event('change')); } });
       await p.waitForTimeout(350);
       return (await p.evaluate(() => document.getElementById('tabD').textContent.trim())) === badge;
     })(), 'still ' + badge);

  console.log('\npills, not dropdowns');
  ok('the two <select>s are gone',
     await p.evaluate(() => !document.getElementById('dueScope') && !document.getElementById('dueType')));
  ok('the retired round-type filter chip is gone too — 1C\'s own schedule needs no narrowing by round',
     await p.evaluate(() => !document.getElementById('dueTypeF')));
  const span = await pills(p, '#dueSpanF');
  ok('the span pills carry their own counts', span.every(x => x.n >= 0), span.map(x => x.txt).join(' | '));
  ok('one of them is lit, so the reader knows which list this is',
     span.filter(x => x.on).length === 1, span.filter(x => x.on).map(x => x.k).join(','));

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
    const small = await p.$$eval('#dueSpanF button, #tabbar button',
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
