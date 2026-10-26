/* GAS_INDEX_SAFETY_V1 — the Apps Script index and upload fixes, proved against
   the REAL docs/google-upload.gs over an in-memory Drive (audit 26.10, C1, C2,
   C6, C10 and N2; checked 27.10).

   What has to hold:
     1. a busy lock never lets the index be written without it: the upload says
        "busy" and the phone sends it again; the retry indexes it;
     2. a month index that cannot be read is not an empty month: nothing is
        written over it and the upload says why;
     3. the new file is written before the old one is trashed — a create that
        fails leaves the old shard and the old record standing;
     4. two phones writing one name at the same moment: the later file moves to
        its own ~DEV name with a conflict marker, and neither is trashed;
     5. the ping and the health check say which version is running;
     6. two files of one month (a write caught between create and trash) are
        read once, the newest.

   Run:  node tests/gsindex.cjs                    (the script in the repo)
         GS_SRC=/path/old.gs node tests/gsindex.cjs   (any other version) */
const fs = require('fs');
const path = require('path');
const SRC = process.env.GS_SRC || path.join(__dirname, '..', 'docs', 'google-upload.gs');
const ROOT = '1AbCdEfGhIjKlMnOpQrStUvWxYz123456';
const fails = [];
const ok = (n, c, d) => {
  console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 220) : ''));
  if (!c) fails.push(n);
};
const b64 = s => Buffer.from(typeof s === 'string' ? s : JSON.stringify(s)).toString('base64');

/* The same in-memory Drive as tests/gassafety.cjs, plus what these checks
   need: creation times, rename, isTrashed, and hooks around createFile. */
function mkWorld() {
  const W = { seq: 0, now: Date.parse('2026-10-27T00:00:00Z'), props: {}, busy: false, byId: {},
              failCreate: null, beforeCreate: null, afterCreate: null };
  const it = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
  const stamp = () => (W.now += 1);
  function mkFile(name, buf, dir) {
    const f = { _id: 'f' + String(++W.seq).padStart(6, '0'), _name: name, _buf: buf, _upd: stamp(), _born: W.now,
      _dir: dir, _desc: '', _trash: false,
      getId: () => f._id, getName: () => f._name, getSize: () => f._buf.length, getUrl: () => 'https://drive/' + f._id,
      getLastUpdated: () => new Date(f._upd), getDateCreated: () => new Date(f._born),
      getDescription: () => f._desc, setDescription: d => { f._desc = d; return f; },
      setName: n => { f._name = n; return f; }, isTrashed: () => f._trash,
      getParents: () => it([f._dir]),
      getBlob: () => ({ getBytes: () => f._buf, getDataAsString: () => f._buf.toString('utf8'),
                        getContentType: () => /\.json$/i.test(f._name) ? 'application/json' : 'image/jpeg' }),
      setContent: s => { f._buf = Buffer.from(String(s)); f._upd = stamp(); return f; },
      setTrashed: v => { if (v) f._trash = true; },
      path: () => (f._dir.path() ? f._dir.path() + '/' : '') + f._name };
    W.byId[f._id] = f; return f;
  }
  function mkDir(name, parent) {
    const d = { _id: 'd' + (++W.seq), _name: name, _parent: parent, _subs: [], _files: [], _born: stamp(), _trash: false,
      getId: () => d._id, getName: () => d._name, getDateCreated: () => new Date(d._born),
      getParents: () => it(d._parent ? [d._parent] : []),
      getFiles: () => it(d._files.filter(f => !f._trash)),
      getFolders: () => it(d._subs.filter(x => !x._trash)),
      getFoldersByName: n => it(d._subs.filter(x => !x._trash && x._name === n)),
      getFilesByName: n => it(d._files.filter(f => !f._trash && f._name === n)),
      createFolder: n => { const c = mkDir(n, d); d._subs.push(c); return c; },
      createFile: (a, b2) => {
        const blob = typeof a === 'string' ? { name: a, bytes: Buffer.from(String(b2)) } : a;
        if (W.beforeCreate) W.beforeCreate(d, blob.name);
        if (W.failCreate && W.failCreate.test(blob.name)) throw new Error('Drive: service error (rigged)');
        const buf = Buffer.isBuffer(blob.bytes) ? blob.bytes : Buffer.from(blob.bytes || '');
        const f = mkFile(blob.name, buf, d); d._files.push(f);
        if (W.afterCreate) W.afterCreate(d, blob.name, f);
        return f; },
      setTrashed: v => { d._trash = !!v; },
      path: () => d._parent ? ((d._parent.path() ? d._parent.path() + '/' : '') + d._name) : '' };
    W.byId[d._id] = d; return d;
  }
  W.root = mkDir('CM_backup_Pechanka', null); W.root._id = ROOT; W.byId[ROOT] = W.root;
  W.dir = p => { let d = W.root; p.split('/').filter(String).forEach(x => { d = d._subs.find(s => s._name === x && !s._trash) || d.createFolder(x); }); return d; };
  W.put = (p, body, desc) => {
    const parts = p.split('/'), name = parts.pop(), d = W.dir(parts.join('/'));
    const f = mkFile(name, Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)), d);
    if (desc) f._desc = desc;
    d._files.push(f); return f;
  };
  W.live = p => Object.values(W.byId).filter(x => x._buf && !x._trash && x.path() === p);
  W.livePrefix = p => Object.values(W.byId).filter(x => x._buf && !x._trash && x.path().indexOf(p) === 0);
  return W;
}
function load(W, src) {
  src = src.replace(/const SECRET = '[^']*';/, "const SECRET = '';")
           .replace(/const ROOT_FOLDER_ID = '[^']*';/, 'const ROOT_FOLDER_ID = ' + JSON.stringify(ROOT) + ';');
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
  return { post: b => api.doPost({ postData: { contents: JSON.stringify(b) } }), get: p => api.doGet({ parameter: p }) };
}
const SOURCE = fs.readFileSync(SRC, 'utf8');
const world = () => { const W = mkWorld(); return { W, S: load(W, SOURCE) }; };
const sidecar = (u, d, ty, dev, extra) => ({ type: 'cm-inspection-entries', version: 2,
  records: [Object.assign({ equip: u, date: d, type: ty, by: 'B. Ivanov', dev, items: [{ key: '4C', grade: 2 }] }, extra || {})] });
