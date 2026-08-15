/* What a request actually costs the Apps Script.

   Wall clock here is meaningless — the fake Drive is a hash map. What is NOT
   meaningless is the number of Drive operations a request makes, because every
   one of them is a round trip inside Apps Script (~50-200 ms) and the script
   has a ~90 min/day execution quota to spend on them. So count them.

   Seeded to look like Baimskaya after a season: rounds per day across a fleet,
   each with a sidecar and a few photographs. */
const fs = require('fs'), path = require('path');
const ROOT = require('path').join(__dirname, '..');
const ROOTID = '1AbCdEfGhIjKlMnOpQrStUvWxYz123456';

let OPS = null;
const tick = k => { if (OPS) OPS[k] = (OPS[k] || 0) + 1; };

function mkDrive() {
  let seq = 0, clock=Date.now();
  const props = {};
  const byId = {}, trashed = [];
  const it = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
  function mkFile(name, body, dir, full) {
    const f = { _id: 'f' + (++seq), _name: name, _body: body, _updated: stamp(), _path: full, _desc: '',
      getId: () => f._id, getName: () => f._name, getSize: () => f._body.length,
      getUrl: () => 'https://drive/' + f._id,
      getDescription: () => f._desc, setDescription: d => { f._desc = d; return f; },
      getLastUpdated: () => new Date(f._updated),
      getBlob: () => { tick('getBlob'); return { getDataAsString: () => f._body, getBytes: () => Buffer.from(f._body),
                    getContentType: () => /\.jpg$/.test(name) ? 'image/jpeg' : 'application/json' }; },
      getParents: () => { tick('getParents'); return it(dir ? [dir] : []); },
      setTrashed: v => { if (v) { trashed.push(full); delete dir._files[name]; } } };
    byId[f._id] = f; return f;
  }
  function mkFolder(name, full, parent) {
    const subs = {}, files = {};
    const dir = { _id: 'd' + (++seq), _name: name, _files: files, _subs: subs,
      getId: () => dir._id, getName: () => dir._name,
      getParents: () => { tick('getParents'); return it(parent ? [parent] : []); },
      getFiles: () => { tick('getFiles'); return it(Object.values(files)); },
      getFolders: () => { tick('getFolders'); return it(Object.values(subs)); },
      getFoldersByName: n => { tick('getFoldersByName'); return it(subs[n] ? [subs[n]] : []); },
      getFilesByName: n => { tick('getFilesByName'); return it(files[n] ? [files[n]] : []); },
      createFolder: n => { tick('createFolder'); return subs[n] = mkFolder(n, (full ? full + '/' : '') + n, dir); },
      createFile: b => { tick('createFile'); return files[b.name] = mkFile(b.name, String(b.bytes), dir, (full ? full + '/' : '') + b.name); } };
    byId[dir._id] = dir; return dir;
  }
  const root = mkFolder('Condition Monitoring', '', null);
  root._id = ROOTID; byId[ROOTID] = root;
  const put = (p, body) => { const parts = p.split('/'), name = parts.pop();
    let d = root; parts.forEach(x => d = d._subs[x] || d.createFolder(x));
    return d._files[name] = mkFile(name, body, d, p); };
  const src = fs.readFileSync(ROOT + '/docs/google-upload.gs', 'utf8')
    .replace(/const SECRET = '[^']*';/, "const SECRET = '';")
    .replace(/const ROOT_FOLDER_ID = '[^']*';/, `const ROOT_FOLDER_ID = ${JSON.stringify(ROOTID)};`);
  const sb = {
    DriveApp: { getFolderById: id => { tick('getFolderById'); return root; },
                getFileById: id => { tick('getFileById'); return byId[id]; } },
    Utilities: { base64Decode: s => Buffer.from(s, 'base64'), base64Encode: b => Buffer.from(b).toString('base64'),
                 newBlob: (bytes, ct, name) => ({ bytes, ct, name }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => s }) },
    Logger: { log: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] === undefined ? null : props[k],
                                                       setProperty: (k, v) => { props[k] = String(v); },
                                                       deleteProperty: k => { delete props[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  };
  const api = new Function(...Object.keys(sb), src + '\n;return {doGet:doGet,doPost:doPost};')(...Object.values(sb));
  return { api, put, root };
}

/* One season of the real thing: 1128 units, an inspection roughly every 6
   weeks, 4 photographs a round. */
const UNITS = 1128, ROUNDS = 900, PHOTOS = 3;
const D = mkDrive();
const sidecar = (u, d, ty) => JSON.stringify({ type: 'cm-inspection-entries', version: 2,
  records: [{ equip: u, date: d, type: ty, by: 'B. Ivanov', cls: 'HT', dev: 'DAAAA',
    items: Array.from({length: 12}, (_, i) => ({ key: 'K' + i, label: 'Position ' + i, grade: 'B',
      defect: 'Ferrous debris — moderate', defectCode: 'DT14-03', cause: 'Gear wear',
      action: 'MON', actionLabel: 'Monitor', comment: 'Fine fuzz plus two flakes.' })) }] });
const TYPES = ['MP', 'FC', 'UC', 'TEMP'];
for (let i = 0; i < ROUNDS; i++) {
  const u = 'TK' + (100 + (i % UNITS)), ty = TYPES[i % TYPES.length];
  const day = 1 + (i % 28), mon = 1 + (i % 6);
  const d = '2026-' + String(mon).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  const dmy = String(day).padStart(2, '0') + '.' + String(mon).padStart(2, '0') + '.2026';
  D.put(`${ty}/2026-${String(mon).padStart(2,'0')}/${u}_${dmy}_${ty}.json`, sidecar(u, d, ty));
  for (let k = 0; k < PHOTOS; k++)
    D.put(`${ty}/2026-${String(mon).padStart(2,'0')}/${u}_P${k}_${dmy}_${ty}.jpg`, 'JPEGDATA');
}

const run = (label, params) => {
  OPS = {};
  const t0 = process.hrtime.bigint();
  const out = JSON.parse(D.api.doGet({ parameter: params }));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const total = Object.values(OPS).reduce((a, b) => a + b, 0);
  console.log(('  ' + label).padEnd(42) + String(total).padStart(7) + ' drive ops   ' +
              (ms.toFixed(0) + ' ms local').padStart(14) + '   ' +
              JSON.stringify(OPS));
  return out;
};

console.log('a folder holding ' + ROUNDS + ' rounds and ' + (ROUNDS * PHOTOS) + ' photographs\n');
const full = run('full read (after=0)', { action: 'records', after: '0', index: '1' });
console.log('     -> ' + (full.records || []).length + ' records, truncated=' + full.truncated +
            ', reply ' + Math.round(JSON.stringify(full).length / 1024) + ' KB\n');

let cur = full.cursor;
if (full.truncated) { const p2 = run('full read, page 2', { action: 'records', after: String(cur), index: '0' });
  console.log('     -> ' + (p2.records || []).length + ' more records, truncated=' + p2.truncated + '\n');
  cur = p2.cursor; }
run('"check for new", nothing changed', { action: 'records', after: String(cur), index: '0' });
run('"check for new", one new round', { action: 'records', after: String(cur - 1), index: '0' });
console.log('');
run('list every json (open one round)', { action: 'list', ext: '.json' });
run('one file by id', { action: 'file', id: 'f3' });

console.log('\n──── the same folder, once it carries an index ────\n');
OPS = {}; let rounds = 0, built = 0, cur2 = 0;
for (;;) {
  const r = JSON.parse(D.api.doGet({ parameter: { action: 'index', rebuild: '1', after: String(cur2) } }));
  rounds++; built += r.done; cur2 = r.cursor;
  if (!r.building) break;
  if (rounds > 40) break;
}
const buildOps = Object.values(OPS).reduce((a, b) => a + b, 0);
console.log(('  building it, once, from what is there').padEnd(42) + String(buildOps).padStart(7) +
            ' drive ops   ' + (rounds + ' calls, ' + built + ' rounds').padStart(22));

const idx = run('full read via the index', { action: 'index' });
console.log('     -> ' + (idx.records || []).length + ' records from ' + idx.readShards + '/' + idx.shards +
            ' shards, reply ' + Math.round(JSON.stringify(idx).length / 1024) + ' KB\n');

const slim = run('the phone\'s list (slim)', { action: 'index', slim: '1' });
console.log('     -> ' + (slim.rows || []).length + ' rows, reply ' +
            Math.round(JSON.stringify(slim).length / 1024) + ' KB\n');

const at = idx.at;
run('"anything new?", nothing changed', { action: 'index', since: String(at) });
run('  and the same question, slim', { action: 'index', since: String(at), slim: '1' });
console.log('');
run('8 photographs in one call', { action: 'files', ids: 'f3,f5,f7,f9,f11,f13,f15,f17' });
