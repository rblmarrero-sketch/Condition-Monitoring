/* CM_PLAIN2_V1 (Rickie 04.11.2026, the wording scan: "keep it simple", notes into (i), no cut text you
   cannot read). On BOTH office pages, every tab, English and Russian:
   - no explanation longer than 90 characters is printed in a card (warnings, data lines and the LubeLink
     hand-over line excepted); each one sits in an (i) beside its heading and is still in the page text;
   - pointing at a cut cell gives its full text;
   - no card line under a number is longer than 50 characters;
   - no page error, and the layer itself recorded none.
   Run: node tests/plainwords.cjs [port]   (needs tests/ed-srv.cjs on the port) */
const { chromium } = require(require('./pw.cjs'));
const BUNDLED = require('./bundled.cjs');
const PORT = Number(process.argv[2] || 8093);
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
(async () => {
  const b = await chromium.launch();
  for (const path of ['dashboard/index.html', 'dashboard-next/index.html']) for (const lng of ['en', 'ru']) {
    const p = await b.newPage({ viewport: { width: 1366, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(l => { localStorage.setItem('cm_dash_lang', l); localStorage.setItem('askpi_lang', l); }, lng);
    await p.goto(`http://127.0.0.1:${PORT}/${path}`); await p.waitForTimeout(1600);
    await p.evaluate(BUNDLED + '()'); await p.waitForTimeout(300);
    const tag = path.split('/')[0] + ' ' + lng;
    const tabs = await p.evaluate(() => [...document.querySelectorAll('[data-tab]')].map(x => x.dataset.tab).filter((v, i, a) => v && a.indexOf(v) === i));
    let long = [], lines = [], tips = 0, folded = 0;
    for (const tb of tabs) {
      await p.evaluate(t => { try { showTab(t); } catch (e) {} }, tb); await p.waitForTimeout(500);
      const r = await p.evaluate(() => { const sec = [...document.querySelectorAll('main section')].find(s => !s.classList.contains('hidden') && s.offsetParent); if (!sec) return null;
        const vis = e => e.offsetParent && !e.closest('.cmp2fold') && getComputedStyle(e).visibility !== 'hidden';
        const KEEP = '#lubeHoNote,#dueStrayNote,.warn,.bad,.note,table,dialog,.drawer,#dsPrev,[data-keep]';
        return { long: [...sec.querySelectorAll('.section p.sub,.section div.sub,.section .hint,.section p.lede')].filter(e => vis(e) && !e.closest(KEEP) && !e.matches(KEEP) && !e.querySelector('a,button,input,select,b,strong') && e.textContent.replace(/\s+/g, ' ').trim().length >= 90).map(e => e.textContent.trim().slice(0, 70)),
          lines: [...sec.querySelectorAll('.kpi .s')].filter(vis).map(e => e.textContent.trim()).filter(s => s.length > 50),
          tips: sec.querySelectorAll('.cmp2tip:not([hidden])').length, folded: [...sec.querySelectorAll('.cmp2fold')].filter(e => e.textContent.trim().length).length }; });
      if (!r) continue;
      long = long.concat(r.long.map(s => tb + ': ' + s)); lines = lines.concat(r.lines.map(s => tb + ': ' + s)); tips += r.tips; folded += r.folded;
    }
    console.log('\n' + tag + ` (${tabs.length} tabs)`);
    ok(!long.length, 'no long explanation printed in a card', long.slice(0, 3).join(' | '));
    ok(tips > 0 && folded >= tips, 'the explanations sit in (i) tips and are still in the page text', `${tips} tips, ${folded} folded`);
    ok(!lines.length, 'no card line over 50 characters', lines.slice(0, 3).join(' | '));
    await p.evaluate(() => showTab('cmwo')); await p.waitForTimeout(400);
    const hov = await p.evaluate(() => { const td = [...document.querySelectorAll('#cwList table.cwtbl tbody td')].find(e => e.scrollWidth > e.clientWidth + 1 && !e.title);
      if (!td) return 'none'; td.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return td.title ? 'ok' : 'no title'; });
    ok(hov !== 'no title', 'pointing at a cut cell gives its full text', hov);
    const le = await p.evaluate(() => window.cmPlain2Err || '');
    ok(!errs.length && !le, 'no page error', (errs.concat(le ? [le] : [])).join(' | '));
    await p.close();
  }
  await b.close(); console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed'); process.exit(fails.length ? 1 : 0);
})();
