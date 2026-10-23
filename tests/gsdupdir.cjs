const REPO = require('path').join(__dirname, '..');
/* Two folders of one name in the Apps Script's Drive tree.

   Read off the live backend on 2026-10-23: TK112's General Inspection of
   19 Oct, 26 files from phone DRGZCS, every one of them on Drive — and
   action=list answered 13. Pechanka writes into the same root
   (CM_backup_Pechanka); on 2026-10-20 01:32 it created a second INSP/TK112
   (its folders carry a description equal to their name; the script's never
   do), getFoldersByName handed the two back in no fixed order, and the round
   went half into each. The record file and 13 photographs sat in the folder
   action=list never read, so the phone's read-back and the office's file
   index saw half a round.

   What has to hold in docs/google-upload.gs:
     1. a listing reads every folder of a name, at every level;
     2. a write always lands in the OLDEST folder of a name, whatever order
        Drive returns them in, so every later upload converges on one;
     3. a folder this request just made gives way to an older one that
        appeared beside it, and is trashed only if it is still empty;
     4. a read never creates a folder.

   Run: node tests/gsdupdir.cjs */
const fs = require('fs');
const SRC = REPO + '/docs/google-upload.gs';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* A fake Drive that, unlike the others in this directory, lets two folders
   share a name, remembers when each was made, and returns them in whatever
   order the test says — the real getFoldersByName promises no order. */
function mkDrive() {
  let seq = 0, clock = 1000;
  const byId = {};
  const it = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const drive = { order: 'new-first', created: [], onCreate: null };
  const mkFolder = (name, parent, born) => {
    const d = { _id: 'd' + (++seq), _name: name, _born: born || (clock += 10), _subs: [], _files: [], _parent: parent, _trashed: false,
      getId: () => d._id, getName: () => d._name, getDateCreated: () => new Date(d._born),
      getParents: () => it(d._parent ? [d._parent] : []),
      getFiles: () => it(d._files.slice()), getFolders: () => it(d._subs.filter(x => !x._trashed)),
      getFoldersByName: n => {
        const m = d._subs.filter(x => x._name === n && !x._trashed);
        m.sort((a, b) => a._born - b._born);
        if (drive.order === 'new-first') m.reverse();
        return it(m);
      },
      createFolder: n => { const c = mkFolder(n, d); d._subs.push(c); drive.created.push(c);
                           if (drive.onCreate) drive.onCreate(d, n, c); return c; },
      setTrashed: v => { d._trashed = !!v; },
      addFile: (n, size) => { const f = { _id: 'f' + (++seq), _name: n, _size: size, _updated: (clock += 1), _parent: d,
        getId: () => f._id, getName: () => f._name, getSize: () => f._size,
        getLastUpdated: () => new Date(f._updated), getParents: () => it([d]) };
        d._files.push(f); byId[f._id] = f; return f; },
      _add: (n, born) => { const c = mkFolder(n, d, born); d._subs.push(c); return c; } };
    byId[d._id] = d;
    return d;
  };
  drive.root = mkFolder('CM_backup_Pechanka', null, 1);
  drive.byId = byId;
  return drive;
}
const ROOT = '1AbCdEfGhIjKlMnOpQrStUvWxYz123456';

function load(drive) {
  const src = fs.readFileSync(SRC, 'utf8')
    .replace(/const SECRET = '[^']*';/, "const SECRET = '';")
    .replace(/const ROOT_FOLDER_ID = '[^']*';/, "const ROOT_FOLDER_ID = " + JSON.stringify(ROOT) + ";");
  if (!src.includes(JSON.stringify(ROOT))) throw new Error('could not substitute ROOT_FOLDER_ID');
  drive.root._id = ROOT; drive.byId[ROOT] = drive.root;
  const sandbox = {
    DriveApp: { getFolderById: id => { if (id !== ROOT) throw new Error('no such folder'); return drive.root; },
                getFileById: id => drive.byId[id] },
    Utilities: { ...require('./gsdigest.cjs'), base64Encode: b => Buffer.from(b).toString('base64') },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) },
    Logger: { log: () => {} },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
  };
  const fn = new Function(...Object.keys(sandbox), src + '\n;return {doGet:doGet, folderPath_:folderPath_};');
  return fn(...Object.values(sandbox));
}

