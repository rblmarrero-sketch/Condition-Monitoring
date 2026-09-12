/* THE "1C PLAN" SCOPE ON THE DUE LIST.

   The List is built from what CM has WALKED — the last-done index — so a
   machine CM has no history for produces no row, and a round 1C has an open
   work order for is invisible there however urgent. The screen said so
   ("1C has 139 planned … see Two weeks") and pointed at the agenda, which is
   a calendar: fifteen day-columns, no search, no sort by urgency. Reported
   from the field as "still 0 in the list" while 1C had 139 waiting.

   So 1C's plan gets a scope of its own. What this suite is really guarding
   is that it stays a SEPARATE population:

   1. THE OTHER COUNTS DO NOT MOVE. Overdue, Due soon, Never inspected and
      All are statements about CM's own programme. If adding 1C's plan
      changes any of them, two different questions are being answered by one
      number and neither can be trusted afterwards.
   2. IT IS REAL WORK, NOT A COPY OF THE WORK-ORDER FILE. A round already
      walked since 1C asked for it is not work and must not be listed; a
      round the site has taken off a machine is never proposed here either,
      or the KAMAZ exclusion holds everywhere except the screen an inspector
      reads first.
   3. ONE ROW PER MACHINE AND ROUND. Two work orders in the window can
      resolve to the same round — the 1,000 h and the 4,000 h both carry the
      filter cut — and a list that counts one round twice cannot be counted.
   4. AND IT SAYS WHOSE IT IS. A row with no last-done date and no clock
      that looked like CM's own judgement would be the worst of both.

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
    /* The agenda is what fetches the schedule; the List alone does not. */
    localStorage.setItem('cm_due_view', 'week');
  }, { ['MP|TK003']: { d: day(-2), h: '5000' } });
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.evaluate(() => showPane('paneDue'));
  /* NOT window.SCHED — a top-level let is not a property of window. */
  await p.waitForFunction(() => typeof SCHED !== 'undefined' && SCHED && SCHED.byUnit && SCHED.byUnit.TK001,
    null, { timeout: 25000 });
  await p.evaluate(() => { dueView = 'list'; lsSet('cm_due_view', 'list'); renderDue(); });
  await p.waitForTimeout(400);

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
    return { unit: a.n, got };
  }, day(1));
  ok('a KAMAZ is proposed only the round it is still on',
     km && JSON.stringify(km.got) === '["FC"]', km && km.unit + ' -> ' + JSON.stringify(km.got));

  console.log('\n3. THE OTHER COUNTS DO NOT MOVE');
  const counts = await p.evaluate(() => {
    const pills = {};
    document.querySelectorAll('#dueScopeF [data-sc]').forEach(b => {
      pills[b.dataset.sc] = Number((b.querySelector('.n') || {}).textContent || '0');
    });
    return { pills,
             over: dueRows('').filter(r => r.st === 'over').length,
             never: neverRows('').length,
             all: dueRows('').length + neverRows('').length,
             plan: planRows('').length };
  });
  ok('there is a 1C plan pill and it counts the planned rounds',
     counts.pills.plan === counts.plan && counts.plan > 0,
     JSON.stringify(counts.pills));
  ok('  All still counts CM\'s own rows only — 1C is not folded in',
     counts.pills.all === counts.all, counts.pills.all + ' vs ' + counts.all);
  ok('  Overdue still means overdue against CM\'s own programme',
     counts.pills.over === counts.over, counts.pills.over + ' vs ' + counts.over);

  console.log('\n4. AND THE LIST SAYS WHOSE PLAN IT IS');
  const shown = await p.evaluate(() => {
    const b = [...document.querySelectorAll('#dueScopeF [data-sc]')].find(x => x.dataset.sc === 'plan');
    if (!b) return null;
    b.click();
    return null;
  });
  await p.waitForTimeout(400);
  const list = await p.evaluate(() => ({
    n: document.querySelectorAll('#dueList .duerow').length,
    texts: [...document.querySelectorAll('#dueList .duerow')].map(r => r.innerText.replace(/\s+/g, ' ').trim()),
  }));
  ok('pressing the pill shows those rounds', list.n === counts.plan, list.n + ' rows');
  ok('  every row names 1C rather than reading as CM\'s own judgement',
     list.texts.length > 0 && list.texts.every(x => /1C|1С/.test(x)), list.texts[0]);
  ok('  a row carries the work order and the date 1C wants it',
     list.texts.some(x => /WO-0300/.test(x)), list.texts[0]);
  const lateWord = await p.evaluate(() => t('due_week_late'));
  ok('  and a plan date already gone is marked late',
     list.texts.some(x => x.includes('TK002') && x.toLowerCase().includes(lateWord.toLowerCase())),
     list.texts.find(x => x.includes('TK002')) || '(no TK002 row)');

  console.log('\n5. SEARCH REACHES IT — AS ONE ROW PER ROUND, NOT TWO');
  /* TK002's plug round is BOTH a round CM has never walked and a round 1C
     wants on the 8th. The first version of this listed it twice — "no
     inspection on record" and "1C asked for this" — which reads as two jobs
     at one machine and is exactly how a round gets walked twice. */
  await p.fill('#dueFind', 'TK002');
  await p.waitForTimeout(600);
  const found = await p.evaluate(() =>
    [...document.querySelectorAll('#dueList .duerow')].map(r => r.innerText.replace(/\s+/g, ' ').trim()));
  const mpRows = found.filter(x => /(^|\s)MP\s/.test(x) && x.includes('TK002'));
  ok('the plug round appears once, not once per source', mpRows.length === 1,
     mpRows.length + ' rows: ' + mpRows.join(' | '));
  ok('  and that one row carries 1C\'s date without the tick being on',
     mpRows[0] && /1C plan|план 1С|WO-030002/i.test(mpRows[0]), mpRows[0]);
  ok('  the other rounds on the machine are still listed',
     found.length > 1, found.length + ' rows');

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close(); server.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); process.exit(1); });
