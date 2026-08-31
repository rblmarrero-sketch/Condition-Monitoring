const REPO = require('path').join(__dirname, '..');
/* Exercise the Apps Script read path in node with a fake Drive.
   The real thing can only be debugged by deploying, so the logic that decides
   what to read — the incremental filter, the cursor, the caps — is checked here. */
const fs = require('fs');
const SRC = REPO + '/docs/google-upload.gs';

const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };

/* ---- a fake Drive: folders of files, each with a name/body/mtime ---- */
function mkDrive(tree, rootId) {
  const byId = {};
  let seq = 0;
  const mkFile = (name, body, updated, parent) => {
    const f = { _id: 'f' + (++seq), _name: name, _body: body, _updated: updated, _parent: parent,
      getId: () => f._id, getName: () => f._name, getSize: () => f._body.length,
      getLastUpdated: () => new Date(f._updated),
      getBlob: () => ({ getDataAsString: () => { drive.reads++; return f._body; },
                        getBytes: () => Buffer.from(f._body), getContentType: () => 'application/json' }),
      getParents: () => iter(f._parent ? [f._parent] : []) };
    byId[f._id] = f; return f;
  };
  const iter = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const mkFolder = (name, node, parent) => {
    const dir = { _id: 'd' + (++seq), _name: name, getId: () => dir._id, getName: () => dir._name,
      getParents: () => iter(parent ? [parent] : []) };
    const files = Object.entries(node.files || {}).map(([n, v]) => mkFile(n, v.body, v.updated, dir));
    const subs = Object.entries(node.dirs || {}).map(([n, v]) => mkFolder(n, v, dir));
    dir.getFiles = () => { drive.walks++; return iter(files); };
    dir.getFolders = () => iter(subs);
    byId[dir._id] = dir; return dir;
  };
  const root = mkFolder('Condition Monitoring', tree, null);
  // real Drive: getFolderById(id).getId() === id — underRoot_ relies on it
  if (rootId) { delete byId[root._id]; root._id = rootId; byId[rootId] = root; }
  const drive = { reads: 0, walks: 0, root, byId };
  return drive;
}
const ROOT = '1AbCdEfGhIjKlMnOpQrStUvWxYz123456';

function load(drive, rootId) {
  // Substitute whatever the literal currently is — it is a real folder id in the
  // repo now, not the placeholder this used to match.
  let src = fs.readFileSync(SRC, 'utf8')
    .replace(/const SECRET = '[^']*';/, "const SECRET = '';")
    .replace(/const ROOT_FOLDER_ID = '[^']*';/, "const ROOT_FOLDER_ID = " + JSON.stringify(rootId) + ";");
  if (!src.includes(JSON.stringify(rootId))) throw new Error('could not substitute ROOT_FOLDER_ID');
  const sandbox = {
    DriveApp: { getFolderById: id => { if (id !== rootId) throw new Error('no such folder'); return drive.root; },
                getFileById: id => drive.byId[id] },
    Utilities: { ...require('./gsdigest.cjs'), base64Encode: b => Buffer.from(b).toString('base64') },
    ContentService: { MimeType: { JSON: 'json' },
      createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) },
    Logger: { log: () => {} },
  };
  const fn = new Function(...Object.keys(sandbox), src + '\n;return {doGet:doGet, readRecords_:readRecords_};');
  return fn(...Object.values(sandbox));
}

/* ---- a folder that looks like a real month of rounds ---- */
const sidecar = (unit, date, type) => JSON.stringify({
  type: 'cm-inspection-entries', version: 2,
  records: [{ equip: unit, date, type, by: 'R. Marrero', items: [{ key: '4C', grade: 'C' }] }] });

/* Built fresh per scenario — a shared, mutated tree makes later counts lie. */
function mkTree(extra) {
  const tree = { dirs: {
    MP: { dirs: { '2026-07': { files: {} } } },
    FC: { dirs: { '2026-07': { files: {} } } },
  } };
  const mp = tree.dirs.MP.dirs['2026-07'].files, fc = tree.dirs.FC.dirs['2026-07'].files;
  for (let i = 1; i <= 40; i++) {
    const u = 'TK' + (100 + i), t = 1000000 + i * 1000;
    mp[`${u}_0${(i % 9) + 1}.07.2026_MP.json`] = { body: sidecar(u, '2026-07-0' + ((i % 9) + 1), 'MP'), updated: t };
    mp[`${u}_0${(i % 9) + 1}.07.2026_MP.jpg`] = { body: 'JPEGBYTES', updated: t };
  }
  for (let i = 1; i <= 5; i++) {
    const u = 'EX0' + i, t = 2000000 + i * 1000;
    fc[`${u}_10.07.2026_FC.json`] = { body: sidecar(u, '2026-07-10', 'FC'), updated: t };
  }
  mp['broken.json'] = { body: '{ this is not json', updated: 3000000 };
  if (extra) mp['TK999_31.07.2026_MP.json'] = { body: sidecar('TK999', '2026-07-31', 'MP'), updated: 9000000 };
  return tree;
}
// 45 good sidecars + 1 unparseable = 46 .json files, 40 photos, 86 files total
const SIDECARS = 46, GOOD = 45, PHOTOS = 40, FILES = 86;

