/* Light / dark, and the header pill that used to lie.

   navigator.onLine means "a network interface is attached", not "anything can be
   reached". In the pit it reads true while every upload times out, so a green
   "online" sat over failing uploads. The pill now reports whether the work is
   safe, and only claims to be connected when Drive has actually answered. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8094';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };

async function app(b, { scheme = 'dark', theme = null, dest = true, lang = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true,
                                   hasTouch: true, colorScheme: scheme });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(([u, th, lg]) => {
    localStorage.setItem('up_dests', u ? JSON.stringify(
      [{ id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{YYYY-MM}' }]) : '[]');
    if (th) localStorage.setItem('theme', th);
    if (lg) localStorage.setItem('lang', lg);
  }, [dest ? B + '/exec' : '', theme, lang]);
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  return { ctx, p };
}
const bg = p => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
const dark = s => { const m = /(\d+), *(\d+), *(\d+)/.exec(s); return m && (+m[1] + +m[2] + +m[3]) / 3 < 100; };
const pill = p => p.evaluate(() => ({ t: document.getElementById('netStatus').textContent.trim(),
                                      c: document.getElementById('netStatus').className }));
const attr = p => p.evaluate(() => document.documentElement.getAttribute('data-theme'));

(async () => {
  const b = await chromium.launch();

  console.log('following the phone');
  let { ctx, p } = await app(b, { scheme: 'dark' });
  ok('a dark phone gets the dark palette', dark(await bg(p)), await bg(p));
  ok('and nothing is forced', (await attr(p)) === null);
  await ctx.close();
  ({ ctx, p } = await app(b, { scheme: 'light' }));
  ok('a light phone gets the light palette', !dark(await bg(p)), await bg(p));

  console.log('\noverriding it');
  await p.evaluate(() => openSettings()); await p.waitForTimeout(300);
  ok('the control is in settings', await p.isVisible('#themeSeg'));
  ok('Auto is the one marked', await p.evaluate(() =>
    document.querySelector('#themeSeg button.on').dataset.theme === 'auto'));
  await p.click('#themeSeg [data-theme="dark"]'); await p.waitForTimeout(300);
  ok('dark on a light phone', dark(await bg(p)), await bg(p));
  ok('and it is recorded as forced', (await attr(p)) === 'dark');
  ok('the browser chrome follows', await p.evaluate(() => {
    const m = document.querySelector('meta[name="theme-color"]').content.trim();
    const s = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
    return m === s; }), await p.evaluate(() => document.querySelector('meta[name="theme-color"]').content));
  await p.click('#themeSeg [data-theme="light"]'); await p.waitForTimeout(300);
  ok('and back to light', !dark(await bg(p)));
  await p.click('#themeSeg [data-theme="auto"]'); await p.waitForTimeout(300);
  ok('auto releases it to the phone again', (await attr(p)) === null && !dark(await bg(p)));
  await ctx.close();

  console.log('\n  the choice survives a restart');
  ({ ctx, p } = await app(b, { scheme: 'light', theme: 'dark' }));
  ok('forced dark is still dark after a reload', dark(await bg(p)), await bg(p));
  ok('and the control shows it', await p.evaluate(() => {
    openSettings(); return document.querySelector('#themeSeg button.on').dataset.theme === 'dark'; }));
  await ctx.close();

  console.log('\n  both palettes are legible, not one inverted');
  for (const th of ['light', 'dark']) {
    ({ ctx, p } = await app(b, { scheme: 'light', theme: th }));
    const c = await p.evaluate(() => {
      const g = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      const lum = s0 => { // #fff and #ffffff both, or the ratio is nonsense
        const s = /^#([0-9a-f]{3})$/i.test(s0) ? '#' + s0.slice(1).split('').map(c => c + c).join('') : s0;
        const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s);
        if (!m) throw new Error('cannot read colour: ' + s0);
        const [r, gr, bl] = [1, 2, 3].map(i => parseInt(m[i], 16) / 255)
          .map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4));
        return .2126 * r + .7152 * gr + .0722 * bl; };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
        return (x + .05) / (y + .05); };
      // Judge against the harder ground: labels sit on surface-2 inside cards.
      return { ink: ratio(g('--ink'), g('--surface-2')),
               ink2: ratio(g('--ink-2'), g('--surface-2')),
               muted: ratio(g('--muted'), g('--surface-2')) };
    });
    ok(`${th}: body text is well clear of AA`, c.ink >= 7, c.ink.toFixed(1) + ':1');
    ok(`${th}: secondary text passes AA`, c.ink2 >= 4.5, c.ink2.toFixed(1) + ':1');
    ok(`${th}: even the quiet labels pass AA`, c.muted >= 4.5, c.muted.toFixed(1) + ':1');
    await ctx.close();
  }

  console.log('\nthe pill says whether the work is safe');
  ({ ctx, p } = await app(b));
  /* READ THE APP'S OWN WORD FOR IT. This was the literal string 'Synced',
     which the pill no longer says — it claims only what the phone can actually
     know, that every file was accepted. What this line is testing is the
     SETTLED STATE after Drive answered, so it asks for the state and takes the
     label from the app's own dictionary rather than keeping a second copy of
     it here that has to be found and edited every time the wording improves. */
  const settledPill = await pill(p);
  const settledWord = await p.evaluate(() => I18N.en.net_synced);
  ok('Drive answered, so it says settled',
     settledPill.c.split(/\s+/).indexOf('on') >= 0 && settledPill.t === settledWord,
     JSON.stringify(settledPill));
  ok('and it is green', (await pill(p)).c.includes('on'));

  await p.evaluate(async () => { await dbPut({ id: 'Q1', cls: 'HT', type: 'MP', equip: 'TK900',
    date: '2026-08-01', by: 'R', positions: { '4C': { grade: 'C' } },
    created: new Date().toISOString(), up: 0, rev: 1 }); renderPending(); });
  await p.waitForTimeout(600);
  ok('a queued round is counted', /1/.test((await pill(p)).t), (await pill(p)).t);
  ok('and it warns rather than reassures', (await pill(p)).c.includes('warn'));
  await p.evaluate(async () => { const r = await dbGet('Q1'); r.up = 1; await dbPut(r); renderPending(); });
  await p.waitForTimeout(600);
  ok('once sent, it is green again', (await pill(p)).c.includes('on'), JSON.stringify(await pill(p)));

  console.log('\n  the case that made this necessary');
  // navigator.onLine true, Drive unreachable. The old pill said "online".
  await p.evaluate(() => netSeen(false)); await p.waitForTimeout(300);
  const nosig = await pill(p);
  /* The pill speaks the field's words since Phase 2 (terms.js): "Offline —
     work saved here" whether the radio is off or the link delivers nothing;
     the host and the reason are named under the version line, not here. */
  ok('a network that delivers nothing is not "online"', /^Offline/.test(nosig.t) && !/online/i.test(nosig.t), JSON.stringify(nosig));
  ok('and it is not shown as good', !nosig.c.includes('on') || nosig.c.includes('warn'), nosig.c);
  ok('the app never claims "online" anywhere in the header',
    !/online/i.test(await p.textContent('header')), await p.textContent('header'));
  await p.evaluate(() => netSeen(true)); await p.waitForTimeout(300);
  const back = await pill(p);
  ok('Drive answering restores it',
     back.c.split(/\s+/).indexOf('on') >= 0 && back.t === settledWord, JSON.stringify(back));

  console.log('\n  the other states');
  await ctx.setOffline(true);
  await p.evaluate(() => dispatchEvent(new Event('offline'))); await p.waitForTimeout(400);
  ok('radio off reads offline', /^Offline/.test((await pill(p)).t), JSON.stringify(await pill(p)));
  await ctx.setOffline(false);
  await p.evaluate(() => dispatchEvent(new Event('online'))); await p.waitForTimeout(400);
  await p.evaluate(() => { lastErr = 'SharePoint: HTTP 500'; renderNet(); }); await p.waitForTimeout(300);
  const err = await pill(p);
  ok('a failing upload is called out, not reassured', err.t === 'Needs attention' && /err/.test(err.c), JSON.stringify(err));
  ok('and shown in the critical colour', err.c.includes('err'));
  await p.evaluate(() => { lastErr = ''; renderNet(); }); await p.waitForTimeout(300);

  console.log('\n  and it goes somewhere');
  await p.click('#netStatus'); await p.waitForTimeout(400);
  ok('tapping it opens the queue', await p.evaluate(() =>
    [...document.querySelectorAll('main > .pane')].filter(x => getComputedStyle(x).display !== 'none')
      .map(x => x.id).join() === 'paneQueue'));
  await ctx.close();

  console.log('\nRussian');
  ({ ctx, p } = await app(b, { lang: 'ru' }));
  ok('the pill is translated', /[А-Яа-я]/.test((await pill(p)).t), (await pill(p)).t);
  await p.evaluate(() => openSettings()); await p.waitForTimeout(300);
  ok('so is the appearance control', /[А-Яа-я]/.test(await p.textContent('#themeSeg')),
    await p.textContent('#themeSeg'));
  await ctx.close();

  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
