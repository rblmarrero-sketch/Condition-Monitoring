/* What is due, and what we missed.

   The due list could only ever answer for ONE round type — whichever the
   capture screen happened to be set to — and there was a box on it holding
   that round's interval, which read like the control for the list and was not.
   To find out whether any undercarriage rounds were overdue you had to go and
   change the round type at the top of the app; and an interval somebody
   retyped in that box put their phone quietly out of step with the fleet.

   And the only way off the list was a bare cross. A machine can be due and not
   get walked — it is in the workshop, it is off site, nobody could reach it
   this shift — and that is ordinary, and it is not the same as forgetting. A
   control that turns both into one silent gesture destroys the answer to the
   only question the list exists for.

   So: every round in one list, worst first, counted; and a round that is not
   being done says so, with a reason, either put off to a date or not at all.

   The separate Overdue/Due soon/Put off scope pills (#dueScopeF, #dueList)
   this suite was originally written against are retired — folded into the
   CM tab's own merged agenda (This day/All 14 days, tests/duecm.cjs) — but
   the DEFER DIALOG itself (#dueForget → the reason sheet → OK disabled until
   typed → "put off N days" vs "not at all") and the worst-first ordering
   across every state at once are not covered by that suite's own smaller,
   single-state fixture, and are kept here, adapted to the merged list.
   ASSETS is zeroed once the fixture is seeded so the whole fleet's
   never-inspected rows do not drown out the five deliberately-aged ones this
   suite is actually about — see tests/histage.cjs's emptyPure for the same
   technique.

   Run: node tests/duelist.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL  = `http://127.0.0.1:${PORT}/mobile/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const rows = p => p.evaluate(() => [...document.querySelectorAll('.dueitem')]
  .map(x => x.textContent.replace(/\s+/g, ' ').trim()));

/* Five rounds on five machines, deliberately different types and different
   ages, so "one list, worst first" is a claim with something to be wrong.

   RELATIVE, NOT FIXED. These were five calendar dates, which meant the ages
   they stood for drifted every day the suite was not run and the intervals
   they were chosen against were the flat ones this project used to have. Each
   one is now stated as "this many days past its own interval", against the
   figures the fleet actually gave, at 20 h/day:

     MP    250 h  = 12.5 d   every machine
     FC    500 h  =   25 d
     INSP  500 h  =   25 d
     UC   1000 h  =   50 d   dozers   ·  4000 h = 200 d  excavators
     TB   4000 h  =  200 d   articulated  ·  1000 h = 50 d  the rest

   TK101 is an articulated truck, so its tray round comes round at 4,000 hours
   and not the 1,000 the suite used to assume — 250 days puts it 50 days past,
   which keeps it the worst on the list for the reason it was chosen. */
