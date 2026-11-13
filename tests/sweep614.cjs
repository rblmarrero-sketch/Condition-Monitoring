/* WHAT THE SWEEP OF 12.11.2026 FOUND, HELD IN PLACE (build 614).

   Reports (read off the real rounds of 10-12.11.2026):
     - a FIR printed as a graded inspection - "No condition rating recorded",
       the five-grade scale, "No action required" - and none of its own facts;
     - "Direct cause" printed the DEFECT when no cause was recorded;
     - the Maintenance action block said the worst finding card's lines again;
     - a bilingual sheet had English-only rating labels and sign-off table;
     - the undercarriage decision was printed twice on one page.
   Wear scale (decided by the site, 12.11.2026): above 80 % worn is Severe,
   planned into the next shutdown; Critical only at or past the limit.
   Phone:
     - a POST to Google is given the time its size needs, not 15 minutes;
     - the write-back of an uploaded round reuses the copies the run holds;
     - "could not be read back" after Save is said only when three reads fail;
     - the signature of a round being edited is kept unless cleared.

   Run: node tests/sweep614.cjs [port]   (needs tests/mock.cjs on the port) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8099);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const errs = [];

  console.log('reports');
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  p.on('pageerror', e => errs.push('dash: ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('cm_drive_url', ''); localStorage.setItem('lang', 'en'); });
  await p.goto(`http://127.0.0.1:${PORT}/dashboard/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMR && window.CMReport && window.CMDash, { timeout: 20000 });
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    window.CMDash.importRecords([
      { equip: 'TK148', date: '2026-11-11', type: 'FIR', cls: 'HT', by: 'Nurbol', smu: '',
        firDefect: 'DD-00016545', firSystem: 'TK148.DRS.FD.RRF Rear-Right Final Drive', firPriority: 'P2', firNote: 'Broken tooth',
        items: [{ key: 'F1', comment: 'Tooth, close-up' }] },
      { equip: 'TK148', date: '2026-11-10', type: 'INSP', cls: 'HT', by: 'Kazhybekov Bekzhan', smu: '9000',
        items: [{ key: 'FD.RRF', label: 'Right final drive', grade: 5, defect: 'Abnormal / accelerated wear', defectCode: 'FM-MEC-03',
                  action: 'Plan repair', wo: 'WO-021000', resp: 'Ivanov I.', target: '2026-11-14', comment: 'Replace the component' }] },
      { equip: 'TK157', date: '2026-11-06', type: 'MP', cls: 'HT', by: 'Kazhybekov Bekzhan', smu: '8933',
        items: [{ key: '4E', label: 'LH final drive', grade: 1 }, { key: '4F', label: 'RH final drive', grade: 1 }] },
      { equip: 'DZ016', date: '2026-11-07', type: 'UC', cls: 'DOZ', by: 'Zhomart Khasenov', smu: '15941',
        items: [{ key: 'ROLLER.R1', mm: 236 }, { key: 'ROLLER.L1', mm: 254 }] },
    ]);
    const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
  });
  const text = (key, lang, bi) => p.evaluate(({ key, lang, bi }) => {
    const i = key.indexOf(':');
    const secs = CMReport.sectionsFor(key.slice(0, i), key.slice(i + 1), { lang, bi, photos: true });
    const d = document.createElement('div'); d.innerHTML = secs.map(s => s.html).join('<br>');
    return d.textContent.replace(/\s+/g, ' ');
  }, { key, lang, bi });
  const DATES = { 'TK148|FIR': '2026-11-11', 'TK148|INSP': '2026-11-10', 'TK157|MP': '2026-11-06', 'DZ016|UC': '2026-11-07' };
  const keyOf = (u, ty) => 'one:' + u + '|' + DATES[u + '|' + ty] + '|' + ty;

  const fir = await text(await keyOf('TK148', 'FIR'), 'en', false);
  ok('a FIR says the 1C defect, the system, the priority and the note', /DD-00016545/.test(fir) && /Rear-Right Final Drive/.test(fir) && /P2/.test(fir) && /Broken tooth/.test(fir), fir.slice(0, 260).replace(/\s+/g, ' '));
  ok('and is not printed as a graded inspection', !/CONDITION RATING|No condition rating|No action required|Condition scale|Reliability Engineer/i.test(fir), (fir.match(/CONDITION RATING|No condition rating|No action required|Condition scale|Reliability Engineer/i) || [''])[0]);

  const insp = await text(await keyOf('TK148', 'INSP'), 'en', false);
  ok('a finding card carries its action, owner and date', /Plan repair/.test(insp) && /Ivanov I\./.test(insp) && /14\.11\.2026/.test(insp));
  ok('and the Maintenance action block does not say them again', !/Maintenance action|Recorded action|Direct cause/.test(insp) && (insp.match(/Ivanov I\./g) || []).length === 1, 'owner printed ' + (insp.match(/Ivanov I\./g) || []).length + ' time(s)');

  const mp = await text(await keyOf('TK157', 'MP'), 'en', false);
  ok('a clean round still says in one sentence that nothing is required', /Maintenance action/.test(mp) && /No action required/.test(mp));

  const uc = await text(await keyOf('DZ016', 'UC'), 'en', false);
  ok('the undercarriage decision is printed once on its page', (uc.match(/DECISION|Decision/g) || []).length === 1, String((uc.match(/DECISION|Decision/g) || []).length));
  ok('"Direct cause" never prints the defect', await p.evaluate(() => !/it\.cause \|\| it\.defect/.test(String(CMR.buildSections || '')) ) && !/Direct cause\s*Abnormal/.test(insp));

  const bi = await text(await keyOf('TK157', 'MP'), 'en', true);
  ok('a bilingual sheet has its rating labels and sign-off in both languages', /ОЦЕНКА СОСТОЯНИЯ/.test(bi) && /РЕШЕНИЕ/.test(bi) && /Техник МС/.test(bi) && /РОЛЬ/.test(bi), bi.slice(0, 200).replace(/\s+/g, ' '));

  const scale = await p.evaluate(() => [15, 35, 55, 75, 85, 99, 100, 120].map(w => GRADE.fromWorn(w)).join(''));
  ok('above 80 % worn is Severe; Critical only at or past the limit', scale === '12344455', scale);
  const warn = await p.evaluate(() => [GRADE.fromWorn(65, 60), GRADE.fromWorn(100, 60)].join(''));
  ok('an office warning still decides where it is set', warn === '45', warn);
  await p.close();

  console.log('phone');
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const m = await ctx.newPage();
  m.on('pageerror', e => errs.push('phone: ' + e.message));
  await m.addInitScript(() => { localStorage.setItem('up_dests', '[]'); });
  await m.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await m.waitForFunction(() => typeof upSimpleMax === 'function' && typeof graftOwned === 'function', null, { timeout: 20000 });
  await m.waitForTimeout(600);

  const clk = await m.evaluate(() => ({ small: upSimpleMax(18000), batch: upSimpleMax(2500000), huge: upSimpleMax(50000000), max: UP_CLOCKS.max }));
  ok('a record file is given about two minutes, not fifteen', clk.small >= 120000 && clk.small <= 130000, JSON.stringify(clk));
  ok('a photo batch is given the time its size needs', clk.batch > 250000 && clk.batch < 320000, String(clk.batch));
  ok('and nothing is given more than the old limit', clk.huge === clk.max, String(clk.huge));

  const press = await m.evaluate(() => {
    let killed = 0;
    UP_LIVE.add({ t0: Date.now() - 10 * 60000, bytes: 20000, kill: () => { killed++; } });   // ten minutes on a 20 KB file: stuck
    UP_LIVE.add({ t0: Date.now() - 20000, bytes: 2000000, kill: () => { killed += 10; } });  // twenty seconds into 2 MB: working
    const n = upAbortStuck(); UP_LIVE.clear(); return { n, killed };
  });
  ok('a Sync press ends the request that is stuck and leaves the one that is working', press.n === 1 && press.killed === 1, JSON.stringify(press));

  const graft = await m.evaluate(async () => {
    const own = await intake(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9])], 'x.jpg', { type: 'image/jpeg' }));
    const ptr = new File([own], own.name, { type: own.type });          // what dbGet hands back: same name, same size, not ours
    const from = { positions: { '1': { photos: [own] } } }, to = { positions: { '1': { photos: [ptr] } } };
    graftOwned(to, from);
    let reads = 0; const real = window.readBlobBytes; window.readBlobBytes = x => { reads++; return real(x); };
    await detachRec(to); window.readBlobBytes = real;
    return { same: to.positions['1'].photos[0] === own, reads };
  });
  ok('the write-back uses the copy the run already holds, and reads nothing', graft.same && graft.reads === 0, JSON.stringify(graft));

  const ver = await m.evaluate(async () => {
    const f = await intake(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 5, 6, 7, 8, 0xff, 0xd9])], 'x.jpg', { type: 'image/jpeg' }));
    const rec = { id: 'MP__TK900__2026-11-12__T__1', type: 'MP', equip: 'TK900', date: '2026-11-12', positions: { '1': { photos: [f], grade: 1 } }, up: 1, upTo: {} };
    await attSync(rec); await dbPut(rec);
    const real = window.readBlobBytes; let n = 0;
    window.readBlobBytes = x => (++n === 1 ? Promise.reject(new DOMException('settling', 'NotFoundError')) : real(x));
    const once = await verifySavedRec(rec.id);
    window.readBlobBytes = () => Promise.reject(new DOMException('gone', 'NotFoundError'));
    const never = await verifySavedRec(rec.id);
    window.readBlobBytes = real;
    await dbDel(rec.id);
    return { once: once.length, never: never.length, why: (never.whys || []).join(',') };
  });
  ok('a photograph that reads on the second try is not reported', ver.once === 0, JSON.stringify(ver));
  ok('one that never reads is, with the reason in the trace', ver.never === 1 && /read/.test(ver.why), JSON.stringify(ver));

  const sign = await m.evaluate(() => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    loadSign(blob); const kept = signKeep === blob;
    clearSign(); return { kept, cleared: signKeep === null };
  });
  ok('the signature of a round being edited is kept until it is cleared', sign.kept && sign.cleared, JSON.stringify(sign));

  console.log('the three left open by the sweep');
  await m.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); selectEquip('TK151'); });
  await m.waitForTimeout(200);
  const mph = await m.evaluate(async () => {
    window.chooseSource = async () => 'live';
    let n = 0; CMNative.photo = async () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ++n, n, n, n, 0xff, 0xd9])], 'c.jpg', { type: 'image/jpeg' });
    await takeMachinePhoto('OVERVIEW'); await takeMachinePhoto('OVERVIEW');
    const ov = genPhotos(draft, 'OVERVIEW'); const b4 = ov[0] ? new Uint8Array(await ov[0].arrayBuffer())[4] : 0;
    await takeMachinePhoto('EXTRA'); await takeMachinePhoto('EXTRA');
    const d = document.querySelector('dialog[open]'); if (d && d.close) d.close();
    return { ov: ov.length, b4, extra: genPhotos(draft, 'EXTRA').length,
      thumbs: document.querySelectorAll('#mpRows .mprow[data-cat="EXTRA"] img').length,
      add: (document.querySelector('#mpRows [data-take="EXTRA"]') || {}).textContent || '' };
  });
  ok('Retake on a machine photograph replaces it', mph.ov === 1 && mph.b4 === 2, JSON.stringify(mph));
  ok('"Additional" keeps every photograph, shows each and offers another', mph.extra === 2 && mph.thumbs === 2 && /Add another/.test(mph.add), JSON.stringify(mph));

  const leave = await m.evaluate(async () => {
    const s = document.getElementById('typeSel'); const n0 = Object.keys(draft.positions).length;
    s.value = 'FC'; s.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 150));
    const asked = !!document.querySelector('#dlg[open]'), stayed = type === 'MP' && s.value === 'MP';
    document.getElementById('dlgCancel').click(); await new Promise(r => setTimeout(r, 150));
    const kept = Object.keys(draft.positions).length === n0 && type === 'MP';
    s.value = 'FC'; s.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 150));
    document.getElementById('dlgOk').click(); await new Promise(r => setTimeout(r, 200));
    return { asked, stayed, kept, after: type, left: Object.keys(draft.positions).length };
  });
  ok('changing the round type with a round in hand asks first', leave.asked && leave.stayed, JSON.stringify(leave));
  ok('"Keep working" keeps it; "Discard and continue" starts the other round', leave.kept && leave.after === 'FC' && leave.left === 0, JSON.stringify(leave));

  const rtw = await m.evaluate(async () => {
    const no = RTW_ITEMS[0].no, att = { a1: { seq: 3, category: 'COMPONENT' } };
    const rec = { id: 'RTW__TK900__2026-11-12__T__1', type: 'RTW', equip: 'TK900', date: '2026-11-12', rev: 1,
      positions: { [no]: { mark: 'pass', comment: '', photos: [], att } } };
    await rtwOpenForEdit(rec);
    const same = rtwDraft.items[no].att === att;
    document.getElementById('rtwOv').classList.add('hidden'); rtwEditing = null;
    return { same };
  });
  ok('an RTW edit carries its attachment manifest in', rtw.same, JSON.stringify(rtw));

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
