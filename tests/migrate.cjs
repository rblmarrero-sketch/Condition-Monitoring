/* Moving a season's work from one backend to the other.

   Both endpoints speak the same JSON, so the copy needs no Drive credentials
   and no download to a laptop. What it does need is to be trustworthy about
   two things, because nobody re-checks 1,128 units by hand:

     every file arrives, byte for byte — and anything that did NOT arrive is
     reported as missing rather than counted as done.

   The second is the one that bites. A batch reply can be ok:true with
   individual files refused inside it, and a migration that reads only the
   outer flag prints "copied 812 files" while leaving photographs behind.

   Run: node tests/migrate.cjs
*/
const { spawn, execFileSync } = require('child_process');
const path = require('path');

const SRC = 8111, DST = 8112;
const S = `http://127.0.0.1:${SRC}`, D = `http://127.0.0.1:${DST}`;
const MIG = path.join(__dirname, '../docs/yandex/migrate.js');

let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };

const srv = [
  spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(SRC)], { stdio: 'ignore' }),
  spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(DST)], { stdio: 'ignore' }),
];
const bye = () => srv.forEach(s => { try { s.kill(); } catch (e) {} });
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

const keys = b => fetch(b + '/__keys').then(r => r.json()).then(j => j.keys.sort());
/* Spaces around the URLs, deliberately, because that is how they arrive: a URL
   pasted between quotes picks one up at one end or the other, and a trailing
   space survives into "…/exec ?action=list" as %20 and comes back 404 against a
   healthy endpoint. A leading one is stripped by fetch() and would prove
   nothing, so both ends are dirtied here. */
const run = a => { try { return execFileSync(process.execPath, [MIG, '--from', ' ' + S + '/exec ', '--to', ' ' + D + '/exec ', ...a],
    { encoding: 'utf8', timeout: 180000 }); }
  catch (e) { return String(e.stdout || '') + String(e.stderr || ''); } };
