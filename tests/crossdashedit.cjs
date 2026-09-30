/* TWO DASHBOARDS, ONE BACKEND, THE SAME RECORD.

   dashboard/index.html and dashboard-next/index.html are now both permanent
   (CLAUDE.md's "TWO OFFICE DASHBOARDS, BOTH PERMANENT") and both load the
   identical dashboard/drive.js, so both funnel a correction or a conflict
   resolution through the exact same saveEdit()/resolveConflict() handlers in
   the exact same deployed docs/yandex/function.js. Asked plainly: if one
   desk edits a round's disposition while the other has the same round open,
   or one resolves a conflict a moment after the other already did, is the
   loser handled the way this project's revision/conflict machinery already
   handles a clash, or silently destroyed?

   Checked against the real function — not inferred from reading it, given
   how many "looked correct, wasn't" bugs this project has already turned up
   (see toctou.cjs, cf.cjs) — it was the latter. Two direct POSTs to the real
   backend, `by` differing to stand in for two different desks, confirmed:
   saveEdit()'s putObj() and resolveConflict()'s putObj() each unconditionally
   replaced whatever was there, with no rival check, no trace, no marker —
   the second dashboard to save simply erased the first's note, fields,
   assignments, or resolution outright. saveOne() (the phone's own round
   upload) has had a rival check since early in this project; these two
   dashboard-only paths never did, because a dashboard has no device id to
   build a rival filename from and no reader that would recognise one.

   The fix does not make the two writes atomic — that would need a device
   concept and a rival-file reader neither of these two documents has ever
   had, and retrofitting one under time pressure was explicitly rejected in
   favour of something smaller and certain: reuse rewriteObject()'s own
   backup-before-overwrite pattern (_meta/backup/<stamp>/<key>, already
   excluded from being read back as a live record). The prior document is
   backed up before every overwrite in both functions, so the loser is
   recoverable rather than gone, and the response carries an `overwrote`
   field naming who and when it happened whenever a real prior document —
   from a different author, or an already-resolved conflict with a different
   decision — is what got replaced.

   This drives it through two REAL dashboard pages, not through a bare POST:
   dashboard/index.html and dashboard-next/index.html, each in its own
   browser context, each calling its own loaded CMDrive.saveEdit()/
   CMDrive.resolve() against the same tests/ya-srv.cjs backend — the exact
   two-sessions-same-record scenario asked about, using the production code
   path each dashboard actually runs, not a hand-rolled stand-in for it.

   Run: node tests/crossdashedit.cjs   (spawns tests/ya-srv.cjs) */
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8146, B = `http://127.0.0.1:${PORT}`, EXEC = B + '/exec';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(PORT), 'NONE'], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

const keys = async () => (await (await fetch(B + '/__keys')).json()).keys;
const readKey = async k => {
  const r = await (await fetch(EXEC + '?action=file&id=' + encodeURIComponent(k))).json();
  if (!r.ok) return null;
  return JSON.parse(Buffer.from(r.data, 'base64').toString('utf8'));
};
const putRaw = (k, body) => fetch(B + '/__put?key=' + encodeURIComponent(k) + '&type=application/json', {
  method: 'POST', body: JSON.stringify(body) });

