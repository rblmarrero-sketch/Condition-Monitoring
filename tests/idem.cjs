/* SENDING THE SAME PHOTOGRAPH TWICE MUST COST ONE UPLOAD, AND SAY SO.

   A round on a bad link goes up in pieces. rec.sent remembers which pieces
   landed and the next attempt sends only the tail — which is right, and has
   been right for a long time, and was completely silent. "Retrying is
   idempotent" was a claim with no number behind it, and the dashboard listed
   "duplicates the server suppressed" among the things it cannot measure.

   This end can measure something better than a guess: every file the phone
   declined to send a second time because it already had. That is bytes that
   did not cross a satellite link, and it is checkable here.

   Also checked: that the store really does end up with one object per
   photograph however many attempts it took, that the manifest tells the truth
   about each attachment afterwards, and that the attachment's own id goes on
   the wire — because a server that suppresses duplicates for itself will need
   something better to match on than a file name.

   Run: node tests/idem.cjs [port]     (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const B = 'http://127.0.0.1:' + PORT;
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const files = () => fetch(B + '/__files').then(r => r.json());

(async () => {
  await fetch(B + '/__seed').catch(() => {});
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));

  /* Every upload body this phone sends, so the id on the wire can be read
     rather than inferred from the code that writes it. */
  const bodies = [];
  p.on('request', r => {
    if (r.method() !== 'POST' || !/\/exec/.test(r.url())) return;
    try { bodies.push(JSON.parse(r.postData() || '{}')); } catch (e) {}
  });

  await p.addInitScript(u => localStorage.setItem('up_dests', JSON.stringify(
    [{ id: 'gas', on: true, url: u, sec: 'letmein', folder: '' }])), B + '/exec');
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1600);

  console.log('\n── a round with four photographs goes up once');
  const seeded = await p.evaluate(async () => {
    const shot = async n => await intake(new Blob([new Uint8Array(Array(48).fill(n))], { type: 'image/jpeg' }));
    const rec = { id: 'id__TK920__2026-07-29__X__z', type: 'MP', equip: 'TK920', date: '2026-07-29',
      cls: 'HT', by: 'R. Marrero', smu: 6100, created: new Date().toISOString(),
      up: 0, upTo: {}, rev: 1,
      positions: { '4C': { grade: 'C', photos: [await shot(1), await shot(2)] },
                   '4D': { grade: 'B', photos: [await shot(3), await shot(4)] } } };
    await attSync(rec); await dbPut(rec);
    try { localStorage.setItem('cm_dup_skipped', JSON.stringify({ n: 0, at: Date.now() })); } catch (e) {}
    return attList(rec).map(e => e.attachmentId);
  });
  ok(seeded.length === 4, 'four attachments, four ids', seeded.length + '');
  await p.evaluate(() => syncNow(true));
  await p.waitForTimeout(6000);
  const first = await files();
  const jpgs = first.files.filter(f => /TK920.*\.jpg$/.test(f));
  ok(jpgs.length === 4, 'the store has four photographs', jpgs.length + ': ' + jpgs.join(' '));
  const sentState = await p.evaluate(async () => {
    const r = (await dbAll()).find(x => x.equip === 'TK920');
    return { up: r.up, atts: attList(r).map(e => ({ st: e.uploadState, n: e.uploadAttempts,
                                                    at: !!e.lastAttemptAt, err: e.lastError || '' })) };
  });
  ok(sentState.up === 1, 'the round is marked sent');
  ok(sentState.atts.every(a => a.st === 'sent' && a.n >= 1 && a.at && !a.err),
     'and every attachment records that it was sent, and how many tries it took',
     JSON.stringify(sentState.atts[0]));

  console.log('\n── the id goes on the wire, not just the file name');
  const withAid = bodies.filter(x => Array.isArray(x.files) && x.files.some(f => f.aid));
  const aidsSent = new Set(bodies.flatMap(x => (x.files || []).map(f => f.aid).filter(Boolean)));
  ok(withAid.length > 0, 'the upload body carries an attachment id', withAid.length + ' batch(es)');
  ok(seeded.every(a => aidsSent.has(a)),
     'and it is the id the photograph was given when it was taken',
     [...aidsSent].slice(0, 2).join(' '));

  console.log('\n── the link dies halfway, and the retry sends only the tail');
  const resumed = await p.evaluate(async () => {
    const r = (await dbAll()).find(x => x.equip === 'TK920');
    /* Exactly the state a phone is left in when the link drops mid-record:
       still unsent, but knowing what already landed. */
    const names = (await filesForRecord(r)).map(f => f.name);
    r.up = 0; r.upTo = {};
    r.sent = { gas: {} };
    names.slice(0, 3).forEach(n => { r.sent.gas[n] = 1; });
    await dbPut(r);
    const before = dupCount();
    await syncNow(true);
    return { before, names: names.length };
  });
  await p.waitForTimeout(6000);
  const after = await p.evaluate(() => dupCount());
  ok(after > resumed.before,
     'the phone counts what it did not send again', resumed.before + ' -> ' + after);
  ok(after - resumed.before >= 3,
     'one for each file it already had', (after - resumed.before) + ' suppressed');

  console.log('\n── and however many times it is retried, one object each');
  const many = await p.evaluate(async () => {
    for (let i = 0; i < 12; i++) {
      const r = (await dbAll()).find(x => x.equip === 'TK920');
      if (!r) break;
      r.up = 0; r.upTo = {};
      await dbPut(r);
      await syncNow(true);
    }
    return dupCount();
  });
  await p.waitForTimeout(4000);
  const end = await files();
  const endJpgs = end.files.filter(f => /TK920.*\.jpg$/.test(f));
  /* THE CHECK THE WHOLE THING IS FOR. */
  ok(endJpgs.length === 4,
     'thirteen attempts, four photographs, four stored objects',
     endJpgs.length + ': ' + endJpgs.join(' '));
  ok(new Set(endJpgs).size === endJpgs.length,
     'and not one of them stored twice under a second name');
  ok(many >= after, 'the suppression count only ever goes up', after + ' -> ' + many);

  await ctx.close(); await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED\n' + fails.join('\n') : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
