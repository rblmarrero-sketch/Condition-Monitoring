const REPO = require('path').join(__dirname, '..');
/* The Apps Script edit / void / delete path against a fake Drive. */
const fs = require('fs');
const SRC = REPO + '/docs/google-upload.gs';
const ROOTID = '1AbCdEfGhIjKlMnOpQrStUvWxYz123456';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };

function drive() {
  let seq = 0;
  const byId = {}, trashed = [];
  const it = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
  function mkFile(name, body, updated, dir, full) {
    const f = { _id: 'f' + (++seq), _name: name, _body: body, _updated: updated, _dir: dir, _path: full,
      _trashed: false,
      getId: () => f._id, getName: () => f._name, getSize: () => f._body.length,
      getLastUpdated: () => new Date(f._updated),
      getBlob: () => ({ getDataAsString: () => f._body, getBytes: () => Buffer.from(f._body),
                        getContentType: () => 'application/json' }),
      getParents: () => it(dir ? [dir] : []),
      setTrashed: v => { f._trashed = !!v; if (v) { trashed.push(f._path); delete dir._files[name]; } } };
    byId[f._id] = f; return f;
  }
  function mkFolder(name, full, parent) {
    const subs = {}, files = {};
    const dir = { _id: 'd' + (++seq), _name: name, _files: files, _subs: subs,
      getId: () => dir._id, getName: () => dir._name,
      getParents: () => it(parent ? [parent] : []),
      getFiles: () => it(Object.values(files)),
      getFolders: () => it(Object.values(subs)),
      getFoldersByName: n => it(subs[n] ? [subs[n]] : []),
      getFilesByName: n => it(files[n] ? [files[n]] : []),
      createFolder: n => subs[n] = mkFolder(n, (full ? full + '/' : '') + n, dir),
      createFile: blob => files[blob.name] =
        mkFile(blob.name, String(blob.bytes), ++clock, dir, (full ? full + '/' : '') + blob.name) };
    byId[dir._id] = dir; return dir;
  }
  let clock = 1000;
  const root = mkFolder('Condition Monitoring', '', null);
  root._id = ROOTID; byId[ROOTID] = root;
  const put = (pathStr, body) => {
    const parts = pathStr.split('/'), name = parts.pop();
    let d = root; parts.forEach(x => d = d._subs[x] || d.createFolder(x));
    return mkFile(name, body, ++clock, d, pathStr), d._files[name] = mkFile(name, body, clock, d, pathStr);
  };
  const src = fs.readFileSync(SRC, 'utf8')
    .replace(/const SECRET = '[^']*';/, "const SECRET = '';")
    .replace(/const ROOT_FOLDER_ID = '[^']*';/, `const ROOT_FOLDER_ID = ${JSON.stringify(ROOTID)};`)
    .replace(/const ADMIN_SECRET = '';/, `const ADMIN_SECRET = 'letmein';`);
  const sandbox = {
    DriveApp: { getFolderById: id => { if (id !== ROOTID) throw new Error('no folder'); return root; },
                getFileById: id => byId[id] },
    Utilities: { ...require('./gsdigest.cjs'), base64Decode: s => Buffer.from(s, 'base64'), base64Encode: b => Buffer.from(b).toString('base64'),
                 newBlob: (bytes, ct, name) => ({ bytes, ct, name }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) },
    Logger: { log: () => {} },
  };
  const api = new Function(...Object.keys(sandbox), src + '\n;return {doGet:doGet, doPost:doPost};')(...Object.values(sandbox));
  const post = o => api.doPost({ postData: { contents: JSON.stringify(o) } });
  const get = q => api.doGet({ parameter: q });
  const listAll = () => { const out = []; (function walk(d, pre) {
      Object.values(d._files).forEach(f => out.push(pre + f._name));
      Object.values(d._subs).forEach(s => walk(s, pre + s._name + '/')); })(root, ''); return out; };
  return { post, get, put, trashed, listAll, root };
}

const sidecar = (u, d, ty, grade) => JSON.stringify({ type: 'cm-inspection-entries', version: 2,
  records: [{ equip: u, date: d, type: ty, by: 'B. Ivanov',
              items: [{ key: '4C', grade, defect: 'Ferrous debris — heavy', action: 'MON' }] }] });

