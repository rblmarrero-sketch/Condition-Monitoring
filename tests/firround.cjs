/* CM_FIR_V1 — the FIR in the phone app (Rickie 11.11.2026). FIR is chosen from the inspection type list (it is not a
   round: the list goes back to the round type), a 1C defect is picked (SCHED.firDefects, from build_fir_defects; a
   DD number typed by hand needs its unit), up to six photographs with a caption each, a note and a name. Saved as a
   record of type FIR through the same Save tail as every round; position keys F1, F2 ... are given once, so a
   removed photograph never renames the others. Editing from Saved reopens the FIR sheet; the phone report button is
   hidden for FIR (the FIR document is made on the office page). A 1C PM defect row offers "Start FIR". */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, new URL(req.url, 'http://x').pathname);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(fs.readFileSync(f));
});
const FIXTURE = {
  generated: '2026-11-11T00:00:00Z', byUnit: {},
  rtwOpen: [
    { wo: 'WO-0000901', equip: 'EX900', cls: 'EXC', comp: 'EX900.CH.BUC', desc: 'Bucket adapter cracked', priority: 'P1 Critical', raised: '2026-11-08', type: 'Bucket', hours: null, plan: '', status: 'Registered', request: 'DD-0000902', pmStatus: 'open' },
    { wo: 'WO-0000903', equip: 'TK900', cls: 'HT', comp: '', desc: '500 Hours service', priority: 'P3 Planned (PM)', raised: '2026-11-09', type: '500 Hours service Planned', hours: 500, plan: '2026-11-09', status: 'Registered', request: '', pmStatus: 'open' },
  ],
  firDefects: [
    { d: 'DD-0000902', u: 'EX900', s: 'EX900.CH.BUC', p: 'P1', r: '2026-11-08', x: 'Bucket adapter cracked' },
    { d: 'DD-0000904', u: 'TK900', s: 'TK900.HS.MP', p: 'P2', r: '2026-11-07', x: 'Hydraulic leak' },
    { d: 'DD-0000905', u: 'LD900', s: null, p: 'P4', r: '2026-11-10', x: 'Mirror' },
  ],
};
const jpg = (p, shade) => p.evaluate((sh) => {
  const c = document.createElement('canvas'); c.width = 320; c.height = 240;
  const g = c.getContext('2d'); g.fillStyle = sh; g.fillRect(0, 0, 320, 240);
  return c.toDataURL('image/jpeg', 0.8).split(',')[1];
}, shade);

