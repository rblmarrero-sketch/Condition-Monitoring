/* EDITING A SAVED ROUND MUST NOT DEPEND ON FILES THE STORE MAY HAVE REPLACED.

   Read off TK157 on 2026-10-04 (iPhone, offline, signal dead for 45 minutes):
   a round saved, Edit pressed, photographs added at a second component, Save —
   "Error preparing Blob/File data to be stored in object store", five presses,
   the trace says hadReqErr:true (the put's own request refused the value).
   The Saved list is painted from a read made long before; the photographs in
   it are handles onto files the store owns, and the store rewrites them every
   time the record is written, which a phone with a failing link does on every
   retry. Edit used the painted record, so the draft held pointers to files
   already gone and Save could not put them back.

   Chromium does not reproduce the platform behaviour, so the stale handle is
   stood in for by a 7-byte File whose three readers all refuse (the rig
   tests/staleblob.cjs uses), and the refused write by a dbPut that throws the
   field's exact sentence when the record carries one. Two contracts:
     1. Edit reads the round again and holds bytes, not handles.
     2. A Save refused over an unreadable photograph is retried once from the
        store's current copy of the same file, and says nothing if that works.
   Run: node tests/staleedit.cjs   (starts its own server on 8489) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8489);
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const srv = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('x'); }
  s.end(fs.readFileSync(p));
});
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]'); localStorage.setItem('cm_resume_silent', '0'); });
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof reArmForSave === 'function', null, { timeout: 20000 });
  await p.waitForTimeout(500);

  /* The poison: a File of exactly 7 bytes cannot be read by any of the three readers. */
  await p.evaluate(() => {
    const POISON = 7;
    const ab = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () { return this.size === POISON ? Promise.reject(new DOMException('gone', 'NotFoundError')) : ab.call(this); };
    for (const m of ['readAsArrayBuffer', 'readAsDataURL']) {
      const o = FileReader.prototype[m];
      FileReader.prototype[m] = function (b) { if (b && b.size === POISON) { setTimeout(() => this.onerror && this.onerror(new Event('error')), 0); return; } return o.call(this, b); };
    }
    window.__poison = (name) => attWrapNamed(new File([new Uint8Array(POISON)], name, { type: 'image/jpeg' }));
    window.attWrapNamed = (f) => f;
  });

  console.log('a two-position round, saved');
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(200);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(200);
  await p.evaluate(() => openHdr());
  await p.fill('#inspector', 'R. Marrero');
  await p.evaluate(async () => {
    const mk = (n) => attWrap(new File([new Uint8Array([n, n, n, n, n])], 'x.jpg', { type: 'image/jpeg' }));
    const keys = items().map(x => x.k);
    curItem = keys[0]; let pos = curP(); pos.photos ||= []; addPos(pos, mk(1), 'COMPONENT'); pos.grade = 1; saveCur();
    curItem = keys[1]; pos = curP(); pos.photos ||= []; addPos(pos, mk(2), 'COMPONENT'); pos.grade = 1; saveCur();
  });
  await p.evaluate(PLANT);
  await p.evaluate(() => goStep(3));
  await p.waitForTimeout(200);
  await p.click('#saveBtn');
  await p.waitForTimeout(900);
  const saved = await p.evaluate(async () => { const all = await dbAll(); const r = all[0]; return r ? { id: r.id, rev: r.rev, names: Object.values(r.positions).flatMap(x => (x.photos || []).map(f => f.name)) } : null; });
  ok(saved && saved.names.length >= 2, 'the round is saved with its photographs', JSON.stringify(saved));
  await p.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d && d.close) d.close(); });

  console.log('1. Edit reads the round again, from a list painted before the files went stale');
  const edit = await p.evaluate(async () => {
    /* Paint the Saved list from records whose photographs are dead handles. */
    const realAll = window.dbAll;
    window.dbAll = async () => (await realAll()).map(r => {
      const c = Object.assign({}, r); c.positions = {};
      for (const [k, pp] of Object.entries(r.positions)) c.positions[k] = Object.assign({}, pp, { photos: (pp.photos || []).map(f => new File([new Uint8Array(7)], f.name, { type: 'image/jpeg' })) });
      return c; });
    await renderPending();
    window.dbAll = realAll;
    document.querySelector('.pitem .edit').click();
    await new Promise(r => setTimeout(r, 900));
    const ph = Object.values(draft.positions).flatMap(x => x.photos || []);
    return { n: ph.length, sizes: ph.map(f => f.size), editing: !!editing };
  });
  ok(edit.editing, 'Edit opened the round', JSON.stringify(edit));
  ok(edit.n >= 2 && edit.sizes.every(s => s !== 7), 'and its photographs are the real bytes, not the dead handles the list was painted from', JSON.stringify(edit));

  console.log('2. a Save refused over an unreadable photograph is recovered from the store');
  const rec2 = await p.evaluate(async () => {
    /* A photograph that went dead between Edit and Save, and a store that refuses it. */
    const k = Object.keys(draft.positions).filter(x => x !== GEN_KEY)[0];
    const name = draft.positions[k].photos[0].name;
    draft.positions[k].photos[0] = new File([new Uint8Array(7)], name, { type: 'image/jpeg' });
    const realPut = window.dbPut; window.__puts = 0;
    window.dbPut = async (rec) => {
      if (rec.id !== '__draft__') window.__puts++;
      const dead = Object.values(rec.positions || {}).some(x => (x.photos || []).some(f => f.size === 7));
      if (dead) { window.__refused = (window.__refused || 0) + 1; const e = new Error('Error preparing Blob/File data to be stored in object store'); e.phase = 'error'; e.hadReqErr = true; throw e; }
      return realPut(rec);
    };
    return { k, name };
  });
  await p.evaluate(() => goStep(3));
  await p.waitForTimeout(200);
  await p.click('#saveBtn');
  await p.waitForTimeout(1500);
  const after = await p.evaluate(async () => {
    const all = await dbAll(); const r = all[0];
    const d = document.querySelector('dialog[open]');
    return { n: all.length, rev: r && r.rev, sizes: r ? Object.values(r.positions).flatMap(x => (x.photos || []).map(f => f.size)) : [], dlg: d ? d.innerText.slice(0, 160) : '', puts: window.__puts, refused: window.__refused,
             recovered: (window.__errs || []).length, still: !!editing };
  });
  ok(after.n === 1, 'one round in the store, not two', JSON.stringify(after));
  ok(after.rev === 2, 'the edit replaced it (revision 2)', JSON.stringify(after));
  ok(after.sizes.length >= 2 && after.sizes.every(s => s !== 7), 'with the real bytes of every photograph', JSON.stringify(after));
  ok(!/Error preparing|could not save|Could not save|retake this now/i.test(after.dlg), 'and the inspector was shown neither a save error nor a retake warning', after.dlg);
  ok(after.refused === 1 && after.puts >= 2, 'exactly one write was refused and the retry went through', 'refused ' + after.refused + ', puts ' + after.puts);

  console.log('3. with nothing to recover from, the error is still said');
  const nothing = await p.evaluate(async () => {
    const d = document.querySelector('dialog[open]'); if (d && d.close) d.close();
    const rid = (await dbAll())[0].id; const r = await dbGet(rid);
    editRecord(r);
    const k = Object.keys(draft.positions).filter(x => x !== GEN_KEY)[0];
    draft.positions[k].photos[0] = new File([new Uint8Array(7)], 'never-stored.jpg', { type: 'image/jpeg' });
    return true;
  });
  await p.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d && d.close) d.close(); goStep(3); });
  await p.waitForTimeout(200);
  await p.click('#saveBtn');
  await p.waitForTimeout(1500);
  const refused = await p.evaluate(async () => { const d = document.querySelector('dialog[open]'); const all = await dbAll(); return { dlg: d ? d.innerText.slice(0, 200) : '', rev: all[0] && all[0].rev }; });
  ok(/Error preparing|Blob/i.test(refused.dlg), 'a photograph the store cannot give back is still named in the dialog', refused.dlg);
  ok(refused.rev === 2, 'and the stored round is untouched', JSON.stringify(refused));

  ok(errs.length === 0, 'no page errors throughout', errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
