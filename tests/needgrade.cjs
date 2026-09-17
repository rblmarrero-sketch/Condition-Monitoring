/* A POSITION WITH EVIDENCE NEEDS A GRADE, AND A ROUND CARRIES ITS OWN.

   The audit of build 253 found 47 of the folder's 80 rounds with no graded
   point. Seventeen undercarriage and fourteen dump-body rounds are measured
   and carry their condition in the reading; but eleven plug rounds, three
   inspections and two filter cuts had photographs on every point and a grade
   on none — saved on a build that let a picture through without an
   assessment. Every list downstream said "no condition" for all of them.

   Two rules follow, both here:
     · Save refuses a position that has a photograph, a clip, a defect or a
       comment but no grade — on a graded round type. A measured station is
       not asked: its reading is its condition.
     · The round leaves the phone with `g`, the worst of its positions, a
       measured station scored by its remaining life (GRADE.roundGrade — one
       rule for the phone, the office and the migration). The history row
       carries the same number.

   Run: node tests/needgrade.cjs */
const { chromium } = require(require('./pw.cjs'));
const { PHOTOS } = require('./overview.cjs');
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
const dlgTxt = p => p.evaluate(() => ((document.getElementById('dlg') || {}).textContent || '').replace(/\s+/g, ' ').trim());
const closeDlg = async p => { await p.evaluate(() => { const d = document.getElementById('dlg'); if (d && d.open) d.close(); }); await p.waitForTimeout(150); };
const SHOT = `(function(){ const bytes=new Uint8Array([0xff,0xd8,0xff,0xdb,1,2,3,4,5,6,7,8,9,0xff,0xd9]);
  const p=(draft.positions[curItem] ||= {}); addPos(p, attWrap(new File([bytes],'x.jpg',{type:'image/jpeg'})), 'COMPONENT'); renderMedia(); return (p.photos||[]).length; })()`;

