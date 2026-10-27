/* EVERY CONTROL ON THESE PHONE SCREENS IS AT LEAST 44 PX (audit 26.10 M3).

   Measured on the real page, gloved-finger rule: --tap (44 px) tall, and the
   back chevron 44 wide as well. The screens are the ones the audit found short:
     the Due tab switch (38), the 1C PM info sheet's back chevron (15x26),
     the RTW checklist — back chevron, evidence toggle (21), photo/voice icon
     buttons (32), release fields (38), comment box (34) — Settings' backend
     rows (26), the Saved tab's upload-details summary (18) and report-language
     select (42).
   And M7: on grade 5, "Responsible" shows its default whole and its box is
   not 15 px below the target date's.
   A control smaller than 44 px is named with its size.

   Run: node tests/phonetap.cjs   (serves the repo itself on 8480) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8480), BASE = `http://127.0.0.1:${PORT}`;
const TAP = 44;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
                '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, BASE);
  const f = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

global.self = global; require('../mobile/due.js');
const plus = n => self.DUE.shift(self.DUE.today(), n);
const FIXTURE = { generated: new Date().toISOString(), byUnit: {}, rtwOpen: [
  { wo: 'WO-1', equip: 'TK112', cls: 'HT', comp: 'Rear Differential', desc: 'Ferrous debris', priority: 'P1 Critical',
    raised: plus(0), type: '4000 Hours service Planned', hours: 4000, plan: plus(0), cmmsStatus: 'Registered' } ] };

/* In the page: every visible control inside `root`, with its box. A checkbox or
   radio is measured by the label that carries it, the thing a finger presses. */
const MEASURE = (root) => {
  const host = typeof root === 'string' ? document.querySelector(root) : document.body;
  if (!host) return null;
  const vis = e => { if (!e.getClientRects().length) return false; const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    for (let p = e; p; p = p.parentElement) if (p.classList && p.classList.contains('hidden')) return false;
    const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  const out = [], seen = new Set();
  for (let e of host.querySelectorAll('button,input:not([type=hidden]),select,textarea,summary')) {
    let t = e;
    if (e.tagName === 'INPUT' && /radio|checkbox|file/.test(e.type)) { const l = e.closest('label'); if (l) t = l; else continue; }
    if (seen.has(t) || !vis(t)) continue; seen.add(t);
    const r = t.getBoundingClientRect();
    out.push({ id: t.id || (t.className && String(t.className).split(/\s+/)[0]) || t.tagName.toLowerCase(),
      txt: (t.innerText || t.value || t.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24),
      w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), vw: innerWidth });
  }
  return out;
};
const short = (list, wide) => (list || []).filter(c => c.h < TAP || (wide && wide.test(c.id) && c.w < TAP));
const name = list => list.slice(0, 6).map(c => `${c.id} "${c.txt}" ${c.w}x${c.h}`).join(' | ');

