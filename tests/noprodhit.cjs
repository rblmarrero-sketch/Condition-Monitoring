/* NO TEST MAY EVER NAME THE REAL BACKEND.

   Found 2026-09-30: 12 synthetic-looking rounds (TK146-150 MP, EX001/EX002/
   DZ001/DZ002/EX003 INSP, DZ001/DZ002/EX001 UC) appeared on the LIVE
   production backend (baimskaya-cm.duckdns.org), all dated the same day,
   written by two devices in under three minutes across three round types --
   physically impossible for a field inspector, and confirmed synthetic by
   direct inspection of the live folder (docs/yandex/cleanup-conflicts.js's
   own dry-run). Every tests/*.cjs file in this repo was checked and NONE
   references the real backend URL -- the source was never found with
   certainty (see the investigation write-up for that date). Nothing was
   removed from production without it.

   `mobile/upload-defaults.js`'s swap to the live backend is ARMED (see
   CLAUDE.md's own "THE BACKEND IS YANDEX" section) -- so ANY script or test
   that loads the real mobile/index.html or dashboard-next/index.html and
   drives an actual save/sync action, without first overriding the
   destination (up_dests via addInitScript, or CMDrive.saveEdit/resolve/
   putAll stubbed before the click), sends real bytes to real production
   infrastructure by DEFAULT, silently. That is the standing risk this file
   exists to catch the cheapest, most common form of: a test that simply
   NAMES the real host, whether by habit, copy-paste, or a "let me just
   check the real data" aside that was never meant to be committed.

   This does not (and cannot, statically and safely) catch the harder,
   silent-default case -- a test that loads the real page and never
   overrides the write path at all, relying on nothing ever actually being
   clicked. That is a real, standing structural risk and is not solved
   here; every test that loads mobile/index.html or dashboard-next/index.html
   for real and performs any save/sync-capable interaction must explicitly
   override the destination BEFORE that interaction (up_dests / CMDrive),
   matching the pattern every existing test in this list already follows. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* The only files in this repo that are EVER allowed to name the real host --
   deliberate, dry-by-default (or explicitly --apply-gated) admin tooling
   meant to be run BY HAND against production, never by a test or by CI. */
const ALLOW = new Set([
  'docs/yandex/cleanup-conflicts.js',
  'docs/yandex/migrate-grades.js',
  'docs/yandex/seed-history.js',
  'docs/yandex/setup.sh',
  'docs/yandex/CLI-SETUP.md',
  'docs/yandex/SETUP.md',
  'docs/yandex/VM-SETUP.md',
  'docs/report-v3-traceability.md',
  'CLAUDE.md',
  'mobile/upload-defaults.js',        // the ONE place the live swap is real and intended
  'ingest/fetch_cm_history.cjs',
  'ingest/class_rounds.generated.json',
  'ingest/cm_history.generated.json',
  'tests/noprodhit.cjs',              // this file, in its own comment
]);

const HOSTS = [/duckdns\.org/i, /baimskaya-cm(?!\.example)/i];

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'screenshots') continue;
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full);
    const st = fs.statSync(full);
    if (st.isDirectory()) { walk(full, out); continue; }
    if (!/\.(cjs|js|html)$/.test(name)) continue;
    out.push(rel);
  }
}

const files = [];
walk(ROOT, files);

const offenders = [];
for (const rel of files) {
  if (ALLOW.has(rel.replace(/\\/g, '/'))) continue;
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const re of HOSTS) {
    if (re.test(text)) { offenders.push(rel); break; }
  }
}

ok('no test, page, or script outside the allowed admin-tooling list names the live production backend',
   offenders.length === 0, offenders.join(', '));

/* Confirmed non-vacuous: this scan actually reads content and actually
   matches, proven against a planted offender rather than trusted blind. */
const PLANT = path.join(ROOT, 'tests', '.noprodhit-plant.tmp.cjs');
fs.writeFileSync(PLANT, "const BASE = 'https://baimskaya-cm.duckdns.org';\n");
try {
  const planted = fs.readFileSync(PLANT, 'utf8');
  const caught = HOSTS.some(re => re.test(planted));
  ok('the scan itself is not blind -- a planted real-host reference is actually matched', caught);
} finally {
  fs.unlinkSync(PLANT);
}

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
process.exit(fails.length ? 1 : 0);
