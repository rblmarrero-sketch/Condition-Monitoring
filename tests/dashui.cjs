/* THE DASHBOARD AS AN INSTRUMENT, NOT A DOCUMENT.

   Measured on a realistic month — 265 rounds across 48 machines, every round
   type — because a dashboard judged on sixteen records of one type is not
   judged at all. That is what this fixture is.

   What it holds shut, all of it found by measuring rather than by looking:

   NO SURFACE MAY RUN AWAY. The action register rendered 44,308px tall on this
   fixture and the wear register 26,843px. Nobody scrolls forty-four screens;
   they stop reading, and a page nobody finishes is decoration. Long lists get
   a viewport of their own with the header pinned — the VIEW is bounded, never
   the data, and the count says what is on screen out of what exists.

   A TILE THAT NAMES A SUBSET IS THE WAY INTO IT. Fifteen of twenty-nine were
   inert. A number you cannot press is a number you have to go and reproduce by
   hand in a dropdown, and one dead tile teaches the reader that none of them
   work — which costs the ones that do.

   THE OFFICE READS A ROUND THE WAY THE SHEET PRINTS IT. Left against right on
   one row, from report-core's own pairing rule.

   A HEADLINE ANSWERS "COMPARED TO WHAT?". On-time compliance carries its
   denominator; the tray round's coverage no longer divides by a pool that was
   always empty.

   Run: node tests/dashui.cjs   (serves the repo itself on 8093) */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs');
