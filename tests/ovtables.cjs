/* THE OVERVIEW'S TWO TABLES, ONE LINE A ROW, ON BOTH OFFICE PAGES.

   Build 530. "Equipment requiring attention" stacked three and four lines in
   a row — the round, date and inspector under the defect, the status under
   the action, the overdue tag under the grade, an inspector's name wrapping —
   and two columns the 1500px rule hides (Inspected, Findings) left their
   filter boxes behind, squeezed to "Fi" at the right edge. The count under
   the table was said twice. Compliance wrapped a round's description over
   three lines; on dashboard-next six equal 67px columns cut every round name
   to five letters and ran the coverage bar into its own fraction. Asked the
   rendered page:

     1. every attention row is one height, nothing in a cell wraps, and a cell
        that is cut carries its whole text in a tooltip
     2. one filter box per visible column, none of them squeezed: at 1366 the
        two narrow-screen columns and their boxes are gone, at 1600 both are
        back and every <col> lands on its own column
     3. one count line, carrying "View all" — no second strip
     4. Compliance on dashboard/ is one line a round, the interval beside the
        name; on dashboard-next nothing in a row runs past its cell
     5. English and Russian, no page errors

   Run: node tests/ovtables.cjs        (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const BASE = process.env.CM_BASE || 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());

/* How many lines of text a cell's content takes: the distinct tops of its
   text, bucketed so an avatar beside a name is one line, not two. */
const fleetRead = () => {
  const t = document.getElementById('fleetTbl');
  const vis = el => el.offsetParent !== null && getComputedStyle(el).display !== 'none';
  const lines = td => {
    const tops = [];
    const w = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
    let n; const r = document.createRange();
    while ((n = w.nextNode())) { if (!n.textContent.trim()) continue; r.selectNodeContents(n);
      [...r.getClientRects()].forEach(c => { if (c.width > 0 && !tops.some(x => Math.abs(x - c.top) < 8)) tops.push(c.top); }); }
    return tops.length;
  };
  const rows = [...t.querySelectorAll('tbody tr')];
  const cells = rows.flatMap(tr => [...tr.children].filter(vis));
  const cut = cells.filter(td => td.scrollWidth > td.clientWidth + 1);
  const titled = td => !!(td.title || [...td.querySelectorAll('[title]')].some(e => e.title.trim()));
  const head = [...t.querySelectorAll('thead tr:first-child th')].filter(vis);
  const boxes = [...t.querySelectorAll('thead tr:nth-child(2) th')].filter(vis);
  const cols = t.querySelectorAll('colgroup col').length;
  const wrap = t.parentElement;
  return {
    layout: getComputedStyle(t).tableLayout, rows: rows.length,
    h: [...new Set(rows.map(tr => Math.round(tr.getBoundingClientRect().height)))],
    multi: cells.filter(td => lines(td) > 1).map(td => td.textContent.trim().slice(0, 30)),
    cut: cut.length, cutUntitled: cut.filter(td => !titled(td)).map(td => td.textContent.trim().slice(0, 30)),
    head: head.length, boxes: boxes.length, cols,
    narrowBoxes: boxes.filter(th => th.getBoundingClientRect().width < 40).length,
    keys: head.map(th => th.dataset.sort),
    colW: [...t.querySelectorAll('colgroup col')].map(c => c.style.width || 'auto'),
    headW: head.map(th => Math.round(th.getBoundingClientRect().width)),
    scroll: wrap.scrollWidth > wrap.clientWidth + 1,
    shown: (document.getElementById('fleetShown') || {}).textContent || '',
    allBtnInShown: !!document.querySelector('#fleetShown #fleetAllBtn'),
    strip: !!wrap.querySelector(':scope > .pager'),
  };
};
const covRead = () => {
  const t = document.getElementById('covTbl');
  const d = t.closest('details'); if (d) d.open = true;
  const rows = [...t.querySelectorAll('tbody tr')];
  /* Something visibly runs past its cell: it reaches beyond the cell's right
     edge and nothing between it and the cell clips it. */
  const clipped = (e, td) => { for (let x = e.parentElement; x && x !== td.parentElement; x = x.parentElement)
    if (getComputedStyle(x).overflowX !== 'visible') return true; return false; };
  const over = rows.flatMap(tr => [...tr.children]).filter(td => [...td.querySelectorAll('*')].some(e => {
    const a = e.getBoundingClientRect(), b = td.getBoundingClientRect();
    return a.width > 0 && a.right > b.right + 1 && !clipped(e, td); }));
  const lead = rows.map(tr => tr.children[0]);
  return { rows: rows.length, layout: getComputedStyle(t).tableLayout,
    h: [...new Set(rows.map(tr => Math.round(tr.getBoundingClientRect().height)))],
    nameTitled: lead.every(td => (td.title || td.closest('tr').title || '').length > 2),
    metaInline: lead.every(td => { const b = td.querySelector('b'), m = td.querySelector('.ovmeta');
      return !m || Math.abs(b.getBoundingClientRect().top - m.getBoundingClientRect().top) < 6; }),
    over: over.length };
};

