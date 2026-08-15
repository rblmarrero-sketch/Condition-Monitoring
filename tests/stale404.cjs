/* A deployment that reads but cannot be written to.

   Reported from the field: the delete panel showed "HTTP 404 — <!DOCTYPE html>
   <html lang="en"><head><meta name="description" content="Web word processing,
   presentations and spreadsheets"…" — a hundred and sixty characters of
   Google's Docs 404 page, pasted where the reason should be. Records had loaded
   fine, so nothing before that moment suggested anything was wrong.

   The cause is a deployment released before doPost existed: GET is answered,
   POST is not. Two things have to be true now — the message has to name that,
   and Test connection has to find it before somebody discovers it while trying
   to delete something. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const open = async (p, url, sec) => {
  await p.evaluate(({ u, s }) => {
    localStorage.setItem('cm_drive_url', u);
    localStorage.setItem('cm_drive_sec', s || '');
    localStorage.removeItem('cm_dash_canwrite');
    localStorage.removeItem('cm_dash_candelete');
  }, { u: url, s: sec });
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1500);
};
const test = async p => {
  await p.evaluate(() => openData());
  await p.waitForTimeout(300);
  await p.click('#drvTest');
  await p.waitForFunction(() => !document.getElementById('drvTest').disabled, null, { timeout: 30000 });
  await p.waitForTimeout(200);
  return p.textContent('#drvMsg');
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1500);

  console.log('  a healthy deployment still reports healthy');
  await open(p, B + '/exec', '');
  const good = await test(p);
  ok('it connects and names the folder', /Connected/.test(good) && /Condition Monitoring/.test(good), good.trim().slice(0, 90));
  ok('and does not cry wolf about writing', !/writing does not/i.test(good));
  ok('the write flag is set to yes', await p.evaluate(() => localStorage.getItem('cm_dash_canwrite')) === '1');

  console.log('\n  the deployment from the report: reads fine, POST 404s');
  await open(p, B + '/stale', '');
  const stale = await test(p);
  ok('Test connection catches it', /writing does not/i.test(stale), stale.trim().slice(0, 120));
  ok('it still says reading works, because it does', /Connected|folder/i.test(stale));
  ok('and it is flagged, not quietly green', /⚠️/.test(stale));
  ok('the write flag is set to no', await p.evaluate(() => localStorage.getItem('cm_dash_canwrite')) === '0');

  console.log('\n  no HTML is pasted into the panel, ever');
  ok('no doctype in the message', !/<!DOCTYPE|<html/i.test(stale), stale.trim().slice(0, 120));
  ok('no meta tag either', !/meta name=/i.test(stale));
  ok('it names the fix', /New version|Manage deployments/i.test(stale), stale.trim().slice(-90));

  console.log('\n  the delete panel says the same thing, before the button is pressed');
  const rec = await p.evaluate(async () => {
    const r = (window.CMDash.allRecs() || [])[0];
    if (!r) return null;
    openEdit(`${r.equip}|${r.date}|${r.type}`);
    const n = document.getElementById('edDelOff');
    return { note: n ? n.textContent : '', cls: n ? n.className : '' };
  });
  ok('there is a record to open', !!rec, rec ? '' : 'none loaded');
  if (rec) {
    ok('the note explains the deployment, not the password',
      /reads but not writes/i.test(rec.note), rec.note.slice(0, 100));
    ok('it names the fix here too', /New version/i.test(rec.note));
    ok('and it is styled as a warning', rec.cls === 'note', rec.cls);
  }

  console.log('\n  a correction attempted anyway fails in words, not in markup');
  const err = await p.evaluate(async () => {
    try { await window.CMDrive.saveEdit({ key: 'TK101|2026-07-02|MP', by: 'R. Marrero', note: 'x' }); return 'no error'; }
    catch (e) { return e.message; }
  });
  ok('the thrown message is prose', !/<!DOCTYPE|<html|meta name=/i.test(err), err.slice(0, 110));
  ok('it says which half is broken', /older version|no doPost/i.test(err), err.slice(0, 110));
  ok('and it does not blame the password', !/password/i.test(err));

  console.log('\n  a deployment behind a login wall says so instead');
  await open(p, B + '/locked', '');
  const locked = await p.evaluate(async () => {
    try { await window.CMDrive.saveEdit({ key: 'TK101|2026-07-02|MP', by: 'x', note: 'y' }); return 'no error'; }
    catch (e) { return e.message; }
  });
  ok('it names "Who has access"', /Who has access/i.test(locked), locked.slice(0, 110));
  ok('and not the deployed version', !/older version/i.test(locked));

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); process.exit(1); });
