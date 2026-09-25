/* A PHOTOGRAPH ADDED FROM THE OFFICE NEVER REACHED THE SERVER — READ OFF THE
   OFFICE AS "Upload failed: Missing file content", on every single attempt,
   since the day this feature shipped.

   Traced to the field name, not the file: `putMedia()`'s batch payload was
   `{name, mime, data}` — the base64 sat under `data` — and the server's own
   `saveOne()` (docs/yandex/function.js) reads `b.file` and nothing else,
   so every desk-side photo upload sent a request the server could only read
   as "no file content at all," regardless of what the technician picked.
   `putDoc()` (the office's own deferral save, `dfSave()`'s "Not being done"
   equivalent) carried the identical `data` field and so has been failing,
   silently rolled back, since it shipped too — found investigating this,
   not reported separately.

   Two things had to be true for this to reach the field undetected: the
   backend was never wrong (it has always rejected exactly what the RFC of
   its own contract says to reject), and every existing test of this path
   (tests/media.cjs, tests/edall.cjs) replaces `CMDrive.putMedia` outright
   with a stub that never builds a real batch payload — so nothing had ever
   asked the real docs/yandex/function.js whether the shape this page sends
   is one it accepts. This suite does, the same way tests/toctou.cjs and
   tests/dashswap.cjs do: the REAL function.js, over an in-memory bucket, so
   a fix proven here is a fix proven against the deployed contract.

   What has to be true:
     1. The exact `data`-keyed payload this bug always sent is rejected by
        the real backend with "Missing file content" — the mechanism, not a
        guess about it.
     2. putMedia() now lands the photograph for real: the server actually
        holds it afterward, not just "no throw".
     3. A genuinely empty (0-byte) file is refused BEFORE any request is
        made — the phone's own "nothing reaches storage unread" rule,
        applied to the desk.
     4. putDoc() (the deferral save) is fixed the same way, and lands too.

   Run: node tests/putmedia.cjs   (spawns its own ya-srv.cjs) */
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8127, B = `http://127.0.0.1:${PORT}`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(PORT), 'NONE'], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(B + '/exec'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(url => { localStorage.setItem('cm_drive_url', url); }, B + '/exec');
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMDrive && CMDrive.url, null, { timeout: 15000 });

  console.log('1. THE MECHANISM: THE OLD data-KEYED PAYLOAD IS WHAT "MISSING FILE CONTENT" MEANS');
  const bare = await p.evaluate(async url => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: '', op: 'batch', files: [{ name: 'TK500_25.09.2026_INSP_9.jpg', mime: 'image/jpeg', data: btoa('not empty') }] }) });
    return r.json();
  }, B + '/exec');
  ok('the real backend answers "Missing file content" for exactly the shape this bug sent',
     bare && bare.failed && bare.failed[0] && /missing file content/i.test(bare.failed[0].error || ''),
     JSON.stringify(bare));

  console.log('\n2. PUTMEDIA() NOW LANDS THE PHOTOGRAPH FOR REAL');
  const name = 'TK500_25.09.2026_INSP_MACHINE.jpg';
  const put = await p.evaluate(async n => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0xff, 0xd9]);
    const file = new File([bytes], n, { type: 'image/jpeg' });
    try { const r = await CMDrive.putMedia(n, file); return { ok: true, r }; }
    catch (e) { return { ok: false, err: e.message }; }
  }, name);
  ok('putMedia() resolves without throwing', put.ok === true, JSON.stringify(put));
  const keys = await (await fetch(B + '/__keys')).json();
  ok('  and the server actually holds it afterward — not just "no throw"',
     keys.keys.some(k => k.indexOf(name) >= 0), keys.keys.filter(k => /TK500/.test(k)).join(', '));

  console.log('\n3. A 0-BYTE FILE NEVER REACHES THE WIRE');
  const before = (await (await fetch(B + '/__keys')).json()).keys.length;
  const empty = await p.evaluate(async () => {
    const file = new File([], 'TK500_25.09.2026_INSP_EMPTY.jpg', { type: 'image/jpeg' });
    try { await CMDrive.putMedia('TK500_25.09.2026_INSP_EMPTY.jpg', file); return { ok: true }; }
    catch (e) { return { ok: false, err: e.message }; }
  });
  ok('an empty file is refused with a clear reason, not the server\'s opaque one',
     empty.ok === false && /empty \(0 bytes\)/i.test(empty.err || ''), JSON.stringify(empty));
  const after = (await (await fetch(B + '/__keys')).json()).keys.length;
  ok('  and no request was ever made for it', after === before, `${before} -> ${after} keys`);

  console.log('\n4. PUTDOC() (THE OFFICE\'S OWN DEFERRAL SAVE) IS FIXED THE SAME WAY');
  const doc = await p.evaluate(async () => {
    try { const r = await CMDrive.putDoc('_meta/deferrals/TK500_INSP.defer.json',
      { type: 'cm-round-deferred', version: 1, u: 'TK500', t: 'INSP', until: null, why: 'test', by: 'Office', at: new Date(0).toISOString() });
      return { ok: true, r }; }
    catch (e) { return { ok: false, err: e.message }; }
  });
  ok('putDoc() resolves without throwing', doc.ok === true, JSON.stringify(doc));
  const keys2 = await (await fetch(B + '/__keys')).json();
  ok('  and the deferral document actually landed', keys2.keys.some(k => /TK500_INSP\.defer\.json$/.test(k)),
     keys2.keys.filter(k => /deferrals/.test(k)).join(', '));

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close(); bye();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); bye(); process.exit(1); });
