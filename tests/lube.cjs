/* The lubrication reference.

   Three things this has to get right, and each of them has already been wrong
   once in development:

   · A model string is NOT a key. "KOMATSU" is on the register as both an
     articulated truck and a loader; keying on the string alone gave a loader a
     truck's compartments with nothing to show anything had happened.
   · Matching a specification on shared words recommends transmission oil for
     hydraulics, because "API" and "KES" are in nearly every string.
   · The API diesel C-sequence is a ladder. Without it the round says NOT SET
     for an engine that has the correct arctic oil in the bulk tank.

   Run: node tests/lube.cjs */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const G = {};
new Function("window", fs.readFileSync(path.join(ROOT, "mobile/lube.js"), "utf8"))(G);
const L = G.LUBE;

const ASSETS = {};
new Function("window", fs.readFileSync(path.join(ROOT, "mobile/assets.js"), "utf8"))(ASSETS);

let fail = 0;
let pass = 0;
const ok = (cond, what) => {
  if (!cond) { fail++; console.log("  FAIL  " + what); }
  else { pass++; console.log("  PASS  " + what); }
  return cond;
};
const eq = (got, want, what) => ok(
  JSON.stringify(got) === JSON.stringify(want),
  what + "  (got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want) + ")");

console.log("── the reference loads");
ok(L, "window.LUBE exists");
ok(L.models.length > 40, "the whole primary fleet is present, not a sample: " + L.models.length);
ok(L.catalog.length > 8, "the catalogue has products: " + L.catalog.length);
eq(L.site.design, -40, "site design minimum");

console.log("── a model string is not a key");
/* The bug this exists for: "KOMATSU" is an articulated truck AND a loader. */
ok(L.ambiguous("KOMATSU"), "KOMATSU is known to be ambiguous");
eq(L.of("KOMATSU"), null, "an ambiguous model with no class resolves to NOTHING, not a coin flip");
const at = L.of("KOMATSU", "AT"), ldr = L.of("KOMATSU", "LDR");
ok(at && ldr, "with a class, both resolve");
ok(at.cls === "AT" && ldr.cls === "LDR", "and to the right class");
ok(at.comps.some(c => c.k === "TCASE"), "the articulated truck has a transfer case");
ok(!ldr.comps.some(c => c.k === "TCASE"), "the loader does not");
ok(ldr.comps.some(c => c.k === "AXF"), "the loader has a front axle");
ok(!at.comps.some(c => c.k === "AXF"), "the articulated truck does not");
ok(!L.ambiguous("KOMATSU HM400"), "a real model number is not ambiguous");
ok(L.of("KOMATSU HM400"), "and resolves with no class given");

console.log("── every machine on the register can be walked");
const PRIMARY = ["HT","AT","EXC","DOZ","LDR","GRD","DRB","DRE","HRB","CRJ","CRC","SCR"];
const prim = ASSETS.ASSETS.filter(a => PRIMARY.includes(a.cls) && a.m);
const noRef = prim.filter(a => !L.of(a.m, a.cls));
eq(noRef.length, 0, "no primary unit is left without a compartment list");
const noComps = prim.filter(a => L.comps(a.m, a.cls).length === 0);
eq(noComps.length, 0, "and none has an empty one");

console.log("── figures are separate from the compartment list");
/* The whole point of the split: a compartment can be audited before anybody
   has sourced its capacity. If this ever becomes false, field work starts
   waiting on a spreadsheet. */
const unsourced = L.comps("KOMATSU", "LDR").filter(c => c.cap == null);
ok(unsourced.length > 0, "a model nobody has sourced still lists its compartments");
ok(!L.sourced("KOMATSU", "ENG", "LDR"), "and reports them as unsourced");
ok(L.sourced("KOMATSU HM400", "TRN"), "a sourced compartment reports sourced");
eq(L.comp("KOMATSU HM400", "TRN").cap, 60, "with its capacity");
ok(L.comp("KOMATSU HM400", "TRN").src, "and a source, because a figure without one is a guess");

