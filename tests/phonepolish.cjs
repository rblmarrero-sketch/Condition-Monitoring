/* THE PHONE'S MEDIUM AUDIT ITEMS (audit 26.10 F9-F12, F14-F20).

   Measured on the real page at 360 and 390 px, English and Russian, light and
   dark:
     F11  no text a person reads is under 11 px (the tray's station codes on
          the drawing excepted: they are SVG labels scaled with the map)
     F15  on the Saved list Delete is the same plain button as Report and Edit:
          no box of its own, red ink only, never the loudest thing on the row
     F16  the stale-data line on Due is a notice, not a grade-5 alarm: warning
          ink, regular weight, two lines with the rest a tap away
     F18  the header pill says the state ("Offline" / "Нет связи"); the whole
          sentence is its title
     F19  in Russian the RTW item's status badge sits under the title instead
          of squeezing it
     F20  small text on the RTW checklist and on Settings' active destination
          reads at 4.5:1 or better in dark
   Batch B, in light: F9 back and forward one height (52 px); F10 the measured
   millimetres the big field; F12 choosing one of several is the accent fill;
   F14 the overlays' 12 px gutter and the map stopping at the card's rail; F17
   "Condition grade" a field label, Settings' labels in sentence case.

   Run: node tests/phonepolish.cjs   (serves the repo itself on 8483) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8483), BASE = `http://127.0.0.1:${PORT}`;
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
const T = (() => { global.window = global; require('../mobile/terms.js'); return global.TERMS; })();

global.self = global; require('../mobile/due.js');
const plus = n => self.DUE.shift(self.DUE.today(), n);
const FIXTURE = { generated: new Date().toISOString(), byUnit: {}, rtwOpen: [
  { wo: 'WO-1', equip: 'TK112', cls: 'HT', comp: 'Rear Differential', desc: 'Ferrous debris', priority: 'P1 Critical',
    raised: plus(-3), type: '4000 Hours service Planned', hours: 4000, plan: plus(-3), cmmsStatus: 'Registered' } ] };

/* In the page: visible text under `root` smaller than 11 px, and its contrast. */
const TEXT = (root) => {
  const host = document.querySelector(root); if (!host) return null;
  const vis = e => { if (!e.getClientRects().length) return false; const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false;
    for (let p = e; p; p = p.parentElement) if (p.classList && p.classList.contains('hidden')) return false;
    const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  /* A colour-mix() background resolves to color(srgb …), not rgb(): read both, or
     the text is measured against the page behind its tinted box. */
  const parse = s => { let m = s.match(/rgba?\(([^)]+)\)/); if (m) { const a = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [a[0], a[1], a[2], a[3] == null ? 1 : a[3]]; }
    m = s.match(/color\(srgb ([^)]+)\)/); if (m) { const a = m[1].split(/[ /]+/).filter(Boolean).map(Number); return [a[0] * 255, a[1] * 255, a[2] * 255, a[3] == null ? 1 : a[3]]; } return null; };
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const bgOf = e => { const st = []; for (let p = e; p && p.nodeType === 1; p = p.parentElement) { const c = parse(getComputedStyle(p).backgroundColor); if (c && c[3] > 0) { st.push(c); if (c[3] >= 1) break; } }
    let b = parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];
    for (let i = st.length - 1; i >= 0; i--) { const c = st[i]; b = [c[0] * c[3] + b[0] * (1 - c[3]), c[1] * c[3] + b[1] * (1 - c[3]), c[2] * c[3] + b[2] * (1 - c[3]), 1]; } return b; };
  const out = [], done = new Set(), tw = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    if (!n.textContent.trim()) continue; const e = n.parentElement; if (!e || done.has(e) || !vis(e)) continue; done.add(e);
    if (['SCRIPT', 'STYLE', 'OPTION'].includes(e.tagName) || e.closest('svg')) continue;
    const cs = getComputedStyle(e), fg = parse(cs.color), bg = bgOf(e);
    let cr = null; if (fg) { const f = [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])); const a = lum(f), b = lum(bg); cr = (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }
    out.push({ id: e.id || String(e.className || e.tagName).split(/\s+/)[0], t: n.textContent.trim().slice(0, 24), fs: parseFloat(cs.fontSize), cr: cr && +cr.toFixed(2) });
  }
  return out;
};

