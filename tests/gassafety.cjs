/* GAS_SAFETY_V1 — the Apps Script backend's safety fixes, proved against the
   REAL docs/google-upload.gs over an in-memory Drive.

   What has to hold (audit of 26.10.2026, findings 1, 2, 4, 6, 11, 12, 14):
     1. a listing never stops at 4,000 files in silence: delete, rewrite and a
        single-photo delete address the round's own folders; action=list pages
        with a cursor; a whole-tree read that cannot finish is an error;
     2. a correction that leaves a key out keeps what is stored for it;
     3. op:delete with dry:true changes nothing, with or without dev;
     4. a lock that cannot be taken writes nothing and says "busy";
     5. action=file reads a path under the root (the LubeLink master);
     6. a single photo is found in its round's folder, not only the root;
     7. a name for every correction / void / resolve, a reason to void;
        _meta takes only the uploads phones and desks really make there;
        the desk key (Script property DESK_KEY) gates the office's changes and
        nothing the phones do.

   Run:  node tests/gassafety.cjs                 (the script in the repo)
         GS_SRC=/path/old.gs node tests/gassafety.cjs   (any other version)
   Against the version before GAS_SAFETY_V1 it fails; against this one it passes. */
const fs = require('fs');
const path = require('path');
const SRC = process.env.GS_SRC || path.join(__dirname, '..', 'docs', 'google-upload.gs');
const ROOT = '1AbCdEfGhIjKlMnOpQrStUvWxYz123456';
const ADMIN = 'letmein';
const fails = [];
const ok = (n, c, d) => {
  console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 220) : ''));
  if (!c) fails.push(n);
};
const b64 = s => Buffer.from(typeof s === 'string' ? s : JSON.stringify(s)).toString('base64');

/* ---- an in-memory Drive -------------------------------------------------
   Folders may share a name; nothing is ordered for the script's benefit.
   `clk` is the clock the script sees: in slow mode every Drive call costs
   time, so a walk really can run out of it. */
function mkWorld() {
  const W = { seq: 0, now: Date.parse('2026-10-26T00:00:00Z'), slow: null, calls: { list: 0, prop: 0 },
              props: {}, busy: false, byId: {}, trashed: [] };
  const cost = k => { W.calls[k]++; if (W.slow) W.now += W.slow[k]; };
  const it = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
  const stamp = () => (W.now += 1);
  function mkFile(name, buf, dir) {
    const f = { _id: 'f' + (++W.seq), _name: name, _buf: buf, _upd: stamp(), _dir: dir, _desc: '', _trash: false,
      getId: () => { cost('prop'); return f._id; }, getName: () => { cost('prop'); return f._name; },
      getSize: () => { cost('prop'); return f._buf.length; }, getUrl: () => 'https://drive/' + f._id,
      getLastUpdated: () => { cost('prop'); return new Date(f._upd); },
      getDescription: () => f._desc, setDescription: d => { f._desc = d; return f; },
      getParents: () => it([f._dir]),
      getBlob: () => ({ getBytes: () => f._buf, getDataAsString: () => f._buf.toString('utf8'),
                        getContentType: () => /\.json$/i.test(f._name) ? 'application/json' : 'image/jpeg' }),
      setContent: s => { f._buf = Buffer.from(String(s)); f._upd = stamp(); return f; },
      setTrashed: v => { if (v && !f._trash) { f._trash = true; W.trashed.push(f.path()); } },
      path: () => (f._dir.path() ? f._dir.path() + '/' : '') + f._name };
    W.byId[f._id] = f; return f;
  }
  function mkDir(name, parent) {
    const d = { _id: 'd' + (++W.seq), _name: name, _parent: parent, _subs: [], _files: [], _born: stamp(), _trash: false,
      getId: () => d._id, getName: () => { cost('prop'); return d._name; }, getDateCreated: () => new Date(d._born),
      getParents: () => it(d._parent ? [d._parent] : []),
      getFiles: () => { cost('list'); return it(d._files.filter(f => !f._trash)); },
      getFolders: () => { cost('list'); return it(d._subs.filter(x => !x._trash)); },
      getFoldersByName: n => { cost('list'); return it(d._subs.filter(x => !x._trash && x._name === n)); },
      getFilesByName: n => { cost('list'); return it(d._files.filter(f => !f._trash && f._name === n)); },
      createFolder: n => { const c = mkDir(n, d); d._subs.push(c); return c; },
      createFile: (a, b2) => {           // a Blob, or (name, content, mime)
        const blob = typeof a === 'string' ? { name: a, bytes: Buffer.from(String(b2)) } : a;
        const buf = Buffer.isBuffer(blob.bytes) ? blob.bytes : Buffer.from(blob.bytes || '');
        const f = mkFile(blob.name, buf, d); d._files.push(f); return f; },
      setTrashed: v => { d._trash = !!v; },
      path: () => d._parent ? ((d._parent.path() ? d._parent.path() + '/' : '') + d._name) : '' };
    W.byId[d._id] = d; return d;
  }
  W.root = mkDir('CM_backup_Pechanka', null); W.root._id = ROOT; W.byId[ROOT] = W.root;
  W.put = (p, body) => {
    const parts = p.split('/'), name = parts.pop();
    let d = W.root;
    parts.forEach(x => { d = d._subs.find(s => s._name === x && !s._trash) || d.createFolder(x); });
    const f = mkFile(name, Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)), d);
    d._files.push(f); return f;
  };
  W.find = p => Object.values(W.byId).filter(x => x._buf && !x._trash && x.path() === p);
  W.alive = () => Object.values(W.byId).filter(x => x._buf && !x._trash).map(x => x.path());
  return W;
}
function load(W, src) {
  src = src.replace(/const SECRET = '[^']*';/, "const SECRET = '';")
           .replace(/const ROOT_FOLDER_ID = '[^']*';/, 'const ROOT_FOLDER_ID = ' + JSON.stringify(ROOT) + ';')
           .replace(/const ADMIN_SECRET = '[^']*';/, 'const ADMIN_SECRET = ' + JSON.stringify(ADMIN) + ';');
  class VDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(W.now); }
    static now() { return W.now; }
  }
  const sb = {
    Date: VDate,
    DriveApp: { getFolderById: id => { if (id !== ROOT) throw new Error('no folder'); return W.root; },
                getFileById: id => { const f = W.byId[id]; if (!f || !f._buf) throw new Error('No item with the given ID could be found'); return f; } },
    Utilities: { ...require('./gsdigest.cjs'), base64Decode: s => Buffer.from(s, 'base64'),
                 base64Encode: b => Buffer.from(b).toString('base64'),
                 newBlob: (bytes, ct, name) => ({ bytes: Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes)), ct, name,
                   getBytes() { return this.bytes; }, getDataAsString() { return this.bytes.toString('utf8'); } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) },
    Logger: { log: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => W.props[k] === undefined ? null : W.props[k],
      setProperty: (k, v) => { W.props[k] = String(v); }, deleteProperty: k => { delete W.props[k]; } }) },
    LockService: { getScriptLock: () => ({
      waitLock: () => { if (W.busy) throw new Error('Lock timeout: another process was holding the lock for too long.'); },
      tryLock: () => !W.busy, releaseLock: () => {} }) },
  };
  const api = new Function(...Object.keys(sb), src + '\n;return {doGet:doGet, doPost:doPost};')(...Object.values(sb));
  return {
    post: b => api.doPost({ postData: { contents: JSON.stringify(b) } }),
    get: p => api.doGet({ parameter: p }),
  };
}
const SOURCE = fs.readFileSync(SRC, 'utf8');
const world = () => { const W = mkWorld(); return { W, S: load(W, SOURCE) }; };
const sidecar = (u, d, ty, dev) => ({ type: 'cm-inspection-entries', version: 2,
  records: [{ equip: u, date: d, type: ty, by: 'B. Ivanov', dev: dev || 'DPHONE1', items: [{ key: '4C', grade: 2 }] }] });