(async () => {
  await new Promise(r => srv.listen(0, r));
  const APP = 'http://127.0.0.1:' + srv.address().port + '/mobile/index.html';
  const b = await chromium.launch();

  console.log('the rule, from the module both ends load');
  {
    const G = require(path.join(ROOT, 'mobile/grade.js'));
    ok('a graded position counts by its grade', G.roundGrade([{ key: '4C', grade: 2 }, { key: '4D', grade: 3 }]) === 3);
    ok('a measured station counts by its remaining life', G.roundGrade([{ key: 'IDLER', wearPct: 85 }]) === G.fromWorn(85) && G.fromWorn(85) === 5);
    ok('the machine\'s own photographs carry none', G.roundGrade([{ key: 'MACHINE', general: 1, grade: 5 }]) === null);
    ok('and nothing recorded is null, not 1', G.roundGrade([{ key: '4C' }, { key: '4D', grade: '' }]) === null);
  }

  console.log('\na plug position photographed and not graded');
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(APP, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => selectEquip('TK147'));
  await p.waitForTimeout(500);
  const first = await p.evaluate(() => { const k = items()[0].k; pickComponent(k); return k; });
  await p.fill('#inspector', 'R. Marrero'); await p.fill('#smu', '6100');
  ok('one photograph on it', (await p.evaluate(SHOT)) === 1);
  await p.evaluate(PHOTOS);
  await p.evaluate(() => goStep(3)); await p.waitForTimeout(200); await p.click('#saveBtn'); await p.waitForTimeout(500);
  let d = await dlgTxt(p);
  ok('Save refuses', (await p.evaluate(async () => (await dbAll()).length)) === 0, d.slice(0, 80));
  ok('and says a grade is needed, naming the position', d.indexOf(await p.evaluate(() => t('m_need_g_t'))) >= 0 && d.indexOf(first) >= 0, d.slice(0, 120));
  await closeDlg(p);
  await p.evaluate(() => document.querySelector('#gradeSeg [data-g="1"]').click());
  await p.waitForTimeout(200);
  await p.evaluate(() => goStep(3)); await p.waitForTimeout(200); await p.click('#saveBtn'); await p.waitForTimeout(600);
  d = await dlgTxt(p);
  ok('graded 1, it saves', /Saved|saved on this phone/i.test(d), d.slice(0, 80));
  await closeDlg(p);
  const mp = await p.evaluate(async () => { const r = (await dbAll()).find(x => x.equip === 'TK147'); const e = recToExport(r); return { g: e.g, row: teamRow(e).g }; });
  ok('the round leaves the phone with g = 1, and its history row says the same', mp.g === 1 && mp.row === 1, JSON.stringify(mp));

  console.log('\na measured undercarriage station is not asked for a grade');
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'UC'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => selectEquip('DZ002'));
  await p.waitForTimeout(600);
  /* The reading is typed, the way an inspector enters it: Save reads the
     field, and a value set on the position behind the field is not a reading. */
  const uc = await p.evaluate(() => { const ks = items().map(i => i.k); pickComponent(ks[0]);
    const mm = document.getElementById('ucMM'); mm.value = '30'; mm.dispatchEvent(new Event('input')); return ks[0]; });
  /* The identity card folds itself away once a round has been saved on this
     phone — the name is kept — so the fields are set by value here. */
  await p.evaluate(() => ['inspector', 'smu'].forEach((id, n) => { const e = document.getElementById(id); e.value = n ? '6100' : 'R. Marrero'; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); }));
  ok('a photograph on the measured station', (await p.evaluate(SHOT)) === 1, uc);
  await p.evaluate(PHOTOS);
  await p.evaluate(() => goStep(3)); await p.waitForTimeout(200); await p.click('#saveBtn'); await p.waitForTimeout(700);
  d = await dlgTxt(p);
  ok('it saves without a grade — its reading is its condition', /Saved|saved on this phone/i.test(d), d.slice(0, 100));
  await closeDlg(p);
  const ucg = await p.evaluate(async () => { const r = (await dbAll()).find(x => x.equip === 'DZ002'); const e = recToExport(r);
    const it = e.items.find(i => i.wearPct !== '' && i.wearPct != null); return { g: e.g, pct: it ? it.wearPct : null, want: it ? GRADE.fromWorn(it.wearPct) : null, row: teamRow(e).g }; });
  ok('and leaves with g scored from its remaining life', ucg.pct != null && ucg.g === ucg.want && ucg.row === ucg.g, JSON.stringify(ucg));

  console.log('\na measured station whose DEFECT silently assigns a grade still has a way to finish it');
  /* Reported from the field on a Dump Body Liner (TB) round: "Can not save
     … its saying need to grade but we dont grade dump body … there is no
     selection for grade thats the problem." The tray genuinely never shows
     the manual 1-5 cards (its condition is its reading, same as UC above) —
     but the defect picker sets a grade on ANY round type when the chosen
     defect carries a defaultSeverity, with no gradeAppliesTo() check of its
     own. renderGradeReq() used to require gradeApplies() too, so a tray
     station holding a silently-assigned 5 had the one box that could ever
     supply its target date and notification tick permanently hidden: Save
     demanded them forever with nothing on screen to give them. Fixed by
     dropping that extra check — the box now shows whenever there is a
     finding-level grade, whatever set it, while the manual cards stay
     hidden exactly as before. */
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'TB'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => selectEquip('TK143')); // Komatsu HM400
  await p.waitForTimeout(600);
  const tb = await p.evaluate(() => {
    const st = ucStatus('TK143');
    const k = (BODY.of(st.model).points[0] || {}).k;
    pickComponent(k);
    return { k, model: st.model };
  });
  await p.evaluate(() => ['inspector', 'smu'].forEach((id, n) => { const e = document.getElementById(id); e.value = n ? '1000' : 'R. Marrero'; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); }));
  await p.evaluate(() => goStep(2)); await p.waitForTimeout(250);
  ok('a tray station with no grade control on screen', await p.evaluate(() => document.getElementById('gradeFld').classList.contains('hidden')), JSON.stringify(tb));
  // "Show all" so the search reaches a defect outside this station's own curated set.
  await p.evaluate(() => { showAllDefects = true; });
  // A measured round folds the coding fields behind isoTog until something is
  // in them — the same reason defectBtn is not on screen by default here.
  await p.click('#isoTog'); await p.waitForTimeout(150);
  await p.click('#defectBtn'); await p.waitForTimeout(300);
  await p.fill('#pickSearch', 'FM-LEK-03'); await p.waitForTimeout(200);
  const hit = await p.$$eval('#pickList .pickitem', a => a.length);
  ok('the defect is found in the picker', hit > 0, hit + ' rows');
  await p.click('#pickList .pickitem'); await p.waitForTimeout(200);
  const after = await p.evaluate(() => ({
    grade: (draft.positions[curItem] || {}).grade,
    gradeFldHidden: document.getElementById('gradeFld').classList.contains('hidden'),
    gradeReqHidden: document.getElementById('gradeReq').classList.contains('hidden'),
  }));
  ok('the defect silently graded the station Critical', after.grade === 5, JSON.stringify(after));
  ok('the manual cards stay hidden — the reading is still the condition', after.gradeFldHidden);
  ok('THE FIX: the box asking for target/notify is now reachable, not stranded', !after.gradeReqHidden, JSON.stringify(after));

  console.log('\nclearing the defect that set an auto grade clears the grade with it');
  /* Read off TK115's F95 in the field: "5 – Critical needs a defect, an
     action, a target date, a comment, a close-up photograph, the
     notification tick" — EVERY field blank, on a station whose manual
     cards are never shown at all. The only code path that can put a grade
     on a measured station is the defect picker above, and it never had a
     mirror for taking one away: tapping a defect, then reconsidering and
     picking a different one — or "none" — left the auto grade standing
     with nothing left to justify it, on a round type with no card to
     notice it on and correct it from. Fixed alongside the box above: the
     same handler now drops an unconfirmed auto grade the moment the
     defect that proposed it stops applying. */
  const st2 = await p.evaluate(() => {
    const s = ucStatus('TK143');
    const k2 = (BODY.of(s.model).points[1] || {}).k;
    pickComponent(k2);
    return k2;
  });
  // isoOpen is already true from opening it on the first station above — a
  // second click here would toggle it back OFF, not open it again.
  await p.click('#defectBtn'); await p.waitForTimeout(300);
  await p.fill('#pickSearch', 'FM-LEK-03'); await p.waitForTimeout(200);
  await p.click('#pickList .pickitem'); await p.waitForTimeout(200);
  const graded = await p.evaluate(() => (draft.positions[curItem] || {}).grade);
  ok('picking the defect grades the second station too', graded === 5, JSON.stringify({ st2, graded }));
  await p.click('#defectBtn'); await p.waitForTimeout(300);
  await p.click('#pickList .pickitem'); await p.waitForTimeout(200); // "— none / OK —" is always first
  const cleared = await p.evaluate(() => ({
    defect: (draft.positions[curItem] || {}).defect,
    grade: (draft.positions[curItem] || {}).grade,
  }));
  ok('THE FIX: clearing the defect clears the orphaned grade with it', !cleared.defect && !cleared.grade, JSON.stringify(cleared));
  await p.evaluate((k) => { saveCur(); pickComponent(k); }, tb.k); // back to F95/H21 to finish the save below
  await p.waitForTimeout(150);

  // Finish what Critical asks for, through the real fields, then save.
  ok('a close-up photograph on the station', (await p.evaluate(SHOT)) === 1);
  // A wear-type round folds the comment behind its own toggle too.
  const ucTog = await p.$('#ucExtraTog');
  if (ucTog && await ucTog.isVisible()) { await ucTog.click(); await p.waitForTimeout(150); }
  await p.fill('#comment', 'Liner plate leaking at the seam');
  await p.click('#actionBtn'); await p.waitForTimeout(250);
  await p.click('#pickList .pickitem:nth-child(2)'); await p.waitForTimeout(150);
  await p.evaluate(() => { const c = document.getElementById('gNotify'); if (c) c.checked = true; c.dispatchEvent(new Event('change')); });
  await p.evaluate(PHOTOS); // the machine-level overview/tray photographs every round needs
  await p.evaluate(() => goStep(3)); await p.waitForTimeout(200); await p.click('#saveBtn'); await p.waitForTimeout(700);
  d = await dlgTxt(p);
  ok('and Save actually goes through — no dead end', /Saved|saved on this phone/i.test(d), d.slice(0, 120));
  await closeDlg(p);

  await ctx.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); srv.close(); process.exit(1); });
