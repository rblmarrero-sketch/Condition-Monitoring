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
