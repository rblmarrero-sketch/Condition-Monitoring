/* A PHOTOGRAPH IDENTIFIED BY WHERE IT SITS IN AN ARRAY IS NOT IDENTIFIED.

   The upload name was built as <UNIT>_<POINT>_<DATE>_<TYPE>_<i+1>.jpg, with i
   the photograph's position in p.photos. Measured on v195:

     three photographs        ->  _1.jpg  _2.jpg  _3.jpg
     delete the middle one    ->  _1.jpg  _2.jpg

   The photograph that was _3 is now _2. On the next upload it OVERWRITES a
   different plug position on the server, and the orphaned _3 from the earlier
   upload stays there for ever. Two components, one of them silently replaced,
   and not one count on any screen changes.

   Every photograph now gets an id of its own the moment it is taken and keeps
   it through storage, reload, deletion of its neighbours, export and
   re-import. The id rides on the File name — File extends Blob, survives
   IndexedDB structured clone with its name intact, and isBlob() still answers
   true, so nothing that reads .type, .size or .arrayBuffer() had to change.

   The ordinal in the upload name comes from the manifest and is allocated
   once, so a deletion leaves a GAP. A gap is honest; a rename is a lost
   inspection.

   Run: node tests/attid.cjs        (needs tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const fails = [];
/* (condition, what it proves, evidence) — in that order. Written the other way
   round first, which put the CONDITION in the name slot and the NAME, a
   non-empty string, in the condition slot: every assertion passed, whatever
   the code did. A suite that cannot fail is not a suite. */
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

async function phone(b) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  return { ctx, p };
}
/* Three photographs on one point, captured the way the app captures them. */
const build = p => p.evaluate(async () => {
  const mk = async n => await intake(new Blob([new Uint8Array(Array(40).fill(n))], { type: 'image/jpeg' }));
  const rec = { id: 'att__TK903__2026-07-29__X__z', type: 'MP', equip: 'TK903', date: '2026-07-29',
                cls: 'HT', by: 'R. Marrero', created: new Date().toISOString(),
                positions: { '4C': { photos: [await mk(1), await mk(2), await mk(3)] } } };
  await attSync(rec);
  window.__rec = rec;
  return { ids: rec.positions['4C'].photos.map(attIdOf),
           names: (await filesForRecord(rec)).map(x => x.name) };
});

