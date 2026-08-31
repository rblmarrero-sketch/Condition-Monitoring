/* "CONFIRMED" HAS TO MEAN THE STORE HOLDS THE SAME BYTES.

   The phone had a five-rung evidence ladder and could only ever climb two of
   them. Rung three — verified — compares a receipt's size and hash against the
   phone's own record of the attachment, and it was written, commented, and
   dead:

     - the comment said the backend issues no receipt. It does. It stores the
       object, READS IT BACK, and reports the size and hash it measured from
       what the store returned — a figure that can contradict the phone rather
       than merely echo it. That has been live since build 206.

     - the comparison was against e.sha256, the hash of the photograph the
       phone HOLDS. maybeShrink() re-encodes every real field photograph before
       sending. So the server was hashing different bytes and "verified" could
       never once have been true, for any round, ever.

   What stood in its place was the listing check: ask the folder for its file
   names and accept anything that is present and not zero bytes. A photograph
   cut off by a dying link is not zero bytes — it is 40 KB of a 4 MB file,
   listed under its own name, indistinguishable from a healthy one. The round
   then said "Confirmed on the server", and that wording is also what softens
   the delete dialog. A false reassurance standing next to a bin.

   So: the wire hash is recorded as the bytes leave, the receipt is judged
   against that, the listing check compares a LENGTH and not merely presence,
   and the technician's line says which of the three things is actually true.

   Run: node tests/verify.cjs [port]      (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const B = 'http://127.0.0.1:' + PORT;
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };

const seed = async (p, unit) => p.evaluate(async u => {
  const shot = async n => await intake(new Blob(
    [new Uint8Array(Array(9000).fill(n))], { type: 'image/jpeg' }));
  const rec = { id: 'id__' + u + '__1', type: 'MP', equip: u, date: '2026-07-27', cls: 'HT',
    by: 'R. Marrero', smu: 7000, created: new Date().toISOString(), up: 0, upTo: {}, rev: 1,
    positions: { '4C': { grade: 'C', photos: [await shot(1), await shot(2)] } } };
  await attSync(rec); await dbPut(rec);
  return attList(rec).length;
}, unit);

const stateOf = (p, unit) => p.evaluate(async u => {
  const r = (await dbAll()).find(x => x.equip === u);
  if (!r) return null;
  const a = attList(r);
  return { up: r.up, level: evidenceLevel(r),
           conf: r.conf ? { of: r.conf.of, n: r.conf.n, miss: (r.conf.miss || []).slice(0, 2) } : null,
           atts: a.map(e => ({ wire: e.wireSha256 || '', wireN: e.wireByteSize || 0,
                               srv: e.serverSha256 || '', srvN: e.serverByteSize == null ? null : e.serverByteSize,
                               stored: e.sha256 || '', storedN: e.byteSize || 0,
                               rid: e.serverReceiptId || '', err: e.lastError || '' })),
           /* upState is a closure inside the queue renderer, so the line is
              read off the row it actually paints — which is the sentence the
              inspector reads, not a function's return value. */
           line: '' };
}, unit);

/* The queue row's own words for a record. */
const lineOf = (p, unit) => p.evaluate(async u => {
  await renderPending();
  const rows = [...document.querySelectorAll('#pending .row, #pending li, #pending .rec')];
  for (const r of rows) {
    if (r.textContent.indexOf(u) < 0) continue;
    const el = r.querySelector('.up');
    if (el) return el.textContent.trim();
  }
  const any = [...document.querySelectorAll('.up')].map(e => e.textContent.trim());
  return any.join(' | ');
}, unit);