console.log('one call instead of hundreds');
let drive = mkDrive(mkTree(), ROOT);
let api = load(drive, ROOT);
let r = api.doGet({ parameter: { action: 'records' } });
if (!r || !r.records) { console.log('  reply was:', JSON.stringify(r).slice(0, 300)); process.exit(1); }
ok('returns every inspection in one reply', r.ok && r.records.length === GOOD, `${r.records.length} records`);
ok('reads each sidecar exactly once', drive.reads === SIDECARS, `${drive.reads} file reads`);
ok('a malformed sidecar is counted, not fatal', r.failed === 1, `failed=${r.failed}`);
ok('photo index comes back in the same call', r.index && r.index.length === PHOTOS, `${r.index && r.index.length} photos`);
ok('records say which file they came from', r.records.every(x => x._file && x._file.includes('/')), r.records[0]._file);

console.log('\nincremental refresh');
const cursor = r.cursor;
drive.reads = 0;
let r2 = api.doGet({ parameter: { action: 'records', after: String(cursor) } });
ok('nothing changed -> nothing read', r2.records.length === 0 && drive.reads === 0, `${drive.reads} reads`);

// a phone uploads one more inspection
drive = mkDrive(mkTree(true), ROOT); api = load(drive, ROOT);
let r3 = api.doGet({ parameter: { action: 'records', after: String(cursor) } });
ok('one new inspection -> one file read', r3.records.length === 1 && drive.reads === 1,
   `${r3.records.length} record(s), ${drive.reads} read(s)`);
ok('the new one is the right one', r3.records[0].equip === 'TK999', r3.records[0].equip);
ok('cursor advances', r3.cursor === 9000000, String(r3.cursor));

console.log('\npaging when there is too much');
drive = mkDrive(mkTree(), ROOT); api = load(drive, ROOT);
let page = api.doGet({ parameter: { action: 'records', max: '10' } });
ok('a capped run reports truncated', page.truncated === true && page.records.length === 10,
   `${page.records.length} records, truncated=${page.truncated}`);
ok('and says how many are still waiting', page.pending === SIDECARS - 10, `pending=${page.pending}`);
let seen = page.records.length, guard = 0;
while (page.truncated && guard++ < 20) {
  page = api.doGet({ parameter: { action: 'records', max: '10', after: String(page.cursor) } });
  seen += page.records.length;
}
ok('paging with the cursor reaches the end', seen === GOOD && !page.truncated, `${seen} records in ${guard + 1} calls`);

console.log('\nsmaller reply when the index is not wanted');
r = api.doGet({ parameter: { action: 'records', index: '0' } });
ok('index=0 omits the photo list', !r.index && r.photos === PHOTOS, `photos=${r.photos}`);

console.log('\nthe old actions still work');
r = api.doGet({ parameter: { action: 'list' } });
ok('list still returns everything', r.ok && r.files.length === FILES, `${r.files.length} files`);
ok('list entries carry updated', r.files.every(f => typeof f.updated === 'number'));
const aPhoto = Object.values(drive.byId).find(x => x._name && x._name.endsWith('.jpg'));
r = api.doGet({ parameter: { action: 'file', id: aPhoto._id } });
ok('file read still works and is inside the root', r.ok === true, r.error || r.name);
r = api.doGet({ parameter: {} });
ok('health check still answers', r.ok === true && r.folder === 'Condition Monitoring', r.folder || r.error);
r = api.doGet({ parameter: { action: 'nope' } });
ok('unknown action is rejected cleanly', r.ok === false && /Unknown action/.test(r.error), r.error);

console.log('\nrefusing a file outside the folder');
const other = mkDrive({ files: { 'secret.txt': { body: 'x', updated: 1 } } });
drive.byId['outsider'] = Object.values(other.byId).find(x => x._name === 'secret.txt');
r = api.doGet({ parameter: { action: 'file', id: 'outsider' } });
ok('a valid id outside the root is refused', r.ok === false && /not inside/.test(r.error), r.error);

console.log(fails.length ? '\nFAILURES: ' + fails.join(' | ') : '\nall Apps Script checks passed');
process.exit(fails.length ? 1 : 0);
