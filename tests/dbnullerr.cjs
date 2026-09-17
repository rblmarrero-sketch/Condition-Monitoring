/* A REJECTION WITH NOTHING TO SAY STILL HAS TO SAY SOMETHING.

   Read off a handset on 2026-09-17: "Could not record TK150's progress on
   this phone (null) — the phone may be out of room; what was sent is kept."
   The parenthesis is the whole diagnosis, and it says nothing. `up_bookfail`
   builds it from `String((e&&e.message)||e)`, which is right about a real
   Error — but dbPut's own onerror handler was `()=>rej(t.error)`, with no
   fallback, and IDBTransaction.error is nullable by spec: a transaction can
   fire "error" with `.error` still null (this project's own dbPut already
   guarded the sibling onabort handler the identical way, one line below —
   `t.error||new Error("save aborted — storage may be full")` — onerror was
   simply never given the same treatment). A caught `null` stringifies to
   the four letters a technician read on the glass.

   Six IndexedDB wrappers shared the same gap: idb() itself, dbPut, dbAll,
   dbTeam, dbGet, dbDel. Every one now falls back to a real Error naming
   what failed, matching the onabort/FileReader pattern already used
   elsewhere in this file. This does not explain WHY the transaction had no
   error object — that is between this phone and its storage — only that
   whatever reaches the technician is now a sentence, not a null.

   Run: node tests/dbnullerr.cjs   (starts its own server) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8481);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('x'); }
  s.end(fs.readFileSync(p));
});

/* A transaction that fires "error" with .error left null — the exact shape
   the field hit. Standing in for `d.transaction(...)` on the real,
   already-open IDBDatabase, so dbPut/dbGet/dbAll/dbTeam/dbDel run their own
   real code against it, not a re-implementation of it. */
const RIG = `(function(){
  // A request whose "error" event fires with .error left null — same shape
  // for both the transaction-level (dbPut/dbDel) and request-level
  // (dbGet/dbAll/dbTeam) handlers this file's wrappers actually attach to.
  function fakeReq(){
    const rq = { error: null };
    Object.defineProperty(rq, 'onerror',   { set(fn){ setTimeout(fn, 0); }, configurable: true });
    Object.defineProperty(rq, 'onsuccess', { set(fn){}, configurable: true });
    return rq;
  }
  function fakeTx(){
    const tx = { error: null };
    tx.objectStore = () => ({ put: fakeReq, get: fakeReq, getAll: fakeReq, delete: fakeReq });
    Object.defineProperty(tx, 'onerror',   { set(fn){ setTimeout(fn, 0); }, configurable: true });
    Object.defineProperty(tx, 'oncomplete',{ set(fn){}, configurable: true });
    Object.defineProperty(tx, 'onabort',   { set(fn){}, configurable: true });
    return tx;
  }
  return idb().then(d => { d.transaction = fakeTx; return true; });
})()`;

const msgOf = fn => `(async function(){
  try { await ${fn}; return { rejected: false }; }
  catch (e) { return { rejected: true, msg: String((e && e.message) || e) }; }
})()`;

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]'); });
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof dbPut === 'function' && typeof idb === 'function', null, { timeout: 20000 });

  ok('the rig installs on the real, already-open database', await p.evaluate(RIG) === true);

  console.log('\nevery IndexedDB wrapper rejects with a real message, never the four letters "null"');
  const cases = [
    ['dbPut', "dbPut({id:'x'})"],
    ['dbGet', "dbGet('x')"],
    ['dbAll', 'dbAll()'],
    ['dbTeam', 'dbTeam()'],
    ['dbDel', "dbDel('x')"],
  ];
  for (const [name, call] of cases) {
    const r = await p.evaluate(msgOf(call));
    ok(`${name} rejects`, r.rejected, JSON.stringify(r));
    ok(`  and names a reason instead of "null"`, r.rejected && r.msg && r.msg.toLowerCase() !== 'null', r.msg);
  }

  console.log('\nthe field-reported banner reads a real reason, not "(null)"');
  const banner = await p.evaluate(async () => {
    try { await dbPut({ id: 'TK150' }); return null; }
    catch (e) { return t('up_bookfail', { u: 'TK150', why: String((e && e.message) || e) }); }
  });
  ok('names the round and a real reason', /TK150/.test(banner) && !/\(null\)/.test(banner), banner);

  ok('no page errors', errs.length === 0, errs.join(' | '));

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); srv.close(); process.exit(1); });
