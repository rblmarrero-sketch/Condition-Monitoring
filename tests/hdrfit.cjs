/* A full-width block button dropped into a flex row.

   .btn is display:block;width:100% — correct for a form, fatal in a header:
   it claims the whole row, and with flex-shrink off it refuses to give any of
   it back. The round header shipped that way; the machine name came down the
   screen a word per line with the orange button laid across it.

   Nothing throws, and no unit test can see it. The only way to catch the class
   of bug is to lay the page out and measure it — so this walks every flex row
   that holds a .btn and checks that nothing overlaps and nothing hangs off. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:' + (process.env.CMPORT || 8098) + '/mobile/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(400);

  /* Open everything that has a header of its own, so the rows below are laid
     out rather than display:none. */
  await p.evaluate(() => {
    const rec = { equip: 'DZ002', date: '2026-08-11', type: 'UC', cls: 'DZ',
      by: 'Хасенов', sup: 'V. Petrov', smu: '27317',
      items: [{ key: 'IDLER.L-OUT', mm: 22 }, { key: 'ROLLER.L1', mm: 245 }] };
    teamMerge([rec], true);
  });
  await p.waitForTimeout(500);
  await p.evaluate(() => openRound('DZ002|2026-08-11|UC'));
  await p.waitForTimeout(500);

  const bad = await p.evaluate(() => {
    const out = [], seen = new Set();
    document.querySelectorAll('.btn').forEach(btn => {
      const row = btn.parentElement;
      if (!row || getComputedStyle(row).display.indexOf('flex') < 0) return;
      const rb = row.getBoundingClientRect();
      if (!rb.width || !rb.height) return;                       // not laid out
      if (getComputedStyle(row).flexDirection.indexOf('column') === 0) return;
      const id = row.id || row.className || 'row';
      const kids = [...row.children].filter(e => { const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0; });
      const rects = kids.map(e => e.getBoundingClientRect());
      for (let i = 1; i < rects.length; i++)
        if (rects[i].left < rects[i - 1].right - 0.5)
          out.push({ row: id, what: 'overlap', a: kids[i - 1].id || kids[i - 1].tagName,
                     b: kids[i].id || kids[i].tagName,
                     by: Math.round(rects[i - 1].right - rects[i].left) });
      rects.forEach((r, i) => {
        if (r.right > rb.right + 0.5 || r.left < rb.left - 0.5)
          out.push({ row: id, what: 'overflows', a: kids[i].id || kids[i].tagName,
                     by: Math.round(Math.max(r.right - rb.right, rb.left - r.left)) });
      });
      seen.add(id);
    });
    return { bad: out, rows: [...seen] };
  });
  note('flex rows holding a .btn', bad.rows.join(' | ') || 'none');
  ok('a header button never claims the whole row', bad.rows.length > 0, bad.rows.length + ' rows checked');
  ok('  nothing in those rows overlaps or hangs off the edge',
     bad.bad.length === 0, JSON.stringify(bad.bad).slice(0, 200));

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