async function boot(b, file) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(url => { localStorage.setItem('cm_drive_url', url); }, EXEC);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/' + file, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMDrive && CMDrive.url, null, { timeout: 15000 });
  return { ctx, p, errs };
}

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(EXEC); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  const b = await chromium.launch();
  const dashA = await boot(b, 'dashboard/index.html');       // dashboard/
  const dashB = await boot(b, 'dashboard-next/index.html');  // dashboard-next/

  console.log('\n1. A CORRECTION SAVED ON dashboard-next/ MOMENTS AFTER dashboard/ SAVED ITS OWN');
  const KEY = 'TK900|2026-01-15|MP';
  const rA = await dashA.p.evaluate(payload => CMDrive.saveEdit(payload),
    { key: KEY, by: 'R. Marrero (dashboard)', note: 'from dashboard classic' });
  ok('  dashboard/\'s own save succeeds', rA && rA.ok === true, JSON.stringify(rA));
  ok('  and is not itself flagged as overwriting anything (nothing existed yet)', !rA.overwrote, JSON.stringify(rA));

  const rB = await dashB.p.evaluate(payload => CMDrive.saveEdit(payload),
    { key: KEY, by: 'B. Ivanov (dashboard-next)', note: 'from dashboard-next' });
  ok('  dashboard-next/\'s own save also succeeds — it is not refused or silently dropped',
     rB && rB.ok === true, JSON.stringify(rB));
  ok('  and the reply says whose edit it just replaced',
     rB.overwrote && rB.overwrote.by === 'R. Marrero (dashboard)', JSON.stringify(rB.overwrote));

  const liveEdit = await readKey('_meta/TK900_15.01.2026_MP.edit.json');
  ok('  the live document is dashboard-next\'s — the later save, as intended',
     liveEdit && liveEdit.by === 'B. Ivanov (dashboard-next)' && liveEdit.note === 'from dashboard-next',
     JSON.stringify(liveEdit));

  const allKeys = await keys();
  const backupKey = allKeys.find(k => /^_meta\/backup\/.*TK900_15\.01\.2026_MP\.edit\.json$/.test(k));
  ok('  dashboard/\'s own edit was backed up, not destroyed', !!backupKey, allKeys.filter(k => /backup/.test(k)).join(', '));
  if (backupKey) {
    const backedUp = await readKey(backupKey);
    ok('  and the backup holds dashboard/\'s actual note, recoverable',
       backedUp && backedUp.by === 'R. Marrero (dashboard)' && backedUp.note === 'from dashboard classic',
       JSON.stringify(backedUp));
  }

  console.log('\n2. A CONFLICT RESOLVED ON dashboard/ MOMENTS AFTER dashboard-next/ ALREADY RESOLVED IT');
  const CKEY = 'TK901|2026-01-16|MP';
  const CNAME = '_meta/TK901_16.01.2026_MP.conflict.json';
  await putRaw(CNAME, { type: 'cm-record-conflict', version: 1, key: CKEY, at: new Date(0).toISOString(),
    devices: [{ dev: 'DAAAA', file: 'TK901_16.01.2026_MP.json' }, { dev: 'DBBBB', file: 'TK901_16.01.2026_MP~DBBBB.json' }],
    resolved: false, keep: '', by: '' });

  const rC = await dashB.p.evaluate(({ k, keep, by }) => CMDrive.resolve(k, keep, by),
    { k: CKEY, keep: 'DBBBB', by: 'B. Ivanov (dashboard-next)' });
  ok('  dashboard-next/\'s resolution succeeds', rC && rC.ok === true, JSON.stringify(rC));
  ok('  and is not flagged as overwriting a real decision (there was none yet)', !rC.overwrote, JSON.stringify(rC));

  const rD = await dashA.p.evaluate(({ k, keep, by }) => CMDrive.resolve(k, keep, by),
    { k: CKEY, keep: 'DAAAA', by: 'R. Marrero (dashboard)' });
  ok('  dashboard/\'s later resolution also succeeds — it is not refused', rD && rD.ok === true, JSON.stringify(rD));
  ok('  and the reply says whose decision it just replaced',
     rD.overwrote && rD.overwrote.by === 'B. Ivanov (dashboard-next)' && rD.overwrote.keep === 'DBBBB',
     JSON.stringify(rD.overwrote));

  const liveConf = await readKey(CNAME);
  ok('  the live marker reflects dashboard/\'s decision — the later write, as intended',
     liveConf && liveConf.keep === 'DAAAA' && liveConf.by === 'R. Marrero (dashboard)', JSON.stringify(liveConf));

  const allKeys2 = await keys();
  /* TK901's key gets backed up TWICE here — once when dashboard-next/'s own
     resolve() backed up the pre-existing, still-unresolved seed marker, and
     again when dashboard/'s later resolve() backed up dashboard-next/'s now-
     resolved one. Both are proof the mechanism runs on every overwrite; the
     one this check needs is whichever backup actually HOLDS dashboard-next/'s
     decision, found by content rather than by guessing which stamp is which. */
  const confBackupKeys = allKeys2.filter(k => /^_meta\/backup\/.*TK901_16\.01\.2026_MP\.conflict\.json$/.test(k));
  ok('  the resolution was backed up at least once, not destroyed', confBackupKeys.length >= 1, confBackupKeys.join(', '));
  const confBackups = await Promise.all(confBackupKeys.map(readKey));
  const backedUpConf = confBackups.find(d => d && d.keep === 'DBBBB' && d.by === 'B. Ivanov (dashboard-next)');
  ok('  and one of the backups holds dashboard-next/\'s actual decision, recoverable',
     !!backedUpConf, JSON.stringify(confBackups));

  console.log('\n3. CONTROL: A SOLO EDIT, TOUCHED ONCE, IS NOT FLAGGED AND BACKS UP NOTHING');
  const before3 = await keys();
  const soloKey = 'TK902|2026-01-17|MP';
  const rSolo = await dashA.p.evaluate(payload => CMDrive.saveEdit(payload),
    { key: soloKey, by: 'R. Marrero (dashboard)', note: 'only ever saved once' });
  ok('  the solo save succeeds', rSolo && rSolo.ok === true, JSON.stringify(rSolo));
  ok('  carries no overwrote field — nothing was actually replaced', !rSolo.overwrote, JSON.stringify(rSolo));
  const after3 = await keys();
  ok('  and creates no backup at all — there was nothing prior to preserve',
     after3.filter(k => /backup/.test(k)).length === before3.filter(k => /backup/.test(k)).length,
     `${before3.length} -> ${after3.length} total keys`);

  console.log('\n4. CONTROL: SAVING THE SAME EDIT AGAIN FROM THE SAME DESK IS NOT MISREAD AS A CLASH');
  const rResave = await dashA.p.evaluate(payload => CMDrive.saveEdit(payload),
    { key: soloKey, by: 'R. Marrero (dashboard)', note: 'a small correction to my own note' });
  ok('  the re-save succeeds', rResave && rResave.ok === true, JSON.stringify(rResave));
  ok('  same author overwriting their own prior note is not reported as a cross-desk clash',
     !rResave.overwrote, JSON.stringify(rResave));

  const noErrs = dashA.errs.length === 0 && dashB.errs.length === 0;
  ok('no page errors on either dashboard', noErrs, dashA.errs.concat(dashB.errs).slice(0, 3).join(' | ') || 'none');

  await dashA.ctx.close(); await dashB.ctx.close(); await b.close(); bye();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); bye(); process.exit(1); });
