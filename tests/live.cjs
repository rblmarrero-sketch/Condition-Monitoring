/* The half of the audit that only the running page can answer.

   lint.cjs reads the source. It cannot tell you that a console error fires on
   load, that a control ends up under the tab bar on a small screen, that a
   colour token resolves to nothing in dark mode, or that the app does not come
   back at all with the network off — which for a phone in Chukotka is the only
   question that matters.

   Every check here is a thing that has to be true for an inspector standing at
   a machine, in a glove, at -40, on a link that may not be there.
*/
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), path = require('path');
const PORT = process.env.CMPORT || 8098;
const SHOTS = path.join(__dirname, 'shots');
const fails = [], warns = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const warn = (n, c, d) => { console.log((c ? '  PASS  ' : '  WARN  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) warns.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

const PHONE = { width: 412, height: 915 };
const SMALL = { width: 320, height: 568 };     // the oldest phone still in the pit
const TABLET = { width: 834, height: 1112 };
const DESK = { width: 1440, height: 1000 };

/* Anything the page says to the console that is not an expected offline noise.
   A page that logs an error on load is a page with a bug somebody decided to
   live with. */
const NOISE = /Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|net::ERR_|Download the React|\[HMR\]/i;
function watch(p, bag) {
  p.on('pageerror', e => bag.push('PAGEERROR ' + (e.message || e)));
  p.on('console', m => { if (m.type() === 'error' && !NOISE.test(m.text())) bag.push('CONSOLE ' + m.text().slice(0, 160)); });
  p.on('requestfailed', r => { const u = r.url();
    if (!/127\.0\.0\.1|localhost/.test(u)) return;             // only our own assets
    bag.push('404 ' + u.replace(/^https?:\/\/[^/]+/, '')); });
}
const settledPhone = async p => {
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 25000 });
  await p.waitForFunction(() => typeof window.WEAR === 'object' && typeof window.CMR === 'object', null, { timeout: 25000 });
  await p.waitForTimeout(400);
};
const shot = async (p, name) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false });
  return name + '.png';
};