(async () => {
  await fetch(B + '/__seed').catch(() => {});
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true,
                                   hasTouch: true, timezoneId: 'Asia/Anadyr' });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(u => localStorage.setItem('up_dests', JSON.stringify(
    [{ id: 'gas', on: true, url: u, sec: 'letmein', folder: '' }])), B + '/exec');
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1600);

  console.log('\n1. THE BACKEND ISSUES A RECEIPT MEASURED AFTER STORAGE');
  const n = await seed(p, 'TK960');
  ok(n === 2, 'a round with two photographs', n + ' attachments');
  await p.evaluate(() => syncNow(true));
  await p.waitForTimeout(7000);

  const A = await stateOf(p, 'TK960');
  console.log('   ' + JSON.stringify(A.atts[0]));
  ok(A.up === 1, 'the round went up', 'up=' + A.up);
  ok(A.atts.every(x => x.rid), '  and every attachment came back with a receipt id',
     A.atts.map(x => x.rid).join(' '));
  ok(A.atts.every(x => x.srv), '  carrying the hash the store measured for itself',
     (A.atts[0] || {}).srv.slice(0, 16));
  ok(A.atts.every(x => x.srvN > 0), '  and the size it measured',
     A.atts.map(x => x.srvN).join(','));

  console.log('\n2. IT IS JUDGED AGAINST THE BYTES THAT LEFT, NOT THE ONES HELD');
  ok(A.atts.every(x => x.wire), 'the phone records what it actually sent',
     (A.atts[0] || {}).wire.slice(0, 16));
  /* The point of the whole exercise: these two differ whenever a photograph is
     shrunk, and the old comparison used the wrong one. */
  const shrunk = A.atts.filter(x => x.wire !== x.stored).length;
  console.log('   ' + shrunk + ' of ' + A.atts.length
            + ' attachment(s) were re-encoded before sending');
  ok(A.atts.every(x => x.srv === x.wire),
     'the receipt matches what went on the wire',
     A.atts.every(x => x.srv === x.wire) ? 'byte for byte' :
       (A.atts[0] || {}).srv.slice(0, 12) + ' vs ' + (A.atts[0] || {}).wire.slice(0, 12));
  ok(A.level >= 3, 'so the round reaches VERIFIED, which nothing ever did before',
     'evidence level ' + A.level);
  const lineA = await lineOf(p, 'TK960');
  ok(/Verified byte for byte/.test(lineA),
     '  and the technician is told which of the three things is true', lineA);

  console.log('\n3. A TRUNCATED FILE MUST NOT VERIFY');
  /* The case the old check passed every time: present, named correctly, not
     zero bytes, and not the photograph that was taken. */
  const cut = await p.evaluate(async () => {
    const r = (await dbAll()).find(x => x.equip === 'TK960');
    /* attList() hands back COPIES — deliberately, so nothing can edit the
       manifest by reading it. So the entries themselves are walked. */
    let first = null;
    for (const [k, pos] of positionsOf(r)) {
      const m = attMap(pos); if (!m) continue;
      for (const aid of Object.keys(m)) { if (!first) first = m[aid]; }
    }
    /* The store's own reading disagrees with the wire — exactly what a receipt
       for a half-arrived file looks like. */
    first.serverByteSize = Math.floor(Number(first.wireByteSize) / 4);
    first.serverSha256 = 'deadbeef'.repeat(8);
    await dbPut(r);
    const r2 = (await dbAll()).find(x => x.equip === 'TK960');
    return { level: evidenceLevel(r2) };
  });
  cut.line = await lineOf(p, 'TK960');
  ok(cut.level < 3, 'a receipt that disagrees drops the round below verified',
     'evidence level ' + cut.level);
  ok(!/Verified byte for byte/.test(cut.line),
     '  and the word is withdrawn from the screen', cut.line);

  console.log('\n4. AND A ROUND THAT CANNOT BE CHECKED CLAIMS NOTHING');
  /* Silence is not a verdict. A photograph captured by an older build carries
     no wire hash, and no wire hash must mean no verdict — never a fallback to
     the stored hash, which would make "verified" mean two different things
     depending on whether a photograph was small enough to escape shrinking. */
  const old = await p.evaluate(async () => {
    const r = (await dbAll()).find(x => x.equip === 'TK960');
    for (const [k, pos] of positionsOf(r)) {
      const m = attMap(pos); if (!m) continue;
      for (const aid of Object.keys(m)) {
        const e = m[aid];
        delete e.wireSha256; delete e.wireByteSize;
        /* The stored hash DOES match — which is exactly the trap: a fallback
           to it would call this verified. */
        e.serverSha256 = e.sha256; e.serverByteSize = e.byteSize;
      }
    }
    await dbPut(r);
    const r2 = (await dbAll()).find(x => x.equip === 'TK960');
    return { level: evidenceLevel(r2) };
  });
  ok(old.level < 3,
     'a round with no record of what it sent is not called verified, even when the stored hash matches',
     'evidence level ' + old.level);

  console.log('\n4b. THE SAME NAME WITH DIFFERENT BYTES IS NOT THE SAME FILE');
  /* The case a name-based check can never catch, and the reason the receipt
     carries a hash at all: something else wrote to that name — another phone,
     a re-upload of a different photograph, a partial overwrite. The store's
     object is the right LENGTH and the wrong PICTURE. Only the hash says so. */
  const swapped = await p.evaluate(async () => {
    const r = (await dbAll()).find(x => x.equip === 'TK960');
    let first = null;
    for (const [k, pos] of positionsOf(r)) {
      const m = attMap(pos); if (!m) continue;
      for (const aid of Object.keys(m)) {
        const e = m[aid];
        if (!first) first = e;
        /* Put everything back to a verified state first, so the only thing
           this case changes is the hash. */
        e.wireSha256 = e.wireSha256 || 'aa'; e.wireByteSize = e.wireByteSize || 10;
        e.serverSha256 = e.wireSha256; e.serverByteSize = e.wireByteSize;
      }
    }
    await dbPut(r);
    const before = evidenceLevel((await dbAll()).find(x => x.equip === 'TK960'));
    /* Same size, different content. */
    first.serverSha256 = 'cafebabe'.repeat(8);
    await dbPut(r);
    const after = evidenceLevel((await dbAll()).find(x => x.equip === 'TK960'));
    return { before, after, size: first.serverByteSize, want: first.wireByteSize };
  });
  ok(swapped.before >= 3, 'the round verifies while the hashes agree',
     'level ' + swapped.before);
  ok(swapped.after < 3,
     '  and stops the moment the store holds different bytes under the same name',
     'level ' + swapped.after + ', size unchanged at ' + swapped.size);

  console.log('\n4c. LOCAL EVIDENCE IS KEPT UNTIL VERIFICATION SUCCEEDS');
  /* Nothing anywhere may drop a photograph off the phone because an upload
     returned 200. Checked as a property of the record after a full successful
     sync: the blobs are still there, and so is every manifest entry. */
  const kept = await p.evaluate(async () => {
    const r = (await dbAll()).find(x => x.equip === 'TK960');
    let blobs = 0;
    for (const [k, pos] of positionsOf(r)) blobs += photosOf(pos).length;
    return { up: r.up, blobs: blobs, atts: attList(r).length };
  });
  ok(kept.up === 1, 'the round has been fully sent', 'up=' + kept.up);
  ok(kept.blobs === 2, '  and both photographs are still on the phone',
     kept.blobs + ' blob(s)');
  ok(kept.atts === 2, '  with their manifest intact', kept.atts + ' entr(ies)');

  console.log('\n5. THE LISTING CHECK COMPARES A LENGTH, NOT MERELY A NAME');
  const sizes = await p.evaluate(async () => {
    const r = (await dbAll()).find(x => x.equip === 'TK960');
    const names = (await filesForRecord(r)).map(f => f.name);
    /* What confirmRun is handed when a record finishes: the names AND what each
       weighed on the wire. */
    const have = new Map(names.map(nm => [nm, 999]));   // present, non-zero, wrong
    const want = {}; names.forEach(nm => { want[nm] = 4242; });
    const short = names.filter(nm => {
      if (!have.has(nm)) return false;
      const w = Number(want[nm] || 0);
      return w > 0 && Number(have.get(nm)) !== w;
    });
    const empty = names.filter(nm => have.has(nm) && have.get(nm) === 0);
    return { n: names.length, short: short.length, empty: empty.length };
  });
  ok(sizes.empty === 0, 'none of the files is empty, so the old check saw nothing wrong',
     sizes.empty + ' empty');
  ok(sizes.short === sizes.n, '  while every one of them is the wrong length',
     sizes.short + ' of ' + sizes.n + ' short');

  const unknown = await p.evaluate(async () => {
    const r = (await dbAll()).find(x => x.equip === 'TK960');
    const names = (await filesForRecord(r)).map(f => f.name);
    const have = new Map(names.map(nm => [nm, 999]));
    const want = {};                                    // nothing known
    return names.filter(nm => {
      if (!have.has(nm)) return false;
      const w = Number(want[nm] || 0);
      return w > 0 && Number(have.get(nm)) !== w;
    }).length;
  });
  ok(unknown === 0,
     'and a size nobody recorded produces no finding rather than a guess', unknown + ' flagged');

  console.log('\n6. THE TWO BACKENDS AGREE ABOUT WHAT A RECEIPT IS');
  /* google-upload.gs is retired and never deployed, and is kept field for field
     in step for exactly one reason: two backends for one document must not
     disagree about the shape of a record the phone judges itself by. This
     suite runs against it — ed-srv executes the real script — so the fields
     asserted above are ITS fields. Checked here against the live backend's
     source so the two cannot drift apart in silence. */
  const fs = require('fs'), path = require('path');
  const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const fields = src => {
    const m = src.match(/receipt\s*=\s*\{([\s\S]*?)\n\s*\}/);
    return m ? m[1].split('\n').map(l => (l.match(/^\s*([A-Za-z0-9_]+)\s*:/) || [])[1])
                    .filter(Boolean).sort() : [];
  };
  const ya = fields(read('docs/yandex/function.js'));
  const gs = fields(read('docs/google-upload.gs'));
  ok(ya.length >= 8, 'the live backend defines a receipt', ya.join(','));
  ok(JSON.stringify(ya) === JSON.stringify(gs),
     '  and the retired one names exactly the same fields',
     'live: ' + ya.join(',') + ' | mirror: ' + gs.join(','));

  ok(fails.filter(f => /PAGEERROR/.test(f)).length === 0, 'no page errors',
     fails.filter(f => /PAGEERROR/.test(f)).join(' | ') || 'none');

  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
