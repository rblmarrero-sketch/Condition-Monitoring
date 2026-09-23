/* The race the pre-write HEAD check cannot see.

   saveOne()'s rival detection is a headObj(key0) done BEFORE this device
   writes. Two phones filing the same round close enough in time can both
   pass that check — both see no owner, because neither has written yet —
   and both go on to write straight to the primary key with no rival ever
   noticed. Whichever device's own read-after-write verify happens to run
   AFTER the other device's write lands gets back bytes it did not send: a
   receipt that only ever checked "does this match what I sent" cannot tell
   the difference between "my own write, intact" and "someone else's write,
   landed on top of mine a moment ago" — except by looking at who the object
   says it belongs to now, which is exactly what the block in saveOne()
   headed "A WRITE THAT WAS NEVER A KNOWN RIVAL AT HEAD-CHECK TIME..." does.

   A real two-connection race is not something one Node process can force
   reliably — the interleaving needed (another write landing strictly between
   this device's own PUT and its own read-back) depends on which microtask
   queue slot two independent fetches happen to resume on, which is exactly
   what makes a naive Promise.all() version of this test pass on one machine
   and miss the window on the next. So this loads the REAL function.js (the
   same trick as ya-srv.cjs) and instruments getObj() to inject "someone
   else's write already landed" at the one instant that matters — inside the
   first post-write verify read for a chosen key — instead of hoping two real
   requests line up. Everything before and after that one injected line is
   the deployed code, unmodified.

   Run: node tests/toctou.cjs
*/
const crypto = require('crypto');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const b64 = s => Buffer.from(s, 'utf8').toString('base64');

/* ---- the same in-memory bucket ya-srv.cjs uses ---- */
function mkBucket() {
  const obj = new Map();
  let clock = Date.now();
  const stamp = () => (clock = Math.max(Date.now(), clock + 1));
  return {
    put(key, buf, type, dev, meta) {
      obj.set(key, { buf: Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)),
                     type: type || 'application/octet-stream', dev: dev || '', meta: meta || {}, at: stamp() });
    },
    get(key) { return obj.get(key) || null; },
    del(key) { return obj.delete(key); },
    list(prefix) {
      const out = [];
      for (const [key, v] of obj) {
        if (prefix && key.indexOf(prefix) !== 0) continue;
        out.push({ key, name: key.slice(key.lastIndexOf('/') + 1), path: key, id: key, size: v.buf.length, updated: v.at });
      }
      return out;
    },
    keys() { return [...obj.keys()]; },
    clear() { obj.clear(); },
  };
}
const B = mkBucket();

process.env.BUCKET = 'cm-test';
process.env.SECRET = '';
process.env.ADMIN_SECRET = '';

/* RACE.current, when set, fires once: the FIRST getObj() against its own
   `key` runs `inject()` synchronously — before the read — and only then
   reads the bucket. That is the one moment being controlled. Every other
   key, and every later call against the same key, reads the bucket exactly
   as ya-srv.cjs's own double does. */
