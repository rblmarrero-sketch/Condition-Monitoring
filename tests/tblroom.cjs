/* CM_TBLROOM_V1 (build 636, Rickie 16.11.2026 "still seeing old ... columns still old, no freeze, horizontal").
   Every table drew its own columns to fit its box exactly and cut its text with an ellipsis, so no table was ever wider than
   its box, and the table standard (build 630) never slid or froze anything. On a desk a long table now gets columns wide
   enough for their own text first; one wider than its box slides in it, with the row's name frozen and the held slider.
   Served under /cm/ with the site kit, both office pages. Run: node tests/tblroom.cjs   (spawns tests/mock.cjs on 8493) */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), MP = 8493, A = path.join(__dirname, 'site_std_copy');
let fails = 0; const ok = (n, c, d) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '   ' + d : ''}`); if (!c) fails++; };
const mock = spawn(process.execPath, [path.join(__dirname, 'mock.cjs'), String(MP)], { stdio: 'ignore' }); process.on('exit', () => { try { mock.kill(); } catch (e) {} });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/site/std.js' || u === '/site/std.css') { r.writeHead(200, { 'Content-Type': T[path.extname(u)] }); return r.end(fs.readFileSync(path.join(A, path.basename(u)))); }
  if (u.startsWith('/site/')) { r.writeHead(404); return r.end(); }
  if (u.startsWith('/exec')) { const pr = http.request({ host: '127.0.0.1', port: MP, path: q.url, method: q.method, headers: q.headers }, x => { r.writeHead(x.statusCode, x.headers); x.pipe(r); }); pr.on('error', () => { r.writeHead(502); r.end(); }); return q.pipe(pr); }
  let p = path.join(ROOT, u.startsWith('/cm/') ? u.slice(4) : u); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });
(async () => {
  await new Promise(r => setTimeout(r, 1500)); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch();
  async function open(file, W, H) {
    const ctx = await b.newContext({ viewport: { width: W, height: H || 900 } });
    await ctx.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1'); localStorage.setItem('cm_dash_window', '0'); localStorage.setItem('cm_dash_lang', 'en'); }, B + '/exec');
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`${B}/cm/${file}/index.html`);
    await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 20 && document.documentElement.classList.contains('cmStd'), null, { timeout: 60000 });
    await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); });
    return { ctx, p, errs };
  }
  const cut = (p, sel) => p.evaluate(s => { const t = document.querySelector(s); let n = 0, m = 0;
    t.querySelectorAll('tbody td').forEach(td => { if (!td.offsetParent || td.querySelector('.cw2')) return; m++;
      const el = td.firstElementChild && getComputedStyle(td.firstElementChild).textOverflow === 'ellipsis' ? td.firstElementChild : td;
      if (el.scrollWidth > el.clientWidth + 1) n++; }); return { n, m }; }, sel);
  for (const file of ['dashboard-next', 'dashboard']) {
    console.log(`\n== ${file} @1440`);
    const { ctx, p, errs } = await open(file, 1440);
    await p.evaluate(() => { showTab('cmwo', true); window.scrollTo(0, 0); }); await p.waitForTimeout(1500);
    const D = await p.evaluate(() => { const t = document.querySelector('table.cwtbl'), box = t.closest('.tblwrap') || t.parentElement;
      const hd = [...t.tHead.rows].find(r => !r.querySelector('th.cwfh'));
      const ai = [...hd.cells].findIndex(th => /^asset/i.test(th.textContent.trim()));
      const cell = () => t.tBodies[0].rows[0].cells[ai].getBoundingClientRect().left;
      const x0 = cell(); box.scrollLeft = 400; const x1 = cell(); box.scrollLeft = 0;
      return { room: t.dataset.cmroom === '1', slides: box.scrollWidth > box.clientWidth + 1, frozen: Math.abs(x1 - x0) < 2, edge: !!t.querySelector('.cmfzE'), w: t.scrollWidth, box: box.clientWidth }; });
    ok('Defects raised gets columns wide enough for its text and slides in its box', D.room && D.slides, JSON.stringify(D));
    ok('  the asset column stays where it is while the table slides, with its edge', D.frozen && D.edge, JSON.stringify(D));
    const C = await cut(p, 'table.cwtbl');
    ok('  no one-line cell is cut with an ellipsis any more', C.n === 0 && C.m > 50, JSON.stringify(C));
    await p.evaluate(() => { const t = document.querySelector('table.cwtbl'); t.tBodies[0].rows[8].scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(500);
    const S = await p.evaluate(() => { const h = document.querySelector('.cmhs'); return { on: !!(h && h.classList.contains('on')) }; });
    ok('  the held slider is at the bottom of the window while the table is on screen', S.on, JSON.stringify(S));
    /* a redraw (a filter) keeps the room */
    await p.evaluate(() => { const i = document.querySelector('#cwStatus'); if (i) { i.value = ''; i.dispatchEvent(new Event('change')); } if (window.renderCmWoTab) renderCmWoTab(); }); await p.waitForTimeout(1200);
    const R = await p.evaluate(() => { const t = document.querySelector('table.cwtbl'), box = t.closest('.tblwrap') || t.parentElement; return { room: t.dataset.cmroom === '1', slides: box.scrollWidth > box.clientWidth + 1 }; });
    ok('  and keeps it after the table is drawn again', R.room && R.slides, JSON.stringify(R));
    /* Equipment History's visit tables share one set of columns on purpose */
    await p.evaluate(() => { showTab('equipment', true); }); await p.waitForTimeout(800);
    const H = await p.evaluate(() => [...document.querySelectorAll('table.histtbl')].filter(t => t.offsetParent).map(t => !!t.dataset.cmroom));
    ok('Equipment History\'s visit tables keep their shared columns', H.every(x => !x), JSON.stringify(H));
    ok('no page errors', !errs.length && !(await p.evaluate(() => window.cmTblRoomErr)), errs.join(' | ') + (await p.evaluate(() => window.cmTblRoomErr || '')));
    await ctx.close();
  }
  console.log('\n== a phone keeps its cards');
  { const { ctx, p } = await open('dashboard-next', 390, 844);
    await p.evaluate(() => showTab('cmwo', true)); await p.waitForTimeout(1500);
    const P = await p.evaluate(() => { const t = document.querySelector('table.cwtbl'); return { cards: t.classList.contains('ascards'), room: !!t.dataset.cmroom }; });
    ok('Defects raised on a phone is cards, not widened', P.cards && !P.room, JSON.stringify(P));
    await ctx.close(); }
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
