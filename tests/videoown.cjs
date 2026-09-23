/* A VIDEO CLIP WAS ONE OF THE SIX PATHS THAT RETURNED THE PICKER'S OWN FILE
   TO STORAGE, AND IT WAS NEVER ACTUALLY CLOSED.

   tests/ownbytes.cjs's own history names it directly: "Six paths returned the
   picker's own File to storage: a JPEG already inside the size limit, a
   re-encode that came out no smaller, A VIDEO, a file whose bytes are not a
   photo type, 'Original' chosen on purpose, and a HEIC the decoder refused."
   The other five were closed by making ownBytes/intakeNoted's read
   unconditional at intake — but acceptVideo() never called either. A clip
   went straight from the picker into p.video with nothing between it and
   storage, on the exact platform (WebKit/iOS) this project has twice
   confirmed reclaims a picker's backing file on its own schedule.

   reArmForSave() (Save time) does re-read every video's bytes — but that is
   the SAFETY NET at the end of a round, not the "earliest possible
   detection" every photograph gets at intake, with the button disabled and
   the inspector still standing at the machine (ownbytes.cjs's own words). A
   clip recorded early in a long round, whose reference expires before Save,
   would only be discovered there — and reArmForSave's own read failure is
   swallowed silently (`catch(e){}`), leaving the stale, already-unreadable
   original in the record with nobody told.

   acceptVideo(f, posKey) now reads the clip the same way a photograph is
   read at intake — unconditional, the instant it is accepted — replacing it
   with a File made from the page's own read bytes; a clip whose backing
   store cannot be read is KEPT (never discard evidence) and said aloud, in
   the clip's own wording (video_odd_own), not deferred to a silent Save-time
   failure.

   Run: node tests/videoown.cjs   (starts its own server) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8497);
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
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof acceptVideo === 'function' && typeof ownBytes === 'function', null, { timeout: 30000 });

  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(200);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(400);
  const posKey = await p.evaluate(() => (document.querySelector('#posnav [data-pos]') || {}).dataset && document.querySelector('#posnav [data-pos]').dataset.pos);
  ok('a position exists to attach a clip to', !!posKey, posKey);

  console.log('\n1. an ordinary clip is READ, not merely referenced — a fresh object, its own name kept');
  const ordinary = await p.evaluate(async (key) => {
    pickComponent(key);
    delete (draft.positions[key] || {}).video;
    const original = new File([new Uint8Array(64).fill(7)], 'clip1.mp4', { type: 'video/mp4' });
    await acceptVideo(original, key);
    const v = draft.positions[key].video;
    return { isFile: !!v, sameObject: v === original, name: v && v.name, size: v && v.size };
  }, posKey);
  ok('the clip landed on the position', ordinary.isFile, JSON.stringify(ordinary));
  ok('  as a NEW object, not the picker\'s own reference — proof it went through a real read',
     ordinary.isFile && !ordinary.sameObject, JSON.stringify(ordinary));
  ok('  with its name and bytes intact', ordinary.name === 'clip1.mp4' && ordinary.size === 64, JSON.stringify(ordinary));

  console.log('\n2. a clip whose backing store is gone is KEPT (never discard evidence) and said aloud, in its own wording, right now — not deferred to a silent Save-time failure');
  const dying = await p.evaluate(async (key) => {
    delete draft.positions[key].video;
    const nf = () => { const e = new Error('The requested file could not be read'); e.name = 'NotFoundError'; return e; };
    const f = new File([new Uint8Array(32)], 'clip2.mp4', { type: 'video/mp4' });
    Object.defineProperty(f, 'arrayBuffer', { value: () => Promise.reject(nf()), configurable: true });
    const OrigFR = window.FileReader;
    window.FileReader = function () {
      const r = new OrigFR();
      r.readAsArrayBuffer = (b) => setTimeout(() => { try { Object.defineProperty(r, 'error', { value: nf(), configurable: true }); } catch (e) {} r.onerror && r.onerror(new ProgressEvent('error')); }, 0);
      r.readAsDataURL = r.readAsArrayBuffer;
      return r;
    };
    await acceptVideo(f, key);
    window.FileReader = OrigFR;
    const v = draft.positions[key].video;
    return {
      kept: v === f,
      dlgOpen: document.getElementById('dlg').open,
      title: document.getElementById('dlgTitle').textContent,
      msg: document.getElementById('dlgMsg').textContent,
    };
  }, posKey);
  ok('the original, unreadable file is kept — nothing here ever discards evidence', dying.kept, JSON.stringify(dying));
  ok('a dialog is shown, now, while the inspector is still at the machine', dying.dlgOpen, JSON.stringify(dying));
  ok('  in the CLIP\'s own wording, not the photograph one', /video/i.test(dying.msg) && !/photograph/i.test(dying.msg), dying.msg);
  ok('  naming the file', dying.msg.includes('clip2.mp4'), dying.msg);
  if (await p.evaluate(() => document.getElementById('dlg')?.open)) { await p.click('#dlgOk'); await p.waitForTimeout(100); }

  console.log('\n3. extOf() names a clip by what it actually is, not "jpg" by default');
  /* attWrap() — the shared identity-name minter every photograph AND every
     clip goes through (build_rtw_open history, attIdOf/attNew) — calls
     extOf() to pick the id's own extension. Before this fix extOf() had no
     video branch, so a clip's internal id carried ".jpg" while its real
     bytes and declared type were video — this function's own comment
     already names that shape a lie for a photograph; it was exactly as true
     one call away, for a clip. */
  const extResult = await p.evaluate(() => ({
    mp4: extOf(new File([], 'x', { type: 'video/mp4' })),
    mov: extOf(new File([], 'x', { type: 'video/quicktime' })),
    webm: extOf(new File([], 'x', { type: 'video/webm' })),
    jpgStillJpg: extOf(new File([], 'x', { type: 'image/jpeg' })),
  }));
  ok('an mp4 clip is named .mp4, not .jpg', extResult.mp4 === 'mp4', JSON.stringify(extResult));
  ok('a QuickTime clip is named .mov', extResult.mov === 'mov', JSON.stringify(extResult));
  ok('a webm clip is named .webm', extResult.webm === 'webm', JSON.stringify(extResult));
  ok('  an ordinary photograph is untouched', extResult.jpgStillJpg === 'jpg', JSON.stringify(extResult));

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await ctx.close(); await b.close(); srv.close();
  console.log(fails.length ? `\nFAILED ${fails.length}: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); process.exit(1); });
