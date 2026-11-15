/* ONE ROUND A MACHINE, A TYPE AND A DAY ON ONE PHONE (build 635).

   EX019, 15.11.2026: phone DRGZCS walked two General Inspections of EX019 the
   same morning. The record goes up as <unit>_<date>_<type>.json, so the second
   one (05:48) replaced the first one's record on the server: the first round's
   eight photographs (HS.MP, OC.SE) stayed in the folder, its findings did not,
   and the office saw one inspection with one point.

     1. A second round of the same type on the same machine the same day joins
        the round already saved (one record, both rounds' points, the next
        revision), and the inspector is told so.
     2. Rounds already split on a phone are joined at the next start
        (twinMerge): the newest keeps its id and takes the older one's other
        points, goes up again, and the older record goes. Another phone's
        round, another type and another day are left alone.
   Run: node tests/twinround.cjs   (starts its own server on 8491) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8491);
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const srv = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
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
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]'); localStorage.setItem('cm_resume_silent', '0'); });
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof twinMerge === 'function' && typeof reArmForSave === 'function', null, { timeout: 20000 });
  await p.waitForTimeout(2000);

  async function walk(i, grade, comment) {
    await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
    await p.waitForTimeout(200);
    await p.evaluate(() => selectEquip('TK151'));
    await p.waitForTimeout(200);
    await p.evaluate(() => openHdr());
    await p.fill('#inspector', 'R. Marrero');
    await p.evaluate(({ i, grade, comment }) => {
      const mk = (n) => attWrap(new File([new Uint8Array([n, n, n, n, n, n])], 'x.jpg', { type: 'image/jpeg' }));
      curItem = items().map(x => x.k)[i]; const pos = curP(); pos.photos ||= [];
      addPos(pos, mk(10 + i), 'COMPONENT'); pos.grade = grade; document.getElementById('comment').value = comment;
      if (grade >= 3) { pos.defect = pos.defect || 'x'; }
      saveCur();
    }, { i, grade, comment });
    await p.evaluate(PLANT);
    await p.evaluate(() => goStep(3));
    await p.waitForTimeout(200);
    await p.click('#saveBtn');
    await p.waitForTimeout(1200);
    const dlg = await p.evaluate(() => { const d = document.querySelector('dialog[open]'); const t = d ? d.innerText : ''; if (d && d.close) d.close(); return t; });
    return dlg;
  }

  console.log('1. a second round the same day joins the first');
  const keys = await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); selectEquip('TK151'); return items().map(x => x.k); });
  await p.evaluate(() => { resetForm(); });
  const d1 = await walk(0, 1, 'first round');
  const first = await p.evaluate(async () => (await dbAll()).filter(r => r.type === 'MP').map(r => ({ id: r.id, rev: r.rev, k: Object.keys(r.positions), c: Object.values(r.positions).map(x => x.comment).filter(Boolean) })));
  ok(first.length === 1, 'the first round is saved', JSON.stringify(first));
  const d2 = await walk(1, 1, 'second round');
  const both = await p.evaluate(async () => (await dbAll()).filter(r => r.type === 'MP').map(r => ({ id: r.id, rev: r.rev, k: Object.keys(r.positions),
    c: Object.values(r.positions).map(x => x.comment).filter(Boolean), ph: Object.values(r.positions).flatMap(x => (x.photos || []).map(f => f.size)) })));
  ok(both.length === 1, 'one round in the store, not two', JSON.stringify(both));
  ok(both[0] && first[0] && both[0].id === first[0].id && both[0].rev === 2, 'the first round, at revision 2', JSON.stringify(both[0]));
  ok(both[0] && both[0].k.includes(keys[0]) && both[0].k.includes(keys[1]), 'holding the points of both rounds', JSON.stringify(both[0] && both[0].k));
  ok(both[0] && both[0].c.includes('first round') && both[0].c.includes('second round'), 'and both rounds’ comments', JSON.stringify(both[0] && both[0].c));
  ok(both[0] && both[0].ph.includes(6), 'and the photographs', JSON.stringify(both[0] && both[0].ph));
  ok(/already saved/i.test(d2) && /TK151/.test(d2), 'the inspector is told the points were added to today’s round', d2.slice(0, 200));
  ok(!/already saved/i.test(d1), 'the first save says nothing about joining', d1.slice(0, 120));

  console.log('2. rounds already split on a phone are joined at the next start');
  const merged = await p.evaluate(async () => {
    for (const r of await dbAll()) await dbDel(r.id);
    const ph = (n) => new File([new Uint8Array([n, n, n])], 'p' + n + '.jpg', { type: 'image/jpeg' });
    const base = { type: 'INSP', equip: 'EX019', date: '2026-11-15', dev: DEVICE, cls: 'EXC', by: 'B.K.', up: 1, upTo: {}, phv: 2 };
    await dbPut(Object.assign({}, base, { id: 'INSP__EX019__2026-11-15__' + DEVICE + '__1', created: '2026-11-15T05:30:00.000Z', rev: 1,
      sent: { gas: { 'EX019_15.11.2026_INSP.json': 100 } },
      positions: { 'HS.MP': { grade: 3, comment: 'old MP', photos: [ph(1)] }, 'OC.SE': { grade: 1, photos: [ph(2)] }, 'HS.DL': { grade: 1, comment: 'old DL' } } }));
    await dbPut(Object.assign({}, base, { id: 'INSP__EX019__2026-11-15__' + DEVICE + '__2', created: '2026-11-15T05:48:50.000Z', rev: 1,
      sent: { gas: { 'EX019_15.11.2026_INSP.json': 100 } },
      positions: { 'HS.DL': { grade: 3, comment: 'new DL' } } }));
    /* left alone: another phone, another type, another day */
    await dbPut(Object.assign({}, base, { id: 'INSP__EX019__2026-11-15__DOTHER__3', dev: 'DOTHER', created: '2026-11-15T06:00:00.000Z', rev: 1, positions: { 'X': { grade: 1 } } }));
    await dbPut(Object.assign({}, base, { id: 'MP__EX019__2026-11-15__' + DEVICE + '__4', type: 'MP', created: '2026-11-15T06:10:00.000Z', rev: 1, positions: { '1': { grade: 1 } } }));
    await dbPut(Object.assign({}, base, { id: 'INSP__EX019__2026-11-14__' + DEVICE + '__5', date: '2026-11-14', created: '2026-11-14T06:10:00.000Z', rev: 1, positions: { 'Y': { grade: 1 } } }));
    const realSync = window.syncNow; window.syncNow = async () => {};
    const n = await twinMerge();
    window.syncNow = realSync;
    const all = await dbAll();
    const keep = all.find(r => r.id.endsWith('__2'));
    return { n, ids: all.map(r => r.id).sort(), keep: keep && { rev: keep.rev, up: keep.up, sent: !!keep.sent, k: Object.keys(keep.positions).sort(),
      dl: keep.positions['HS.DL'] && keep.positions['HS.DL'].comment, mp: keep.positions['HS.MP'] && keep.positions['HS.MP'].comment,
      ph: (keep.positions['HS.MP'] && keep.positions['HS.MP'].photos || []).length } };
  });
  ok(merged.n === 1, 'one pair joined', JSON.stringify(merged));
  ok(!merged.ids.some(i => i.endsWith('__1')), 'the older record is gone', JSON.stringify(merged.ids));
  ok(merged.keep && merged.keep.k.join(',') === 'HS.DL,HS.MP,OC.SE', 'the newest holds every point of both', JSON.stringify(merged.keep));
  ok(merged.keep && merged.keep.dl === 'new DL' && merged.keep.mp === 'old MP' && merged.keep.ph === 1, 'a point in both keeps the newest; the older one’s other points keep their photographs', JSON.stringify(merged.keep));
  ok(merged.keep && merged.keep.rev === 2 && merged.keep.up === 0 && !merged.keep.sent, 'and it goes up again (revision 2, not sent)', JSON.stringify(merged.keep));
  ok(['__3', '__4', '__5'].every(s => merged.ids.some(i => i.endsWith(s))), 'another phone’s round, another type and another day are left alone', JSON.stringify(merged.ids));
  const again = await p.evaluate(async () => { window.syncNow = async () => {}; return twinMerge(); });
  ok(again === 0, 'run again, nothing more to join', again);

  ok(!errs.length, 'no page errors', errs.join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
