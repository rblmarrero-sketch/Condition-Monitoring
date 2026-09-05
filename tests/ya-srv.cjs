/* A /exec that runs the REAL Yandex function over an in-memory bucket.

   The same trick as ed-srv.cjs, and for the same reason: a test that talks to a
   hand-written stand-in proves the stand-in. This loads docs/yandex/function.js
   itself and swaps only the layer that speaks S3, so every suite pointed at
   this port exercises the code that will be deployed.

   Run: node tests/ya-srv.cjs [port]
*/
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8103);
const ADMIN = process.argv[3] === 'NONE' ? '' : (process.argv[3] || 'letmein');

/* ---- an in-memory bucket ------------------------------------------------
   Keys, bytes and a last-modified. That is all Object Storage is to this
   function, and all of it that its behaviour depends on. */
function mkBucket() {
  const obj = new Map();                      // key -> {buf, type, dev, at}
  let clock = Date.now();
  const stamp = () => (clock = Math.max(Date.now(), clock + 1));
  return {
    put(key, buf, type, dev, meta) {
      obj.set(key, { buf: Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)),
                     type: type || 'application/octet-stream', dev: dev || '',
                     /* Object metadata, because the function now writes the
                        stored hash there and reads it back with a HEAD to
                        decide whether a re-send is a duplicate. A double that
                        dropped it would make that check appear to work here
                        and never work against the real bucket. */
                     meta: meta || {}, at: stamp() });
    },
    get(key) { return obj.get(key) || null; },
    del(key) { return obj.delete(key); },
    list(prefix) {
      const out = [];
      for (const [key, v] of obj) {
        if (prefix && key.indexOf(prefix) !== 0) continue;
        /* The same fields the real listAll() returns, `key` included — it is
           internal and the function fetches by it. A double that hands back
           MORE than the real thing hides a missing field; one that hands back
           less invents a failure. Either way the suite stops describing the
           deployed code, which is the only reason this file exists. */
        out.push({ key, name: key.slice(key.lastIndexOf('/') + 1), path: key, id: key,
                   size: v.buf.length, updated: v.at });
      }
      return out;
    },
    keys() { return [...obj.keys()]; },
    clear() { obj.clear(); },
  };
}
const B = mkBucket();
const WRAP = require(path.join(ROOT, 'docs/yandex/server.js'));

/* ---- load the real function, with S3 replaced ---------------------------
   The file is required normally so its logic is the deployed logic; only the
   four calls that reach the network are rebound. Rewriting the source would be
   testing a rewrite. */
process.env.BUCKET = 'cm-test';
process.env.SECRET = '';
process.env.ADMIN_SECRET = ADMIN;
const FN = require(path.join(ROOT, 'docs/yandex/function.js'));

/* function.js reaches S3 through four helpers held in its module scope, which a
   require() cannot reach. So the module is re-evaluated here with those four
   bound to the bucket above — same source, same closure, different floor. */
const src = fs.readFileSync(path.join(ROOT, 'docs/yandex/function.js'), 'utf8');
const shim = `
  listAll = async prefix => BUCKET_.list(prefix || '');
  getObj = async key => { const o = BUCKET_.get(key); if (!o) throw new Error('S3 404: ' + key);
    return { status: 200, body: o.buf, headers: Object.assign(
      { 'content-type': o.type, 'x-amz-meta-cm-dev': o.dev }, o.meta || {}) }; };
  headObj = async key => { const o = BUCKET_.get(key); return o ? { status: 200, body: Buffer.alloc(0),
    headers: Object.assign({ 'content-type': o.type, 'x-amz-meta-cm-dev': o.dev }, o.meta || {}) } : null; };
  putObj = async (key, buf, type, dev, meta) => { BUCKET_.put(key, buf, type, dev, meta); return { status: 200 }; };
  delObj = async key => { BUCKET_.del(key); return { status: 204 }; };
`;
const body = src
  .replace(/^const (listAll|getObj|headObj|putObj|delObj)/gm, 'let $1')
  .replace(/^async function listAll/m, 'let _unusedListAll; async function listAll')
  + '\n' + shim + '\nreturn exports;';
const mod = { exports: {} };
const real = new Function('exports', 'module', 'require', 'process', 'BUCKET_', body)(
  mod.exports, mod, require, process, B);
/* The push triggers, when a suite asks for them (tests/bgpush.cjs): the same
   startPushTriggers server.js runs on the VM, pointed at a sw.js the suite
   controls and on a clock the suite sets. VAPID keys arrive in the environment
   exactly as cm.env would carry them. */
let PUSH = null;
if (process.env.CM_PUSH_TRIGGERS) {
  PUSH = WRAP.startPushTriggers(real, { swUrl: process.env.CM_PUSH_SW, pollMs: Number(process.env.CM_PUSH_POLL_MS || 600000),
    folderDelayMs: Number(process.env.CM_PUSH_FOLDER_MS || 500), folderGapMs: Number(process.env.CM_PUSH_GAP_MS || 0),
    dailyUtc: 'never', log: m => console.log('[push] ' + m) });
}

