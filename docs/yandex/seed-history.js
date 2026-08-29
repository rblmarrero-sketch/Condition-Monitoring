/* ============================================================================
   PUT THE FIRST MAGNETIC-PLUG ROUND INTO THE FOLDER

   Sixteen inspections — every one of them MP, dated 2026-07-29 — live only
   inside the application, in data/magnetic_plug.js, imported once from the
   original Excel sheets. The dashboard loads that file, so the office can see
   them. The phone cannot: a phone knows the FOLDER and nothing else.

   Measured on the deployed build against the live store:

     TK147   MP 2026-07-29   src: bundled     <- its only record
     dashboard  bundled 16 + folder 49 = 65 records,  7 past due
     phone      folder only, 47 pairings,             2 past due

   That is the whole of the dashboard-versus-phone disagreement this project
   has been chasing for a dozen builds, and it is not a bug in either surface.
   It is one source of truth that only one of them can read. Seven haul trucks
   are genuinely 18 days past a 250-hour plug round and the inspector standing
   next to them is not told.

   Somebody has already tried to close the gap by exporting entries.json and
   loading it into a phone by hand. That is where the "dates not in the system"
   came from: side-loaded history that syncs nowhere, is verifiable by nobody,
   and which build 191 now correctly refuses to schedule against.

   The fix is to put the rounds where every surface already looks.

     node seed-history.js --to <URL>              what WOULD be written
     node seed-history.js --to <URL> --apply      write it

   DRY BY DEFAULT, and deliberately the opposite way round from migrate.js.
   That tool moves a folder between two backends that both already hold it;
   this one writes new history into a live store that 1,128 machines are
   scheduled against. The default for that is "show me", not "go".

   Options
     --to <URL>        the backend /exec, e.g. https://baimskaya-cm.duckdns.org/
     --to-secret X     its shared secret, if it has one
     --by "Name"       who walked these rounds. The Excel import carries no
                       inspector, and a round with nobody's name on it is a
                       round nobody can be asked about — so this is passed in
                       rather than left blank or invented.
     --apply           actually write (default is a dry run)
     --photos          include the 65 bundled photographs as well
     --batch 4         files per upload request when applying

   SAFE TO RUN AGAIN. Anything the destination already holds under the same
   name is left alone and reported as already there, so a run interrupted
   halfway is resumed by running the same command.

   IT NEVER DELETES OR RENAMES ANYTHING. The only verb here is "add".
============================================================================ */
'use strict';

const fs = require('fs'), path = require('path');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const has = n => process.argv.indexOf('--' + n) > 0;

const TO     = String(arg('to', '')).trim().replace(/\s+/g, '');
const SECRET = String(arg('to-secret', '')).trim();
const APPLY  = has('apply');
const BY     = String(arg('by', '')).trim();
const PHOTOS = has('photos');
const BATCH  = Math.max(1, Number(arg('batch', 4)) || 4);
const ROOT   = path.join(__dirname, '..', '..');

if (!TO) {
  console.error('Usage: node seed-history.js --to <backend /exec URL> [--apply] [--photos]');
  process.exit(2);
}

/* ---- the bundled history, read the way the dashboard reads it ------------
   data/magnetic_plug.js is a browser file that assigns window.CM_DATA. Loading
   it through a shim rather than re-parsing it by hand means this tool and the
   dashboard are looking at the same sixteen inspections; a second parser is a
   second thing to disagree. */
function bundled() {
  const g = { window: {} };
  const src = fs.readFileSync(path.join(ROOT, 'data', 'magnetic_plug.js'), 'utf8');
  new Function('window', src)(g.window);
  const d = g.window.CM_DATA;
  if (!d || !Array.isArray(d.inspections)) throw new Error('data/magnetic_plug.js has no inspections');
  return d.inspections;
}

const ddmmyyyy = iso => { const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso); };

