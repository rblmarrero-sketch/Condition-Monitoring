/* The office can correct the condition, not just the paperwork around it.

   The correction panel could change severity, recommendation, priority, WO,
   defect, cause and comment — and not the grade. On a magnetic-plug round the
   grade IS the finding: it drives the severity pill, the counts and the colour
   on the sheet. So the office could fix everything except the thing an
   inspector is most likely to have got wrong in the dark at −40, and the only
   route was to void the round and have it captured again.

   This checks the whole way through, because a dropdown that saves nothing is
   worse than no dropdown: it reads as done.

   Run: node tests/edgrade.cjs
*/
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8116, B = `http://127.0.0.1:${PORT}`, EXEC = B + '/exec';
let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };

const srv = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(PORT)], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(EXEC); break; }
    catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.addInitScript(u => { localStorage.setItem('cm_swap_off', '1');
    localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', ''); }, EXEC);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(900);
  await p.evaluate(() => CMDrive.load(null, { full: true }));
  await p.waitForTimeout(900);

  /* The seed's TK146 magnetic-plug round is graded 3 (C, on the old scale) on position 4C. */
  console.log('\na magnetic plug round, graded C at the machine');
  await p.evaluate(() => openEdit('TK146|2026-03-09|MP'));
  await p.waitForTimeout(500);
  ok('the correction panel opens', !(await p.evaluate(() => document.getElementById('editOv').classList.contains('hidden'))));

  const sel = 'select[data-f="grade"][data-k="4C"]';
  ok('  and the condition is a field, not a read-only badge', !!(await p.$(sel)));
  ok('  showing what the inspector recorded',
     (await p.$eval(sel, e => e.value).catch(() => null)) === '3',
     await p.$eval(sel, e => e.value).catch(() => '(missing)'));
  ok('  offering every grade the app can capture',
     (await p.$$eval(sel + ' option', o => o.map(x => x.value).filter(Boolean).join(''))
        .catch(() => '')) === '12345');

  console.log('\nthe office corrects it to 1');
  await p.selectOption(sel, '1');
  await p.fill('#edBy', 'R. Marrero').catch(() => {});
  await p.fill('#edReason', 'Re-read under light — no ferrous debris').catch(() => {});
  await p.click('#edSave');
  await p.waitForTimeout(900);

  /* It has to reach the endpoint, not just the browser. A correction held only
     in this tab is one the next person does not see. */
  const stored = await fetch(EXEC + '?action=records').then(r => r.json())
    .then(j => (j.edits || []).find(e => e.key === 'TK146|2026-03-09|MP'));
  ok('the correction is stored beside the record', !!stored, stored ? 'saved' : '(nothing at the endpoint)');
  ok('  carrying the new grade', !!stored && ((stored.items || {})['4C'] || {}).grade === 1,
     JSON.stringify(stored && stored.items));

  /* And is applied where a reader looks. A correction that saves and does not
     show is the same to a reader as one that never saved.

     Targeted at the corrected ROUND, not at the unit's row: the overview shows
     the latest round for each unit, and TK146 has later ones. Asserting there
     read "still Degraded" against a dashboard that had applied the correction
     perfectly — a test failure wearing the costume of the bug. */
  /* Opened the way a reader opens it — the Equipment page, this unit — since
     build 254 paints a page only when it is shown. */
  await p.evaluate(() => { showTab('equipment', true); const s = document.getElementById('equipSel'); s.value = 'TK146'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(900);
  const card = await p.evaluate(() => {
    const hit = [...document.querySelectorAll('#history *')]
      .filter(e => /2026-03-09/.test(e.textContent || '') && e.children.length < 12);
    const host = hit.length ? hit[hit.length - 1].closest('.rec, .card, section, article, div') : null;
    return { found: !!hit.length, txt: (host ? host.textContent : '').replace(/\s+/g, ' ').trim().slice(0, 220) };
  });
  ok('  the corrected round is on the sheet', card.found, card.txt.slice(0, 80) || '(not rendered)');
  /* C is "Degraded", A is "No fault". The pill is computed from the grade, so
     if the correction reached the record the words change with it. */
  ok('  and reads as corrected, not as captured',
     card.found && !/Degraded/.test(card.txt), card.txt.slice(0, 140));

  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => openEdit('TK146|2026-03-09|MP'));
  await p.waitForTimeout(500);
  ok('and it is still 1 when the panel is opened again',
     (await p.$eval(sel, e => e.value).catch(() => null)) === '1',
     await p.$eval(sel, e => e.value).catch(() => '(missing)'));
  ok('the dashboard raised nothing throughout', !errs.length, errs.slice(0, 2).join(' | ') || 'clean');

  await b.close(); bye();
  console.log(fail ? `\n${fail} FAILED` : '\nthe condition itself can be corrected');
  process.exit(fail ? 1 : 0);
})();