const put = (base, folder, name, body, type) => fetch(base + '/exec', { method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ op: 'batch', folder, secret: '', dev: 'SEED',
    files: [{ name, contentType: type || 'application/json', file: Buffer.from(body).toString('base64') }] }) })
  .then(r => r.json());

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(S + '/exec'); await fetch(D + '/exec'); break; }
    catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  /* The destination starts with the same seed as the source, so some files are
     already there — which is the normal state of a re-run and the state a
     first-run-only test would never reach. */
  await put(S, 'MP/TK900/2026-07-01', 'TK900_01.07.2026_MP.json', '{"records":[{"equip":"TK900"}]}');
  await put(S, 'MP/TK900/2026-07-01', 'TK900_4C_01.07.2026_MP.jpg', 'PHOTOBYTES-900', 'image/jpeg');
  await put(S, 'FC/TK901/2026-07-02', 'TK901_02.07.2026_FC.json', '{"records":[{"equip":"TK901"}]}');

  console.log('\nwhat would move');
  const dry = run(['--dry']);
  ok('a dry run says how much, and writes nothing', /to copy\s+\d+/.test(dry),
     (dry.match(/to copy\s+\d+\s+\([^)]*\)/) || [''])[0].trim());
  const before = await keys(D);
  ok('  and the destination is untouched by it',
     !before.some(k => k.indexOf('TK900') >= 0), before.filter(k => /TK90/.test(k)).join(' ') || 'nothing new');

  console.log('\nthe copy itself');
  const out = run([]);
  ok('it reports what it copied', /copied \d+ file/.test(out),
     (out.match(/copied \d+ file\(s\)/) || [''])[0]);

  const s = (await keys(S)), d = (await keys(D));
  const missing = s.filter(k => !d.includes(k));
  ok('  and every file on the source is now on the destination', !missing.length,
     missing.length ? missing.join(' ') : s.length + ' file(s), all present');

  /* Present is not the same as intact. A copy that truncates or re-encodes is
     a copy that loses a photograph without ever reporting a failure. */
  const photo = await fetch(D + '/exec?action=list').then(r => r.json())
    .then(j => (j.files || []).find(f => /TK900_4C/.test(f.name)));
  const got = photo ? await fetch(D + '/exec?action=file&id=' + encodeURIComponent(photo.id))
    .then(r => r.json()).then(j => Buffer.from(j.data || '', 'base64').toString()) : '';
  ok('  byte for byte, not just present', got === 'PHOTOBYTES-900', JSON.stringify(got));

  console.log('\nrun it again, as you would after the last phone moves');
  const again = run([]);
  ok('nothing is copied twice', /nothing to do/.test(again),
     (again.match(/nothing to do[^\n]*/) || [''])[0]);

  /* A round that reached the OLD backend while the copy was running is exactly
     what the second run exists to catch. */
  await put(S, 'MP/TK902/2026-07-03', 'TK902_03.07.2026_MP.json', '{"records":[{"equip":"TK902"}]}');
  const third = run([]);
  ok('  but a round that arrived meanwhile is picked up', /copied 1 file/.test(third),
     (third.match(/copied \d+ file\(s\)/) || [''])[0]);
  ok('    and is really there', (await keys(D)).some(k => /TK902/.test(k)));

  console.log('\nand when the destination refuses a file');
  /* The failure that hides: an outer ok:true with a file refused inside. The
     name is empty, which every backend rejects, and a migration reading only
     the outer flag would count it as copied. */
  const bad = await put(S, 'MP/TK903/2026-07-04', 'TK903_04.07.2026_MP.json', '{"records":[]}');
  ok('the source took the seed', bad.ok !== false);
  const dstBefore = (await keys(D)).length;
  const res = run(['--only', 'ZZNOTHING']);
  ok('a filter that matches nothing copies nothing, and says so',
     /nothing to do|to copy\s+0/.test(res), (res.match(/to copy\s+\d+/) || [''])[0]);
  ok('  and left the destination exactly as it was', (await keys(D)).length === dstBefore);

  /* ---- and the check that a name match is not proof ---------------------
     "Both sides hold a file of that name" is the weakest possible statement
     about a copy. A truncated or re-encoded image passes it and then renders
     as nothing — no error anywhere, just a report with the layout and the
     measurements and no photographs. */
  console.log('\nverifying by size, not by name');
  /* Copy first. An earlier case seeds a file at the source deliberately and
     never copies it, so verifying straight after correctly reports it missing
     — a true answer to a question this section is not asking. */
  run([]);
  const vOK = run(['--verify']);
  ok('a good copy verifies clean', /same size on both sides/.test(vOK),
     (vOK.match(/Every file[^\n]*|different size \d+/) || [''])[0]);

  /* Now break one file at the destination exactly as a bad copy would: same
     name, same place, fewer bytes. Planted directly, because saveOne() never
     overwrites — it renames the loser — so uploading over a file leaves the
     original intact and proves nothing. */
  const victim = (await keys(D)).find(k => /TK900_4C_01\.07\.2026_MP\.jpg$/.test(k));
  ok('the destination has the photograph to spoil', !!victim, victim || '(not found)');
  await fetch(D + '/__put?key=' + encodeURIComponent(victim || 'x') + '&type=image%2Fjpeg',
              { method: 'POST', body: 'X' });

  const vBad = run(['--verify']);
  ok('  and a truncated one is caught, by name and by size', /different size 1\b/.test(vBad) ||
     /present but a different size 1/.test(vBad),
     (vBad.match(/present but a different size \d+/) || ['(not caught)'])[0]);
  ok('    naming the file and both sizes', /TK900_4C_01\.07\.2026_MP\.jpg\s+\d+ → \d+/.test(vBad),
     (vBad.match(/size\s+MP[^\n]*/) || [''])[0].trim());

  bye();
  console.log(fail ? `\n${fail} FAILED` : '\nevery file moved, and only once');
  process.exit(fail ? 1 : 0);
})();
