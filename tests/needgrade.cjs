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
  await p.click('#saveBtn'); await p.waitForTimeout(500);
  let d = await dlgTxt(p);
  ok('Save refuses', (await p.evaluate(async () => (await dbAll()).length)) === 0, d.slice(0, 80));
  ok('and says a grade is needed, naming the position', d.indexOf(await p.evaluate(() => t('m_need_g_t'))) >= 0 && d.indexOf(first) >= 0, d.slice(0, 120));
  await closeDlg(p);
  await p.evaluate(() => document.querySelector('#gradeSeg [data-g="1"]').click());
  await p.waitForTimeout(200);
  await p.click('#saveBtn'); await p.waitForTimeout(600);
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
  await p.click('#saveBtn'); await p.waitForTimeout(700);
  d = await dlgTxt(p);
  ok('it saves without a grade — its reading is its condition', /Saved|saved on this phone/i.test(d), d.slice(0, 100));
  await closeDlg(p);
  const ucg = await p.evaluate(async () => { const r = (await dbAll()).find(x => x.equip === 'DZ002'); const e = recToExport(r);
    const it = e.items.find(i => i.wearPct !== '' && i.wearPct != null); return { g: e.g, pct: it ? it.wearPct : null, want: it ? GRADE.fromWorn(it.wearPct) : null, row: teamRow(e).g }; });
  ok('and leaves with g scored from its remaining life', ucg.pct != null && ucg.g === ucg.want && ucg.row === ucg.g, JSON.stringify(ucg));

  await ctx.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); srv.close(); process.exit(1); });