/* ---------------------------------------------------------------- */
console.log('a correction is its own file');
let D = drive();
D.put('MP/2026-03/TK146_09.03.2026_MP.json', sidecar('TK146', '2026-03-09', 'MP', 'C'));
D.put('MP/2026-03/TK146_4C_09.03.2026_MP.jpg', 'JPEG');

let r = D.post({ op: 'edit', key: 'TK146|2026-03-09|MP', by: 'R. Marrero',
  note: 'plug re-read under magnification',
  items: { '4C': { sev: 'CRI', action: 'REP', actionLabel: 'Repair', wo: 'N-771' } } });
ok('the edit is accepted', r.ok === true, r.error || r.saved);
ok('it is stored beside the data, not inside it',
   D.listAll().includes('_meta/TK146_09.03.2026_MP.edit.json'), D.listAll().join(' | '));
ok('the original sidecar is untouched',
   D.listAll().includes('MP/2026-03/TK146_09.03.2026_MP.json'));

console.log('\nthe read returns records and corrections together');
r = D.get({ action: 'records' });
ok('one record', r.records.length === 1, String(r.records.length));
ok('one correction', r.edits.length === 1, String(r.edits.length));
ok('the correction carries the key, author and change',
   r.edits[0].key === 'TK146|2026-03-09|MP' && r.edits[0].by === 'R. Marrero'
   && r.edits[0].items['4C'].sev === 'CRI' && r.edits[0].items['4C'].wo === 'N-771',
   JSON.stringify(r.edits[0].items));
ok('the correction is NOT mistaken for an inspection',
   r.records.every(x => x.equip === 'TK146' && x.items), String(r.records.length));

console.log('\na phone re-syncing cannot wipe the correction');
D.put('MP/2026-03/TK146_09.03.2026_MP.json', sidecar('TK146', '2026-03-09', 'MP', 'X'));  // phone edits + re-uploads
r = D.get({ action: 'records' });
ok('the record is the phone\'s newer one', r.records[0].items[0].grade === 5, r.records[0].items[0].grade);
ok('and the correction is still there', r.edits.length === 1 && r.edits[0].items['4C'].wo === 'N-771');

console.log('\nediting again replaces, it does not pile up');
D.post({ op: 'edit', key: 'TK146|2026-03-09|MP', by: 'R. Marrero', items: { '4C': { sev: 'DEG' } } });
r = D.get({ action: 'records' });
ok('still exactly one correction file', r.edits.length === 1, String(r.edits.length));
ok('and it is the newer one', r.edits[0].items['4C'].sev === 'DEG', r.edits[0].items['4C'].sev);

console.log('\nvoid');
D.post({ op: 'edit', key: 'TK146|2026-03-09|MP', by: 'R. Marrero', void: true, reason: 'duplicate of the 10th' });
r = D.get({ action: 'records' });
ok('the record still exists — nothing destroyed', r.records.length === 1);
ok('and is marked void with a reason',
   r.edits[0].void === true && /duplicate/.test(r.edits[0].reason), JSON.stringify(r.edits[0].reason));

console.log('\na bad key is refused');
['', 'nonsense', 'TK146|2026-03-09', 'TK146||MP'].forEach(k => {
  const res = D.post({ op: 'edit', key: k });
  ok(`"${k}" rejected`, res.ok === false && /Bad record key/.test(res.error), res.error || 'accepted!');
});

/* ---------------------------------------------------------------- */
console.log('\ndeletion is off unless a password is set');
{
  const clean = drive();
  clean.put('MP/2026-03/TK146_09.03.2026_MP.json', sidecar('TK146', '2026-03-09', 'MP', 'C'));
  // rebuild with ADMIN_SECRET left empty
  const src = fs.readFileSync(SRC, 'utf8').replace(/const ROOT_FOLDER_ID = '[^']*';/,
    `const ROOT_FOLDER_ID = ${JSON.stringify(ROOTID)};`);
  ok('the shipped default really is empty', /const ADMIN_SECRET = '';/.test(src));
}
{
  const off = (() => {                                    // same fake Drive, secret NOT patched
    const d = drive();
    return d;
  })();
  // the helper always patches it in, so assert on the file instead (above) and
  // here check the wrong-password path
  let res = off.post({ op: 'delete', key: 'TK146|2026-03-09|MP', admin: 'guess' });
  ok('a wrong password is refused', res.ok === false && /Wrong admin password/.test(res.error), res.error);
}

