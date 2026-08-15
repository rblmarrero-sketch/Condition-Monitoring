/* Which round am I in — the colour part, checked rather than admired.

   Seven rounds, seven tints. The design constraint is measured, not stylistic:
   five colours are already spent on meaning (the action accent, plus good,
   warning, serious and critical) and for a red-green colour-blind reader they
   occupy both ends of the only axis left. Sweeping the hue wheel against those
   five, no hue clears both the CVD gate and the normal-vision floor. So a round
   is identified by its CODE, and the tint is ambient reinforcement — pale
   enough that it can never be read as a status.

   Two faults shipped in the hour this was written, and both are guarded here:

     · Both dark blocks were placed ABOVE the light one. Single-class selectors,
       so specificity cannot settle it and source order did: every round wore
       its pale tint on a black page. Nothing threw. The screenshot caught it.

     · Removing a mis-scoped block took the @media closing brace with it, so
       the whole stylesheet after line 47 was swallowed. The app rendered as
       unstyled serif text and, again, nothing threw.

   A stylesheet cannot fail loudly, which is exactly why it needs a test.
*/
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs');
const B = 'http://127.0.0.1:8093';
const ROOT = require('path').join(__dirname, '..');
const ROUNDS = ['MP', 'FC', 'INSP', 'TEMP', 'UC', 'GET', 'TB'];
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* WCAG contrast, computed in the page against whatever actually rendered. */
const CONTRAST = `(function(){
  const lin = v => v <= 0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
  const lum = c => { const m = c.match(/[\\d.]+/g).map(Number);
    return 0.2126*lin(m[0]/255) + 0.7152*lin(m[1]/255) + 0.0722*lin(m[2]/255); };
  return (a,b) => { const [h,l] = [lum(a),lum(b)].sort((x,y)=>y-x); return (h+0.05)/(l+0.05); };
})()`;

(async () => {
  console.log('the stylesheet is even parseable');
  /* The cheapest check in the file and the one that would have saved an hour. */
  const html = fs.readFileSync(ROOT + '/mobile/index.html', 'utf8');
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
  let depth = 0, stray = 0;
  for (const ch of css) { if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth < 0) stray++; } }
  ok('every brace in the style block closes', depth === 0 && stray === 0,
     'depth ' + depth + ', ' + stray + ' stray');

  const b = await chromium.launch();
  for (const theme of ['light', 'dark']) {
    console.log('\n' + theme);
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    await p.addInitScript(t => { localStorage.setItem('up_dests', '[]');
      localStorage.setItem('inspector', 'R. M'); localStorage.setItem('theme', t); }, theme);
    await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 30000 });
    await p.waitForTimeout(500);

    const seen = {};
    for (const ty of ROUNDS) {
      await p.evaluate(x => { const s = document.getElementById('typeSel'); s.value = x; s.dispatchEvent(new Event('change')); }, ty);
      await p.waitForTimeout(220);
      seen[ty] = await p.evaluate(([ty, C]) => {
        const contrast = eval(C);
        const cs = getComputedStyle(document.body);
        const head = document.querySelector('#cardComponent > h2');
        const hcs = getComputedStyle(head);
        const badge = document.getElementById('secBadge');
        const bcs = getComputedStyle(badge);
        const ink = cs.getPropertyValue('--ink').trim(), muted = cs.getPropertyValue('--muted').trim();
        const bg = hcs.backgroundColor;
        const px = h => { const d = document.createElement('div'); d.style.color = h;
          document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; };
        const status = {};
        ['good','warning','serious','critical','accent'].forEach(k =>
          status[k] = +contrast(px(cs.getPropertyValue('--'+k).trim()), bg).toFixed(2));
        return { round: document.body.dataset.round, badge: badge.textContent.trim(),
                 cat: cs.getPropertyValue('--cat').trim(), bg,
                 inkOnTint: +contrast(px(ink), bg).toFixed(2),
                 mutedOnTint: +contrast(px(muted), bg).toFixed(2),
                 badgeFill: bcs.backgroundColor, badgeBorder: bcs.borderTopColor,
                 /* Resolve the token to the same rgb() form getComputedStyle
                    hands back, or the comparison is "#fff" vs "rgb(255,…)" and
                    fails on a badge that is perfectly correct. */
                 surface: px(cs.getPropertyValue('--surface').trim()),
                 status };
      }, [ty, CONTRAST]);
    }

    ok('the body carries the round', ROUNDS.every(t => seen[t].round === t));
    ok('and the head badge is the code', ROUNDS.every(t => seen[t].badge === t),
       ROUNDS.map(t => seen[t].badge).join(','));
    const tints = ROUNDS.map(t => seen[t].bg);
    ok('all seven tints are different', new Set(tints).size === 7, new Set(tints).size + ' distinct');

    /* The bug that shipped: pale tints surviving into dark mode. A dark tint is
       darker than the card it sits on being light; test it by luminance. */
    const light = theme === 'light';
    ok('the tints belong to this theme, not the other one',
       ROUNDS.every(t => {
         const m = seen[t].bg.match(/[\d.]+/g).map(Number);
         const bright = (m[0] + m[1] + m[2]) / 3 > 128;
         return light ? bright : !bright;
       }), ROUNDS.map(t => seen[t].bg).join(' '));

    const wInk = Math.min(...ROUNDS.map(t => seen[t].inkOnTint));
    const wMut = Math.min(...ROUNDS.map(t => seen[t].mutedOnTint));
    ok('body ink stays legible on every tint', wInk >= 4.5, 'worst ' + wInk + ':1');
    ok('so does muted ink', wMut >= 4.5, 'worst ' + wMut + ':1');

    /* The whole point of keeping the tint pale: a red Critical pill has to read
       on top of it, on every round. */
    let wSt = 99, which = '';
    ROUNDS.forEach(t => Object.entries(seen[t].status).forEach(([k, v]) => {
      if (v < wSt) { wSt = v; which = t + '/' + k; } }));
    ok('every status colour still reads on every tint', wSt >= 3.0,
       'worst ' + wSt + ':1 (' + which + ')');

    /* The badge must not be a filled colour chip — that is the form this app
       uses for status, and 14 of the 35 badge/status pairs came in under the
       separation floors when it was. Ink and an outline instead. */
    ok('the round badge is an outline, not a status-shaped colour chip',
       ROUNDS.every(t => seen[t].badgeFill === seen[t].surface ||
                         /rgba\(0, 0, 0, 0\)/.test(seen[t].badgeFill)),
       ROUNDS.map(t => seen[t].badgeFill).join(' '));
    ok('its outline carries the round colour',
       ROUNDS.every(t => seen[t].badgeBorder !== seen[t].badgeFill));

    await ctx.close();
  }

  console.log('\nand a queue of mixed rounds is readable at a glance');
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 30000 });
  await p.waitForTimeout(500);
  const tags = await p.evaluate(async () => {
    let i = 0;
    for (const t of ['UC', 'GET', 'TB', 'MP']) {
      await dbPut({ id: 'SK-' + t, rev: 1, type: t, equip: 'DZ001', date: '2026-08-0' + (++i),
                    by: 'x', created: '2026-08-0' + i + 'T08:00:00Z', positions: {}, up: 1 });
    }
    await renderPending();
    return [...document.querySelectorAll('#pending .tag')].map(e =>
      e.dataset.r + '=' + getComputedStyle(e).borderTopColor);
  });
  ok('each queued round is tagged with its own round colour',
     new Set(tags.map(x => x.split('=')[1])).size === 4, tags.join('  '));

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
