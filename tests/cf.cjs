const REPO = require('path').join(__dirname, '..');
/* Stage 2 / F2 — two phones, one inspection.

   Runs the REAL docs/google-upload.gs against a writable fake Drive and checks
   that the second phone's round is kept rather than overwriting the first, that
   a marker is raised, that a retry does not re-open a decision already made,
   and that deleting the record takes the rival's files with it. */
const fs = require('fs');
const SRC = REPO + '/docs/google-upload.gs';
const ROOTID = '1AbCdEfGhIjKlMnOpQrStUvWxYz123456';

const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };

/* ---- a fake Drive that can be written to, not just read ---- */
function mkDrive() {
  let seq = 0, clock = 1000000;
  const it = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
  const mkFolder = (name, path, parent) => {
    const subs = {}, files = [];
    const dir = {
      _path: path, _files: files, _subs: subs,
      getId: () => 'd:' + path, getName: () => name,
      getParents: () => it(parent ? [parent] : []),
      getFiles: () => it(files.slice()),
      getFolders: () => it(Object.values(subs)),
      getFilesByName: n => it(files.filter(f => f._name === n)),
      getFoldersByName: n => it(subs[n] ? [subs[n]] : []),
      createFolder: n => (subs[n] = mkFolder(n, path ? path + '/' + n : n, dir)),
      createFile: blob => {
        const f = {
          _id: 'f' + (++seq), _name: blob.name, _body: blob.body, _desc: '',
          _updated: (clock += 1000), _dir: dir,
          getId: () => f._id, getName: () => f._name, getSize: () => f._body.length,
          getUrl: () => 'https://drive/' + f._id,
          getLastUpdated: () => new Date(f._updated),
          getDescription: () => f._desc, setDescription: d => { f._desc = d; return f; },
          getBlob: () => ({ getDataAsString: () => f._body, getBytes: () => Buffer.from(f._body) }),
          setTrashed: v => { if (v) { const i = files.indexOf(f); if (i >= 0) files.splice(i, 1);
                                      delete byId[f._id]; } return f; },
        };
        files.push(f); byId[f._id] = f; return f;
      },
    };
    return dir;
  };
  const byId = {};
  const root = mkFolder('Condition Monitoring', '', null);
  return { root, byId, all() {
    const out = [];
    (function walk(d) { d._files.forEach(f => out.push(d._path ? d._path + '/' + f._name : f._name));
                        Object.values(d._subs).forEach(walk); })(root);
    return out.sort();
  } };
}

function load(drive) {
  const src = fs.readFileSync(SRC, 'utf8')
    .replace(/const SECRET = '[^']*';/, "const SECRET = '';")
    .replace(/const ADMIN_SECRET = '[^']*';/, "const ADMIN_SECRET = 'letmein';")
    .replace(/const ROOT_FOLDER_ID = '[^']*';/, `const ROOT_FOLDER_ID = ${JSON.stringify(ROOTID)};`);
  if (!src.includes(JSON.stringify(ROOTID))) throw new Error('could not substitute ROOT_FOLDER_ID');
  if (!src.includes("ADMIN_SECRET = 'letmein'")) throw new Error('could not substitute ADMIN_SECRET');
  const sandbox = {
    DriveApp: { getFolderById: id => { if (id !== ROOTID) throw new Error('no folder'); return drive.root; },
                getFileById: id => drive.byId[id] },
    Utilities: { ...require('./gsdigest.cjs'),
      base64Decode: s => Buffer.from(s, 'base64'),
      base64Encode: b => Buffer.from(b).toString('base64'),
      newBlob: (bytes, ct, name) => ({ body: Buffer.from(bytes).toString('utf8'), ct, name }),
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) },
    Logger: { log: () => {} },
  };
  const fn = new Function(...Object.keys(sandbox),
    src + '\n;return {doPost:doPost, doGet:doGet};');
  return fn(...Object.values(sandbox));
}

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const sidecar = (unit, date, type, dev, by, nItems) => JSON.stringify({
  type: 'cm-inspection-entries', version: 2,
  records: [{ equip: unit, date, type, by, dev,
              items: Array.from({ length: nItems || 1 }, (_, i) => ({ key: 'P' + i, grade: 'C' })) }] });

