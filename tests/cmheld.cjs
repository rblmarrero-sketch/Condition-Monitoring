/* CM_TBL_V1 (build 615, Rickie 13.11.2026 13:40 "ensure that this bug is not happening in other tables. keep it as a check and rule"):
   under /cm/ every long table on every tab, both office pages, scrolled past: its heading is navy and sits directly under the bars
   pinned at the top (site menu, filter bar) - not under them, not scrolled away, not lower - and solid. Measured by the site
   template's own held-header audit (tests/site_std_copy/held_audit.js, site_std v2.7), which proves it can see by finding a planted
   fault. Run: node tests/cmheld.cjs   (spawns tests/mock.cjs on 8489) */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), MP = 8489, A = path.join(__dirname, 'site_std_copy'), OUT = process.env.OUT;
let fails = 0; const ok = (n, c, d) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '   ' + d : ''}`); if (!c) fails++; };
const mock = spawn(process.execPath, [path.join(__dirname, 'mock.cjs'), String(MP)], { stdio: 'ignore' }); process.on('exit', () => { try { mock.kill(); } catch (e) {} });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/site/std.js' || u === '/site/std.css') { r.writeHead(200, { 'Content-Type': T[path.extname(u)] }); return r.end(fs.readFileSync(path.join(A, path.basename(u)))); }
  if (u.startsWith('/site/')) { r.writeHead(404); return r.end(); }
  if (u.startsWith('/exec')) { const pr = http.request({ host: '127.0.0.1', port: MP, path: q.url, method: q.method, headers: q.headers }, x => { r.writeHead(x.statusCode, x.headers); x.pipe(r); }); pr.on('error', () => { r.writeHead(502); r.end(); }); return q.pipe(pr); }
  let p = path.join(ROOT, u.startsWith('/cm/') ? u.slice(4) : u); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });
(async () => { await new Promise(r => setTimeout(r, 1500)); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = `http://127.0.0.1:${srv.address().port}`;
  let n = 0; const b = await chromium.launch(); const HA = fs.readFileSync(path.join(A, 'held_audit.js'), 'utf8');
  for (const W of (process.env.WIDTHS || '1440,2560').split(',').map(Number)) for (const file0 of (process.env.FILES || 'dashboard,dashboard-next').split(',')) {
    const file = file0, fw = file0 + ' @' + W;   /* build 618: 2560 too - the live audit found the Overview heading 14 px under the bar there */
    const ctx = await b.newContext({ viewport: { width: W, height: 900 } });
    await ctx.addInitScript(([u]) => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1'); localStorage.setItem('cm_dash_window', '0'); }, [B + '/exec']);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`${B}/cm/${file}/index.html`); await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 20 && document.documentElement.classList.contains('cmStd'), null, { timeout: 60000 });
    await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); });
    for (const tab of ['overview', 'actions', 'due', 'planact', 'cmwo', 'equipment', 'failure', 'wear', 'lube', 'reports', 'sync']) {
      await p.evaluate(t => showTab(t, true), tab); await p.waitForTimeout(1200);
      await p.addScriptTag({ content: HA });
      const tabs = await p.evaluate(() => { document.querySelectorAll("[data-aud]").forEach(x => x.removeAttribute("data-aud")); return [...document.querySelectorAll('main table')].filter(t => t.offsetParent && t.tHead && t.getBoundingClientRect().height > 500).map((t, i) => { t.dataset.aud = i; return i; }); });
      const res = [];
      for (const i of tabs) { await p.evaluate(i => { const t = document.querySelector(`table[data-aud="${i}"]`); scrollTo(0, scrollY + t.getBoundingClientRect().top + 300); dispatchEvent(new Event('scroll')); }, i); await p.waitForTimeout(400);
        const a = await p.evaluate(i => { const t = document.querySelector(`table[data-aud="${i}"]`), th = t.tHead.rows[0].cells[0]; const r = __stdHeldAudit();
          return { id: t.id || t.className.slice(0, 30), pos: getComputedStyle(th).position, thTop: Math.round(th.getBoundingClientRect().top), barsEnd: r.barsEnd, bad: r.bad, bg: getComputedStyle(th).backgroundColor }; }, i);
        res.push(a); if (OUT && i === tabs[0]) await p.screenshot({ path: `${OUT}/${file}_${W}_${tab}.png` }); }
      for (const a of res) { ok(`${fw} ${tab} · ${a.id}: navy heading held right under the pinned bars, solid`, a.bg === 'rgb(43, 76, 126)' && !a.bad.length, `top ${a.thTop}, bars end ${a.barsEnd}${a.bad.length ? ' · ' + a.bad.join('; ') : ''}`); n += res.length; }
      await p.evaluate(() => scrollTo(0, 0)); }
    /* the instrument can see: plant a see-through heading */
    await p.evaluate(() => showTab('cmwo', true)); await p.waitForTimeout(1000); await p.addScriptTag({ content: HA });
    const pl = await p.evaluate(() => { const t = [...document.querySelectorAll('main table.grid')].find(t => t.offsetParent && t.tHead); scrollTo(0, scrollY + t.getBoundingClientRect().top + 300); dispatchEvent(new Event('scroll'));
      return new Promise(r => setTimeout(() => { t.tHead.rows[0].cells[1].style.setProperty('opacity', '.5', 'important'); const a = __stdHeldAudit(); t.tHead.rows[0].cells[1].style.removeProperty('opacity'); r(a.bad.length); }, 300)); });
    ok(`${fw}: the audit sees a planted see-through heading`, pl >= 1, pl);
    /* build 617: the page moves the table down WITHOUT a scroll (no scroll event, no new element): the heading follows, it does not float */
    const fl = await p.evaluate(() => { const de = document.documentElement; de.style.overflowAnchor = 'none'; const t = [...document.querySelectorAll('main table.grid')].find(t => t.offsetParent && t.tHead);
      scrollTo(0, scrollY + t.getBoundingClientRect().top + 300); dispatchEvent(new Event('scroll'));
      return new Promise(r => setTimeout(() => { t.style.marginTop = '300px'; setTimeout(() => { const a = __stdHeldAudit(), top = Math.round(t.tHead.rows[0].cells[0].getBoundingClientRect().top);
        t.style.marginTop = ''; de.style.overflowAnchor = ''; r({ bad: a.bad.filter(x => /px (under|below)/.test(x)), top, bars: a.barsEnd }); }, 1300); }, 400)); });
    ok(`${fw}: content above a held table grows without a scroll - its heading follows (the 16:12 "floating" bug)`, !fl.bad.length && Math.abs(fl.top - fl.bars) <= 3, `heading ${fl.top}, bars end ${fl.bars}${fl.bad.length ? ' · ' + fl.bad.join('; ') : ''}`);
    /* build 618: a tall pinned panel across the middle of the window does not hide the bar (the old method asked only what lies under the middle) */
    const pp = await p.evaluate(() => { const d = document.createElement('div'); d.id = 'pplant'; d.style.cssText = 'position:fixed;top:0;bottom:0;left:40%;width:20%;z-index:40;background:rgba(0,0,0,.04)'; document.body.appendChild(d);
      const t = [...document.querySelectorAll('main table.grid')].find(t => t.offsetParent && t.tHead); scrollTo(0, scrollY + t.getBoundingClientRect().top + 300); dispatchEvent(new Event('scroll'));
      return new Promise(r => setTimeout(() => { const a = __stdHeldAudit(), top = Math.round(t.tHead.rows[0].cells[0].getBoundingClientRect().top); d.remove(); r({ bad: a.bad.filter(x => /px (under|below)/.test(x)), top, bars: a.barsEnd }); }, 600)); });
    ok(`${fw}: a tall pinned panel across the middle does not hide the bar from the held heading`, !pp.bad.length && Math.abs(pp.top - pp.bars) <= 3, `heading ${pp.top}, bars end ${pp.bars}${pp.bad.length ? ' · ' + pp.bad.join('; ') : ''}`);
    /* build 618: the day summary's findings table (Reports, table[data-ds=find]) is held like every other table */
    const ds = await p.evaluate(() => { showTab('reports', true); const w = document.createElement('div'); w.id = 'dsplant'; w.style.overflowX = 'auto';
      w.innerHTML = '<table data-ds="find" width="100%"><thead><tr><th style="background:#16304F;color:#fff">Unit</th><th style="background:#16304F;color:#fff">Finding</th></tr></thead><tbody>' + Array.from({ length: 120 }, (x, j) => '<tr><td>U' + j + '</td><td>row</td></tr>').join('') + '</tbody></table>';
      document.querySelector('main').appendChild(w); const t = w.querySelector('table');
      return new Promise(r => setTimeout(() => { scrollTo(0, scrollY + t.getBoundingClientRect().top + 400); dispatchEvent(new Event('scroll'));
        setTimeout(() => { const a = __stdHeldAudit(), top = Math.round(t.tHead.rows[0].cells[0].getBoundingClientRect().top); w.remove(); r({ top, bars: a.barsEnd }); }, 500); }, 300)); });
    ok(`${fw}: the day summary's findings table keeps its heading under the bars`, Math.abs(ds.top - ds.bars) <= 3, `heading ${ds.top}, bars end ${ds.bars}`);
    ok(`${fw}: no page errors`, !errs.length, errs.slice(0, 2).join(' | '));
    await ctx.close(); }
  ok('long tables measured', n >= 10, n);
  await b.close(); console.log(fails ? `\nCMHELD: ${fails} FAIL` : '\nCMHELD: PASS'); process.exit(fails ? 1 : 0); })();