const RACE = { current: null };
const src = fs.readFileSync(path.join(ROOT, 'docs/yandex/function.js'), 'utf8');
const shim = `
  listAll = async prefix => BUCKET_.list(prefix || '');
  getObj = async key => {
    const r = RACE_.current;
    if (r && r.key === key && !r.fired) { r.fired = true; r.inject(); }
    const o = BUCKET_.get(key); if (!o) throw new Error('S3 404: ' + key);
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
const real = new Function('exports', 'module', 'require', 'process', 'BUCKET_', 'RACE_', body)(
  mod.exports, mod, require, process, B, RACE);

const save = async (name, folder, dev, buf, extra) => {
  const evt = { httpMethod: 'POST', body: JSON.stringify(Object.assign(
    { name, folder, contentType: 'application/json', dev, file: b64(buf.toString('utf8')) }, extra || {})) };
  const r = await real.handler(evt);
  return JSON.parse(r.body);
};

(async () => {
  console.log('\ntwo phones write the same fresh key close enough that neither sees the other at the pre-check');
  const NAME = 'TK900_10.03.2026_MP.json', FOLDER = 'MP/2026-03', KEY = FOLDER + '/' + NAME;
  const A_BUF = Buffer.from(JSON.stringify({ type: 'cm-inspection-entries', version: 2, records: [
    { equip: 'TK900', date: '2026-03-10', type: 'MP', by: 'I. Ivanov', dev: 'DAAAA',
      items: [{ key: '4C', grade: 'B' }] }] }));
  const B_BUF = Buffer.from(JSON.stringify({ type: 'cm-inspection-entries', version: 2, records: [
    { equip: 'TK900', date: '2026-03-10', type: 'MP', by: 'O. Petrova', dev: 'DBBBB',
      items: [{ key: '4C', grade: 'C' }] }] }));
  const B_SHA = sha256(B_BUF);

  RACE.current = { key: KEY, fired: false,
    inject: () => B.put(KEY, B_BUF, 'application/json', 'DBBBB', { 'x-amz-meta-cm-sha': B_SHA }) };
  const r = await save(NAME, FOLDER, 'DAAAA', A_BUF);
  RACE.current = null;

  ok('the write is not silently accepted as this device\'s own', r.ok === true, JSON.stringify(r).slice(0, 160));
  ok('a rival is recognised after the fact, not just before it', r.kept === true, JSON.stringify(r.kept));
  ok('this device\'s own bytes move to their own variant, not the primary key',
     r.name === 'TK900_10.03.2026_MP~DAAAA.json', r.name);
  ok('the receipt is for what actually got verified, not what was first sent',
     r.receipt && r.receipt.verified === true && r.receipt.duplicate === false, JSON.stringify(r.receipt));
  ok('the conflict is raised under the record key, not a file name',
     r.conflict === 'TK900|2026-03-10|MP', String(r.conflict));
  const devs = (r.devices || []).map(d => d.dev).sort();
  ok('both devices are named on the marker', devs.join(',') === 'DAAAA,DBBBB', devs.join(','));

  const primary = B.get(KEY);
  ok('the object at the ORIGINAL name is still the other device\'s bytes, untouched',
     primary && primary.buf.equals(B_BUF) && primary.dev === 'DBBBB',
     primary && { dev: primary.dev, sha: sha256(primary.buf) === B_SHA });
  const variant = B.get(FOLDER + '/TK900_10.03.2026_MP~DAAAA.json');
  ok('this device\'s own bytes are not lost — they are readable at the variant',
     variant && variant.buf.equals(A_BUF) && variant.dev === 'DAAAA',
     variant && { dev: variant.dev });
  const marker = B.get('_meta/TK900_10.03.2026_MP.conflict.json');
  ok('a conflict marker document exists for the office to resolve',
     !!marker, !!marker);

  console.log('\nan ordinary solo save is untouched by the instrumentation');
  const NAME2 = 'TK901_11.03.2026_MP.json', FOLDER2 = 'MP/2026-03', KEY2 = FOLDER2 + '/' + NAME2;
  const SOLO = Buffer.from(JSON.stringify({ type: 'cm-inspection-entries', version: 2, records: [
    { equip: 'TK901', date: '2026-03-11', type: 'MP', by: 'I. Ivanov', dev: 'DAAAA',
      items: [{ key: '4C', grade: 'A' }] }] }));
  const solo = await save(NAME2, FOLDER2, 'DAAAA', SOLO);
  ok('no rival, no conflict, verified — the ordinary path is not disturbed',
     solo.ok === true && !solo.kept && !solo.conflict && solo.receipt.verified === true, JSON.stringify(solo).slice(0, 160));
  ok('it lands at its own primary name', B.get(KEY2) && B.get(KEY2).buf.equals(SOLO));

  console.log('\na genuine duplicate is excluded even if the metadata briefly looks like a rival');
  /* Same shape the comment names directly: nothing was lost here, so nothing
     should move. Seed the object as this device's own prior upload — the
     pre-write HEAD check sees its own device and never treats it as a rival
     — then, during THIS device's own verify, flip only the owner tag while
     keeping the identical bytes: the dup check (on hash) already passed
     before this ever ran, so `duplicate` must stay true and the race check
     must never fire on top of it. */
  const NAME3 = 'TK902_12.03.2026_MP.json', FOLDER3 = 'MP/2026-03', KEY3 = FOLDER3 + '/' + NAME3;
  const DUP_BUF = Buffer.from(JSON.stringify({ type: 'cm-inspection-entries', version: 2, records: [
    { equip: 'TK902', date: '2026-03-12', type: 'MP', by: 'I. Ivanov', dev: 'DAAAA',
      items: [{ key: '4C', grade: 'B' }] }] }));
  const DUP_SHA = sha256(DUP_BUF);
  B.put(KEY3, DUP_BUF, 'application/json', 'DAAAA', { 'x-amz-meta-cm-sha': DUP_SHA });
  RACE.current = { key: KEY3, fired: false,
    inject: () => B.put(KEY3, DUP_BUF, 'application/json', 'DBBBB', { 'x-amz-meta-cm-sha': DUP_SHA }) };
  const dup = await save(NAME3, FOLDER3, 'DAAAA', DUP_BUF);
  RACE.current = null;
  ok('a real duplicate is answered as one, never as a rival',
     dup.ok === true && dup.receipt.duplicate === true && !dup.kept && !dup.conflict, JSON.stringify(dup).slice(0, 160));

  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