console.log("── specification matching");
const CASES = [
  [["API CK-4"],             "API CI-4 or better",       true,  "CK-4 supersedes CI-4"],
  [["API CK-4"],             "API CI-4",                 true,  "ladder, no 'or better' needed"],
  [["Cat ECF-3","API CK-4"], "API CI-4",                 true,  "ladder found among several claims"],
  [["API CI-4"],             "API CK-4 / Komatsu EO-DH", false, "an older oil does NOT serve a newer spec"],
  [["API CI-4"],             "API CI-4",                 true,  "exact"],
  [["API GL-5"],             "API GL-4",                 false, "no GL ladder: EP attacks yellow metal"],
  [["API CK-4"],             "API GL-5 / KES 07.869",    false, "engine oil is not a gear oil"],
  [["CAT TO-4"],             "KES 07.868.1 (TO-4 class)",true,  "TO-4 inside a Komatsu spec"],
  [["CAT TO-4"],             "Cat HYDO Advanced",        false, "powertrain is not hydraulic"],
  [["CAT TO-4"],             "ISO VG, anti-wear",        false, "powertrain is not hydraulic, other way round"],
  [["DIN 51524-3","ISO VG 22","ISO VG 32","Hitachi Super EX"],
                             "Hitachi Super EX / ISO VG",true,  "bare ISO VG family"],
  [["Wet brake WB-101"],     "Cat TO-4 / TO-4M",         false, "UTTO is not TO-4"],
  [[],                       "API CK-4",                 false, "no claims satisfies nothing"],
  [["API CK-4"],             "",                         false, "an unreadable spec matches nothing"],
];
CASES.forEach(([claims, spec, want, why]) =>
  eq(L.meetsSpec(claims, spec), want, why));

console.log("── the ladder is load-bearing");
/* A check that cannot fail is worse than no check: prove the ladder is what
   makes the CI-4 cases pass, rather than something else. */
const tok = L.specTokens("API CI-4 or better");
ok(tok.indexOf("apici4") >= 0, "the tokeniser produces the shape the ladder is written in: " + JSON.stringify(tok));

console.log("── cold");
const trn = L.comp("KOMATSU HM400", "TRN");
eq(L.coldOK(trn.gr, "SAE 10W"), true,  "10W is rated past the design minimum");
eq(L.coldOK(trn.gr, "SAE 30"),  false, "SAE 30 is not");
eq(L.coldOK(trn.gr, "SAE 50"),  null,  "a grade the manufacturer never lists is not a NO, it is unknown");

console.log("── what the picker offers");
const fit = L.fitFor("KOMATSU HM400", "TRN").map(p => p.p);
ok(fit.length > 0, "something qualifies for the HM400 transmission: " + JSON.stringify(fit));
ok(fit.every(n => {
  const p = L.product(n);
  return p.lo <= L.site.design;
}), "everything offered is rated for the coldest morning of the year");
ok(!fit.includes("HLP 46"), "a hydraulic oil is not offered for a transmission");
ok(!fit.includes("Generic TO-4 SAE 30"), "a TO-4 that stops at -10 is not offered at a -40 site");
const engFit = L.fitFor("NHL TR60", "ENG").map(p => p.p);
ok(engFit.includes("Mobil Delvac 1 5W-40"),
   "the CK-4 arctic oil IS offered for the CI-4 engine — the ladder, at the picker");
eq(L.fitFor("KOMATSU", "ENG", "LDR"), [], "an unsourced compartment has no spec, so offers nothing");

console.log("── evidence is ranked");
ok(L.evidRank("label") === 2 && L.evidRank("batch") === 2, "a photo or a batch is evidence");
ok(L.evidRank("told") === 1, "a verbal answer ranks below it");
ok(L.evidRank("") === 0 && L.evidRank("nonsense") === 0, "and nothing ranks nothing");

console.log("── register gaps are named, not dropped");
ok(L.gaps.length > 0, "the make-only records are listed: " + JSON.stringify(L.gaps.map(g => g.cls + " " + g.as)));

console.log(fail ? "\n" + fail + " FAILED" : "\nall lube reference checks pass");
process.exit(fail ? 1 : 0);
