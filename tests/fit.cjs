/* Does it fit — on every width, in both languages, on every round.

   Three faults that a screenshot hides and a passing suite does not catch:

     1. The document wider than the window. Eleven pixels is enough: the browser
        zooms the whole page out to fit, fixed elements are positioned against
        the layout viewport, and the tab bar and the Save button end up floating
        in the middle of the screen. It has happened twice — a chip row in build
        85, the dump-body note in build 87 — and both times it presented as
        "the buttons are broken", three cards away from the actual cause.

     2. Text sliced off by a box that never expected it. An ellipsis is a
        decision and is allowed; text that simply stops is not. Russian is where
        this bites: "Зарождающийся" has nowhere to break and was cut in half in
        three of the four severity buttons, on the commonest phone in the fleet,
        in the language most of the fleet reads.

     3. A control under 40 px. The floor is 44 for a gloved hand at -40 °C; 40
        is the line below which this refuses to pass.

   The one documented exception is the numbered pucks on the machine drawing at
   320 px CSS width. They scale with the picture, and at that width they measure
   about 36 px. Enlarging them makes neighbouring numbers overlap, which trades
   a small target for a wrong reading — so the chip row underneath, which is
   always 44, is the reliable path there. Reported every run, never silent.
*/
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const found = [], noted = [];
const note = (w, l, scr, msg) =>
  (w === 320 && /^SVG /.test(msg) ? noted : found).push(`[${w}px ${l} ${scr}] ${msg}`);

const AUDIT = () => {
  const out = { overflow: 0, small: [], clipped: [] };
  out.overflow = Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const seen = new Set();
  document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[tabindex]').forEach(e => {
    if (!e.getClientRects().length) return;
    const r = e.getBoundingClientRect();
    if (r.height < 40 || r.width < 40) {
      const svg = !!e.ownerSVGElement;
      const k = (svg ? 'SVG ' : '') + ((e.id || (typeof e.className === 'string' ? e.className : (e.getAttribute('class') || '')) || e.tagName) + '');
      if (!seen.has(k)) { seen.add(k); out.small.push(k.slice(0, 40) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }
    }
  });
  document.querySelectorAll('button,label>span,.hint,option,td,th,b,.band').forEach(e => {
    if (!e.getClientRects().length) return;
    const cs = getComputedStyle(e);
    /* An ellipsis is a decision, not a defect — the element said "cut me here".
       What this looks for is text sliced off by a box that never expected it,
       which shows no ellipsis and simply disappears. */
    if (cs.textOverflow === 'ellipsis' || cs.overflowX === 'auto' || cs.overflowX === 'scroll') return;
    if (e.scrollWidth > e.clientWidth + 1)
      out.clipped.push(((e.id || e.className || e.tagName) + '').slice(0, 26) +
        ' "' + (e.textContent || '').trim().slice(0, 22) + '" ' + e.scrollWidth + '>' + e.clientWidth);
  });
  return out;
};

(async () => {
  const b = await chromium.launch();
  for (const W of [320, 390, 412, 768]) {
    for (const L of ['en', 'ru']) {
      const ctx = await b.newContext({ viewport: { width: W, height: 844 }, isMobile: W < 700, hasTouch: true });
      const p = await ctx.newPage();
      p.on('pageerror', e => found.push('PAGEERROR ' + e.message));
      await p.addInitScript(l => { localStorage.setItem('up_dests', '[]'); localStorage.setItem('lang', l); }, L);
      await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
      await p.waitForTimeout(1600);
      await p.evaluate(l => { const btn = document.querySelector('.lang button[data-lang="' + l + '"]'); if (btn) btn.click(); }, L);
      await p.waitForTimeout(400);
      const T = (t) => p.evaluate(x => { const s = document.getElementById('typeSel'); s.value = x; s.dispatchEvent(new Event('change')); }, t);
      const check = async (scr) => {
        const r = await p.evaluate(AUDIT);
        if (r.overflow > 0) note(W, L, scr, 'document is ' + r.overflow + 'px wider than the window');
        r.small.forEach(s => note(W, L, scr, (/^SVG /.test(s) ? 'SVG ' : '') + 'tap target under 40px: ' + s.replace(/^SVG /, '')));
        r.clipped.slice(0, 5).forEach(s => note(W, L, scr, 'text clipped: ' + s));
      };
      await check('landing');
      for (const [ty, unit] of [['MP', 'TK032'], ['INSP', 'TK032'], ['TEMP', 'TK032'],
                                ['UC', 'DZ001'], ['GET', 'EX001'], ['TB', 'TK101']]) {
        await T(ty); await p.waitForTimeout(300);
        await p.evaluate(x => selectEquip(x), unit); await p.waitForTimeout(800);
        await check(ty + ' map');
        await p.evaluate(() => { const n = document.querySelector('#posnav [data-ucg],#posnav [data-pos],#posnav [data-l7]');
          if (n) n.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        await p.waitForTimeout(600);
        await p.evaluate(() => { const n = document.querySelector('#posnav [data-l8]');
          if (n) n.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        await p.waitForTimeout(600);
        await check(ty + ' point');
      }
      /* The tab bar keys off data-pane, not data-tab. Getting that wrong meant
         the queue and the system screen were never actually opened — this swept
         the capture screen three times and reported it as full coverage. */
      for (const tab of ['paneQueue', 'paneSystem']) {
        const moved = await p.evaluate(t => { const e = document.querySelector('.tabbar [data-pane="' + t + '"]');
          if (!e) return false; e.click();
          return document.getElementById(t).classList.contains('on'); }, tab);
        if (!moved) found.push(`[${W}px ${L}] could not open ${tab}`);
        await p.waitForTimeout(500); await check(tab);
      }
      await ctx.close();
    }
  }
  await b.close();
  const uniq = [...new Set(found)], skip = [...new Set(noted)];
  if (skip.length) console.log('  NOTE  the documented 320px exception, ' + skip.length + ' places:\n        ' + skip[0]);
  if (!uniq.length)
    console.log('  PASS  four widths, two languages, seven rounds: nothing overflows the window, no text is cut, no control is under 40px');
  else console.log(uniq.join('\n'));
  console.log(uniq.length ? '\nFAILED: ' + uniq.length : '\nall passed');
  process.exit(uniq.length ? 1 : 0);
})();