const dmy = d => d.split('-').reverse().join('.');
function section(name, fn) {
  console.log('\n' + name);
  try { fn(); } catch (e) { ok(name + ' ran to the end', false, String(e && e.stack || e).split('\n').slice(0, 2).join(' | ')); }
}

/* A folder past the old 4,000-file cap: 1,000 round folders of filler under
   INSP, then the round under test in TB, which every walk reaches last. */
function bigFolder(W, nFolders, perFolder) {
  for (let i = 0; i < nFolders; i++) {
    const u = 'TK' + String(i % 200).padStart(3, '0'), d = '2026-09-' + String(1 + Math.floor(i / 200)).padStart(2, '0');
    for (let k = 0; k < perFolder; k++) W.put(`INSP/${u}/${d}/${u}.P${k}_${dmy(d)}_INSP_${i}.jpg`, 'J');
  }
  W.put('TB/TK999/2026-10-24/TK999_24.10.2026_TB.json', sidecar('TK999', '2026-10-24', 'TB'));
  W.put('TB/TK999/2026-10-24/TK999.F95_24.10.2026_TB.jpg', 'JPEG-F95');
  W.put('TB/TK999/2026-10-24/TK999.F96_24.10.2026_TB.jpg', 'JPEG-F96');
}

section('1. a folder past 4,000 files', () => {
  const { W, S } = world();
  bigFolder(W, 1000, 10);
  const total = W.alive().length;
  ok('the folder holds more than the old cap', total > 4000, total);

  const pages = []; let cur = '', guard = 0, seen = new Set(), dup = 0;
  for (;;) {
    const r = S.get({ action: 'list', cursor: cur });
    pages.push(r.count);
    (r.files || []).forEach(f => { if (seen.has(f.path)) dup++; seen.add(f.path); });
    if (!r.truncated || !r.cursor || ++guard > 20) break;
    cur = r.cursor;
  }
  ok('action=list pages through the whole folder with its cursor', seen.size === total, seen.size + ' of ' + total + ' in pages ' + pages.join('+'));
  ok('no file is listed twice across pages', dup === 0, dup);
  ok('the first page still says truncated (an old client sees what it always did)', S.get({ action: 'list' }).truncated === true);

  const rec = S.get({ action: 'records', after: '9e15', index: '1' });
  const okRec = rec.ok === false ? !!rec.truncated : (rec.index || []).some(f => f.name === 'TK999.F95_24.10.2026_TB.jpg');
  ok('the file index reaches a photograph past the old cap (or says it could not)', okRec,
     rec.ok === false ? rec.error : (rec.index || []).length + ' indexed');
  ok('...and here it reaches it', rec.ok !== false && (rec.index || []).some(f => f.name === 'TK999.F96_24.10.2026_TB.jpg'));

  const rw = S.post({ op: 'rewrite', admin: ADMIN, id: 'TK999_24.10.2026_TB.json', why: 'grade fix',
                      file: b64(sidecar('TK999', '2026-10-24', 'TB', 'DPHONE2')) });
  ok('rewrite finds a round past the old cap by its name', rw.ok === true, rw.error || rw);

  const df = S.post({ op: 'delfile', admin: ADMIN, name: 'TK999.F96_24.10.2026_TB.jpg', key: 'TK999|2026-10-24|TB',
                      by: 'Office', why: 'wrong machine' });
  ok('a single photo is found in its round folder and deleted', df.ok === true && df.deleted === 1, df.error || df);
  ok('...and it is gone from Drive', !W.find('TB/TK999/2026-10-24/TK999.F96_24.10.2026_TB.jpg').length);

  const del = S.post({ op: 'delete', admin: ADMIN, key: 'TK999|2026-10-24|TB', by: 'Office', reason: 'test round' });
  ok('a whole-round delete past the old cap finds the round', del.ok === true && del.deleted >= 2, del.error || del);
  ok('...and its files are in the trash', !W.alive().some(p => p.indexOf('TB/TK999/') === 0), W.alive().filter(p => p.indexOf('TB/TK999/') === 0));

  W.calls = { list: 0, prop: 0 };
  S.get({ action: 'list', max: '20000' });
  const est = W.calls.list * 0.12 + W.calls.prop * 0.01;
  console.log(`  NOTE  one walk of ${total} files in 1,000 folders: ${W.calls.list} folder calls, ${W.calls.prop} file calls `
            + `(~${Math.round(est)} s at an assumed 0.12 s a folder call and 0.01 s a file call — `
            + 'the harness cannot time Google; the figures are from the script\'s own notes on 800 folders)');
});