/* ---- the live shape: INSP/TK112 twice, 2026-10-19 in each ---- */
function tk112() {
  const drive = mkDrive();
  const insp = drive.root._add('INSP', 50);
  const old = insp._add('TK112', 100), late = insp._add('TK112', 200);   // Pechanka's, a day later
  const a = old._add('2026-10-19', 110), b = late._add('2026-10-19', 210);
  ['TK112_19.10.2026_INSP.json', 'TK112_OVERVIEW_19.10.2026_INSP.jpg']
    .concat([1, 2, 3, 4].map(i => `TK112.HS.DL_19.10.2026_INSP_${i}.jpg`))
    .concat([1, 2, 3, 4].map(i => `TK112.ELS.ALT_19.10.2026_INSP_${i}.jpg`))
    .concat([1, 2, 3, 4].map(i => `TK112.ENG.EXS_19.10.2026_INSP_${i}.jpg`))
    .forEach(n => a.addFile(n, 500000));
  [1, 2, 3, 4, 5, 6, 7, 8].map(i => `TK112.DRS.ENG_19.10.2026_INSP_${i}.jpg`)
    .concat([1, 2, 3, 4].map(i => `TK112.AXL.RAX_19.10.2026_INSP_${i}.jpg`))
    .concat(['TK112.ELS.ALT_19.10.2026_INSP_3.jpg'])                    // the re-send that landed twice
    .forEach(n => b.addFile(n, 500000));
  return { drive, insp, old, late, a, b };
}

console.log('\naction=list reads every folder of a name');
for (const order of ['new-first', 'old-first']) {
  const T = tk112(); T.drive.order = order;
  const api = load(T.drive);
  const r = api.doGet({ parameter: { action: 'list', folder: 'INSP/TK112/2026-10-19' } });
  const names = new Set(r.files.map(f => f.name));
  ok(`${order}: every file of the round is listed`, r.ok && names.size === 26, `${r.files.length} entries, ${names.size} names`);
  ok(`${order}: the record file is among them`, names.has('TK112_19.10.2026_INSP.json'));
  ok(`${order}: and so are the photographs in the other folder`, names.has('TK112.DRS.ENG_19.10.2026_INSP_8.jpg') && names.has('TK112.AXL.RAX_19.10.2026_INSP_4.jpg'));
  const up = api.doGet({ parameter: { action: 'list', folder: 'INSP/TK112' } });
  ok(`${order}: one level up, both TK112 folders are read too`, new Set(up.files.map(f => f.name)).size === 26, String(up.files.length));
}

console.log('\na write lands in the oldest folder, whatever order Drive returns them in');
for (const order of ['new-first', 'old-first']) {
  const T = tk112(); T.drive.order = order;
  const api = load(T.drive);
  const d = api.folderPath_(T.drive.root, 'INSP/TK112/2026-10-19');
  ok(`${order}: the folder chosen is the older one`, d === T.a, d._id + ' vs ' + T.a._id);
  ok(`${order}: and nothing was created to find it`, T.drive.created.length === 0, String(T.drive.created.length));
}

console.log('\na folder this request made gives way to an older one beside it');
{
  const drive = mkDrive(); drive.order = 'new-first';
  const insp = drive.root._add('INSP', 50);
  let theirs = null;
  // At the moment this request creates TK999, another writer's TK999 — made a
  // little earlier, not yet visible when this request looked — appears.
  drive.onCreate = (parent, n) => { if (n === 'TK999' && !theirs) theirs = parent._add('TK999', 60); };
  const api = load(drive);
  const d = api.folderPath_(drive.root, 'INSP/TK999');
  const mine = drive.created.find(f => f._name === 'TK999');
  ok('the older folder is the one used', d === theirs, d._id);
  ok('the empty one this request made is trashed', mine && mine._trashed === true);
  const again = api.folderPath_(drive.root, 'INSP/TK999/2026-10-23');
  ok('and the next write lands under the same one', again._parent === theirs);
}
{
  const drive = mkDrive(); drive.order = 'new-first';
  drive.root._add('INSP', 50);
  let theirs = null;
  drive.onCreate = (parent, n, made) => { if (n === 'TK998' && !theirs) { theirs = parent._add('TK998', 60); made.addFile('already-here.jpg', 10); } };
  const api = load(drive);
  api.folderPath_(drive.root, 'INSP/TK998');
  const mine = drive.created.find(f => f._name === 'TK998');
  ok('a folder that already holds a file is never trashed', mine && mine._trashed === false);
}

console.log('\na read never creates a folder');
{
  const drive = mkDrive();
  const api = load(drive);
  const r = api.doGet({ parameter: { action: 'list', folder: 'INSP/NOPE/2026-10-23' } });
  ok('a path nobody wrote to lists as empty', r.ok && r.count === 0, JSON.stringify(r).slice(0, 80));
  ok('and no folder was made by asking', drive.created.length === 0, String(drive.created.length));
}

console.log('');
if (fails.length) { console.log(fails.length + ' FAILED'); process.exit(1); }
console.log('all passed');
