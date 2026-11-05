/* CM_WOMLOOK_V1 (build 592, Rickie 05.11.2026 21:10 "look more of WO Manager or Action Tracker", mock-up "Go" 22:31).
   Under /cm/, desk widths: the band runs the full width and the side menu sits under it with a navy title block; no strip
   between band and page (the one search box is in the filter bar and still narrows the lists; build number in the footer);
   the filter bar is the first row under the band (one line at 1920, and at 1440 in English); the tab heading carries the
   count; KPI cards are separate cards with nothing cut. The phone (390) keeps its layout. EN and RU, both office pages.
   Run: node tests/cmwomlook.cjs   (spawns tests/mock.cjs on 8489) */
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
    await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 20 && document.documentElement.classList.contains('cmStd') && document.querySelector('#cmFb .gsearch'), null, { timeout: 60000 });
    await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); showTab('overview', true); }); await p.waitForTimeout(800);
    for (const W of [1440, 1920]) {
      await p.setViewportSize({ width: W, height: 900 }); await p.waitForTimeout(800);
      const m = await p.evaluate(() => {
        const R = e => e && e.getBoundingClientRect(), vis = e => !!e && e.offsetParent !== null && R(e).width > 0;
        const band = R(document.getElementById('stdBand')), nav = R(document.querySelector('nav.tabs')), fb = R(document.getElementById('cmFb'));
        const t1 = document.querySelector('nav.tabs .brand .t1');
        const kp = [...document.querySelectorAll('#kpis .kpi .k, #kpis .kpi .s')].filter(vis).filter(e => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim());
        const cnt = document.querySelector('#tab-overview .cmwCount'), n = document.getElementById('cmFbN');
        return { bandL: Math.round(band.left), bandW: Math.round(band.width), navTop: Math.round(nav.top), bandB: Math.round(band.bottom), fbTop: Math.round(fb.top), fbH: Math.round(fb.height),
          hdr: vis(document.querySelector('header.app')), gqInBar: !!document.querySelector('#cmFb #gq'), verInFoot: !!document.querySelector('#stdFoot #dashVer'),
          t1: vis(t1) ? t1.textContent.trim() : '', kpCut: kp, cnt: cnt && vis(cnt) ? cnt.textContent.trim() : '', n: n ? n.textContent.trim() : '',
          kpR: getComputedStyle(document.querySelector('#kpis .kpi')).borderTopLeftRadius, sw: document.documentElement.scrollWidth, vw: innerWidth };
      });
      ok(`${W}: the band runs the full width`, m.bandL === 0 && m.bandW === m.vw, `${m.bandL} / ${m.bandW}`);
      ok(`${W}: the side menu starts under the band`, Math.abs(m.navTop - m.bandB) <= 1, `${m.navTop} vs ${m.bandB}`);
      ok(`${W}: the menu's title block names the page`, m.t1.length > 3, m.t1);
      ok(`${W}: no strip under the band; the search is in the filter bar; the build number in the footer`, !m.hdr && m.gqInBar && m.verInFoot, JSON.stringify([m.hdr, m.gqInBar, m.verInFoot]));
      ok(`${W}: the filter bar is the first row under the band`, Math.abs(m.fbTop - m.bandB) <= 12, `${m.fbTop} vs ${m.bandB}`);
      if (W === 1920 || lang === 'en') ok(`${W}: the filter bar is one line`, m.fbH <= 40, m.fbH);
      ok(`${W}: KPI cards separate (12 px corners), nothing cut`, m.kpR === '12px' && !m.kpCut.length, m.kpR + ' ' + m.kpCut.join(' | '));
      ok(`${W}: the heading carries the bar's count`, m.cnt && m.cnt === m.n, `${m.cnt} / ${m.n}`);
      ok(`${W}: no sideways scroll`, m.sw <= m.vw, m.sw + ' / ' + m.vw);
    }
    await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(500);
    const f = await p.evaluate(async () => { const gq = document.getElementById('gq'), fq = document.getElementById('fQ'); gq.focus(); gq.value = 'TK1'; gq.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 700)); const v = fq.value; gq.value = ''; gq.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 500));
      return { v, after: fq.value, n: document.getElementById('cmFbN').textContent }; });
    ok('typing in the bar\'s search narrows the lists (the filter search gets the text) and clearing it clears it', f.v === 'TK1' && f.after === '', JSON.stringify(f));
    await p.evaluate(() => showTab('cmwo', true)); await p.waitForTimeout(600);
    ok('Defects raised: no inspection count on its heading (1C tab)', await p.evaluate(() => { const c = document.querySelector('#tab-cmwo .cmwCount'); return !c || c.offsetParent === null; }));
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(900);
    const ph = await p.evaluate(() => ({ hdr: document.querySelector('header.app').offsetParent !== null, back: !!document.querySelector('header.app #gq') && !document.getElementById('fQ').classList.contains('vh'), sw: document.documentElement.scrollWidth, vw: innerWidth }));
    ok('390: the phone keeps its layout (search row shown, search back in it)', ph.hdr && ph.back, JSON.stringify(ph));   /* sideways scroll at 390 is tests/cards.cjs's (a desk-to-phone resize leaves 4 px on build 591 too) */
    ok('no page errors', !errs.length, errs.join(' | ')); await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
})();
