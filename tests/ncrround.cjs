/* CM_NCR_V1 - photographs for a non-conformance report from the phone (Rickie 13.11.2026). NCR is chosen from the
   inspection type list like FIR. Either an NCR already in the office register (SCHED.ncrList, from build_ncr_list:
   ncr_kit's phone.json) or a New NCR: part number (typed or read off the label), the unit or "no unit" for a store
   part, the 1C defect / open work order, quantity. Photographs keyed N1, N2 ... given once; one NCR per unit per
   day per phone; saved through the ordinary Save tail; the phone report button is hidden (the NCR document is made
   in PECHANKA's register). */
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
  generated: '2026-11-13T00:00:00Z', byUnit: {},
  rtwOpen: [
    { wo: 'WO-0000911', equip: 'TK900', cls: 'HT', comp: 'TK900.PT.ENG', desc: 'Turbo noise', priority: 'P2 Urgent', raised: '2026-11-10', type: 'Engine', hours: null, plan: '', status: 'Registered', request: 'DD-0000912', pmStatus: 'open' },
    { wo: 'WO-0000913', equip: 'TK900', cls: 'HT', comp: '', desc: 'old job', priority: 'P2 Urgent', raised: '2026-10-01', type: 'x', hours: null, plan: '', status: 'Completed', request: 'DD-0000914', pmStatus: 'complete' },
  ],
  firDefects: [ { d: 'DD-0000912', u: 'TK900', s: 'TK900.PT.ENG', p: 'P2', r: '2026-11-10', x: 'Turbo noise' } ],
  ncrList: [
    { n: 'NCR-280-W', r: 'BMC-NCR-0280', u: 'EX900', m: 'ZX470', p: '4719851', x: 'Pump cracked on arrival', s: 'Open', d: '2026-11-12', dd: '' },
    { n: 'NCR-281', r: '', u: '', m: '', p: 'AB-77', x: 'Filter wrong size', s: 'Draft', d: '2026-11-11', dd: '' },
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
  const closeDlg = () => p.evaluate(() => { const d = document.getElementById('dlg'); if (d && d.open) d.close(); });

  console.log('1. NCR is in the inspection type list and opens its own sheet');
  const before = await p.$eval('#typeSel', s => s.value);
  ok('the list carries NCR as its last option', await p.$eval('#typeSel', s => s.options[s.options.length - 1].value === 'NCR'));
  await p.selectOption('#typeSel', 'NCR'); await p.waitForTimeout(200);
  ok('choosing NCR opens the NCR sheet', await p.isVisible('#ncrOv'));
  ok('the type list goes back to the round type it had', await p.$eval('#typeSel', s => s.value) === before);
  ok('NCR is not a round type', await p.evaluate(() => TYPE_ORDER.indexOf('NCR') < 0 && !!TYPE_META.NCR.ncr));
  ok('with NCRs in the register it opens on the list', await p.evaluate(() => ncrDraft.mode === 'open') && (await p.$$('[data-nsel]')).length === 2);

  console.log('\n2. an NCR from the register');
  await p.fill('#ncrQ', '4719851');
  ok('search by part number narrows the list', JSON.stringify(await p.$$eval('[data-nsel]', a => a.map(x => x.dataset.nsel))) === '["NCR-280-W"]');
  ok('save refused until an NCR is chosen', await p.$eval('#ncrSaveBtn', b => b.disabled));
  await p.click('[data-nsel="NCR-280-W"]');
  ok('the chosen NCR shows its Mine Ref No and unit', /BMC-NCR-0280 · EX900/.test(await p.textContent('#ncrBody')));
  const a1 = await jpg(p, '#336'), a2 = await jpg(p, '#633');
  await p.setInputFiles('#ncrGalInput', [{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(a1, 'base64') }, { name: 'b.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(a2, 'base64') }]);
  await p.waitForFunction(() => document.querySelectorAll('#ncrBody .fir-ph img').length === 2, null, { timeout: 10000 });
  ok('photographs keyed N1, N2', JSON.stringify(await p.evaluate(() => ncrDraft.photos.map(x => x.key))) === '["N1","N2"]');
  await p.fill('[data-ncap="N1"]', 'Crack on housing');
  await p.fill('#ncrBy', 'Store Keeper');
  ok('save allowed', !(await p.$eval('#ncrSaveBtn', b => b.disabled)));
  await p.click('#ncrSaveBtn');
  await p.waitForFunction(() => document.getElementById('ncrOv').classList.contains('hidden'), null, { timeout: 15000 });
  let rec = await p.evaluate(async () => (await dbAll()).find(r => r.type === 'NCR'));
  ok('one NCR record, filed under the unit', rec && rec.equip === 'EX900' && rec.ncrSite === 'NCR-280-W' && rec.ncrRef === 'BMC-NCR-0280' && rec.ncrPart === '4719851');
  ok('caption kept, queued (up:0)', rec && rec.positions.N1.comment === 'Crack on housing' && rec.up === 0);
  const exp = await p.evaluate(async () => recToExport0((await dbAll()).find(x => x.type === 'NCR')));
  ok('the sidecar carries ncrSite, ncrRef, ncrPart', exp.type === 'NCR' && exp.ncrSite === 'NCR-280-W' && exp.ncrRef === 'BMC-NCR-0280' && exp.ncrPart === '4719851');
  const names = await p.evaluate(async () => (await filesForRecord((await dbAll()).find(x => x.type === 'NCR'))).map(f => f.name));
  ok('photograph files are <unit>_N#_<date>_NCR.jpg', names.length === 2 && names.every(n => /^EX900_N[12]_\d\d\.\d\d\.\d{4}_NCR\.jpg$/.test(n)), names.join(','));
  ok('an NCR puts nothing on the due list', await p.evaluate(() => !dueRows('').some(r => r.type === 'NCR')));
  await closeDlg();

  console.log('\n3. a New NCR on a unit, linked to a 1C defect / work order');
  await p.evaluate(() => ncrOpen()); await p.waitForTimeout(100);
  await p.click('[data-nmode="new"]');
  ok('New NCR asks for the part, unit and defect', await p.isVisible('#ncrPart') && await p.isVisible('#ncrUnit'));
  await p.fill('#ncrPart', '6754-61-5110');
  await p.fill('#ncrUnit', 'tk900'); await p.dispatchEvent('#ncrUnit', 'change'); await p.waitForTimeout(100);
  const opts = await p.$$eval('#ncrDd option', a => a.map(o => o.value));
  ok('the 1C defect and its open work order are offered, the completed one is not', opts.includes('DD-0000912|') && opts.includes('DD-0000912|WO-0000911') && !opts.some(v => /WO-0000913/.test(v)), opts.join(' ; '));
  await p.selectOption('#ncrDd', 'DD-0000912|');
  await p.fill('#ncrQty', '2');
  await p.fill('#ncrNote', 'Wrong thread on new turbo');
  await p.fill('#ncrBy', 'Store Keeper');
  await p.click('#ncrSaveBtn');
  await p.waitForFunction(() => document.getElementById('ncrOv').classList.contains('hidden'), null, { timeout: 15000 });
  rec = await p.evaluate(async () => (await dbAll()).find(r => r.type === 'NCR' && r.equip === 'TK900'));
  ok('saved with part, unit (upper-case), defect, quantity and note, no site number', rec && rec.ncrPart === '6754-61-5110' && rec.ncrUnit === 'TK900' && rec.ncrDefect === 'DD-0000912' && rec.ncrQty === '2' && rec.ncrSite === '' && rec.ncrNote === 'Wrong thread on new turbo');
  await closeDlg();

  console.log('\n4. a part from the store (no unit), and the rules');
  await p.evaluate(() => ncrOpen()); await p.click('[data-nmode="new"]');
  await p.fill('#ncrBy', 'Store Keeper'); await p.fill('#ncrNote', 'x');
  ok('refused without a part number', await p.$eval('#ncrSaveBtn', b => b.disabled) && /part number/.test(await p.textContent('#ncrHint')));
  await p.fill('#ncrPart', 'ab-77/x');
  ok('refused without a unit', await p.$eval('#ncrSaveBtn', b => b.disabled) && /unit/i.test(await p.textContent('#ncrHint')));
  await p.check('#ncrShelf'); await p.waitForTimeout(100);
  ok('no unit: allowed, the unit box is off', !(await p.$eval('#ncrSaveBtn', b => b.disabled)) && await p.$eval('#ncrUnit', i => i.disabled));
  await p.click('#ncrSaveBtn');
  await p.waitForFunction(() => document.getElementById('ncrOv').classList.contains('hidden'), null, { timeout: 15000 });
  ok('filed under STORE-<part>', await p.evaluate(async () => (await dbAll()).some(r => r.type === 'NCR' && r.equip === 'STORE-AB77X' && r.ncrUnit === '')));
  await closeDlg();
  await p.evaluate(() => ncrOpen());
  await p.click('[data-nsel="NCR-280-W"]'); await p.fill('#ncrNote', 'again'); await p.fill('#ncrBy', 'Store Keeper');
  await p.click('#ncrSaveBtn'); await p.waitForTimeout(500);
  ok('a second NCR for EX900 today is refused and says why', await p.evaluate(async () => (await dbAll()).filter(r => r.type === 'NCR' && r.equip === 'EX900').length === 1) && /already/.test(await p.textContent('#dlgMsg')));
  await closeDlg(); await p.evaluate(() => ncrClose());

  console.log('\n5. part-label scan: a code read fills the part number; the label photo is kept');
  await p.evaluate(() => { window.BarcodeDetector = class { async detect() { return [{ rawValue: ' 600-311-8293 ' }]; } }; });
  await p.evaluate(() => ncrOpen()); await p.click('[data-nmode="new"]');
  await p.evaluate((b64) => { window.__nat = window.CMNative; window.CMNative = Object.assign({}, window.CMNative || {}, { photo: async () => new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'lbl.jpg', { type: 'image/jpeg' }) }); }, a1);
  await p.click('#ncrScan');
  await p.waitForFunction(() => ncrDraft && ncrDraft.photos.length === 1, null, { timeout: 10000 });
  ok('part number read from the label', await p.$eval('#ncrPart', i => i.value) === '600-311-8293');
  ok('the label photograph is kept with its caption', await p.evaluate(() => ncrDraft.photos[0].cap.length > 0));
  await p.evaluate(() => { window.BarcodeDetector = class { async detect() { return []; } }; });
  await p.click('#ncrScan'); await p.waitForTimeout(800);
  ok('no code found: says so, keeps the photo', /code/i.test(await p.textContent('#dlgMsg')) && await p.evaluate(() => ncrDraft.photos.length === 2));
  await closeDlg(); await p.evaluate(() => { ncrClose(); window.CMNative = window.__nat; });

  console.log('\n6. Saved: no phone report; Edit reopens the NCR sheet');
  await p.click('[data-pane="paneQueue"]').catch(() => {});
  await p.evaluate(() => renderPending()); await p.waitForTimeout(400);
  const row = await p.evaluateHandle(() => [...document.querySelectorAll('#pending .pitem')].find(r => /EX900/.test(r.textContent) && /NCR/.test(r.textContent)));
  ok('the NCR row is listed', !!(await row.asElement()));
  ok('its report button is hidden', await row.evaluate(r => r.querySelector('.rpt1').style.display === 'none'));
  await row.evaluate(r => r.querySelector('.edit').click());
  await p.waitForFunction(() => !document.getElementById('ncrOv').classList.contains('hidden'), null, { timeout: 10000 });
  ok('Edit opens the NCR with its two photographs, NCR fixed', await p.evaluate(() => ncrEditing && ncrDraft.ncr.n === 'NCR-280-W' && ncrDraft.photos.length === 2) && !(await p.$('#ncrChange')));
  await p.setInputFiles('#ncrGalInput', [{ name: 'c.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(a2, 'base64') }]);
  await p.waitForFunction(() => ncrDraft && ncrDraft.photos.length === 3, null, { timeout: 10000 });
  ok('a photograph added on edit gets N3', await p.evaluate(() => ncrDraft.photos[2].key === 'N3'));
  await p.click('#ncrSaveBtn');
  await p.waitForFunction(() => document.getElementById('ncrOv').classList.contains('hidden'), null, { timeout: 15000 });
  const recs = await p.evaluate(async () => (await dbAll()).filter(r => r.type === 'NCR' && r.equip === 'EX900'));
  ok('saving again replaces the same record (rev 2, three photographs)', recs.length === 1 && recs[0].rev === 2 && Object.keys(recs[0].positions).length === 3);
  await closeDlg();

  console.log('\n7. no register list on the phone yet: New NCR only');
  await p.evaluate(() => { SCHED.ncrList = []; ncrOpen(); }); await p.waitForTimeout(100);
  ok('opens on New NCR', await p.evaluate(() => ncrDraft.mode === 'new') && await p.isVisible('#ncrPart'));
  await p.evaluate(() => ncrClose());

  console.log('\n8. Russian');
  await p.click('[data-lang="ru"]'); await p.waitForTimeout(200);
  await p.evaluate(() => ncrOpen());
  ok('the sheet speaks Russian', /Каталожный|каталожный|NCR/.test(await p.textContent('#ncrBody')) && /[А-Яа-я]/.test(await p.textContent('#ncrOv')));
  ok('the type list names it in Russian', await p.$eval('#typeSel', s => /Несоответствие|NCR/.test(s.options[s.options.length - 1].textContent) && /[А-Яа-я]/.test(s.options[s.options.length - 1].textContent)));

  await b.close(); srv.close();
  console.log(fails.length ? '\nFAIL ' + fails.length + '\n  ' + fails.join('\n  ') : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('CRASH ' + e.stack); process.exit(1); });