(async () => {
  await reset('n=60');
  const b = await chromium.launch();
  for (const file of ['dashboard/index.html', 'dashboard-next/index.html']) {
    const nx = file.startsWith('dashboard-next');
    for (const lang of ['en', 'ru']) {
      const tag = file.split('/')[0] + ' ' + lang;
      const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
      await ctx.addInitScript(([u, l]) => {
        localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', '');
        localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1');
        localStorage.setItem('cm_dash_lang', l);
      }, [BASE + '/exec', lang]);
      const p = await ctx.newPage();
      const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(BASE + '/' + file, { waitUntil: 'load' });
      await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 20, null, { timeout: 60000 });
      await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); showTab('overview', true); renderAll(); });
      await p.waitForTimeout(800);

      console.log(`\n${tag} @1366: 1. ONE LINE A ROW, AND A CUT CELL SAYS THE REST ON HOVER`);
      let f = await p.evaluate(fleetRead);
      ok(`${tag}: the attention table has fixed columns`, f.layout === 'fixed', f.layout);
      ok(`${tag}: ${f.rows} rows, all one height`, f.rows >= 5 && Math.max(...f.h) - Math.min(...f.h) <= 2, f.h.join(','));
      ok(`${tag}: nothing in a cell takes a second line`, f.multi.length === 0, f.multi.slice(0, 4).join(' | '));
      ok(`${tag}: ${f.cut} cut cells, every one with its text in a tooltip`, f.cutUntitled.length === 0, f.cutUntitled.slice(0, 4).join(' | '));
      ok(`${tag}: and the table never scrolls sideways`, !f.scroll);

      console.log(`\n${tag} @1366: 2. ONE FILTER BOX PER VISIBLE COLUMN`);
      ok(`${tag}: ${f.head} headings, ${f.boxes} filter boxes, ${f.cols} <col>`, f.head === f.boxes && f.cols === f.head, `${f.head}/${f.boxes}/${f.cols}`);
      ok(`${tag}: no filter box squeezed under 40px`, f.narrowBoxes === 0, String(f.narrowBoxes));
      if (!nx) ok(`${tag}: Inspected and Findings are off at 1366`, !f.keys.includes('date') && !f.keys.includes('find'), f.keys.join(','));

      console.log(`\n${tag} @1366: 3. ONE COUNT LINE`);
      ok(`${tag}: the count is said once, with "View all" on its line`, f.allBtnInShown && !f.strip, f.shown.replace(/\s+/g, ' ').trim());
      ok(`${tag}: and it names how many machines there are`, /\b\d+\b.*\b\d+\b/.test(f.shown));

      console.log(`\n${tag}: 4. COMPLIANCE`);
      const c = await p.evaluate(covRead);
      ok(`${tag}: ${c.rows} rounds in fixed columns`, c.rows >= 2 && c.layout === 'fixed', c.layout);
      ok(`${tag}: nothing in a row runs past its cell`, c.over === 0, String(c.over));
      ok(`${tag}: every round's name is in a tooltip`, c.nameTitled);
      if (!nx) {
        ok(`${tag}: one line a round — all rows one height`, c.h.length === 1, c.h.join(','));
        ok(`${tag}: the interval sits beside the name`, c.metaInline);
      }

      if (!nx) {
        console.log(`\n${tag} @1600: 2b. THE TWO WIDE-SCREEN COLUMNS COME BACK, EACH ON ITS OWN <col>`);
        await p.setViewportSize({ width: 1600, height: 900 });
        await p.waitForTimeout(500);
        f = await p.evaluate(fleetRead);
        ok(`${tag}: Inspected and Findings are on at 1600`, f.keys.includes('date') && f.keys.includes('find'), f.keys.join(','));
        ok(`${tag}: ${f.head} headings, ${f.boxes} boxes, ${f.cols} <col>`, f.head === f.boxes && f.cols === f.head, `${f.head}/${f.boxes}/${f.cols}`);
        const iDate = f.keys.indexOf('date');
        ok(`${tag}: the Inspected heading is the width its <col> says`, Math.abs(f.headW[iDate] - parseInt(f.colW[iDate], 10)) <= 2, f.headW[iDate] + ' vs ' + f.colW[iDate]);
        ok(`${tag}: rows still one height`, Math.max(...f.h) - Math.min(...f.h) <= 2, f.h.join(','));
        await p.setViewportSize({ width: 1366, height: 900 });
        await p.waitForTimeout(500);
        f = await p.evaluate(fleetRead);
        ok(`${tag}: back at 1366 the columns and boxes go again`, f.head === f.boxes && f.cols === f.head && !f.keys.includes('date'), `${f.head}/${f.boxes}/${f.cols}`);
      }

      console.log(`\n${tag}: 5. NO PAGE ERRORS`);
      ok(`${tag}: no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
      await ctx.close();
    }
  }
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
