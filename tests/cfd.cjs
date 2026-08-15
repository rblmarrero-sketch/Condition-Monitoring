/* Stage 2 / F2 in the dashboard: a clash is visible, both versions are offered,
   and choosing one changes what the reports count without deleting anything. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8094';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };
const seed = () => fetch(B + '/__seed').then(r => r.text());
const files = () => fetch(B + '/__files').then(r => r.json());
const edMsg = p => p.textContent('#edMsg').then(s => s.trim());
const KEY = 'TK146|2026-03-09|MP';
const rec = p => p.evaluate(k => CMDash.allRecs()
  .find(r => `${r.equip}|${r.date}|${r.type}` === k) || null, KEY);
const edSettled = p => p.waitForFunction(() => {
  const s = document.getElementById('edMsg').textContent.trim();
  return s && !/^(Saving|Deleting|Recording)/.test(s); }, null, { timeout: 20000 });

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
/* A second phone uploading the same unit, date and type — through the real
   /exec, so the script decides what happens, not the test. */
function rival(dev, by, nItems) {
  const items = Array.from({ length: nItems }, (_, i) =>
    ({ key: 'P' + i, label: 'Position ' + i, grade: 'X', sev: 'CRI',
       defect: 'Chunks — spalling', defectCode: 'DT14-05', action: 'REP', actionLabel: 'Repair now' }));
  const body = { type: 'cm-inspection-entries', version: 2,
    records: [{ equip: 'TK146', date: '2026-03-09', type: 'MP', cls: 'HT', by, dev, items }] };
  return fetch(B + '/exec', { method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ name: 'TK146_09.03.2026_MP.json', folder: 'MP/2026-03',
      contentType: 'application/json', dev, file: b64(JSON.stringify(body)) }) }).then(r => r.json());
}

async function dash(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await p.evaluate(u => { openData();
    document.getElementById('drvUrl').value = u; document.getElementById('drvSec').value = ''; }, B + '/exec');
  await p.click('#drvGo');
  await p.waitForFunction(() => /^(✅|❌|No inspections)/.test(
    document.getElementById('drvMsg').textContent.trim()), null, { timeout: 20000 });
  return { ctx, p };
}
const reload = async p => {
  await p.click('#edClose').catch(() => {});
  await p.evaluate(() => openData());
  await p.click('#drvFull');
  await p.waitForFunction(() => /^(✅|❌|No inspections)/.test(
    document.getElementById('drvMsg').textContent.trim()), null, { timeout: 20000 });
  await p.click('#dataClose');
};
const openHist = async (p, unit) => {
  await p.click('nav.tabs button[data-tab="equipment"]'); await p.waitForTimeout(200);
  await p.selectOption('#equipSel', unit); await p.waitForTimeout(300);
};

(async () => {
  const b = await chromium.launch();
  await seed();
  const r = await rival('DBBBB', 'O. Petrova', 4);
  ok('the script kept the rival', r.ok && r.kept === true && r.conflict === KEY, JSON.stringify(r));

  const { ctx, p } = await dash(b);
  await p.click('#dataClose');

  console.log('the clash is visible without hunting for it');
  ok('the Drive card says a decision is waiting',
    /decision/i.test(await p.textContent('#stDrive')), await p.textContent('#stDrive'));
  ok('the dashboard counts it once, not twice',
    (await p.evaluate(() => CMDash.allRecs().filter(r => r.equip === 'TK146' && r.date === '2026-03-09').length)) === 1);
  const before = await rec(p);
  ok('both devices are known to the record',
    JSON.stringify((before._devs || []).slice().sort()) === '["DAAAA","DBBBB"]', JSON.stringify(before._devs));
  ok('it is marked unresolved', before._conflict === true);
  ok('the other version is held, not dropped',
    (before._rivals || []).length === 1, JSON.stringify(before._rivals));

  await openHist(p, 'TK146');
  const hist = await p.textContent('#history');
  ok('the history row is flagged', /CONFLICT/.test(hist));

  console.log('\nchoosing which one stands');
  await p.click(`[data-edit="${KEY}"]`); await p.waitForTimeout(300);
  ok('the edit panel shows the choice', !(await p.getAttribute('#edCfCard', 'class')).includes('hidden'));
  const devBtns = await p.$$eval('#edCfList [data-keep]', bs => bs.map(x => x.dataset.keep).sort());
  ok('both devices are offered', JSON.stringify(devBtns) === '["DAAAA","DBBBB"]', JSON.stringify(devBtns));
  ok('neither is marked in use yet', !/in use/.test(await p.textContent('#edCfList')));

  await p.click('#edCfList [data-keep="DAAAA"]'); await edSettled(p);
  ok('it insists on a name first', /name/i.test(await edMsg(p)), await edMsg(p));
  await p.fill('#edBy', 'R. Marrero');
  await p.click('#edCfList [data-keep="DBBBB"]'); await edSettled(p);
  ok('the choice is confirmed', /DBBBB/.test(await edMsg(p)), await edMsg(p));

  const after = await rec(p);
  ok('the chosen version is now the record', (after.items || []).length === 4, String((after.items || []).length));
  ok('by the inspector who took it', after.by === 'O. Petrova', after.by);
  ok('the flag is cleared', after._conflict === false && after._keep === 'DBBBB',
    JSON.stringify({ c: after._conflict, k: after._keep }));
  ok('and the card stops asking', !/decision/i.test(await p.textContent('#stDrive')),
    await p.textContent('#stDrive'));

  const f = await files();
  ok('nothing was deleted to get there',
    f.files.filter(n => /TK146_09\.03\.2026_MP(~\w+)?\.json$/.test(n)).length === 2, JSON.stringify(f.files));
  ok('and nothing was trashed', f.trashed.filter(n => /TK146_09\.03\.2026_MP\.json$/.test(n)).length === 0,
    JSON.stringify(f.trashed));

  console.log('\nthe decision survives a full re-read');
  await reload(p);
  const back = await rec(p);
  ok('still the chosen version', (back.items || []).length === 4 && back.by === 'O. Petrova',
    `${(back.items || []).length} / ${back.by}`);
  ok('still resolved', back._conflict === false && back._keep === 'DBBBB', JSON.stringify(back._keep));

  console.log('\nchanging your mind');
  await openHist(p, 'TK146');
  await p.click(`[data-edit="${KEY}"]`); await p.waitForTimeout(300);
  ok('the current choice is marked', /in use/.test(await p.textContent('#edCfList')),
    await p.textContent('#edCfList'));
  ok('the button for the version in use is disabled',
    await p.getAttribute('#edCfList [data-keep="DBBBB"]', 'disabled') !== null);
  await p.fill('#edBy', 'R. Marrero');
  await p.click('#edCfList [data-keep="DAAAA"]'); await edSettled(p);
  const flip = await rec(p);
  ok('the other version takes over', (flip.items || []).length === 1 && flip.by === 'B. Ivanov',
    `${(flip.items || []).length} / ${flip.by}`);

  console.log('\nRussian');
  await p.evaluate(() => document.querySelector('.lang button[data-lang="ru"]').click());
  await p.waitForTimeout(200);
  ok('the conflict card is translated', /телефона/.test(await p.textContent('#edCfCard')),
    (await p.textContent('#edCfCard')).slice(0, 60));
  ok('no English left in the choice list', !/Use this one|Device /.test(await p.textContent('#edCfList')),
    await p.textContent('#edCfList'));

  await ctx.close(); await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
