/* EVERY PHONE BELONGS TO A NAMED PERSON, AND EVERY ROUND SAYS WHOSE PHONE FILED IT.

   Audit of 2026-10-01: "Inspected by" is typed per round and nothing checks
   it; the durable identity under every record is a random device id, which
   names a phone, not a person. With 20–50 people that is not accountability.
   The decision (delegated): assign each phone to a person once, at setup —
   the device id already exists and the office already has a Device activity
   table; a roster would be a second list somebody has to keep.

   Proves, through the real page and a real Save:
     - an unassigned phone says so on the readiness card, with a way to fix it;
     - name and badge typed in Settings persist across a reload;
     - a phone with nobody's name typed starts "Inspected by" from its holder;
     - a saved round carries holder and badge beside "Inspected by" — even when
       another name is typed — in the record and in what goes to the folder;
     - an edit keeps the holder the round was first saved with;
     - both office pages name the holder against the device.

   Run: node tests/holder.cjs   (starts its own server on 8155) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');
const ROOT = path.join(__dirname, '..');
const PORT = 8155;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('x'); }
  s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  s.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]'); });
  const boot = async () => {
    await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
    await p.waitForFunction(() => typeof holderGet === 'function' && typeof dbAll === 'function', null, { timeout: 20000 });
    await p.waitForTimeout(400);
  };
  await boot();

  console.log('\n1. A PHONE ASSIGNED TO NOBODY SAYS SO');
  await p.evaluate(() => yardCheck());
  const r1 = await p.evaluate(() => { const r = lastYard.rows.find(x => x.key === 'holder'); return r && { k: r.k, text: r.text, fix: !!r.fix }; });
  ok('the readiness card has a "whose phone" row, not ok', r1 && r1.k === 'warn', JSON.stringify(r1));
  ok('  with a fix that opens Settings', r1 && r1.fix);
  ok('  in words', r1 && /Settings|настройк/i.test(r1.text), r1 && r1.text);

  console.log('\n2. ASSIGNED IN SETTINGS, AND IT STAYS');
  await p.evaluate(() => openSettings());
  await p.fill('#holderName', 'Aidar Seitkali');
  await p.fill('#holderBadge', '10457');
  await p.evaluate(() => localStorage.removeItem('inspector'));
  await boot();
  const r2 = await p.evaluate(() => ({ h: holderGet(), name: $('holderName').value, badge: $('holderBadge').value, insp: $('inspector').value }));
  ok('name and badge survive a reload', r2.h && r2.h.name === 'Aidar Seitkali' && r2.h.badge === '10457' && r2.name === 'Aidar Seitkali', JSON.stringify(r2));
  ok('with nobody\'s name typed, "Inspected by" starts from the holder', r2.insp === 'Aidar Seitkali', r2.insp);
  await p.evaluate(() => yardCheck());
  const r2b = await p.evaluate(() => { const r = lastYard.rows.find(x => x.key === 'holder'); return r && { k: r.k, text: r.text }; });
  ok('the card row turns ok and names the person', r2b && r2b.k === 'ok' && /Aidar Seitkali/.test(r2b.text) && /10457/.test(r2b.text), JSON.stringify(r2b));

  console.log('\n3. A SAVED ROUND CARRIES WHOSE PHONE FILED IT — EVEN WITH ANOTHER NAME TYPED');
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(200);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(200);
  await p.evaluate(() => openHdr());
  await p.waitForTimeout(200);
  await p.fill('#inspector', 'B. Ivanov');        // somebody else walked it on this phone
  await p.evaluate(() => {
    const pos = curP(); pos.photos ||= [];
    addPos(pos, attWrap(new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])], 'a.jpg', { type: 'image/jpeg' })), 'COMPONENT');
    pos.grade = 1;
  });
  await p.evaluate(PLANT);
  await p.evaluate(() => goStep(3));
  await p.waitForTimeout(200);
  await p.click('#saveBtn');
  await p.waitForTimeout(1500);
  await p.click('#dlgOk').catch(() => {});
  const rec = await p.evaluate(async () => {
    const r = (await dbAll()).find(x => x.equip === 'TK151' && x.type === 'MP');
    return r && { by: r.by, holder: r.holder, badge: r.holderBadge, exp: recToExport(r) };
  });
  ok('the round was saved', !!rec, JSON.stringify(rec).slice(0, 200));
  ok('"Inspected by" is what was typed', rec && rec.by === 'B. Ivanov', rec && rec.by);
  ok('the holder and badge travel with it', rec && rec.holder === 'Aidar Seitkali' && rec.badge === '10457', rec && JSON.stringify([rec.holder, rec.badge]));
  ok('and in what goes to the folder', rec && rec.exp.holder === 'Aidar Seitkali' && rec.exp.holderBadge === '10457', rec && JSON.stringify([rec.exp.holder, rec.exp.holderBadge]));

  console.log('\n4. AN EDIT KEEPS THE HOLDER THE ROUND WAS FIRST SAVED WITH');
  await p.fill('#holderName', 'Somebody Else').catch(async () => { await p.evaluate(() => openSettings()); await p.fill('#holderName', 'Somebody Else'); });
  const kept = await p.evaluate(async () => {
    const r = (await dbAll()).find(x => x.equip === 'TK151' && x.type === 'MP');
    editRecord(r);
    await new Promise(res => setTimeout(res, 400));
    goStep(3);
    await new Promise(res => setTimeout(res, 200));
    document.getElementById('saveBtn').click();
    await new Promise(res => setTimeout(res, 1500));
    const after = (await dbAll()).filter(x => x.equip === 'TK151' && x.type === 'MP');
    return after.map(x => ({ rev: x.rev, holder: x.holder }));
  });
  ok('the corrected round still names the phone it was walked on', kept.length === 1 && kept[0].rev >= 2 && kept[0].holder === 'Aidar Seitkali', JSON.stringify(kept));
  ok('no page errors on the phone', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
  await ctx.close();

  console.log('\n5. THE OFFICE NAMES THE PERSON AGAINST THE DEVICE');
  for (const file of ['dashboard', 'dashboard-next']) {
    const dc = await b.newContext({ viewport: { width: 1366, height: 900 } });
    const d = await dc.newPage();
    const derrs = []; d.on('pageerror', e => derrs.push(e.message));
    await d.goto(`http://127.0.0.1:${PORT}/${file}/index.html`, { waitUntil: 'load' });
    await d.waitForFunction(() => window.CMDash, null, { timeout: 15000 });
    await d.evaluate(() => CMDash.importRecords([
      { equip: 'TK151', date: '2026-09-30', type: 'MP', by: 'B. Ivanov', dev: 'DHOLD1', holder: 'Aidar Seitkali', holderBadge: '10457', created: '2026-09-30T08:00:00Z', items: [{ key: '4C', label: 'x', grade: 1 }] },
      { equip: 'TK152', date: '2026-09-29', type: 'MP', by: 'C. Nurlan', dev: 'DNOBODY', created: '2026-09-29T08:00:00Z', items: [{ key: '4C', label: 'x', grade: 1 }] }], 'x.json'));
    const rows = await d.evaluate(() => deviceActivity().map(x => ({ dev: x.dev, holder: x.holder, badge: x.holderBadge })));
    ok(`${file}: deviceActivity carries the holder of each device`, rows.some(r => r.dev === 'DHOLD1' && r.holder === 'Aidar Seitkali' && r.badge === '10457') && rows.some(r => r.dev === 'DNOBODY' && !r.holder), JSON.stringify(rows));
    await d.evaluate(() => showTab('sync'));
    await d.waitForTimeout(600);
    const tbl = await d.evaluate(() => { const t = document.getElementById('syDevTbl'); return t ? t.textContent : ''; });
    ok(`${file}: the Device activity table has an "Assigned to" column naming the person`, /Assigned to/.test(tbl) && /Aidar Seitkali/.test(tbl), tbl.slice(0, 200));
    ok(`${file}: and says "not assigned" where nobody is`, /not assigned/.test(tbl), tbl.slice(0, 300));
    ok(`${file}: no page errors`, derrs.length === 0, derrs.slice(0, 2).join(' | ') || 'none');
    await dc.close();
  }

  await b.close(); srv.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); srv.close(); process.exit(1); });
