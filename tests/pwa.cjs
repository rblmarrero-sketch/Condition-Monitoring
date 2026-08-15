/* "Is it fully functional as a web app?"

   Installability is not one flag — it is a handful of small things, each of
   which fails quietly and only on somebody else's phone. The one that bit here:
   iOS ignores the manifest for Add to Home Screen, so with no apple-touch-icon
   an iPhone puts a screenshot of the page on the home screen. It looks like a
   bookmark, not an app, and nobody reports it because it still works. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  const BUILD = await p.evaluate(() => BUILD);

  console.log('  it can be installed');
  const head = await p.evaluate(() => ({
    manifest: (document.querySelector('link[rel=manifest]') || {}).getAttribute
      ? document.querySelector('link[rel=manifest]').getAttribute('href') : null,
    apple: (document.querySelector('link[rel="apple-touch-icon"]') || {}).getAttribute
      ? document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href') : null,
    appleTitle: (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content || null,
    capable: (document.querySelector('meta[name="apple-mobile-web-app-capable"]') || {}).content || null,
    theme: (document.querySelector('meta[name="theme-color"]') || {}).content || null,
    icons: [...document.querySelectorAll('link[rel="icon"]')].map(l => l.getAttribute('sizes')),
  }));
  ok('a manifest is linked', !!head.manifest, head.manifest);
  ok('iOS has an icon of its own — without it the home screen shows a screenshot',
    !!head.apple, String(head.apple));
  ok('and a short name for under it', head.appleTitle === 'Condition', String(head.appleTitle));
  ok('it declares itself standalone on iOS', head.capable === 'yes', String(head.capable));
  ok('the browser chrome is themed', !!head.theme, head.theme);
  ok('a favicon is offered at both sizes',
    head.icons.includes('192x192') && head.icons.includes('512x512'), head.icons.join(' '));

  console.log('\n  the manifest says enough to install well');
  const mf = await (await fetch(B + '/mobile/manifest.webmanifest')).json();
  ok('it has a name and a short name', !!mf.name && !!mf.short_name, mf.short_name);
  ok('it opens standalone, not in a tab', mf.display === 'standalone', mf.display);
  ok('it has a 192 and a 512 icon', ['192x192', '512x512'].every(z =>
    (mf.icons || []).some(i => i.sizes === z)), (mf.icons || []).map(i => i.sizes).join(' '));
  ok('at least one is maskable, so Android does not letterbox it',
    (mf.icons || []).some(i => String(i.purpose || '').includes('maskable')));
  ok('start_url and scope are set', !!mf.start_url && !!mf.scope, mf.start_url + ' / ' + mf.scope);
  ok('a language is declared', !!mf.lang, String(mf.lang));

  console.log('\n  the icon files are real');
  for (const n of ['icon-192.png', 'icon-512.png']) {
    const r = await fetch(B + '/mobile/' + n);
    const buf = Buffer.from(await r.arrayBuffer());
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    ok(n + ' is a PNG of the size it claims',
      r.ok && buf.slice(1, 4).toString() === 'PNG' && w === h && String(w) === n.match(/\d+/)[0],
      w + '×' + h);
  }

  console.log('\n  the home-screen shortcuts land somewhere');
  ok('there are shortcuts', (mf.shortcuts || []).length > 0, String((mf.shortcuts || []).length));
  for (const sc of (mf.shortcuts || [])) {
    /* The manifest says "./?new=1", which relies on the host serving a
       directory index — GitHub Pages does, this test server does not. Ask for
       the file by name and keep the query, which is the part under test. */
    const url = sc.url.replace(/^\.\//, '');
    await p.goto(B + '/mobile/index.html' + url, { waitUntil: 'load' });
    await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
    await p.waitForTimeout(700);
    const where = await p.evaluate(() => ({
      pane: [...document.querySelectorAll('main > .pane')].find(x => x.classList.contains('on'))?.id,
      clean: location.search === '',
    }));
    const want = /queue/.test(url) ? 'paneQueue' : 'paneCapture';
    ok('"' + sc.short_name + '" opens the right screen', where.pane === want,
      url + ' → ' + where.pane);
    ok('and the parameter does not linger in the address bar', where.clean);
  }

  console.log('\n  the service worker holds the whole shell');
  const sw = await (await fetch(B + '/mobile/sw.js')).text();
  ok('the icons are precached, so an install works offline',
    /icon-192\.png/.test(sw) && /icon-512\.png/.test(sw));
  ok('so is the manifest', /manifest\.webmanifest/.test(sw));
  ok('and it is on this build', new RegExp('BUILD = "' + BUILD + '"').test(sw), BUILD);

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); process.exit(1); });
