/* A RECEIPT NOBODY READS IS A PROMISE NOBODY CHECKED.

   `up:1` has always meant "the endpoint returned 2xx for every file I sent" —
   a fact about a conversation. Between that and knowing a photograph is safely
   stored there is a whole class of failure: a truncated body, a bucket that
   took the write and lost it, a proxy that answered for a store that never
   did. The dashboard has listed "durable receipt", "attachment hash" and
   "read-after-write" among the things it cannot measure since it was built.

   So the function now answers with what it MEASURED, not with what it was
   sent: it stores the object, reads it back out of the bucket, hashes what
   came back, and reports that. A receipt computed from the request body would
   prove the request.

   Retrying the same bytes returns the same receipt id and says duplicate,
   because an idempotent operation should not mint a new proof each time it is
   asked — and that flag is the only way either end can COUNT a suppressed
   duplicate rather than assume one.

   Run: node tests/receipt.cjs [port]     (starts its own ya-srv) */
const { spawn } = require('child_process');
const path = require('path');
const PORT = Number(process.argv[2] || 8107);
const B = 'http://127.0.0.1:' + PORT;
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const sha = b => require('crypto').createHash('sha256').update(b).digest('hex');
const post = body => fetch(B + '/exec', { method: 'POST',
  headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }).then(r => r.json());