section('1b. a walk that runs out of time', () => {
  const { W, S } = world();
  bigFolder(W, 1000, 10);
  W.slow = { list: 120, prop: 10 };            // ms of the script's clock per Drive call
  const r = S.get({ action: 'records', after: '0', index: '1' });
  ok('a whole-tree read that cannot finish is an error, not a short answer', r.ok === false && r.truncated === true, r.error || ('ok:' + r.ok + ' files:' + r.files));
  const pages = []; let cur = '', guard = 0; const seen = new Set();
  for (;;) {
    const p = S.get({ action: 'list', cursor: cur });
    pages.push(p.count); (p.files || []).forEach(f => seen.add(f.path));
    if (!p.truncated || ++guard > 40) break;
    cur = p.cursor;
  }
  ok('action=list stops on its clock and the cursor carries on to the end', seen.size === W.alive().length,
     seen.size + ' of ' + W.alive().length + ' in ' + pages.length + ' pages');
  W.slow = null;
});

section('1c. a round in a folder this script cannot place from its key', () => {
  const { W, S } = world();
  bigFolder(W, 450, 10);
  W.slow = { list: 300, prop: 30 };
  // a round in a folder pattern this script cannot place from the key: only a walk finds it
  W.put('ODD/place/TK888_24.10.2026_TB.json', sidecar('TK888', '2026-10-24', 'TB'));
  const del = S.post({ op: 'delete', admin: ADMIN, key: 'TK888|2026-10-24|TB', by: 'Office', reason: 'x' });
  ok('a delete whose walk could not finish says so and deletes nothing', del.ok === false && del.truncated === true && W.find('ODD/place/TK888_24.10.2026_TB.json').length === 1,
     del.error || del);
  W.slow = null;
  const del2 = S.post({ op: 'delete', admin: ADMIN, key: 'TK888|2026-10-24|TB', by: 'Office', reason: 'x', dry: true });
  ok('with time to walk, it is found where the phone put it', del2.ok === true && (del2.would || []).length === 1, del2.error || del2);
});