(async () => {
  const b = await chromium.launch();
  const { ctx, p } = await phone(b);

  console.log('\n── an id, minted when the shutter closes');
  const made = await build(p);
  ok(made.ids.every(Boolean) && new Set(made.ids).size === 3,
     'every photograph gets its own', JSON.stringify(made.ids));
  ok(!made.ids.some(id => /^\d+$/.test(id) || /4C|TK903|2026/.test(id)),
     'and it is not the point, the unit, the date or a number',
     JSON.stringify(made.ids));

  console.log('\n── deleting one photograph does not rename the others');
  const del = await p.evaluate(async () => {
    const before = (await filesForRecord(window.__rec)).map(x => x.name);
    window.__rec.positions['4C'].photos.splice(1, 1);          // the middle one
    const after = (await filesForRecord(window.__rec)).map(x => x.name);
    return { before, after, ids: window.__rec.positions['4C'].photos.map(attIdOf) };
  });
  /* THE CHECK THAT NAMES THE BUG. */
  ok(del.after.length === 2 && del.after[1] === del.before[2],
     'the survivor keeps the name it already had', JSON.stringify(del.after));
  ok(!del.after.includes(del.before[1]),
     'and nothing takes the deleted photograph\'s name', del.before[1]);
  ok(del.ids[0] === made.ids[0] && del.ids[1] === made.ids[2],
     'the two that remain are the two that were kept', JSON.stringify(del.ids));

  console.log('\n── and it survives everything the phone can do to it');
  const kept = await p.evaluate(async () => {
    await dbPut(window.__rec);
    const back = (await dbAll()).find(r => r.id === window.__rec.id);
    const stored = back.positions['4C'].photos.map(attIdOf);
    const round = recFromBundle(await recToBundle(back));
    const shipped = round.positions['4C'].photos.map(attIdOf);
    /* A retry re-reads and re-names the same record: no new identity may
       appear, or one photograph becomes two on the server. */
    await attSync(back);
    const retried = back.positions['4C'].photos.map(attIdOf);
    return { stored, shipped, retried,
             names: (await filesForRecord(back)).map(x => x.name) };
  });
  ok(JSON.stringify(kept.stored) === JSON.stringify(del.ids),
     'stored and read back from IndexedDB', JSON.stringify(kept.stored));
  ok(JSON.stringify(kept.shipped) === JSON.stringify(del.ids),
     'exported and re-imported', JSON.stringify(kept.shipped));
  ok(JSON.stringify(kept.retried) === JSON.stringify(del.ids),
     'and a retry mints nothing new', JSON.stringify(kept.retried));
  ok(JSON.stringify(kept.names) === JSON.stringify(del.after),
     'so the upload names do not move either', JSON.stringify(kept.names));

  console.log('\n── the manifest says what was captured, not how many');
  const man = await p.evaluate(() => attList(window.__rec).map(e => ({
    id: e.attachmentId, v: e.schemaVersion, seq: e.seq, pt: e.pointId,
    insp: e.inspectionId, eq: e.equipmentId, ty: e.inspectionType, dt: e.inspectionDate,
    mt: e.mediaType, mime: e.mimeType, bytes: e.byteSize, sha: e.sha256,
    by: e.capturedBy, at: e.capturedAt, st: e.uploadState, tries: e.uploadAttempts })));
  ok(man.length === 3, 'one entry per attachment, including the withdrawn one',
     man.length + ' entries');
  const live = man.filter(e => del.ids.includes(e.id));
  ok(live.every(e => e.v === 1 && e.pt === '4C' && e.eq === 'TK903' && e.ty === 'MP'
                  && e.dt === '2026-07-29' && e.insp && e.mt === 'photo' && e.mime === 'image/jpeg'),
     'each carries its round, its point and its kind', JSON.stringify(live[0]));
  ok(live.every(e => e.bytes === 40 && /^[0-9a-f]{64}$/.test(e.sha || '')),
     'with a real byte size and a real SHA-256',
     live.map(e => e.bytes + 'B ' + String(e.sha).slice(0, 12)).join(' | '));
  ok(new Set(man.map(e => e.sha)).size === 3,
     'and three different photographs hash differently');
  ok(live.every(e => e.by === 'R. Marrero' && e.at && e.st === 'pending' && e.tries === 0),
     'and who took it, when, and that it has not been sent yet',
     JSON.stringify({ by: live[0].by, st: live[0].st, tries: live[0].tries }));
  /* The seq of a withdrawn attachment is never handed to another one. */
  ok(new Set(man.map(e => e.seq)).size === 3,
     'no two attachments have ever shared an ordinal', JSON.stringify(man.map(e => e.seq)));

  console.log('\n── and it goes up beside the round, not just a count');
  const pkg = await p.evaluate(async () => {
    await dbPut(window.__rec);
    const { files } = await buildPackage();
    const ent = files.find(f => f.name === 'entries.json');
    const j = JSON.parse(new TextDecoder().decode(ent.data));
    const r = (j.records || []).find(x => x.equip === 'TK903');
    return { has: !!r, atts: (r && r.attachments) || [], count: r && r.positions };
  });
  ok(pkg.has && pkg.atts.length >= 2,
     'entries.json carries the manifest', pkg.atts.length + ' attachment(s)');
  ok(pkg.atts.every(a => a.attachmentId && a.sha256 && a.byteSize),
     'with an id, a hash and a size on every one',
     JSON.stringify((pkg.atts[0] || {}).attachmentId));

  console.log('\n── what the phone is entitled to say before somebody deletes it');
  {
    /* The delete confirmation used to warn on rec.up alone, which this file
       documents as "the endpoint returned 2xx for every file I sent". A 2xx is
       a fact about a conversation. confirmRun already asks the folder what it
       really holds and writes rec.conf — and rec.conf was read in one place, a
       status line. The phone held the stronger fact and reassured on the
       weaker one, next to a bin. */
    const lv = await p.evaluate(() => {
      const base = () => ({ id: 'ev__TK904__2026-07-29__X__z', type: 'MP', equip: 'TK904',
        date: '2026-07-29', cls: 'HT', by: 'R. Marrero', created: new Date().toISOString(),
        positions: { '4C': { photos: [] } } });
      const out = {};
      let r = base();                                   out.nowhere = evidenceLevel(r);
      r = base(); r.up = 1;                             out.accepted = evidenceLevel(r);
      r = base(); r.up = 1; r.conf = { of: 2, n: 1 };   out.shortListing = evidenceLevel(r);
      r = base(); r.up = 1; r.conf = { of: 2, n: 2 };   out.listed = evidenceLevel(r);
      /* A receipt the server does not yet issue: proves the ladder reads the
         manifest, so the phone gets stricter on its own the day it lands. */
      r = base(); r.up = 1; r.conf = { of: 1, n: 1 };
      r.positions['4C'].att = { a1: { attachmentId: 'a1', sha256: 'ff', byteSize: 10,
                                      serverSha256: 'ff', serverByteSize: 10 } };
      out.verified = evidenceLevel(r);
      r.positions['4C'].att.a1.dashboardConfirmedAt = '2026-07-29T10:00:00Z';
      out.office = evidenceLevel(r);
      /* A receipt whose hash does NOT match must not count as verified. */
      const bad = base(); bad.up = 1; bad.conf = { of: 1, n: 1 };
      bad.positions['4C'].att = { a1: { attachmentId: 'a1', sha256: 'ff', byteSize: 10,
                                        serverSha256: 'ee', serverByteSize: 10 } };
      out.mismatch = evidenceLevel(bad);
      return out;
    });
    ok(lv.nowhere === 0, 'nothing sent is nowhere else', String(lv.nowhere));
    /* THE CHECK THAT NAMES THE BUG. */
    ok(lv.accepted === 1, 'a 2xx is "accepted", not "the system has it"', String(lv.accepted));
    ok(lv.shortListing === 1,
       'and a listing that came back short does not promote it', String(lv.shortListing));
    ok(lv.listed === 2, 'asking the folder and finding every file is stronger', String(lv.listed));
    ok(lv.verified === 3, 'a receipt matching size and hash is stronger again', String(lv.verified));
    ok(lv.office === 4, 'and the office resolving it by id is the top of the ladder', String(lv.office));
    ok(lv.mismatch === 2,
       'a receipt whose hash disagrees is NOT verified — it falls back to what was checked',
       String(lv.mismatch));
  }

  await ctx.close(); await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED\n' + fails.join('\n') : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
