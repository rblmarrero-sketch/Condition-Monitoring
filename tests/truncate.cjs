/* LABELS THAT CLIPPED: "Co…", "All t…", "TRUCK, D…", "202…".

   Audit of 2026-10-01, three places:
     - the phone's header title read "Condition Moni…" (on this rig "Co…")
       beside a connection pill that says a sentence;
     - the office filter dropdowns read "All ty…", "All cl…" — the cap was
       88 px, narrower than their own default option;
     - the machine line on the findings steps cut the class and the date,
       which are what the line is for.

   Each is measured, not eyeballed, at the widths the fleet and the office
   use, in both languages — and the office bar is held to ONE row, because
   that is what its width cap has always been protecting.

   Run: node tests/truncate.cjs   (starts its own server on 8153) */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(8153);
const B = 'http://127.0.0.1:8153';

/* Text that does not fit its own box: wider (one line) or taller (wrapped
   past what is shown) than what the element shows. */
const CLIP = el => !el ? 'missing' : (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
  ? `${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}` : '';

(async () => {
  const b = await chromium.launch();

  console.log('\n1. THE PHONE HEADER — the title and the connection pill, whole');
  for (const lang of ['en', 'ru']) for (const W of [360, 390, 412]) {
    const ctx = await b.newContext({ viewport: { width: W, height: 800 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(l => { localStorage.setItem('lang', l); localStorage.setItem('up_dests', '[]'); }, lang);
    const p = await ctx.newPage();
    await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
    await p.waitForTimeout(500);
    const r = await p.evaluate(CLIP => {
      const f = new Function('return ' + CLIP)();
      const t = document.querySelector('header .t'), n = document.getElementById('netStatus'), h = document.querySelector('header');
      return { title: f(t), net: f(n), text: t.textContent, netText: n.textContent, h: h.offsetHeight };
    }, CLIP.toString());
    ok(`${lang} ${W}px: the title shows whole ("${r.text}")`, r.title === '', r.title);
    ok(`${lang} ${W}px: the connection pill shows whole ("${r.netText}")`, r.net === '', r.net);
    // 64 px before; the worst case (Russian, 360 px, the offline sentence) wraps the pill to four lines.
    ok(`${lang} ${W}px: the header stays compact (no taller than 80 px)`, r.h <= 80, r.h);
    await ctx.close();
  }

  console.log('\n2. THE MACHINE LINE ON THE FINDINGS STEPS — class and date, whole');
  {
    const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    const p = await ctx.newPage();
    await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
    const r = await p.evaluate(CLIP => {
      const f = new Function('return ' + CLIP)();
      // Long enough to have been cut before: a unit, a long class and a date.
      const box = document.createElement('div'); box.style.width = '336px';
      box.innerHTML = '<button class="stepctx"><b>TK146</b><i>TRUCK, DUMP · TEREX TR60 · 2026-10-01 · Ivanov</i><span class="go">›</span></button>'
        + '<button class="hdrsum"><span class="hs-t"><b>TK146 · Magnetic plug</b><i>TRUCK, DUMP · 2026-10-01 · B. Ivanov · 12 345 h</i></span><span class="hs-e">Edit</span></button>';
      document.querySelector('main').prepend(box);
      return { ctx: f(box.querySelector('.stepctx i')), sum: f(box.querySelector('.hdrsum i')) };
    }, CLIP.toString());
    ok('the step context line wraps instead of cutting "TRUCK, D…"', r.ctx === '', r.ctx);
    ok('the folded round header does the same', r.sum === '', r.sum);
    await ctx.close();
  }

  console.log('\n3. THE OFFICE FILTER BAR — wider dropdowns, still one row, full text on hover');
  for (const file of ['dashboard', 'dashboard-next']) for (const lang of ['en', 'ru']) for (const W of [1280, 1366, 1440]) {
    const ctx = await b.newContext({ viewport: { width: W, height: 800 } });
    await ctx.addInitScript(l => localStorage.setItem('cm_dash_lang', l), lang);
    const p = await ctx.newPage();
    await p.goto(`${B}/${file}/index.html`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.CMDash, null, { timeout: 15000 });
    await p.waitForTimeout(400);
    // The cap this change replaced: 88 px between 1331 and 1500 on dashboard/. At 1330 and below
    // the cap stays 92 (the search field's 260 px floor, tests/layout.cjs); dashboard-next/ was already wider.
    const oldCap = (file === 'dashboard' && W > 1330 && W <= 1500) ? 88 : 0;
    const r = await p.evaluate(oldCap => {
      const bar = document.querySelector('main > .controls:not(.more)');
      const sels = [...bar.querySelectorAll('select')].filter(s => s.offsetWidth);
      const h = bar.offsetHeight;
      // The same bar with the old 88 px cap — the wider dropdowns must not add a row.
      sels.forEach(s => { s.dataset.mw = s.style.maxWidth; if (oldCap) s.style.maxWidth = oldCap + 'px'; });
      const h0 = bar.offsetHeight;
      sels.forEach(s => { s.style.maxWidth = s.dataset.mw; });
      return { n: sels.length, minW: Math.min(...sels.map(s => s.offsetWidth)), h, h0 };
    }, oldCap);
    ok(`${file} ${lang} ${W}: the bar is no taller than it was with the old cap`, r.h <= r.h0, JSON.stringify(r));
    if (file === 'dashboard' && W > 1330 && W <= 1440) ok(`${file} ${lang} ${W}: dropdowns are 100 px, not 88`, r.minW >= 99 || r.n === 0, JSON.stringify(r));
    // hover → tooltip with the chosen option's whole text
    const sel = await p.$('main > .controls:not(.more) select');
    if (sel) {
      await sel.hover();
      const tip = await p.evaluate(s => ({ title: s.title, text: s.options[s.selectedIndex] && s.options[s.selectedIndex].text }), sel);
      ok(`${file} ${lang} ${W}: hovering a dropdown shows its whole choice ("${tip.text}")`, tip.title && tip.title === tip.text, JSON.stringify(tip));
    }
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); srv.close(); process.exit(1); });