section('2. a correction keeps what it does not send', () => {
  const { W, S } = world();
  const key = 'TK146|2026-10-20|INSP';
  const a = S.post({ op: 'edit', key, by: 'Desk A', ifAt: '', fields: { smu: 12345 },
    move: { equip: 'TK158', date: '2026-10-20', type: 'INSP' }, assign: { 'x.jpg': { general: 1 } },
    media: { 'x.jpg': { rot: 90 } }, reports: [{ rev: 1, status: 'ISSUED' }], items: { 'HS.CV': { owner: 'Ivanov' } }, note: 'n1' });
  ok('a full correction saves', a.ok === true, a.error);
  // the action drawer's shape (dashboard/index.html, the follow-up drawer)
  const b = S.post({ op: 'edit', key, by: 'Desk B', ifAt: a.at, void: false, reason: '', note: 'n1', items: { 'HS.CV': { owner: 'Petrov' } } });
  ok('a partial correction saves', b.ok === true, b.error);
  const e = (S.get({ action: 'records', after: '0' }).edits || []).find(x => x.key === key) || {};
  ok('the re-file (move) is kept', e.move && e.move.equip === 'TK158', e.move);
  ok('the hour-meter fix (fields) is kept', e.fields && e.fields.smu === 12345, e.fields);
  ok('photo assignments, crops and the report log are kept',
     e.assign && e.assign['x.jpg'] && e.media && e.media['x.jpg'] && e.reports && e.reports.length === 1, { assign: e.assign, media: e.media, reports: e.reports });
  ok('the key it did send replaced the stored one', e.items && e.items['HS.CV'].owner === 'Petrov' && e.by === 'Desk B');
  // a report log alone (logReport) must not drop the fields either
  const c = S.post({ op: 'edit', key, by: 'Desk C', ifAt: b.at, reports: [{ rev: 1 }, { rev: 2 }] });
  const e2 = (S.get({ action: 'records', after: '0' }).edits || []).find(x => x.key === key) || {};
  ok('a report log keeps the correction under it', c.ok && e2.fields && e2.fields.smu === 12345 && e2.reports.length === 2 && e2.items['HS.CV'], e2);
  // explicit null / empty clears
  const d = S.post({ op: 'edit', key, by: 'Desk A', ifAt: c.at, move: null, fields: {} });
  const e3 = (S.get({ action: 'records', after: '0' }).edits || []).find(x => x.key === key) || {};
  ok('an explicit move:null puts the round back', d.ok && e3.move === null, e3.move);
  ok('an explicit empty fields clears them', JSON.stringify(e3.fields) === '{}', e3.fields);
  ok('...and the rest still stands', e3.note === 'n1' && e3.assign && e3.media);
  // the backup and the conflict check still work
  const stale = S.post({ op: 'edit', key, by: 'Desk B', ifAt: a.at, note: 'late' });
  ok('a write against an old version is still refused', stale.ok === false && stale.conflict === true);
  ok('every replaced version is backed up', W.alive().filter(p => /^_meta\/backup\/.+\.edit\.json$/.test(p)).length >= 3);
});

section('2b. a client that sends the whole document sees no difference', () => {
  const full = { op: 'edit', key: 'TK147|2026-10-21|MP', by: 'Desk A', void: false, reason: '', note: 'whole',
    fields: { smu: 1 }, move: null, media: null, assign: null, reports: null, items: { '4C': { owner: 'X' } } };
  const strip = o => { const c = JSON.parse(JSON.stringify(o)); delete c.at; return c; };
  const { W, S } = world();
  S.post(Object.assign({}, full, { ifAt: '', note: 'first', fields: { smu: 9 }, move: { equip: 'TK1', date: '2026-10-21', type: 'MP' } }));
  S.post(Object.assign({}, full));
  const got = (S.get({ action: 'records', after: '0' }).edits || [])[0];
  const want = { type: 'cm-record-edit', version: 1, key: full.key, by: 'Desk A', void: false, reason: '', note: 'whole',
                 fields: { smu: 1 }, move: null, media: null, assign: null, reports: null, items: { '4C': { owner: 'X' } } };
  ok('the stored document is exactly what was sent', JSON.stringify(strip(got)) === JSON.stringify(want), strip(got));
});

section('2c. void and unvoid', () => {
  const { S } = world();
  const key = 'TK148|2026-10-22|FC';
  const v0 = S.post({ op: 'edit', key, by: 'Desk A', void: true, reason: '', items: {} });
  ok('voiding without a reason is refused', v0.ok === false, v0);
  const v1 = S.post({ op: 'edit', key, by: 'Desk A', void: true, reason: 'test round', items: {} });
  ok('voiding with a reason works', v1.ok === true, v1.error);
  const e1 = (S.get({ action: 'records', after: '0' }).edits || [])[0] || {};
  ok('...and is stored', e1.void === true && e1.reason === 'test round');
  const echo = S.post({ op: 'edit', key, by: 'Desk B', items: { '4E': { owner: 'Y' } } });
  const e2 = (S.get({ action: 'records', after: '0' }).edits || [])[0] || {};
  ok('a later edit that does not mention the void keeps it', echo.ok && e2.void === true && e2.reason === 'test round', e2);
  const u = S.post({ op: 'edit', key, by: 'Desk A', void: false, reason: '', items: e2.items });
  const e3 = (S.get({ action: 'records', after: '0' }).edits || [])[0] || {};
  ok('unvoid (void:false, empty reason) works', u.ok && e3.void === false && e3.reason === '', e3);
});

