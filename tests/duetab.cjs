/* The due list gets a tab, and its filters become pills.

   Two things a phone screenshot made obvious.

   The due list lived at the bottom of System, under "In the system" — which on
   a phone that has pulled the team's work means scrolling past forty-two rounds
   of archive to reach the one list that says what to walk. The archive and the
   worklist are different questions, and one of them is asked at the start of
   every shift. So: four tabs, and Due is second, after the app's own job and
   before everything that is about looking backwards.

   And the filters were two dropdowns. A dropdown hides its options until it is
   opened and cannot say how many rounds are behind each one — so the counts had
   to be printed again as a sentence underneath ("6 missed · 7 due soon"),
   which put the number in one place and the tap that acts on it in another. The
   card above already used pills. Now both do, and the count rides on the
   control that filters to it.

   What this suite guards is that they agree. A badge, a card heading and a pill
   all counting the same thing must all say the same number — the badge used to
   count magnetic plugs while the list beside it counted undercarriage rounds,
   and nothing anywhere reported an error.

   Run: node tests/duetab.cjs   (needs tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const on  = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/* A shift's worth of history across four round types, placed against the real
   intervals: MP 250 h, UC/INSP 500 h, TB 1000 h, at 20 h/day. */
const HIST = {
  'UC|EX004':   { d: ago(54), h: '4100' },   // 1080 h on a 500 h round — missed
  'UC|EX005':   { d: ago(53), h: '3900' },   // missed
  'UC|DZ001':   { d: ago(42), h: '8800' },   // missed
  'UC|DZ004':   { d: ago(31), h: '6100' },   // missed, but put off
  'UC|EX003':   { d: ago(6),  h: '5200' },   // fine
  'MP|TK160':   { d: ago(14), h: '7725' },   // 280 h on a 250 h round — missed
  'MP|TK154':   { d: ago(5),  h: '7300' },   // fine
  'TB|TK105':   { d: ago(48), h: '12400' },  // 960 h on 1000 — due soon
  'INSP|TK101': { d: ago(26), h: '10200' },  // missed
};
const DEFER = { 'UC|DZ004': { u: 'DZ004', t: 'UC', until: on(6),
  why: 'on a low-loader to the workshop', by: 'S. Volkov', at: ago(2) } };

const pills = (p, sel) => p.$$eval(sel + ' button',
  a => a.map(b => ({ k: b.dataset.sc || b.dataset.dt, on: b.classList.contains('on'),
                     txt: b.textContent.replace(/\s+/g, ' ').trim(),
                     n: Number((b.querySelector('.n') || {}).textContent || -1) })));
