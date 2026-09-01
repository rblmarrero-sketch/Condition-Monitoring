/* DOES THE INTERFACE SURVIVE THE FLEET IT IS FOR?

   Sixty-five inspections is a comfortable number and it proves nothing. The
   site runs 1,128 machines and the history grows every shift, so the layout
   somebody opens in a year is the one that matters. This loads a folder of that
   order — 1,000 inspections, ~1,128 units, ~10,000 findings, ~3,300
   photographs — and MEASURES rather than assumes.

   What it asserts is deliberately about behaviour a user feels:

     the page finishes and stays usable
     no table renders every row it knows about
     no long selector renders every unit as an option
     sorting and counting cover the whole filtered set, not the visible page
     nothing is rendered into a fixed-height box with its own scrollbar

   Numbers, not impressions: the DOM is counted, the clock is read.

   Run: node tests/scaleload.cjs       (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8099';
const fails = [];
const warns = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const note = (n, d) => console.log('  ....  ' + n + (d !== undefined ? '   ' + d : ''));
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());

(async () => {
  await reset('n=0');
  await reset('scale=1000,1128');

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem('cm_drive_url', u);
    localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0');
    localStorage.setItem('cm_swap_off', '1');
  }, BASE + '/exec');

  const t0 = Date.now();
  await p.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  /* Wait for the data to actually be in, not merely for the document. */
  await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 900,
                          null, { timeout: 180000 });
  const loaded = Date.now() - t0;
  await p.waitForTimeout(4000);

  console.log('\n1. IT LOADS A FLEET-SIZED FOLDER AT ALL');
  const size = await p.evaluate(() => ({
    recs: RECS.length,
    units: new Set(RECS.map(r => r.equip)).size,
    findings: RECS.reduce((t, r) => t + (r.items || []).length, 0),
    nodes: document.getElementsByTagName('*').length,
  }));
  console.log('   ' + JSON.stringify(size) + '  in ' + loaded + ' ms');
  ok('a thousand inspections are held', size.recs >= 1000, String(size.recs));
  ok('across the whole fleet', size.units >= 1000, String(size.units));
  ok('with ten thousand findings', size.findings >= 10000, String(size.findings));
  ok('and it finished in under two minutes', loaded < 120000, loaded + ' ms');
  note('DOM nodes after load', size.nodes);

  console.log('\n2. NO TABLE PUTS EVERY ROW IT KNOWS ABOUT ON THE PAGE');
  /* The property, measured per table: a table showing as many rows as the data
     has is one that will show ten thousand when the folder does. */
  const tables = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('table').forEach(t => {
      const rows = t.querySelectorAll('tbody tr').length;
      if (!rows) return;
      const id = t.id || (t.closest('[id]') || {}).id || '(unnamed)';
      out.push({ id, rows });
    });
    return out.sort((a, b) => b.rows - a.rows).slice(0, 8);
  });
  tables.forEach(t => note(t.id, t.rows + ' rows'));
  const worst = tables[0] || { rows: 0, id: '-' };
  ok('the largest table is bounded, not the size of the data',
     worst.rows <= 200, worst.id + ' renders ' + worst.rows + ' rows of ' + size.recs);

  console.log('\n3. NO SELECTOR RENDERS THE WHOLE FLEET AS OPTIONS');
  /* A native <select> holding 1,128 units is unusable with a glove on and slow
     to build; the spec asks for a searchable combobox instead.

     The threshold is "hundreds", deliberately, and not "more than the biggest
     list I happen to like". A fixed reference list — the 76 lubricant models,
     which is a property of the product catalogue and not of the fleet — is a
     usable dropdown and will be 76 long whether the folder holds sixty
     inspections or sixty thousand. What must never appear is a control built
     from the DATA: units, inspections, findings. Those are the ones that grow. */
  const OPT_MAX = 200;
  const sel = await p.evaluate(max => {
    const out = [];
    document.querySelectorAll('select').forEach(s => {
      if (s.options.length > max) out.push({ id: s.id || '(unnamed)', n: s.options.length });
    });
    return out;
  }, OPT_MAX);
  /* And separately: the two that ARE built from the fleet must be bounded, so
     passing this cannot come from the fleet simply being small today. */
  const fleetSel = await p.evaluate(() => ({
    equip: (document.getElementById('equipSel') || { options: [] }).options.length,
    target: (document.getElementById('rTarget') || { options: [] }).options.length,
    units: new Set(RECS.map(r => r.equip)).size }));
  note('equipSel / rTarget', fleetSel.equip + ' / ' + fleetSel.target
       + ' options for ' + fleetSel.units + ' units');
  ok('the fleet pickers are bounded well below the fleet size',
     fleetSel.equip < fleetSel.units / 4 && fleetSel.target < fleetSel.units / 4,
     fleetSel.equip + ' and ' + fleetSel.target + ' of ' + fleetSel.units);
  sel.forEach(s => note(s.id, s.n + ' options'));
  ok('no dropdown carries hundreds of entries', sel.length === 0,
     sel.map(s => s.id + ':' + s.n).join(' ') || 'none');

  console.log('\n4. NOTHING IS PENNED INTO ITS OWN SCROLLBAR');
  /* One page scrollbar. A card that scrolls internally hides its own content
     and cannot be printed, searched with the browser, or scanned at a glance. */
  const boxes = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const scrolls = (cs.overflowY === 'auto' || cs.overflowY === 'scroll');
      if (!scrolls) return;
      if (el.scrollHeight <= el.clientHeight + 4) return;      // not actually scrolling
      if (el === document.body || el === document.documentElement) return;
      out.push({ id: el.id || el.className || el.tagName,
                 h: Math.round(el.clientHeight), sh: Math.round(el.scrollHeight) });
    });
    return out.slice(0, 10);
  });
  boxes.forEach(x => note('scrolls internally: ' + x.id, x.h + ' of ' + x.sh + ' px'));
  ok('no panel has its own permanent vertical scrollbar', boxes.length === 0,
     boxes.length + ' found');

  console.log('\n5. THE PAGE DOES NOT SCROLL SIDEWAYS');
  const wide = await p.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth }));
  ok('no page-level horizontal scrollbar at 1366', wide.doc <= wide.win + 1,
     wide.doc + ' vs ' + wide.win);

  console.log('\n6. COUNTS COVER THE WHOLE SET, NOT THE VISIBLE PAGE');
  const counts = await p.evaluate(() => {
    const s = syncScan(), pop = mediaPopulations();
    return { expected: pop.mobExpected, received: pop.mobReceived,
             fleetExp: s.expected, recs: RECS.length };
  });
  console.log('   ' + JSON.stringify(counts));
  ok('the photograph total is of the whole folder',
     counts.expected > 3000, counts.expected + ' expected');
  ok('and reconciles', counts.received === counts.expected,
     counts.received + ' / ' + counts.expected);

  console.log('\n7. IT IS STILL RESPONSIVE AFTER LOADING');
  const t1 = Date.now();
  await p.evaluate(() => renderAll());
  const rerender = Date.now() - t1;
  ok('a full re-render is under three seconds', rerender < 3000, rerender + ' ms');

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
