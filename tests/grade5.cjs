/* THE 1–5 CONDITION GRADE, ON BOTH SURFACES.

   One scale — 1 Normal · 2 Incipient · 3 Degraded · 4 Severe · 5 Critical —
   from mobile/grade.js, replacing A/B/C/X. What has to be true:

   the module
     every letter reads as its number and nothing else does; the ISO class,
     colour, name, meaning per round and required fields come off the number;
   the phone
     five cards, number + name + the meaning for THIS round, in both
     languages; no severity strip; a grade of 3 asks for the plan, 4 the
     close-up, 5 the notification; a proposed 5 lowered by hand needs a
     reason; the machine overview is required on every round, both sides on
     an undercarriage round, and Save names what is missing while the draft
     stays; a complete round saves with the grade as an integer, the ISO
     class derived, the photograph categories on the manifest, and goes out
     as numbers on every route (server sidecar, ZIP, report);
   the dashboard
     letters in the folder read as numbers; Critical / Severe / Degraded
     headlines, a five-step mix, pills that say the number and the name, a
     filter that drills to one grade and an address that carries it (old
     addresses with CRI/DEG still open); the correction panel offers 1–5 with
     the round's meaning and no severity field; the CSV carries the number
     and the name; global search finds a grade by number or name;
   the report engine
     reads letters and numbers alike and colours by the number.

   Run: node tests/grade5.cjs        (needs tests/mock.cjs on 8099, or CM_BASE) */
const { chromium } = require(require('./pw.cjs'));
const path = require('path');
const BASE = process.env.CM_BASE || 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const J = o => JSON.stringify(o).slice(0, 420);

