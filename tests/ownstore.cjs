/* THE STORE IS NEVER HANDED BACK ITS OWN POINTER (CM_OWNBYTES_V1).

   "Error preparing Blob/File data to be stored in object store": TK154 on
   12.11.2026 (Save refused), TK158 on 06.11 (four refusals), and writeback-fail /
   confirm-writeback-fail in the iPhone traces. WebKit refuses to copy a Blob
   into IndexedDB when the file behind it belongs to the store and has gone or
   is being replaced. A Blob read out of IndexedDB is such a pointer. The
   draft brought back after the app reloads for an update, and the upload
   bookkeeping that reads a round and writes it back, both handed the store its
   own pointers.

   Chromium copies these without complaint, so the platform is stood in for:
   every Blob that comes out of dbGet/dbAll is a "store pointer", and
   IDBObjectStore.put refuses, with the field's sentence, any value that
   carries one. Contracts:
     1. a write-back of a round read from the store is not refused, and the
        photographs come back byte for byte;
     2. a draft restored after a reload holds bytes, not pointers: the next
        autosave and Save both go through, with every photograph intact;
     3. an autosave reads nothing it already holds (photographs this page
        made are passed as they are);
     4. a file that cannot be read is logged and the write is still tried.
   Run: node tests/ownstore.cjs   (starts its own server on 8493+ arg) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8496);
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const srv = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('x'); }
  s.end(fs.readFileSync(p));
});

/* Installed before the app defines dbGet/dbAll, re-applied once it has. */
const RIG = () => {
  window.__refused = 0;
  const HANDLES = new WeakSet();
  window.__isHandle = b => HANDLES.has(b);
  const asHandle = b => { if (!(b instanceof Blob)) return b; const f = b instanceof File ? new File([b], b.name, { type: b.type }) : new Blob([b], { type: b.type }); HANDLES.add(f); return f; };
  window.__wrapRec = r => {
    if (!r || typeof r !== 'object') return r;
    for (const p of Object.values(r.positions || {})) {
      if (!p || typeof p !== 'object') continue;
      if (Array.isArray(p.photos)) p.photos = p.photos.map(asHandle);
      if (p.video) p.video = asHandle(p.video);
    }
    if (r.sign) r.sign = asHandle(r.sign);
    return r;
  };
  const carries = v => {
    if (v instanceof Blob) return HANDLES.has(v);
    if (Array.isArray(v)) return v.some(carries);
    if (v && typeof v === 'object') return Object.values(v).some(carries);
    return false;
  };
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (v, k) {
    if (carries(v)) { window.__refused++; throw new DOMException('Error preparing Blob/File data to be stored in object store', 'UnknownError'); }
    return put.call(this, v, k);
  };
  window.__patchReads = () => {
    if (window.__readsPatched) return; window.__readsPatched = true;
    const g = window.dbGet, a = window.dbAll;
    window.dbGet = async id => window.__wrapRec(await g(id));
    window.dbAll = async () => (await a()).map(window.__wrapRec);
  };
  document.addEventListener('DOMContentLoaded', () => window.__patchReads());
};