const SC = 'TK146_26.10.2026_MP.json', FOLDER = 'MP/TK146/2026-10-26', SHARD = '_meta/index/2026-10.json';
const upload = (S, dev, body, name) => S.post({ name: name || SC, folder: FOLDER, contentType: 'application/json', dev, file: b64(body || sidecar('TK146', '2026-10-26', 'MP', dev)) });
const shardRecs = W => { const f = W.live(SHARD); return f.length ? JSON.parse(f[f.length - 1]._buf.toString()).records : null; };
function section(name, fn) {
  console.log('\n' + name);
  try { fn(); } catch (e) { ok(name + ' ran to the end', false, String(e && e.stack || e).split('\n').slice(0, 2).join(' | ')); }
}

section('1. A BUSY LOCK NEVER LETS THE INDEX BE WRITTEN WITHOUT IT', () => {
  const { W, S } = world();
  W.put(SHARD, { type: 'cm-index-shard', version: 1, records: [{ equip: 'TK001', date: '2026-10-02', type: 'MP', dev: 'DOTHER' }] });
  W.busy = true;
  const r = upload(S, 'DPHONE1');
  ok('the upload is reported busy, not saved', r.ok === false && r.busy === true, r);
  ok('the record file is on Drive all the same', W.live(FOLDER + '/' + SC).length === 1);
  ok('the month index was not touched', JSON.stringify(shardRecs(W).map(x => x.equip)) === '["TK001"]', shardRecs(W));
  W.busy = false;
  const r2 = upload(S, 'DPHONE1');
  ok('the phone sends it again and it is saved', r2.ok === true, r2);
  ok('and now the index holds both rounds', JSON.stringify(shardRecs(W).map(x => x.equip).sort()) === '["TK001","TK146"]', shardRecs(W));
  ok('one live copy of the record file, not two', W.live(FOLDER + '/' + SC).length === 1, W.live(FOLDER + '/' + SC).length);
});

section('2. A MONTH THAT CANNOT BE READ IS NOT AN EMPTY MONTH', () => {
  const { W, S } = world();
  W.put(SHARD, '{"type":"cm-index-shard","records":[{"equip":"TK0');      // cut short
  const r = upload(S, 'DPHONE1');
  ok('the upload says the index was not updated', r.ok === false && /index/i.test(r.error || ''), r);
  const left = W.live(SHARD);
  ok('the unreadable month is left as it was, not replaced by one round', left.length === 1 && /TK0$/.test(left[0]._buf.toString()), left.map(f => f._buf.toString().slice(-12)));
  ok('the record file is on Drive', W.live(FOLDER + '/' + SC).length === 1);
});

