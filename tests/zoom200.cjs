/* 200% ZOOM — Phase 6.

   A planner with poor eyesight presses Ctrl-+ four times. The browser then
   lays the page out at half the pixels: a 1366 laptop becomes a 683px
   viewport, a 1920 monitor a 960px one. At both, on every page:
     the page scrolls only up and down;
     nothing is cut off on the right — every control of the toolbar, the
       KPI strip and the page header is inside the viewport;
     no panel hides content behind its own scrollbar;
     a drawer opened from a row fits the viewport and scrolls vertically;
     the in-cell editor fits the cell it was opened in;
     readable text is still at least 11px;
   and nothing throws.

   Run: node tests/zoom200.cjs        (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const BASE = process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : (process.env.CM_BASE || 'http://127.0.0.1:8099');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());
const TABS = ['overview', 'failure', 'wear', 'actions', 'due', 'equipment', 'lube', 'sync', 'reports'];

const AUDIT = () => {
  const vw = document.documentElement.clientWidth;
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.checkVisibility(); };
  const sec = document.querySelector('section:not(.hidden)');
  const roots = [sec, document.querySelector('main > .controls:not(.more)'), document.querySelector('header.app'), document.querySelector('nav.tabs')].filter(Boolean);
  const q = s => roots.flatMap(root => [...root.querySelectorAll(s)]);
  /* A control the reader has to reach: any part of it past the right edge is
     a part they cannot press. Content inside a box that scrolls sideways on
     purpose (a wide table) is not cut off — it scrolls. */
  const inScroller = el => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const cut = q('button, select, input, a[href], summary, .kpi, .pagehd h1').filter(vis).filter(el => !inScroller(el))
    .filter(el => el.getBoundingClientRect().right > vw + 1)
    .map(el => (el.id || el.className || el.tagName) + ':' + Math.round(el.getBoundingClientRect().right - vw)).slice(0, 6);
  const boxes = [...sec.querySelectorAll('*')].filter(vis).filter(el => {
    const cs = getComputedStyle(el); if (!(cs.overflowY === 'auto' || cs.overflowY === 'scroll')) return false;
    if (el.closest('.ov, [role=dialog]')) return false;
    return el.scrollHeight > el.clientHeight + 2 && el.clientHeight < innerHeight * 0.6 && !el.matches('select');
  }).map(el => (el.id || el.className || el.tagName)).slice(0, 4);
  const tiny = [...sec.querySelectorAll('*')].filter(vis).filter(el => el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
    .filter(el => parseFloat(getComputedStyle(el).fontSize) < 11).map(el => (el.className || el.tagName) + ':' + getComputedStyle(el).fontSize).slice(0, 4);
  return { wide: document.documentElement.scrollWidth - vw, cut, boxes, tiny };
};

(async () => {
  await reset('n=40');
  const b = await chromium.launch();
  for (const [w, h, name] of [[683, 384, '1366 laptop at 200% (683×384)'], [960, 540, '1920 monitor at 200% (960×540)']]) {
    console.log('\n' + name.toUpperCase());
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', '');
      localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1'); localStorage.setItem('cm_dash_lang', 'en'); localStorage.setItem('cm_dash_who', 'Planner'); }, BASE + '/exec');
    await p.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 5, null, { timeout: 60000 });
    await p.waitForTimeout(1000);
    const bad = { wide: [], cut: [], boxes: [], tiny: [] };
    for (const t of TABS) {
      await p.evaluate(k => showTab(k, true), t); await p.waitForTimeout(250);
      const r = await p.evaluate(AUDIT);
      if (r.wide > 1) bad.wide.push(t + ' +' + r.wide + 'px');
      if (r.cut.length) bad.cut.push(t + ': ' + r.cut.join(','));
      if (r.boxes.length) bad.boxes.push(t + ': ' + r.boxes.join(','));
      if (r.tiny.length) bad.tiny.push(t + ': ' + r.tiny.join(','));
    }
    ok('no page scrolls sideways', bad.wide.length === 0, bad.wide.join(' | ') || 'all nine clean');
    ok('no control or headline is cut off on the right', bad.cut.length === 0, bad.cut.join(' | ') || 'all reachable');
    ok('no panel hides content behind its own scrollbar', bad.boxes.length === 0, bad.boxes.join(' | ') || 'none');
    ok('readable text stays at 11px or more', bad.tiny.length === 0, bad.tiny.join(' | ') || 'all');

    /* the register: a drawer from a row, and an editor in a cell */
    await p.evaluate(() => { showTab('actions', true); actView = 'table'; renderActions(); });
    await p.waitForTimeout(300);
    const D = await p.evaluate(() => {
      const tr = document.querySelector('#actionTbl tbody tr.hrow'); if (!tr) return null;
      openFollow(tr.dataset.fu, tr.dataset.fi);
      const box = document.querySelector('#follOv .drawer, #follOv > div');
      const r = box.getBoundingClientRect();
      const cs = getComputedStyle(box);
      const out = { fits: r.right <= innerWidth + 1 && r.left >= -1, w: Math.round(r.width), vw: innerWidth,
                    scrolls: box.scrollHeight <= box.clientHeight + 2 || cs.overflowY === 'auto' || cs.overflowY === 'scroll' || [...box.querySelectorAll('*')].some(e => { const c = getComputedStyle(e); return (c.overflowY === 'auto' || c.overflowY === 'scroll') && e.scrollHeight > e.clientHeight; }),
                    save: (() => { const s = document.getElementById('follSave'); const rr = s.getBoundingClientRect(); return rr.right <= innerWidth + 1; })() };
      closeFollow(); return out; });
    ok('the follow-up drawer fits the viewport and can be scrolled to its Save button', D && D.fits && D.scrolls && D.save, JSON.stringify(D));
    await p.evaluate(() => { window.CMDrive.saveEdit = () => Promise.resolve({ ok: 1 }); window.CMDrive.configured = () => true; });
    const cell = p.locator('#actionTbl tbody tr.hrow td[data-ed="owner"]').first();
    await cell.scrollIntoViewIfNeeded(); await cell.click(); await p.waitForTimeout(150);
    const E = await p.evaluate(() => { const e = document.querySelector('#actionTbl .celled'); if (!e) return null;
      const td = e.closest('td'), r = e.getBoundingClientRect(), t = td.getBoundingClientRect();
      return { inCell: r.left >= t.left - 1 && r.right <= t.right + 1, h: Math.round(r.height), focused: document.activeElement === e }; });
    ok('the in-cell editor opens inside its cell, focused, at a usable height', E && E.inCell && E.h >= 28 && E.focused, JSON.stringify(E));
    await p.keyboard.press('Escape');
    ok('no application errors at ' + w, errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
    await p.close();
  }
  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
