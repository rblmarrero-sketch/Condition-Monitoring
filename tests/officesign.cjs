/* THE OFFICE REPORT PRINTS THE SIGNATURE, AND THE OFFICE SHOWS THE FILE THE
   FOLDER HOLDS NOW.

   Read off the office on 2026-09-13 (BL008 TEMP, a test round): the PDF
   printed the supervisor's name over an EMPTY signature line — report.js read
   rec.signUrl, which nothing on the dashboard ever set, while drive.js had
   already fetched BL008_13.09.2026_TEMP_SIGN.png beside the photographs. And
   the machine card showed the SIGNATURE where the overview photograph
   belonged: the dashboard's photo cache is keyed by the file's path, the
   bucket rewrites a path when the phone re-sends a round, and a cached copy
   was served for the life of the disk whatever the folder held since.

   This suite plants the round's real shape in the fake Drive — two point
   photographs, a machine overview, a signature — and proves:
   · CMDash.signUrlOf finds the signature, ~DEV variant first, and the
     report context carries it as signUrl, so the sign-off line has an <img>;
   · a cache entry whose length is not the index's is dropped and refetched,
     so a name shows the bytes the folder holds now, not what it held first;
   · a name fetched earlier at another length is fetched again when the index
     reports the new one (the re-sent signature).

   Run: node tests/officesign.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const crypto = require('crypto');
const PORT = Number(process.argv[2] || 8093);
const B = `http://127.0.0.1:${PORT}`;
const F = 'TEMP/BL999/2026-09-13/';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const sha12 = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12);
const put = (name, buf) => fetch(B + '/__put?key=' + encodeURIComponent(F + name), { method: 'POST', body: buf });

/* Minimal but real image bytes: a 1×1 PNG and JPEG-looking blobs of distinct
   content. The dashboard never decodes them here; it hashes and sizes them. */
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
/* A DIFFERENT LENGTH, on purpose: the folder's index carries a name, a path
   and a size, and size is what tells the office a name now holds another
   file. A retake of the same byte count would slip through — noted here so
   nobody mistakes this guard for a hash check. */
const PNG2 = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'), Buffer.from([0, 0, 0, 0])]);
const jpg = tag => Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.from('JFIF-' + tag + '-' + 'x'.repeat(200 + tag.length * 37)), Buffer.from([0xFF, 0xD9])]);
const OV = jpg('overview'), BS = jpg('bs'), HS = jpg('hs');
const sidecar = (rev, withHS) => JSON.stringify({ type: 'cm-inspection-entries', version: 2, records: [{
  id: 'TEMP__BL999__2026-09-13__DEVXX__1', rev, equip: 'BL999', date: '2026-09-13', type: 'TEMP', cls: 'GEN', by: 'R. Tester', sup: 'S. Visor', smu: 100, dev: 'DEVXX', signed: true,
  items: [
    { key: 'BS.BPC', label: 'Brake packs', grade: 3, tempV: 50, att: [{ attachmentId: 'a1', category: 'COMPONENT', mediaType: 'photo', storedName: 'BL999.BS.BPC_13.09.2026_TEMP.jpg', byteSize: BS.length, sha256: sha12(BS) }] },
    { key: '__general', label: 'Machine photographs', general: 1, grade: '', att: [{ attachmentId: 'a2', category: 'OVERVIEW', generalEvidence: 1, mediaType: 'photo', storedName: 'BL999_OVERVIEW_13.09.2026_TEMP.jpg', byteSize: OV.length, sha256: sha12(OV) }] }
  ].concat(withHS ? [{ key: 'HS.CV', label: 'Control valves', grade: 1, att: [{ attachmentId: 'a3', category: 'COMPONENT', mediaType: 'photo', storedName: 'BL999.HS.CV_13.09.2026_TEMP.jpg', byteSize: HS.length, sha256: sha12(HS) }] }] : [])
}] });

