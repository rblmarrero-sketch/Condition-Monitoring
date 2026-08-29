/* A THOUSAND INSPECTIONS IS A THOUSAND ROWS, AND A THOUSAND ROWS IS NOT A LIST.

   Measured on this dashboard at a thousand records before any of this:

     the action register drew 1,001 rows — every finding on site, in one
       scroll, with the three that matter somewhere inside it
     the due list drew 160, capped at 500 in silence
     the fleet table drew one row per machine, which on the real register
       is 1,128

   The browser coped with all of it. The person did not, and a worklist nobody
   reads to the end is a worklist whose bottom half does not exist.

   Fifty at a time, with the whole of it one press away — because a reliability
   engineer exporting a register for a shutdown meeting needs every row, and
   must not have to discover that what they printed was page one.

   This suite also holds the geometry the specification asks for, at four
   window sizes, because the fix for "too many rows" must not be "make the page
   scroll sideways".

   Run: node tests/scale.cjs        (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };

const N = 1000;
const PAGE = 50;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });

  const t0 = Date.now();
  const built = await p.evaluate(n => {
    const A = (window.ASSETS || []).slice(0, 260).map(a => a.n);
    const recs = [];
    for (let i = 0; i < n; i++) {
      const u = A[i % A.length];
      recs.push({
        equip: u,
        date: '2026-' + String(1 + (i % 8)).padStart(2, '0') + '-' + String(1 + (i % 28)).padStart(2, '0'),
        type: ['MP', 'INSP', 'UC', 'TB', 'FC'][i % 5], cls: 'HT',
        by: ['R. Marrero', 'B. Ivanov', 'S. Volkov'][i % 3], smu: 5000 + i,
        items: [{ key: '4C', label: 'Left Rear Final Drive', grade: ['A', 'B', 'C', 'X'][i % 4],
                  defect: 'Ferrous debris — heavy', defectCode: 'DT14-03', cause: 'Gear wear',
                  action: 'SCH', actionLabel: 'Schedule repair', wo: 'N-' + (100 + i) }],
      });
    }
    CMDash.importRecords(recs);
    return RECS.length;
  }, N);
  const buildMs = Date.now() - t0;
  await p.waitForTimeout(1200);
  ok(built === N, `${N} inspections load`, String(built));
  /* Not a benchmark — a floor. Anything under a few seconds is a page that
     opened; the point of the number is that it is not thirty. */
  ok(buildMs < 8000, 'and the page builds in a workable time', buildMs + ' ms');

  const tab = async (k) => { await p.evaluate(x => showTab(x), k); await p.waitForTimeout(450); };
  const count = (k, sel) => p.evaluate(a => {
    const sec = document.getElementById('tab-' + a[0]);
    return sec ? sec.querySelectorAll(a[1]).length : -1; }, [k, sel]);
  const pagerText = (k) => p.evaluate(x => {
    const sec = document.getElementById('tab-' + x);
    const el = sec && sec.querySelector('.pager .muted');
    return el ? el.textContent.trim() : ''; }, k);

  console.log('\n1. NO WORKLIST DRAWS MORE THAN A PAGE');
  await tab('actions');
  {
    const rows = await count('actions', 'table.seltbl tbody tr');
    const txt = await pagerText('actions');
    ok(rows > 0 && rows <= PAGE, 'the action register draws at most one page', rows + ' row(s)');
    ok(/of\s*1[,.]?000/.test(txt), 'and says how many there are altogether', txt);
  }
  await tab('due');
  {
    const rows = await count('due', '#ddList tbody tr');
    const txt = await pagerText('due');
    ok(rows > 0 && rows <= PAGE, 'the due list draws at most one page', rows + ' row(s)');
    ok(/of\s*\d/.test(txt), 'and says how many are behind it', txt);
  }
  await tab('overview');
  {
    const rows = await count('overview', '#fleetTbl tbody tr');
    ok(rows > 0 && rows <= PAGE, 'the fleet table draws at most one page', rows + ' row(s)');
  }

  console.log('\n2. AND THE REST OF IT IS ONE PRESS AWAY');
  await tab('actions');
  {
    const before = await pagerText('actions');
    await p.evaluate(() => document.querySelector('#tab-actions [data-pg$=":next"]').click());
    await p.waitForTimeout(400);
    const after = await pagerText('actions');
    ok(before !== after && /^51/.test(after), 'Next moves to the next page',
       `${before} → ${after}`);
    await p.evaluate(() => document.querySelector('#tab-actions [data-pg$=":prev"]').click());
    await p.waitForTimeout(400);
    ok((await pagerText('actions')) === before, 'and Previous comes back', before);
  }
  {
    await p.evaluate(() => document.querySelector('#tab-actions [data-pg$=":all"]').click());
    await p.waitForTimeout(900);
    const rows = await count('actions', 'table.seltbl tbody tr');
    ok(rows === N, 'Show all really shows all of them', rows + ' row(s)');
    const back = await p.evaluate(() => !!document.querySelector('#tab-actions [data-pg$=":page"]'));
    ok(back, 'and offers the way back');
    await p.evaluate(() => document.querySelector('#tab-actions [data-pg$=":page"]').click());
    await p.waitForTimeout(600);
    ok((await count('actions', 'table.seltbl tbody tr')) <= PAGE, 'which works', 'back to a page');
  }

  console.log('\n3. SELECT-ALL NEVER REACHES PAST WHAT IS ON SCREEN');
  {
    const r = await p.evaluate(() => {
      const all = document.querySelector('#aAll'); if (!all) return { no: true };
      all.checked = true; all.dispatchEvent(new Event('change', { bubbles: true }));
      return { picked: aSel.size, onScreen: document.querySelectorAll('#tab-actions .asel').length };
    });
    ok(!r.no && r.picked === r.onScreen && r.picked <= PAGE,
       'ticking the header ticks this page and no more', `${r.picked} picked, ${r.onScreen} on screen`);
  }

  console.log('\n4. A PICKER WITH A THOUSAND MACHINES IN IT CAN BE SEARCHED');
  await tab('equipment');
  {
    const all = await p.evaluate(() => $('equipSel').options.length);
    ok(all > 100, 'the machine picker is long enough to need it', all + ' option(s)');
    /* The prefix comes from the fleet this fixture actually built, not from a
       unit number typed here — the first run searched for "TK1" against a
       register whose first 260 machines are all BL, BS and CR, matched nothing,
       and then asserted that the nothing matched. */
    const r = await p.evaluate(() => {
      const pre = String($('equipSel').options[0].value).slice(0, 2);
      $('equipSel').selectedIndex = 0;
      $('equipQ').value = pre;
      $('equipQ').dispatchEvent(new Event('input', { bubbles: true }));
      return { pre, n: $('equipSel').options.length,
               allMatch: [...$('equipSel').options].every(o => o.value.toUpperCase().indexOf(pre.toUpperCase()) >= 0),
               shown: $('equipShown').textContent };
    });
    ok(r.n > 0 && r.n < all, `typing "${r.pre}" narrows it`, r.n + ' of ' + all);
    ok(r.allMatch, 'to the machines that match');
    ok(/\d/.test(r.shown), 'and it says how many of how many, so a short list is not a short fleet',
       r.shown);
    const back = await p.evaluate(() => {
      $('equipQ').value = ''; $('equipQ').dispatchEvent(new Event('input', { bubbles: true }));
      return $('equipSel').options.length; });
    ok(back === all, 'clearing it brings the fleet back', back + ' option(s)');
  }
  {
    /* The machine on screen must never be filtered out from under the history
       that belongs to it. */
    const keep = await p.evaluate(() => {
      const first = $('equipSel').options[0].value;
      $('equipSel').value = first; renderHistory();
      $('equipQ').value = 'ZZZZ'; $('equipQ').dispatchEvent(new Event('input', { bubbles: true }));
      return { first, still: $('equipSel').value,
               present: [...$('equipSel').options].some(o => o.value === first) };
    });
    ok(keep.present && keep.still === keep.first,
       'and the machine already open is never filtered away', `${keep.first} → ${keep.still}`);
    await p.evaluate(() => { $('equipQ').value = ''; $('equipQ').dispatchEvent(new Event('input', { bubbles: true })); });
  }

  console.log('\n5. AND NOTHING SCROLLS SIDEWAYS TO ACHIEVE ANY OF IT');
  for (const [w, h] of [[1920, 1080], [1440, 900], [1024, 768], [390, 844]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(250);
    const bad = [];
    for (const k of ['overview', 'actions', 'due', 'equipment', 'sync']) {
      await tab(k);
      const over = await p.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 0) bad.push(`${k} +${over}px`);
    }
    ok(bad.length === 0, `${w}×${h}: no tab scrolls the page sideways`, bad.join(', '));
  }
  await p.setViewportSize({ width: 1440, height: 900 });

  ok(errs.length === 0, 'nothing threw throughout', errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED\n` : '\nall passed\n');
  process.exit(fails.length ? 1 : 0);
})();