/* ---- the fixture --------------------------------------------------------
   Byte for byte what ed-srv.cjs seeds. Not "something similar": tests/yandex.cjs
   compares the SHAPE of what the two endpoints return, and a sidecar with one
   different field would report as a contract difference when it is a fixture
   difference — which is worse than no comparison, because somebody would then
   go and "fix" the contract. */
const sidecar = (u, d, ty, g, dev, by) => JSON.stringify({ type: 'cm-inspection-entries', version: 2,
  records: [{ equip: u, date: d, type: ty, by: by || 'B. Ivanov', cls: 'HT', dev: dev || 'DAAAA',
    items: [{ key: '4C', label: 'Left Rear Final Drive', grade: g, defect: 'Ferrous debris — heavy',
              defectCode: 'DT14-03', cause: 'Gear wear', action: 'MON', actionLabel: 'Monitor', wo: '' }] }] });
function seed() {
  B.clear();
  [['TK146', '2026-03-09', 'MP', 'C'], ['TK147', '2026-03-10', 'MP', 'A'],
   ['TK148', '2026-03-11', 'FC', 'X']].forEach(([u, d, ty, g]) => {
    const dmy = d.split('-').reverse().join('.');
    B.put(`${ty}/2026-03/${u}_${dmy}_${ty}.json`, Buffer.from(sidecar(u, d, ty, g)), 'application/json');
    B.put(`${ty}/2026-03/${u}_4C_${dmy}_${ty}.jpg`, Buffer.from('JPEG'), 'image/jpeg');
  });
}
seed();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (u.pathname === '/__seed') { seed(); res.writeHead(200, cors); return res.end('ok'); }
  /* Plant a file exactly as it is, bypassing the function.

     saveOne() deliberately never overwrites — two phones can file the same
     round on the same day and the loser is renamed rather than lost — so a
     test cannot produce a corrupted copy by uploading over one. This can, and
     that is the only state in which a name-only comparison passes while the
     photograph is gone. */
  if (u.pathname === '/__put') {
    let raw = Buffer.alloc(0);
    for await (const c of req) raw = Buffer.concat([raw, c]);
    B.put(u.searchParams.get('key') || 'x', raw,
          u.searchParams.get('type') || 'application/octet-stream', '');
    res.writeHead(200, cors); return res.end('ok');
  }
  /* Remove an object outright. The function itself never deletes a settled
     conflict marker - it stamps it - but the backend that ran on the VM before
     that fix DID, and a phone left holding the leftover key is the state the
     pit reported. There is no way to reach it through the API, by design. */
  if (u.pathname === '/__del') {
    const gone = B.del(u.searchParams.get('key') || '');
    res.writeHead(200, cors); return res.end(gone ? 'ok' : 'missing');
  }
  if (u.pathname === '/__keys') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    return res.end(JSON.stringify({ keys: B.keys() }));
  }
  /* Fire a trigger now rather than waiting for its clock. */
  if (u.pathname.indexOf('/__push/') === 0) {
    const what = u.pathname.slice(8);
    let r = null;
    try { if (!PUSH) r = { error: 'triggers off' };
          else if (what === 'poll') r = await PUSH.pollBuild();
          else if (what === 'daily') r = await PUSH.pushDaily();
          else if (what === 'folder') r = await PUSH.pushFolder();
          else if (what === 'log') r = PUSH.state.log; }
    catch (e) { r = { error: String(e.message || e) }; }
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    return res.end(JSON.stringify(r));
  }
  if (u.pathname === '/exec') {
    /* Through the REAL wrapper, not a copy of it.

       Kazakhstan has no Cloud Functions, so on that side the thing that turns
       an HTTP request into the handler's event object is docs/yandex/server.js
       — a file that ships and can therefore be wrong. Re-implementing those two
       steps here would leave the deployed pair untested while every suite
       reported green, which is the same mistake this file was written to avoid
       one layer down.

       handle() reads the body under its own size cap and passes the handler's
       headers back verbatim, CORS included. Both matter: this server used to
       read the body itself, so a request far over the production limit sailed
       through one that would have refused it — and it used to inject its own
       CORS, so the suite could not see whether the function returns any. A
       double more generous than production hides the thing it exists to
       catch. */
    WRAP.handle(req, res, real.handler);
    return;
  }
  /* Everything else is the app itself, so one server can host the pages and the
     endpoint exactly as GitHub Pages plus the function will. */
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404, cors); return res.end('not found');
  }
  res.writeHead(200, Object.assign({ 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }, cors));
  fs.createReadStream(p).pipe(res);
}).listen(PORT, () => console.log('yandex /exec on ' + PORT));
