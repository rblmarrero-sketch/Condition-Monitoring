/* The generated files, and the generators that claim to produce them.

   mobile/lube.js and mobile/wear.js both begin "GENERATED — do not hand-edit,
   rebuild with <script>". Both had been hand-edited anyway, and neither script
   could reproduce the file it was named in:

     lube.js  carried LUBE.register(), LUBE.registered() and LUBE.verdict() —
              the ONE judgement of a compartment that the phone, the dashboard
              and the report all call. Sixty-five lines the generator knew
              nothing about. Running the documented rebuild deleted them, and
              nothing anywhere would have said so; the next thing anybody would
              have noticed is a fleet that stopped judging lubricant.

     wear.js  carried W.HOURS_PER_DAY = DUE.HOURS_PER_DAY (20 — this fleet runs
              two shifts). The generator still held the original 12. A rebuild
              would have quietly halved the assumed wear rate on every
              calendar-based forecast, which is a number somebody orders track
              chains against.

   Both are fixed. This guard is the reason they stay fixed: it copies the
   inputs into a scratch tree, runs each generator there, and demands the output
   match the committed file byte for byte. A generator that cannot rebuild its
   own artefact is not a build step, it is a loaded gun in the repository.

   Run: node tests/regen.cjs
*/
const { spawnSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");

const ROOT = path.join(__dirname, "..");
let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

/* No python, no openpyxl, no test. Skipping loudly beats a red suite on a
   machine that was never going to run the generators anyway. */
const py = spawnSync("python3", ["-c", "import openpyxl"], { encoding: "utf8" });
if (py.status !== 0) {
  console.log("  SKIP  python3 + openpyxl not available — generators not exercised");
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cm-regen-"));
process.on("exit", () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });

const copy = rel => {
  const dst = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(ROOT, rel), dst);
};

/* Every generator, its inputs, and what it must reproduce. `strip` removes the
   parts that are honestly allowed to differ — a build stamp is the date the
   file was made, not a fact about the fleet. */
const JOBS = [
  { name: "lube",
    script: "docs/build-lube-data.py",
    inputs: ["docs/source/Lube_Matrix_Oil_Analysis_Sampling.xlsm", "mobile/assets.js"],
    outputs: ["mobile/lube.js", "docs/lube-import-report.txt"],
    env: { CM_ROOT: tmp } },
  { name: "wear",
    script: "docs/build-wear-data.py",
    inputs: ["docs/wear-limits.json"],
    outputs: ["mobile/wear.js"],
    strip: s => s.replace(/"built":"[0-9-]+"/g, '"built":"X"')
                 .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "DATE") },
];

for (const job of JOBS) {
  console.log("\n── " + job.script);
  try {
    copy(job.script);
    job.inputs.forEach(copy);
    /* The committed artefact is copied in FIRST, so a generator that writes
       nothing at all fails on content rather than passing on a missing file. */
    job.outputs.forEach(copy);
    const r = spawnSync("python3", [path.join(tmp, job.script)],
      { cwd: tmp, encoding: "utf8", env: Object.assign({}, process.env, job.env || {}) });
    if (!ok(r.status === 0, "the generator runs",
            (r.stderr || "").trim().split("\n").slice(-2).join(" "))) continue;

    for (const out of job.outputs) {
      const want = fs.readFileSync(path.join(ROOT, out), "utf8");
      const got  = fs.readFileSync(path.join(tmp, out), "utf8");
      const norm = job.strip || (s => s);
      const a = norm(want), b = norm(got), same = a === b;
      let where = "";
      if (!same) {
        let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
        where = `first difference at ${i}: committed ${JSON.stringify(a.slice(i, i + 60))
                 } / rebuilt ${JSON.stringify(b.slice(i, i + 60))}`;
      }
      ok(same, `it reproduces ${out}`, same ? `${got.length} bytes` : where);
    }
  } catch (e) { ok(false, job.script + " — " + e.message); }
}

/* The header is a promise to whoever opens the file next. If a generated file
   stops saying so, the next hand edit is nobody's fault. */
console.log("\n── the files say what they are");
for (const f of ["mobile/lube.js", "mobile/wear.js"]) {
  const head = fs.readFileSync(path.join(ROOT, f), "utf8").slice(0, 400);
  ok(/GENERATED/i.test(head) && /build-\w+-data\.py/.test(head),
     `${f} names the script that builds it`);
}

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