(async () => {
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const b = await chromium.launch();
  for (const [w, h] of [[360, 640], [390, 844]]) for (const lang of ['en', 'ru']) for (const theme of ['light', 'dark']) {
    console.log(`\n${w}x${h} ${lang} ${theme}`);
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, serviceWorkers: 'block', colorScheme: theme });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    await p.addInitScript(([l, th]) => {
      localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', on: true, url: 'http://127.0.0.1:9/exec' }]));
      localStorage.setItem('lang', l); localStorage.setItem('cm_lang', l); localStorage.setItem('theme', th);
    }, [lang, theme]);
    await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof showPane === 'function' && typeof renderDue === 'function', null, { timeout: 20000 });
    await p.waitForTimeout(1500);
    await p.evaluate(th => { document.documentElement.setAttribute('data-theme', th);
      const d = document.getElementById('dlg'); if (d && !d.classList.contains('hidden')) (document.getElementById('dlgCancel') || document.getElementById('dlgOk')).click(); }, theme);
    const small = [];
    const take = async (where, root) => { ((await p.evaluate(TEXT, root)) || []).filter(x => x.fs < 11).forEach(x => small.push(`${where}: ${x.id} "${x.t}" ${x.fs}px`)); };

    /* F18: the pill */
    const pill = await p.evaluate(async () => { await renderNet(); const e = document.getElementById('netStatus'); return { t: e.textContent.trim(), title: e.title }; });
    ok('F18 the header pill says the state, its title the sentence', pill.t === T[lang].offline && pill.title === T[lang].offline_saved, `${pill.t} | ${pill.title}`);
    await take('capture', '#paneCapture'); await take('header', 'header');

    /* F15: the Saved list */
    const sv = await p.evaluate(async () => {
      await dbPut({ id: 'r1', equip: 'TK146', type: 'MP', date: '2026-10-21', inspector: 'R', positions: { a: { grade: 3, comment: 'x' } }, up: 0, created: Date.now() });
      showPane('paneQueue'); await renderPending(); await new Promise(r => setTimeout(r, 300));
      const row = document.querySelector('#pendingList .pitem') || document.querySelector('.pitem');
      const st = s => { const e = row.querySelector(s), c = getComputedStyle(e), r = e.getBoundingClientRect(); return { bw: c.borderTopWidth, bc: c.borderTopColor, bg: c.backgroundColor, w: Math.round(r.width), h: Math.round(r.height), col: c.color }; };
      return { del: st('.del'), edit: st('.edit'), ink: getComputedStyle(document.documentElement).getPropertyValue('--crit-ink').trim() };
    });
    const boxed = x => x.bw !== '0px' && !/rgba\(0, 0, 0, 0\)|transparent/.test(x.bc);
    ok('F15 Delete is the same plain button as Edit: no box of its own, same size', !boxed(sv.del) && sv.del.w === sv.edit.w && sv.del.h === sv.edit.h, JSON.stringify(sv.del));
    await take('saved', '#paneQueue');

    /* F16: the stale-data notice */
    await p.evaluate(fx => { SCHED = fx; dueView = 'pm'; showPane('paneDue'); renderDue(); }, FIXTURE);
    await p.waitForTimeout(500);
    const nt = await p.evaluate(() => {
      const e = document.getElementById('dueStrayNote'); if (!e || e.classList.contains('hidden')) return null;
      const s = e.querySelector('span') || e, c = getComputedStyle(e), lh = parseFloat(getComputedStyle(s).lineHeight);
      const r = getComputedStyle(document.documentElement);
      const h0 = s.getBoundingClientRect().height; e.click(); const h1 = s.getBoundingClientRect().height; e.click();
      return { warn: e.classList.contains('warn'), col: c.color, fw: c.fontWeight, lines: Math.round(h0 / lh), open: h1 > h0, crit: r.getPropertyValue('--critical').trim(), title: !!e.title };
    });
    if (nt && nt.warn) {
      const hex = h => { const m = h.match(/^#(..)(..)(..)$/i); return m ? `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})` : h; };
      ok('F16 the stale-data line is a notice: not the grade-5 red, regular weight', nt.col !== hex(nt.crit) && +nt.fw < 600, JSON.stringify(nt));
      ok('F16 two lines, the rest a tap away, the whole of it on its title', nt.lines <= 2 && nt.open && nt.title, JSON.stringify(nt));
    } else ok('F16 the stale-data notice is on screen (a fresh phone has never synced)', false, JSON.stringify(nt));
    await take('due', '#paneDue');

    /* the 1C PM info sheet, then the RTW checklist */
    await p.click('#duePmList [data-wo="WO-1"]'); await p.waitForTimeout(300);
    await take('pm info', '#pmOv');
    await p.click('#pmStartRtwBtn'); await p.waitForTimeout(500);
    await take('rtw', '#rtwChecklistScr');
    const rt = await p.evaluate(() => {
      const it = document.querySelector('#rtwChecklistBody .rtw-item'), hd = it.querySelector('.rtw-item-head');
      const tt = hd.querySelector('.rtw-item-title'), bd = hd.querySelector('.rtw-item-badge');
      const lh = parseFloat(getComputedStyle(tt).lineHeight);
      return { lines: Math.round(tt.getBoundingClientRect().height / lh), below: bd.getBoundingClientRect().top >= tt.getBoundingClientRect().bottom - 1 };
    });
    if (lang === 'ru' && w <= 430) ok('F19 in Russian the status badge sits under the RTW item title', rt.below && rt.lines <= 3, JSON.stringify(rt));
    if (theme === 'dark') {
      const low = ((await p.evaluate(TEXT, '#rtwChecklistScr')) || []).filter(x => x.cr && x.cr < 4.5 && /^(no|rtw-item-badge)$/.test(x.id));
      ok('F20 the RTW item number and status read at 4.5:1 in dark', !low.length, low.map(x => `${x.id} "${x.t}" ${x.cr}`).join(' | '));
    }

    /* Settings: the active destination */
    await p.evaluate(() => { document.querySelectorAll('.rtw-ov').forEach(e => e.classList.add('hidden')); document.body.classList.remove('ovopen');
      showPane('paneCapture'); openSettings(); });
    await p.waitForTimeout(400);
    if (theme === 'dark') {
      const all = await p.evaluate(TEXT, '#setOv .dest.on'), low = (all || []).filter(x => x.cr && x.cr < 4.5);
      ok('F20 text on Settings\' active destination reads at 4.5:1 in dark', all && all.length && !low.length, all ? low.map(x => `${x.id} "${x.t}" ${x.cr}`).join(' | ') : 'no active destination found');
    }
    await take('settings', '#setOv');
    ok('F11 no text on these screens is under 11 px', !small.length, small.slice(0, 6).join(' | '));

    /* BATCH B (audit F9 F10 F12 F14 F17), light only: these are shapes, not colours */
    if (theme === 'light') {
      const st = await p.evaluate(() => { const fs = [...document.querySelectorAll('#setOv label.fld > span')].filter(e => e.getClientRects().length);
        const rows = [...document.querySelectorAll('#setOv .row')].filter(e => e.getClientRects().length).map(r => [...r.querySelectorAll('input')].filter(e => e.getClientRects().length).map(i => Math.round(i.getBoundingClientRect().bottom)));
        return { upper: fs.filter(e => getComputedStyle(e).textTransform === 'uppercase').map(e => e.textContent.trim().slice(0, 20)), rows: rows.filter(r => r.length > 1 && Math.max(...r) - Math.min(...r) > 1) }; });
      ok('F17 Settings\' labels are sentence case, and two fields in a row line up', !st.upper.length && !st.rows.length, JSON.stringify(st));
      await p.evaluate(() => { const c = document.getElementById('setClose'); c && c.click(); });
      const cap = await p.evaluate(async () => {
        const out = {};
        const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        const probe = document.createElement('i'); document.body.appendChild(probe);
        const rgb = v => { probe.style.color = v; return getComputedStyle(probe).color; };
        out.accent = rgb('var(--accent)'); out.soft = rgb('var(--accent-soft)');
        const sel = document.getElementById('typeSel'); sel.value = 'MP'; sel.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 150));
        selectEquip('TK146'); goStep(2); await new Promise(r => setTimeout(r, 400));
        const pos = document.querySelector('#posnav > button.on, .posnav > button.on'); out.pos = pos && getComputedStyle(pos).backgroundColor;
        const gl = document.querySelector('#gradeFld > span'); out.grade = gl && { fs: getComputedStyle(gl).fontSize, tt: getComputedStyle(gl).textTransform };
        const nav = [...document.querySelectorAll('.stepnav')].find(e => e.getClientRects().length);
        out.nav = nav && [...nav.querySelectorAll('.btn')].filter(e => e.getClientRects().length).map(b => Math.round(b.getBoundingClientRect().height));
        sel.value = 'UC'; sel.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 150));
        selectEquip('DZ001'); goStep(2); await new Promise(r => setTimeout(r, 500));
        const v = document.querySelector('.ucviews button.on'); out.ucview = v && getComputedStyle(v).backgroundColor;
        const card = document.getElementById('cardComponent'), maps = document.querySelector('.ucmaps');
        if (card && maps) { const cs = getComputedStyle(card); out.rail = Math.round(maps.getBoundingClientRect().left - (card.getBoundingClientRect().left + parseFloat(cs.borderLeftWidth))); }
        pickComponent(ucOrder()[4]); await new Promise(r => setTimeout(r, 400));
        const mm = document.getElementById('ucMM'); out.mm = mm && { h: Math.round(mm.getBoundingClientRect().height), fs: parseFloat(getComputedStyle(mm).fontSize) };
        showPane('paneDue'); renderDue(); await new Promise(r => setTimeout(r, 300));
        const vs = document.querySelector('.viewseg button.on'); out.viewseg = vs && getComputedStyle(vs).backgroundColor;
        probe.remove(); return out; });
      ok('F12 choosing one of several is the accent fill: position, mode and view', cap.pos === cap.accent && cap.ucview === cap.accent && cap.viewseg === cap.accent, JSON.stringify(cap));
      ok('F9 back and forward are one height, 52 px', cap.nav && cap.nav.length && cap.nav.every(h => h === cap.nav[0] && h >= 52), JSON.stringify(cap.nav));
      ok('F10 the measured millimetres are the big field', cap.mm && cap.mm.h >= 48 && cap.mm.fs >= 20, JSON.stringify(cap.mm));
      ok('F14 the undercarriage map stops at the card\'s rail, not over it', cap.rail != null && cap.rail >= 0, JSON.stringify(cap.rail));
      ok('F17 "Condition grade" is a field label like the others', cap.grade && cap.grade.fs === '11px' && cap.grade.tt === 'uppercase', JSON.stringify(cap.grade));
      const ov = await p.evaluate(async fx => { SCHED = fx; dueView = 'pm'; showPane('paneDue'); renderDue(); await new Promise(r => setTimeout(r, 300));
        document.querySelector('#duePmList [data-wo="WO-1"]').click(); await new Promise(r => setTimeout(r, 300));
        const b = document.querySelector('#pmOv .rtw-ov-body'), cs = getComputedStyle(b); const o = [cs.paddingLeft, cs.paddingRight];
        document.querySelectorAll('.rtw-ov').forEach(e => e.classList.add('hidden')); document.body.classList.remove('ovopen'); return o; }, FIXTURE);
      ok('F14 an overlay keeps the app\'s 12 px gutter', ov[0] === '12px' && ov[1] === '12px', JSON.stringify(ov));
    }
    await ctx.close();
  }
  ok('no page errors', !fails.some(f => /^PAGEERROR/.test(f)), fails.filter(f => /^PAGEERROR/.test(f)).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