section('3. dry:true never changes anything', () => {
  const { W, S } = world();
  W.put('FC/TK148/2026-03-11/TK148_11.03.2026_FC.json', sidecar('TK148', '2026-03-11', 'FC'));
  W.put('FC/TK148/2026-03-11/TK148.4E_11.03.2026_FC.jpg', 'J');
  W.put('FC/TK148/2026-03-11/TK148_11.03.2026_FC~DOTHER.json', sidecar('TK148', '2026-03-11', 'FC', 'DOTHER'));
  const before = W.alive().length;
  const r = S.post({ op: 'delete', admin: ADMIN, key: 'TK148|2026-03-11|FC', by: 'Office', reason: 'dry run', dry: true });
  ok('a dry run of a whole round lists what would go', r.ok === true && r.dry === true && (r.would || []).length === 3, r);
  ok('...and nothing was deleted or logged', W.alive().length === before && !W.trashed.length, W.trashed);
  const r2 = S.post({ op: 'delete', admin: ADMIN, key: 'TK148|2026-03-11|FC', by: 'Office', reason: 'dry', dry: true, dev: 'DOTHER' });
  ok('a dry run of one device copy lists only it', r2.ok === true && (r2.would || []).length === 1 && W.alive().length === before, r2);
  const real = S.post({ op: 'delete', admin: ADMIN, key: 'TK148|2026-03-11|FC', by: 'Office', reason: 'real' });
  ok('a real delete still deletes the round, from its own folder', real.ok === true && real.deleted === 3, real);
});

section('4. a busy lock writes nothing', () => {
  const { W, S } = world();
  W.busy = true;
  const n0 = W.alive().length;
  const e = S.post({ op: 'edit', key: 'TK146|2026-10-20|INSP', by: 'Desk A', items: {} });
  ok('a correction under a busy lock answers busy', e.ok === false && e.busy === true && /busy, try again/.test(e.error || ''), e);
  ok('...and wrote nothing', W.alive().length === n0, W.alive());
  W.busy = false;
  W.put('_meta/TK146_09.03.2026_MP.conflict.json', { type: 'cm-record-conflict', version: 1, key: 'TK146|2026-03-09|MP', at: 'x',
    devices: [{ dev: 'DA', file: 'a' }, { dev: 'DB', file: 'b' }], resolved: false, keep: '', by: '' });
  W.busy = true;
  const r = S.post({ op: 'resolve', key: 'TK146|2026-03-09|MP', keep: 'DA', by: 'Desk A' });
  ok('a resolution under a busy lock answers busy', r.ok === false && r.busy === true, r);
  W.busy = false;
  // two phones, one round: the conflict marker needs the lock
  S.post({ op: 'batch', folder: 'MP/TK150/2026-10-25', dev: 'DONE', files: [{ name: 'TK150_25.10.2026_MP.json', file: b64(sidecar('TK150', '2026-10-25', 'MP', 'DONE')) }] });
  W.busy = true;
  const two = S.post({ op: 'batch', folder: 'MP/TK150/2026-10-25', dev: 'DTWO', files: [{ name: 'TK150_25.10.2026_MP.json', file: b64(sidecar('TK150', '2026-10-25', 'MP', 'DTWO')) }] });
  ok('a rival copy whose marker could not be written is reported failed, so the phone sends it again',
     two.ok === true && (two.failed || []).length === 1 && /busy/.test(two.failed[0].error || ''), two);
  ok('...and no half-written marker exists', !W.find('_meta/TK150_25.10.2026_MP.conflict.json').length);
  W.busy = false;
  const again = S.post({ op: 'batch', folder: 'MP/TK150/2026-10-25', dev: 'DTWO', files: [{ name: 'TK150_25.10.2026_MP.json', file: b64(sidecar('TK150', '2026-10-25', 'MP', 'DTWO')) }] });
  ok('the retry lands and writes the marker', (again.saved || []).length === 1 && W.find('_meta/TK150_25.10.2026_MP.conflict.json').length === 1, again);
});

section('5. action=file reads a path under the root', () => {
  const { W, S } = world();
  W.put('_meta/lube/master.json', { type: 'cm-lube-master', version: 1, rev: 7 });
  const r = S.get({ action: 'file', id: '_meta/lube/master.json' });
  let doc = null; try { doc = JSON.parse(Buffer.from(r.data || '', 'base64').toString('utf8')); } catch (e) {}
  ok('the LubeLink master is read by its path', r.ok === true && doc && doc.rev === 7, r.error || r.name);
  const miss = S.get({ action: 'file', id: '_meta/lube/nothere.json' });
  ok('a path with no file answers "not found" (the phone reads that as "no master")', miss.ok === false && /not\s*found/i.test(miss.error || ''), miss.error);
  const bad = ['../x.json', '/_meta/lube/master.json', '_meta/../_meta/lube/master.json', '_meta//lube/master.json', 'C:/x.json'];
  ok('".." and absolute paths are refused', bad.every(p => { const x = S.get({ action: 'file', id: p }); return x.ok === false && !x.data; }));
  ok('...and a refused path never says "not found"', bad.every(p => !/not\s*found/i.test(S.get({ action: 'file', id: p }).error || '')));
  const f = W.put('INSP/TK1/2026-10-01/TK1.HS_01.10.2026_INSP.jpg', 'J');
  ok('a Drive id still works', S.get({ action: 'file', id: f._id }).ok === true);
});

