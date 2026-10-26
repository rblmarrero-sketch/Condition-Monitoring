/* THE OFFICE PAGES HOLD THEIR SHAPE FROM TAB TO TAB (audit 26.10 D1-D6).

   Measured on the real pages, both dashboards, English and Russian, at 1366
   and 1920:
     D1  the page title is at the same height on every tab. The shared filter
         bar sat above it on dashboard/, shown on some tabs and put away on
         others, so the title moved between y 52 and 139; a tall control in the
         header (LubeLink, Definitions) moved it a few px more.
     D2  in a strip of tiles every number starts at the same height. A label
         that wrapped to a second line pushed its number 13-34 px down. Labels
         take two lines' room; one that needs more is said in full on hover;
         and no label is cut mid-word (on dashboard-next the tag beside it
         squeezed it to 42 px).
     D3  cards in one row end at the same height (458 px apart beside the
         Reports form).
   Also: the filter bar is found by #filterBar on both pages.

   Run: node tests/dashlayout.cjs   (spawns tests/mock.cjs on 8481) */
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(require('./pw.cjs'));

const PORT = 8481, BASE = `http://127.0.0.1:${PORT}`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const srv = spawn(process.execPath, [path.join(__dirname, 'mock.cjs'), String(PORT)], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

const MEASURE = () => {
  const vis = e => e && e.getClientRects().length && e.getBoundingClientRect().height > 0 && !e.closest('.hidden');
  const r = e => e.getBoundingClientRect();
  const sec = [...document.querySelectorAll('section[id^="tab-"]')].find(s => !s.classList.contains('hidden'));
  const h1 = sec && [...sec.querySelectorAll('h1')].find(vis);
  const tiles = [...sec.querySelectorAll('.kpi,.tile')].filter(vis).filter(k => k.querySelector('.v'));
  const rows = {};
  tiles.forEach(k => { const t = Math.round(r(k).top); (rows[t] = rows[t] || []).push(Math.round(r(k.querySelector('.v')).top - r(k).top)); });
  const kspread = Math.max(0, ...Object.values(rows).filter(a => a.length > 1).map(a => Math.max(...a) - Math.min(...a)));
  const labels = tiles.map(k => k.querySelector('.k')).filter(vis);
  /* squeezed: a label beside a tag has under 60 % of its tile's inner width */
  const inner = k => { const t = k.closest('.kpi,.tile'), cs = getComputedStyle(t); return t.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); };
  const narrow = labels.filter(k => k.parentElement.querySelector(':scope > .tag') && r(k).width < 0.6 * inner(k)).map(k => `${k.textContent.trim()} ${Math.round(r(k).width)}/${Math.round(inner(k))}px`);
  /* a single word wider than its label box is cut with no ellipsis */
  const cutWord = labels.filter(k => k.scrollWidth > k.clientWidth + 1).map(k => k.textContent.trim());
  const clamped = labels.filter(k => k.scrollHeight > k.clientHeight + 1);
  const cgap = Math.max(0, ...[...sec.querySelectorAll('.grid12')].filter(vis).map(g => {
    const rws = {};
    [...g.children].filter(vis).forEach(c => {
      const cards = [c, ...c.querySelectorAll('.section')].filter(x => vis(x) && x.classList.contains('section'));
      if (!cards.length) return;
      (rws[Math.round(r(c).top)] = rws[Math.round(r(c).top)] || []).push(Math.round(Math.max(...cards.map(x => r(x).bottom))));
    });
    return Math.max(0, ...Object.values(rws).filter(a => a.length > 1).map(a => Math.max(...a) - Math.min(...a)));
  }));
  return { y: h1 ? Math.round(r(h1).top + scrollY) : null, kspread, narrow, cutWord, nClamped: clamped.length, cgap };
};

