/* Regression tests for the defects found in the review. Each one fails on the
   pre-fix code. */
const http = require('http');
const { chromium } = require(require('./pw.cjs'));

let hold = null;                 // set to delay uploads, to open the edit-during-upload window
const got = [];

/* A MOCK THAT ACCEPTS AN UPLOAD MUST LIST IT AFTERWARDS.

   This one did not, and it is the trap CLAUDE.md names by name: the phone's
   read-after-write asks the folder what it actually holds, and a backend that
   says "ok" and then lists nothing is a backend that lost the file. So no
   record was ever marked up=1 — not the rejected one, not the good ones — and
   two assertions here read as an app that cannot upload at all.

   Two things were stale, both from before the confirmation existed. Every GET
   answered with `files: 0` — a COUNT where a listing needs an ARRAY, so
   serverList() threw "list gave no files" on every read-back. And the POST
   handler forgot what it had accepted. It keeps a folder now, exactly as
   tests/mock.cjs does, and answers action=list off it; `updated` is stamped at
   acceptance because landedAnyway() requires the folder's copy to have been
   written since the request began. */
const FOLDER = [];               // what this run accepted, as the folder would hold it
let preflights = 0;              // and how many preflights it was asked to answer
const srv = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json',
                 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                 'Access-Control-Allow-Headers': 'Content-Type',
                 'Access-Control-Max-Age': '3600' };
  /* THE UPLOAD IS PREFLIGHTED, AND THIS MOCK USED TO REFUSE THE PREFLIGHT.

     It answered OPTIONS with 405, so the browser blocked every POST before it
     was made and two assertions below read as "the app cannot upload at all".
     That was not a stale mock. It was modelling Apps Script — which has only
     doGet and doPost and cannot answer a preflight — and it had been telling
     the truth since postT arrived: against a backend that refuses OPTIONS,
     nothing uploads.

     What changed under it is postT. It is an XMLHttpRequest because fetch
     cannot watch its own upload, and bounding a POST by its own idle time is
     what cured "press Sync four times" — but ATTACHING ANY LISTENER TO
     xhr.upload makes the request non-simple, so the text/plain content type no
     longer keeps it preflight-free. The invariant two comments in this repo
     still asserted ("every request stays simple, no preflight is needed")
     stopped being true at that moment, silently.

     Live it is harmless: function.js answers OPTIONS with 204 and
     Access-Control-Max-Age 3600, so it costs one round trip an hour, not one
     per file. This mock answers it the way the live backend does, and §8 below
     asserts the preflight HAPPENS, so the next person to meet it finds a
     stated fact instead of a red suite nobody reads. */
  if (req.method === 'OPTIONS') { preflights++; res.writeHead(204, cors); res.end(); return; }
  // The app also GETs ?action=records to pull what the rest of the team uploaded,
  // and ?action=list to read back what it just sent. Neither is an upload —
  // answer both, and keep them out of the upload tally.
  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://x').searchParams;
    res.writeHead(200, cors);
    if (q.get('action') === 'list') {
      return res.end(JSON.stringify({ ok: true, count: FOLDER.length, truncated: false,
        files: FOLDER.map(f => ({ name: f.name, path: f.name, id: f.id, size: f.size, updated: f.updated })) }));
    }
    return res.end(JSON.stringify({ ok: true, records: [], cursor: 0, files: 0, photos: 0 }));
  }
  let b = ''; req.on('data', c => b += c);
  req.on('end', async () => {
    let j = null; try { j = JSON.parse(b); } catch (e) {}
    if (j && j.name) got.push(j.name);
    if (hold) await hold;
    if (j && /TK900/.test(j.name || '')) { res.writeHead(500, cors); res.end('{"error":"rejected"}'); return; }
    if (j && j.name && j.file && !j.op) {
      const size = Buffer.from(String(j.file), 'base64').length;
      const had = FOLDER.find(f => f.name === j.name);
      if (had) { had.size = size; had.updated = Date.now(); }
      else FOLDER.push({ name: j.name, id: 'u' + FOLDER.length, size, updated: Date.now() });
      res.writeHead(200, cors);
      return res.end(JSON.stringify({ ok: true, name: j.name, id: j.name }));
    }
    res.writeHead(200, cors); res.end('{"ok":true}');
  });
});

const shot = async (p) => p.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 900; c.height = 700;
  c.getContext('2d').fillRect(0, 0, 900, 700);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
});

