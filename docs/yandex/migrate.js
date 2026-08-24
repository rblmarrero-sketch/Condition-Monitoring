/* ============================================================================
   COPY EVERY ROUND FROM ONE BACKEND TO THE OTHER

   Both endpoints speak the same JSON, so this needs no Drive credentials, no
   S3 keys and no download to a laptop: it lists what the source has, asks the
   destination what it already holds, and moves only the difference.

     node migrate.js --from <old /exec URL> --to <new URL>

   Options
     --from-secret X   the source's shared secret, if it has one
     --to-secret X     the destination's
     --dry             list what WOULD move, send nothing
     --only MP,FC      only these round types (folder prefixes)
     --batch 4         files per upload request (default 4)

   SAFE TO RUN AGAIN. It skips anything already at the destination by name, so
   a run that stops — signal, timeout, somebody closing the terminal — is
   resumed by running the same command. That matters more than it sounds: the
   source here answers a full listing in about a minute, so a fleet's history is
   not a thirty-second job, and a copy that cannot be resumed is one that gets
   restarted from nothing at 90%.

   AND RUN IT AGAIN AT THE END. During a changeover some phones are still
   uploading to the old backend only. Their rounds land there and are invisible
   to anything reading the new one — so the last run must come after the last
   phone has moved, or those rounds are missing from the very place everyone now
   reads.
============================================================================ */
'use strict';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const has = n => process.argv.indexOf('--' + n) > 0;