const post = (api, body) => api.doPost({ postData: { contents: JSON.stringify(body) } });
const upSidecar = (api, unit, date, type, dev, by, n) =>
  post(api, { name: `${unit}_${date.split('-').reverse().join('.')}_${type}.json`,
              folder: `${type}/${date.slice(0, 7)}`, contentType: 'application/json',
              dev, file: b64(sidecar(unit, date, type, dev, by, n)) });
const upPhoto = (api, name, type, month, dev, bytes) =>
  post(api, { name, folder: `${type}/${month}`, contentType: 'image/jpeg', dev, file: b64(bytes) });
const read = api => api.doGet({ parameter: { action: 'records', index: '0' } });

/* ────────────────────────────────────────────────────────────────────── */
console.log('one phone, sending twice');
{
  const d = mkDrive(), api = load(d);
  const a = upSidecar(api, 'TK146', '2026-03-09', 'MP', 'DAAAA', 'Ivan', 3);
  const b = upSidecar(api, 'TK146', '2026-03-09', 'MP', 'DAAAA', 'Ivan', 4);
  ok('first upload takes the plain name', a.name === 'TK146_09.03.2026_MP.json', a.name);
  ok('the same phone overwrites its own', b.name === 'TK146_09.03.2026_MP.json', b.name);
  ok('no conflict raised on a retry', !a.conflict && !b.conflict);
  ok('one sidecar on disk, not two',
    d.all().filter(n => /TK146.*\.json$/.test(n)).length === 1, d.all().join(' '));
  const r = read(api);
  ok('the retry won, 4 positions', (r.records[0].items || []).length === 4);
  ok('no conflicts reported', (r.conflicts || []).length === 0);
}

console.log('\ntwo phones, same unit and day');
let saved;
{
  const d = mkDrive(), api = load(d);
  upSidecar(api, 'TK146', '2026-03-09', 'MP', 'DAAAA', 'Ivan', 3);
  const b = upSidecar(api, 'TK146', '2026-03-09', 'MP', 'DBBBB', 'Olga', 5);
  ok('the second phone does not take the first name', b.name === 'TK146_09.03.2026_MP~DBBBB.json', b.name);
  ok('the reply says nothing was overwritten', b.kept === true);
  ok('the reply names the record', b.conflict === 'TK146|2026-03-09|MP', String(b.conflict));
  ok('the reply lists both devices',
    JSON.stringify((b.devices || []).map(x => x.dev).sort()) === '["DAAAA","DBBBB"]',
    JSON.stringify(b.devices));

  const names = d.all();
  ok('both sidecars survive', names.filter(n => /TK146.*_MP(~\w+)?\.json$/.test(n)).length === 2, names.join(' '));
  ok('a marker was written to _meta',
    names.some(n => n === '_meta/TK146_09.03.2026_MP.conflict.json'), names.join(' '));

  const r = read(api);
  ok('both versions come down the read', r.records.length === 2, String(r.records.length));
  ok('the read reports the conflict', (r.conflicts || []).length === 1);
  const c = r.conflicts[0];
  ok('the marker is keyed like a record', c.key === 'TK146|2026-03-09|MP', c.key);
  ok('the marker starts unresolved', c.resolved === false && c.keep === '');
  ok('the marker names both files',
    JSON.stringify((c.devices || []).map(x => x.file).sort()) ===
    JSON.stringify(['TK146_09.03.2026_MP.json', 'TK146_09.03.2026_MP~DBBBB.json'].sort()),
    JSON.stringify(c.devices));
  ok('the marker is not mistaken for an inspection',
    !r.records.some(x => x && x.type === 'cm-record-conflict'));

  // the first phone re-sends: still its own file, and no second marker
  const again = upSidecar(api, 'TK146', '2026-03-09', 'MP', 'DAAAA', 'Ivan', 3);
  ok('the first phone still owns the plain name', again.name === 'TK146_09.03.2026_MP.json', again.name);
  saved = d;
}