(async () => {
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const b = await chromium.launch();
  for (const [w, h] of [[360, 640], [390, 844]]) for (const lang of ['en', 'ru']) {
    console.log(`\n${w}x${h} ${lang}`);
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    await p.addInitScript(l => {
      localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', on: true, url: 'http://127.0.0.1:9/exec' }]));
      localStorage.setItem('lang', l); localStorage.setItem('cm_lang', l);
    }, lang);
    await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof showPane === 'function' && typeof renderDue === 'function', null, { timeout: 20000 });
    await p.waitForTimeout(1500);
    await p.evaluate(() => { const d = document.getElementById('dlg'); if (d && !d.classList.contains('hidden')) (document.getElementById('dlgCancel') || document.getElementById('dlgOk')).click(); });

    // Due: the tab switch
    await p.evaluate(fx => { SCHED = fx; dueView = 'pm'; showPane('paneDue'); renderDue(); }, FIXTURE);
    await p.waitForTimeout(400);
    let s = short(await p.evaluate(MEASURE, '.viewseg'));
    ok('the Due tab switch', !s.length, name(s));

    // 1C PM info sheet, then the RTW checklist it opens
    await p.click('#duePmList [data-wo="WO-1"]'); await p.waitForTimeout(300);
    const pmc = await p.evaluate(MEASURE, '#pmOv') || [];
    s = short(pmc, /Back/);
    ok('the 1C PM info sheet (its back chevron included)', !s.length && pmc.some(c => c.id === 'pmInfoBack'), name(s));
    await p.click('#pmStartRtwBtn'); await p.waitForTimeout(500);
    await p.evaluate(() => { const t = document.querySelector('#rtwChecklistBody .rtw-evidence-toggle'); t && t.click();
      const b = document.getElementById('rtwChecklistBody'); if (b) b.scrollTop = b.scrollHeight; });
    await p.waitForTimeout(200);
    s = short(await p.evaluate(MEASURE, '#rtwChecklistScr'), /Back/);
    ok('every control on the RTW checklist (back, marks, evidence, icons, fields)', !s.length, name(s));
    const rtwAll = await p.evaluate(MEASURE, '#rtwChecklistScr');
    const off = rtwAll.filter(c => c.right > c.vw);
    ok('and none of them runs off the screen (the Time field did, at 390 px)', !off.length, off.map(c => `${c.id} right ${c.right} > ${c.vw}`).join(' | '));

    // Grade 5 on a magnetic plug: Responsible and Target date (audit 26.10 M7)
    const g = await p.evaluate(async () => {
      document.querySelectorAll('.rtw-ov').forEach(e => e.classList.add('hidden')); document.body.classList.remove('ovopen');
      showPane('paneCapture');
      const sel = document.getElementById('typeSel'); sel.value = 'MP'; sel.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 150));
      curEquip = 'TK147'; updateEquipBtn && updateEquipBtn(); applyForm && applyForm(); await new Promise(r => setTimeout(r, 250));
      document.querySelector('#posnav button[data-pos]').click(); await new Promise(r => setTimeout(r, 250));
      goStep(2); await new Promise(r => setTimeout(r, 300));
      document.querySelector('#gradeSeg .gcard[data-g="5"]').click(); await new Promise(r => setTimeout(r, 300));
      const a = document.getElementById('gResp'), t = document.getElementById('gTarget');
      const A = a.getBoundingClientRect(), T = t.getBoundingClientRect();
      return { side: Math.abs(A.top - T.top) < 4, below: T.top >= A.bottom, cut: a.scrollWidth > a.clientWidth + 1, val: a.value, w: Math.round(A.width) };
    });
    ok('grade 5: the Responsible default is shown whole, its box not dropped below the date (M7)',
       g.val && !g.cut && (g.below || g.side), JSON.stringify(g));
    await p.evaluate(() => { if (typeof resetForm === 'function') resetForm(); });

    // Settings: the backend rows
    await p.evaluate(() => { document.querySelectorAll('.rtw-ov').forEach(e => e.classList.add('hidden')); document.body.classList.remove('ovopen');
      showPane('paneCapture'); openSettings(); });
    await p.waitForTimeout(400);
    s = short(await p.evaluate(MEASURE, '.picklist'));
    ok('Settings\' backend rows', !s.length, name(s));
    await p.evaluate(() => { const c = document.getElementById('setClose'); c && c.click(); });

    // Saved: the upload-details summary and the report language
    await p.evaluate(async () => {
      await dbPut({ id: 'r1', equip: 'TK146', type: 'MP', date: '2026-10-21', inspector: 'R', positions: { a: { grade: 3, comment: 'x' } }, up: 0, created: Date.now() });
      showPane('paneQueue'); renderPending && renderPending();
      const d = document.getElementById('syncDiag'); if (d) { d.classList.remove('hidden'); if (typeof renderSyncDiag === 'function') renderSyncDiag();
        if (!d.querySelector('summary')) d.innerHTML = '<details><summary>' + t('sync_trace') + '</summary></details>'; }
    });
    await p.waitForTimeout(500);
    s = short((await p.evaluate(MEASURE, '#syncDiag') || []).concat(await p.evaluate(MEASURE, '.replang') || []));
    ok('the Saved tab\'s upload details and report language', !s.length, name(s));
    await ctx.close();
  }
  ok('no page errors', !fails.some(f => /^PAGEERROR/.test(f)), fails.filter(f => /^PAGEERROR/.test(f)).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
