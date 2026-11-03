/* CM_TPL_V1 (build 573): ONE TEMPLATE ON ALL ELEVEN TABS OF BOTH OFFICE PAGES.
   Rickie 03.11 09:05 site: "Its messy. Every tabs is different"; mock-up approved 09:37 site. Measured per tab, both pages,
   English and Russian, desk (1440) and phone (390):
     header   title, then an (i) tip carrying the tab's purpose sentence (said in the page's language, opened by hover, focus or tap,
              closed by Escape), then the tab's own actions and Definitions at the right end - Definitions never inside a card
     controls on a desk every text box and list in a tab is 32 px; on a phone the 44 px floor stands
     tables   every cell has 8 px above and below (the Plan vs Actual fortnight grid, card tables, the lube master's own fixed tables and the Overview compliance bars excepted)
     switches Lubrication's sub-tabs are the segmented switch (filled, rounded), not underlined tabs
     tiles    a plain count (.kpi.info) is not coloured; a tile with a colour of its own by id (dashboard-next's grade tiles) keeps it
   Run: node tests/cmtpl.cjs   (spawns tests/mock.cjs on 8487) */
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(require('./pw.cjs'));
const PORT = 8487, BASE = `http://127.0.0.1:${PORT}`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const srv = spawn(process.execPath, [path.join(__dirname, 'mock.cjs'), String(PORT)], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye);
const MEASURE = () => {
  const vis = e => e && e.getClientRects().length && e.getBoundingClientRect().height > 0;
  const sec = [...document.querySelectorAll('section[id^="tab-"]')].find(s => !s.classList.contains('hidden'));
  const hd = sec.querySelector(':scope>.pagehd'), tip = hd && hd.querySelector('.cmTip');
  const defs = [...sec.querySelectorAll('details.defs')];
  const src = hd ? [...hd.querySelectorAll('.pgt>.pgsub[data-i18n]')] : [];
  const ctl = [...sec.querySelectorAll('input[type=text],input[type=search],input[type=date],input:not([type]),select')].filter(vis).filter(x => !x.classList.contains('cwcf') && !x.closest('.ascards') && !x.closest('#cmFb') && !x.closest('table[class*="lmx-"]'));
  const tds = [...sec.querySelectorAll('table.grid:not(.pawk):not(.ascards):not([class*="lmx-"]):not(#covTbl)>tbody>tr>td:not([colspan])')].filter(vis).filter(x => !x.querySelector(':scope>label>input[type=checkbox]') && !x.querySelector(':scope>.btn,:scope>.minibtn,:scope>button')).slice(0, 40);
  return {
    tpl: !!(hd && hd.classList.contains('cmtpl')),
    tip: tip ? { aria: tip.getAttribute('aria-label') || '', src: src.map(s => s.textContent.trim()).join(' '), hidden: src.every(s => s.hidden) } : null,
    nsrc: src.length,
    defs: defs.map(d => !!d.closest('.cmHdR')), ndefs: defs.length,
    hdR: !!(hd && hd.querySelector('.cmHdR')) && (() => { const R = hd.querySelector('.cmHdR'), h1 = hd.querySelector('h1'); return R.getBoundingClientRect().left > h1.getBoundingClientRect().right; })(),
    ctlH: [...new Set(ctl.map(x => Math.round(x.getBoundingClientRect().height)))],
    tdPad: [...new Set(tds.map(x => getComputedStyle(x).paddingTop))],
    info: [...sec.querySelectorAll('.kpi.info:not([id])')].filter(vis).map(k => getComputedStyle(k).getPropertyValue('--kc').trim() === getComputedStyle(k).getPropertyValue('--border').trim() ? 'border' : getComputedStyle(k).getPropertyValue('--kc').trim()),
  };
};
(async () => {
  await new Promise(r => setTimeout(r, 1500));
  const b = await chromium.launch();
  for (const file of ['dashboard', 'dashboard-next']) for (const lang of ['en', 'ru']) for (const W of [1440, 390]) {
    console.log(`\n${file} ${lang} ${W}`);
    const ctx = await b.newContext({ viewport: { width: W, height: W < 600 ? 844 : 900 }, isMobile: W < 600, hasTouch: W < 600 });
    await ctx.addInitScript(([u, l]) => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1');
      localStorage.setItem('cm_dash_lang', l); localStorage.setItem('cm_dash_window', '0'); }, [BASE + '/exec', lang]);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`${BASE}/${file}/index.html`);
    await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 20, null, { timeout: 60000 });
    await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); });
    const tabs = await p.evaluate(() => [...document.querySelectorAll('#tabs button[data-tab]')].map(x => x.dataset.tab));
    const bad = { tpl: [], tip: [], tipLang: [], defs: [], hdR: [], ctl: [], td: [], info: [] }; let ntips = 0, ntd = 0;
    for (const t of tabs) {
      await p.evaluate(t => showTab(t, true), t); await p.waitForTimeout(400);
      const m = await p.evaluate(MEASURE);
      if (!m.tpl) bad.tpl.push(t);
      if (m.nsrc) { ntips++;
        if (!m.tip || !m.tip.aria || m.tip.aria !== m.tip.src || !m.tip.hidden) bad.tip.push(t + ' ' + JSON.stringify(m.tip));
        else if (lang === 'ru' && !/[А-Яа-яЁё]/.test(m.tip.aria)) bad.tipLang.push(t); }
      if (m.ndefs > 1 || m.defs.some(x => !x)) bad.defs.push(`${t} ${m.ndefs}`);
      if (W > 600 && (m.ndefs || m.tip) && !m.hdR && m.ndefs) bad.hdR.push(t);
      if (W > 600 && m.ctlH.some(h => h !== 32)) bad.ctl.push(`${t} ${m.ctlH.join('/')}`);
      if (W < 600 && m.ctlH.some(h => h < 44)) bad.ctl.push(`${t} ${m.ctlH.join('/')}`);
      if (m.tdPad.length) { ntd++; if (m.tdPad.some(x => x !== '8px')) bad.td.push(`${t} ${m.tdPad.join('/')}`); }
      if (m.info.some(c => !/border/.test(c))) bad.info.push(t);
    }
    ok(`every one of the ${tabs.length} tabs wears the template`, tabs.length === 11 && !bad.tpl.length, bad.tpl.join(','));
    ok(`the purpose sentence is an (i) tip beside the title (${ntips} tabs), said in full to a screen reader`, ntips >= 6 && !bad.tip.length, bad.tip.join(' | '));
    if (lang === 'ru') ok('  and in Russian', !bad.tipLang.length, bad.tipLang.join(','));
    ok('Definitions: at most one per tab, always in the page header', !bad.defs.length, bad.defs.join(','));
    if (W > 600) ok('  at the right end of the header', !bad.hdR.length, bad.hdR.join(','));
    ok(W > 600 ? 'every text box and list is 32 px high' : 'on a phone no text box or list is under 44 px', !bad.ctl.length, bad.ctl.join(' | '));
    ok(`every table cell has 8 px above and below - its checkbox, button and empty-state cells aside (${ntd} tabs with tables)`, (W < 600 || ntd >= 5) && !bad.td.length, bad.td.join(' | '));
    ok('a plain count is not coloured', !bad.info.length, bad.info.join(','));
    if (lang === 'en' && W > 600) {
      await p.evaluate(() => showTab('actions', true)); await p.waitForTimeout(300);
      const tipBox = () => p.evaluate(() => { const b = document.querySelector('#tab-actions .cmTip'), x = b.querySelector('.tipbox'); return { open: getComputedStyle(x).display !== 'none', txt: x.textContent }; });
      await p.hover('#tab-actions .cmTip'); await p.waitForTimeout(150);
      const h = await tipBox(); ok('the tip opens on hover with the sentence', h.open && /Every finding/.test(h.txt), h.txt.slice(0, 40));
      await p.keyboard.press('Escape'); await p.mouse.move(5, 800); await p.waitForTimeout(150);
      ok('  and Escape closes it', !(await tipBox()).open);
      await p.evaluate(() => showTab('lube', true)); await p.waitForTimeout(300);
      const st = await p.evaluate(() => { const s = document.querySelector('#tab-lube .subtabs'), on = s && s.querySelector('button[aria-selected="true"]');
        return s ? { r: getComputedStyle(s).borderRadius, bg: on ? getComputedStyle(on).backgroundColor : '', bb: on ? getComputedStyle(on).borderBottomWidth : '' } : null; });
      ok('Lubrication sub-tabs are the segmented switch (rounded, the chosen one filled)', st && st.r === '10px' && st.bg !== 'rgba(0, 0, 0, 0)' && st.bb === '0px', JSON.stringify(st));
    }
    if (lang === 'en' && W < 600) {
      await p.evaluate(() => showTab('due', true)); await p.waitForTimeout(300);
      const bx = await p.evaluate(() => { const b = document.querySelector('#tab-due .cmTip').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; });
      ok('on a phone the (i) is a 44 px target', bx[0] >= 44 && bx[1] >= 44, bx.join('x'));
      await p.tap('#tab-due .cmTip'); await p.waitForTimeout(150);
      const o = await p.evaluate(() => { const x = document.querySelector('#tab-due .cmTip .tipbox'), r = x.getBoundingClientRect(); return { open: getComputedStyle(x).display !== 'none', l: Math.round(r.left), r: Math.round(r.right), w: innerWidth }; });
      ok('  a tap opens it, inside the screen', o.open && o.l >= 0 && o.r <= o.w, JSON.stringify(o));
      const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      ok('  and the page does not scroll sideways', sw <= 0, String(sw));
    }
    ok('no page errors', !errs.length, errs.join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
