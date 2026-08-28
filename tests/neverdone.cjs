/* THE MACHINE NOBODY HAS EVER WALKED TO IS THE ONE THIS SCREEN COULD NOT NAME.

   dueRows() walks the last-done index, so it can only ever speak about a
   machine somebody has ALREADY inspected. A machine with no round on record
   produces no row at all — not "missed", not "never done", nothing. It is
   absent, and stays absent for ever.

   That reads as "nothing is due" while the truth is "I have never heard of
   this machine". The register here holds 1,128 machines and the folder holds
   inspections for 44, so the due list was answering "which of the machines
   I have seen inspected are overdue?" while being read as "what is overdue?"
   — and a week was spent on two phones disagreeing by five machines when both
   were silent about a thousand.

   WHICH ROUNDS A MACHINE IS ON is the hard half, and there is no table that
   answers it. The capture screen offers every round for every machine; the
   points reference lists MP, FC, INSP and TEMP for every class alike,
   including the catch-all, and says nothing about the undercarriage or the
   dump body — the two rounds this fleet has been most explicit about. Read as
   a programme it would propose a thermal survey for all 188 classed machines
   and an undercarriage round for none of them.

   So the pairing comes from what the fleet has STATED and what it has DONE:

     stated  a per-class interval in due.js. UC at 1,000 h for dozers and
             4,000 for excavators, TB at 4,000 for articulated trucks. Naming
             a figure for a class IS saying the class is on that round.
     done    a round walked on any machine of a class. If a haul truck has had
             a plug round, every haul truck is on the plug round.

   Nothing else proposes anything, which is what keeps this a worklist rather
   than every round crossed with every machine — and it grows on its own as
   the programme does.

   Run: node tests/neverdone.cjs        (needs tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const say = (p, k, v) => p.evaluate(([k, v]) => t(k, v || undefined), [k, v]);

async function phone(b, hist) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(h => {
    /* In the pit: the register and the index are all this needs, and a repair
       fetching the folder mid-test would move the numbers under it. */
    Object.defineProperty(navigator, 'onLine', { get: () => false });
    localStorage.setItem('cm_hist', JSON.stringify(h || {}));
    localStorage.setItem('cm_hist_at', JSON.stringify({ at: Date.now(), n: 0 }));
  }, hist || {});
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1400);
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(500);
  return { ctx, p };
}
/* One machine of each class, by the app's own classifier, so the fixture
   cannot drift from the register. */
const pick = p => p.evaluate(() => {
  const by = {};
  (window.ASSETS || []).forEach(a => { const k = PTS.classOf(a.cls || a.cat || '');
    if (k && !by[k]) by[k] = a.n; });
  const n = {};
  (window.ASSETS || []).forEach(a => { const k = PTS.classOf(a.cls || a.cat || '');
    n[k] = (n[k] || 0) + 1; });
  return { one: by, count: n };
});

