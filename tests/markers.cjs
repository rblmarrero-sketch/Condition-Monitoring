/* A CONFLICT MARKER IS TEXT ON THE PAGE.

   Build 244 shipped mobile/index.html with a git conflict block left in it:
   both halves of the script list, between "<<<<<<< HEAD" and ">>>>>>> 69ea133".
   Every script loaded twice and the markers were printed at the foot of the
   page, where an inspector read them. Nothing threw, every suite passed, and
   the bump guard was satisfied — a real line rendered as nonsense, the
   signature defect again. This reads every shipped file and refuses a marker,
   so the sweep and the pre-push check say so before Pages does.

   Widened in build 254 to EVERY tracked text file: tests/runall.sh carried a
   conflict block for eleven builds — both halves of the suite list — and
   the resumable sweep, which parses that list, ran the FIRST half and
   silently never ran fifteen suites, the new ones among them. A guard that
   watches only the shipped pages leaves the thing that checks the pages
   unwatched. */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const files = cp.execSync('git ls-files', { cwd: ROOT }).toString().trim().split('\n');
const RX = /^(<{7}( |$)|={7}$|>{7}( |$))/m;
let bad = 0;
for (const f of files) {
  if (!/\.(html|js|cjs|mjs|json|css|md|sh|yml|yaml|txt|gs|webmanifest|svg)$/.test(f)) continue;
  if (!fs.existsSync(path.join(ROOT, f))) continue;
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const m = RX.exec(s);
  if (m) { bad++; const line = s.slice(0, m.index).split('\n').length;
    console.log('  FAIL  ' + f + ':' + line + ' carries a conflict marker   ' + JSON.stringify(m[0])); }
}
console.log((bad ? '  FAIL  ' : '  PASS  ') + 'no tracked file carries a git conflict marker   ' + files.length + ' files listed');
process.exit(bad ? 1 : 0);