(async () => {
  await new Promise(r => srv.listen(8181, r));
  const b = await chromium.launch();
  const fails = [];
  const ok = (name, cond, detail) => {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : ''));
    if (!cond) fails.push(name);
  };

  const page = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    await p.goto('http://127.0.0.1:8099/mobile/index.html', { waitUntil: 'networkidle' });
    return { ctx, p };
  };

  // ---- 1. selecting a component must not mark it as captured ----
  console.log('\n1. empty position entries');
  {
    const { ctx, p } = await page();
    const r = await p.evaluate(() => {
      selectEquip('TK146');
      const ts = document.getElementById('typeSel'); ts.value = 'MP'; ts.dispatchEvent(new Event('change'));
      const first = items()[0].k, second = items()[1].k;
      pickComponent(first); pickComponent(second);      // just look at two components
      return { entries: Object.keys(draft.positions),
               marked: [...document.querySelectorAll('#posnav button.has')].map(x => x.dataset.pos) };
    });
    ok('no entry created by merely viewing', r.entries.length === 0, `entries=${JSON.stringify(r.entries)}`);
    ok('no component falsely shown as captured', r.marked.length === 0, `marked=${JSON.stringify(r.marked)}`);
    await ctx.close();
  }

  // ---- 2. object URLs released on re-render ----
  console.log('\n2. blob URL lifetime');
  {
    const { ctx, p } = await page();
    const r = await p.evaluate(async () => {
      let live = 0;
      const mk = URL.createObjectURL.bind(URL), rv = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = b => { live++; return mk(b); };
      URL.revokeObjectURL = u => { live--; return rv(u); };
      const c = document.createElement('canvas'); c.width = 40; c.height = 40;
      const blob = await new Promise(r2 => c.toBlob(r2, 'image/jpeg'));
      selectEquip('TK146');
      const ts = document.getElementById('typeSel'); ts.value = 'MP'; ts.dispatchEvent(new Event('change'));
      pickComponent(items()[0].k);
      curP().photos = [blob];
      for (let i = 0; i < 25; i++) renderMedia();       // 25 re-renders of one photo
      return live;
    });
    ok('renderMedia does not accumulate blob URLs', r <= 2, `live after 25 renders = ${r}`);
    await ctx.close();
  }

  // ---- 3. an edit during upload must not be lost ----
  console.log('\n3. edit while the upload is in flight');
  {
    const { ctx, p } = await page();
    await p.evaluate(() => { saveDests([{ id: 'gas', on: true, url: 'http://127.0.0.1:8181/x', sec: '', folder: '' }]); });
    let release; hold = new Promise(r => release = r);
    const res = await p.evaluate(async () => {
      // one saved record, pending upload
      const rec = { id: 'R1', cls: 'HT', type: 'MP', equip: 'TK146', date: '2026-07-31', smu: '1',
                    by: 'A', positions: { '4C': { grade: 'C' } }, created: new Date().toISOString(), up: 0, rev: 1 };
      await dbPut(rec);
      const p1 = syncNow();                                   // starts, blocks on the server
      await new Promise(r => setTimeout(r, 300));
      // inspector edits it meanwhile: new comment, marked for re-upload
      const cur = await dbGet('R1');
      cur.positions['4C'].comment = 'EDITED DURING UPLOAD';
      cur.up = 0; cur.rev = (cur.rev || 0) + 1; await dbPut(cur);
      window.__p1 = p1; return 'started';
    });
    release(); hold = null;
    await p.evaluate(() => window.__p1);
    await p.waitForTimeout(600);
    const after = await p.evaluate(async () => { const r = await dbGet('R1');
      return { comment: r.positions['4C'].comment || '', up: r.up, rev: r.rev }; });
    ok('the edit survives', after.comment === 'EDITED DURING UPLOAD', JSON.stringify(after));
    ok('record stays pending so the edit gets sent', after.up === 0, `up=${after.up}`);
    await ctx.close();
  }

  // ---- 4. one bad record must not block the rest ----
  console.log('\n4. one failing record blocking the queue');
  {
    const { ctx, p } = await page();
    await p.evaluate(() => { saveDests([{ id: 'gas', on: true, url: 'http://127.0.0.1:8181/x', sec: '', folder: '' },
                                        // a real untick keeps its URL, otherwise the built-in default refills it
                                        { id: 'pa', on: false, url: 'http://127.0.0.1:9/unused', sec: '', folder: '' }]); });
    const r = await p.evaluate(async () => {
      const mk = (id, equip, bad) => ({ id, cls: 'HT', type: 'MP', equip, date: '2026-07-31', by: 'A',
        positions: { '4C': { grade: 'C' } },
        created: new Date().toISOString(), up: 0, rev: 1 });
      await dbPut(mk('BAD', 'TK900', true));      // the server rejects this unit's files
      await dbPut(mk('G1', 'TK901', false));
      await dbPut(mk('G2', 'TK902', false));
      await syncNow();
      const all = await dbAll();
      return all.filter(x => x.up).map(x => x.id).sort();
    });
    ok('good records still upload', r.includes('G1') && r.includes('G2'), `uploaded=${JSON.stringify(r)}`);
    await ctx.close();
  }

  // ---- 5. hostile text from another phone must not become markup ----
  console.log('\n5. escaping of data arriving from another device');
  {
    const { ctx, p } = await page();
    const r = await p.evaluate(async () => {
      const rec = { id: 'X1', cls: 'HT', type: 'MP', equip: '<img src=x onerror=window.__pwned=1>',
        date: '2026-07-31', smu: '<b>zz</b>', by: 'A',
        positions: { '4C': { grade: 'C' } }, created: new Date().toISOString(), up: 0, rev: 1 };
      await dbPut(rec); await renderPending();
      return { imgs: document.querySelectorAll('#pending img:not(.thumb)').length,
               bold: document.querySelectorAll('#pending b').length,
               pwned: !!window.__pwned,
               shown: document.querySelector('#pending .meta .a').textContent.slice(0, 40) };
    });
    ok('no injected element', r.imgs === 0 && r.bold === 0, JSON.stringify(r));
    ok('no script executed', r.pwned === false);
    ok('text still displayed literally', r.shown.includes('<img'), r.shown);
    await ctx.close();
  }

  // ---- 6. a corrupt record must not break the pending list ----
  console.log('\n6. corrupt record tolerance');
  {
    const { ctx, p } = await page();
    const r = await p.evaluate(async () => {
      await dbPut({ id: 'OK1', cls: 'HT', type: 'MP', equip: 'TK146', date: '2026-07-31',
        positions: { '4C': { grade: 'C' } }, created: new Date().toISOString(), up: 0, rev: 1 });
      await dbPut({ id: 'CORRUPT', cls: 'HT', type: 'MP', equip: 'TK147', date: '2026-07-31',
        positions: { '4C': null, '4D': { photos: 'not-an-array' }, '4E': { photos: [{}] } },
        sign: 'not-a-blob', created: new Date().toISOString(), up: 0, rev: 1 });
      let err = '';
      try { await renderPending(); } catch (e) { err = String(e.message || e); }
      let files = '';
      try { files = (await filesForRecord(await dbGet('CORRUPT'))).length; } catch (e) { files = 'THREW ' + e.message; }
      return { err, rows: document.querySelectorAll('#pending .pitem').length, files };
    });
    ok('pending list still renders', r.err === '' && r.rows === 2, JSON.stringify(r));
    ok('filesForRecord skips the junk instead of throwing', r.files === 0, `files=${r.files}`);
    await ctx.close();
  }

  // ---- 7. one destination down must not strand the other ----
  console.log('\n7. partial destination failure');
  {
    const { ctx, p } = await page();
    const r = await p.evaluate(async () => {
      saveDests([{ id: 'gas', on: true, url: 'http://127.0.0.1:8181/x', sec: '', folder: '' },
                 { id: 'pa',  on: true, url: 'http://127.0.0.1:9/dead',  sec: '', folder: '' }]);
      await dbPut({ id: 'P1', cls: 'HT', type: 'MP', equip: 'TK500', date: '2026-07-31', by: 'A',
        positions: { '4C': { grade: 'C' } }, created: new Date().toISOString(), up: 0, rev: 1 });
      await syncNow();
      const a = await dbGet('P1');
      const firstRound = { upTo: Object.assign({}, a.upTo || {}), up: a.up };
      window.__sent = []; return firstRound;
    });
    ok('the working destination is recorded as done', r.upTo.gas === 1, JSON.stringify(r));
    ok('record stays pending for the failed one', r.up === 0, `up=${r.up}`);

    // a retry must not re-send to the destination that already has it
    const before = got.length;
    await p.evaluate(async () => { await syncNow(); });
    await p.waitForTimeout(300);
    ok('retry does not re-upload to the healthy destination', got.length === before,
       `requests during retry = ${got.length - before}`);
    await ctx.close();
  }

  // ---- 8. the upload is preflighted, and that is a fact about the backend ----
  console.log('\n8. the CORS preflight the upload now needs');
  /* Counted rather than assumed. If postT ever loses its upload listeners the
     preflight goes away and this fails — which is the moment to revisit the
     two backends, not months later. And if a backend is ever added that
     cannot answer OPTIONS, §4 and §7 above go red again and this line says
     why in one sentence. */
  ok('the single-file POST asked for a preflight', preflights > 0, preflights + ' OPTIONS answered');
  ok('  and every upload still landed once it was answered', FOLDER.length > 0,
     FOLDER.length + ' file(s) in the folder');
  /* Apps Script has doGet and doPost and no doOptions, so it cannot answer
     one. Asserted against the file so "switch the old backend back on" can
     never be believed to be a one-step fallback. */
  {
    const gs = require('fs').readFileSync(require('path').join(__dirname, '..', 'docs', 'google-upload.gs'), 'utf8');
    ok('  the retired Apps Script still has no doOptions, so it could not serve this client',
       !/function\s+doOptions/.test(gs), 'noted, not a defect — it is retired');
  }

  console.log('\n' + (fails.length ? 'FAILURES: ' + fails.join(' | ') : 'all checks passed'));
  await b.close(); srv.close(); process.exit(fails.length ? 1 : 0);
})();