console.log('\nphotos are kept too, not just the record');
{
  const d = mkDrive(), api = load(d);
  upPhoto(api, 'TK146.4C_09.03.2026_MP.jpg', 'MP', '2026-03', 'DAAAA', 'IVAN-PHOTO');
  const b = upPhoto(api, 'TK146.4C_09.03.2026_MP.jpg', 'MP', '2026-03', 'DBBBB', 'OLGA-PHOTO');
  ok('the rival photo gets its own name', b.name === 'TK146.4C_09.03.2026_MP~DBBBB.jpg', b.name);
  const files = d.all().filter(n => /\.jpg$/.test(n));
  ok('both photos survive', files.length === 2, files.join(' '));
  const first = d.root._subs.MP._subs['2026-03']._files.find(f => f._name === 'TK146.4C_09.03.2026_MP.jpg');
  ok("the first phone's bytes are untouched", first && first._body === 'IVAN-PHOTO', first && first._body);
  ok('the uploader is recorded on the file', first._desc === 'cm-dev:DAAAA', first._desc);
  // the same phone replacing its own photo must still overwrite
  upPhoto(api, 'TK146.4C_09.03.2026_MP.jpg', 'MP', '2026-03', 'DAAAA', 'IVAN-AGAIN');
  ok('a retry of the same photo does not pile up',
    d.all().filter(n => /\.jpg$/.test(n)).length === 2, d.all().join(' '));
}

console.log('\nchoosing which version stands');
{
  const d = mkDrive(), api = load(d);
  upSidecar(api, 'TK146', '2026-03-09', 'MP', 'DAAAA', 'Ivan', 3);
  upSidecar(api, 'TK146', '2026-03-09', 'MP', 'DBBBB', 'Olga', 5);

  const bad = post(api, { op: 'resolve', key: 'TK146|2026-03-09|MP', keep: 'DZZZZ', by: 'office' });
  ok('a device that never sent anything is refused', bad.ok === false && /DZZZZ/.test(bad.error), bad.error);
  const none = post(api, { op: 'resolve', key: 'TK999|2026-03-09|MP', keep: 'DAAAA', by: 'office' });
  ok('resolving a record with no clash is refused', none.ok === false, JSON.stringify(none));

  const r1 = post(api, { op: 'resolve', key: 'TK146|2026-03-09|MP', keep: 'DBBBB', by: 'R. Marrero' });
  ok('the choice is accepted', r1.ok === true && r1.keep === 'DBBBB', JSON.stringify(r1));
  let c = read(api).conflicts[0];
  ok('the marker records who chose', c.resolved === true && c.keep === 'DBBBB' && c.by === 'R. Marrero',
    JSON.stringify(c));
  ok('nothing was deleted to resolve it',
    d.all().filter(n => /TK146.*_MP(~\w+)?\.json$/.test(n)).length === 2, d.all().join(' '));

  // a retry from a device already listed must not re-open the decision
  upSidecar(api, 'TK146', '2026-03-09', 'MP', 'DBBBB', 'Olga', 6);
  c = read(api).conflicts[0];
  ok('a re-send by a known device leaves the choice alone', c.resolved === true && c.keep === 'DBBBB',
    JSON.stringify(c));

  // a THIRD phone is a version nobody has looked at — that must re-open it
  upSidecar(api, 'TK146', '2026-03-09', 'MP', 'DCCCC', 'Pyotr', 2);
  c = read(api).conflicts[0];
  ok('a new device re-opens the decision', c.resolved === false, JSON.stringify(c));
  ok('all three devices are listed', (c.devices || []).length === 3, JSON.stringify(c.devices));

  const r2 = post(api, { op: 'resolve', key: 'TK146|2026-03-09|MP', keep: 'DAAAA', by: 'office' });
  ok('the choice can be changed', r2.ok === true && r2.keep === 'DAAAA', JSON.stringify(r2));
}