section('6. a single photo in its round folder', () => {
  const { W, S } = world();
  W.put('FC/TK148/2026-03-11/TK148_11.03.2026_FC.json', sidecar('TK148', '2026-03-11', 'FC'));
  W.put('FC/TK148/2026-03-11/TK148.4E_11.03.2026_FC.jpg', 'J');
  W.put('TK148.4E_11.03.2026_FC_2.jpg', 'J');                 // added from the office, in the root
  const r = S.post({ op: 'delfile', admin: ADMIN, name: 'TK148.4E_11.03.2026_FC.jpg', key: 'TK148|2026-03-11|FC', by: 'Office', why: 'wrong photo' });
  ok('a phone photo is deleted from its round folder', r.ok === true && r.deleted === 1, r.error || r);
  const r2 = S.post({ op: 'delfile', admin: ADMIN, name: 'TK148.4E_11.03.2026_FC_2.jpg', key: 'TK148|2026-03-11|FC', by: 'Office', why: 'dup' });
  ok('an office photo in the root still deletes', r2.ok === true && r2.deleted === 1, r2.error || r2);
  const r3 = S.post({ op: 'delfile', name: 'TK148.4E_11.03.2026_FC.jpg', key: 'TK148|2026-03-11|FC', by: 'Office', why: 'x' });
  ok('the admin password is still required', r3.ok === false && /admin password/i.test(r3.error || ''), r3.error);
  ok('the sidecar is untouched', W.find('FC/TK148/2026-03-11/TK148_11.03.2026_FC.json').length === 1);
});

section('7a. a name on every correction, void and decision', () => {
  const { W, S } = world();
  const e = S.post({ op: 'edit', key: 'TK146|2026-10-20|INSP', by: '  ', items: {} });
  ok('a correction with no name is refused', e.ok === false && /name/i.test(e.error || ''), e.error);
  const v = S.post({ op: 'edit', key: 'TK146|2026-10-20|INSP', void: true, reason: 'x', items: {} });
  ok('a void with no name is refused', v.ok === false, v.error);
  W.put('_meta/TK146_09.03.2026_MP.conflict.json', { type: 'cm-record-conflict', version: 1, key: 'TK146|2026-03-09|MP', at: 'x',
    devices: [{ dev: 'DA', file: 'a' }, { dev: 'DB', file: 'b' }], resolved: false, keep: '', by: '' });
  const r = S.post({ op: 'resolve', key: 'TK146|2026-03-09|MP', keep: 'DA', by: '' });
  ok('a resolution with no name is refused', r.ok === false && /name/i.test(r.error || ''), r.error);
  const r2 = S.post({ op: 'resolve', key: 'TK146|2026-03-09|MP', keep: 'DA', by: 'Desk A' });
  ok('with a name it resolves', r2.ok === true, r2.error);
  ok('nothing was written for the refused ones', !W.alive().some(p => /\.edit\.json$/.test(p)));
});

section('7a2. a report log alone may come without a name', () => {
  const { W, S } = world();
  const k = 'TK146|2026-10-20|INSP';
  const a = S.post({ op: 'edit', key: k, by: 'Desk A', note: 'n1', items: {} });
  ok('a named correction is stored', a.ok === true, a.error);
  const log = [{ rev: 1, at: '2026-10-26T00:00:00Z', by: '', status: 'issued', pages: 2 }];
  const r = S.post({ op: 'edit', key: k, by: '', void: false, reason: '', note: 'n1', items: {}, media: {}, reports: log });
  ok('logReport with no name, changing nothing else, is accepted', r.ok === true, r.error);
  const f = Object.values(W.byId).find(x => x._buf && !x._trash && /^_meta\/TK146_20\.10\.2026_INSP\.edit\.json$/.test(x.path()));
  const d = f ? JSON.parse(f._buf.toString('utf8')) : {};
  ok('the log is stored and the note kept', Array.isArray(d.reports) && d.reports.length === 1 && d.note === 'n1', JSON.stringify(d).slice(0, 160));
  const x = S.post({ op: 'edit', key: k, by: '', note: 'changed', reports: log });
  ok('no name + any other change is refused', x.ok === false && /name/i.test(x.error || ''), x.error);
});

