/* ============================================================================
   CONDITION MONITORING — the same function, on a machine

   Kazakhstan (kz1) has no Cloud Functions. It has Object Storage, so the bucket
   half is unchanged; what is missing is the thing that answers HTTP. This is
   that thing, and it is deliberately thin: it translates a Node request into
   the SAME event object a Yandex function receives, hands it to the SAME
   handler in function.js, and writes back exactly what comes out.

   Nothing about the contract moves. function.js is the one implementation, so
   a fix made for one region is a fix in both, and tests/yandex.cjs — which
   holds this backend to the Apps Script's shape — covers this wrapper too,
   because tests/ya-srv.cjs routes through the translation below rather than
   writing its own.

   Run:  BUCKET=… KEY_ID=… KEY_SECRET=… node server.js
   In production systemd runs it and Caddy puts HTTPS in front. See VM-SETUP.md.
============================================================================ */
'use strict';
const http = require('http');

/* 64 MB. A batch is up to 8 media files, and base64 adds a third — a round of
   large photographs lands near 9 MB, so this is roughly seven times the worst
   real case. It exists so a malformed or hostile request cannot make the
   process hold the whole thing in memory: a VM has a fixed amount of it, and
   unlike a function nobody restarts it for you. */
const MAX_BODY = Number(process.env.MAX_BODY || 64 * 1024 * 1024);
const PORT = Number(process.env.PORT || 8080);
/* Loopback by default. Caddy terminates TLS and proxies here, so the Node
   process must not be reachable from the internet on its own — binding
   0.0.0.0 would publish an HTTP endpoint beside the HTTPS one, and the phones
   would work fine over it while sending every photograph in the clear. */
const HOST = process.env.HOST || '127.0.0.1';

/* A Node request, as a Yandex function sees it. Same field names, same shapes:
   anything else here and the handler is being tested through a different door
   than the one it uses. */
function toEvent(req, raw) {
  const u = new URL(req.url, 'http://x');
  const q = {};
  u.searchParams.forEach((v, k) => { q[k] = v; });
  return { httpMethod: req.method, queryStringParameters: q, body: raw,
           isBase64Encoded: false, path: u.pathname };
}

/* And back. The handler's own headers, verbatim — CORS included.

   This is not a detail. Both clients deliberately send text/plain so the
   request stays "simple" and needs no preflight, but the browser still refuses
   to let the page READ a cross-origin reply that has no
   Access-Control-Allow-Origin. Strip or replace these headers and the upload
   succeeds, the file lands, and the phone counts it as a failure and sends it
   again for ever. */
function send(res, out) {
  const h = Object.assign({}, (out && out.headers) || { 'Content-Type': 'application/json' });
  res.writeHead((out && out.statusCode) || 200, h);
  res.end((out && out.body) || '');
}

/* One request, start to finish: read it under a cap, translate it, call the
   handler, write the reply. The whole per-request path lives here rather than
   inside createServer so that tests/ya-srv.cjs — which has to host the app's
   static files as well and therefore runs its own http server — can put a
   request through THIS, not through a re-implementation of it. The first
   version kept the size cap inside createServer, the suite read the body
   itself, and a 70 MB request sailed through a server that would have refused
   it in production. */