(async () => {
  await new Promise(r => srv.listen(0, r));
  const APP = 'http://127.0.0.1:' + srv.address().port + '/mobile/index.html';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]'); });
  await p.goto(APP, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate((fx) => { SCHED = fx; schedEnsureLoaded = async () => true; }, FIXTURE);

  console.log('1. FIR is in the inspection type list and opens its own sheet');
  const before = await p.$eval('#typeSel', s => s.value);
  ok('the list carries FIR as its last option', await p.$eval('#typeSel', s => s.options[s.options.length - 1].value === 'FIR' && /Failure investigation/.test(s.options[s.options.length - 1].textContent)));
  await p.selectOption('#typeSel', 'FIR');
  await p.waitForTimeout(200);
  ok('choosing FIR opens the FIR sheet', await p.isVisible('#firOv'));
  ok('the type list goes back to the round type it had', await p.$eval('#typeSel', s => s.value) === before && await p.evaluate(() => type) === before);
  ok('FIR is not a round type (not in TYPE_ORDER)', await p.evaluate(() => TYPE_ORDER.indexOf('FIR') < 0 && !!TYPE_META.FIR.fir));

  console.log('\n2. the 1C defects, P1/P2 first, searchable; a typed number needs its unit');
  let rows = await p.$$eval('#firBody [data-fdef]', a => a.map(x => x.dataset.fdef));
  ok('every defect the phone has is listed', rows.length === 3, rows.join(','));
  ok('the count line says how many', /3 defect/.test(await p.textContent('#firList')));
  ok('save is refused until a defect is chosen', await p.$eval('#firSaveBtn', b => b.disabled) && /1C defect/.test(await p.textContent('#firHint')));
  await p.fill('#firQ', 'TK900');
  rows = await p.$$eval('#firBody [data-fdef]', a => a.map(x => x.dataset.fdef));
  ok('search narrows by unit', rows.length === 1 && rows[0] === 'DD-0000904');
  await p.fill('#firQ', 'dd 0000999'.replace(' ', '-'));
  ok('a DD number not in the list offers to use it, with a unit box', await p.isVisible('#firUnit') && await p.isVisible('[data-fman="DD-0000999"]'));
  await p.click('[data-fman="DD-0000999"]');
  ok('without a unit it is not taken', await p.evaluate(() => !firDraft.def));
  await p.fill('#firUnit', 'gr900'); await p.click('[data-fman="DD-0000999"]');
  ok('with a unit it is taken, unit upper-cased', await p.evaluate(() => firDraft.def && firDraft.def.d === 'DD-0000999' && firDraft.def.u === 'GR900'));
  await p.click('#firDefChange');
  await p.fill('#firQ', '');
  await p.click('[data-fdef="DD-0000904"]');
  ok('picking a defect shows it with its unit and system', /DD-0000904 · TK900/.test(await p.textContent('#firBody')) && /TK900\.HS\.MP/.test(await p.textContent('#firBody')));

  console.log('\n3. photographs straight into the FIR, with captions; removing one renames nothing');
  await p.evaluate(() => { const i = document.getElementById('firBy'); if (i) i.value = ''; firDraft.by = ''; });
  await p.fill('#firBy', '');
  ok('save refused with no photograph and no note', await p.$eval('#firSaveBtn', b => b.disabled));
  const a1 = await jpg(p, '#336'), a2 = await jpg(p, '#633'), a3 = await jpg(p, '#363');
  await p.setInputFiles('#firGalInput', [{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(a1, 'base64') }, { name: 'b.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(a2, 'base64') }]);
  await p.waitForFunction(() => document.querySelectorAll('#firBody .fir-ph img').length === 2, null, { timeout: 10000 });
  ok('two photographs shown, keyed F1 and F2', JSON.stringify(await p.evaluate(() => firDraft.photos.map(x => x.key))) === '["F1","F2"]');
  ok('save still refused without a name', await p.$eval('#firSaveBtn', b => b.disabled) && /name/.test(await p.textContent('#firHint')));
  await p.fill('[data-fcap="F2"]', 'Crack at weld');
  await p.click('[data-fdel="F1"]');
  ok('removing F1 keeps F2 and its caption', JSON.stringify(await p.evaluate(() => firDraft.photos.map(x => [x.key, x.cap]))) === '[["F2","Crack at weld"]]');
  await p.setInputFiles('#firGalInput', [{ name: 'c.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(a3, 'base64') }]);
  await p.waitForFunction(() => document.querySelectorAll('#firBody .fir-ph img').length === 2, null, { timeout: 10000 });
  ok('the next photograph is F3, not a reused key', JSON.stringify(await p.evaluate(() => firDraft.photos.map(x => x.key))) === '["F2","F3"]');
  await p.fill('#firNote', 'Leak found at pump outlet');
  await p.fill('#firBy', 'Check Inspector');
  ok('save allowed now', !(await p.$eval('#firSaveBtn', b => b.disabled)));

  console.log('\n4. saved through the ordinary Save tail');
  await p.click('#firSaveBtn');
  await p.waitForFunction(() => document.getElementById('firOv').classList.contains('hidden'), null, { timeout: 15000 });
  const rec = await p.evaluate(async () => (await dbAll()).find(r => r.type === 'FIR'));
  ok('one FIR record in the store', !!rec);
  ok('it carries the defect, unit, system, priority, note and name', rec && rec.firDefect === 'DD-0000904' && rec.equip === 'TK900' && rec.firSystem === 'TK900.HS.MP' && rec.firPriority === 'P2' && rec.firNote === 'Leak found at pump outlet' && rec.by === 'Check Inspector');
  ok('positions F2 and F3, caption kept', rec && JSON.stringify(Object.keys(rec.positions).sort()) === '["F2","F3"]' && rec.positions.F2.comment === 'Crack at weld');
  ok('queued for upload (up:0)', rec && rec.up === 0);
  const exp = await p.evaluate(async () => { const r = (await dbAll()).find(x => x.type === 'FIR'); return recToExport0(r); });
  ok('the sidecar carries firDefect, firNote, firSystem, firPriority', exp.firDefect === 'DD-0000904' && exp.firNote === 'Leak found at pump outlet' && exp.firSystem === 'TK900.HS.MP' && exp.firPriority === 'P2' && exp.type === 'FIR');
  const names = await p.evaluate(async () => { const r = (await dbAll()).find(x => x.type === 'FIR'); return (await filesForRecord(r)).map(f => f.name); });
  ok('photograph files are named <unit>_<F#>_<date>_FIR.jpg', names.length === 2 && names.every(n => /^TK900_F[23]_\d\d\.\d\d\.\d{4}_FIR\.jpg$/.test(n)), names.join(','));
  ok('a FIR puts nothing on the due list', await p.evaluate(() => !dueRows('').some(r => r.type === 'FIR' || r.ty === 'FIR')));

  console.log('\n5. Saved: no phone report for FIR; Edit reopens the FIR sheet');
  await p.evaluate(() => { const d = document.getElementById('dlg'); if (d && d.open) d.close(); });
  await p.click('[data-pane="paneQueue"]').catch(() => {});
  await p.evaluate(() => renderPending()); await p.waitForTimeout(400);
  const firRow = await p.evaluateHandle(() => [...document.querySelectorAll('#pending .pitem')].find(r => /FIR/.test(r.textContent)));
  ok('the FIR row is listed in Saved', !!(await firRow.asElement()));
  ok('its report button is hidden', await firRow.evaluate(r => r.querySelector('.rpt1').style.display === 'none'));
  await firRow.evaluate(r => r.querySelector('.edit').click());
  await p.waitForFunction(() => !document.getElementById('firOv').classList.contains('hidden'), null, { timeout: 10000 });
  ok('Edit opens the FIR sheet with the defect and both photographs', await p.evaluate(() => firEditing && firDraft.def.d === 'DD-0000904' && firDraft.photos.length === 2));
  ok('the defect cannot be changed on a saved FIR', !(await p.$('#firDefChange')));
  await p.setInputFiles('#firGalInput', [{ name: 'd.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(a1, 'base64') }]);
  await p.waitForFunction(() => firDraft && firDraft.photos.length === 3, null, { timeout: 10000 });
  ok('a photograph added on edit gets F4', await p.evaluate(() => firDraft.photos[2].key === 'F4'));
  await p.click('#firSaveBtn');
  await p.waitForFunction(() => document.getElementById('firOv').classList.contains('hidden'), null, { timeout: 15000 });
  const recs = await p.evaluate(async () => (await dbAll()).filter(r => r.type === 'FIR'));
  ok('saving again replaces the same record (same id, rev 2, three photographs)', recs.length === 1 && recs[0].rev === 2 && Object.keys(recs[0].positions).length === 3);

  console.log('\n6. one FIR per machine per day on a phone');
  await p.evaluate(() => { const d = document.getElementById('dlg'); if (d && d.open) d.close(); });
  await p.evaluate(() => firOpen());
  await p.click('[data-fdef="DD-0000904"]');
  await p.fill('#firNote', 'second'); await p.fill('#firBy', 'Check Inspector');
  await p.click('#firSaveBtn'); await p.waitForTimeout(500);
  ok('a second FIR for TK900 today is refused and says why', await p.evaluate(async () => (await dbAll()).filter(r => r.type === 'FIR').length === 1) && /already/.test(await p.textContent('#dlgMsg')));
  await p.evaluate(() => { const d = document.getElementById('dlg'); if (d && d.open) d.close(); firClose(); });

  console.log('\n7. the 1C PM sheet: Start FIR on a defect work order only');
  await p.evaluate(() => pmOpenInfo(SCHED.rtwOpen[0]));
  ok('a defect work order offers Start FIR', await p.isVisible('#pmStartFirBtn'));
  await p.click('#pmStartFirBtn'); await p.waitForTimeout(200);
  ok('Start FIR opens the sheet on that defect', await p.isVisible('#firOv') && await p.evaluate(() => firDraft.def && firDraft.def.d === 'DD-0000902' && firDraft.def.u === 'EX900'));
  await p.evaluate(() => firClose());
  await p.evaluate(() => pmOpenInfo(SCHED.rtwOpen[1]));
  ok('a planned service does not', !(await p.isVisible('#pmStartFirBtn')));
  await p.evaluate(() => pmCloseInfo());

  console.log('\n8. Russian');
  await p.click('[data-lang="ru"]');
  await p.waitForTimeout(200);
  await p.evaluate(() => firOpen());
  ok('the sheet speaks Russian', /Дефект 1С/.test(await p.textContent('#firBody')) && /Расследование отказа/.test(await p.textContent('#firOv')));
  ok('the type list names it in Russian', await p.$eval('#typeSel', s => /Расследование отказа/.test(s.options[s.options.length - 1].textContent)));

  await b.close(); srv.close();
  console.log(fails.length ? '\nFAIL ' + fails.length + '\n  ' + fails.join('\n  ') : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('CRASH ' + e.stack); process.exit(1); });
