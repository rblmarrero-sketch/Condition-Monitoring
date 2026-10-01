/* TWO DASHBOARDS, ONE BACKEND, THE SAME RECORD — AT THE SAME MOMENT.

   dashboard/index.html and dashboard-next/index.html are both permanent
   (CLAUDE.md's "TWO OFFICE DASHBOARDS, BOTH PERMANENT") and both load the
   identical dashboard/drive.js, so both funnel a correction or a conflict
   resolution through the same saveEdit()/resolveConflict() in the deployed
   docs/yandex/function.js.

   History. Build 489 found that the second desk to save simply erased the
   first's correction, and added a backup of "the prior document" before every
   overwrite. The audit of 2026-10-01 pointed out what that left open: the old
   version of this suite fired its two saves ONE AFTER THE OTHER, so the second
   always read what the first had written. Two saves that genuinely overlap —
   B reads before A writes — both read the same prior, both back up the same
   prior, and A's correction is in neither the live document nor any backup.
   That is reproduced here (§2, run against the pre-fix function it loses A
   outright) and closed by three things in function.js:

     - every read-decide-write of an edit or conflict document runs under a
       per-document lock (withDocLock), so overlapping requests are taken in
       turn and the second reads what the first wrote;
     - a client that names the version it edited (`ifAt`, the server-stamped
       `at`) is REFUSED, loudly, if that is no longer the version on the
       server — the same idea as rewriteObject()'s ifSha;
     - whatever is replaced is still backed up first.

   The in-memory bucket answers in the same tick, which makes a missing lock
   invisible, so this suite runs tests/ya-srv.cjs with CM_BUCKET_DELAY_MS: each
   read and write takes a few milliseconds, as Object Storage does, and two
   requests fired together interleave exactly as two desks' saves do.

   Driven through two REAL pages — dashboard/ and dashboard-next/, each in its
   own browser context, each saving the way the page does (optimistic copy on
   the page, then CMDrive.saveEdit/resolve) — plus raw POSTs for an older
   client that sends no version, and for two phones' rival copies arriving
   together (markConflict).

   Run: node tests/crossdashedit.cjs   (spawns tests/ya-srv.cjs) */
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8146, B = `http://127.0.0.1:${PORT}`, EXEC = B + '/exec';
const DELAY = 25;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(PORT), 'NONE'],
  { stdio: 'ignore', env: Object.assign({}, process.env, { CM_BUCKET_DELAY_MS: String(DELAY) }) });
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
const postRaw = async body => (await fetch(EXEC, { method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })).json();
const backupsOf = async re => {
  const ks = (await keys()).filter(k => /^_meta\/backup\//.test(k) && re.test(k));
  return (await Promise.all(ks.map(readKey))).filter(Boolean);
};
const wait = ms => new Promise(r => setTimeout(r, ms));

async function boot(b, file) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(url => { localStorage.setItem('cm_drive_url', url); }, EXEC);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/' + file, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMDrive && CMDrive.url && window.CMDash && CMDash.editBase, null, { timeout: 15000 });
  return { ctx, p, errs };
}

/* A correction saved the way the page saves one (edPost): the page's own copy
   first, then the upload. The reply — or the refusal — comes back as data. */
