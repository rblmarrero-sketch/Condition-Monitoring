/* A new browser should already know where the data is.

   Opening the dashboard on a laptop that had never seen it meant somebody
   pasting an /exec URL before a single inspection appeared — a step nobody
   remembers, on a link handed round a mine site, and the reason "have you set
   it up yet?" was the first question about every new machine.

   The phones never had that problem: they read mobile/upload-defaults.js on
   first open. The dashboard now reads the same file, so one place configures
   both and a link is all anybody needs.

   Three routes, and the ORDER is the thing to guard, because getting it wrong
   is silent and nasty in both directions — a shared default that overrides a
   deliberately-set folder, or a saved setting that stops a hand-off working:

     1. settings already in this browser — always win
     2. ?src= / ?k= on the link — stored once, then wiped from the address bar
     3. mobile/upload-defaults.js — whatever the phones use

   The link route also has to refuse a URL that is not an Apps Script endpoint.
   Without that check, "click this link" is an invitation to point somebody's
   dashboard at anything at all, and it would look exactly like a normal
   hand-off while doing it.
*/
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099')
        + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

/* Never print the real credential into a log that ends up in a chat. */
const mask = u => String(u || '').replace(/\/s\/([^/]+)\//, (m, id) => id.length > 16 ? '/s/<REAL>/' : '/s/' + id + '/');

async function open(b, url, pre, noDefaults) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  if (pre) await ctx.addInitScript(pre);
  /* Setting window.UPLOAD_DEFAULTS from an init script does not simulate a
     site with no published credential — the real file loads afterwards and
     overwrites it. Serve an empty one instead, which is what that site is. */
  if (noDefaults) await ctx.route('**/upload-defaults.js*', r =>
    r.fulfill({ status: 200, contentType: 'text/javascript',
                body: 'window.UPLOAD_DEFAULTS={dests:[]};' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(1000);
  const out = await p.evaluate(() => ({
    configured: !!(window.CMDrive && CMDrive.configured()),
    inUse: (window.CMDrive && CMDrive.url) || '',
    secret: (window.CMDrive && CMDrive.secret) || '',
    stored: localStorage.getItem('cm_drive_url') || '',
    panel: !document.getElementById('dataOv').classList.contains('hidden'),
    search: location.search,
  }));
  await ctx.close();
  return out;
}

(async () => {
  const b = await chromium.launch();

  console.log('a browser that has never been set up');
  let r = await open(b, B);
  ok('is already configured, with nothing typed into it', r.configured);
  ok('using the same destinations file the phones read', /script\.google\.com\/macros\/s\/.+\/exec$/.test(r.inUse), mask(r.inUse));
  ok('and is not asked to set anything up', r.panel === false);
  /* The default is READ, not written into this browser: change the file and
     every machine follows, instead of each one being frozen at whatever the
     file said the first time it was opened. */
  ok('the default is read each time, not copied into local storage', r.stored === '', r.stored ? mask(r.stored) : 'nothing stored');

  console.log('\nsettings handed over in the link');
  r = await open(b, B + '?src=https://script.google.com/macros/s/HANDOFF123/exec&k=letmein');
  ok('the link configures the browser', /HANDOFF123/.test(r.inUse), mask(r.inUse));
  ok('and it sticks, so the next visit needs no link', /HANDOFF123/.test(r.stored), mask(r.stored));
  ok('the secret comes across too', r.secret === 'letmein', r.secret ? 'set' : 'empty');
  /* Out of the address bar, so it is not left in history, in a bookmark, or in
     the next screenshot somebody pastes into a chat. */
  ok('and the credential is wiped from the address bar', r.search === '', r.search || '(empty)');

  console.log('\nand a link that points somewhere else is refused');
  for (const bad of ['https://evil.example.com/exec',
                     'https://script.google.com.evil.test/macros/s/X/exec',
                     'javascript:alert(1)',
                     'https://script.google.com/macros/s/X/dev']) {
    r = await open(b, B + '?src=' + encodeURIComponent(bad));
    ok('refuses ' + bad.slice(0, 44), !r.stored, r.stored ? 'STORED IT' : 'not stored');
  }

  console.log('\nwhat this browser was told stays true');
  r = await open(b, B, () => localStorage.setItem('cm_drive_url',
    'https://script.google.com/macros/s/MINE999/exec'));
  ok('a saved setting beats the shared default', /MINE999/.test(r.inUse), mask(r.inUse));

  console.log('\nand a link can still move a browser that was already set');
  r = await open(b, B + '?src=https://script.google.com/macros/s/OTHER777/exec',
    () => localStorage.setItem('cm_drive_url', 'https://script.google.com/macros/s/MINE999/exec'));
  ok('the newer instruction wins', /OTHER777/.test(r.inUse), mask(r.inUse));
  note('order', 'saved  <  link  ;  default  <  saved');

  console.log('\nturning Drive off has to stick');
  /* Nearly lost when the shared default was added: clearing the URL used to
     mean "this browser has never been set up", so the default reasserted
     itself and a machine deliberately working from an imported file went
     quietly back to talking to the live folder. Cleared means cleared. */
  r = await open(b, B, () => { localStorage.setItem('cm_drive_url', '');
                               localStorage.setItem('cm_drive_sec', ''); });
  ok('a browser told to work without Drive is left alone', r.configured === false,
     'configured=' + r.configured + ' url=' + mask(r.inUse));
  ok('and the shared default does not creep back in', !r.inUse, mask(r.inUse) || '(none)');

  console.log('\nthe setup panel still exists for anyone who needs it');
  /* An empty defaults file is how a site that has NOT published its credential
     is configured, and that browser must still be told where to go.

     This server ships bundled demo records, so the panel legitimately stays
     shut — that was true before this change too, and asserting on the panel
     alone would only be testing the fixture. Drive the boot condition itself
     against an empty record set, which is what a genuinely fresh site is. */
  r = await open(b, B, null, true);
  ok('an empty defaults file leaves it unconfigured', r.configured === false,
     'configured=' + r.configured);
  const asks = await (async () => {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.route('**/upload-defaults.js*', rt => rt.fulfill({ status: 200,
      contentType: 'text/javascript', body: 'window.UPLOAD_DEFAULTS={dests:[]};' }));
    const p = await ctx.newPage();
    await p.goto(B, { waitUntil: 'load' });
    await p.waitForTimeout(900);
    const out = await p.evaluate(() => {
      RECS.length = 0;                       // a site with nothing in it yet
      document.getElementById('dataOv').classList.add('hidden');
      if (!RECS.length && !drvOn()) openData();
      return !document.getElementById('dataOv').classList.contains('hidden');
    });
    await ctx.close(); return out;
  })();
  ok('and with nothing loaded either, it asks where the data is', asks === true);

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
