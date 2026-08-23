const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const OUT = __dirname + '/out';
require('fs').mkdirSync(OUT, { recursive: true });

const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };
const stats = () => fetch(BASE + '/__stats').then(r => r.json());
const reset = q => fetch(BASE + '/__reset' + (q || '')).then(r => r.text());

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) fails.push('CONSOLE ' + m.text()); });

  // upload-defaults.js carries the REAL production /exec URL, so without this the
  // app would call live Drive through the container proxy and this block would
  // pass or fail depending on the proxy. Pin it to a dead port instead.
  // Only seeds the very first load — this runs on every navigation, and without
  // the guard it would overwrite the mock URL the later blocks configure.
  await p.addInitScript(() => { if (!localStorage.getItem('up_dests'))
    localStorage.setItem('up_dests', JSON.stringify(
      [{ id: 'gas', on: true, url: 'http://127.0.0.1:9/dead', sec: '', folder: '' }])); });

  await reset('?n=25');
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(600);

  console.log('before Drive is set up');
  ok('the card is there and says nothing is pulled', /Nothing pulled yet/.test(await p.textContent('#teamList')),
     (await p.textContent('#teamList')).trim().slice(0, 60));
  await p.evaluate(() => showPane('paneSystem'));
  await p.click('#teamRefresh'); await p.waitForTimeout(300);
  // upload-defaults.js ships a built-in Drive URL, so "no destination" is not the
  // state a real phone starts in — what matters is that an unreachable one explains
  // itself instead of surfacing fetch()'s opaque "Failed to fetch".
  ok('an unreachable Drive explains itself',
     /Could not reach Google Drive|Set up Google Drive/.test(await p.textContent('#teamMsg')),
     (await p.textContent('#teamMsg')).trim());
  ok('and nothing was pulled from the mock', (await stats()).records === 0);

  /* point the app at the mock, the way ⚙ would */
  await p.evaluate(u => {
    localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', on: true, url: u, sec: '', folder: '' }]));
  }, BASE + '/exec');
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1200);

  console.log('\nwith Drive configured');
  let s = await stats();
  ok('pulls the team list on startup', (await p.evaluate(() => teamAll().length)) === 25,
     `${await p.evaluate(() => teamAll().length)} records`);
  ok('in a single request', s.records >= 1 && s.records <= 2, `records=${s.records}`);
  ok('the count badge shows them', (await p.textContent('#teamCount')) === '25', await p.textContent('#teamCount'));
  ok('the list names unit, date and inspector',
     /TK1\d\d/.test(await p.textContent('#teamList')) && /R\. Marrero/.test(await p.textContent('#teamList')),
     (await p.textContent('#teamList')).trim().replace(/\s+/g, ' ').slice(0, 70));

  console.log('\nthe due list now knows about other people\'s rounds');
  const hist = await p.evaluate(() => Object.keys(histAll()).length);
  ok('team inspections feed the last-done index', hist === 25, `${hist} entries`);
  // At the 90-day MP interval nothing from this month is actually due yet, so an
  // empty "overdue & due soon" list is the correct answer — switch to "all units
  // with history" to prove the team's rounds really did land in it.
  await p.evaluate(() => showPane('paneSystem'));
  await p.selectOption('#dueScope', 'all'); await p.waitForTimeout(300);
  const dueTxt = await p.textContent('#dueList');
  ok('team rounds appear in the due list', /TK1\d\d/.test(dueTxt) && !/Nothing due/.test(dueTxt),
     dueTxt.trim().replace(/\s+/g, ' ').slice(0, 70));

  console.log('\nstanding at a unit someone else just did');
  await p.evaluate(() => selectEquip('TK105'));
  await p.waitForTimeout(300);
  const ld = await p.textContent('#lastDone');
  ok('the capture screen warns it was already done', /Last done 2026-07/.test(ld), ld.trim());
  ok('naming who did it', /R\. Marrero/.test(ld));
  await p.evaluate(() => selectEquip('TK900'));
  await p.waitForTimeout(300);
  ok('and stays quiet for a unit with no history',
     await p.evaluate(() => document.getElementById('lastDone').classList.contains('hidden')));

  console.log('\nrefresh with one new inspection');
  await reset('?add=7');
  await p.evaluate(() => showPane('paneSystem'));
  await p.click('#teamRefresh');
  await p.waitForFunction(() => /new|Up to date|⚠/.test(document.getElementById('teamMsg').textContent), null, { timeout: 15000 });
  s = await stats();
  ok('only the new one travels', (await p.evaluate(() => teamAll().length)) === 26,
     `${await p.evaluate(() => teamAll().length)} records in ${s.records} call(s)`);
  ok('and it says so plainly', /1 new/.test(await p.textContent('#teamMsg')),
     (await p.textContent('#teamMsg')).trim());
  await p.evaluate(() => showPane('paneSystem'));
  await p.click('#teamRefresh');
  await p.waitForFunction(() => /Up to date/.test(document.getElementById('teamMsg').textContent), null, { timeout: 15000 });
  ok('a second refresh reports up to date', /Up to date/.test(await p.textContent('#teamMsg')),
     (await p.textContent('#teamMsg')).trim());

  console.log('\noffline');
  await ctx.setOffline(true);
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1200);
  ok('the team list still shows from cache', (await p.evaluate(() => teamAll().length)) === 26,
     String(await p.evaluate(() => teamAll().length)));
  ok('and is rendered, not blank', /TK1\d\d/.test(await p.textContent('#teamList')));
  ok('the due list still works offline', /TK1\d\d/.test(await p.textContent('#dueList')),
     (await p.textContent('#dueList')).trim().replace(/\s+/g, ' ').slice(0, 60));
  await p.evaluate(() => showPane('paneSystem'));
  await p.click('#teamRefresh'); await p.waitForTimeout(400);
  ok('refresh says offline rather than failing', /Offline/.test(await p.textContent('#teamMsg')),
     (await p.textContent('#teamMsg')).trim());
  ok('the equipment list survived offline', (await p.evaluate(() => ASSETS.length)) > 1000,
     `${await p.evaluate(() => ASSETS.length)} units`);
  await p.screenshot({ path: OUT + '/team-offline.png', fullPage: false });
  await ctx.setOffline(false);

  console.log('\nold Google script');
  await p.evaluate(u => {
    localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', on: true, url: u, sec: '', folder: '' }]));
    localStorage.removeItem('cm_team'); localStorage.removeItem('cm_team_cursor');
  }, BASE + '/old');
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(800);
  await p.evaluate(() => showPane('paneSystem'));
  await p.click('#teamRefresh');
  /* Wait for the ANSWER, not for the first thing that appears. The card says
     "checking…" the instant it is pressed, so waiting for non-empty text and
     then reading it twice — once to test, once to print — raced the reply: the
     test read the interim message and the printout read the real one, so this
     failed roughly once in five WITH THE CORRECT MESSAGE quoted beside it,
     which is the worst kind of red there is. One read, of the state that was
     actually being asserted. */
  const said = await p.waitForFunction(() => {
    const s = document.getElementById('teamMsg').textContent.trim();
    return /Deploy|New version/.test(s) ? s : false;
  }, null, { timeout: 15000 }).then(h => h.jsonValue())
    .catch(async () => (await p.textContent('#teamMsg')).trim());
  ok('tells the user to redeploy instead of erroring', /Deploy|New version/.test(said), said);

  console.log(fails.length ? '\nFAILURES:\n  ' + [...new Set(fails)].join('\n  ') : '\nall team-sync checks passed');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