const deskSave = (desk, payload) => desk.p.evaluate(async pl => {
  CMDash.setEdits([Object.assign({ at: new Date().toISOString() }, pl)]);
  try { return { ok: true, r: await CMDrive.saveEdit(pl) }; }
  catch (e) { return { ok: false, conflict: !!e.conflict, current: e.current || null, msg: String(e.message || e) }; }
}, payload);
const deskResolve = (desk, k, keep, by) => desk.p.evaluate(async ({ k, keep, by }) => {
  try { return { ok: true, r: await CMDrive.resolve(k, keep, by) }; }
  catch (e) { return { ok: false, conflict: !!e.conflict, current: e.current || null, msg: String(e.message || e) }; }
}, { k, keep, by });
/* What this page now believes the server holds for a key. */
const deskEdit = (desk, k) => desk.p.evaluate(k => {
  const base = CMDash.editBase(k);
  return { base };
}, k);

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(EXEC); break; } catch (e) { await wait(250); }
  }
  const b = await chromium.launch();
  const dashA = await boot(b, 'dashboard/index.html');
  const dashB = await boot(b, 'dashboard-next/index.html');
  const A_BY = 'R. Marrero (dashboard)', B_BY = 'B. Ivanov (dashboard-next)';

  console.log('\n1. BOTH DESKS SAVE THE SAME ROUND IN THE SAME INSTANT — NEITHER HAS SEEN A CORRECTION');
  {
    const KEY = 'TK900|2026-01-15|MP', FILE = '_meta/TK900_15.01.2026_MP.edit.json';
    const [rA, rB] = await Promise.all([
      deskSave(dashA, { key: KEY, by: A_BY, note: 'from dashboard classic' }),
      deskSave(dashB, { key: KEY, by: B_BY, note: 'from dashboard-next' })]);
    const wins = [rA, rB].filter(r => r.ok), refused = [rA, rB].filter(r => !r.ok);
    ok('exactly one of the two saves lands', wins.length === 1, JSON.stringify([rA.ok, rB.ok]));
    ok('the other is REFUSED as a conflict, not silently written over the top',
       refused.length === 1 && refused[0].conflict === true, JSON.stringify(refused[0]));
    const live = await readKey(FILE);
    const winner = rA.ok ? A_BY : B_BY, loser = rA.ok ? dashB : dashA;
    ok('the live document is the one save that was accepted', live && live.by === winner, JSON.stringify(live));
    ok('the refusal hands back what the server holds now — the winner\'s correction',
       refused[0] && refused[0].current && refused[0].current.by === winner, JSON.stringify(refused[0] && refused[0].current));
    ok('the refusal says who changed it, in words', refused[0] && /changed by/.test(refused[0].msg || ''), refused[0] && refused[0].msg);
    await wait(100);
    const lb = await deskEdit(loser, KEY);
    ok('the refused desk now holds the server\'s version, so its next save names it',
       lb.base === String(live && live.at), JSON.stringify(lb) + ' vs ' + (live && live.at));
    const again = await deskSave(loser, { key: KEY, by: loser === dashA ? A_BY : B_BY, note: 're-applied on top' });
    ok('re-applied on top of the version it was shown, the refused desk\'s save lands',
       again.ok === true, JSON.stringify(again));
    ok('and the reply says whose correction it replaced', again.r && again.r.overwrote && again.r.overwrote.by === winner,
       JSON.stringify(again.r && again.r.overwrote));
    const bk = await backupsOf(/TK900_15\.01\.2026_MP\.edit\.json$/);
    ok('the replaced correction is in _meta/backup/, recoverable', bk.some(d => d.by === winner), JSON.stringify(bk.map(d => d.by)));
  }

  console.log('\n2. AN OLDER CLIENT THAT SENDS NO VERSION: TWO SAVES THAT OVERLAP ARE TAKEN IN TURN');
  {
    // Before the lock, both requests read "no document", both backed up nothing,
    // and the first correction was in neither the live file nor any backup.
    const KEY = 'TK903|2026-01-18|MP', FILE = '_meta/TK903_18.01.2026_MP.edit.json';
    await postRaw({ op: 'edit', key: KEY, by: 'seed', note: 'v0' });
    const [r1, r2] = await Promise.all([
      postRaw({ op: 'edit', key: KEY, by: 'Old desk 1', note: 'v1' }),
      postRaw({ op: 'edit', key: KEY, by: 'Old desk 2', note: 'v2' })]);
    ok('both legacy saves are accepted (an older client is never refused for not knowing the rule)',
       r1.ok === true && r2.ok === true, JSON.stringify([r1, r2]));
    const live = await readKey(FILE);
    const other = live && live.note === 'v1' ? 'v2' : 'v1';
    const bk = await backupsOf(/TK903_18\.01\.2026_MP\.edit\.json$/);
    const notes = bk.map(d => d.note);
    ok('the live document is one of the two', live && (live.note === 'v1' || live.note === 'v2'), JSON.stringify(live));
    ok('and the OTHER is in _meta/backup/ — not lost between two reads of the same prior',
       notes.includes(other), JSON.stringify(notes));
    ok('the seed is backed up too: every version that was ever live is somewhere', notes.includes('v0'), JSON.stringify(notes));
    ok('exactly one save reports overwriting the other desk', [r1, r2].filter(r => r.overwrote && /Old desk/.test(r.overwrote.by)).length === 1,
       JSON.stringify([r1.overwrote, r2.overwrote]));
  }

  console.log('\n3. A DESK THAT HAS NOT PULLED SINCE THE OTHER SAVED IS REFUSED, THEN SUCCEEDS AFTER A PULL');
  {
    const KEY = 'TK904|2026-01-19|MP', FILE = '_meta/TK904_19.01.2026_MP.edit.json';
    const rA = await deskSave(dashA, { key: KEY, by: A_BY, note: 'first' });
    ok('dashboard/ saves', rA.ok === true, JSON.stringify(rA));
    const rB = await deskSave(dashB, { key: KEY, by: B_BY, note: 'from a stale screen' });
    ok('dashboard-next/, still showing no correction, is refused', rB.ok === false && rB.conflict === true, JSON.stringify(rB));
    const live = await readKey(FILE);
    ok('and dashboard/\'s correction is untouched on the server', live && live.note === 'first', JSON.stringify(live));
    await wait(100);
    const rB2 = await deskSave(dashB, { key: KEY, by: B_BY, note: 'now on top of first' });
    ok('after taking the server\'s copy, dashboard-next/ saves', rB2.ok === true, JSON.stringify(rB2));
  }

  console.log('\n4. ONE DESK SAVING THE SAME ROUND TWICE IN QUICK SUCCESSION IS NOT A CLASH WITH ITSELF');
  {
    const KEY = 'TK902|2026-01-17|MP', FILE = '_meta/TK902_17.01.2026_MP.edit.json';
    const before = (await keys()).filter(k => /backup\/.*TK902/.test(k)).length;
    const [s1, s2] = await Promise.all([
      deskSave(dashA, { key: KEY, by: A_BY, note: 'first pass' }),
      deskSave(dashA, { key: KEY, by: A_BY, note: 'second pass' })]);
    ok('both saves from the same desk land', s1.ok === true && s2.ok === true, JSON.stringify([s1, s2]));
    ok('neither reports a cross-desk overwrite', !(s1.r && s1.r.overwrote) && !(s2.r && s2.r.overwrote), JSON.stringify([s1.r, s2.r]));
    const live = await readKey(FILE);
    ok('the later one is what stands', live && live.note === 'second pass', JSON.stringify(live));
    const after = (await keys()).filter(k => /backup\/.*TK902/.test(k)).length;
    ok('the first save backed up nothing (there was nothing before it), the second backed up the first',
       after - before === 1, `${before} -> ${after}`);
    const base = await deskEdit(dashA, KEY);
    ok('the page holds the server\'s own stamp for what it saved', base.base === String(live && live.at), JSON.stringify(base));
  }

  console.log('\n5. BOTH DESKS RESOLVE THE SAME CONFLICT IN THE SAME INSTANT');
  {
    const CKEY = 'TK901|2026-01-16|MP', CNAME = '_meta/TK901_16.01.2026_MP.conflict.json';
    const seed = { type: 'cm-record-conflict', version: 1, key: CKEY, at: '2026-01-16T08:00:00.000Z',
      devices: [{ dev: 'DAAAA', file: 'TK901_16.01.2026_MP.json' }, { dev: 'DBBBB', file: 'TK901_16.01.2026_MP~DBBBB.json' }],
      resolved: false, keep: '', by: '' };
    await putRaw(CNAME, seed);
    // Both desks have read the open marker.
    await Promise.all([dashA, dashB].map(d => d.p.evaluate(c => CMDash.setConflicts([c]), seed)));
    const [rA, rB] = await Promise.all([
      deskResolve(dashA, CKEY, 'DAAAA', A_BY), deskResolve(dashB, CKEY, 'DBBBB', B_BY)]);
    const wins = [rA, rB].filter(r => r.ok), refused = [rA, rB].filter(r => !r.ok);
    ok('exactly one decision is recorded', wins.length === 1, JSON.stringify([rA, rB]));
    ok('the other is refused as a conflict, naming the decision that stands',
       refused.length === 1 && refused[0].conflict && refused[0].current && refused[0].current.resolved === true,
       JSON.stringify(refused[0]));
    const live = await readKey(CNAME);
    const keepWon = rA.ok ? 'DAAAA' : 'DBBBB';
    ok('the live marker carries the accepted decision', live && live.resolved && live.keep === keepWon, JSON.stringify(live));
    const bk = await backupsOf(/TK901_16\.01\.2026_MP\.conflict\.json$/);
    ok('the open marker it replaced is backed up', bk.some(d => d.resolved === false), JSON.stringify(bk));
  }

  console.log('\n6. TWO PHONES\' RIVAL COPIES OF ONE ROUND ARRIVE TOGETHER — THE MARKER NAMES BOTH');
  {
    // DAAAA owns the round; DBBBB and DCCCC each send their own copy at once.
    // Before the lock both read "no marker", each wrote [DAAAA, itself], and
    // whichever wrote second erased the other's entry — a version on the
    // server that the office was never told about.
    const NAME = 'TK905_20.01.2026_MP.json', FOLDER = 'MP/2026-01';
    const body = dev => Buffer.from(JSON.stringify({ type: 'cm-inspection-entries', version: 2,
      records: [{ equip: 'TK905', date: '2026-01-20', type: 'MP', dev, items: [] }] })).toString('base64');
    const r0 = await postRaw({ name: NAME, folder: FOLDER, dev: 'DAAAA', file: body('DAAAA'), mime: 'application/json' });
    ok('the first phone files the round', r0.ok === true, JSON.stringify(r0));
    const [rB, rC] = await Promise.all([
      postRaw({ name: NAME, folder: FOLDER, dev: 'DBBBB', file: body('DBBBB'), mime: 'application/json' }),
      postRaw({ name: NAME, folder: FOLDER, dev: 'DCCCC', file: body('DCCCC'), mime: 'application/json' })]);
    ok('both rival copies are kept', rB.ok === true && rC.ok === true, JSON.stringify([rB, rC]));
    const marker = await readKey('_meta/TK905_20.01.2026_MP.conflict.json');
    const devs = ((marker && marker.devices) || []).map(d => d.dev).sort();
    ok('the conflict marker lists all three devices', JSON.stringify(devs) === JSON.stringify(['DAAAA', 'DBBBB', 'DCCCC']),
       JSON.stringify(devs));
  }

  console.log('\n7. CONTROL: A SOLO EDIT, TOUCHED ONCE, IS NOT FLAGGED AND BACKS UP NOTHING');
  {
    const before = (await keys()).filter(k => /backup/.test(k)).length;
    const r = await deskSave(dashB, { key: 'TK906|2026-01-21|MP', by: B_BY, note: 'only ever saved once' });
    ok('the solo save succeeds', r.ok === true, JSON.stringify(r));
    ok('carries no overwrote field', !(r.r && r.r.overwrote), JSON.stringify(r.r));
    ok('and returns the server\'s stamp', !!(r.r && r.r.at), JSON.stringify(r.r));
    const after = (await keys()).filter(k => /backup/.test(k)).length;
    ok('and creates no backup', after === before, `${before} -> ${after}`);
  }

  console.log('\n8. WHAT THE EDIT DRAWER SAYS WHEN A SAVE IS REFUSED');
  for (const [name, d] of [['dashboard/', dashA], ['dashboard-next/', dashB]]) {
    const m = await d.p.evaluate(() => edErr({ conflict: true, current: { by: 'A. Desk', at: '2026-10-01T06:07:08.000Z' } }));
    ok(`${name}: names who changed it and when, in the page's own words`, /A\. Desk/.test(m) && /2026-10-01 06:07/.test(m) && !/\{by\}|\{at\}/.test(m), m);
    const plain = await d.p.evaluate(() => edErr(new Error('HTTP 500 — boom')));
    ok(`${name}: any other failure still reads as itself`, plain === 'HTTP 500 — boom', plain);
  }

  const noErrs = dashA.errs.length === 0 && dashB.errs.length === 0;
  ok('no page errors on either dashboard', noErrs, dashA.errs.concat(dashB.errs).slice(0, 3).join(' | ') || 'none');

  await dashA.ctx.close(); await dashB.ctx.close(); await b.close(); bye();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); bye(); process.exit(1); });
