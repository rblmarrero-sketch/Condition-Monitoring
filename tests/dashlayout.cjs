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
    if (file === 'dashboard') {
      /* the Grade mix legend: no entry runs under its neighbour (Russian ran "Ухудшенное 14" into the next) */
      await p.evaluate(() => showTab('overview', true)); await p.waitForTimeout(300);
      const lg = await p.evaluate(() => { const bs = [...document.querySelectorAll('#kpiMix .legend button')]; const out = [];
        for (const a of bs) for (const c of bs) { if (a === c) continue; const A = a.getBoundingClientRect(), C = c.getBoundingClientRect();
          if (Math.min(A.right, C.right) - Math.max(A.left, C.left) > 1 && Math.min(A.bottom, C.bottom) - Math.max(A.top, C.top) > 1) out.push(a.textContent.trim()); }
        bs.forEach(x => { if (x.scrollWidth > x.clientWidth + 1) out.push('spills: ' + x.textContent.trim()); });
        return out; });
      ok('the Grade mix legend entries do not run into each other', !lg.length, lg.slice(0, 4).join(' | '));
    }
    /* MEDIUM, batch A (audit 26.10 M3 M5 M7 M9 M12 M14 M16 M17) */
    const shownDup = await p.evaluate(async () => {
      const out = [];
      for (const [tab, box] of [['actions', '#actShown'], ['failure', '#failAffShown'], ['due', '#ddList'], ['wear', '#wearShown']]) {
        showTab(tab, true); await new Promise(r => setTimeout(r, 300));
        const el = document.querySelector(box); if (!el) continue;
        /* a count printed by the pager and again beside it */
        const txt = (el.closest('.section') || el.parentElement).innerText;
        const m = txt.match(/(\d[\d,\s]*)\s*(matching|совпад)/gi) || [];
        const sh = txt.match(/Showing \d+ of \d+|Показано \d+ из \d+/g) || [];
        if (m.length > 1 || (m.length && sh.length)) out.push(`${tab}: ${m.length} pager counts, ${sh.length} "showing"`);
        el.querySelectorAll('.pager').forEach(pg => { const w = el.getBoundingClientRect().width, pw = pg.getBoundingClientRect().width;
          if (el.classList.contains('shown') && pw < w - 40) out.push(`${tab}: pager ${Math.round(pw)} of ${Math.round(w)} px`); });
      }
      return out; });
    ok('M5 the pager owns the count: no second count beside it, and it spans its line', !shownDup.length, shownDup.join(' | '));
    const inset = await p.evaluate(async () => {
      const out = {};
      const pad = (el) => { const s = el.closest('.section'); const h = s.querySelector('.secthd h2, h2'); return [Math.round(el.getBoundingClientRect().left - s.getBoundingClientRect().left), h ? Math.round(h.getBoundingClientRect().left - s.getBoundingClientRect().left) : null]; };
      showTab('actions', true); await new Promise(r => setTimeout(r, 300));
      const bar = document.getElementById('actBar'); if (bar && bar.offsetHeight) out.actBar = pad(bar);
      showTab('overview', true); await new Promise(r => setTimeout(r, 300));
      const tc = document.getElementById('trendChart'); if (tc && tc.offsetHeight) out.trend = pad(tc);
      showTab('sync', true); await new Promise(r => setTimeout(r, 400));
      const wl = document.getElementById('wlPanel'); out.wlCard = !!wl && wl.classList.contains('section') && getComputedStyle(wl).borderTopStyle !== 'none';
      showTab('cmwo', true); await new Promise(r => setTimeout(r, 300));
      const cb = document.getElementById('cwPlanned'), lab = cb && cb.closest('label').querySelector('span');
      if (cb && lab) { const a = cb.getBoundingClientRect(), l = lab.getBoundingClientRect();
        out.chk = { beside: l.left >= a.right - 1 && Math.abs((l.top + l.bottom) / 2 - (a.top + a.bottom) / 2) < 6, upper: getComputedStyle(lab).textTransform }; }
      showTab('equipment', true); await new Promise(r => setTimeout(r, 300));
      const pick = document.querySelector('#tab-equipment > .controls:not(#filterBar):not(#fMoreRow)'), col = [...document.querySelectorAll('#tab-equipment .section')].find(e => e.getClientRects().length);
      if (pick && col) out.pick = [Math.round(pick.getBoundingClientRect().left - col.getBoundingClientRect().left), Math.round(pick.getBoundingClientRect().right - col.getBoundingClientRect().right)];
      showTab('lube', true); await new Promise(r => setTimeout(r, 300)); if (window.lubeGo) lubeGo('master'); await new Promise(r => setTimeout(r, 600));
      out.primaries = [...document.querySelectorAll('#tab-lube .btn.primary')].filter(e => e.getClientRects().length).map(e => e.textContent.trim());
      const hd = document.querySelector('header.app');
      if (hd) out.hdr = [...hd.querySelectorAll('#srcChip,#dataBtn')].filter(e => e.getClientRects().length).map(e => [e.id, Math.round(e.getBoundingClientRect().height), e.scrollHeight > e.clientHeight + 2 || (e.id === 'srcChip' ? false : e.getClientRects().length > 1)]);
      return out; });
    if (inset.actBar) ok('M7 the progress strip starts where the card title does', Math.abs(inset.actBar[0] - inset.actBar[1]) <= 1, JSON.stringify(inset.actBar));
    if (inset.trend) ok('M12 the trend chart sits inside the card padding', Math.abs(inset.trend[0] - inset.trend[1]) <= 1, JSON.stringify(inset.trend));
    ok('M14 Measurement limits is a card', inset.wlCard);
    if (inset.chk) ok('M16 a tick box has its label beside it, in sentence case', inset.chk.beside && inset.chk.upper === 'none', JSON.stringify(inset.chk));
    if (inset.pick) ok('M3 the Equipment History picker keeps the page column', Math.abs(inset.pick[0]) <= 1 && Math.abs(inset.pick[1]) <= 1, JSON.stringify(inset.pick));
    ok('M17 Lubrication has one primary button', inset.primaries.length <= 1, inset.primaries.join(' | '));
    if (file === 'dashboard-next' && inset.hdr) {
      const lh = await p.evaluate(() => [...document.querySelectorAll('header.app #srcText, header.app #dataBtn')].map(e => { const cs = getComputedStyle(e); return [e.id, Math.round(e.getBoundingClientRect().height / parseFloat(cs.lineHeight === 'normal' ? parseFloat(cs.fontSize) * 1.25 : cs.lineHeight))]; }));
      const wraps = await p.evaluate(() => [...document.querySelectorAll('header.app #srcText, header.app #dataBtn')].filter(e => { const r = document.createRange(); r.selectNodeContents(e); return r.getClientRects().length > 1 && new Set([...r.getClientRects()].map(x => Math.round(x.top))).size > 1; }).map(e => e.id));
      ok('M9 the source chip and Data sources stay on one line', !wraps.length, wraps.join(', '));
    }
    /* MEDIUM, batch B (audit 26.10 M1 M2 M4 M6 M13 M15) */
    const mb = await p.evaluate(async (tabs) => {
      const out = { split: [], gap: [], title: [], empty: [] };
      const vis = e => e.getClientRects().length && e.getBoundingClientRect().height > 0;
      const R = e => e.getBoundingClientRect();
      for (const t of tabs) {
        showTab(t, true); if (t === 'equipment') cmbSet('equipSel', RECS[0].equip);
        await new Promise(r => setTimeout(r, 350));
        const sec = [...document.querySelectorAll('section[id^="tab-"]')].find(x => !x.classList.contains('hidden'));
        const cards = [...sec.querySelectorAll('.section')].filter(vis).filter(c => !c.parentElement.closest('.section'));
        /* M1: half-width cards in one tab share one split */
        const half = new Set(cards.filter(c => R(c).width < R(sec).width * 0.8).map(c => Math.round(R(c).left) === Math.round(R(sec).left + parseFloat(getComputedStyle(sec).paddingLeft || 0)) ? 'L' + Math.round(R(c).right) : null).filter(Boolean));
        if (half.size > 1) out.split.push(`${t}: ${[...half].join(',')}`);
        /* M2: cards stacked with nothing between them are 16 px apart */
        cards.forEach(a => { let best = null, bc = null; cards.forEach(c => { if (c === a) return; const A = R(a), C = R(c);
          if (C.top >= A.bottom - 2 && Math.min(A.right, C.right) - Math.max(A.left, C.left) > 40 && (best === null || C.top - A.bottom < best)) { best = C.top - A.bottom; bc = c; } });
          if (best === null) return;
          /* something visible in between (a disclosure row, a note) is not a gap */
          const between = [...sec.querySelectorAll('details, .note, .notecard, .hint, p')].filter(vis).some(e => !e.closest('.section') && R(e).top >= R(a).bottom - 1 && R(e).bottom <= R(bc).top + 1);
          if (!between && Math.abs(best - 16) > 1) out.gap.push(`${t}: ${Math.round(best)}`); });
        /* M4: every card title is 15 px */
        cards.forEach(c => { const h = c.querySelector('.secthd h2, :scope > h2, .hhd h2'); if (h && vis(h) && Math.round(parseFloat(getComputedStyle(h).fontSize)) !== 15) out.title.push(`${t}: ${h.textContent.trim().slice(0, 20)} ${getComputedStyle(h).fontSize}`); });
        /* M13: an empty state is inset like the card title */
        sec.querySelectorAll('.section .empty').forEach(e => { if (!vis(e)) return; const c = e.closest('.section'), h = [...c.querySelectorAll('.secthd h2, :scope > h2, .hhd h2')].find(vis);
          const hx = h ? R(h).left + parseFloat(getComputedStyle(h).paddingLeft) - R(c).left : 0;
          if (h && Math.abs((R(e).left - R(c).left) - hx) > 2) out.empty.push(`${t}: ${Math.round(R(e).left - R(c).left)} vs ${Math.round(hx)}`); });
      }
      showTab('due', true); await new Promise(r => setTimeout(r, 300));
      const q = R(document.getElementById('ddQ')), ty = R(document.getElementById('ddType')), csv = R(document.getElementById('ddCsv')), seg = R(document.getElementById('ddSeg'));
      out.due = { row: Math.abs(q.bottom - ty.bottom) <= 2 && Math.abs((csv.top + csv.bottom) / 2 - (q.top + q.bottom) / 2) <= 24, below: q.top >= seg.bottom - 1, csvRight: csv.left > ty.right, qFirst: q.left < ty.left };
      showTab('actions', true); await new Promise(r => setTimeout(r, 300));
      const panel = document.getElementById('actProgressPanel'), bar = document.getElementById('actBar');
      out.prog = panel && vis(panel) ? /closed out|закрыт/i.test(bar.textContent) : false;
      return out; }, tabs);
    ok('M1 half-width cards in a tab share one column split', !mb.split.length, mb.split.join(' | '));
    ok('M2 cards stacked in a column are 16 px apart', !mb.gap.length, mb.gap.join(' | '));
    ok('M4 every card title is 15 px', !mb.title.length, mb.title.join(' | '));
    ok('M13 an empty state sits inside the card padding', !mb.empty.length, mb.empty.join(' | '));
    ok('M15 the schedule has one toolbar under its views: search, Round, then Export', mb.due.row && mb.due.below && mb.due.csvRight && mb.due.qFirst, JSON.stringify(mb.due));
    ok('M6 the closed-out figure is said once on Actions', !mb.prog);
    const fb = await p.evaluate(() => { const bar = document.getElementById('filterBar'); return !!bar && !!bar.querySelector('#fType'); });
    ok('the filter bar is #filterBar', fb);
    /* nothing chosen: each filter shows its own short name ("Class"), not "All clas…" cut short */
    const fn = await p.evaluate(() => ['fType','fClass','fGrade','fRange','fStatus'].map(id => { const s = document.getElementById(id); if (!s) return null;
      const lab = document.querySelector('label[for="' + id + '"]'); const o = s.options[0];
      return o && lab && o.textContent.trim() === lab.textContent.trim() ? null : id + ': ' + (o && o.textContent) + ' vs ' + (lab && lab.textContent); }).filter(Boolean));
    ok('an empty filter shows its short name', !fn.length, fn.join(' | '));
    await ctx.close();
  }
  ok('no page errors', !fails.some(f => /^PAGEERROR/.test(f)), fails.filter(f => /^PAGEERROR/.test(f)).join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
