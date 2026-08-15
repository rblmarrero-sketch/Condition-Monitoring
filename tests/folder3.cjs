/* Where a round lands on Drive: inspection type, then machine, then the day.
   A month folder is every machine's rounds in one pile; a unit folder is that
   machine's own history, which is how anyone actually goes looking. The risk
   in changing a folder default is not the new layout — it is overwriting a
   folder someone typed themselves, and breaking the older placeholders whose
   names are prefixes of the new one. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8085';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* A service worker still installing from a previous page can serve the shell
   before its scripts are all in place, so "the version rendered" is not on its
   own proof the app is usable. Wait for something the tests actually call. */
const settled = async p => {
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForFunction(() => typeof expandFolder === 'function' && typeof loadDests === 'function',
                          null, { timeout: 20000 });
  await p.waitForTimeout(400);
};
const dismiss = async p => { for (let i = 0; i < 3; i++) {
  if (await p.evaluate(() => document.getElementById('dlg').open)) { await p.click('#dlgOk'); await p.waitForTimeout(250); } else break; } };

const CTX = { equip: 'DZ004', date: '2026-06-14', type: 'MP' };
const NEW = '{TYPE}/{UNIT}/{YYYY-MM-DD}';

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });

  /* ---------------------------------------------------------------- 1 */
  console.log('the placeholders');
  let p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(p);

  const ex = await p.evaluate(c => ({
    dflt:  expandFolder(FOLDER_DEFAULT, c),
    day:   expandFolder('{YYYY-MM-DD}', c),
    month: expandFolder('{YYYY-MM}', c),
    year:  expandFolder('{YYYY}', c),
    parts: expandFolder('{YYYY}/{MM}/{DD}', c),
    named: expandFolder('{TYPENAME}/{UNIT}', c),
    mixed: expandFolder('{YYYY-MM-DD}/{YYYY-MM}/{YYYY}', c),
  }), CTX);
  ok('the default is type / unit / day', ex.dflt === 'MP/DZ004/2026-06-14', ex.dflt);
  ok('{YYYY-MM-DD} is the inspection date', ex.day === '2026-06-14', ex.day);
  /* {YYYY-MM-DD} contains {YYYY-MM}, which contains {YYYY}. Substituted in the
     wrong order the longest one comes out as "2026-06-DD". */
  ok('{YYYY-MM} still means the month, not a mangled day', ex.month === '2026-06', ex.month);
  ok('{YYYY} still means the year', ex.year === '2026', ex.year);
  ok('and all three survive in one template', ex.mixed === '2026-06-14/2026-06/2026', ex.mixed);
  ok('the separate parts are unchanged', ex.parts === '2026/06/14', ex.parts);
  ok('{TYPENAME} and {UNIT} are unchanged', ex.named === 'Magnetic Plug/DZ004', ex.named);

  const late = await p.evaluate(() => expandFolder(FOLDER_DEFAULT,
    { equip: 'TK151', date: '2026-01-03', type: 'UC' }));
  ok('a round entered late files under the day it was done, not today',
     late === 'UC/TK151/2026-01-03', late);
  await p.close();

  /* ---------------------------------------------------------------- 2 */
  console.log('\nthe one-time upgrade');
  const folderOf = async (stored) => {
    const q = await ctx.newPage();
    q.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    await q.addInitScript(s => {
      localStorage.clear();
      if (s === null) return;                 // never configured: the fresh-install path
      localStorage.setItem('up_dests', JSON.stringify([
        { id: 'gas', on: true, url: 'https://x.invalid/exec', sec: '', folder: s },
        { id: 'pa', on: false, url: 'https://off.invalid/', sec: '', folder: '' },
        { id: 'post', on: false, url: 'https://off.invalid/', sec: '', folder: '' },
      ]));
    }, stored);
    await q.goto(B + '/mobile/index.html', { waitUntil: 'load' });
    await settled(q);
    const f = await q.evaluate(() => loadDests().find(d => d.id === 'gas').folder);
    await q.close();
    return f;
  };
  const fresh = await folderOf(null);
  ok('a phone that has never been configured gets the shipped default', fresh === NEW, fresh);
  const m1 = await folderOf('{YYYY-MM}');
  ok('a phone on the first default is moved forward', m1 === NEW, m1);
  const m2 = await folderOf('{TYPE}/{YYYY-MM}');
  ok('a phone on the second default is moved forward', m2 === NEW, m2);
  const typed = await folderOf('Inspections/{UNIT}');
  ok('a folder someone typed is left exactly alone', typed === 'Inspections/{UNIT}', typed);
  const other = await folderOf('{TYPE}/{YYYY}');
  ok('and so is an older-looking one that is not the built-in string',
     other === '{TYPE}/{YYYY}', other);

  /* ---------------------------------------------------------------- 3 */
  console.log('\na round actually filed');
  p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(u => { localStorage.clear();
    localStorage.setItem('up_dests', JSON.stringify([
      // the folder a real phone carries once the upgrade above has run
      { id: 'gas',  on: true,  url: u, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' },
      { id: 'pa',   on: false, url: 'https://off.invalid/', sec: '', folder: '' },
      { id: 'post', on: false, url: 'https://off.invalid/', sec: '', folder: '' },
    ])); }, B + '/exec');
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(p);
  await p.evaluate(u => fetch(u + '/__reset'), B);

  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => selectEquip('DZ004'));
  await p.waitForTimeout(400);
  await p.fill('#inspector', 'R. Marrero');
  await p.fill('#smu', '6100');
  await p.evaluate(() => {
    const k = items()[0].k; curItem = k; loadPos();
    const pp = curP(); pp.grade = 'C'; pp.sev = 'DEG'; pp.defect = 'DT14-03';
    pp.cause = 'CA-WEAR'; pp.action = 'RA-04'; pp.prio = 'P2';
    saveCur();
  });
  const today = await p.evaluate(() => document.getElementById('date').value);
  await p.click('#saveBtn'); await p.waitForTimeout(600); await dismiss(p);
  await p.evaluate(async () => {
    for (let i = 0; i < 60; i++) {
      if (!(await dbAll()).filter(r => !r.up).length) return;
      await new Promise(r => setTimeout(r, 400));
    }
  });
  const seen = await p.evaluate(async (u) => (await (await fetch(u + '/__log')).json()), B);
  ok('the round arrived', seen.log.length >= 1, seen.log.length + ' files');
  const paths = [...new Set(seen.log.map(f => f.folder))];
  ok('every file of the round went to one folder', paths.length === 1, paths.join(' | '));
  ok('and that folder is type / unit / day', paths[0] === 'MP/DZ004/' + today, paths[0]);
  ok('three levels, which the Drive reader walks — its depth cap is five',
     paths[0].split('/').length === 3, String(paths[0].split('/').length));

  await b.close();
  console.log(fails.length ? '\nFAILURES:\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})();
