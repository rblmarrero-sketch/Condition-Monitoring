/* THE RECOVERY INVENTORY READS EVERYTHING, WRITES NOTHING, AND THE ZIP IT
   MAKES IS READ BACK RATHER THAN BELIEVED.

   recover.html sits outside the worker's scope so it opens whatever state
   the app is in. It lists every round on the phone with what the manifest
   claims beside what the phone can read now, and exports file by file: a
   JSON record per round, every readable photograph under the app's own
   name, and a report naming every one it could not read — with the server
   copy where a receipt says there is one.

   What has to hold:
     · the counts on screen are the counts in the database, including the
       one photograph rigged to be unreadable;
     · the exported ZIP — parsed here, entry by entry — holds every record,
       every readable photograph under its stored name, no entry for the
       dead one, and a report that names it and its server copy;
     · the source cannot write: no readwrite transaction, no put, no delete,
       no deleteDatabase, no cache deletion, no unregister;
     · afterwards the database holds exactly what it held before.

   Run: node tests/recoverinv.cjs   (starts its own server on 8532) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8532);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
/* A store-only ZIP, walked by its local headers. */
function unzip(buf) {
  const out = []; let i = 0;
  while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const size = buf.readUInt32LE(i + 18), nl = buf.readUInt16LE(i + 26), el = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nl).toString('utf8');
    const data = buf.slice(i + 30 + nl + el, i + 30 + nl + el + size);
    out.push({ name, size, data }); i += 30 + nl + el + size;
  }
  return out;
}
const BAD = 45677;

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', acceptDownloads: true });
  const rig = () => {
    window.__badSizes = [45677];
    const origAB = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () {
      if (this && window.__badSizes.indexOf(this.size) >= 0) return Promise.reject(new DOMException('A requested file or directory could not be found at the time an operation was processed.', 'NotFoundError'));
      return origAB.call(this);
    };
  };

  console.log('1. THE APP HOLDS TWO ROUNDS, ONE OF THEM WITH A PHOTOGRAPH IT CAN NO LONGER READ');
  const app = await ctx.newPage();
  await app.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await app.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await app.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  const seeded = await app.evaluate(async bad => {
    const jpg = async tag => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d');
      x.fillStyle = '#334'; x.fillRect(0, 0, 320, 240); x.fillStyle = '#fff'; x.font = '24px sans-serif'; x.fillText(tag, 20, 40);
      return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8)); };
    const sha = async blob => { const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); };
    const mk = async (id, unit, date, type, photos, up) => {
      const rec = { id, equip: unit, cls: 'EXC', type, date, by: 'Rayanov', dev: DEVICE, created: new Date().toISOString(), rev: 2, up, positions: {} };
      for (const [k, ph] of photos) rec.positions[k] = { grade: 1, photos: [ph] };
      await attSync(rec);
      await filesForRecord(rec);        // stamps storedName the way a send does
      return rec;
    };
    const good = await jpg('HYD ok'), dead = new Blob([new Uint8Array(bad)], { type: 'image/jpeg' });
    const r1 = await mk('FC__EX001__2026-09-08__DEV__1', 'EX001', '2026-09-08', 'FC', [['HYD', good], ['ENG', dead]], 0);
    /* The dead one carries a receipt: the server measured these bytes and
       kept them. sha256 is set as the app would have set it when the
       photograph could still be read. */
    const e = attMap(r1.positions.ENG)[attIdOf(r1.positions.ENG.photos[0])];
    e.sha256 = '99c56f670019ae712df18e72122a250ef591d3c2607838f0929b678aebdaeaf9'; e.byteSize = bad;
    e.uploadState = 'sent'; e.serverObjectId = 'FC/EX001/2026-09-08/' + e.storedName; e.serverByteSize = bad; e.serverSha256 = e.sha256; e.serverReceivedAt = '2026-09-08T03:10:55.004Z';
    const r2 = await mk('MP__TK151__2026-09-09__DEV__2', 'TK151', '2026-09-09', 'MP', [['1A', await jpg('plug')]], 1);
    await dbPut(r1); await dbPut(r2);
    await dbPut({ id: DRAFT_ID, type: 'INSP', equip: 'DZ003', date: '2026-09-13', positions: { 'CH.UC': { comment: 'half walked' } }, at: new Date().toISOString() });
    return { goodSha: await sha(good), names: attList(r1).map(x => x.storedName).concat(attList(r2).map(x => x.storedName)) };
  }, BAD);
  ok('seeded: three photographs across two rounds, one draft', seeded.names.length === 3, JSON.stringify(seeded.names));
  await app.close();

  console.log('\n2. THE INVENTORY COUNTS WHAT IS THERE');
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(rig);
  await page.goto(`http://127.0.0.1:${PORT}/recover.html#inventory`, { waitUntil: 'load' });
  await page.waitForFunction(() => /^\d+$/.test((document.getElementById('invN') || {}).textContent || ''), null, { timeout: 15000 });
  const inv = await page.evaluate(() => ({
    n: document.getElementById('invN').textContent, pend: document.getElementById('invPend').textContent,
    ph: document.getElementById('invPh').textContent, bad: document.getElementById('invBad').textContent,
    draft: document.getElementById('invDraft').textContent, list: document.getElementById('invList').textContent }));
  ok('two rounds, one waiting', inv.n === '2' && inv.pend === '1', JSON.stringify(inv));
  ok('  three photographs, one unreadable', inv.ph === '3' && inv.bad === '1', JSON.stringify({ ph: inv.ph, bad: inv.bad }));
  ok('  the half-walked round is reported, not touched', /DZ003 INSP · 1 position/.test(inv.draft), inv.draft);
  ok('  the list names the dead photograph and its server copy', /UNREADABLE EX001_ENG_08\.09\.2026_FC\.jpg/.test(inv.list) && /server copy: FC\/EX001\/2026-09-08\/EX001_ENG_08\.09\.2026_FC\.jpg \(45677 bytes, receipt matches/.test(inv.list), inv.list.split('\n').slice(0, 4).join(' / '));

  console.log('\n3. THE EXPORT, READ BACK ENTRY BY ENTRY');
  await page.evaluate(() => { navigator.share = undefined; navigator.canShare = undefined; });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#invExport')]);
  const zipPath = await dl.path();
  const entries = unzip(fs.readFileSync(zipPath));
  const names = entries.map(e => e.name);
  ok('the ZIP has a record per round, under type/unit/date', names.includes('FC/EX001/2026-09-08/FC__EX001__2026-09-08__DEV__1.json') && names.includes('MP/TK151/2026-09-09/MP__TK151__2026-09-09__DEV__2.json'), names.join(', '));
  ok('  the readable photographs are in it under the app\'s own names', names.includes('FC/EX001/2026-09-08/EX001_HYD_08.09.2026_FC.jpg') && names.includes('MP/TK151/2026-09-09/TK151_1A_09.09.2026_MP.jpg'), names.filter(n => /\.jpg$/.test(n)).join(', '));
  ok('  and the dead one is NOT — no placeholder', !names.some(n => /EX001_ENG/.test(n)), names.filter(n => /ENG/.test(n)).join(', ') || 'absent');
  const hyd = entries.find(e => /EX001_HYD/.test(e.name));
  ok('  the photograph\'s bytes are its bytes', !!hyd && hyd.data[0] === 0xff && hyd.data[1] === 0xd8 && require('crypto').createHash('sha256').update(hyd.data).digest('hex') === seeded.goodSha, hyd && hyd.size + ' bytes');
  const rep = entries.find(e => e.name === 'RECOVERY_REPORT.txt');
  const repTxt = rep ? rep.data.toString('utf8') : '';
  ok('  the report gives the counts', /2 inspection record\(s\) saved; 2 photo\(s\) saved; 1 photo\(s\) still require recovery/.test(repTxt), repTxt.split('\n')[1]);
  ok('  and names the dead one with its server copy', /EX001_ENG_08\.09\.2026_FC\.jpg/.test(repTxt) && /server copy: FC\/EX001\/2026-09-08\/EX001_ENG_08\.09\.2026_FC\.jpg \(45677 bytes, byte-for-byte match on receipt\)/.test(repTxt), repTxt.split('\n').slice(4, 6).join(' / '));
  const recJ = JSON.parse(entries.find(e => /FC__EX001/.test(e.name)).data.toString('utf8'));
  ok('  the record JSON carries the manifest and the per-file verdicts', recJ.record && recJ.record.positions && recJ.record.positions.ENG && recJ.files.some(f => f.readable === false && /EX001_ENG/.test(f.name)) && recJ.files.some(f => f.readable === true && f.matchesManifest === true), JSON.stringify(recJ.files.map(f => [f.name, f.readable, f.matchesManifest])));
  const said = await page.evaluate(() => document.getElementById('invLog').textContent);
  ok('  the page said the same numbers', /2 inspection record\(s\) saved; 2 photo\(s\) saved; 1 photo\(s\) still require recovery/.test(said), said.split('\n')[0]);

  console.log('\n4. IT CANNOT WRITE, AND IT DID NOT');
  const src = fs.readFileSync(path.join(ROOT, 'recover.html'), 'utf8');
  const code = src.slice(src.indexOf('<script>'));
  ok('no readwrite transaction in the source', !/readwrite/.test(code));
  ok('  no put, delete, clear or deleteDatabase on the store', !/objectStore\([^)]*\)\s*\.\s*(put|add|delete|clear)\s*\(/.test(code) && !/deleteDatabase/.test(code) && !/\.(put|add)\s*\(/.test(code));
  ok('  no cache deletion, no unregister', !/caches\s*\.\s*delete/.test(code) && !/\.unregister\s*\(/.test(code));
  const after = await page.evaluate(async () => new Promise(res => {
    const rq = indexedDB.open('plug_capture', 1);
    rq.onsuccess = () => { const g = rq.result.transaction('inspections', 'readonly').objectStore('inspections').getAll();
      g.onsuccess = () => res((g.result || []).map(r => ({ id: r.id, up: r.up, n: Object.keys(r.positions || {}).length,
        names: Object.values(r.positions || {}).flatMap(p => Object.values(p.att || {}).map(e => e.storedName)) }))); g.onerror = () => res(null); };
    rq.onerror = () => res(null);
  }));
  ok('the database holds exactly what it held: two rounds, the draft, every stored name', after && after.length === 3 && after.find(r => r.id === '__draft__')
     && JSON.stringify(after.filter(r => r.id !== '__draft__').flatMap(r => r.names).sort()) === JSON.stringify(seeded.names.slice().sort()), JSON.stringify(after));
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');

  await ctx.close(); await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