const jpeg = n => [0xff, 0xd8, 0xff, 0xe0, n, n + 1, n + 2, n + 3, 0xff, 0xd9];

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]'); });
  await p.addInitScript(RIG);
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof reArmForSave === 'function' && window.__readsPatched, null, { timeout: 20000 });
  await p.waitForTimeout(1200);

  console.log('a round walked part-way, autosaved');
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(200);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(200);
  await p.evaluate(() => openHdr());
  await p.fill('#inspector', 'R. Marrero');
  const first = await p.evaluate(async (bytes) => {
    const keys = items().map(x => x.k);
    curItem = keys[0]; const pos = curP(); pos.photos ||= [];
    addPos(pos, await intake(new File([new Uint8Array(bytes)], 'x.jpg', { type: 'image/jpeg' })), 'COMPONENT'); pos.grade = 1; saveCur();
    const r = await draftFlush();
    return { ok: r.ok, k: keys[0], k2: keys[1] };
  }, jpeg(1));
  ok(first.ok, 'the draft is stored', JSON.stringify(first));

  console.log('2. the app reloads for an update and brings the round back by itself');
  await p.evaluate(() => sessionStorage.setItem('cm_resume_silent', '1'));
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof curEquip !== 'undefined' && curEquip === 'TK151' && Object.keys(draft.positions || {}).length > 0, null, { timeout: 20000 });
  await p.waitForTimeout(300);
  const restored = await p.evaluate((k) => {
    const ph = (draft.positions[k] || {}).photos || [];
    return { n: ph.length, handles: ph.filter(window.__isHandle).length, names: ph.map(f => f.name) };
  }, first.k);
  ok(restored.n === 1, 'the restored round has its photograph', JSON.stringify(restored));
  ok(restored.handles === 0, 'and holds the bytes, not the store\'s pointer to them', JSON.stringify(restored));

  const flush2 = await p.evaluate(async (args) => {
    curItem = args.k2; const pos = curP(); pos.photos ||= [];
    addPos(pos, await intake(new File([new Uint8Array(args.bytes)], 'y.jpg', { type: 'image/jpeg' })), 'COMPONENT'); pos.grade = 1; saveCur();
    const r = await draftFlush();
    return { ok: r.ok, why: r.why || '', refused: window.__refused };
  }, { k2: first.k2, bytes: jpeg(2) });
  ok(flush2.ok && flush2.refused === 0, 'the next autosave goes through', JSON.stringify(flush2));

  console.log('3. an autosave reads nothing it already holds');
  const reads = await p.evaluate(async () => {
    const real = window.readBlobBytes; let n = 0;
    window.readBlobBytes = (x) => { n++; return real(x); };
    const k = Object.keys(draft.positions)[0]; draft.positions[k].comment = 'ok ' + Date.now();
    const r = await draftFlush();
    window.readBlobBytes = real;
    return { ok: r.ok, n };
  });
  ok(reads.ok && reads.n === 0, 'no photograph was read again to autosave', JSON.stringify(reads));

  await p.evaluate(PLANT);
  await p.evaluate(() => goStep(3));
  await p.waitForTimeout(200);
  await p.click('#saveBtn');
  await p.waitForTimeout(1500);
  const saved = await p.evaluate(async () => {
    const d = document.querySelector('dialog[open]');
    const all = await dbAll(); const r = all.find(x => x.equip === 'TK151');
    const out = { dlg: d ? d.innerText.slice(0, 160) : '', refused: window.__refused, n: all.length, bytes: [] };
    if (r) for (const p of Object.values(r.positions)) for (const f of (p.photos || [])) {
      out.bytes.push(Array.from(new Uint8Array(await f.arrayBuffer())).slice(4, 6).join(','));
    }
    out.id = r && r.id;
    return out;
  });
  ok(!/Not saved|Error preparing|could NOT/i.test(saved.dlg), 'Save is not refused', saved.dlg);
  ok(saved.refused === 0, 'the store was never handed its own pointer', 'refused ' + saved.refused);
  ok(saved.bytes.includes('1,2') && saved.bytes.includes('2,3'), 'both photographs are in the saved round, byte for byte', JSON.stringify(saved.bytes));
  await p.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d && d.close) d.close(); });

  console.log('1. the upload bookkeeping reads the round and writes it back');
  const wb = await p.evaluate(async (id) => {
    const r = await dbGet(id);
    const had = Object.values(r.positions).flatMap(x => x.photos || []).filter(window.__isHandle).length;
    r.upTo = Object.assign({}, r.upTo, { gas: 1 }); r.up = 1;
    let err = '';
    try { await dbPut(r); } catch (e) { err = String(e && e.message || e); }
    const back = await dbGet(id);
    const bytes = [];
    for (const p of Object.values(back.positions)) for (const f of (p.photos || [])) bytes.push(Array.from(new Uint8Array(await f.arrayBuffer())).slice(4, 6).join(','));
    return { had, err, up: back.up, bytes, refused: window.__refused };
  }, saved.id);
  ok(wb.had > 0, 'the round read from the store carries the store\'s pointers (the rig is live)', JSON.stringify(wb));
  ok(!wb.err && wb.up === 1, 'the write-back is not refused', JSON.stringify(wb));
  ok(wb.bytes.includes('1,2') && wb.bytes.includes('2,3'), 'and every photograph is still there, byte for byte', JSON.stringify(wb.bytes));

  console.log('4. a file that cannot be read is logged, and the write is still tried');
  const left = await p.evaluate(async (id) => {
    const real = window.readBlobBytes;
    window.readBlobBytes = () => Promise.reject(new DOMException('gone', 'NotFoundError'));
    const r = await dbGet(id); r.note4 = 1;
    let err = '';
    try { await dbPut(r); } catch (e) { err = String(e && e.message || e); }
    window.readBlobBytes = real;
    return { err, logged: (window.__sync || []).some(e => e.ev === 'db-detach-left') };
  }, saved.id);
  ok(/Error preparing/.test(left.err), 'the write was tried and the platform\'s own answer came back', left.err);
  ok(left.logged, 'and the unreadable file is in the trace (db-detach-left)', JSON.stringify(left));

  ok(errs.length === 0, 'no page errors throughout', errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