const B = 'http://127.0.0.1:' + (process.env.CMPORT || '8093');
const FLEET = JSON.parse(fs.readFileSync(__dirname + '/fleet-fixture.json', 'utf8'));
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const TABS = ['overview', 'failure', 'wear', 'actions', 'due', 'equipment', 'lube', 'reports'];

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  await p.evaluate(f => {
    window.CMDash.setDriveRecords(f);
    const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
  }, FLEET);
  await p.waitForTimeout(1200);

  console.log('\n  the fixture is a real month, not a toy');
  const seed = await p.evaluate(() => {
    const r = window.CMDash.allRecs().filter(x => !x._void);
    return { n: r.length, units: new Set(r.map(x => x.equip)).size,
             types: [...new Set(r.map(x => x.type))].sort() };
  });
  ok('enough rounds to make the page work for a living', seed.n > 200, seed.n + ' rounds');
  ok('across a fleet, not a machine', seed.units > 30, seed.units + ' units');
  ok('every round type is represented', seed.types.length === 8, seed.types.join(','));

  console.log('\n  no surface runs away');
  const tall = [];
  for (const tb of TABS) {
    await p.evaluate(x => showTab(x), tb);
    await p.waitForTimeout(320);
    const h = await p.evaluate(() => document.body.scrollHeight);
    if (h > 8000) tall.push(tb + ' ' + h + 'px');
  }
  ok('no tab is more than eight screens tall', tall.length === 0, tall.join(' | ') || 'all under');
  const bounded = await p.evaluate(() => {
    const out = {};
    ['wear', 'actions'].forEach(tb => { showTab(tb);
      const sec = document.querySelector('section:not(.hidden)');
      out[tb] = [...sec.querySelectorAll('.scrollbox')].length;
    });
    return out;
  });
  ok('the two longest registers each sit in a viewport of their own',
    bounded.wear > 0 && bounded.actions > 0, JSON.stringify(bounded));
  await p.evaluate(() => showTab('wear'));
  await p.waitForTimeout(400);
  const sticky = await p.evaluate(() => {
    const th = document.querySelector('#wearTbl thead th');
    return th ? getComputedStyle(th).position : 'none';
  });
  ok('and its header stays put while the rows move', sticky === 'sticky', sticky);
  const shown = await p.evaluate(() => (document.getElementById('wearShown') || {}).innerText || '');
  ok('and it says what is on screen out of what exists', /\d/.test(shown), shown.trim());

  console.log('\n  a tile that names a subset is the way into it');
  const tiles = {};
  for (const tb of ['overview', 'wear', 'actions', 'due']) {
    await p.evaluate(x => showTab(x), tb);
    await p.waitForTimeout(300);
    tiles[tb] = await p.evaluate(() => {
      const sec = document.querySelector('section:not(.hidden)');
      const all = [...sec.querySelectorAll('.kpis > *')];
      return { n: all.length, live: all.filter(x => x.tagName === 'BUTTON').length };
    });
  }
  ok('the wear tiles all lead somewhere', tiles.wear.live === tiles.wear.n,
    tiles.wear.live + ' of ' + tiles.wear.n);
  ok('the overview leads with pressable headlines', tiles.overview.live >= 3,
    tiles.overview.live + ' of ' + tiles.overview.n);
  /* and pressing one actually changes the list under it */
  await p.evaluate(() => showTab('wear'));
  await p.waitForTimeout(300);
  const moved = await p.evaluate(async () => {
    const before = document.querySelectorAll('#wearTbl tbody tr').length;
    const b2 = document.querySelector('[data-wgo="act"]'); if (!b2) return null;
    b2.click(); await new Promise(r => setTimeout(r, 250));
    return { before, after: document.querySelectorAll('#wearTbl tbody tr').length };
  });
  ok('and pressing one filters the register beneath it',
    moved && moved.after !== moved.before, JSON.stringify(moved));

  console.log('\n  a headline answers "compared to what?"');
  await p.evaluate(() => showTab('overview'));
  await p.waitForTimeout(350);
  const head = await p.evaluate(() => {
    const t2 = [...document.querySelectorAll('#kpis > *')].map(x => (x.innerText || '').replace(/\s+/g, ' ').trim());
    return t2;
  });
  ok('on-time compliance leads the page', /compliance/i.test(head[0] || ''), (head[0] || '').slice(0, 46));
  ok('and it carries its denominator', /\d+\s*of\s*\d+/i.test(head[0] || ''), (head[0] || '').slice(0, 60));

  console.log('\n  the tray round is counted against a pool that exists');
  const cov = await p.evaluate(() => {
    const A = window.ASSETS || [];
    return { elig: A.filter(elig('TB')).length, truth: A.filter(a => bodyModelOf(a.n)).length };
  });
  ok('a dump body round has a denominator', cov.elig > 0, cov.elig + ' machines');
  ok('and it is the right one', cov.elig === cov.truth, cov.elig + ' vs ' + cov.truth);

  console.log('\n  the office reads a round the way the sheet prints it');
  await p.evaluate(() => {
    const r = (window.CMDash.allRecs() || []).find(x => x.type === 'UC');
    document.getElementById('equipSel').value = r.equip;
    showTab('equipment'); renderHistory();
  });
  await p.waitForTimeout(600);
  const paired = await p.evaluate(() => {
    const tb = document.querySelector('table.paired');
    if (!tb) return null;
    const hd = [...tb.querySelectorAll('thead th')].map(x => x.textContent.trim());
    const first = tb.querySelector('tbody tr');
    return { heads: hd,
             cells: first ? first.children.length : 0,
             name: first ? first.children[0].innerText.split('\n')[0].trim() : '',
             deltas: document.querySelectorAll('.sidegap').length };
  });
  ok('the undercarriage table pairs the sides', !!paired && paired.heads.length === 3,
    paired ? paired.heads.join(' | ') : 'no paired table');
  ok('one row carries both readings', !!paired && paired.cells === 7, paired && paired.cells);
  ok('the part is named once, without a side stuck to it',
    !!paired && !/—\s*(Left|Right|Слева|Справа)\s*$/.test(paired.name), paired && paired.name);
  ok('and where the two sides disagree, the row says so', !!paired && paired.deltas > 0,
    paired && paired.deltas + ' flagged');

  console.log('\n  it holds together at every width, in both themes');
  for (const w of [1600, 1280, 1024]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.evaluate(() => showTab('overview'));
    await p.waitForTimeout(350);
    const side = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    ok('nothing scrolls sideways at ' + w + 'px', !side);
  }
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await p.waitForTimeout(300);
  const dk = await p.evaluate(() => {
    const c = getComputedStyle(document.body);
    return { bg: c.backgroundColor, ink: c.color };
  });
  ok('dark mode paints its own ground', dk.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(dk));

  ok('no page errors anywhere in that', errs.length === 0, errs.slice(0, 2).join(' | '));

  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