(async () => {
  await fetch(B + '/__seed');
  await put('BL999_13.09.2026_TEMP.json', Buffer.from(sidecar(2, false)));
  await put('BL999.BS.BPC_13.09.2026_TEMP.jpg', BS);
  await put('BL999_OVERVIEW_13.09.2026_TEMP.jpg', OV);
  await put('BL999_13.09.2026_TEMP_SIGN.png', PNG1);

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', ''); }, B + '/exec');
  await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2000);

  const hashOf = `async u => { const bl = await (await fetch(u)).blob(); const d = await crypto.subtle.digest('SHA-256', await bl.arrayBuffer());
      return [...new Uint8Array(d)].map(v => v.toString(16).padStart(2, '0')).join('').slice(0, 12); }`;

  console.log('1. THE SIGNATURE REACHES THE OFFICE REPORT');
  const r1 = await p.evaluate(async (hashOf) => {
    const sha = eval(hashOf);
    await CMDrive.load(() => {});
    const rec = RECS.find(r => r.equip === 'BL999' && r.type === 'TEMP');
    if (!rec) return { norec: true, n: RECS.length };
    await CMDrive.ensurePhotos([rec]);
    await new Promise(r => setTimeout(r, 500));
    const su = CMDash.signUrlOf(rec);
    const ctx = CMReport.sectionsFor ? null : null;
    const secs = await CMReport.sectionsFor('one', ekOf(rec), { photos: true, lang: 'en' });
    const html = (secs && secs.sections ? secs.sections : secs || []).map(s => s.html || '').join('\n');
    /* The approval table: the Maintenance Supervisor row carries the name
       the phone recorded and the signature as an image. */
    const m = /<table class="appr">([\s\S]*?)<\/table>/.exec(html);
    const supRow = m ? (m[1].split('<tr>').find(r => /S\. Visor/.test(r)) || '') : '';
    const gen = generalMedia(rec).map(x => x.name);
    const mach = mediaOf(rec.items.find(i => i.general), rec).map(x => x.name);
    return { signUrl: !!su, signSha: su ? await sha(su) : null,
             signImg: /<img src="(blob:|data:)/.test(supRow) && /Verified in the field/.test(supRow), sup: /S\. Visor/.test(supRow),
             gen, mach, machSha: mach.length ? await sha(mediaOf(rec.items.find(i => i.general), rec)[0].src) : null };
  }, hashOf);
  ok('CMDash.signUrlOf finds the round\'s signature file', r1.signUrl && r1.signSha === sha12(PNG1), JSON.stringify({ has: r1.signUrl, sha: r1.signSha, want: sha12(PNG1) }));
  ok('and the sign-off line of the office report carries it as an image, with the supervisor\'s name', r1.signImg && r1.sup, JSON.stringify({ img: r1.signImg, sup: r1.sup }));
  ok('the machine card shows the OVERVIEW photograph, not the signature', r1.mach.length === 1 && /OVERVIEW/.test(r1.mach[0]) && r1.machSha === sha12(OV), JSON.stringify({ mach: r1.mach, sha: r1.machSha, want: sha12(OV) }));
  ok('  and the signature is in no photograph list', !r1.gen.some(n => /SIGN/.test(n)) && !r1.mach.some(n => /SIGN/.test(n)), JSON.stringify(r1.gen));

  console.log('\n2. A CACHED COPY OF ANOTHER LENGTH IS NOT THE FILE — DROPPED AND FETCHED AGAIN');
  /* Poison the cache: the OVERVIEW path holds the signature's bytes (the
     shape seen on the office), then a fresh tab reads through the cache. */
  await p.evaluate(async (id) => { const c = await caches.open('cm-media-v1'); await c.put('/cm-media/' + id, new Response(await (await fetch(CMDash.signUrlOf(RECS.find(r => r.equip === 'BL999')))).blob())); }, F + 'BL999_OVERVIEW_13.09.2026_TEMP.jpg').catch(() => {});
  const cacheName = await p.evaluate(async () => (await caches.keys()).find(k => /media/.test(k)) || null);
  if (cacheName) await p.evaluate(async ({ id, cn }) => { const c = await caches.open(cn); const u = CMDash.signUrlOf(RECS.find(r => r.equip === 'BL999')); await c.put('/cm-media/' + id, new Response(await (await fetch(u)).blob())); }, { id: F + 'BL999_OVERVIEW_13.09.2026_TEMP.jpg', cn: cacheName });
  ok('the media cache exists and was poisoned for the test', !!cacheName, cacheName || 'no cache');
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(2000);
  const r2 = await p.evaluate(async (hashOf) => {
    const sha = eval(hashOf);
    await CMDrive.load(() => {});
    const rec = RECS.find(r => r.equip === 'BL999' && r.type === 'TEMP');
    await CMDrive.ensurePhotos([rec]);
    await new Promise(r => setTimeout(r, 500));
    const m = mediaOf(rec.items.find(i => i.general), rec);
    return { name: m[0] && m[0].name, sha: m[0] ? await sha(m[0].src) : null };
  }, hashOf);
  ok('after a reload the machine card shows the folder\'s overview bytes, not the poisoned cache', r2.sha === sha12(OV), JSON.stringify({ got: r2.sha, want: sha12(OV), name: r2.name }));

  console.log('\n3. A FILE THE PHONE RE-SENT UNDER THE SAME NAME IS FETCHED AGAIN');
  await put('BL999_13.09.2026_TEMP.json', Buffer.from(sidecar(3, true)));
  await put('BL999.HS.CV_13.09.2026_TEMP.jpg', HS);
  await put('BL999_13.09.2026_TEMP_SIGN.png', PNG2);
  const r3 = await p.evaluate(async (hashOf) => {
    const sha = eval(hashOf);
    /* The index is what says a file changed; the load refreshes it. */
    await CMDrive.load(() => {});
    const rec = RECS.find(r => r.equip === 'BL999' && r.type === 'TEMP');
    await CMDrive.ensurePhotos([rec]);
    await new Promise(r => setTimeout(r, 500));
    const su = CMDash.signUrlOf(rec);
    return { sha: su ? await sha(su) : null, rev: rec.rev, hs: !!(rec.items || []).find(i => i.key === 'HS.CV') };
  }, hashOf);
  ok('the new signature is shown in the same tab, without a reload', r3.sha === sha12(PNG2), JSON.stringify({ got: r3.sha, want: sha12(PNG2), was: sha12(PNG1) }));
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