section('3. THE NEW FILE IS WRITTEN BEFORE THE OLD ONE IS TRASHED', () => {
  const { W, S } = world();
  W.put(SHARD, { type: 'cm-index-shard', version: 1, records: [{ equip: 'TK001', date: '2026-10-02', type: 'MP', dev: 'X' }, { equip: 'TK002', date: '2026-10-03', type: 'MP', dev: 'X' }] });
  W.failCreate = /^2026-10\.json$/;
  const r = upload(S, 'DPHONE1');
  ok('a shard write that fails fails the upload', r.ok === false, r);
  ok('and the month index is still there with both its rounds', (shardRecs(W) || []).length === 2, shardRecs(W));
  W.failCreate = null;

  const { W: W2, S: S2 } = world();
  const old = W2.put(FOLDER + '/' + SC, sidecar('TK146', '2026-10-26', 'MP', 'DPHONE1', { by: 'first' }), 'cm-dev:DPHONE1');
  W2.failCreate = /^TK146_26\.10\.2026_MP\.json$/;
  let r2; try { r2 = upload(S2, 'DPHONE1', sidecar('TK146', '2026-10-26', 'MP', 'DPHONE1', { by: 'second' })); } catch (e) { r2 = { ok: false, error: String(e) }; }
  ok('a re-send whose create fails is not saved', r2.ok === false, r2);
  ok('and the record already on Drive is still there', !old._trash && W2.live(FOLDER + '/' + SC).length === 1);
});

section('4. TWO PHONES WRITING ONE NAME AT THE SAME MOMENT', () => {
  // Another phone's file appears after this request looked (placeUpload_) and
  // before its own file is created: the other is EARLIER, so this one yields.
  {
    const { W, S } = world();
    let theirs = null;
    W.beforeCreate = (d, name) => {
      if (name === SC && !theirs) { W.beforeCreate = null;
        theirs = W.put(FOLDER + '/' + SC, sidecar('TK146', '2026-10-26', 'MP', 'DOTHER'), 'cm-dev:DOTHER'); }
    };
    const r = upload(S, 'DPHONE1');
    ok('the upload is saved', r.ok === true, r);
    ok('the other phone\'s file is not trashed', theirs && !theirs._trash);
    ok('ours moved to its own ~DPHONE1 name', W.live(FOLDER + '/TK146_26.10.2026_MP~DPHONE1.json').length === 1 && r.name === 'TK146_26.10.2026_MP~DPHONE1.json', r.name);
    ok('the primary name holds only the other phone\'s file', W.live(FOLDER + '/' + SC).length === 1 && W.live(FOLDER + '/' + SC)[0] === theirs);
    const marker = W.livePrefix('_meta/').filter(f => /\.conflict\.json$/.test(f._name));
    ok('and a conflict marker names both phones', marker.length === 1 && /DPHONE1/.test(marker[0]._buf) && /DOTHER/.test(marker[0]._buf), marker.map(f => f._name));
    ok('the reply says so', r.kept === true && !!r.conflict, r);
  }
  // The other phone's file lands just AFTER ours: it is the later one and its
  // own request yields; this one keeps the name and trashes nothing of theirs.
  {
    const { W, S } = world();
    let theirs = null;
    W.afterCreate = (d, name) => {
      if (name === SC && !theirs) { W.afterCreate = null;
        theirs = W.put(FOLDER + '/' + SC, sidecar('TK146', '2026-10-26', 'MP', 'DOTHER'), 'cm-dev:DOTHER'); }
    };
    const r = upload(S, 'DPHONE1');
    ok('the earlier file keeps the name', r.ok === true && r.name === SC, r.name);
    ok('the later one is not trashed by it', theirs && !theirs._trash);
  }
  // Our own older copy is still replaced, as before.
  {
    const { W, S } = world();
    const mine = W.put(FOLDER + '/' + SC, sidecar('TK146', '2026-10-26', 'MP', 'DPHONE1', { by: 'old' }), 'cm-dev:DPHONE1');
    const r = upload(S, 'DPHONE1', sidecar('TK146', '2026-10-26', 'MP', 'DPHONE1', { by: 'new' }));
    ok('a re-send replaces our own copy', r.ok === true && mine._trash && W.live(FOLDER + '/' + SC).length === 1, r);
  }
});

section('5. WHICH VERSION IS RUNNING', () => {
  const { S } = world();
  const p = S.post({ op: 'ping' }), h = S.get({});
  ok('the ping carries a version', typeof p.version === 'string' && p.version.length > 3, p);
  ok('and so does the health check, the same one', h.ok && h.version === p.version, h);
});

section('6. TWO FILES OF ONE MONTH ARE READ ONCE, THE NEWEST', () => {
  const { W, S } = world();
  W.props.cm_built = '1';
  W.put(SHARD, { type: 'cm-index-shard', version: 1, records: [{ equip: 'TKOLD', date: '2026-10-01', type: 'MP', dev: 'X' }] });
  W.put(SHARD, { type: 'cm-index-shard', version: 1, records: [{ equip: 'TKOLD', date: '2026-10-01', type: 'MP', dev: 'X' }, { equip: 'TKNEW', date: '2026-10-05', type: 'MP', dev: 'X' }] });
  const r = S.get({ action: 'index', slim: '1' });
  const us = (r.rows || []).map(x => x.u).sort();
  ok('each round once, from the newer file', r.ok && JSON.stringify(us) === '["TKNEW","TKOLD"]', us);
});

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
