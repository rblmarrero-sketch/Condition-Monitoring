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
  dueScope = 'over';
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
  /* The count sits ON the control that filters to it. It used to be a sentence
     under the controls — "7 missed · 3 due soon" — which answered "how bad is
     it" in one place and "show me" in another, two taps apart. */
  /* The labels, from the app's own dictionary — they have been "Missed" and
     "Put off" and are "Overdue" and "Deferred"; the count is what matters. */
  const L = await p.evaluate(() => ({ over: I18N.en.due_missed, soon: I18N.en.due_soon, put: I18N.en.due_putoff }));
  const isOver = x => new RegExp('^' + L.over).test(x);
  const pills = await p.$$eval('#dueScopeF button',
    a => a.map(b => b.textContent.replace(/\s+/g, ' ').trim()));
  ok('the count is on the screen, not left to be measured by eye',
    pills.some(x => new RegExp('^' + L.over + ' ?\\d').test(x)) && pills.some(x => new RegExp('^' + L.soon + ' ?\\d').test(x)),
    pills.join(' | '));
  ok('and pressing one narrows the list to exactly what it counted',
    await (async () => {
      const n = Number((pills.find(isOver) || '').replace(/\D+/g, ''));
      await p.click('#dueScopeF [data-sc="over"]'); await p.waitForTimeout(250);
      const got = await p.$$eval('#dueList .duerow', a => a.length);
      await p.click('#dueScopeF [data-sc="over"]'); await p.waitForTimeout(250);
      return got === n;
    })(), pills.find(isOver));
  const badge = await p.evaluate(() => document.getElementById('dueCount').textContent);
  const nMissed = Number((pills.find(isOver) || '').replace(/\D+/g, ''));
  /* One number, one meaning. The badge counted overdue-and-due-soon while the
     tab beside it counted overdue, so the same card carried two totals for
     itself and nothing said which was which. */
  ok('and the badge says the same thing the tab does', Number(badge) === nMissed,
    badge + ' vs ' + nMissed + ' missed');

  console.log('\n  narrowed to one round when that is what you want');
  const uc = await p.evaluate(async () => { dueType = 'UC';
    renderDue(); await new Promise(r => setTimeout(r, 150));
    return [...document.querySelectorAll('.dueitem')].map(x => x.textContent.replace(/\s+/g, ' ').trim()); });
  ok('only that round is listed', uc.length && uc.every(r => /^UC /.test(r)), uc.join(' | ') || 'none');
  /* Undercarriage is 1,000 h on a dozer and 4,000 on an excavator now, so the
     header names whichever the fixture's machine is walked on rather than one
     figure that was wrong for half the fleet. */
  ok('and its own interval is named', /(1,?000|4,?000) h/.test(
    await p.evaluate(() => document.getElementById('dueBasis').textContent)),
    await p.evaluate(() => document.getElementById('dueBasis').textContent));
  await p.evaluate(async () => { dueType = '';
    renderDue(); await new Promise(r => setTimeout(r, 150)); });

  console.log('\n  "missed only" is the same list, without the ones still in hand');
  const missed = await p.evaluate(async () => { dueScope = 'over';
    renderDue(); await new Promise(r => setTimeout(r, 150));
    return [...document.querySelectorAll('.dueitem')].map(x => x.textContent.replace(/\s+/g, ' ').trim()); });
  ok('every row on it is overdue', missed.length && missed.every(r => /overdue/.test(r)),
    missed.length + ' rows');
  await p.evaluate(async () => { dueScope = 'over';
    renderDue(); await new Promise(r => setTimeout(r, 150)); });

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
     given" recorded a hundred times is the same as no record at all. */
  await p.click('#dueDlgOk');
  await p.waitForTimeout(200);
  const nagged = await p.textContent('#dueDlgMsg');
  ok('it refuses without one', nagged.length > 10, nagged);
  ok('and nothing was written', (await p.evaluate(() =>
    Object.keys(JSON.parse(localStorage.getItem('cm_due_defer') || '{}')).length)) === 0);

  await p.fill('#dueWhy', 'in the workshop, wheel motor out');
  await p.click('[data-w="7"]');
  await p.click('#dueDlgOk');
  await p.waitForTimeout(300);
  const put = await p.evaluate(() => ({
    defer: JSON.parse(localStorage.getItem('cm_due_defer') || '{}'),
    basis: document.getElementById('dueBasis').textContent,
    pills: [...document.querySelectorAll('#dueScopeF button')]
             .map(x => x.textContent.replace(/\s+/g, ' ').trim()),
    rows: [...document.querySelectorAll('.dueitem')].map(x => x.textContent.replace(/\s+/g, ' ').trim()) }));
  const d = put.defer['TB|TK101'];
  ok('the reason is kept', d && d.why === 'in the workshop, wheel motor out', JSON.stringify(d));
  ok('with who gave it and when', d && d.by === 'S. Volkov' && !!d.at, JSON.stringify(d));
  ok('and a date to come back on', d && /^\d{4}-\d{2}-\d{2}$/.test(d.until || ''), String(d && d.until));
  ok('the machine leaves the working list', !put.rows.some(r => /TK101/.test(r)),
    put.rows.length + ' rows');
  /* Counted, not forgotten — and the count is a control. The whole reason for
     asking for a reason is that somebody can find out later what was put off
     and why, so the number is on the pill that shows them. */
  ok('but it is still counted, as put off',
    put.pills.some(x => new RegExp('^' + L.put + ' ?[1-9]').test(x)), put.pills.join(' | '));
  const shown = await p.evaluate(async () => { dueScope = 'all';
    renderDue(); await new Promise(r => setTimeout(r, 150));
    const r = [...document.querySelectorAll('.dueitem')].find(x => /TK101/.test(x.textContent));
    return r ? r.textContent.replace(/\s+/g, ' ').trim() : ''; });
  ok('and the reason is on its row, not behind a tap',
    /wheel motor out/.test(shown) && /S\. Volkov/.test(shown), shown.slice(0, 110));

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
  await p.evaluate(async () => { dueScope = 'over';
    renderDue(); await new Promise(r => setTimeout(r, 150)); });
  await p.click('.dueforget');
  await p.waitForTimeout(250);
  await p.fill('#dueWhy', 'unit sold, off site permanently');
  await p.click('[data-w="off"]');
  await p.click('#dueDlgOk');
  await p.waitForTimeout(300);
  const off = await p.evaluate(() => ({
    defer: JSON.parse(localStorage.getItem('cm_due_defer') || '{}'),
    basis: document.getElementById('dueBasis').textContent }));
  const anyOff = Object.values(off.defer).find(x => x && x.until === null);
  ok('it is recorded with no date to come back on', !!anyOff, JSON.stringify(off.defer));
  ok('and its reason', anyOff && /unit sold/.test(anyOff.why), anyOff && anyOff.why);

  console.log('\n  the row opens the round it is due for');
  await p.evaluate(async () => { dueScope = 'over';
    dueType = '';
    renderDue(); await new Promise(r => setTimeout(r, 150)); });
  const want = await p.evaluate(() => {
    const el = document.querySelector('.dueitem'); return el ? el.dataset.t : ''; });
  await p.click('.dueitem');
  await p.waitForTimeout(400);
  const landed = await p.evaluate(() => document.getElementById('typeSel').value);
  ok('tapping an undercarriage row opens an undercarriage round',
    want && landed === want, 'row ' + want + ' → capture ' + landed);

  await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED' : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
