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
    put(key, buf, type, dev) {
      obj.set(key, { buf: Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)),
                     type: type || 'application/octet-stream', dev: dev || '', at: stamp() });
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
    return { status: 200, body: o.buf, headers: { 'content-type': o.type, 'x-amz-meta-cm-dev': o.dev } }; };
  headObj = async key => { const o = BUCKET_.get(key); return o ? { status: 200, body: Buffer.alloc(0),
    headers: { 'content-type': o.type, 'x-amz-meta-cm-dev': o.dev } } : null; };
  putObj = async (key, buf, type, dev) => { BUCKET_.put(key, buf, type, dev); return { status: 200 }; };
  delObj = async key => { BUCKET_.del(key); return { status: 204 }; };
`;
const body = src
  .replace(/^const (listAll|getObj|headObj|putObj|delObj)/gm, 'let $1')
  .replace(/^async function listAll/m, 'let _unusedListAll; async function listAll')
  + '\n' + shim + '\nreturn exports;';
const mod = { exports: {} };
const real = new Function('exports', 'module', 'require', 'process', 'BUCKET_', body)(
  mod.exports, mod, require, process, B);

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
  if (u.pathname === '/__keys') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    return res.end(JSON.stringify({ keys: B.keys() }));
  }
  if (u.pathname === '/exec') {
    let raw = '';
    for await (const c of req) raw += c;
    const q = {}; u.searchParams.forEach((v, k) => { q[k] = v; });
    const out = await real.handler({ httpMethod: req.method, queryStringParameters: q, body: raw });
    /* The function's OWN headers, verbatim — nothing added.

       This server injected its own CORS here, which meant the suite could not
       see whether the function returns any. It does not matter in a test
       harness and it matters enormously in Yandex, where the gateway returns
       exactly what the function returns: without the header the upload
       succeeds, the file lands, and the browser then refuses to let the page
       read the reply, so the phone counts it as a failure and sends it again
       for ever. A double that is more generous than production hides the one
       thing it was built to catch. */
    res.writeHead(out.statusCode || 200, out.headers || { 'Content-Type': 'application/json' });
    return res.end(out.body);
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