section('7b. what an upload may put in _meta', () => {
  const { W, S } = world();
  const up = (folder, name, body, extra) => S.post(Object.assign({ op: 'batch', folder, dev: 'DPHONE1',
    files: [{ name, file: b64(body), contentType: 'application/json' }] }, extra || {}));
  const landed = r => r.ok === true && (r.saved || []).length === 1;
  const refused = r => (r.ok === false) || ((r.failed || []).length === 1 && !(r.saved || []).length);
  const n0 = W.alive().length;
  const forged = [
    ['_meta/deletions', '2026-10-25T00-00-00-000Z_TK146_09.03.2026_MP.deleted.json', { type: 'cm-deletion', key: 'TK146|2026-03-09|MP' }],
    ['_meta/deletions', 'x.file.json', { type: 'cm-file-deleted', name: 'a.jpg' }],
    ['_meta', 'TK146_09.03.2026_MP.edit.json', { type: 'cm-record-edit', key: 'TK146|2026-03-09|MP', void: true }],
    ['_meta', 'TK146_09.03.2026_MP.conflict.json', { type: 'cm-record-conflict', key: 'TK146|2026-03-09|MP' }],
    ['_meta/index', '2026-03.json', { type: 'cm-index-shard', records: [] }],
    ['_meta/push', 'abc.json', { endpoint: 'https://x' }],
    ['_meta/backup/2026', 'TK146_09.03.2026_MP.json', sidecar('TK146', '2026-03-09', 'MP')],
    ['_META/deletions', 'y.deleted.json', { type: 'cm-deletion', key: 'TK146|2026-03-09|MP' }],
    ['', '_meta/deletions/z.deleted.json', { type: 'cm-deletion', key: 'TK146|2026-03-09|MP' }],
    ['_meta/deferrals', 'TK146_MP.defer.json', { type: 'cm-record-edit', key: 'TK146|2026-03-09|MP' }],
    ['_meta/diag', 'x.deleted.json', { type: 'cm-sync-trace' }],
    ['_meta/diag', 'DX_1.json', { type: 'cm-record-edit', key: 'k' }],
    ['MP/TK146/2026-03-09', 'TK146_09.03.2026_MP.deleted.json', { type: 'cm-deletion', key: 'TK146|2026-03-09|MP' }],
    ['MP/TK146/2026-03-09', 'note.json', { type: 'cm-record-edit', key: 'TK146|2026-03-09|MP', void: true }],
  ];
  forged.forEach(([f, n, body]) => { const r = up(f, n, body); ok('refused: ' + (f ? f + '/' : '') + n, refused(r), r.error || (r.failed && r.failed[0]) || r); });
  ok('...and none of them reached Drive', W.alive().length === n0, W.alive());
  ok('no round reads as deleted or voided', !(S.get({ action: 'records', after: '0' }).deleted || []).length
     && !(S.get({ action: 'records', after: '0' }).edits || []).length);

  const legit = [
    ['phone deferral', up('_meta/deferrals', 'TK146_MP.defer.json', { type: 'cm-round-deferred', version: 1, u: 'TK146', t: 'MP', until: null, why: 'low-loader', by: 'A', at: '2026-10-25', dev: 'DPHONE1' })],
    ['office deferral (path in the name)', up('', '_meta/deferrals/TK147_FC.defer.json', { type: 'cm-round-deferred', version: 1, u: 'TK147', t: 'FC', until: null, why: '', by: 'Desk', at: 'x', cleared: 1, dev: 'DASH' })],
    ['phone diagnostic trace', up('_meta/diag', 'DPHONE1_2026-10-25T01-02-03.json', { type: 'cm-sync-trace', v: 1, dev: 'DPHONE1', lines: [] })],
    ['lube master (no DESK_KEY set)', up('', '_meta/lube/master.json', { type: 'cm-lube-master', version: 1, rev: 3 })],
    ['lube change log (no DESK_KEY set)', up('', '_meta/lube/log/2026-10-25T00-00-00-000Z_r3.json', { type: 'cm-lube-change', rev: 3, changes: [] })],
    ['a round sidecar', up('MP/TK146/2026-03-09', 'TK146_09.03.2026_MP.json', sidecar('TK146', '2026-03-09', 'MP'))],
  ];
  legit.forEach(([n, r]) => ok('accepted: ' + n, landed(r), r.error || (r.failed && r.failed[0]) || r));
  const photo = S.post({ op: 'batch', folder: 'MP/TK146/2026-03-09', dev: 'DPHONE1', files: [{ name: 'TK146.4C_09.03.2026_MP.jpg', file: b64('\xff\xd8\xff\xd9'), contentType: 'image/jpeg' }] });
  ok('accepted: a photograph', landed(photo), photo);
  const single = S.post({ name: 'TK146.4D_09.03.2026_MP.jpg', folder: 'MP/TK146/2026-03-09', dev: 'DPHONE1', file: b64('J'), contentType: 'image/jpeg' });
  ok('accepted: a single (non-batch) upload', single.ok === true, single.error);
  const single2 = S.post({ name: 'x.deleted.json', folder: '_meta/deletions', file: b64({ type: 'cm-deletion', key: 'TK146|2026-03-09|MP' }) });
  ok('refused: a single (non-batch) upload into _meta/deletions', single2.ok === false, single2);
  const office = S.post({ op: 'batch', files: [{ name: 'TK146.4C_09.03.2026_MP_2.jpg', mime: 'image/jpeg', file: b64('J') }] });
  ok('accepted: a photo added from the office (root, no folder)', landed(office), office);
  ok('the deferrals come back on the read', (S.get({ action: 'records', after: '0' }).deferrals || []).length === 2);
});