function handle(req, res, handler) {
  const chunks = [];
  let size = 0, over = false;
  req.on('data', c => {
    size += c.length;
    if (size > MAX_BODY) {
      if (!over) { over = true; chunks.length = 0; }   // let the partial upload go now
      /* Read on, and throw it away.

         The obvious move is to answer 413 here and destroy the socket, and it
         is wrong twice over. The client is still sending, so tearing the
         connection down reaches it as ECONNRESET and it never reads the
         refusal — and even answering WITHOUT destroying loses the race, because
         a response that completes while the request body is still arriving lets
         Node close the socket underneath it. Both leave the caller unable to
         tell a refusal from a dead link, and a dead link is retried for ever,
         which is the loop this limit exists to prevent.

         So the reply waits for 'end'. The bandwidth is spent either way; what
         is bought is an answer the caller can act on. Memory is safe, which was
         the actual point — the buffer went at the first byte over. */
      if (size > MAX_BODY * 4) { try { req.destroy(); } catch (e) {} }
      return;
    }
    chunks.push(c);
  });
  req.on('error', () => { try { req.destroy(); } catch (e) {} });
  req.on('end', async () => {
    if (over) {
      /* Refused WITH the CORS header. Without it the browser will not let the
         page read the refusal, and a rejection the phone could act on becomes
         indistinguishable from a dead link. */
      return send(res, { statusCode: 413,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ok: false, error: 'Body too large' }) });
    }
    try {
      send(res, await handler(toEvent(req, Buffer.concat(chunks).toString('utf8'))));
    } catch (e) {
      /* The handler catches its own errors and answers ok:false, so reaching
         here means the wrapper itself broke. Still answer, and still with the
         header — a bare socket close is the one reply the phone cannot tell
         apart from no signal. */
      send(res, { statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ok: false, error: String((e && e.message) || e) }) });
    }
  });
}

function createServer(handler) {
  return http.createServer((req, res) => handle(req, res, handler));
}

exports.toEvent = toEvent;
exports.handle = handle;
exports.send = send;
exports.createServer = createServer;

/* ---- waking the phones ----------------------------------------------------
   Three reasons to push, none of them a person:
     build   Pages publishes a new sw.js — polled every PUSH_POLL_MS; the build
             last seen is kept in the bucket so a restart does not miss one;
     folder  a round or a correction landed — debounced PUSH_FOLDER_DELAY_MS
             and no more than one every PUSH_FOLDER_GAP_MS;
     daily   at PUSH_DAILY_UTC (default 18:00 UTC, 06:00 at Baimskaya) — the
             readiness check before the shift, whether or not anything changed.
   The phone's worker answers every one of them with "Ready for the field" or
   "Not ready", which is the only thing anybody has to read. */
