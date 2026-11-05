/* CM_FLUID_V1 (build 591, Rickie 05.11.2026 12:20 "still feels different from other pages ... adjust to any monitor or laptop").
   Under /cm/ both office pages are ONE column, as the site standard (KB UI_STANDARD 19): the band's title, the search row, the
   filter bar, every card and the footer start on one left edge and end on one right edge, the gutter is 24 px (20 under 1280)
   right of the side menu and at the screen edge, at 1280 / 1536 / 1920 / 2560, EN and RU, on Overview and Defects raised.
   Defects raised: equipment type, priority and responsible are whole on two lines (not "DOZER, T...", "Zhomart Khas..."),
   the columns grow with the screen, the stage chips share the row with Export CSV. No sideways scroll, no page errors.
   Uses the site's std.js / std.css copy (tests/site_std_copy) and the mock backend, like tests/sitefb.cjs.
   Run: node tests/cmfluid.cjs   (spawns tests/mock.cjs on 8489) */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), MP = 8489;
let fails = 0; const ok = (n, c, d) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '   ' + d : ''}`); if (!c) fails++; };
const mock = spawn(process.execPath, [path.join(__dirname, 'mock.cjs'), String(MP)], { stdio: 'ignore' }); process.on('exit', () => { try { mock.kill(); } catch (e) {} });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/site/std.js' || u === '/site/std.css') { r.writeHead(200, { 'Content-Type': T[path.extname(u)] }); return r.end(fs.readFileSync(path.join(__dirname, 'site_std_copy', path.basename(u)))); }
  if (u.startsWith('/site/')) { r.writeHead(404); return r.end(); }
  if (u.startsWith('/exec')) { const pr = http.request({ host: '127.0.0.1', port: MP, path: q.url, method: q.method, headers: q.headers }, x => { r.writeHead(x.statusCode, x.headers); x.pipe(r); });
    pr.on('error', () => { r.writeHead(502); r.end(); }); return q.pipe(pr); }
  let p = path.join(ROOT, u.startsWith('/cm/') ? u.slice(4) : u); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); });
});
(async () => {
  await new Promise(r => setTimeout(r, 1500)); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch();
  for (const file of ['dashboard', 'dashboard-next']) for (const lang of ['en', 'ru']) {
    console.log(`\n== ${file} ${lang}`);
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(([u, l]) => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1');
      localStorage.setItem('cm_dash_window', '0'); localStorage.setItem('askpi_lang', l); localStorage.setItem('cm_dash_lang', l); }, [B + '/exec', lang]);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`${B}/cm/${file}/index.html`);
    await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 20 && document.documentElement.classList.contains('cmStd'), null, { timeout: 60000 });
    await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); });
    for (const tab of ['overview', 'cmwo']) {
      await p.evaluate(t => showTab(t, true), tab); await p.waitForTimeout(500);
      for (const W of [1280, 1536, 1920, 2560]) {
        await p.setViewportSize({ width: W, height: 900 }); await p.waitForTimeout(700);
        const m = await p.evaluate(() => {
          const R = e => e && e.getBoundingClientRect(), vis = e => e && e.offsetParent !== null && R(e).width > 0;
          const sbw = R(document.querySelector('nav.tabs')).right;
          const sec = [...document.querySelectorAll('main > section')].find(x => x.offsetParent !== null);
          const parts = { title: document.querySelector('#stdBand .std-tt'), search: document.querySelector('header.app .gsearch'), bar: document.getElementById('cmFb'),
            head: sec && sec.querySelector(':scope>.pagehd'), foot: document.querySelector('#stdFoot>*') };
          const L = {}; for (const k in parts) if (vis(parts[k])) L[k] = Math.round(R(parts[k]).left);
          const right = {}; for (const k of ['bar']) if (vis(parts[k])) right[k] = Math.round(innerWidth - R(parts[k]).right);
          { const sd = R(document.querySelector('#stdBand .std-side')), tt = R(document.querySelector('#stdBand .std-tt')); if (!sd || !tt) right.side = -1; else if (sd.top < tt.bottom - 2) right.side = Math.round(innerWidth - sd.right); }   /* wrapped under the title on a narrow band: not a right edge */
          let cardR = 0; if (sec) for (const c of sec.querySelectorAll(':scope>*')) if (vis(c) && R(c).height > 20 && c.id !== 'filterBar')   /* CM_WOMLOOK_V1 (592): the bar host is a full-width pinned row; the bar's own edge is measured as 'bar' */ cardR = Math.max(cardR, R(c).right);
          right.cards = Math.round(innerWidth - cardR);
          return { sbw: Math.round(sbw), L, right, sw: document.documentElement.scrollWidth, vw: innerWidth };
        });
        const g = W < 1280 ? 20 : 24, want = m.sbw + g, lefts = Object.values(m.L), rights = Object.values(m.right);
        ok(`${tab} ${W}: title, search, filter bar, heading, footer start on the gutter right of the menu (${want} px)`, lefts.length >= 4 && lefts.every(x => Math.abs(x - want) <= 1), JSON.stringify(m.L));
        ok(`${tab} ${W}: the band, filter bar and cards end on the right gutter (${g} px)`, rights.every(x => Math.abs(x - g) <= 1), JSON.stringify(m.right));
        ok(`${tab} ${W}: no sideways scroll`, m.sw <= m.vw, m.sw + ' / ' + m.vw);
      }
    }
    /* Defects raised: the short columns whole, the description wider on a wide screen, the stage chips on the Export row */
    await p.evaluate(() => showTab('cmwo', true));
    const cut = async W => { await p.setViewportSize({ width: W, height: 900 }); await p.waitForTimeout(900);
      return p.evaluate(() => { const rows = [...document.querySelectorAll('#cwList table.cwtbl tbody tr')].slice(0, 25), out = { n: rows.length, cut: [] };
        const ths = [...document.querySelectorAll('#cwList table.cwtbl thead tr:first-child th')].map(th => th.textContent.trim());
        for (const tr of rows) for (const i of [3, 5, 11]) { const s = tr.children[i] && tr.children[i].querySelector('.cw2'); if (s && (s.scrollHeight > s.clientHeight + 1 || s.scrollWidth > s.clientWidth + 1)) out.cut.push(ths[i] + ': ' + s.textContent.trim()); }
        const col = [...document.querySelectorAll('#cwList table.cwtbl col')].map(c => parseInt(c.style.width) || 0); out.type = col[3]; out.resp = col[11];
        const bar = document.getElementById('cwStageF'); out.chipsInBar = !!(bar && bar.parentElement && bar.parentElement.classList.contains('ddbar'));
        return out; }); };
    const a = await cut(1536), z = await cut(2560);
    ok('Defects raised has rows to look at', a.n > 0, a.n);
    ok('1536: equipment type, priority and responsible whole on two lines', a.cut.length === 0, a.cut.slice(0, 4).join(' | '));
    ok('2560: the same, with wider columns than at 1536', z.cut.length === 0 && z.type > a.type && z.resp > a.resp, `type ${a.type}->${z.type}, responsible ${a.resp}->${z.resp}`);
    ok('the stage chips sit on the Export CSV row', a.chipsInBar);
    ok('no page errors', !errs.length, errs.join(' | ')); await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
})();
