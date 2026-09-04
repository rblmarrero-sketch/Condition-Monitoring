/* THE GRADE MIGRATION, END TO END, AGAINST BOTH BACKENDS.

   docs/yandex/migrate-grades.js is run as a child process — the way the
   maintainer will run it — against tests/ya-srv.cjs (the real function.js
   over an in-memory bucket) and then against tests/ed-srv.cjs (the real
   Apps Script over an in-memory Drive), each seeded with letter grades and
   a correction marker that carries one.

   What has to be true, on both:
     scan is read-only and counts the letters;
     apply without ADMIN_SECRET writes nothing;
     apply rewrites every letter to its number, keeps the original bytes in
       _meta/backup/ and in the local backup directory, and reconciles —
       same documents, records, items, photographs claimed and grade
       distribution (letters mapped) before and after;
     the device that owned a sidecar still owns it (no conflict fork);
     a second apply changes nothing;
     verify passes against the pre-migration tally;
     a document that will not parse is listed and left as it was.

   Run: node tests/migrate5.cjs        (spawns its own servers on 8131/8132) */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const up = port => new Promise(res => { const net = require('net');
  const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.end(); res(true); }); s.on('error', () => res(false)); });
async function waitUp(port) { for (let i = 0; i < 80; i++) { if (await up(port)) return true; await new Promise(r => setTimeout(r, 150)); } return false; }
function run(args, env) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'docs/yandex/migrate-grades.js')].concat(args),
    { env: Object.assign({}, process.env, env), encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const LEGACY = { A: 1, B: 2, C: 3, D: 4, X: 5 };

async function exercise(name, port, srv, seedExtra) {
  console.log(`\n== ${name} on ${port}`);
  const base = 'http://127.0.0.1:' + port + '/exec';
  const admin = 'letmein';
  const get = q => fetch(base + '?' + new URLSearchParams(q)).then(r => r.json());
  const post = b => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
  await seedExtra(post);
  /* A correction marker carrying a letter, the way the office wrote them. */
  const ed = await post({ op: 'edit', key: 'TK146|2026-03-09|MP', by: 'Office', items: { '4C': { grade: 'X', action: 'REPL' } } });
  ok('a correction marker with a letter grade is on the folder', ed.ok, JSON.stringify(ed).slice(0, 100));
  /* A document nobody can parse, which must be listed and left alone. */
  const bad = await fetch('http://127.0.0.1:' + port + '/__put?key=' + encodeURIComponent('MP/2026-03/BAD_01.03.2026_MP.json') + '&type=application/json',
    { method: 'POST', body: '{ this is not json' }).then(r => r.text());
  ok('an unparseable sidecar planted', bad === 'ok', bad);

  const before = await get({ action: 'list', folder: '', ext: '.json' });
  const docsBefore = before.files.length;
  const readAll = async () => { const l = await get({ action: 'list', folder: '', ext: '.json' }); const out = {};
    for (const f of l.files) { const r = await get({ action: 'file', id: f.id }); out[f.path || f.id] = Buffer.from(r.data, 'base64').toString('utf8'); }
    return out; };
  const snap0 = await readAll();
  const lettersIn = txt => (txt.match(/"grade":\s*"[ABCDX]"/g) || []).length;
  const totalLetters0 = Object.values(snap0).reduce((n, t) => n + lettersIn(t), 0);
  ok('the seeded folder carries letter grades', totalLetters0 >= 4, totalLetters0 + ' letters in ' + docsBefore + ' documents');

  const env = { CM_URL: base, CM_SECRET: '' };
  const scan = run(['--scan'], env);
  ok('scan is read-only and counts the letters', scan.code === 0 && /still in letters: [1-9]/.test(scan.out) && /would rewrite [1-9]/.test(scan.out), scan.out.split('\n').filter(l => /letters|would/.test(l)).join(' | '));
  ok('  and changed nothing', JSON.stringify(await readAll()) === JSON.stringify(snap0));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grade-backup-'));
  const noAdmin = run(['--apply', '--backup', dir], env);
  ok('apply without ADMIN_SECRET writes nothing', noAdmin.code !== 0 && /ADMIN_SECRET is not set/.test(noAdmin.out) && JSON.stringify(await readAll()) === JSON.stringify(snap0), noAdmin.out.trim().split('\n').pop());

  const apply = run(['--apply', '--backup', dir], Object.assign({ ADMIN_SECRET: admin }, env));
  console.log(apply.out.split('\n').map(l => '      ' + l).join('\n'));
  ok('apply rewrites and RECONCILES', apply.code === 0 && /RECONCILED: same documents/.test(apply.out), 'exit ' + apply.code);
  const snap1 = await readAll();
  const totalLetters1 = Object.entries(snap1).filter(([k]) => !/^_meta\/backup\//.test(k)).reduce((n, [, t]) => n + lettersIn(t), 0);
  ok('  no letter grade remains outside the backups', totalLetters1 === 0, totalLetters1);
  const liveKeys = Object.keys(snap1).filter(k => !/^_meta\/backup\//.test(k));
  ok('  same documents, none added, none lost (unparseable one included)', liveKeys.length === docsBefore, liveKeys.length + ' vs ' + docsBefore);
  const badKey = liveKeys.find(k => /BAD_/.test(k));
  ok('  the unparseable document is byte for byte as it was', badKey && snap1[badKey] === snap0[badKey]);
  /* Every letter became its number and nothing else in the document moved. */
  let mapped = true, elseSame = true, checked = 0;
  for (const k of liveKeys) {
    if (!lettersIn(snap0[k])) continue;
    checked++;
    let a, b; try { a = JSON.parse(snap0[k]); b = JSON.parse(snap1[k]); } catch (e) { mapped = false; continue; }
    const walk = (x, y, p) => {
      if (Array.isArray(x)) { if (!Array.isArray(y) || y.length !== x.length) { elseSame = false; return; } x.forEach((v, i) => walk(v, y[i], p)); return; }
      if (x && typeof x === 'object') { for (const kk of Object.keys(x)) {
          if (kk === 'grade') { if (LEGACY[x[kk]] != null) { if (y[kk] !== LEGACY[x[kk]]) mapped = false; } else if (x[kk] !== y[kk]) elseSame = false; }
          else if (kk === 'version' || kk === 'gradeScale') { /* stamped by the migration */ }
          else walk(x[kk], y[kk], p + '.' + kk); }
        if (typeof y === 'object' && y) for (const kk of Object.keys(y)) if (!(kk in x) && kk !== 'gradeScale') elseSame = false;
        return; }
      if (x !== y) elseSame = false; };
    walk(a, b, k);
  }
  ok('  every letter became its number, and no other field moved', mapped && elseSame && checked >= 3, checked + ' documents checked');
  const backups = Object.keys(snap1).filter(k => /^_meta\/backup\//.test(k));
  ok('  the originals are kept on the server under _meta/backup/', backups.length === checked, backups.length);
  /* The bucket keeps the backup under the full key; Drive keeps it under the
     file's name. Match on the name, which both carry. */
  const nameOf = k => k.split('/').pop();
  ok('  and every original is byte for byte in the backup', backups.every(bk => { const orig = liveKeys.find(k => nameOf(k) === nameOf(bk) && lettersIn(snap0[k])); return orig && snap1[bk] === snap0[orig]; }));
  const local = fs.readdirSync(dir).filter(f => f !== 'tally.json');
  ok('  and in the local backup directory, with the pre-migration tally', local.length === checked && fs.existsSync(path.join(dir, 'tally.json')), local.length);
  /* The device still owns its sidecar: a re-send from that phone must be a
     duplicate of its own file, not a rival. */
  const side = liveKeys.find(k => /TK146_09\.03\.2026_MP\.json$/.test(k));
  const again = await post({ op: 'batch', dev: 'DAAAA', files: [{ name: side.split('/').pop(), folder: side.split('/').slice(0, -1).join('/'),
    file: Buffer.from(snap1[side]).toString('base64'), contentType: 'application/json' }] });
  const r0 = again.saved && again.saved[0];
  ok('  the owning phone still owns it: its re-send is not forked into a rival', !!r0 && !r0.kept && !r0.conflict, JSON.stringify(r0 || again).slice(0, 160));

  const twice = run(['--apply', '--backup', dir], Object.assign({ ADMIN_SECRET: admin }, env));
  ok('a second apply is idempotent: rewrites 0', twice.code === 0 && /rewriting 0 document/.test(twice.out) && /RECONCILED/.test(twice.out), (twice.out.match(/rewriting \d+ document/) || [])[0]);
  const verify = run(['--verify', dir], env);
  ok('verify reconciles against the pre-migration tally', verify.code === 0 && /every count agrees and no letters remain/.test(verify.out), verify.out.trim().split('\n').pop());
  /* The dashboard's own reader now sees numbers from this folder. */
  const recs = await get({ action: 'records', after: 0, max: 100, index: 0 });
  const grades = []; (recs.records || []).forEach(r => (r.items || []).forEach(i => grades.push(i.grade)));
  ok('action=records now hands out numbers only', grades.length >= 3 && grades.every(g => typeof g === 'number' && g >= 1 && g <= 5), JSON.stringify(grades));

  /* ---- --derive: the round's own grade, written onto the folder by the same
     rule the phone now applies at save. Three rounds are planted the way the
     folder really holds them: an undercarriage survey measured and ungraded
     (its reading is its condition), a plug round photographed and ungraded on
     a build that let it through (nothing to score — left without, and named),
     and a graded round already carrying its g (untouched). */
  console.log(`   -- derive on ${name}`);
  const plant = async (unit, date, ty, rec) => {
    const dmy = date.split('-').reverse().join('.');
    const side = JSON.stringify({ type: 'cm-inspection-entries', version: 2, records: [Object.assign({ equip: unit, date, type: ty, by: 'B. Ivanov', cls: 'DOZ', dev: 'DBBBB' }, rec)] });
    return post({ op: 'batch', dev: 'DBBBB', folder: `${ty}/2026-04`, files: [{ name: `${unit}_${dmy}_${ty}.json`, file: Buffer.from(side).toString('base64'), contentType: 'application/json' }] });
  };
  await plant('DZ021', '2026-04-02', 'UC', { items: [{ key: 'IDLER', label: 'Idler', wearPct: 62, mm: 40 }, { key: 'SPROCKET', label: 'Sprocket', wearPct: 20 }] });
  await plant('TK149', '2026-04-03', 'MP', { items: [{ key: '4C', label: 'Left Rear Final Drive', photos: 2 }] });
  await plant('TK150', '2026-04-04', 'MP', { g: 2, items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 2 }] });
  await plant('TK151', '2026-04-05', 'TB', { items: [{ key: 'H21', label: 'Front plate', mm: 7.5, refSrc: 'tray:HM400?' }] });
  const G = require(path.join(ROOT, 'mobile/grade.js'));
  const wantUC = G.fromWorn(62);
  const snapD0 = await readAll();
  const liveNow = () => readAll().then(s => Object.fromEntries(Object.entries(s).filter(([k]) => !/^_meta\/backup\//.test(k))));
  const dscan = run(['--derive', '--scan'], env);
  ok('derive --scan says how many can carry a grade, and names the one that cannot',
     dscan.code === 0 && /round grades: \d+ of \d+ records carry one, \d+ can; would rewrite [1-9]/.test(dscan.out) && /left without, by design \(1\): TK149 2026-04-03 MP/.test(dscan.out),
     dscan.out.split('\n').filter(l => /round grades|left without/.test(l)).join(' | '));
  ok('  and a measured round with no remaining life on it is named apart, as left for the office', /remaining life not on the record[^\n]*\(1\): TK151 2026-04-05 TB/.test(dscan.out), (dscan.out.match(/remaining life[^\n]*/) || [''])[0].slice(0, 120));
  ok('  and changed nothing', JSON.stringify(await readAll()) === JSON.stringify(snapD0));
  const dver0 = run(['--derive', '--verify'], env);
  ok('derive --verify before the run says NOT RECONCILED', dver0.code === 2 && /NOT RECONCILED: [1-9]\d* record/.test(dver0.out), dver0.out.trim().split('\n').pop());
  const dirD = fs.mkdtempSync(path.join(os.tmpdir(), 'grade-derive-'));
  const dapply = run(['--derive', '--apply', '--backup', dirD], Object.assign({ ADMIN_SECRET: admin }, env));
  console.log(dapply.out.split('\n').map(l => '      ' + l).join('\n'));
  ok('derive --apply writes and RECONCILES', dapply.code === 0 && /RECONCILED: same documents/.test(dapply.out) && /round grades: \d+ → \d+ of \d+ records; \d+ can carry one/.test(dapply.out), 'exit ' + dapply.code);
  const live1 = await liveNow();
  const recOf = (snap, re) => { const k = Object.keys(snap).find(k => re.test(k)); try { return JSON.parse(snap[k]).records[0]; } catch (e) { return null; } };
  const uc = recOf(live1, /DZ021_02\.04\.2026_UC\.json$/), mp = recOf(live1, /TK149_03\.04\.2026_MP\.json$/), kept = recOf(live1, /TK150_04\.04\.2026_MP\.json$/), old = recOf(live1, /TK146_09\.03\.2026_MP\.json$/);
  ok('  the measured survey now carries g scored from its worst reading', uc && uc.g === wantUC, JSON.stringify({ g: uc && uc.g, want: wantUC }));
  ok('  a graded round of the old folder carries the grade of its worst point', old && old.g === 3, JSON.stringify(old && old.g));
  ok('  the ungraded, unmeasured plug round is left without one', mp && mp.g == null, JSON.stringify(mp && mp.g));
  ok('  a round that already carried g is untouched, byte for byte', kept && kept.g === 2 && live1[Object.keys(live1).find(k => /TK150_04/.test(k))] === snapD0[Object.keys(snapD0).find(k => /TK150_04/.test(k))]);
  ok('  no grade on any point moved', (() => { let same = true; for (const k of Object.keys(live1)) { let a, b; try { a = JSON.parse(snapD0[k]); b = JSON.parse(live1[k]); } catch (e) { continue; }
    if (!a || !a.records || !b || !b.records) continue; a.records.forEach((r, i) => (r.items || []).forEach((it, j) => { if (JSON.stringify(it) !== JSON.stringify(((b.records[i] || {}).items || [])[j])) same = false; })); } return same; })());
  ok('  the originals are in the local backup directory', fs.readdirSync(dirD).filter(f => f !== 'tally.json').length >= 3, fs.readdirSync(dirD).length);
  const dtwice = run(['--derive', '--apply', '--backup', dirD], Object.assign({ ADMIN_SECRET: admin }, env));
  ok('a second derive --apply rewrites 0', dtwice.code === 0 && /rewriting 0 document/.test(dtwice.out) && /RECONCILED/.test(dtwice.out), (dtwice.out.match(/rewriting \d+ document/) || [])[0]);
  const dver = run(['--derive', '--verify'], env);
  ok('derive --verify RECONCILES: every record that can carry a round grade does', dver.code === 0 && /RECONCILED: every record/.test(dver.out) && /TK149 2026-04-03 MP/.test(dver.out), dver.out.trim().split('\n').slice(-2).join(' | '));
  const recs2 = await get({ action: 'records', after: 0, max: 100, index: 0 });
  const ucOut = (recs2.records || []).find(r => r.equip === 'DZ021');
  ok('action=records hands the round grade out', ucOut && ucOut.g === wantUC, JSON.stringify(ucOut && ucOut.g));
}

(async () => {
  const procs = [];
  const start = (file, port) => { const p = spawn(process.execPath, [path.join(ROOT, 'tests', file), String(port), 'letmein'], { stdio: 'ignore' }); procs.push(p); return p; };
  try {
    start('ya-srv.cjs', 8131);
    ok('ya-srv (function.js) up on 8131', await waitUp(8131));
    await exercise('Yandex function.js', 8131, 'ya', async () => {});
    start('ed-srv.cjs', 8132);
    ok('ed-srv (google-upload.gs) up on 8132', await waitUp(8132));
    await exercise('Apps Script google-upload.gs', 8132, 'ed', async (post) => {
      /* ed-srv seeds with its own fixture; make sure a letter-graded round
         from a named device is there, the way the folder really is. */
      const side = JSON.stringify({ type: 'cm-inspection-entries', version: 2, records: [{ equip: 'TK146', date: '2026-03-09', type: 'MP', by: 'B. Ivanov', cls: 'HT', dev: 'DAAAA',
        items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 'C', defect: 'Ferrous debris — heavy', defectCode: 'DT14-03', action: 'MON', actionLabel: 'Monitor', wo: '', photos: 1 }] }] });
      await post({ op: 'batch', dev: 'DAAAA', folder: 'MP/2026-03', files: [{ name: 'TK146_09.03.2026_MP.json', file: Buffer.from(side).toString('base64'), contentType: 'application/json' }] });
    });
  } finally { procs.forEach(p => { try { p.kill(); } catch (e) {} }); }
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nALL PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(String(e && e.stack || e).slice(0, 600)); process.exit(1); });