(async () => {
  const b = await chromium.launch();
  const base = 'http://127.0.0.1:' + PORT;

  /* ── 1. it opens clean ─────────────────────────────────────────────────── */
  console.log('both pages open without saying anything is wrong');
  for (const [what, url, vp, ready] of [
    ['phone', base + '/mobile/index.html', PHONE, settledPhone],
    ['dashboard', base + '/dashboard/index.html', DESK, async p => {
      await p.waitForFunction(() => window.CMDash && window.CMReport, null, { timeout: 25000 });
      await p.waitForTimeout(600); }],
  ]) {
    const ctx = await b.newContext({ viewport: vp, isMobile: vp === PHONE, hasTouch: vp === PHONE });
    await ctx.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    const p = await ctx.newPage(); const bag = [];
    watch(p, bag);
    await p.goto(url, { waitUntil: 'load' });
    await ready(p);
    note(what, bag.length ? bag.slice(0, 3).join(' | ') : 'silent');
    ok(what + ': nothing errors on load', bag.length === 0, bag.slice(0, 2).join(' | ') || 'clean');

    /* An icon-only control with no accessible name reads as "button". */
    const unnamed = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('button').forEach(el => {
        /* Not rendered right now — a picker that fills its own labels when it
           opens is not a nameless control, and flagging it teaches people to
           ignore this check. */
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
        const txt = (el.textContent || '').trim();
        const name = el.getAttribute('aria-label') || el.title || '';
        if (!name && (!txt || !/[A-Za-zА-Яа-я0-9]/.test(txt))) out.push(txt || el.id || el.className);
      });
      return out;
    });
    ok(what + ': every button says what it is', unnamed.length === 0, unnamed.slice(0, 5).join(' ') || 'all named');

    /* Two elements with one id: the second is invisible to getElementById, and
       to every line of code that thinks it has it. */
    const dup = await p.evaluate(() => {
      const seen = {}, out = [];
      document.querySelectorAll('[id]').forEach(e => { if (seen[e.id]) out.push(e.id); seen[e.id] = 1; });
      return [...new Set(out)];
    });
    ok(what + ': no id is used twice in the live page', dup.length === 0, dup.join(',') || 'none');

    await ctx.close();
  }

  /* ── 2. nothing off the side, at any width ─────────────────────────────── */
  console.log('\nnothing runs off the side of the screen');
  for (const [name, vp] of [['320', SMALL], ['412', PHONE], ['834', TABLET]]) {
    const ctx = await b.newContext({ viewport: vp, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    const p = await ctx.newPage();
    await p.goto(base + '/mobile/index.html', { waitUntil: 'load' });
    await settledPhone(p);
    const w = await p.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
      /* Which element, if any, is the one sticking out. "Something overflows"
         is not actionable; a name is. */
      who: [...document.querySelectorAll('body *')]
        .filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 &&
                     getComputedStyle(e).position !== 'fixed' && e.offsetParent)
        .slice(0, 3).map(e => (e.id || e.className || e.tagName) + '' ) }));
    ok(name + 'px: the page does not scroll sideways', w.doc <= w.win + 1,
       w.doc + ' > ' + w.win + (w.who.length ? ' — ' + w.who.join(', ') : ''));

    /* The Save button and the tab bar are fixed, so mid-scroll they sit over
       whatever is under them — that is what fixed means, and it is fine. What
       is not fine is content that stays underneath at the BOTTOM of the scroll,
       because no amount of scrolling reveals it.

       Hunting for a covered control catches that only when the page happens to
       be long enough to push one under; on a short pane it passes for the wrong
       reason, and a check that cannot fail is worse than no check. So assert
       the rule instead: the page reserves at least as much room at the bottom
       as the furniture that floats there occupies. */
    const room = await p.evaluate(() => {
      /* offsetParent is null for a position:fixed element — so the usual "is it
         on screen" test excludes precisely what this is looking for, and the
         check reports 0 bars and passes for ever. */
      const furniture = [...document.querySelectorAll('body *')]
        .filter(e => { const cs = getComputedStyle(e);
          return cs.position === 'fixed' && cs.display !== 'none' && cs.visibility !== 'hidden'; })
        .map(e => e.getBoundingClientRect())
        .filter(r => r.height > 0 && r.bottom > window.innerHeight - 4);   // anchored to the bottom
      const needed = furniture.length
        ? Math.round(window.innerHeight - Math.min(...furniture.map(r => r.top))) : 0;
      const cs = getComputedStyle(document.body);
      return { needed, reserved: Math.round(parseFloat(cs.paddingBottom) || 0),
               bars: furniture.length };
    });
    ok('  and it reserves room for the bars that float over it',
       room.reserved >= room.needed, room.reserved + 'px reserved for ' +
       room.needed + 'px of furniture (' + room.bars + ' fixed)');
    await ctx.close();
  }

  /* ── 3. the theme resolves, both ways ──────────────────────────────────── */
  console.log('\nevery colour resolves, in both themes');
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: PHONE, isMobile: true, hasTouch: true, colorScheme: scheme });
    await ctx.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    const p = await ctx.newPage();
    await p.goto(base + '/mobile/index.html', { waitUntil: 'load' });
    await settledPhone(p);
    const t = await p.evaluate(() => {
      const rules = [...document.styleSheets]
        .flatMap(s => { try { return [...s.cssRules]; } catch (e) { return []; } });
      const flat = [];
      (function walk(list) { for (const r of list) { flat.push(r); if (r.cssRules) walk([...r.cssRules]); } })(rules);

      /* Every name anyone declares, at any scope. --cat is set on body and
         --cpad on .card on purpose, so reading them off the root says nothing
         about whether they work. */
      const declared = new Set();
      for (const r of flat) if (r.style) for (const n of r.style) if (n.startsWith('--')) declared.add(n);

      /* And every name anyone reads. A var() naming something nobody declares
         paints the initial value — transparent, or inherited black on black —
         and says nothing in the console. That is the real version of this bug,
         and a fallback is what makes it survivable. */
      const missing = new Set();
      for (const r of flat) if (r.style) for (const n of r.style) {
        const v = r.style.getPropertyValue(n);
        for (const m of v.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,)?/gi))
          if (!m[2] && !declared.has(m[1])) missing.add(m[1]);
      }
      /* Declared ON the root, not merely in a selector that starts there.
         ":root[data-theme=dark] body[data-round=MP]" sets --cat on a BODY, and
         asking the root for it correctly returns nothing. */
      const onRoot = sel => String(sel || '').split(',')
        .some(part => /^\s*:root[^\s>+~]*\s*$/.test(part));
      const cs = getComputedStyle(document.documentElement);
      const rootEmpty = [...declared].filter(n =>
        flat.some(r => r.style && onRoot(r.selectorText) && [...r.style].includes(n))
        && !cs.getPropertyValue(n).trim());
      return { missing: [...missing], rootEmpty, declared: declared.size,
               bg: getComputedStyle(document.body).backgroundColor,
               ink: getComputedStyle(document.body).color };
    });
    note(scheme, 'bg ' + t.bg + '  ink ' + t.ink + '  (' + t.declared + ' tokens)');
    ok(scheme + ': every var() names something that exists', t.missing.length === 0,
       t.missing.slice(0, 6).join(',') || 'all resolve');
    ok(scheme + ': every :root token has a value', t.rootEmpty.length === 0,
       t.rootEmpty.slice(0, 6).join(',') || 'all set');
    ok(scheme + ': the page paints its own background', t.bg !== 'rgba(0, 0, 0, 0)', t.bg);
    await shot(p, 'phone-' + scheme);
    await ctx.close();
  }

  /* ── 3b. a handler that fails says so ──────────────────────────────────── */
  console.log('\nwhen something fails, it says so');
  {
    const ctx = await b.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    const p = await ctx.newPage();
    await p.goto(base + '/mobile/index.html', { waitUntil: 'load' });
    await settledPhone(p);

    /* Every async handler is one await away from doing nothing at all: a photo
       the browser cannot decode, a picker the platform refuses, a store that is
       full. Without a catch the promise rejects, the handler stops, and the
       button looks dead — no message, nothing an inspector can report. */
    /* Watch the dialog itself, not a stub: guard() closes over the real dlg,
       so replacing window.dlg proves nothing about what an inspector sees. */
    const r = await p.evaluate(async () => {
      const dlgEl = document.getElementById('dlg');
      const read = () => ({ open: !!dlgEl.open,
                            title: (document.getElementById('dlgTitle') || {}).textContent || '',
                            body: (document.getElementById('dlgMsg') || {}).textContent || '' });
      await guard(async () => { throw new Error('the store is full'); })();
      const shown = read();
      dlgEl.close();
      /* A picker somebody cancelled is not a failure worth a dialog. */
      await guard(async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; })();
      return { shown, afterCancel: read() };
    });
    ok('a handler that throws puts it on the screen', r.shown.open === true, JSON.stringify(r.shown));
    ok('  in the inspector\'s language', /did not work|получилось/i.test(r.shown.title), r.shown.title);
    ok('  saying what actually went wrong', /store is full/.test(r.shown.body), r.shown.body.slice(0, 60));
    ok('  while a cancelled picker stays quiet', r.afterCancel.open === false, JSON.stringify(r.afterCancel));

    /* And the wrapper is actually on the handlers that need it. */
    const wired = await p.evaluate(() => {
      /* Not #camera: it has no standing handler by design — the caller that
         opens it takes the file back, so nothing can file a shot elsewhere. */
      const ids = ['takeBtn', 'videoBtn', 'exportBtn', 'shareBtn', 'qrPhoto', 'provShow'];
      return ids.filter(i => { const el = document.getElementById(i);
        const h = el && (el.onclick || el.onchange);
        return !h || !/try\s*\{/.test(String(h)); });
    });
    ok('  and every handler that can fail goes through it', wired.length === 0, wired.join(',') || 'all six');
    await ctx.close();
  }

  /* ── 4. it comes back with the network off ─────────────────────────────── */
  console.log('\nand it opens with no signal at all');
  {
    const ctx = await b.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    const p = await ctx.newPage();
    await p.goto(base + '/mobile/index.html', { waitUntil: 'load' });
    await settledPhone(p);
    const reg = await p.evaluate(async () => {
      if (!navigator.serviceWorker) return 'unsupported';
      const r = await navigator.serviceWorker.ready.catch(() => null);
      return r ? 'ready' : 'none';
    });
    ok('the service worker takes control', reg === 'ready', reg);

    /* Give it a moment to finish precaching, then pull the plug. */
    await p.waitForTimeout(2500);
    await ctx.setOffline(true);
    const bag = [];
    watch(p, bag);
    await p.reload({ waitUntil: 'load' }).catch(e => bag.push('RELOAD ' + e.message));
    const off = await p.evaluate(() => ({
      title: (document.getElementById('verNum') || {}).textContent || '',
      capture: !!document.getElementById('paneCapture'),
      save: !!document.getElementById('saveBtn'),
      wear: typeof window.WEAR === 'object',
      report: typeof window.CMR === 'object' })).catch(() => ({}));
    note('offline reload', JSON.stringify(off));
    ok('the app loads from cache with the link down', off.capture === true && off.save === true, JSON.stringify(off));
    /* The reference data is the whole point — a round captured offline against
       no wear table is a round of numbers nobody can score. */
    ok('  with the wear reference on board', off.wear === true);
    ok('  and the report engine, so a PDF can still be made', off.report === true);
    ok('  and it does not throw doing it',
       bag.filter(x => /PAGEERROR|CONSOLE/.test(x)).length === 0,
       bag.filter(x => /PAGEERROR|CONSOLE/.test(x)).slice(0, 2).join(' | ') || 'clean');
    await shot(p, 'phone-offline');
    await ctx.setOffline(false);
    await ctx.close();
  }

  /* ── 5. how long it takes to be usable ─────────────────────────────────── */
  console.log('\nand it is usable quickly');
  {
    const ctx = await b.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    const p = await ctx.newPage();
    const t0 = Date.now();
    await p.goto(base + '/mobile/index.html', { waitUntil: 'load' });
    const loaded = Date.now() - t0;
    await settledPhone(p);
    const ready = Date.now() - t0;
    const m = await p.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const res = performance.getEntriesByType('resource');
      return { dcl: Math.round(nav.domContentLoadedEventEnd || 0),
               bytes: Math.round(res.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
               requests: res.length,
               slowest: res.slice().sort((a, b2) => b2.duration - a.duration).slice(0, 3)
                 .map(r => r.name.split('/').pop().split('?')[0] + ' ' + Math.round(r.duration) + 'ms') };
    });
    note('timing', 'load ' + loaded + 'ms, interactive ' + ready + 'ms, DCL ' + m.dcl + 'ms');
    note('transfer', m.bytes + ' KB over ' + m.requests + ' requests');
    note('slowest', m.slowest.join(', '));
    /* Local, so this is the floor, not the field. It is here to catch a change
       that doubles it, not to claim a number the pit will see. */
    warn('interactive inside 4 s on a local link', ready < 4000, ready + 'ms');
    await ctx.close();
  }

  /* ── 6. what it looks like ─────────────────────────────────────────────── */
  console.log('\nscreenshots');
  {
    const made = [];
    for (const [name, vp, url, ready] of [
      ['phone-capture', PHONE, base + '/mobile/index.html', settledPhone],
      ['phone-small', SMALL, base + '/mobile/index.html', settledPhone],
      ['tablet', TABLET, base + '/mobile/index.html', settledPhone],
      ['dashboard', DESK, base + '/dashboard/index.html', async p => {
        await p.waitForFunction(() => window.CMDash, null, { timeout: 25000 }); await p.waitForTimeout(800); }],
    ]) {
      const ctx = await b.newContext({ viewport: vp, isMobile: vp !== DESK, hasTouch: vp !== DESK });
      await ctx.addInitScript(() => localStorage.setItem('up_dests', '[]'));
      const p = await ctx.newPage();
      await p.goto(url, { waitUntil: 'load' });
      await ready(p);
      made.push(await shot(p, name));
      await ctx.close();
    }
    note('written to tests/shots', made.join(', '));
    ok('every screenshot was taken', made.length === 4, made.length + '');
  }

  await b.close();
  console.log('');
  if (warns.length) console.log('WARNINGS (' + warns.length + '): ' + warns.join(' | '));
  console.log(fails.length ? 'FAILED ' + fails.length + ': ' + fails.join(' | ') : 'all passed');
  process.exit(fails.length ? 1 : 0);
})();