(async () => {
  await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch();
  for (const file of ['dashboard', 'dashboard-next']) for (const lang of ['en', 'ru']) for (const W of [1366, 1920]) {
    console.log(`\n${file} ${lang} ${W}`);
    const ctx = await b.newContext({ viewport: { width: W, height: 768 } });
    await ctx.addInitScript(([u, l]) => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1');
      localStorage.setItem('cm_dash_lang', l); localStorage.setItem('cm_dash_window', '0'); }, [BASE + '/exec', lang]);
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push(`PAGEERROR ${file} ${e.message}`));
    await p.goto(`${BASE}/${file}/index.html`);
    await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 20, null, { timeout: 60000 });
    await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); });
    const tabs = await p.evaluate(() => [...document.querySelectorAll('#tabs button[data-tab]')].map(x => x.dataset.tab));
    const ys = {}, kbad = [], cbad = [], narrow = [], cut = [];
    let clampedTab = null;
    for (const t of tabs) {
      await p.evaluate(t => showTab(t, true), t); await p.waitForTimeout(350);
      const m = await p.evaluate(MEASURE);
      ys[t] = m.y;
      if (m.kspread > 1) kbad.push(`${t} ±${m.kspread}`);
      if (m.cgap > 1) cbad.push(`${t} ±${m.cgap}`);
      narrow.push(...m.narrow.map(x => `${t}: ${x}`)); cut.push(...m.cutWord.map(x => `${t}: ${x}`));
      if (m.nClamped && !clampedTab) clampedTab = t;
    }
    const yv = Object.values(ys).filter(v => v != null);
    ok('D1 the title is at one height on every tab', yv.length === tabs.length && Math.max(...yv) - Math.min(...yv) <= 1, JSON.stringify(ys));
    ok('D2 in each strip of tiles the numbers start at one height', !kbad.length, kbad.join(', '));
    ok('D2 no tile label is squeezed beside its tag', !narrow.length, narrow.join(' | '));
    ok('D2 no tile label has a word cut off', !cut.length, cut.join(' | '));
    ok('D3 cards in one row end at one height', !cbad.length, cbad.join(', '));
    if (clampedTab) {
      await p.evaluate(t => showTab(t, true), clampedTab); await p.waitForTimeout(300);
      const h = await p.evaluate(() => { const k = [...document.querySelectorAll('section:not(.hidden) .kpi .k, section:not(.hidden) .tile .k')].find(x => x.getClientRects().length && x.scrollHeight > x.clientHeight + 1);
        if (!k) return null; k.scrollIntoView({ block: 'center' }); const b = k.getBoundingClientRect(); return { x: b.left + 5, y: b.top + 5, text: k.textContent.trim() }; });
      if (h) { await p.mouse.move(h.x, h.y); await p.waitForTimeout(100);
        const tt = await p.evaluate(() => { const k = [...document.querySelectorAll('section:not(.hidden) .kpi .k, section:not(.hidden) .tile .k')].find(x => x.title); return k ? k.title : ''; });
        ok('D2 a label cut to two lines is said in full on hover', tt === h.text, `"${tt}"`); }
    }
    const rr = await p.evaluate(() => { showTab('reports');
      const rec = document.getElementById('rRecentHint').closest('.section'), form = document.querySelector('#tab-reports .grid12 > .section');
      const a = rec.getBoundingClientRect(), f = form.getBoundingClientRect(), g = rec.parentElement.getBoundingClientRect();
      return { below: a.top >= f.bottom - 1, full: Math.abs(a.width - g.width) <= 1 }; });
    ok('Recent reports is a full row under the Reports form', rr.below && rr.full, JSON.stringify(rr));
    if (lang === 'en' && W === 1366) {
      /* D4: one 16 px gap between the cards of the Overview, none overlapping */
      await p.evaluate(() => showTab('overview', true)); await p.waitForTimeout(350);
      const g = await p.evaluate(() => { const r = e => e.getBoundingClientRect();
        const cs = [...document.querySelectorAll('#tab-overview .section')].filter(x => x.getClientRects().length && !x.parentElement.closest('.section'));
        const gaps = [];
        for (const a of cs) for (const c of cs) { if (a === c) continue; const A = r(a), C = r(c);
          const sideBySide = Math.min(A.bottom, C.bottom) - Math.max(A.top, C.top) > 4, above = Math.min(A.right, C.right) - Math.max(A.left, C.left) > 4;
          if (above && C.top >= A.top + 4 && !cs.some(m => m !== a && m !== c && r(m).top > A.top + 4 && r(m).top < C.top - 4 && Math.min(r(m).right, A.right) - Math.max(r(m).left, A.left) > 4)) gaps.push(Math.round(C.top - A.bottom));
          if (sideBySide && C.left > A.left + 4 && !above) gaps.push(Math.round(C.left - A.right)); }
        return [...new Set(gaps)]; });
      ok('D4 every gap between Overview cards is 16 px, none overlapping', g.length && g.every(x => Math.abs(x - 16) <= 1), JSON.stringify(g));
      /* D6: one grade drawing — a round dot and "n – Name", coloured text only for 5 */
      const d6 = await p.evaluate(async () => {
        const out = { pills: [], squares: 0, n: 0, crit: [], plain: [] };
        const names = [1,2,3,4,5].map(n => SEV[n].l);
        for (const t of ['overview', 'failure', 'actions', 'equipment']) { showTab(t, true); await new Promise(r => setTimeout(r, 300));
          const sec = document.getElementById('tab-' + t);
          sec.querySelectorAll('.pill').forEach(x => { if (names.includes(x.textContent.trim())) out.pills.push(t + ': ' + x.textContent.trim()); });
          sec.querySelectorAll('.sevcell').forEach(x => { if (!x.getClientRects().length) return; out.n++;
            const i = x.querySelector('i'); if (!i || parseFloat(getComputedStyle(i).borderTopLeftRadius) < 3.5) out.squares++;
            const five = x.textContent.trim() === names[4], col = getComputedStyle(x).color, ink = getComputedStyle(x.parentElement).color;
            if (five && col === ink && !x.classList.contains('crit')) out.crit.push(t);
            if (!five && x.classList.contains('crit')) out.plain.push(t); }); }
        return out; });
      ok('D6 no grade is drawn as a filled pill', !d6.pills.length, d6.pills.slice(0, 4).join(' | '));
      ok('D6 every grade is a round dot and its name', d6.n > 0 && !d6.squares, `${d6.n} drawn, ${d6.squares} square`);
      ok('D6 only a 5 is coloured text', !d6.crit.length && !d6.plain.length, JSON.stringify([d6.crit, d6.plain]));
      /* D5: a read-only lube master box reads as text, not as a box to type in */
      await p.evaluate(() => { showTab('lube', true); lubeGo('master'); }); await p.waitForTimeout(400);
      await p.evaluate(() => { const m = document.querySelector('#lmMaster .lmx-mrow'); if (m) m.click(); }); await p.waitForTimeout(400);
      const d5 = await p.evaluate(() => { const x = [...document.querySelectorAll('#lmMaster .lmx-in:disabled')].find(e => e.getClientRects().length && e.tagName === 'INPUT');
        if (!x) return null; const c = getComputedStyle(x); return { bg: c.backgroundColor, border: c.borderTopColor, op: c.opacity }; });
      ok('D5 a read-only lube master box has no box around it', d5 && /rgba\(0, 0, 0, 0\)|transparent/.test(d5.bg) && /rgba\(0, 0, 0, 0\)|transparent/.test(d5.border) && d5.op === '1', JSON.stringify(d5));
    }
    const fb = await p.evaluate(() => { const bar = document.getElementById('filterBar'); return !!bar && !!bar.querySelector('#fType'); });
    ok('the filter bar is #filterBar', fb);
    await ctx.close();
  }
  ok('no page errors', !fails.some(f => /^PAGEERROR/.test(f)), fails.filter(f => /^PAGEERROR/.test(f)).join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
