/* A LOST cm_dev WRITE DID NOT LOSE A ROUND — IT MANUFACTURED A NEW PHONE.

   Read off the live backend on 2026-09-30: TK151's Magnetic Plug round had
   TEN copies in its folder, nine of them "R. Marrero", each under a
   DIFFERENT dev id, each rev:1 — one inspector's repeated saves, not ten
   phones. dashboard/index.html's own groupRivals() (which this app's
   conflict banner is built on) treats two different `dev` ids on the same
   unit/date/round as two different phones and raises "N rounds were sent by
   two phones" until someone decides which stands.

   DEVICE = (()=>{ let d=localStorage.getItem("cm_dev");
     if(!d){ d=...; lsSet("cm_dev",d); } return d; })();

   lsSet() swallows a failed localStorage write everywhere else on this page
   by design — a settings toggle that fails to persist is not worth a
   dialog. This write is different: a phone whose write here fails still
   gets a usable id for the CURRENT load (DEVICE is a const, fixed for the
   life of the page), but the id never survives to the next reload, so every
   later load mints another fresh random one and every save that session
   looks like a new phone to the dashboard's rival-detection.

   The fix does not (and cannot, from here) make the write succeed — that
   failure is the browser's, not this page's. It makes the failure NON-
   SILENT: bad("device-id-persist", …) records it the same way every other
   storage failure on this page already is, so the next diagnostic trace can
   tell "this phone never got a device id" apart from "two inspectors walked
   the same round."

   Run: node tests/deviceid.cjs   (starts its own server) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8499);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = http.createServer((q, s) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('x'); }
  s.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();

  console.log('\n1. A phone whose cm_dev write fails still boots, still gets ONE stable id for this load, and says so non-silently');
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => {
      localStorage.setItem('up_dests', '[]');
      localStorage.removeItem('cm_dev');
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === 'cm_dev') throw new DOMException('simulated: storage rejects this write', 'QuotaExceededError');
        return real.call(this, k, v);
      };
    });
    await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
    await p.waitForFunction(() => typeof DEVICE !== 'undefined', null, { timeout: 20000 });

    const dev = await p.evaluate(() => DEVICE);
    ok('DEVICE is still a usable, well-formed id despite the write failing', /^D[0-9A-Z]{5}$/.test(dev || ''), dev);

    const stillUsable = await p.evaluate(() => {
      const s = $('typeSel'); if (s) { s.value = 'MP'; s.dispatchEvent(new Event('change')); }
      return typeof DEVICE === 'string' && DEVICE.length > 0;
    });
    ok('the page keeps working normally with the fallback id (no throw reached the page)', stillUsable);

    const persisted = await p.evaluate(() => { try { return localStorage.getItem('cm_dev'); } catch (e) { return null; } });
    ok('the id genuinely did NOT persist (this is the failure being tested, not a false setup)', persisted == null, String(persisted));

    const errRec = await p.evaluate(() => (window.CM_ERRS || []).find(e => e.where === 'device-id-persist'));
    ok('the failed persist was recorded non-silently, through the same bad() channel every other storage failure uses', !!errRec, JSON.stringify(errRec));

    ok('no uncaught page errors — the failed write never threw past the fix', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
    await ctx.close();
  }

  console.log('\n2. Reloading the SAME phone under the SAME failing storage still mints only one id per load — never crashes into a loop');
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.addInitScript(() => {
      localStorage.setItem('up_dests', '[]');
      localStorage.removeItem('cm_dev');
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === 'cm_dev') throw new DOMException('simulated', 'QuotaExceededError');
        return real.call(this, k, v);
      };
    });
    await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
    await p.waitForFunction(() => typeof DEVICE !== 'undefined', null, { timeout: 20000 });
    const devA = await p.evaluate(() => DEVICE);
    const warnCountA = await p.evaluate(() => (window.CM_ERRS || []).filter(e => e.where === 'device-id-persist').length);
    ok('exactly one device-id-persist warning per load, not a storm of them', warnCountA === 1, warnCountA);

    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof DEVICE !== 'undefined', null, { timeout: 20000 });
    const devB = await p.evaluate(() => DEVICE);
    /* This is the honest, unfixable-from-here half of the bug: without a
       working persistence layer, a reload really does mint a new id — the
       fix's job is only to make that non-silent, never to fake stability
       the storage itself cannot provide. */
    ok('a genuine reload under still-failing storage DOES get a new id (expected — this is what the warning is for)', devA !== devB, `${devA} -> ${devB}`);
    await ctx.close();
  }

  console.log('\n3. Control: a phone whose storage works is completely unaffected — same id across reloads, no warning ever raised');
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    /* No cm_dev removal here: addInitScript re-runs on every navigation,
       including the reload below, and this context starts with empty
       storage anyway — removing it again after the first load would wipe
       out the very persistence this control is meant to prove. */
    await p.addInitScript(() => { localStorage.setItem('up_dests', '[]'); });
    await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
    await p.waitForFunction(() => typeof DEVICE !== 'undefined', null, { timeout: 20000 });
    const devA = await p.evaluate(() => DEVICE);
    const persistedA = await p.evaluate(() => localStorage.getItem('cm_dev'));
    ok('a healthy phone persists the id it generates', persistedA === devA, `${devA} / ${persistedA}`);

    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof DEVICE !== 'undefined', null, { timeout: 20000 });
    const devB = await p.evaluate(() => DEVICE);
    ok('and reads the SAME id back on the next load — no churn when storage actually works', devA === devB, `${devA} / ${devB}`);

    const warnCount = await p.evaluate(() => (window.CM_ERRS || []).filter(e => e.where === 'device-id-persist').length);
    ok('no false warning on a phone that never had a write failure', warnCount === 0, warnCount);
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(fails.length ? `\nFAILED ${fails.length}: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); process.exit(1); });