/* The sidecar exactly as a phone writes one — cm-inspection-entries v2, with
   the item fields recToExport() emits. A record in a different shape is a
   record the dashboard reads differently from every other, which is the class
   of defect this whole migration exists to remove rather than add to. */
function sidecarFor(insp) {
  const date = insp.date, equip = insp.equipment;
  const items = (insp.positions || []).map(p => ({
    key: p.key, label: p.label || '', grade: p.grade || '',
    /* Severity is DERIVED from grade everywhere since build 194, so it is not
       written here. A stored severity that later disagreed with its grade is
       exactly what sevConflicts() exists to catch. */
    action: '', actionLabel: '', wo: '', prio: '', prioLabel: '',
    defectCode: '', defect: '', iso: '', isoMode: '',
    causeCode: '', cause: '',
    particle: p.particleCount == null ? '' : p.particleCount,
    comp: p.componentHours == null ? '' : p.componentHours,
    oil:  p.oilHours == null ? '' : p.oilHours,
    comment: p.comment || '',
    /* A COUNT IS A CLAIM, NOT A FILE. It says a photograph was taken; it says
       nothing about whether one ever arrived. Written only where a bundled
       photograph actually exists on disk beside this tool, so the number can
       never be larger than what is really there to send. */
    photos: (p.photo && fs.existsSync(path.join(ROOT, p.photo))) ? 1 : 0,
    video: 0,
  }));
  return {
    name: `${equip}_${ddmmyyyy(date)}_MP.json`,
    folder: `MP/${String(date).slice(0, 7)}`,
    body: { type: 'cm-inspection-entries', version: 2, records: [{
      /* Stable identity, and one that says where it came from. Re-running this
         tool produces the same id for the same round, so a second run cannot
         create a second record of one inspection. */
      id: `bundled__${equip}__${date}__MP`, rev: 1,
      equip, date, type: 'MP', cls: 'HT',
      by: insp.by || BY, smu: insp.motorHours || '', sup: '', gps: null,
      /* Not a phone. The conflict machinery keys on dev to tell "this phone
         re-sending its own round" from "another phone overwriting one", and a
         migration must be neither. */
      dev: 'IMPORT', signed: 0,
      source: insp.source || 'data/magnetic_plug.js',
      items,
    }] },
    photos: (insp.positions || []).filter(p => p.photo)
      .map(p => ({ from: p.photo,
                   to: `${equip}_${String(p.key).replace(/\./g, '-')}_${ddmmyyyy(date)}_MP.jpg` })),
  };
}