const rows = p => p.$$eval('#dueList .duerow', a => a.length);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(([h, d]) => {
    localStorage.setItem('cm_hist', JSON.stringify(h));
    localStorage.setItem('cm_due_defer', JSON.stringify(d));
    /* upload-defaults.js carries the real endpoint; pin it somewhere dead. */
    localStorage.setItem('up_dests', JSON.stringify(
      [{ id: 'gas', on: true, url: 'http://127.0.0.1:9/dead', sec: '', folder: '' }]));
  }, [HIST, DEFER]);
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1300);

  console.log('four tabs, in the order of the shift');
  const tabs = await p.$$eval('#tabbar button[data-pane]', a => a.map(x => x.dataset.pane));
  ok('there are four of them', tabs.length === 4, tabs.join(' '));
  ok('and Due is one, second after Capture',
     tabs[0] === 'paneCapture' && tabs[1] === 'paneDue', tabs.join(' > '));
  ok('every tab opens a pane that exists',
     await p.evaluate(t => t.every(x => !!document.getElementById(x)), tabs));
  /* It used to be three screens down inside System. */
  ok('the due list is no longer buried in the archive',
     await p.evaluate(() => !document.querySelector('#paneSystem #dueList')
                         && !!document.querySelector('#paneDue #dueList')));
  ok('the archive is still its own tab', tabs.includes('paneSystem'));

  console.log('\nthe badge, the heading and the pill agree');
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(400);
  const sc = await pills(p, '#dueScopeF');
  const missed = sc.find(x => x.k === 'over') || {};
  const badge = await p.evaluate(() => document.getElementById('tabD').textContent.trim());
  const head  = await p.evaluate(() => document.getElementById('dueCount').textContent.trim());
  /* Six machines are past their interval; one of them was put off on purpose,
     which is a decision and not a miss. */
  ok('the missed pill counts what nobody explained away', missed.n === 5,
     missed.txt + '  (expected 5)');
  ok('the tab badge says the same', Number(badge) === missed.n, badge + ' vs ' + missed.n);
  ok('and so does the card heading', Number(head) === missed.n, head + ' vs ' + missed.n);
  /* The badge counted only the round type the capture screen was armed with,
     so it read 1 beside a list of six. */
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
  ok('every scope pill carries its own count', sc.every(x => x.n >= 0),
     sc.map(x => x.txt).join(' | '));
  ok('one of them is lit, so the reader knows which list this is',
     sc.filter(x => x.on).length === 1, sc.filter(x => x.on).map(x => x.k).join(','));
  ok('and it is the one the badge counts', (sc.find(x => x.on) || {}).k === 'over');
  ok('pressing a pill shows exactly what it counted', await (async () => {
    await p.click('#dueScopeF [data-sc="soon"]'); await p.waitForTimeout(300);
    const soon = (sc.find(x => x.k === 'soon') || {}).n;
    return (await rows(p)) === soon;
  })(), (sc.find(x => x.k === 'soon') || {}).txt);

  console.log('\na pill never leads to an empty list');
  await p.click('#dueScopeF [data-sc="over"]'); await p.waitForTimeout(300);
  let ty = await pills(p, '#dueTypeF');
  ok('the round pills are built from the rounds that are actually due',
     ty.length > 1 && ty.filter(x => x.k).every(x => x.n > 0),
     ty.map(x => x.txt).join(' | '));
  /* TB has one round due soon and none missed, so under Missed it has no pill. */
  ok('a round type with nothing in this scope gets no pill',
     !ty.some(x => x.k === 'TB'), ty.map(x => x.k).join(','));
  ok('and their counts add up to the scope they sit under',
     ty.filter(x => x.k).reduce((s, x) => s + x.n, 0) === missed.n,
     ty.filter(x => x.k).map(x => x.txt).join(' + '));
  ok('pressing one narrows the list to its own count', await (async () => {
    const uc = ty.find(x => x.k === 'UC');
    await p.click('#dueTypeF [data-dt="UC"]'); await p.waitForTimeout(300);
    return (await rows(p)) === uc.n;
  })(), (ty.find(x => x.k === 'UC') || {}).txt);
  /* Narrowed to a type, then widened to a scope it has nothing in: the pill
     that got you here must not vanish, or the list looks broken with no way
     back. */
  await p.click('#dueScopeF [data-sc="soon"]'); await p.waitForTimeout(300);
  ty = await pills(p, '#dueTypeF');
  ok('the pill you are standing on survives a scope that empties it',
     ty.some(x => x.k === 'UC' && x.on), ty.map(x => x.txt + (x.on ? '*' : '')).join(' | '));

  console.log('\nput off on purpose');
  await p.click('#dueTypeF [data-dt=""]'); await p.waitForTimeout(200);
  await p.click('#dueScopeF [data-sc="put"]'); await p.waitForTimeout(300);
  const txt = await p.textContent('#dueList');
  ok('the put-off pill lists the machine and the reason it was put off',
     /DZ004/.test(txt) && /low-loader/.test(txt), txt.replace(/\s+/g, ' ').trim().slice(0, 90));
  ok('and that machine is not on the missed list', await (async () => {
    await p.click('#dueScopeF [data-sc="over"]'); await p.waitForTimeout(300);
    return !/DZ004/.test(await p.textContent('#dueList'));
  })());

  console.log('\nthe counts do not repeat themselves under the pills');
  const basis = (await p.textContent('#dueBasis')).trim();
  ok('the basis line says what a count cannot', /20 h\/day/.test(basis), basis);
  ok('and does not restate the pills', !/\d+ missed/.test(basis), basis);

  console.log('\nRussian');
  await p.evaluate(() => { lang = 'ru'; applyLang(); renderDue(); });
  await p.waitForTimeout(300);
  const ruTabs = await p.$$eval('#tabbar button', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  ok('the new tab is translated', /[А-Яа-я]/.test(ruTabs[1] || ''), ruTabs.join(' | '));
  const ruSc = await pills(p, '#dueScopeF');
  ok('and so are the pills', ruSc.every(x => /[А-Яа-я]/.test(x.txt)), ruSc.map(x => x.txt).join(' | '));
  ok('with the counts still on them', ruSc.every(x => x.n >= 0));
  await p.evaluate(() => { lang = 'en'; applyLang(); renderDue(); });

  console.log('\nthe screen fits the phone it is read on');
  for (const [w, h, tag] of [[320, 720, 'small'], [412, 915, 'phone']]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(300);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(tag + ': the page does not scroll sideways', over <= 0, over + ' px over');
    /* The pills scroll INSIDE their own row; that is the point of the row. */
    const small = await p.$$eval('#dueScopeF button, #dueTypeF button, #tabbar button',
      a => a.map(x => x.getBoundingClientRect())
            .filter(r => r.height < 44 && r.height > 0).length);
    ok(tag + ': nothing a gloved thumb must hit is under 44 px', small === 0, small + ' too small');
    const lines = await p.evaluate(() => {
      const r = [...document.querySelectorAll('#dueScopeF button')].map(b => Math.round(b.getBoundingClientRect().top));
      return new Set(r).size;
    });
    ok(tag + ': the scope pills stay on one line', lines === 1, lines + ' line(s)');
  }

  console.log(fails.length ? '\nFAILURES:\n  ' + [...new Set(fails)].join('\n  ')
                           : '\nall due-tab checks passed');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
