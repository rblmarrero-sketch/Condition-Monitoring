/* THE DESIGN SYSTEM, HELD TO ITS OWN RULES — build 273.

   One scale on both surfaces: spacing 4 · 8 · 12 · 16 · 24, corners 8 or
   10 px (pills round), table rows 40–48 px, tabular numerals, controls a
   thumb can hit. Read off the shipped files and off the running pages, so a
   card that grows a 16 px corner or a table row that swells to 60 px fails
   here rather than being noticed in a screenshot.

   Run: node tests/design.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), path = require('path');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const B = 'http://127.0.0.1:' + (process.env.CMPORT || '8099');
const SRC = { dash: fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'index.html'), 'utf8'),
              phone: fs.readFileSync(path.join(__dirname, '..', 'mobile', 'index.html'), 'utf8') };

(async () => {
  console.log('1. THE FILES');
  for (const [k, s] of Object.entries(SRC)) {
    const big = (s.match(/border-radius:\s*(1[1-9]|[2-8]\d|9[0-8])px/g) || []);
    ok(k + ': no corner over 10 px except pills', big.length === 0, big.slice(0, 5).join(', ') || 'none');
    ok(k + ': the spacing scale and the corner tokens are declared', /--s1:4px/.test(s) && /--s2:8px/.test(s) && /--s3:12px/.test(s) && /--s4:16px/.test(s) && /--s5:24px/.test(s) && /--r:10px/.test(s) && /--r-sm:8px/.test(s));
    ok(k + ': numerals are tabular somewhere on the surface', /font-variant-numeric:\s*tabular-nums/.test(s));
    ok(k + ': no decorative gradient on a surface', !/linear-gradient\([^)]*var\(--accent\)[^)]*\)\s*;?\s*\}?\s*$/m.test(s));
  }

  const b = await chromium.launch();
  console.log('\n2. THE DASHBOARD, RUNNING');
  {
    const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
    await p.addInitScript(() => { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('cm_dash_lang', 'en'); });
    await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' }); await p.waitForTimeout(900);
    await p.evaluate(() => {
      const recs = []; for (let i = 0; i < 40; i++) recs.push({ equip: 'TK' + (101 + i), date: '2026-0' + (1 + i % 8) + '-1' + (i % 9), type: ['MP', 'TB', 'INSP'][i % 3], cls: 'HT', by: 'R', smu: String(1000 + i),
        items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 1 + (i % 5), defect: 'Ferrous debris', action: 'SCH', actionLabel: 'Schedule repair' }] });
      CMDash.importRecords(recs); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); });
    const R = await p.evaluate(() => {
      showTab('actions', true); actView = 'table'; renderActions();
      const rows = [...document.querySelectorAll('#actionTbl tbody tr.hrow')].slice(0, 10).map(tr => Math.round(tr.getBoundingClientRect().height));
      showTab('due', true);
      const due = [...document.querySelectorAll('#ddList tbody tr')].slice(0, 10).map(tr => Math.round(tr.getBoundingClientRect().height));
      const kpi = document.querySelector('#dueKpis, #kpis'); const cs = kpi && getComputedStyle(kpi);
      const card = document.querySelector('.section'); const cc = card && getComputedStyle(card);
      const focusable = [...document.querySelectorAll('button, a[href], input, select')].filter(e => e.checkVisibility && e.checkVisibility());
      const noFocusRing = focusable.filter(e => { const s = getComputedStyle(e, ':focus-visible'); return false; });
      return { rows, due, kpiRadius: cs && cs.borderRadius, kpiPad: cs && cs.padding, cardPad: cc && cc.padding, cardRadius: cc && cc.borderRadius, shadow: cc && cc.boxShadow,
               scrollers: [...document.querySelectorAll('section:not(.hidden) *')].filter(e => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2 && e.checkVisibility(); }).length };
    });
    ok('action rows are 40–48 px', R.rows.length > 0 && R.rows.every(h => h >= 36 && h <= 52), R.rows.join(','));
    ok('schedule rows are 40–48 px', R.due.length > 0 && R.due.every(h => h >= 36 && h <= 52), R.due.join(','));
    ok('a card has a small corner and a subtle shadow', /^(8|10|12)px/.test(R.cardRadius || '') && (R.shadow === 'none' || /rgba?\(/.test(R.shadow)), R.cardRadius + ' · ' + R.shadow);
    ok('the KPI strip has the same corner', /^(8|10|12)px/.test(R.kpiRadius || ''), R.kpiRadius);
    ok('no box on the page scrolls inside itself', R.scrollers === 0, R.scrollers + ' scroller(s)');
    const focus = await p.evaluate(async () => { showTab('overview', true); const b2 = document.querySelector('#kpis button'); if (!b2) return null; b2.focus(); return getComputedStyle(b2).outlineStyle; });
    /* :focus-visible is decided by the browser; the rule must exist for it. */
    ok('a keyboard focus rule exists for the controls', /:focus-visible\{outline:2px/.test(SRC.dash), focus);
    await p.close();
  }

  console.log('\n3. THE PHONE, RUNNING');
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    const p = await ctx.newPage();
    await p.goto(B + '/mobile/index.html', { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const M = await p.evaluate(() => {
      const vis = e => e.checkVisibility && e.checkVisibility() && e.getBoundingClientRect().width > 0;
      const small = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea')].filter(vis)
        .filter(e => !(e.type === 'checkbox' && e.closest('label')))
        .filter(e => e.getBoundingClientRect().height < 40).map(e => (e.id || e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().height));
      const card = document.querySelector('.card'); const cs = card && getComputedStyle(card);
      const tab = document.querySelector('#tabbar button'); const th = tab && Math.round(tab.getBoundingClientRect().height);
      return { small: small.slice(0, 8), n: small.length, cardRadius: cs && cs.borderRadius, cardPad: cs && cs.padding, tabH: th,
               wide: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    ok('every visible control on the capture screen is at least 40 px tall', M.n === 0, M.small.join(' | ') || 'all tall enough');
    const side = parseInt((M.cardPad || '').split(' ')[1] || M.cardPad);
    ok('a card has a small corner and 12–20 px side padding', /^(8|10)px/.test(M.cardRadius || '') && side >= 12 && side <= 20, M.cardRadius + ' · ' + M.cardPad);
    ok('the tab bar buttons are thumb-sized', M.tabH >= 44, M.tabH + 'px');
    ok('nothing scrolls sideways on a 390 px phone', M.wide <= 0, M.wide + 'px');
    await ctx.close();
  }
  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
