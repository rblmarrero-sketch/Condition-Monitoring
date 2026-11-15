/* CM_BOOT_V1 (build 634, Rickie 16.11.2026 08:44 "when loaded it has old legacy that's loading before the new one"): both office
   pages under /cm/ never show their bare old shell while they load. From the first paint the body is hidden with one "Loading…" line;
   it is shown when the site template has dressed the page (html.cmStd), on a slow link and a slow CPU as well; off the site it is
   shown as soon as the page has been read; a page whose template never arrives is still shown (failsafe). Russian says "Загрузка…".
   Every frame is sampled, so a single frame of the bare shell fails. Run: node tests/cmboot.cjs */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..'), A = path.join(__dirname, 'site_std_copy');
let fails = 0; const ok = (n, c, d) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '   ' + d : ''}`); if (!c) fails++; };
const T = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
let noStd = false;
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/site/std.js' || u === '/site/std.css') { if (noStd) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(u)] }); return r.end(fs.readFileSync(path.join(A, path.basename(u)))); }
  if (u.startsWith('/site/') || u.startsWith('/exec')) { r.writeHead(404); return r.end(); }
  let p = path.join(ROOT, u.startsWith('/cm/') ? u.slice(4) : u); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });
(async () => { await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch();
  const load = async (url, slow, lang) => { const ctx = await b.newContext({ viewport: { width: 1440, height: 800 } });
    await ctx.addInitScript(l => { if (l) localStorage.setItem('askpi_lang', l);
      const t0 = performance.now(); window.__f = { bare: 0, cover: 0, dressed: 0, at: 0, txt: '' };
      const look = () => { const h = document.documentElement, f = window.__f, vis = document.body ? getComputedStyle(document.body).visibility : 'none';
        if (h.classList.contains('cmBoot')) { f.cover++; f.txt = h.getAttribute('data-boot') || ''; }
        else if (document.body && vis === 'visible' && document.body.children.length) { if (h.classList.contains('cmStd')) { f.dressed++; if (!f.at) f.at = Math.round(performance.now() - t0); } else f.bare++; }
        if (performance.now() - t0 < 25000 && !(f.dressed > 5)) requestAnimationFrame(look); };
      requestAnimationFrame(look); }, lang || '');
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    if (slow) { const c = await ctx.newCDPSession(p); await c.send('Network.enable'); await c.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.5e6, uploadThroughput: 1e6 }); await c.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => !document.documentElement.classList.contains('cmBoot'), null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(600); const f = await p.evaluate(() => Object.assign({}, window.__f, { boot: document.documentElement.classList.contains('cmBoot'), std: document.documentElement.classList.contains('cmStd'), vis: getComputedStyle(document.body).visibility }));
    await ctx.close(); return Object.assign(f, { errs }); };
  for (const file of ['dashboard', 'dashboard-next']) {
    for (const slow of [false, true]) { const f = await load(`${B}/cm/${file}/index.html`, slow);
      const w = `${file} /cm/${slow ? ' slow link, 4x CPU' : ''}`;
      ok(`${w}: the loading line is shown first`, f.cover > 0 && f.txt === 'Loading…', `${f.cover} frames, "${f.txt}"`);
      ok(`${w}: never a frame of the bare old shell`, f.bare === 0, `${f.bare} bare frames`);
      ok(`${w}: shown dressed in the site look`, !f.boot && f.std && f.vis === 'visible', `at ${f.at} ms`); }
    const ru = await load(`${B}/cm/${file}/index.html`, false, 'ru'); ok(`${file} RU: "Загрузка…"`, ru.txt === 'Загрузка…', ru.txt);
    const off = await load(`${B}/${file}/index.html`, false); ok(`${file} off the site: shown once read, no template needed`, !off.boot && off.vis === 'visible' && !off.std, JSON.stringify({ boot: off.boot, vis: off.vis }));
    noStd = true; const ns = await load(`${B}/cm/${file}/index.html`, false); noStd = false;
    ok(`${file} /cm/ with the template missing: still shown (failsafe)`, !ns.boot && ns.vis === 'visible', JSON.stringify({ boot: ns.boot, vis: ns.vis }));
  }
  await b.close(); srv.close(); console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('  FAIL ' + (e.stack || e)); process.exit(1); });