const post = async body => {
  const r = await fetch(TO, { method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  const txt = await r.text();
  try { return JSON.parse(txt); } catch (e) { return { ok: false, error: txt.slice(0, 200) }; }
};

(async () => {
  const plan = bundled().map(sidecarFor);
  console.log(`\nbundled history   ${plan.length} inspection(s), all MP`);
  console.log(`destination       ${TO}`);
  console.log(`inspector         ${BY || '(blank — pass --by "Name")'}`);
  console.log(`mode              ${APPLY ? 'APPLY — this will write' : 'DRY RUN — nothing will be written'}`);

  /* What is already there. Asked once, by listing, so the report is about the
     store rather than about what this tool hopes is true. */
  const u = new URL(TO);
  u.searchParams.set('action', 'list');
  if (SECRET) u.searchParams.set('secret', SECRET);
  let held = new Set();
  try {
    const j = await (await fetch(u.toString())).json();
    (j.files || []).forEach(f => held.add(f.name));
    console.log(`already in folder ${held.size} file(s)`);
  } catch (e) {
    console.error('\nCould not list the destination: ' + (e.message || e));
    console.error('Refusing to plan against a store that did not answer.');
    process.exit(1);
  }

  if (!BY && APPLY) {
    console.error('\nRefusing to write rounds with no inspector on them.');
    console.error('Pass --by "Name". A round nobody signed is a round nobody can be asked about.');
    process.exit(1);
  }
  const writeS = plan.filter(p => !held.has(p.name));
  const haveS  = plan.filter(p =>  held.has(p.name));
  const allPh  = plan.flatMap(p => p.photos);
  const missPh = allPh.filter(x => !fs.existsSync(path.join(ROOT, x.from)));
  const writeP = PHOTOS ? allPh.filter(x => !held.has(x.to) && fs.existsSync(path.join(ROOT, x.from))) : [];
  const haveP  = PHOTOS ? allPh.filter(x =>  held.has(x.to)) : [];

  console.log('\n  ROUNDS');
  console.log(`    to write        ${writeS.length}`);
  console.log(`    already there   ${haveS.length}`);
  writeS.slice(0, 20).forEach(p => console.log(`      + ${p.folder}/${p.name}   ${p.body.records[0].items.length} point(s)`));
  if (writeS.length > 20) console.log(`      … and ${writeS.length - 20} more`);
  haveS.forEach(p => console.log(`      = ${p.name}  (left alone)`));

  console.log('\n  PHOTOGRAPHS');
  if (!PHOTOS) {
    console.log(`    ${allPh.length} bundled photograph(s) exist; pass --photos to include them`);
  } else {
    console.log(`    to write        ${writeP.length}`);
    console.log(`    already there   ${haveP.length}`);
    if (missPh.length) console.log(`    NOT ON DISK     ${missPh.length}  (skipped, never invented)`);
    writeP.slice(0, 10).forEach(x => console.log(`      + ${x.to}`));
    if (writeP.length > 10) console.log(`      … and ${writeP.length - 10} more`);
  }

  /* Anything this tool cannot answer for itself, said rather than assumed. */
  console.log('\n  WHAT THIS DOES NOT DO');
  console.log('    · never deletes or renames anything already in the store');
  console.log('    · never guesses a point assignment — every photograph keeps the');
  console.log('      position it was imported against, or is skipped');
  console.log('    · writes no severity: it is derived from grade everywhere since 194');
  console.log('    · a round already in the folder is left exactly as it is');

  if (!APPLY) {
    console.log(`\nDry run. ${writeS.length} round(s)` +
      (PHOTOS ? ` and ${writeP.length} photograph(s)` : '') +
      ' would be written. Add --apply to do it.\n');
    return;
  }

  console.log('\napplying…');
  let okS = 0, failS = 0;
  for (const p of writeS) {
    const r = await post({ name: p.name, folder: p.folder, contentType: 'application/json',
      dev: 'IMPORT', secret: SECRET,
      file: Buffer.from(JSON.stringify(p.body, null, 2)).toString('base64') });
    if (r && r.ok) { okS++; console.log(`  wrote  ${p.name}` + (r.receipt ? `  sha ${String(r.receipt.sha256).slice(0, 12)}` : '')); }
    else { failS++; console.log(`  FAILED ${p.name}  ${(r && r.error) || 'no reply'}`); }
  }
  let okP = 0, failP = 0;
  for (let i = 0; i < writeP.length; i += BATCH) {
    const chunk = writeP.slice(i, i + BATCH);
    const files = chunk.map(x => ({ name: x.to, contentType: 'image/jpeg',
      file: fs.readFileSync(path.join(ROOT, x.from)).toString('base64') }));
    const r = await post({ op: 'batch', folder: 'MP/2026-07', dev: 'IMPORT', secret: SECRET, files });
    const saved = (r && r.saved) || [];
    okP += saved.length; failP += chunk.length - saved.length;
    console.log(`  photos ${okP}/${writeP.length}`);
  }
  console.log(`\ndone. rounds ${okS} written, ${failS} failed` +
    (PHOTOS ? `; photographs ${okP} written, ${failP} failed` : '') + '\n');
})().catch(e => { console.error('\n' + (e.stack || e.message || e)); process.exit(1); });
