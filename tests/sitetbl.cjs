/* CM_SITETBL_V1 (build 634, Rickie 16.11.2026 06:31 "the table in cm are not standard UI still. and i want the all pages to match",
   mock-up "Go, all tables" + "32 px like the site"): under /cm/ every list table of both office pages is on the site's own table
   component (tests/site_std_copy = the live template, site_std v2.14). Asked of the page, per table:
   - the template has it (std-sf), its filter row is the template's (tr.std-flt), the page's own (th.cwfh) is gone;
   - one Columns control: the template's ⚙ Columns, none of the page's own pickers visible;
   - a filter narrows the rows, "N of M lines" says so, the page's own sort keeps the filter;
   - status colour on the rows of a list with a status (Actions, Plan vs Actual, Defects raised);
   - filter boxes are 32 px on a desk;
   - every line of the list is drawn (no pager slice under a filter);
   - Actions: with a column moved, a cell still edits in place and a row still opens its drawer;
   - Russian: the template's words follow the page's language;
   and off the site (no /site/std.js) the page keeps its own filter row: proof the check can see the difference.
   Run: node tests/sitetbl.cjs   (spawns tests/mock.cjs on 8491) */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), MP = 8491, A = path.join(__dirname, 'site_std_copy');
let fails = 0; const ok = (n, c, d) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '   ' + d : ''}`); if (!c) fails++; };
const mock = spawn(process.execPath, [path.join(__dirname, 'mock.cjs'), String(MP)], { stdio: 'ignore' }); process.on('exit', () => { try { mock.kill(); } catch (e) {} });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/site/std.js' || u === '/site/std.css') { r.writeHead(200, { 'Content-Type': T[path.extname(u)] }); return r.end(fs.readFileSync(path.join(A, path.basename(u)))); }
  if (u.startsWith('/site/')) { r.writeHead(404); return r.end(); }
  if (u.startsWith('/exec')) { const pr = http.request({ host: '127.0.0.1', port: MP, path: q.url, method: q.method, headers: q.headers }, x => { r.writeHead(x.statusCode, x.headers); x.pipe(r); }); q.pipe(pr); return; }
  let p = path.join(ROOT, u.startsWith('/cm/') ? u.slice(4) : u); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });
const TABLES = [['overview', '#fleetTbl', 0], ['actions', 'table.acttbl', 1], ['due', 'table.ddtbl', 0], ['planact', 'table.patbl', 1], ['cmwo', 'table.cwtbl', 1], ['failure', '#failAffTbl', 0]];
(async () => { await new Promise(r => setTimeout(r, 1500)); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch();
  const open = async (url, lang) => { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(([u, l]) => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1'); localStorage.setItem('cm_dash_window', '0'); if (l) { localStorage.setItem('askpi_lang', l); localStorage.setItem('cm_dash_lang', l); } }, [B + '/exec', lang || '']);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto(url); await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 20, null, { timeout: 60000 });
    await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); }); return p; };
  for (const file of ['dashboard', 'dashboard-next']) {
    const p = await open(`${B}/cm/${file}/index.html`);
    await p.waitForFunction(() => window.cmSiteTblOn === true, null, { timeout: 20000 }).catch(() => {});
    ok(`${file}: the site table component is on under /cm/ (site_std ${await p.evaluate(() => window.SiteStd && SiteStd.rev)})`, await p.evaluate(() => window.cmSiteTblOn === true), await p.evaluate(() => window.cmSiteTblErr || ''));
    for (const [tab, sel, hasSt] of TABLES) {
      await p.evaluate(t => showTab(t, true), tab); await p.waitForTimeout(1300);
      const s = await p.evaluate(sel => { const t = document.querySelector(sel); if (!t || !t.offsetParent) return null;
        const sec = t.closest('.section') || t.closest('section'), vis = e => !!(e && e.offsetParent && getComputedStyle(e).visibility !== 'hidden');
        const cols = [...sec.querySelectorAll('button,summary')].filter(x => vis(x) && /^\s*(⚙\s*)?(columns|столбцы)/i.test(x.textContent));
        const fr = t.querySelector('tr.std-flt'), boxes = fr ? [...fr.querySelectorAll('.std-sfx,.std-sfb')].filter(vis) : [];
        return { std: t.classList.contains('std-sf') && t.classList.contains('cmSiteTbl'), flt: !!fr, own: !!t.querySelector('th.cwfh'), cols: cols.length,
          colStd: cols.some(x => x.classList.contains('std-btn')), h: boxes.map(x => Math.round(x.getBoundingClientRect().height)),
          rows: t.tBodies[0] ? [...t.tBodies[0].rows].filter(r => r.cells.length > 1).length : 0, st: t.querySelectorAll('tbody tr[class*="std-st-"]').length,
          pager: (sec.querySelector('.pager') || {}).textContent || '' }; }, sel);
      if (!s) { ok(`${file} ${tab}: ${sel} is on screen`, false); continue; }
      const fw = `${file} ${tab} ${sel}`;
      ok(`${fw}: on the site table component with its filter row, the page's own filter row gone`, s.std && s.flt && !s.own, JSON.stringify({ std: s.std, flt: s.flt, own: s.own }));
      ok(`${fw}: one Columns control, the site's`, s.cols === 1 && s.colStd, `${s.cols} visible`);
      ok(`${fw}: filter boxes 32 px on a desk`, s.h.length > 0 && s.h.every(h => h === 32), s.h.join(','));
      /* Rickie 16.11 07:42 "select everything as standard. and horizontal slider, freeze, as per UI standard" */
      const w = await p.evaluate(sel => { const t = document.querySelector(sel), box = t.closest('.tblwrap') || t.parentElement, hr = [...t.tHead.rows].filter(r => !r.classList.contains('std-flt')).pop();
        const hidden = [...hr.cells].filter(c => getComputedStyle(c).display === 'none').map(c => c.textContent.trim());
        const wide = box.scrollWidth > box.clientWidth + 1; scrollTo(0, scrollY + t.getBoundingClientRect().top - 150); dispatchEvent(new Event('scroll'));
        return new Promise(r => setTimeout(() => { const own = box.getBoundingClientRect().bottom > innerHeight;
          const hs = [...document.querySelectorAll('.std-hs')].some(e => { const q = e.getBoundingClientRect(); return q.height > 0 && q.bottom <= innerHeight + 1 && q.top > innerHeight - 80; });
          r({ hidden, wide, fz: t.querySelectorAll('tbody .std-fz').length, own, hs }); }, 900)); }, sel);
      ok(`${fw}: every column shown by default`, !w.hidden.length, w.hidden.join(','));
      if (w.wide) { ok(`${fw}: a table wider than its box keeps its identifying column frozen`, w.fz > 0, `${w.fz} frozen cells`);
        if (w.own) ok(`${fw}: its slider is held at the bottom of the window`, w.hs); }
      if (hasSt) ok(`${fw}: rows carry the status colour`, s.st > 0, `${s.st} of ${s.rows}`);
      /* filter on the identifying column: the first row's value */
      const f = await p.evaluate(async sel => { const t = document.querySelector(sel), fr = t.querySelector('tr.std-flt'), cfg = t._cmCfg, k = cfg.freeze;
        const hr = [...t.tHead.rows].filter(r => !r.classList.contains('std-flt')).pop(), pos = [...hr.cells].findIndex((c, i) => (c.hasAttribute('data-std-c') ? +c.getAttribute('data-std-c') : i) === k);
        const body = () => [...t.tBodies[0].rows].filter(r => r.cells.length > 1), shown = () => body().filter(r => !r.classList.contains('std-sfh') && r.offsetParent);
        const before = shown().length, v = (body()[0].cells[pos].getAttribute('data-v') || body()[0].cells[pos].textContent).replace(/\s+/g, ' ').trim();
        const cell = fr.cells[pos], x = cell.querySelector('.std-sfx'), btn = cell.querySelector('.std-sfb');
        if (x) { x.value = v; x.dispatchEvent(new Event('input', { bubbles: true })); }
        else if (btn) { btn.click(); await new Promise(r => setTimeout(r, 200)); const pop = document.querySelector('.std-sfpop'); const lab = pop && [...pop.querySelectorAll('.std-pki')].find(l => l.querySelector('input').value === v);
          if (lab) { const i = lab.querySelector('input'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); } const d = pop && pop.querySelector('[data-x=done]'); if (d) d.click(); }
        await new Promise(r => setTimeout(r, 400));
        const after = shown(), cnt = (document.querySelector(`[data-std-tools="${cfg.id}"] .std-sfn`) || {}).textContent || '';
        return { v, before, after: after.length, allMatch: after.every(r => (r.cells[pos].getAttribute('data-v') || r.cells[pos].textContent).replace(/\s+/g, ' ').trim() === v), cnt, kind: x ? 'text' : 'list' }; }, sel);
      ok(`${fw}: a ${f.kind} filter on "${f.v}" narrows the list and says "N of M lines"`, f.after >= 1 && f.after < f.before && f.allMatch && /\d/.test(f.cnt), `${f.after} of ${f.before} · "${f.cnt}"`);
      /* the page's own sort redraws the rows: the filter stays */
      const so = await p.evaluate(async sel => { const t = document.querySelector(sel), hr = [...t.tHead.rows].filter(r => !r.classList.contains('std-flt')).pop();
        const th = [...hr.cells].find(c => c.classList.contains('sortable') && !c.classList.contains('on')); if (!th) return { none: 1 };
        th.click(); await new Promise(r => setTimeout(r, 700)); const t2 = document.querySelector(sel);
        const sh = [...t2.tBodies[0].rows].filter(r => r.cells.length > 1 && !r.classList.contains('std-sfh') && r.offsetParent).length;
        const all = [...t2.tBodies[0].rows].filter(r => r.cells.length > 1).length; const clr = document.querySelector(`[data-std-clr="${t2._cmCfg ? t2._cmCfg.id : ''}"]`); if (clr) clr.click(); return { sh, all, on: [...t2.tHead.querySelectorAll('th.on')].length }; }, sel);
      if (!so.none) ok(`${fw}: the page's own sort redraws and the filter stays on`, so.sh === f.after && so.all >= so.sh, `${so.sh} shown of ${so.all}`);
      if (s.pager) ok(`${fw}: every line is drawn (no pager slice under a filter)`, !/showing\s+1\s*[–-]\s*\d+\D+\d/.test(s.pager) || new RegExp('(\\d[\\d,]*)\\s*matching.*1\\s*[–-]\\s*\\1').test(s.pager.replace(/\s+/g, ' ')), s.pager.replace(/\s+/g, ' ').slice(0, 80));
    }
    /* Actions: a column moved, a cell still edits in place and a row still opens its drawer */
    await p.evaluate(() => showTab('actions', true)); await p.waitForTimeout(1200);
    const mv = await p.evaluate(async () => { const t = document.querySelector('table.acttbl'), o = SiteStd.order('cm_act'); if (!o) return { no: 1 };
      const n = o.slice(), a = n.length - 1, b2 = n.length - 2; [n[a], n[b2]] = [n[b2], n[a]]; SiteStd.order('cm_act', n); await new Promise(r => setTimeout(r, 300));
      const td = t.querySelector('tbody td.ed'); if (!td) return { moved: SiteStd.order('cm_act').join(','), ed: 'no td.ed' };
      td.click(); await new Promise(r => setTimeout(r, 300)); const ed = !!t.querySelector('tbody td.ed input,tbody td.ed select,tbody td.ed textarea');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); if (document.activeElement) document.activeElement.blur(); await new Promise(r => setTimeout(r, 300));
      const row = t.querySelector('tbody tr'); const cell = [...row.cells].find(c => !c.classList.contains('ed') && !c.classList.contains('selcol') && c.textContent.trim()); cell.click(); await new Promise(r => setTimeout(r, 500));
      const ov = document.getElementById('follOv'), dr = !!(ov && !ov.classList.contains('hidden') && getComputedStyle(ov).display !== 'none' && ov.getBoundingClientRect().width > 0);
      if (ov) { const x = ov.querySelector('[data-close],.close,#follClose,button[aria-label*="lose"]'); if (x) x.click(); }
      SiteStd.order('cm_act', null); return { moved: n.join(','), ed, dr }; });
    ok(`${file} actions: with a column moved a cell still edits in place`, mv.ed === true, JSON.stringify(mv));
    ok(`${file} actions: with a column moved a row still opens its drawer`, mv.dr === true);
    /* CM_ONECHIP_V1 (Rickie 16.11 09:26 "showing the search again"): a search is said once, by the site bar; clearing it there clears it */
    await p.evaluate(() => showTab('overview', true)); await p.waitForTimeout(800);
    const ch = await p.evaluate(async () => { const q = document.getElementById('fQ'); q.value = '12345'; q.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 900));
      const bar = (document.getElementById('cmFbC') || {}).textContent || '', page = document.getElementById('chips').textContent;
      const x = document.querySelector('#cmFbC button'); if (x) x.click(); await new Promise(r => setTimeout(r, 900));
      return { bar: /12345/.test(bar), page: /12345/.test(page), after: document.getElementById('fQ').value, hash: location.hash, ac: q.getAttribute('autocomplete') }; });
    ok(`${file}: a search shows one chip, in the site bar, not again under the title`, ch.bar && !ch.page, JSON.stringify(ch));
    ok(`${file}: clearing it in the bar clears the box and the address`, ch.after === '' && !/q=/.test(ch.hash) && ch.ac === 'off', JSON.stringify(ch));
    ok(`${file}: no page errors`, !p.errs.length, p.errs.slice(0, 3).join(' | '));
    await p.context().close();
    /* Russian */
    const pr = await open(`${B}/cm/${file}/index.html`, 'ru'); await pr.waitForFunction(() => window.cmSiteTblOn === true, null, { timeout: 20000 }).catch(() => {});
    await pr.evaluate(() => showTab('cmwo', true)); await pr.waitForTimeout(1300);
    const ru = await pr.evaluate(() => { const t = document.querySelector('table.cwtbl'), x = t.querySelector('tr.std-flt .std-sfx'), cb = document.querySelector('[data-std-tools="cm_cw"] .std-btn');
      return { ph: x ? x.placeholder : '', btn: cb ? cb.textContent : '', lang: document.documentElement.lang }; });
    ok(`${file} RU: the template's filter box and Columns speak Russian`, /[А-яЁё]/.test(ru.ph + ru.btn) && !/\b(Filter|Columns)\b/.test(ru.ph + ru.btn), JSON.stringify(ru));
    await pr.context().close();
    /* off the site: the page keeps its own filter row (the check can see the difference) */
    const po = await open(`${B}/${file}/index.html`); await po.evaluate(() => showTab('cmwo', true)); await po.waitForTimeout(1300);
    const off = await po.evaluate(() => { const t = document.querySelector('table.cwtbl'); return { own: !!t.querySelector('th.cwfh'), std: t.classList.contains('std-sf'), on: !!window.cmSiteTblOn }; });
    ok(`${file} off the site: the page's own filter row, no site component`, off.own && !off.std && !off.on, JSON.stringify(off));
    await po.context().close();
  }
  await b.close(); srv.close(); console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('  FAIL ' + (e.stack || e)); process.exit(1); });
