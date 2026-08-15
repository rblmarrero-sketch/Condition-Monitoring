/* Stage 2 / F2 on the phone: an inspector is told when a round they can see in
   the system was sent twice, so they do not assume the one shown is the only one. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8094';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };
const seed = () => fetch(B + '/__seed').then(r => r.text());
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const post = body => fetch(B + '/exec', { method: 'POST',
  headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }).then(r => r.json());

const rival = (dev, by) => post({ name: 'TK146_09.03.2026_MP.json', folder: 'MP/2026-03',
  contentType: 'application/json', dev, file: b64(JSON.stringify({
    type: 'cm-inspection-entries', version: 2,
    records: [{ equip: 'TK146', date: '2026-03-09', type: 'MP', by, dev,
                items: [{ key: '4C', grade: 'X' }] }] })) });
const resolve = keep => post({ op: 'resolve', key: 'TK146|2026-03-09|MP', keep, by: 'office' });

async function app(b) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(u => localStorage.setItem('up_dests', JSON.stringify(
    [{ id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{YYYY-MM}' }])), B + '/exec');
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  return { ctx, p };
}
const settled = p => p.waitForFunction(() => {
  const s = document.getElementById('teamMsg').textContent.trim();
  return s && !/^(Checking|Проверя)/.test(s); }, null, { timeout: 20000 });
const check = async p => { await p.evaluate(() => { document.getElementById('teamMsg').textContent = ''; });
  await p.evaluate(() => showPane('paneSystem'));
  await p.click('#teamRefresh'); await settled(p); };

(async () => {
  const b = await chromium.launch();
  await seed();
  const r = await rival('DBBBB', 'O. Petrova');
  ok('the script kept both', r.ok && r.kept === true, JSON.stringify(r));

  const { ctx, p } = await app(b);
  await check(p);
  let msg = (await p.textContent('#teamMsg')).trim();
  ok('the pull says a round was sent twice', /sent twice/.test(msg), msg);
  ok('and it does not swallow the normal count', /in the system/.test(msg), msg);

  const list = await p.textContent('#teamList');
  ok('the affected round is marked in the list', /sent twice/.test(list), list.slice(0, 200));
  ok('the untouched rounds are not', (list.match(/sent twice/g) || []).length === 1,
    String((list.match(/sent twice/g) || []).length));

  console.log('\nstanding at the unit');
  await p.evaluate(() => selectEquip('TK146'));
  await p.waitForTimeout(300);
  const last = await p.textContent('#lastDone');
  ok('the point-of-capture line says so too', /sent twice/.test(last), last);

  console.log('\nit survives a reload of the app');
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1200);
  ok('still marked from the cache', /sent twice/.test(await p.textContent('#teamList')));

  console.log('\nonce the office decides');
  await resolve('DBBBB');
  await check(p);
  msg = (await p.textContent('#teamMsg')).trim();
  ok('the warning stops', !/sent twice/.test(msg), msg);
  ok('the list is clean', !/sent twice/.test(await p.textContent('#teamList')));

  console.log('\nan /exec that has not been redeployed');
  // conflicts absent from the reply must not break the pull or clear a real flag
  await p.evaluate(() => { localStorage.setItem('cm_team_conflicts', '{}'); cfCache = null; });
  await check(p);
  ok('a reply with no conflicts is fine', /in the system|Up to date/.test(await p.textContent('#teamMsg')),
    await p.textContent('#teamMsg'));

  await ctx.close(); await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