console.log('\ndeleting with the password');
D = drive();
D.put('MP/2026-03/TK146_09.03.2026_MP.json', sidecar('TK146', '2026-03-09', 'MP', 'C'));
D.put('MP/2026-03/TK146_4C_09.03.2026_MP.jpg', 'JPEG');
D.put('MP/2026-03/TK146_4C_09.03.2026_MP_2.jpg', 'JPEG');
D.put('MP/2026-03/TK146_09.03.2026_MP_SIGN.png', 'PNG');
D.put('INSP/2026-03/TK146.4C_09.03.2026_INSP.jpg', 'JPEG');       // a DIFFERENT inspection
D.put('MP/2026-03/TK147_09.03.2026_MP.json', sidecar('TK147', '2026-03-09', 'MP', 'A'));
D.put('MPX/2026-03/TK146_09.03.2026_MPX.json', sidecar('TK146', '2026-03-09', 'MPX', 'A')); // type prefix clash
D.put('MP/2026-03/TK146A_09.03.2026_MP.json', sidecar('TK146A', '2026-03-09', 'MP', 'A'));  // unit prefix clash
D.post({ op: 'edit', key: 'TK146|2026-03-09|MP', by: 'R', items: {} });

r = D.post({ op: 'delete', key: 'TK146|2026-03-09|MP', admin: 'letmein',
             by: 'R. Marrero', reason: 'test data' });
ok('it reports what it removed', r.ok === true && r.deleted === 5,
   `${r.deleted} — ` + JSON.stringify(r.files || r.error));
ok('nothing is purged — Drive keeps it in the trash', r.trashed === true);

const left = D.listAll();
ok('the sidecar is gone', !left.some(f => /TK146_09\.03\.2026_MP\.json$/.test(f)), left.join(' | '));
ok('its photos and signature went too',
   !left.some(f => /TK146_4C_09\.03\.2026_MP/.test(f)) && !left.some(f => /TK146_09\.03\.2026_MP_SIGN/.test(f)));
ok('its correction marker went too', !left.some(f => /TK146_09\.03\.2026_MP\.edit\.json$/.test(f)));
ok('a different unit is untouched', left.some(f => /TK147_09\.03\.2026_MP\.json$/.test(f)));
ok('a different inspection type on the same unit and day is untouched',
   left.some(f => /TK146\.4C_09\.03\.2026_INSP\.jpg$/.test(f)), left.join(' | '));
ok('a type whose name merely starts the same is untouched',
   left.some(f => /TK146_09\.03\.2026_MPX\.json$/.test(f)));
ok('a unit whose name merely starts the same is untouched',
   left.some(f => /TK146A_09\.03\.2026_MP\.json$/.test(f)));

console.log('\nthe deletion is logged');
const log = left.filter(f => /^_meta\/deletions\/.*\.deleted\.json$/.test(f));
ok('one log entry was written', log.length === 1, log.join(' | '));
const body = JSON.parse(D.root._subs._meta._subs.deletions._files[log[0].split('/').pop()]._body);
ok('it records who, why and what', body.by === 'R. Marrero' && body.reason === 'test data'
   && body.files.length === 5, JSON.stringify({ by: body.by, reason: body.reason, n: body.files.length }));

console.log('\nthe log is not mistaken for an inspection');
r = D.get({ action: 'records' });
// the two decoys above survive on purpose; what matters is the deleted one is gone
ok('the deleted inspection is no longer returned',
   !r.records.some(x => x.equip === 'TK146' && x.type === 'MP'),
   r.records.map(x => x.equip + '/' + x.type).join(', '));
ok('the log file is not returned as an inspection',
   r.records.every(x => x.equip && x.items), String(r.records.length));
ok('and no phantom corrections', r.edits.length === 0, String(r.edits.length));

console.log('\ndeleting something that is not there');
r = D.post({ op: 'delete', key: 'TK999|2026-03-09|MP', admin: 'letmein', by: 'R' });
ok('says so rather than pretending', r.ok === false && /Nothing found/.test(r.error), r.error);

console.log(fails.length ? '\nFAILURES:\n  ' + [...new Set(fails)].join('\n  ') : '\nall edit/void/delete checks passed');
process.exit(fails.length ? 1 : 0);