(async () => {
  const b = await chromium.launch();

  console.log('a phone with no history at all');
  {
    const a = await phone(b);
    const f = await pick(a.p);
    const rows = await a.p.evaluate(() => neverRows('').map(r => r.ty + '|' + r.cls));
    const tys = {}; rows.forEach(r => { const [ty, cls] = r.split('|'); tys[ty + ' ' + cls] = (tys[ty + ' ' + cls] || 0) + 1; });
    /* Only the STATED pairings can fire: nothing has been done yet. */
    ok('every dozer is proposed for the undercarriage round',
       tys['UC DOZ'] === f.count.DOZ, tys['UC DOZ'] + ' of ' + f.count.DOZ);
    ok('and every excavator, on its own 4,000 h figure',
       tys['UC EXC'] === f.count.EXC, tys['UC EXC'] + ' of ' + f.count.EXC);
    ok('and every articulated truck for the body round',
       tys['TB AT'] === f.count.AT, tys['TB AT'] + ' of ' + f.count.AT);
    /* THE LINE THAT KEEPS THIS A WORKLIST. A round nobody has ever walked on
       a kind of machine is not proposed for it. */
    ok('a thermal survey nobody has walked is proposed for nothing',
       !rows.some(r => r.startsWith('TEMP')), rows.filter(r => r.startsWith('TEMP')).length + ' TEMP row(s)');
    ok('and neither is a plug round, until somebody does one',
       !rows.some(r => r.startsWith('MP')), rows.filter(r => r.startsWith('MP')).length + ' MP row(s)');
    /* 940 machines carry no class. Proposing a final-drive plug round for a
       crew bus because a catch-all class happens to list one is guessing, and
       nine hundred guesses bury the hundred and eighty that are real. */
    ok('machines with no stated class are proposed for nothing',
       !rows.some(r => /\|(GEN|ALL|)$/.test(r)), 'unclassed rows: '
         + rows.filter(r => /\|(GEN|ALL|)$/.test(r)).length);
    ok('but they are counted and named, not silently dropped',
       (await a.p.evaluate(() => (document.getElementById('dueBasis') || {}).textContent || ''))
         .includes(await say(a.p, 'due_noprog', { n: f.count.GEN })), 'GEN=' + f.count.GEN);
    await a.ctx.close();
  }

  console.log('\none round walked is the fleet saying that class is on it');
  {
    const probe = await phone(b);
    const f = await pick(probe.p);
    await probe.ctx.close();
    const a = await phone(b, {
      ['MP|' + f.one.HT]:   { d: '2026-08-01' },
      ['INSP|' + f.one.DOZ]: { d: '2026-08-01' },
      ['FC|' + f.one.CRJ]:  { d: '2026-08-01' },
    });
    const tys = await a.p.evaluate(() => {
      const o = {}; neverRows('').forEach(r => { const k = r.ty + ' ' + r.cls; o[k] = (o[k] || 0) + 1; }); return o; });
    ok('one plug round on a haul truck proposes the rest of them',
       tys['MP HT'] === f.count.HT - 1, tys['MP HT'] + ' of ' + (f.count.HT - 1));
    ok('one walk-around on a dozer proposes the rest of them',
       tys['INSP DOZ'] === f.count.DOZ - 1, tys['INSP DOZ'] + ' of ' + (f.count.DOZ - 1));
    ok('one filter round on a jaw crusher proposes the rest of them',
       tys['FC CRJ'] === f.count.CRJ - 1, tys['FC CRJ'] + ' of ' + (f.count.CRJ - 1));
    /* And it does not leak across classes: a plug round on a haul truck says
       nothing about a grader. */
    ok('and says nothing about a class nobody has walked that round on',
       !tys['MP GRD'] && !tys['INSP CRJ'], JSON.stringify(tys));
    /* The machine that HAS been done is not on the list. */
    ok('the machine that was done is not proposed again',
       !(await a.p.evaluate(u => neverRows('MP').some(r => r.unit === u), f.one.HT)));
    await a.ctx.close();
  }

  console.log('\nthe screen offers it, and a tap starts the round');
  {
    const probe = await phone(b); const f = await pick(probe.p); await probe.ctx.close();
    const a = await phone(b, { ['MP|' + f.one.HT]: { d: '2026-08-01' } });
    const pill = await a.p.evaluate(() => {
      const el = document.querySelector('#dueScopeF [data-sc="never"]');
      return el ? el.textContent.trim() : null; });
    ok('a pill appears with the count on it', !!pill && /\d/.test(pill), String(pill));
    await a.p.evaluate(() => document.querySelector('#dueScopeF [data-sc="never"]').click());
    await a.p.waitForTimeout(400);
    const row = await a.p.evaluate(() => {
      const r = document.querySelector('#dueList .duerow .dueitem');
      return r ? { txt: r.textContent.replace(/\s+/g, ' ').trim(), u: r.dataset.u, t: r.dataset.t,
                   never: r.classList.contains('never') } : null; });
    ok('the rows are marked as a state of their own', !!row && row.never, JSON.stringify(row && row.txt));
    /* No date to print and none invented: "0 d ago" over a machine with no
       record would be the app describing an inspection that never happened. */
    ok('and say what is true rather than a date they do not have',
       !!row && row.txt.includes(await say(a.p, 'due_never_row')), row && row.txt);
    ok('there is nothing to put off on a round nobody has started',
       await a.p.evaluate(() => !document.querySelector('#dueList .duerow .dueforget')));
    /* The point of the list: one tap and you are on that round, on that
       machine. */
    await a.p.evaluate(() => document.querySelector('#dueList .dueitem').click());
    await a.p.waitForTimeout(500);
    const opened = await a.p.evaluate(() => ({
      pane: (document.querySelector('#tabbar button.on') || {}).dataset.pane,
      type: (document.getElementById('typeSel') || {}).value,
    }));
    ok('tapping one opens the capture screen on that round',
       opened.pane === 'paneCapture' && opened.type === row.t,
       opened.pane + ' · ' + opened.type + ' (row said ' + (row && row.t) + ')');
    await a.ctx.close();
  }

  console.log('\nand the list stops saying two hundred is all there is');
  {
    /* The fleet as it will be once the programme is running: each round walked
       at least once on each kind of machine. That is when the list grows past
       the cap, and the cap has been silent since this screen was written — it
       only became a lie when there was something behind it. */
    const probe = await phone(b); const f = await pick(probe.p); await probe.ctx.close();
    const hist = {};
    Object.keys(f.one).forEach(k => {
      if (k === 'GEN' || k === 'ALL') return;
      ['MP', 'FC', 'INSP'].forEach(ty => { hist[ty + '|' + f.one[k]] = { d: '2026-08-01' }; });
    });
    const a = await phone(b, hist);
    const n = await a.p.evaluate(() => neverRows('').length);
    ok('the list is longer than the cap', n > 200, n + ' rows');
    await a.p.evaluate(() => document.querySelector('#dueScopeF [data-sc="never"]').click());
    await a.p.waitForTimeout(400);
    const shown = await a.p.evaluate(() => document.querySelectorAll('#dueList .duerow').length);
    const tail = await a.p.evaluate(() => (document.getElementById('dueList') || {}).textContent || '');
    ok('it draws two hundred of them', shown === 200, String(shown));
    ok('and says how many it is not showing',
       tail.includes(await say(a.p, 'due_more', { n: n - 200 })), n - 200 + ' more');
    /* Narrowing by round is the way through, and the message says so. */
    await a.p.evaluate(() => { const t2 = document.querySelector('#dueTypeF [data-dt="MP"]');
                               if (t2) t2.click(); });
    await a.p.waitForTimeout(400);
    ok('and narrowing by round brings it back under the cap',
       await a.p.evaluate(() => document.querySelectorAll('#dueList .duerow').length) <= 200);
    await a.ctx.close();
  }

  await b.close();
  console.log('\n' + (fails.length ? 'FAILED ' + fails.length + '\n  ' + fails.join('\n  ') : 'all passed'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