section('7c. the desk key', () => {
  const { W, S } = world();
  W.put('FC/TK148/2026-03-11/TK148_11.03.2026_FC.json', sidecar('TK148', '2026-03-11', 'FC'));
  W.put('FC/TK148/2026-03-11/TK148.4E_11.03.2026_FC.jpg', 'J');
  W.put('_meta/TK146_09.03.2026_MP.conflict.json', { type: 'cm-record-conflict', version: 1, key: 'TK146|2026-03-09|MP', at: 'x',
    devices: [{ dev: 'DA', file: 'a' }, { dev: 'DB', file: 'b' }], resolved: false, keep: '', by: '' });
  const e0 = S.post({ op: 'edit', key: 'TK148|2026-03-11|FC', by: 'Desk A', items: {} });
  ok('with no DESK_KEY set a correction works as before', e0.ok === true, e0.error);

  const KEY = 'k-' + Math.random().toString(36).slice(2) + '-desk';
  W.props.DESK_KEY = KEY;
  const MSG = 'office changes go through maintenance.vegadevelopment.com';
  const office = [
    ['edit', { op: 'edit', key: 'TK148|2026-03-11|FC', by: 'Desk A', items: {} }],
    ['void', { op: 'edit', key: 'TK148|2026-03-11|FC', by: 'Desk A', void: true, reason: 'x', items: {} }],
    ['unvoid', { op: 'edit', key: 'TK148|2026-03-11|FC', by: 'Desk A', void: false, reason: '', items: {} }],
    ['resolve', { op: 'resolve', key: 'TK146|2026-03-09|MP', keep: 'DA', by: 'Desk A' }],
    ['rewrite', { op: 'rewrite', admin: ADMIN, id: 'TK148_11.03.2026_FC.json', why: 'x', file: b64(sidecar('TK148', '2026-03-11', 'FC')) }],
    ['delfile', { op: 'delfile', admin: ADMIN, name: 'TK148.4E_11.03.2026_FC.jpg', key: 'TK148|2026-03-11|FC', by: 'O', why: 'x' }],
    ['delete', { op: 'delete', admin: ADMIN, key: 'TK148|2026-03-11|FC', by: 'O', reason: 'x' }],
  ];
  const n0 = W.alive().length;
  office.forEach(([n, b]) => {
    const r = S.post(b);
    ok(n + ' without the desk key is refused', r.ok === false && r.error === MSG, r.error);
    const w = S.post(Object.assign({}, b, { desk: KEY.slice(0, -1) + 'X' }));
    ok(n + ' with a wrong desk key is refused', w.ok === false && w.error === MSG, w.error);
    ok(n + ' refusal never carries the key', JSON.stringify(r).indexOf(KEY) < 0 && JSON.stringify(w).indexOf(KEY) < 0);
  });
  ok('...and nothing changed on Drive', W.alive().length === n0 && !W.trashed.length);
  const lm = S.post({ op: 'batch', files: [{ name: '_meta/lube/master.json', file: b64({ type: 'cm-lube-master', rev: 9 }) }] });
  ok('the lube master without the desk key is refused', (lm.failed || []).length === 1 && lm.failed[0].error === MSG, lm);
  const lm2 = S.post({ op: 'batch', desk: KEY, files: [{ name: '_meta/lube/master.json', file: b64({ type: 'cm-lube-master', rev: 9 }) }] });
  ok('the lube master with the desk key lands (LubeLink through /cm-api)', (lm2.saved || []).length === 1, lm2);

  office.forEach(([n, b]) => {
    const r = S.post(Object.assign({}, b, { desk: KEY }));
    ok(n + ' with the desk key works', r.ok === true, r.error || r);
  });

  // the phones never carry it
  const phone = [
    ['ping', { op: 'ping' }],
    ['upload', { op: 'batch', folder: 'MP/TK150/2026-10-25', dev: 'DPHONE1', files: [{ name: 'TK150_25.10.2026_MP.json', file: b64(sidecar('TK150', '2026-10-25', 'MP')) }] }],
    ['rival upload (writes the conflict marker)', { op: 'batch', folder: 'MP/TK150/2026-10-25', dev: 'DPHONE2', files: [{ name: 'TK150_25.10.2026_MP.json', file: b64(sidecar('TK150', '2026-10-25', 'MP', 'DPHONE2')) }] }],
    ['deferral', { op: 'batch', folder: '_meta/deferrals', dev: 'DPHONE1', files: [{ name: 'TK150_MP.defer.json', file: b64({ type: 'cm-round-deferred', u: 'TK150', t: 'MP', why: 'x', by: 'A', at: 'x' }) }] }],
    ['diagnostic trace', { op: 'batch', folder: '_meta/diag', files: [{ name: 'DPHONE1_2026-10-25T00-00-00.json', file: b64({ type: 'cm-sync-trace' }) }] }],
    ['subscribe', { op: 'subscribe', sub: { endpoint: 'https://push.example/x', keys: { p256dh: 'p', auth: 'a' } }, dev: 'DPHONE1' }],
    ['held', { op: 'held', endpoint: 'https://push.example/x' }],
    ['unsubscribe', { op: 'unsubscribe', endpoint: 'https://push.example/x' }],
  ];
  phone.forEach(([n, b]) => {
    const r = S.post(b);
    const good = r.ok === true && !(r.failed || []).length;
    ok('phone op without a desk key: ' + n, good, r.error || r.failed || r);
  });
  ok('the rival upload wrote its conflict marker', W.find('_meta/TK150_25.10.2026_MP.conflict.json').length === 1);
  const reads = [{ action: 'records', after: '0' }, { action: 'list' }, { action: 'index', slim: '1' }, { action: 'file', id: '_meta/lube/master.json' }];
  reads.forEach(p => { const r = S.get(p); ok('read without a desk key: ' + p.action, r.ok === true, r.error); });
});

console.log('\n' + (fails.length ? fails.length + ' FAILED (' + path.basename(SRC) + ')' : 'all GAS_SAFETY_V1 checks passed (' + path.basename(SRC) + ')'));
process.exit(fails.length ? 1 : 0);