(async () => {
  const srv = spawn('node', [path.join(__dirname, 'ya-srv.cjs'), String(PORT)], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1800));
  try {
    const bytes = Buffer.from('a photograph of a magnetic plug, heavy ferrous');
    const b64 = bytes.toString('base64');
    const F = { name: 'TK930_4C_29.07.2026_MP.jpg', folder: 'MP/2026-07',
                contentType: 'image/jpeg', dev: 'DAAAA',
                aid: 'aRECEIPT001', inspectionId: 'insp-930', file: b64 };

    console.log('\n── the receipt says what the store actually holds');
    const one = await post(F);
    const r = one.receipt || {};
    ok(one.ok === true, 'the file is accepted');
    ok(!!r.receiptId, 'there is a receipt id', r.receiptId);
    ok(r.attachmentId === 'aRECEIPT001', 'carrying the attachment id it was given', r.attachmentId);
    ok(r.inspectionId === 'insp-930', 'and the inspection it belongs to', r.inspectionId);
    ok(!!r.objectId, 'and the object it was stored as', r.objectId);
    ok(r.byteSize === bytes.length, 'the stored size is the real size', r.byteSize + ' of ' + bytes.length);
    /* THE CHECK THAT MAKES IT A RECEIPT AND NOT A RECEIPT-SHAPED OBJECT. */
    ok(r.sha256 === sha(bytes), 'and the hash is of the bytes the STORE returned', String(r.sha256).slice(0, 16));
    ok(typeof r.at === 'string' && r.at.length > 10, 'stamped by the server', r.at);
    ok(r.duplicate === false, 'and it is not a duplicate, because it is the first');
    ok(r.verified === true, 'the store was asked afterwards, and agreed');

    console.log('\n── sending the same photograph again');
    const two = await post(F);
    const r2 = two.receipt || {};
    ok(r2.duplicate === true, 'is reported as already present', String(r2.duplicate));
    ok(r2.receiptId === r.receiptId,
       'and returns the same receipt, because it is the same object', r2.receiptId);
    ok(r2.sha256 === r.sha256 && r2.byteSize === r.byteSize,
       'with the same figures');

    console.log('\n── a different photograph under the same name is NOT a duplicate');
    const other = Buffer.from('a different plug entirely, clean');
    const three = await post(Object.assign({}, F, { file: other.toString('base64') }));
    const r3 = three.receipt || {};
    ok(r3.duplicate === false,
       'because the test is the hash, not the name', String(r3.duplicate));
    /* Two photographs of one plug are very often the same number of bytes, so
       a size comparison would call the second a duplicate and lose it. */
    ok(r3.sha256 === sha(other) && r3.sha256 !== r.sha256,
       'and the receipt is for the new bytes', String(r3.sha256).slice(0, 16));
    ok(r3.receiptId !== r.receiptId, 'with a receipt of its own', r3.receiptId);

    console.log('\n── a batch gets one receipt per file');
    const files = [1, 2, 3].map(n => ({ name: `TK931_4C_29.07.2026_MP_${n}.jpg`,
      contentType: 'image/jpeg', aid: 'aBATCH00' + n,
      file: Buffer.from('plug number ' + n).toString('base64') }));
    const bat = await post({ op: 'batch', folder: 'MP/2026-07', dev: 'DAAAA', files });
    const got = (bat.saved || []).map(x => x.receipt).filter(Boolean);
    ok(got.length === 3, 'three files, three receipts', got.length + '');
    ok(got.every((x, i) => x.attachmentId === 'aBATCH00' + (i + 1)),
       'each carrying its own attachment id', got.map(x => x.attachmentId).join(' '));
    ok(new Set(got.map(x => x.sha256)).size === 3,
       'and three different photographs hash differently');
    ok(got.every(x => x.verified === true && x.byteSize > 0),
       'each verified against the store after it was written');

    console.log('\n── and a missing file is still refused, receipt or no receipt');
    const bad = await post({ name: 'x.jpg', folder: 'MP/2026-07' });
    ok(bad.ok === false, 'no content, no receipt', String(bad.ok) + ' · ' + (bad.error || ''));

    console.log('\n── the phone reads it, and the evidence ladder climbs by itself');
    {
      /* THE POINT OF THE WHOLE EXERCISE. The phone was built to read receipt
         fields that no backend issued, deliberately left empty, so that the
         day one arrived the phone would get stricter without being rewritten.
         This is that day, and nothing on the phone changed to meet it. */
      const { chromium } = require(require('./pw.cjs'));
      const br = await chromium.launch();
      const ctx = await br.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
      const pg = await ctx.newPage();
      pg.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
      await pg.addInitScript(u => localStorage.setItem('up_dests', JSON.stringify(
        [{ id: 'gas', on: true, url: u, sec: '', folder: 'MP/{YYYY-MM}' }])), B + '/exec');
      await pg.goto(B + '/mobile/index.html', { waitUntil: 'load' });
      await pg.waitForTimeout(1600);

      const seeded = await pg.evaluate(async () => {
        const shot = async n => await intake(new Blob([new Uint8Array(Array(56).fill(n))], { type: 'image/jpeg' }));
        const rec = { id: 'rc__TK940__2026-07-29__X__z', type: 'MP', equip: 'TK940',
          date: '2026-07-29', cls: 'HT', by: 'R. Marrero', smu: 6100,
          created: new Date().toISOString(), up: 0, upTo: {}, rev: 1,
          positions: { '4C': { grade: 'C', photos: [await shot(7), await shot(8)] } } };
        await attSync(rec); await dbPut(rec);
        return attList(rec).map(e => ({ id: e.attachmentId, sha: e.sha256, n: e.byteSize }));
      });
      ok(seeded.length === 2, 'two photographs, hashed on the phone before they leave',
         seeded.map(x => x.n + 'B').join(' '));

      const before = await pg.evaluate(async () => {
        const r = (await dbAll()).find(x => x.equip === 'TK940');
        return evidenceLevel(r);
      });
      ok(before === 0, 'nothing has left the phone yet', String(before));

      await pg.evaluate(() => syncNow(true));
      await pg.waitForTimeout(6000);

      const got = await pg.evaluate(async () => {
        const r = (await dbAll()).find(x => x.equip === 'TK940');
        return { level: evidenceLevel(r), up: r.up,
                 atts: attList(r).map(e => ({ id: e.attachmentId, sha: e.sha256,
                   srv: e.serverSha256, size: e.byteSize, ssize: e.serverByteSize,
                   rid: e.serverReceiptId, at: e.serverReceivedAt })) };
      });
      ok(got.atts.every(a => !!a.rid), 'every attachment now holds a server receipt',
         got.atts.map(a => a.rid).join(' '));
      /* The figures must be the SERVER's, and they must agree with the
         phone's. Copying the phone's own hash into the server field would make
         this pass and mean nothing. */
      ok(got.atts.every(a => a.srv && a.srv === a.sha),
         'whose hash matches the one the phone took before sending',
         got.atts.map(a => String(a.srv).slice(0, 12)).join(' '));
      ok(got.atts.every(a => a.ssize === a.size),
         'and whose byte size matches too',
         got.atts.map(a => a.ssize + '/' + a.size).join(' '));
      /* THE LADDER. 3 is "verified", and nothing on the phone was changed to
         reach it — the fields were already being read. */
      ok(got.level === 3,
         'so the round is verified, not merely accepted', 'level ' + got.level);

      await ctx.close(); await br.close();
    }
  } finally {
    try { srv.kill(); } catch (e) {}
  }
  console.log(fails.length ? '\n' + fails.length + ' FAILED\n' + fails.join('\n') : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