console.log('\ndeleting a clashing record takes both copies');
{
  const d = mkDrive(), api = load(d);
  upSidecar(api, 'TK146', '2026-03-09', 'MP', 'DAAAA', 'Ivan', 3);
  upSidecar(api, 'TK146', '2026-03-09', 'MP', 'DBBBB', 'Olga', 5);
  upPhoto(api, 'TK146.4C_09.03.2026_MP.jpg', 'MP', '2026-03', 'DAAAA', 'A');
  upPhoto(api, 'TK146.4C_09.03.2026_MP.jpg', 'MP', '2026-03', 'DBBBB', 'B');
  upPhoto(api, 'TK146_09.03.2026_MP_SIGN.png', 'MP', '2026-03', 'DAAAA', 'S');
  // a neighbour that must survive
  upSidecar(api, 'TK1460', '2026-03-09', 'MP', 'DAAAA', 'Ivan', 1);

  const del = post(api, { op: 'delete', key: 'TK146|2026-03-09|MP', admin: 'letmein',
                          by: 'office', reason: 'duplicate round' });
  ok('the delete succeeds', del.ok === true, JSON.stringify(del));
  const left = d.all();
  ok('nothing of TK146 is left',
    !left.some(n => /(^|\/)TK146[._~]/.test(n.replace(/^_meta\/deletions\//, 'LOG/'))), left.join(' '));
  ok('the rival copy went with it', del.files.some(f => /~DBBBB/.test(f)), JSON.stringify(del.files));
  ok('the conflict marker went with it', del.files.some(f => /\.conflict\.json$/.test(f)), JSON.stringify(del.files));
  ok('the neighbour survives', left.some(n => /TK1460_09\.03\.2026_MP\.json$/.test(n)), left.join(' '));
}

console.log('\nan app that has not been updated yet');
{
  const d = mkDrive(), api = load(d);
  // no dev in the body at all — the old behaviour must be exactly as it was
  const a = post(api, { name: 'TK146_09.03.2026_MP.json', folder: 'MP/2026-03',
                        contentType: 'application/json',
                        file: b64(sidecar('TK146', '2026-03-09', 'MP', 'DAAAA', 'Ivan', 3)) });
  const b = post(api, { name: 'TK146_09.03.2026_MP.json', folder: 'MP/2026-03',
                        contentType: 'application/json',
                        file: b64(sidecar('TK146', '2026-03-09', 'MP', 'DBBBB', 'Olga', 5)) });
  ok('an untagged upload keeps the plain name', a.name === b.name && b.name === 'TK146_09.03.2026_MP.json');
  ok('and overwrites, as it always did',
    d.all().filter(n => /TK146.*\.json$/.test(n)).length === 1, d.all().join(' '));

  // a NEW app arriving after an OLD one: the sidecar still says who wrote it
  const c = upSidecar(api, 'TK146', '2026-03-09', 'MP', 'DCCCC', 'Pyotr', 2);
  ok('a tagged upload still spots an untagged rival',
    c.name === 'TK146_09.03.2026_MP~DCCCC.json' && c.conflict === 'TK146|2026-03-09|MP',
    JSON.stringify({ n: c.name, c: c.conflict }));
}

console.log('\nnames that must not be treated as inspections');
{
  const d = mkDrive(), api = load(d);
  upSidecar(api, 'TK146', '2026-03-09', 'MP', 'DAAAA', 'Ivan', 1);
  post(api, { op: 'edit', key: 'TK146|2026-03-09|MP', by: 'office', note: 'checked', items: {} });
  upSidecar(api, 'TK146', '2026-03-09', 'MP', 'DBBBB', 'Olga', 2);
  const r = read(api);
  ok('the correction is still a correction', r.edits.length === 1 && r.edits[0].note === 'checked',
    JSON.stringify(r.edits));
  ok('the conflict is a conflict', r.conflicts.length === 1);
  ok('and only the two rounds are records', r.records.length === 2, String(r.records.length));
  // an edit marker must never itself be treated as a clashing sidecar
  post(api, { op: 'edit', key: 'TK146|2026-03-09|MP', by: 'office', note: 'again', items: {} });
  ok('re-editing does not raise a conflict', read(api).conflicts.length === 1);
}

console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
process.exit(fails.length ? 1 : 0);
