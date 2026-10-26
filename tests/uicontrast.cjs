/* TEXT THAT CAN BE READ IN BOTH THEMES (audit 26.10 M4, M5, M6, D7).

   Read off the screen, never off a class name: each element's computed text
   colour against the fill it actually sits on, in light and in dark.

   Phone
     M4  the selected undercarriage chip's number: .posnav button.on filled the
         chip with ink and left the badge light-on-light (1.06:1).
     M5  white on the copper accent in dark (3.0:1): the Saved count, the tab
         badge, the LEFT/RIGHT switch.
     M6  the readiness badge, "Ready with warning" in dark (2.2:1), and "Ready".
   Office (both pages)
     D7  text coloured --good / --critical, which the dark theme never redefines.
         Text uses --good-ink / --crit-ink; no rule may colour text with the
         fill token again.

   Run: node tests/uicontrast.cjs   (serves the repo itself on 8479) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8479), BASE = `http://127.0.0.1:${PORT}`;
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

/* In the page: the contrast of an element's text against the first opaque fill
   at or above it. */
const RATIO = () => {
  window.__ratio = el => {
    const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
    const lum = c => { const v = c.slice(0, 3).map(x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); });
                       return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
    let bg = null;
    for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > .5)) { bg = c; break; } }
    bg = bg || [255, 255, 255];
    const A = lum(rgb(getComputedStyle(el).color)), B = lum(bg);
    return Math.round((Math.max(A, B) + .05) / (Math.min(A, B) + .05) * 100) / 100;
  };
};

(async () => {
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const b = await chromium.launch();

  console.log('\n1. PHONE');
  for (const theme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: theme, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    await p.addInitScript(RATIO);
    await p.addInitScript(() => localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', on: true, url: 'http://127.0.0.1:9/exec' }])));
    await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof selectEquip === 'function' && typeof WEAR === 'object', null, { timeout: 20000 });
    await p.waitForTimeout(2500);
    const r = await p.evaluate(async () => {
      document.querySelector('[data-type="UC"],[data-t="UC"]')?.click();
      if (typeof setType === 'function') setType('UC');
      selectEquip('DZ001'); goStep(2); await new Promise(r => setTimeout(r, 400));
      pickComponent(WEAR.walk(ucStatus(curEquip).model)[8].k); await new Promise(r => setTimeout(r, 400));
      const out = {};
      const on = document.querySelector('.ucgroups button.on i');
      out.chip = on ? __ratio(on) : null;
      const side = document.querySelector('.ucsides button.on');
      out.side = side ? __ratio(side) : null;
      const qc = document.getElementById('qCount'); qc.textContent = '3'; out.count = __ratio(qc);
      const tb = document.querySelector('.tabbar .tb'); if (tb) { tb.textContent = '2'; tb.hidden = false; tb.style.display = 'block'; out.tab = __ratio(tb); }
      const yb = document.getElementById('yardBadge');
      yb.className = 'count-badge warn'; out.warn = __ratio(yb);
      yb.className = 'count-badge ok'; out.ok = __ratio(yb);
      yb.className = 'count-badge bad'; out.bad = __ratio(yb);
      return out;
    });
    ok(`${theme}: the selected undercarriage chip's number reads (M4)`, r.chip >= 4.5, r.chip);
    ok(`${theme}: LEFT/RIGHT, the Saved count and the tab badge read on the accent (M5)`,
       r.side >= 4.5 && r.count >= 4.5 && (r.tab == null || r.tab >= 4.5), JSON.stringify([r.side, r.count, r.tab]));
    ok(`${theme}: the readiness badge reads in every verdict (M6)`, r.warn >= 4.5 && r.ok >= 4.5 && r.bad >= 4.5, JSON.stringify([r.ok, r.warn, r.bad]));
    await ctx.close();
  }

  console.log('\n2. OFFICE, BOTH PAGES (D7)');
  for (const page of ['dashboard', 'dashboard-next']) {
    const src = fs.readFileSync(path.join(ROOT, page, 'index.html'), 'utf8');
    const left = src.match(/[^-]color:var\(--(good|critical)\)/g) || [];
    ok(`${page}: no rule colours text with the fill tokens --good / --critical`, left.length === 0, left.slice(0, 3).join(' '));
    /* Dark only: that is where the fill tokens were never redefined. The light
       inks are unchanged by this fix. */
    for (const theme of ['dark']) {
      const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: theme });
      const p = await ctx.newPage();
      await p.addInitScript(RATIO);
      await p.goto(`${BASE}/${page}/index.html`, { waitUntil: 'load' });
      await p.waitForTimeout(800);
      const r = await p.evaluate(() => {
        const out = {};
        for (const [k, cls] of [['good', 'b-ok'], ['crit', 'b-act'], ['kpi', 'kpi bad']]) {
          const host = document.createElement('div'); host.className = cls === 'kpi bad' ? 'kpi bad' : 'pos';
          host.innerHTML = cls === 'kpi bad' ? '<span class="v">12</span>' : `<span class="${cls}">Text</span>`;
          (document.querySelector('main') || document.body).appendChild(host);
          out[k] = __ratio(host.querySelector(cls === 'kpi bad' ? '.v' : '.' + cls)); host.remove();
        }
        return out;
      });
      ok(`${page} ${theme}: good / critical text reads at 4.5:1 or better`, r.good >= 4.5 && r.crit >= 4.5 && r.kpi >= 4.5, JSON.stringify(r));
      await ctx.close();
    }
  }

  ok('no page errors', !fails.some(f => /^PAGEERROR/.test(f)), fails.filter(f => /^PAGEERROR/.test(f)).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
