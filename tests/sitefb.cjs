/* CM_SITEFB_V1 (build 573): under /cm/ the office pages' filter bar is the SITE's standard bar, on ONE line, as on Assets Down
   and the Work Order Manager (KB UI_STANDARD 9.2, FB1_STD_V1; Rickie approved the mock-up 02.11, built 03.11 "Approve").
   Uses a copy of the site's own /site/std.js + std.css (SITE_STD_V1 v1.7, tests/site_std_copy/ - the real files are the site
   kit's, not this repository's) and the CM mock backend for data. Proves, on both office pages:
     · outside /cm/ the bar is the page's own (nothing changes on Firebase or GitHub Pages);
     · under /cm/: Period · Class · Category · Manufacturer · Model · More · search · link · count, on one line at 1440 and 1280,
       EN and RU; the page's own Type / Class / Grade / Status selects live in More (ids kept);
     · choosing a Class in the bar (the smallest one with inspections) narrows the inspections the page counts (filtered()), the chip says so, Clear filters undoes it;
     · Period presses the page's own #fRange;
     · on a phone: no sideways scroll, every bar control at least 44 px;
     · no page errors.
   Run: node tests/sitefb.cjs   (spawns tests/mock.cjs on 8488 for data) */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), MP = 8488;
let fails = 0; const ok = (n, c, d) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '   ' + d : ''}`); if (!c) fails++; };
const mock = spawn(process.execPath, [path.join(__dirname, 'mock.cjs'), String(MP)], { stdio: 'ignore' }); process.on('exit', () => { try { mock.kill(); } catch (e) {} });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/site/std.js' || u === '/site/std.css') { r.writeHead(200, { 'Content-Type': T[path.extname(u)] }); return r.end(fs.readFileSync(path.join(__dirname, 'site_std_copy', path.basename(u)))); }
  if (u.startsWith('/site/')) { r.writeHead(404); return r.end(); }
  if (u === '/exec' || u.startsWith('/exec')) {   /* the data, from the mock, same origin */
    const pr = http.request({ host: '127.0.0.1', port: MP, path: q.url, method: q.method, headers: q.headers }, x => { r.writeHead(x.statusCode, x.headers); x.pipe(r); });
    pr.on('error', () => { r.writeHead(502); r.end(); }); return q.pipe(pr); }
  let p = path.join(ROOT, u.startsWith('/cm/') ? u.slice(4) : u); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); });
});
(async () => {
  await new Promise(r => setTimeout(r, 1500)); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port, B = `http://127.0.0.1:${port}`;
  const b = await chromium.launch();
  const open = async (file, prefix, W, lang) => {
    const ctx = await b.newContext({ viewport: { width: W, height: W < 600 ? 844 : 900 }, isMobile: W < 600, hasTouch: W < 600 });
    await ctx.addInitScript(([u, l]) => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1');
      localStorage.setItem('cm_dash_window', '0'); localStorage.setItem('askpi_lang', l); localStorage.setItem('cm_dash_lang', l); }, [B + '/exec', lang]);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`${B}${prefix}/${file}/index.html`);
    await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 20, null, { timeout: 60000 });
    await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); showTab('actions', true); }); await p.waitForTimeout(800);
    return { p, ctx, errs };
  };
  for (const file of ['dashboard', 'dashboard-next']) {
    console.log(`\n== ${file}`);
    let { p, ctx, errs } = await open(file, '', 1440, 'en');
    ok('outside /cm/ the page keeps its own filter bar', await p.evaluate(() => !document.getElementById('cmFb')));
    await ctx.close();
    for (const [W, lang] of [[1440, 'en'], [1280, 'en'], [1440, 'ru'], [1280, 'ru']]) {
      ({ p, ctx, errs } = await open(file, '/cm', W, lang));
      const L = await p.evaluate(() => { const fb = document.getElementById('cmFb'); if (!fb) return null;
        const row = fb.querySelector('.std-fb-r'), vis = e => e.getClientRects().length && e.getBoundingClientRect().width > 0;
        const kids = [...row.querySelectorAll('.std-pk,input,button,.std-fb-n')].filter(vis);
        const tops = kids.map(k => Math.round(k.getBoundingClientRect().top + k.getBoundingClientRect().height / 2));
        return { n: kids.length, spread: Math.max(...tops) - Math.min(...tops), more: ['fType', 'fClass', 'fGrade', 'fStatus'].every(id => { const e = document.getElementById(id); return e && e.closest('#cmFbMore'); }),
          q: !!document.querySelector('#cmFb #fQ'), sw: document.documentElement.scrollWidth - innerWidth }; });
      ok(`${W} ${lang}: the site bar is on one line (${L && L.n} controls, centres within ${L && L.spread} px)`, L && L.n >= 8 && L.spread <= 4, JSON.stringify(L));
      if (W === 1440 && lang === 'en') {
        ok('  the page\'s own Type / Class / Grade / Status live in More, the search is the page\'s own #fQ', L && L.more && L.q);
        const before = await p.evaluate(() => filtered().length);
        await p.click('#cmFbPk_group'); await p.waitForTimeout(300);
        const picked = await p.evaluate(() => { const by = {}; (window.ASSETS || []).forEach(a => { by[a.n] = a.cls; });
          const ins = {}; RECS.filter(r => !r._void).forEach(r => { const c = by[r.equip]; if (c) ins[c] = (ins[c] || 0) + 1; });
          const ls = [...document.querySelectorAll('#stdPk .std-pkls label')].map(l => ({ l, v: l.querySelector('input').value })).filter(x => ins[x.v]).sort((a, b) => ins[a.v] - ins[b.v]);
          if (!ls.length) return null; ls[0].l.querySelector('input').click(); return ls[0].v; });
        await p.evaluate(() => { const d = document.querySelector('#stdPk [data-x="done"]'); if (d) d.click(); }); await p.waitForTimeout(700);
        const after = await p.evaluate(() => filtered().length), chips = await p.evaluate(() => document.getElementById('cmFbC').textContent);
        const want = await p.evaluate(v => { const by = {}; (window.ASSETS || []).forEach(a => { by[a.n] = a.cls; }); return RECS.filter(r => !r._void && by[r.equip] === v).length; }, picked);
        ok(`  a Class chosen in the bar (${picked}) narrows the inspections counted (${before} -> ${after})`, picked && after === want && after > 0 && (after < before || want === before), `the register's class gives ${want}`);
        ok('  and a chip names it', picked && chips.includes(picked), chips.slice(0, 80));
        await p.evaluate(() => { const c = [...document.querySelectorAll('#cmFbC button')].pop(); if (c) c.click(); }); await p.waitForTimeout(700);
        ok('  Clear filters gives every inspection back', await p.evaluate(() => filtered().length) === before);
        await p.click('#cmFbPerPk'); await p.waitForTimeout(300);
        const per = await p.evaluate(() => { const i = document.querySelector('#stdPk .std-pkls input'); if (!i) return null; i.click(); return i.value; });
        await p.waitForTimeout(500);
        ok('  Period presses the page\'s own #fRange', per && await p.evaluate(() => document.getElementById('fRange').value !== '0' && document.getElementById('fRange').value !== ''), per);
      }
      ok(`${W} ${lang}: no page errors`, !errs.length, errs.join(' | ')); await ctx.close();
    }
    ({ p, ctx, errs } = await open(file, '/cm', 390, 'en'));
    const M = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth - innerWidth,
      small: [...document.querySelectorAll('#cmFb .std-pk,#cmFb input,#cmFb button')].filter(e => e.getClientRects().length && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 44).map(e => e.id || e.textContent.trim()) }));
    ok('390: no sideways scroll', M.sw <= 0, String(M.sw));
    ok('390: every bar control at least 44 px', !M.small.length, M.small.join(','));
    ok('390: no page errors', !errs.length, errs.join(' | ')); await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