const FROM = (arg('from', '') || '').replace(/\/+$/, '');
const TO   = (arg('to', '')   || '').replace(/\/+$/, '');
const FROM_SEC = arg('from-secret', '');
const TO_SEC   = arg('to-secret', '');
const DRY  = has('dry');
const ONLY = (arg('only', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const BATCH = Math.max(1, Math.min(8, Number(arg('batch', 4)) || 4));

if (!FROM || !TO) {
  console.error('Usage: node migrate.js --from <old /exec URL> --to <new URL> [--dry]');
  process.exit(1);
}

const MIME = { json: 'application/json', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
               webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', pdf: 'application/pdf' };
const mimeOf = n => MIME[String(n).toLowerCase().split('.').pop()] || 'application/octet-stream';
const dirOf  = p => { const i = String(p || '').lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
const sleep  = ms => new Promise(r => setTimeout(r, ms));

/* The source is an Apps Script and can take a full minute to answer a listing;
   anything shorter reports a working endpoint as a dead one. */
async function get(base, q, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 240000);
  try {
    const r = await fetch(base + q, { signal: c.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* text/plain deliberately: it keeps the request "simple", so no CORS preflight
   — the same choice both clients make, and the only one an Apps Script can
   answer. */
async function post(base, body, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 240000);
  try {
    const r = await fetch(base, { method: 'POST', signal: c.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* Retries, because a copy of a season's work WILL hit a bad minute, and a run
   that dies on one timeout after forty minutes is a run nobody finishes. */
async function tryHard(what, fn, tries) {
  let last;
  for (let i = 0; i < (tries || 4); i++) {
    try { return await fn(); }
    catch (e) { last = e; const wait = 2000 * Math.pow(2, i);
      console.log(`      ${what} failed (${String(e.message || e).slice(0, 60)}), retrying in ${wait / 1000}s`);
      await sleep(wait); }
  }
  throw last;
}

const listOf = (base, sec) =>
  get(base, '?action=list' + (sec ? '&secret=' + encodeURIComponent(sec) : ''))
    .then(j => (j && j.files) || []);

(async () => {
  console.log('\nfrom  ' + FROM + '\nto    ' + TO + (DRY ? '\nmode  DRY RUN — nothing will be written' : ''));

  console.log('\nreading both sides…');
  const [src, dst] = await Promise.all([
    tryHard('source listing', () => listOf(FROM, FROM_SEC)),
    tryHard('destination listing', () => listOf(TO, TO_SEC)),
  ]);
  console.log('  source      ' + src.length + ' file(s)');
  console.log('  destination ' + dst.length + ' file(s)');

  /* Matched on the full path, not the name. Two units can hold a file with the
     same name in different folders, and matching on name alone would call the
     second one already-copied and leave it behind for ever. */
  const there = new Set(dst.map(f => (f.path || f.name)));
  let todo = src.filter(f => !there.has(f.path || f.name));
  if (ONLY.length) todo = todo.filter(f => ONLY.some(p => String(f.path || '').indexOf(p) === 0));

  const bytes = todo.reduce((n, f) => n + (Number(f.size) || 0), 0);
  console.log('\n  already there ' + (src.length - todo.length));
  console.log('  to copy       ' + todo.length + '  (' + (bytes / 1048576).toFixed(1) + ' MB)');
  if (!todo.length) { console.log('\nnothing to do — both sides hold the same files.'); return; }

  if (DRY) {
    todo.slice(0, 40).forEach(f => console.log('    ' + (f.path || f.name)));
    if (todo.length > 40) console.log('    … and ' + (todo.length - 40) + ' more');
    console.log('\nDry run. Remove --dry to copy them.');
    return;
  }

  /* One folder at a time. The destination takes a folder per request, and a
     batch spanning two folders would have to be split anyway — grouping first
     keeps every request whole and makes the progress line mean something. */
  const byFolder = new Map();
  todo.forEach(f => { const d = dirOf(f.path || f.name);
    if (!byFolder.has(d)) byFolder.set(d, []); byFolder.get(d).push(f); });

  let done = 0, failed = [];
  const t0 = Date.now();
  for (const [folder, files] of byFolder) {
    for (let i = 0; i < files.length; i += BATCH) {
      const group = files.slice(i, i + BATCH);
      try {
        const payload = [];
        for (const f of group) {
          const r = await tryHard('read ' + f.name, () => get(FROM,
            '?action=file&id=' + encodeURIComponent(f.id) +
            (FROM_SEC ? '&secret=' + encodeURIComponent(FROM_SEC) : '')));
          if (!r || r.ok === false || !r.data) throw new Error((r && r.error) || 'no content');
          payload.push({ name: f.name, contentType: r.mime || mimeOf(f.name), file: r.data });
        }
        const w = await tryHard('write ' + folder, () => post(TO,
          { op: 'batch', folder, secret: TO_SEC, dev: 'MIGRATE', files: payload }));
        if (w && w.ok === false) throw new Error(w.error || 'rejected');
        /* A batch reply can be ok:true with individual files refused inside it.
           Counting the whole group as copied on the strength of the outer flag
           is how a migration reports success and leaves photographs behind. */
        const bad = (w && w.failed) || [];
        if (bad.length) throw new Error(bad.length + ' file(s) refused: ' +
          String((bad[0] && bad[0].error) || '').slice(0, 60));
        done += group.length;
      } catch (e) {
        group.forEach(f => failed.push({ f: f.path || f.name, why: String(e.message || e).slice(0, 80) }));
      }
      const pct = Math.round((done + failed.length) / todo.length * 100);
      const rate = done / Math.max(1, (Date.now() - t0) / 1000);
      const left = rate > 0 ? Math.round((todo.length - done - failed.length) / rate) : 0;
      process.stdout.write('\r  ' + pct + '%  ' + done + '/' + todo.length +
        (failed.length ? '  (' + failed.length + ' failed)' : '') +
        (left ? '  ~' + (left > 90 ? Math.round(left / 60) + ' min' : left + ' s') + ' left' : '') + '     ');
    }
  }
  console.log('\n');

  if (failed.length) {
    console.log(failed.length + ' file(s) did not copy:');
    failed.slice(0, 15).forEach(x => console.log('  ' + x.f + '  —  ' + x.why));
    if (failed.length > 15) console.log('  … and ' + (failed.length - 15) + ' more');
    console.log('\nRun the same command again — it copies only what is still missing.');
    process.exit(2);
  }
  console.log('copied ' + done + ' file(s). Run it again after the last phone has');
  console.log('moved across, to pick up anything that went to the old backend meanwhile.');
})().catch(e => { console.error('\n' + String(e.message || e)); process.exit(1); });
