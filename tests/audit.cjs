/* Regression tests for the defects found in the review. Each one fails on the
   pre-fix code. */
const http = require('http');
const { chromium } = require(require('./pw.cjs'));

let hold = null;                 // set to delay uploads, to open the edit-during-upload window
const got = [];
const srv = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') { res.writeHead(405, cors); res.end(); return; }
  // The app also GETs ?action=records to pull what the rest of the team uploaded.
  // That is not an upload — answer it, and keep it out of the upload tally.
  if (req.method === 'GET') {
    res.writeHead(200, cors);
    return res.end(JSON.stringify({ ok: true, records: [], cursor: 0, files: 0, photos: 0 }));
  }
  let b = ''; req.on('data', c => b += c);
  req.on('end', async () => {
    let j = null; try { j = JSON.parse(b); } catch (e) {}
    if (j && j.name) got.push(j.name);
    if (hold) await hold;
    if (j && /TK900/.test(j.name || '')) { res.writeHead(500, cors); res.end('{"error":"rejected"}'); return; }
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

  console.log('\n' + (fails.length ? 'FAILURES: ' + fails.join(' | ') : 'all checks passed'));
  await b.close(); srv.close(); process.exit(fails.length ? 1 : 0);
})();