const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const SEED = `(() => {
  histSave({ 'MP|TK146':'${ago(26)}', 'UC|DZ001':'${ago(68)}', 'FC|EX005':'${ago(9)}',
             'INSP|TK150':'${ago(57)}', 'TB|TK101':'${ago(250)}' });
  deferSave({}); smuSave({});
  dueType = '';
  dueView = 'cm'; dueSpan = 'all';
  ASSETS.length = 0;
  showPane('paneDue'); renderDue();
})()`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  /* The capture screen is on a magnetic plug round throughout. Nothing below
     touches it — that is the point. */
  await p.evaluate(() => { const s = document.getElementById('typeSel');
    s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(SEED);
  await p.waitForTimeout(300);

  console.log('\n  every round, in one list');
  const all = await rows(p);
  ok('rounds of more than one type are on it', new Set(all.map(r => r.split(' ')[0])).size >= 3,
    all.map(r => r.split(' ')[0]).join(','));
  ok('and the capture screen was never touched to see them',
    (await p.evaluate(() => document.getElementById('typeSel').value)) === 'MP');
  /* Worst first is the whole ordering claim: a fitter reads the top of this
     list and stops. */
  const overdue = all.map(r => { const m = /overdue ([\d,]+) d/.exec(r); return m ? +m[1].replace(',', '') : -1; });
  ok('worst first', overdue.every((v, i) => i === 0 || overdue[i - 1] >= v), overdue.join(' > '));
  ok('the tray round is the most overdue of them', /^TB TK101/.test(all[0]), all[0]);

  console.log('\n  and it says how many were missed');
  /* The count sits ON the control that filters to it — the This day/All 14
     days span pill now, in place of the retired Overdue/Due soon pair, and
     it is the same figure the tab badge carries. */
  const spanPills = await p.$$eval('#dueSpanF button',
    a => a.map(b => b.textContent.replace(/\s+/g, ' ').trim()));
  ok('the count is on the screen, not left to be measured by eye',
    spanPills.some(x => /^Today ?\d/.test(x)), spanPills.join(' | '));
  const badge = await p.evaluate(() => document.getElementById('dueCount').textContent);
  const nToday = Number((spanPills.find(x => /^Today/.test(x)) || '').replace(/\D+/g, ''));
  /* One number, one meaning: the badge, the pill and the app's own rule agree. */
  const trueOver = await p.evaluate(() => dueRows('').filter(dueCmToday).length);
  ok('and the badge says the same thing the pill does',
    Number(badge) === nToday && nToday === trueOver, badge + ' vs ' + nToday + ' vs ' + trueOver);

  console.log('\n  narrowed to one round when that is what you want');
  const uc = await p.evaluate(async () => { dueType = 'UC';
    renderDue(); await new Promise(r => setTimeout(r, 150));
    return [...document.querySelectorAll('#dueCmList .dueitem')].map(x => x.textContent.replace(/\s+/g, ' ').trim()); });
  ok('only that round is listed', uc.length && uc.every(r => /^UC /.test(r)), uc.join(' | ') || 'none');
  /* Undercarriage is 1,000 h on a dozer and 4,000 on an excavator now, so the
     line names whichever the fixture's machine is walked on rather than one
     figure that was wrong for half the fleet. */
  ok('and its own interval is named', /(1,?000|4,?000) h/.test(
    await p.evaluate(() => document.getElementById('dueIntervalNote').textContent)),
    await p.evaluate(() => document.getElementById('dueIntervalNote').textContent));
  await p.evaluate(async () => { dueType = '';
    renderDue(); await new Promise(r => setTimeout(r, 150)); });

  console.log('\n  "This day" is the same list, without what is only coming up');
  const missed = await p.evaluate(async () => { dueSpan = 'today';
    renderDue(); await new Promise(r => setTimeout(r, 150));
    return [...document.querySelectorAll('#dueCmList .dueitem')].map(x => x.textContent.replace(/\s+/g, ' ').trim()); });
  /* FC EX005 (9 d, inside its 25 d interval) is due soon, not yet overdue —
     the one row in this fixture that "This day" must leave out. */
  ok('every row on it is overdue, not merely coming up', missed.length && missed.every(r => /overdue/.test(r)),
    missed.length + ' rows');
  ok('and the one only due soon is left out', !missed.some(r => /EX005/.test(r)), missed.join(' | '));

  console.log('\n  a round that is not being done says why');
  await p.evaluate(() => { document.getElementById('inspector').value = 'S. Volkov'; });
  await p.click('.dueforget');
  await p.waitForTimeout(250);
  const sheet = await p.evaluate(() => ({
    t: document.getElementById('dueDlgT').textContent,
    sub: document.getElementById('dueDlgSub').textContent,
    when: [...document.querySelectorAll('#dueWhen [data-w]')].map(x => x.dataset.w) }));
  ok('it names the machine and the round', /TK101/.test(sheet.t) && /Dump body/i.test(sheet.sub),
    sheet.t + ' / ' + sheet.sub.slice(0, 50));
  ok('and offers both: put it off, or not at all',
    sheet.when.includes('7') && sheet.when.includes('off'), sheet.when.join(' '));

  /* The reason is the point of asking. Refused, not defaulted — "no reason
     given" recorded a hundred times is the same as no record at all. OK used
     to stay pressable and answer a real tap with one small grey sentence
     under a dialog that stayed open, which read in the field as "it does not
     respond". It is disabled outright now, so the button itself says what a
     nag message could not be counted on to be read. */
  ok('OK is disabled with nothing typed', await p.evaluate(() => document.getElementById('dueDlgOk').disabled));
  let refused = false;
  try { await p.click('#dueDlgOk', { timeout: 1000 }); } catch (e) { refused = true; }
  ok('a real tap on it cannot land', refused);
  ok('and nothing was written', (await p.evaluate(() =>
    Object.keys(JSON.parse(localStorage.getItem('cm_due_defer') || '{}')).length)) === 0);

  await p.fill('#dueWhy', 'in the workshop, wheel motor out');
  await p.click('[data-w="7"]');
  await p.click('#dueDlgOk');
  await p.waitForTimeout(300);
  const put = await p.evaluate(() => ({
    defer: JSON.parse(localStorage.getItem('cm_due_defer') || '{}'),
    rows: [...document.querySelectorAll('#dueCmList .dueitem')].map(x => x.textContent.replace(/\s+/g, ' ').trim()) }));
  const d = put.defer['TB|TK101'];
  ok('the reason is kept', d && d.why === 'in the workshop, wheel motor out', JSON.stringify(d));
  ok('with who gave it and when', d && d.by === 'S. Volkov' && !!d.at, JSON.stringify(d));
  ok('and a date to come back on', d && /^\d{4}-\d{2}-\d{2}$/.test(d.until || ''), String(d && d.until));
  /* The merged agenda never drops a put-off round the way the old "working
     list" scope did — it is shown with its reason attached, on the spot,
     the same principle tests/duecm.cjs proves for a deferral: "shown, not
     dropped". No scope switch is needed to see it. */
  const tk101Row = put.rows.find(r => /TK101/.test(r)) || '';
  ok('the machine stays on the list, marked with its reason, not dropped',
    !!tk101Row && /wheel motor out/.test(tk101Row) && /S\. Volkov/.test(tk101Row), tk101Row.slice(0, 110));
  ok('and it no longer counts as overdue',
    !(await p.evaluate(() => dueRows('').filter(dueCmToday).map(r => r.unit))).includes('TK101'));

  console.log('\n  and a round that is walked answers it');
  const cleared = await p.evaluate(async () => {
    noteDone({ type: 'TB', equip: 'TK101', date: '2026-08-24', smu: '7100' });
    renderDue(); await new Promise(r => setTimeout(r, 150));
    return { defer: JSON.parse(localStorage.getItem('cm_due_defer') || '{}'),
             last: histDate(histAll()['TB|TK101']) }; });
  ok('the deferral is gone the moment the round is done',
    !cleared.defer['TB|TK101'], JSON.stringify(cleared.defer));
  ok('and the date it was put off over is the round\'s', cleared.last === '2026-08-24', cleared.last);

  console.log('\n  a round nobody is going to do at all');
  await p.evaluate(async () => { dueType = '';
    renderDue(); await new Promise(r => setTimeout(r, 150)); });
  await p.click('#dueCmList .dueforget');
  await p.waitForTimeout(250);
  await p.fill('#dueWhy', 'unit sold, off site permanently');
  await p.click('[data-w="off"]');
  await p.click('#dueDlgOk');
  await p.waitForTimeout(300);
  const off = await p.evaluate(() => ({
    defer: JSON.parse(localStorage.getItem('cm_due_defer') || '{}') }));
  const anyOff = Object.values(off.defer).find(x => x && x.until === null);
  ok('it is recorded with no date to come back on', !!anyOff, JSON.stringify(off.defer));
  ok('and its reason', anyOff && /unit sold/.test(anyOff.why), anyOff && anyOff.why);

  console.log('\n  the row opens the round it is due for');
  await p.evaluate(async () => { dueType = '';
    renderDue(); await new Promise(r => setTimeout(r, 150)); });
  const want = await p.evaluate(() => {
    const el = document.querySelector('#dueCmList .dueitem'); return el ? el.dataset.t : ''; });
  await p.click('#dueCmList .dueitem');
  await p.waitForTimeout(400);
  const landed = await p.evaluate(() => document.getElementById('typeSel').value);
  ok('tapping a row opens capture on that round',
    want && landed === want, 'row ' + want + ' → capture ' + landed);

  await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED' : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
