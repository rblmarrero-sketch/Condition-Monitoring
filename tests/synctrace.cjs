/* THE TRACE REACHES SOMEBODY WITHOUT ANYBODY CARRYING IT.

   Every failure this project has diagnosed from the field arrived as a
   photograph of a screen. The questions that actually needed the trace —
   "press Sync twenty times and it goes through", which run made progress,
   which reader refused which file — cannot be answered from one. The trace
   has existed since build 350 and getting it costs an inspector four taps on
   the Sync screen plus somewhere to paste it, which is the same standing rule
   as the update path: if it needs a decision from them at −40 with gloves on,
   it does not happen.

   So the phone files it like any other document, into `_meta/diag/`. The
   deployed backend already path-joins b.folder in saveOne, so this needs no
   VM change and nothing new on the wire.

   WHAT THIS SUITE IS REALLY FOR. The trace is built out of error strings, and
   an error string quotes the request that failed — and this app puts the
   endpoint's shared secret in a QUERY STRING (`q.set("secret", g.sec)`, three
   read paths). So the trace can carry a credential, and it already had three
   ways out of the phone: the screen, the Copy button, and now an upload.
   §1 holds the redaction, which happens where the line is WRITTEN so that no
   later exit has to remember.

   And the rules that keep a diagnostic from ever costing an inspection: after
   the run, only on a real fault, at most once per TRACE_GAP, silent on
   failure.

   Run: node tests/synctrace.cjs   (starts its own server on 8483) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8483);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* The page, plus a stand-in endpoint that records what it is given. */
const PUT = [];
const srv = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/exec') {
    let b = ''; q.on('data', d => b += d);
    return q.on('end', () => {
      let j = {}; try { j = JSON.parse(b); } catch (e) {}
      PUT.push(j);
      s.setHeader('content-type', 'application/json');
      s.end(JSON.stringify({ ok: true, name: j.name || '', saved: [j.name], failed: [] }));
    });
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('x'); }
  s.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(port => {
    localStorage.setItem('up_dests', JSON.stringify([
      { id: 'gas', on: true, url: 'http://127.0.0.1:' + port + '/exec', folder: '', sec: 'hunter2' }]));
  }, PORT);
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof sendTrace === 'function' && typeof slog === 'function'
    && typeof traceDoc === 'function', null, { timeout: 30000 });

  console.log('1. A SECRET NEVER ENTERS THE TRACE, LET ALONE LEAVES THE PHONE');
  const red = await p.evaluate(() => {
    slog('probe-a', { err: 'fetch failed: http://h/exec?action=records&secret=hunter2&x=1' });
    slog('probe-b', { err: 'GET /exec?sec=hunter2 timed out', note: 'token=abc123&next=2' });
    const a = SLOG.filter(e => e.ev === 'probe-a').pop();
    const c = SLOG.filter(e => e.ev === 'probe-b').pop();
    return { a: a.err, b: c.err, note: c.note,
             text: slogText(10), raw: localStorage.getItem('cm_sync_log') || '' };
  });
  ok('the secret is gone from the line as STORED', !/hunter2/.test(red.a), red.a);
  ok('  from every spelling of the field', !/hunter2/.test(red.b) && !/abc123/.test(red.note),
     red.b + ' | ' + red.note);
  ok('  and the key is kept, so the line still says what failed',
     /secret=<redacted>/.test(red.a) && /action=records/.test(red.a));
  ok('  the Copy button cannot carry it either', !/hunter2/.test(red.text));
  ok('  nor the copy kept across reloads', !/hunter2|abc123/.test(red.raw));

  console.log('\n2. THE TRACE IS FILED, AND IT IS FILED SOMEWHERE OF ITS OWN');
  PUT.length = 0;
  const sent = await p.evaluate(async () => { localStorage.removeItem('cm_trace_at');
                                              return await sendTrace('test'); });
  ok('it sends', sent === true, String(sent));
  const doc = PUT.find(x => /\.json$/.test(String(x.name || '')));
  ok('  into _meta/diag, not into a round\'s folder', doc && doc.folder === '_meta/diag',
     doc && doc.folder);
  ok('  named for the phone, so two handsets never collide',
     doc && /^[A-Za-z0-9_-]+_\d{4}-\d{2}-\d{2}T/.test(doc.name), doc && doc.name);
  let body = null;
  try { body = JSON.parse(Buffer.from(String(doc.file || ''), 'base64').toString('utf8')); }
  catch (e) { try { body = JSON.parse(String(doc.file || '')); } catch (e2) {} }
  ok('  carrying the build, the phone and the lines', !!(body && body.build && body.dev
     && Array.isArray(body.lines) && body.lines.length), body && (body.build + ' / ' + body.lines.length + ' lines'));
  ok('  and no secret survived into the document',
     !/hunter2|abc123/.test(JSON.stringify(body || {})));

  console.log('\n3. A DIAGNOSTIC MAY NEVER COST AN INSPECTION');
  const gate = await p.evaluate(async () => {
    const again = await sendTrace('test');          // straight after one that landed
    localStorage.removeItem('cm_trace_at');
    /* Emptying up_dests is not enough — activeDests() reads the list the page
       loaded, not localStorage, so the phone would still have somewhere to
       send. The destination itself is what has to be absent. */
    const real = window.activeDests;
    window.activeDests = () => [];
    const none = await sendTrace('test');           // nowhere to send it
    window.activeDests = real;
    return { again, none, gap: TRACE_GAP };
  });
  ok('it will not send twice inside the gap', gate.again === false,
     'gap ' + Math.round(gate.gap / 60000) + ' min');
  ok('  and with no destination it is silent, not an error', gate.none === false);
  /* The wiring: it must sit AFTER the queue's own work and behind a real
     fault, or a fleet that is working would file a document per sync.
     The window and the gap allowed inside the `bad =`...`if(bad)` gate are
     both generous on purpose: the gate itself grew a third clause (an
     app-wide error count, alongside lastErr and bookFail) with an explaining
     comment, which is a legitimate widening of "something actually went
     wrong", not a change to whether the check still runs after the queue's
     own work and behind a real fault. */
  const src = fs.readFileSync(path.join(ROOT, 'mobile/index.html'), 'utf8');
  const tail = src.slice(src.indexOf('slog("run-end"'), src.indexOf('slog("run-end"') + 2600);
  ok('it is wired after the run ends, not inside it', /sendTrace\(/.test(tail));
  ok('  and only when something actually went wrong',
     /bad\s*=\s*\(lastErr[\s\S]{0,700}if\(bad\)\s*sendTrace/.test(tail.replace(/\n\s*/g, '')));
  ok('  after the queued press has been handed on',
     tail.indexOf('pressPending') < tail.indexOf('sendTrace('));

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
