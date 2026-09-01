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
  /* MEASURED ON THE SET, NOT ON THE PAGE.

     This counted rendered rows. That worked while the table drew every
     measurement it had — and stopped meaning anything the moment the table was
     paginated, because a filter that cuts 300 rows to 120 still draws 50
     either side of it. The test would then report "nothing happened" about a
     filter that had worked perfectly.

     The set size is what the tile changes and what the reader is told; the page
     size is a rendering decision. So both are checked, separately: the total
     moved, and the page stayed bounded while it did. */
  const moved = await p.evaluate(async () => {
    const total = () => {
      const m = String((document.getElementById('wearShown') || {}).textContent || '')
        .match(/(\d[\d\s,\u00a0]*)\D+(\d[\d\s,\u00a0]*)/);
      return m ? Number(m[1].replace(/\D/g, '')) : null;
    };
    const before = total(), beforeRows = document.querySelectorAll('#wearTbl tbody tr').length;
    const b2 = document.querySelector('[data-wgo="act"]'); if (!b2) return null;
    b2.click(); await new Promise(r => setTimeout(r, 250));
    return { before, after: total(),
             beforeRows, afterRows: document.querySelectorAll('#wearTbl tbody tr').length };
  });
  ok('and pressing one filters the register beneath it',
     !!moved && moved.before !== null && moved.after !== null && moved.after < moved.before,
     JSON.stringify(moved));
  ok('  while the page itself stays bounded',
     !!moved && moved.afterRows <= 50 && moved.beforeRows <= 50,
     moved ? moved.beforeRows + ' → ' + moved.afterRows + ' rows drawn' : '');

  console.log('\n  and nothing looks pressable that is not');
  await p.evaluate(() => showTab('failure'));
  await p.waitForTimeout(400);
  const par = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('.prow')];
    const ptr = r => getComputedStyle(r).cursor === 'pointer';
    return { n: rows.length,
             honest: rows.filter(r => ptr(r) && r.dataset.drill).length,
             lying:  rows.filter(r => ptr(r) && !r.dataset.drill).length };
  });
  ok('the Pareto has rows to press', par.n > 0, par.n + ' rows');
  ok('and only the ones that drill follow the cursor', par.lying === 0,
    par.lying + ' promise a click they cannot honour');

  console.log('\n  a headline answers "compared to what?"');
  await p.evaluate(() => showTab('overview'));
  await p.waitForTimeout(350);
  const head = await p.evaluate(() => {
    const t2 = [...document.querySelectorAll('#kpis > *')].map(x => (x.innerText || '').replace(/\s+/g, ' ').trim());
    return t2;
  });
  /* The compliance figure moved off the headline strip and onto the panel
     that explains it (the strip is for what needs doing today; compliance is
     a score). What must hold is that it is ON the page, above the fold, with
     its denominator — not which slot it occupies. */
  const compl = await p.evaluate(() => {
    const el = document.getElementById('covComp');
    return { txt: (el ? el.innerText : '').replace(/\s+/g, ' ').trim(),
             top: el ? Math.round(el.getBoundingClientRect().top) : -1, h: innerHeight };
  }).catch(() => ({ txt: '', top: -1, h: 0 }));
  ok('on-time compliance is on the page, above the fold',
     /compliance/i.test(compl.txt) && compl.top >= 0 && compl.top < compl.h,
     compl.txt.slice(0, 46) + ' @' + compl.top);
  ok('and it carries its denominator', /\d+\s*of\s*\d+/i.test(compl.txt), compl.txt.slice(0, 60));
  ok('and the headline strip is about today: it leads with the critical machines',
     /critical/i.test(head[0] || ''), (head[0] || '').slice(0, 46));

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

  console.log('\n  one fact is encoded once');
  await p.evaluate(() => showTab('overview'));
  await p.waitForTimeout(350);
  /* The bar IS the percentage, so they belong in one cell. They used to be in
     two, with the fraction in a third reading of the same fact — one number
     spread over two columns in three encodings, which the eye has to
     reconcile before it can move on. */
  const covCell = await p.evaluate(() => {
    const row = document.querySelector('#covTbl tbody tr');
    if (!row) return null;
    const bar = row.querySelector('.cbar');
    const cell = bar && bar.closest('td');
    const txt = row.innerText;
    return { cells: row.children.length,
             pcts: (txt.match(/\d+%/g) || []).length,
             hasFraction: /\d+\s*\/\s*\d+/.test(txt),
             /* is the percentage in the SAME cell as the bar it describes? */
             together: !!cell && /\d+%/.test(cell.innerText) };
  });
  ok('a coverage row states its percentage once', covCell && covCell.pcts === 1,
    covCell && covCell.pcts + ' percentages');
  ok('the bar and the percentage it IS share one cell', covCell && covCell.together,
    covCell && (covCell.together ? 'one cell' : 'split across cells'));
  ok('and the fraction sits with them as the audit trail', covCell && covCell.hasFraction);

  console.log('\n  a strip of peers is not a summary');
  await p.evaluate(() => showTab('lube'));
  await p.waitForTimeout(600);
  const lube = await p.evaluate(() => ({
    strips: document.querySelectorAll('#tab-lube .kpis').length,
    lcTiles: document.querySelectorAll('#lcKpis > *').length,
    parts: document.querySelectorAll('.lcpart').length,
    pressable: document.querySelectorAll('.lcpart[data-lcgo]').length,
    /* The funnel is a scorecard TABLE now — one row per metric, with its
       coverage bar, its count against its denominator, where the number came
       from and how much is left. Same seven stages, same denominators, 1,100px
       of stacked blocks down to 390. What this line has always checked is that
       the tab leads with the stages and not with a strip of tiles. */
    funnelRows: document.querySelectorAll('#lubeProg tbody tr').length,
  }));
  ok('the lubrication tab leads with a funnel, not a tile strip',
    lube.funnelRows >= 6, lube.funnelRows + ' stages');
  ok('and no strip restates what the funnel says', lube.strips === 1, lube.strips + ' strips');
  ok('the disagreements total into one headline', lube.lcTiles <= 3, lube.lcTiles + ' tiles');
  ok('with their breakdown under it, still pressable',
    lube.parts === 4 && lube.pressable === lube.parts,
    lube.pressable + ' of ' + lube.parts);

  console.log('\n  a status colour used as text can be read as text');
  const inks = await p.evaluate(() => {
    const lum = c => { const m = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    const cr = (a, b) => { const x = lum(a), y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const probe = document.createElement('div');
    probe.className = 'kpi';
    probe.style.cssText = 'position:absolute;left:-9999px';
    probe.innerHTML = '<span class="v">0</span>';
    document.body.appendChild(probe);
    const bg = getComputedStyle(probe).backgroundColor;
    const out = {};
    ['good', 'warn', 'bad'].forEach(cls => {
      probe.className = 'kpi ' + cls;
      out[cls] = +cr(getComputedStyle(probe.querySelector('.v')).color, bg).toFixed(2);
    });
    probe.remove();
    return out;
  });
  ok('every state colour reads as a number, light', Object.values(inks).every(v => v >= 4.5),
    JSON.stringify(inks));
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await p.waitForTimeout(250);
  const inksD = await p.evaluate(() => {
    const lum = c => { const m = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    const cr = (a, b) => { const x = lum(a), y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const probe = document.createElement('div');
    probe.className = 'kpi'; probe.style.cssText = 'position:absolute;left:-9999px';
    probe.innerHTML = '<span class="v">0</span>';
    document.body.appendChild(probe);
    const bg = getComputedStyle(probe).backgroundColor;
    const out = {};
    ['good', 'warn', 'bad'].forEach(cls => { probe.className = 'kpi ' + cls;
      out[cls] = +cr(getComputedStyle(probe.querySelector('.v')).color, bg).toFixed(2); });
    probe.remove();
    return out;
  });
  ok('and in dark, where three of the four used to fail',
    Object.values(inksD).every(v => v >= 4.5), JSON.stringify(inksD));
  await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await p.waitForTimeout(200);

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