(async () => {
  /* ---- 1. the module, in node ------------------------------------------ */
  console.log('\n1. THE MODULE');
  const G = require(path.join(__dirname, '..', 'mobile', 'grade.js'));
  ok('A B C D X read as 1 2 3 4 5, in either case', ['A','b','C','d','x'].map(G.num).join('') === '12345');
  ok('numbers and numeric strings read as themselves; junk, 0, 6 and blank read as nothing',
     G.num(4) === 4 && G.num('5') === 5 && G.num(0) === null && G.num(6) === null && G.num('') === null && G.num('Q') === null && G.num(null) === null);
  ok('letters are recognised as the old scale, numbers are not', G.isLegacy('C') && G.isLegacy('x') && !G.isLegacy(3) && !G.isLegacy('3'));
  ok('the ISO 14224 class comes off the number: 1 NOF · 2 INC · 3 DEG · 4 DEG · 5 CRI',
     [1,2,3,4,5].map(G.iso).join(',') === 'NOF,INC,DEG,DEG,CRI' && G.iso('X') === 'CRI');
  ok('the number and the name, always together, in both languages', G.label(4,'en') === '4 – Severe' && G.label(4,'ru') === '4 – Серьёзное' && G.label(9) === '');
  ok('the meaning depends on the round', /filings/.test(G.meaning(3,'MP','en')) && /flakes/.test(G.meaning(3,'FC','en'))
     && /40–59% remaining/.test(G.meaning(3,'UC','en')) && /worn but usable/.test(G.meaning(3,'GET','en'))
     && /equipment remains usable/.test(G.meaning(3,'INSP','en')) && /dirty lubricant/.test(G.meaning(3,'LUBE','en'))
     && /стружка/.test(G.meaning(3,'MP','ru')));
  ok('five colours, amber takes dark ink', [1,2,3,4,5].map(G.hex).every(h => /^#[0-9a-f]{6}$/i.test(h)) && new Set([1,2,3,4,5].map(G.hex)).size === 5 && G.ink(2) !== '#fff' && G.ink(5) === '#fff');
  ok('the worst of a list, letters and numbers mixed', G.worst([{grade:'A'},{grade:3},{grade:'B'}]) === 3 && G.worst([]) === null);
  ok('remaining life grades a measured point: 85% left → 1, 65 → 2, 45 → 3, 25 → 4, 10 → 5, past the limit → 5',
     [85,65,45,25,10].map(G.fromRemaining).join('') === '12345' && G.fromWorn(105) === 5 && G.fromWorn(15) === 1);
  ok('what each grade asks for: 3 action + target, 4 adds comment + close-up, 5 adds defect + notification',
     !G.requires(1).action && G.requires(3).action && G.requires(3).target && !G.requires(3).comment
     && G.requires(4).closeup && G.requires(4).comment && !G.requires(4).notify
     && G.requires(5).notify && G.requires(5).defect);
  ok('attention starts at 3', !G.isFinding(2) && G.isFinding(3) && G.isFinding('X') && G.isCritical(5) && !G.isCritical(4));

  const b = await chromium.launch();
  /* ---- 2. the phone ----------------------------------------------------- */
  console.log('\n2. THE PHONE');
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  const start = async (ty, unit) => p.evaluate(async ({ ty, unit }) => {
    if (typeof resetForm === 'function') resetForm();
    const sel = document.getElementById('typeSel'); sel.value = ty; sel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 150));
    curEquip = unit; if (typeof updateEquipBtn === 'function') updateEquipBtn(); if (typeof applyForm === 'function') applyForm();
    await new Promise(r => setTimeout(r, 250));
    const first = document.querySelector('#posnav button[data-pos]'); if (first) first.click();
    await new Promise(r => setTimeout(r, 250));
    return { item: curItem, cards: [...document.querySelectorAll('#gradeSeg .gcard')].map(c => c.textContent.replace(/\s+/g, ' ').trim()),
             slots: [...document.querySelectorAll('#mpRows .mprow')].map(r => r.dataset.cat + ':' + (r.querySelector('.req') ? 'req' : 'opt')),
             sev: !!document.querySelector('#sevSeg [data-s]') };
  }, { ty, unit });
  const mp = await start('MP', 'TK147');
  ok('a plug round: five cards, "3 – Degraded · Fine metal filings", overview required, no severity strip',
     mp.cards.length === 5 && /^3 3 – Degraded ?Fine metal filings$/.test(mp.cards[2]) && mp.slots[0] === 'OVERVIEW:req' && !mp.sev, J(mp));
  const fc = await start('FC', 'TK147');
  ok('a filter-cut round reads the filter meanings', /small flakes/.test(fc.cards[2]) && /Large fragments/.test(fc.cards[4]), fc.cards[2]);
  const insp = await start('INSP', 'TK147');
  ok('a general inspection reads the general meanings', /equipment remains usable/.test(insp.cards[2]), insp.cards[2]);
  const uc = await start('UC', 'DZ007');
  ok('an undercarriage round requires the overview and both sides', uc.slots.slice(0, 3).join(',') === 'OVERVIEW:req,LEFT:req,RIGHT:req', J(uc.slots));
  const ru = await p.evaluate(async () => { lang = 'ru'; localStorage.setItem('lang', 'ru'); applyLang(); renderGrade(); renderMachinePhotos();
    await new Promise(r => setTimeout(r, 100));
    const out = { cards: [...document.querySelectorAll('#gradeSeg .gcard')].map(c => c.textContent.replace(/\s+/g, ' ').trim()),
                  slot: document.querySelector('#mpRows .mprow .mpt b').textContent };
    lang = 'en'; localStorage.setItem('lang', 'en'); applyLang(); renderGrade(); renderMachinePhotos(); return out; });
  ok('and in Russian', ru.cards.length === 5 && /Серьёзное/.test(ru.cards[3]) && /Общий вид/.test(ru.slot), ru.cards[3] + ' · ' + ru.slot);

  /* The grade and what it asks for. */
  const r = await start('MP', 'TK147');
  const req = await p.evaluate(async () => {
    const click = n => { document.querySelector(`#gradeSeg .gcard[data-g="${n}"]`).click(); return new Promise(r => setTimeout(r, 120)); };
    const vis = id => !document.getElementById(id).classList.contains('hidden');
    const out = {};
    await click(1); out.g1 = { req: vis('gradeReq'), grade: draft.positions[curItem].grade, sev: draft.positions[curItem].sev };
    await click(3); out.g3 = { req: vis('gradeReq'), notify: vis('gNotifyWrap'), text: document.getElementById('gradeReqText').textContent };
    await click(4); out.g4 = { req: vis('gradeReq'), notify: vis('gNotifyWrap'), text: document.getElementById('gradeReqText').textContent };
    await click(5); out.g5 = { req: vis('gradeReq'), notify: vis('gNotifyWrap'), grade: draft.positions[curItem].grade, sev: draft.positions[curItem].sev, on: document.querySelector('#gradeSeg .gcard.on').dataset.g };
    await click(5); out.off = { grade: draft.positions[curItem].grade, sev: draft.positions[curItem].sev, req: vis('gradeReq') };
    return out;
  });
  ok('1 asks for nothing; 3 opens the plan; 4 says close-up; 5 adds the notification; a second tap clears',
     req.g1.grade === 1 && req.g1.sev === 'NOF' && !req.g1.req && req.g3.req && !req.g3.notify && /target date/.test(req.g3.text)
     && req.g4.req && /close-up/.test(req.g4.text) && req.g5.req && req.g5.notify && req.g5.grade === 5 && req.g5.sev === 'CRI' && req.g5.on === '5'
     && req.off.grade === null && !req.off.sev && !req.off.req, J(req));
  /* A critical failure mode proposes 5; graded lower, it asks why. */
  const ovr = await p.evaluate(async () => {
    const p = draft.positions[curItem]; const crit = Object.values(DEFECT_BY).find(d => d.defaultSeverity === 'Critical');
    p.defect = crit.code; delete p.gradeMan; renderGrade(); await new Promise(r => setTimeout(r, 80));
    const proposed = (gradeProposal(draft.positions[curItem]) || {}).n;
    document.querySelector('#gradeSeg .gcard[data-g="3"]').click(); await new Promise(r => setTimeout(r, 120));
    const shown = !document.getElementById('gradeOvr').classList.contains('hidden');
    const text = document.getElementById('gradeOvrText').textContent;
    document.getElementById('inspector').value = 'Tester'; document.getElementById('saveBtn').click(); await new Promise(r => setTimeout(r, 500));
    const msg = document.getElementById('dlg').open ? document.getElementById('dlgMsg').textContent : '';
    document.getElementById('dlg').close();
    return { proposed, shown, text, msg, sug: draft.positions[curItem].gradeSug, defect: crit.code };
  });
  ok('a critical failure mode proposes 5; set to 3 it asks why, and Save insists on the reason',
     ovr.proposed === 5 && ovr.shown && /5 is proposed/.test(ovr.text) && /reason/.test(ovr.msg) && ovr.sug === 5, J(ovr));

  /* A complete round, saved. */
  const saved = await p.evaluate(async () => {
    const p = draft.positions[curItem];
    p.grade = 3; p.gradeMan = 1; p.gradeWhy = 'confirmed by the fitter'; p.action = 'SCH'; p.target = '2026-09-20'; p.resp = 'Sokolov crew'; p.opstat = 'RES';
    renderGrade(); await new Promise(r => setTimeout(r, 80));
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0xff, 0xd9]);
    /* A close-up on the point, and the overview of the machine. */
    addPos(p, attWrap(new File([bytes], 'x.jpg', { type: 'image/jpeg' })), 'DEFECT');
    const gaps0 = photoGaps(draft, type).slice();
    document.getElementById('saveBtn').click(); await new Promise(r => setTimeout(r, 500));
    const refused = document.getElementById('dlg').open ? document.getElementById('dlgTitle').textContent + ' | ' + document.getElementById('dlgMsg').textContent : '';
    if (document.getElementById('dlg').open) document.getElementById('dlg').close();
    const stillDraft = !!draft.positions[curItem];
    const g = (draft.positions[GEN_KEY] ||= {});
    addPos(g, attWrap(new File([bytes], 'o.jpg', { type: 'image/jpeg' })), 'OVERVIEW');
    renderMachinePhotos();
    const count = document.getElementById('mpCount').textContent;
    const gaps1 = photoGaps(draft, type).slice();
    document.getElementById('saveBtn').click(); await new Promise(r => setTimeout(r, 1500));
    const refused2 = document.getElementById('dlg').open ? document.getElementById('dlgMsg').textContent : '';
    const all = await dbAll(); const rec = all[all.length - 1];
    const pos = rec.positions; const k = Object.keys(pos).find(x => x !== GEN_KEY);
    const exp = recToExport(rec);
    const pkg = await buildPackage(); const entries = JSON.parse(new TextDecoder().decode(pkg.files.find(f => f.name === 'entries.json').data));
    const names = pkg.files.map(f => f.name);
    return { gaps0, refused, stillDraft, count, gaps1, refused2, n: all.length,
             grade: pos[k].grade, sev: pos[k].sev, why: pos[k].gradeWhy, sug: pos[k].gradeSug, resp: pos[k].resp, target: pos[k].target, opstat: pos[k].opstat, phv: rec.phv,
             genCat: Object.values(pos[GEN_KEY].att)[0].category, pointCat: Object.values(pos[k].att)[0].category,
             expGrades: exp.items.map(i => i.grade), expGeneral: exp.items.map(i => i.general), expCats: exp.items.map(i => (i.att || []).map(a => a.category)),
             entriesVersion: entries.version, entriesGrades: Object.values(entries.grades), recGrades: entries.records[0].items.map(i => i.grade),
             genFile: names.find(n => /_OVERVIEW_/.test(n)) };
  });
  ok('without the overview, Save names the photograph and keeps the draft', saved.gaps0.join() === 'OVERVIEW' && /Photographs missing/.test(saved.refused) && /Equipment overview/.test(saved.refused) && saved.stillDraft, J({ g: saved.gaps0, r: saved.refused }));
  ok('with it, the checklist reads 1 of 1 and Save goes through', saved.gaps1.length === 0 && /1 of 1/.test(saved.count) && /saved on this phone/.test(saved.refused2) && saved.n >= 1, J({ c: saved.count, r: saved.refused2 }));
  ok('the record carries the grade as an integer, the ISO class derived, the plan and the reason',
     saved.grade === 3 && saved.sev === 'DEG' && saved.why === 'confirmed by the fitter' && saved.sug === 5 && saved.resp === 'Sokolov crew' && saved.target === '2026-09-20' && saved.opstat === 'RES' && saved.phv === 2, J(saved));
  ok('the photograph categories are on the manifest: OVERVIEW on the machine, DEFECT on the point', saved.genCat === 'OVERVIEW' && saved.pointCat === 'DEFECT');
  ok('the server sidecar carries numbers, marks the machine item general, and names the categories',
     saved.expGrades.every(g => g === '' || typeof g === 'number') && saved.expGeneral.includes(1) && saved.expCats.flat().includes('OVERVIEW'), J({ g: saved.expGrades, gen: saved.expGeneral, c: saved.expCats }));
  ok('the ZIP is version 3 with numeric grades, and the overview file is named by what it is of',
     saved.entriesVersion === 3 && saved.entriesGrades.every(g => typeof g === 'number') && saved.recGrades.every(g => g === '' || typeof g === 'number') && /_OVERVIEW_/.test(saved.genFile || ''), J({ v: saved.entriesVersion, g: saved.entriesGrades, f: saved.genFile }));
  /* A round captured on the old build reads and re-saves as numbers. */
  const legacy = await p.evaluate(async () => {
    const all = await dbAll(); const rec = JSON.parse(JSON.stringify(all[all.length - 1]));
    rec.id = rec.id + '_legacy'; rec.positions = { '4C': { grade: 'X', sev: 'CRI', action: 'REPL', photos: [] } }; rec.up = 0;
    await dbPut(rec);
    const before = (await dbAll()).find(r => r.id === rec.id).positions['4C'].grade;
    const m = await migrateLocalGrades();
    const after = (await dbAll()).find(r => r.id === rec.id).positions['4C'].grade;
    localStorage.setItem(TEAM_KEY, JSON.stringify([{ u: 'TK999', d: '2026-08-01', t: 'MP', by: 'x', g: 'C' }])); teamCache = null;
    const m2 = await migrateLocalGrades();
    const row = JSON.parse(localStorage.getItem(TEAM_KEY))[0];
    return { before, after, m, m2, rowG: row.g };
  });
  ok('the boot-time pass turns a queued letter and a cached team row into numbers, once',
     legacy.before === 'X' && legacy.after === 5 && legacy.m.items === 1 && legacy.rowG === 3 && legacy.m2.rows === 1 && legacy.m2.items === 0, J(legacy));
  ok('phone: no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await p.close();

  /* ---- 3. the dashboard -------------------------------------------------- */
  console.log('\n3. THE DASHBOARD');
  /* The mock is shared with every dashboard suite in the sweep and keeps
     whatever the last one seeded. Start from its full folder, as a fresh
     server does, so the count below is about this build and not about which
     suite ran before. */
  await fetch(BASE + '/__reset?n=40');
  const q = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const qerrs = []; q.on('pageerror', e => qerrs.push(e.message));
  await q.addInitScript(base => { localStorage.setItem('cm_drive_url', base + '/exec'); localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1'); }, BASE);
  await q.goto(BASE + '/dashboard/index.html#overview?sev=CRI', { waitUntil: 'load' });
  await q.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 10, null, { timeout: 60000 });
  await q.waitForTimeout(2500);
  /* A marker the office wrote before this build carries its grade as a
     letter, and applyEdits() overlays the marker AFTER rebuild() has turned
     the sidecar's grade into a number. Seven findings on three live rounds
     read "C" and "X" on the deployed page that way: right on screen, wrong
     in anything that compares the grade to a number. */
  const ov = await q.evaluate(() => {
    const rec = { equip: 'TK900', date: '2026-08-20', type: 'MP', items: [{ key: '4C', grade: 3 }, { key: '4D', grade: 2 }] };
    const ek = ekOf(rec);
    const was = edits[ek];
    edits[ek] = { key: ek, at: '2026-08-21T08:00:00Z', by: 'office', items: { '4C': { grade: 'X', sev: 'CRI' }, '4D': { grade: '' } } };
    let out; try { out = applyEdits(rec); } finally { if (was) edits[ek] = was; else delete edits[ek]; }
    return { g: out.items.map(i => i.grade), edited: out.items.map(i => !!i._edited) };
  });
  ok('an office marker written with a letter reads as a number once overlaid', ov.g[0] === 5 && ov.g[1] === '' && ov.edited[0], J(ov));
  const d1 = await q.evaluate(() => {
    const letters = RECS.reduce((n, r) => n + r.items.filter(i => typeof i.grade === 'string' && i.grade !== '').length, 0);
    const numbers = RECS.reduce((n, r) => n + r.items.filter(i => typeof i.grade === 'number').length, 0);
    const tiles = [...document.querySelectorAll('#kpis .kpi')].map(k => k.id);
    const legend = [...document.querySelectorAll('#kpiMix .legend button')].map(x => x.textContent.trim());
    const pills = [...document.querySelectorAll('#fleetTbl td:nth-child(2) .pill')].map(x => x.textContent.trim());
    return { letters, numbers, tiles, legend, pills: pills.slice(0, 3), drill: drill.sev, chip: [...document.querySelectorAll('#chips .chip b')].map(x => x.textContent), last: renderKpis.last };
  });
  ok('every grade off the folder is a number (the fixture ships letters on every seventh round)', d1.letters === 0 && d1.numbers > 30, J({ l: d1.letters, n: d1.numbers }));
  ok('Critical, Severe and Degraded headlines; a five-step mix; pills that say the number and the name',
     d1.tiles.slice(0, 3).join() === 'kpiCrit,kpiSev,kpiDeg' && d1.legend.length === 5 && /^5 – Critical/.test(d1.legend[0]) && d1.pills.every(x => /^[1-5] – /.test(x)), J(d1));
  ok('an old address (?sev=CRI) opens as a grade-5 drill', d1.drill === 5 && d1.chip.some(c => /5 – Critical/.test(c)), J({ d: d1.drill, c: d1.chip }));
  const d2 = await q.evaluate(async () => {
    setDrill('sev', 5); await new Promise(r => setTimeout(r, 200));       // clear
    const all = document.querySelectorAll('#fleetTbl tbody tr').length;
    kpiGo('deg'); await new Promise(r => setTimeout(r, 300));
    const deg = { rows: document.querySelectorAll('#fleetTbl tbody tr').length, hash: location.hash, pills: [...document.querySelectorAll('#fleetTbl td:nth-child(2) .pill')].map(x => x.textContent.trim()) };
    setDrill('sev', 3); await new Promise(r => setTimeout(r, 200));
    const s = gSearch('grade 5'), s2 = gSearch('severe'), s3 = gSearch('critical');
    return { all, deg, find5: s ? s.hit.find.length : -1, findSevere: s2 ? s2.hit.find.length : -1, findCrit: s3 ? s3.hit.find.length : -1, last: renderKpis.last };
  });
  ok('the Degraded headline drills to grade 3 and the address says so', d2.deg.rows > 0 && /sev=3/.test(d2.deg.hash) && d2.deg.pills.every(x => /^3 – /.test(x)), J(d2.deg));
  ok('global search finds a grade by number and by name', d2.find5 > 0 && d2.findCrit > 0 && d2.findSevere === 0, J({ f5: d2.find5, fc: d2.findCrit, fs: d2.findSevere }));
  const df = await q.evaluate(async () => {
    const sel = document.getElementById('fGrade');
    const opts = [...sel.options].map(o => o.textContent);
    sel.value = '4'; sel.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 250));
    const four = { drill: drill.sev, chip: [...document.querySelectorAll('#chips .chip b')].map(x => x.textContent), rows: document.querySelectorAll('#fleetTbl tbody tr').length };
    kpiGo('crit'); await new Promise(r => setTimeout(r, 250));
    const boxAfterTile = sel.value;
    clearFilters(); await new Promise(r => setTimeout(r, 250));
    return { opts, four, boxAfterTile, cleared: sel.value, drillCleared: drill.sev };
  });
  ok('the grade filter offers All grades and 1 – Normal … 5 – Critical, and is the same drill the headlines set',
     df.opts.length === 6 && /All grades/.test(df.opts[0]) && df.opts[4] === '4 – Severe' && df.four.drill === 4 && df.four.chip.some(c => /4 – Severe/.test(c))
     && df.boxAfterTile === '5' && df.cleared === '' && !df.drillCleared, J(df));
  const d3 = await q.evaluate(async () => {
    const blobs = []; const oc = URL.createObjectURL; URL.createObjectURL = bl => { blobs.push(bl); return oc(bl); };
    const clk = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
    try { showTab('actions'); await new Promise(r => setTimeout(r, 200)); document.getElementById('csvBtn').onclick(); }
    finally { URL.createObjectURL = oc; HTMLAnchorElement.prototype.click = clk; }
    const txt = await blobs[0].text();
    const lines = txt.split(/\r?\n/); const head = lines[0].split(','); const row = lines[1] ? lines[1].split(',') : [];
    return { head: head.slice(0, 5), gi: head.indexOf('"Grade"'), gn: head.indexOf('"GradeName"'), g: row[head.indexOf('"Grade"')], n: row[head.indexOf('"GradeName"')], rows: lines.length - 1 };
  });
  ok('the Maintenance Actions CSV carries Grade as the number and GradeName beside it', d3.gi >= 0 && d3.gn >= 0 && /^"[1-5]"$/.test(d3.g) && /^"(Normal|Incipient|Degraded|Severe|Critical)"$/.test(d3.n), J(d3));
  const d4 = await q.evaluate(() => {
    const r = RECS.find(x => x.items.some(i => i.grade === 5)); openEdit(ekOf(r));
    const sel = document.querySelector('#edItems select[data-f="grade"]');
    const opts = [...sel.options].map(o => o.textContent);
    const sevout = !!document.querySelector('#edItems [data-sevout]');
    const why = document.querySelector('#edItems [data-gwhy]');
    const hidden0 = why.classList.contains('hidden');
    sel.value = '3'; sel.dispatchEvent(new Event('change'));
    const hidden1 = why.classList.contains('hidden');
    sel.value = '5'; sel.dispatchEvent(new Event('change'));
    const hidden2 = why.classList.contains('hidden');
    closeEdit();
    return { opts, sevout, hidden0, hidden1, hidden2 };
  });
  ok('the correction panel offers 1–5 with the round meaning, no severity field, and asks why only when lowering',
     d4.opts.length === 6 && /^3 – Degraded — Fine metal filings$/.test(d4.opts[3]) && !d4.sevout && d4.hidden0 && !d4.hidden1 && d4.hidden2, J(d4));
  const d5 = await q.evaluate(() => ({ hex4: CMR.GRADE_HEX[4], x: CMR.gradeNum('X'), c: CMR.gradeNum('c'), n: CMR.gradeNum(4), legend: [...document.querySelectorAll('#sevLegend span')].length }));
  ok('the report engine reads letters and numbers alike and has five colours', d5.x === 5 && d5.c === 3 && d5.n === 4 && /^#/.test(d5.hex4) && d5.legend >= 5, J(d5));
  ok('dashboard: no page errors', qerrs.length === 0, qerrs.slice(0, 3).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nALL PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(String(e && e.stack || e).slice(0, 800)); process.exit(1); });
