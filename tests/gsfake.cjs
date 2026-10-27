/* The in-memory Drive tests/gsindex.cjs proves the Apps Script against, as a
   module: two files of one name, creation times, isTrashed, and hooks that make
   a create or a read fail the way a passing Drive error does. Used by
   tests/gsscan.cjs; gsindex.cjs keeps its own copy. */
const ROOT = '1AbCdEfGhIjKlMnOpQrStUvWxYz123456';
function mkWorld() {
  const W = { seq: 0, now: Date.parse('2026-10-27T00:00:00Z'), props: {}, busy: false, byId: {},
              failCreate: null, failRead: null, beforeCreate: null, afterCreate: null };
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
      getBlob: () => { if (W.failRead && W.failRead.test(f._name)) throw new Error('Drive: service error (rigged read)');
        return ({ getBytes: () => f._buf, getDataAsString: () => f._buf.toString('utf8'),
                        getContentType: () => /\.json$/i.test(f._name) ? 'application/json' : 'image/jpeg' }); },
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
function load(W, src, admin) {
  src = src.replace(/const SECRET = '[^']*';/, "const SECRET = '';")
           .replace(/const ADMIN_SECRET = '[^']*';/, 'const ADMIN_SECRET = ' + JSON.stringify(admin || '') + ';')
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
module.exports = { mkWorld, load, ROOT };