const fs = require('fs');
function loadVapid(fn) {
  const P = fn._internals;
  if (P.vapidReady()) return 'environment';
  const file = process.env.VAPID_FILE || '/opt/cm/vapid.json';
  try { const k = JSON.parse(fs.readFileSync(file, 'utf8')); P.vapidSet(k); if (P.vapidReady()) return file; } catch (e) {}
  const k = P.vapidGenerate();
  try { fs.writeFileSync(file, JSON.stringify(k), { mode: 0o600 }); P.vapidSet(k); return file + ' (generated)'; }
  catch (e) { P.vapidSet(k); return 'memory only — could not write ' + file + ' (' + e.message + '); phones re-subscribe after every restart'; }
}
function fetchText(url, ms) {
  return new Promise((res, rej) => {
    const mod = /^https:/.test(url) ? require('https') : http;
    const req = mod.get(url, { headers: { 'Cache-Control': 'no-cache' } }, r => {
      const ch = []; r.on('data', c => ch.push(c)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(ch).toString('utf8')) : rej(new Error('http ' + r.statusCode)));
    });
    req.setTimeout(ms || 20000, () => req.destroy(new Error('timeout')));
    req.on('error', rej);
  });
}
function startPushTriggers(fn, o) {
  o = o || {};
  const P = fn._internals;
  const log = o.log || (m => console.log('[push] ' + m));
  const pollMs = o.pollMs || Number(process.env.PUSH_POLL_MS || 300000);
  const swUrl = o.swUrl || process.env.PAGES_SW_URL || 'https://rblmarrero-sketch.github.io/Condition-Monitoring/mobile/sw.js';
  const folderDelay = o.folderDelayMs != null ? o.folderDelayMs : Number(process.env.PUSH_FOLDER_DELAY_MS || 180000);
  const folderGap = o.folderGapMs != null ? o.folderGapMs : Number(process.env.PUSH_FOLDER_GAP_MS || 900000);
  const daily = o.dailyUtc || process.env.PUSH_DAILY_UTC || '18:00';
  const st = { build: null, lastFolder: 0, folderTimer: null, lastDaily: '', timers: [], log: [] };
  const note = (m) => { st.log.push(new Date().toISOString() + ' ' + m); if (st.log.length > 50) st.log.shift(); log(m); };
  async function pollBuild() {
    try {
      if (st.build === null) { st.build = String((await P.pushStateGet()).build || ''); }
      const m = (await fetchText(swUrl, 20000)).match(/const BUILD\s*=\s*"([^"]+)"/);
      if (!m) { note('poll: no build number in ' + swUrl); return null; }
      if (m[1] !== st.build) {
        const was = st.build; st.build = m[1];
        await P.pushStateSet({ build: m[1], at: new Date().toISOString() });
        if (was) { const r = await P.pushAll({ kind: 'build', build: m[1] }, { topic: 'cm-build', ttl: 86400, urgency: 'high' });
                   note('build ' + was + ' → ' + m[1] + ': ' + JSON.stringify(r)); return r; }
        note('build ' + m[1] + ' noted');
      }
      return null;
    } catch (e) { note('poll: ' + (e && e.message || e)); return null; }
  }
  async function pushFolder() {
    st.lastFolder = Date.now();
    const r = await P.pushAll({ kind: 'folder' }, { topic: 'cm-folder', ttl: 6 * 3600, urgency: 'normal' });
    note('folder: ' + JSON.stringify(r)); return r;
  }
  function folderChanged() {
    clearTimeout(st.folderTimer);
    const wait = Math.max(folderDelay, st.lastFolder + folderGap - Date.now());
    st.folderTimer = setTimeout(() => { pushFolder().catch(e => note('folder: ' + e.message)); }, wait);
    if (st.folderTimer.unref) st.folderTimer.unref();
  }
  async function pushDaily() {
    const r = await P.pushAll({ kind: 'daily' }, { topic: 'cm-daily', ttl: 6 * 3600, urgency: 'high' });
    note('daily: ' + JSON.stringify(r)); return r;
  }
  function tickDaily() {
    const d = new Date(), hm = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
    const day = d.toISOString().slice(0, 10);
    if (hm === daily && st.lastDaily !== day) { st.lastDaily = day; pushDaily().catch(e => note('daily: ' + e.message)); }
  }
  fn.onFolderChange(folderChanged);
  st.timers.push(setInterval(() => { pollBuild(); }, pollMs));
  st.timers.push(setInterval(tickDaily, 60000));
  st.timers.forEach(t => t.unref && t.unref());
  pollBuild();
  return { pollBuild, pushFolder, pushDaily, folderChanged, state: st,
           stop() { st.timers.forEach(clearInterval); clearTimeout(st.folderTimer); fn.onFolderChange(null); } };
}
exports.loadVapid = loadVapid;
exports.startPushTriggers = startPushTriggers;

if (require.main === module) {
  const fn = require('./function.js');
  console.log('push keys: ' + loadVapid(fn));
  startPushTriggers(fn);
  const srv = createServer(fn.handler);
  /* Longer than the handler's own worst case. A batch of eight photographs
     over a slow link genuinely takes a while, and Node's default of two
     minutes would cut an upload that was still working. */
  srv.headersTimeout = 125000;
  srv.requestTimeout = 120000;
  srv.listen(PORT, HOST, () => console.log('cm endpoint on ' + HOST + ':' + PORT));
  /* Say goodbye properly, so a deploy does not drop a round mid-upload. */
  for (const sig of ['SIGTERM', 'SIGINT'])
    process.on(sig, () => srv.close(() => process.exit(0)));
  /* A wrapper that dies takes the endpoint with it and systemd restarts it
     seconds later — but log WHY first, because "it restarted" with no reason
     is the hardest kind of fault to chase on a machine nobody watches. */
  process.on('uncaughtException', e => { console.error('uncaught', e); process.exit(1); });
  process.on('unhandledRejection', e => { console.error('unhandled', e); });
}
