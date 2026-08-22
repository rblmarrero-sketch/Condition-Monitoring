/* The lubrication reference, imported from the site's own masterlist.

   The data is the client's — their component codes, their capacities, their
   intervals. So these checks are not about the numbers being right; they are
   about the import not QUIETLY CHANGING anything, and about the one thing the
   whole exercise exists for: that a fitter is told one product and never sees
   the 89 OEM spec strings behind it.

   Run: node tests/lube.cjs */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const G = {}, A = {};
new Function("window", fs.readFileSync(path.join(ROOT, "mobile/lube.js"), "utf8"))(G);
new Function("window", fs.readFileSync(path.join(ROOT, "mobile/assets.js"), "utf8"))(A);
const L = G.LUBE, ASSETS = A.ASSETS;

let fail = 0, pass = 0;
const ok = (c, w) => { if (!c) { fail++; console.log("  FAIL  " + w); }
                       else { pass++; console.log("  PASS  " + w); } return c; };
const eq = (g, w, what) => ok(JSON.stringify(g) === JSON.stringify(w),
  what + "  (got " + JSON.stringify(g) + ", wanted " + JSON.stringify(w) + ")");

console.log("── the masterlist loaded");
ok(L, "window.LUBE exists");
ok(L.models.length > 100, "models imported: " + L.models.length);
eq(L.catalog.length, 8, "the eight products actually on site");
eq(L.site.design, -40, "site design minimum");

console.log("── the site's own eight products, by type");
const types = L.catalog.map(p => p.t).sort();
eq(new Set(types).size, 8, "one product per lubricant type, no duplicates");
["engine","hydraulic","gear","grease","coolant","compressor","rockdrill","powertrain"]
  .forEach(t => ok(L.catalog.some(p => p.t === t), "  a " + t + " product exists"));
ok(L.catalog.every(p => /^#[0-9a-f]{6}$/i.test(p.hue)),
   "every product carries the site's own type colour");
/* Colour must be by TYPE, not per product, or it has to be relearned the day a
   drum changes supplier. */
const hueByType = {};
L.catalog.forEach(p => { hueByType[p.t] = p.hue; });
eq(new Set(Object.values(hueByType)).size, 8, "eight distinct type colours");

console.log("── HM400-3MO is one machine, however the register spells it");
/* The register spells the same truck three ways. Keeping one entry per
   spelling means the canonical name resolves to two rivals and therefore to
   neither, and splits the unit count across them. */
const spellings = [["KOMATSU","AT"], ["KOMATSU HM400","AT"],
                   ["Komatsu HM400-3MO","AT"], ["Komatsu HM400-3MO",null]];
const seen = spellings.map(([m, c]) => L.of(m, c));
ok(seen.every(Boolean), "every spelling resolves");
eq([...new Set(seen.map(r => r && r.m))], ["Komatsu HM400-3MO"],
   "and all of them to the masterlist's name");
eq([...new Set(seen.map(r => r && r.n))], [28],
   "with the unit count added up, not split");
eq([...new Set(seen.map(r => r && r.comps.length))].length, 1,
   "and one set of compartments");

console.log("── the codes and figures are the client's, unaltered");
const hm = L.of("Komatsu HM400-3MO", "AT");
const byK = {}; hm.comps.forEach(c => byK[c.k] = c);
/* Straight off the masterlist row for Komatsu HM400-3MO. If the importer ever
   starts "improving" a figure, this is where it shows. */
eq(byK["1"] && byK["1"].cap, 58,   "component 1 engine: 58 L");
eq(byK["1"] && byK["1"].iv, 250,   "  every 250 h");
eq(byK["2"] && byK["2"].cap, 257,  "component 2 transmission: 257 L");
eq(byK["3"] && byK["3"].cap, 245,  "component 3 hydraulic: 245 L");
eq(byK["4AL"] && byK["4AL"].cap, 7.8, "component 4AL front-left final drive: 7.8 L");
ok(byK["1"], "the codes are the site's own (1, 2, 3, 4AL …), not invented ones");
ok(!hm.comps.some(c => /^(ENG|TRN|HYD|FDL)$/.test(c.k)),
   "and none of my invented codes survived the import");

console.log("── every compartment is bilingual");
const noRu = [];
L.models.forEach(k => {
  const i = k.indexOf("|");
  (L.comps(k.slice(i+1), k.slice(0,i)) || []).forEach(c => {
    if (!c.en || !c.ru) noRu.push(k + " " + c.k);
  });
});
eq(noRu.slice(0, 5), [], "no compartment lost a language in the import");

console.log("── the field is told ONE product, never a spec string");
/* The whole point. 89 different OEM strings — Japanese full-width, Russian,
   brand names, multi-line — for eight products. A fitter in gloves cannot read
   that, and being asked to is how the wrong oil goes in. */
let withOem = 0, resolved = 0, unmapped = [];
L.models.forEach(k => {
  const i = k.indexOf("|"), m = k.slice(i+1), cls = k.slice(0,i);
  L.comps(m, cls).forEach(c => {
    if (c.oem) withOem++;
    const p = L.forComp(m, c.k, cls);
    if (p) resolved++; else if (c.t) unmapped.push(c.k + " (" + c.t + ")");
  });
});
ok(withOem > 200, "the OEM strings are kept for the engineer: " + withOem + " entries");
ok(resolved > withOem * 0.8,
   `and nearly all resolve to one of the eight products (${resolved})`);
/* Two types have no product on the shelf, and the Lube Legend says so itself:
   wire rope lube and open gear grease are both marked "(verify product)".
   That is an outstanding purchasing question, not an import fault — so it is
   named here rather than tolerated, and any NEW unmapped type fails. */
eq([...new Set(unmapped)].sort(), ["15 (wirerope)", "16 (opengear)"],
   "the only compartments with no product are the two the masterlist itself " +
   "has not chosen one for");
const p1 = L.forComp("Komatsu HM400-3MO", "1", "AT");
ok(p1 && /EXSOIL HD TRUCK ARCTIC/.test(p1.p),
   "the HM400 engine is told the site's engine oil, not 'EOS0W30': " + (p1 && p1.p));
ok(p1 && p1.hue, "with the colour a fitter matches against the drum");

console.log("── the masterlist's own flags survived as data, not cell colour");
const gaps = L.gaps();
ok(gaps.verify.length > 50,
   "placeholder figures to confirm are a work list: " + gaps.verify.length);
ok(gaps.noiv.length > 20,
   "capacities with no change interval too: " + gaps.noiv.length);
ok(gaps.ask.length > 0,
   "and the transmission-oil question is raised, not silently answered: " + gaps.ask.length);
/* A purple cell is a typical figure somebody filled in to make the totals
   work. Counting it as known is how a guess becomes a fact. */
const v = gaps.verify[0];
ok(v && !L.sourced(v.m, v.k), "a flagged placeholder does NOT count as sourced");

console.log("── the register can be walked");
const PRIMARY = ["HT","AT","EXC","DOZ","LDR","GRD","DRB","DRE","HRB","CRJ","CRC","SCR"];
const prim = ASSETS.filter(a => PRIMARY.includes(a.cls) && a.m);
const covered = prim.filter(a => L.of(a.m, a.cls));
ok(covered.length / prim.length > 0.8,
   `most primary units have a reference: ${covered.length} of ${prim.length}`);
/* Never across a class boundary: the make-only records are still a hazard. */
const ldr = L.of("KOMATSU", "LDR");
ok(!ldr || ldr.cls === "LDR",
   "a loader never resolves onto the articulated truck's entry");

console.log("── evidence is ranked");
ok(L.evidRank("label") === 2 && L.evidRank("batch") === 2, "a photo or a batch is evidence");
ok(L.evidRank("told") === 1, "a verbal answer ranks below it");
ok(L.evidRank("") === 0 && L.evidRank("nonsense") === 0, "and nothing ranks nothing");

console.log(fail ? "\n" + fail + " FAILED"
                 : "\nthe masterlist imported unaltered, and the field sees one product");
process.exit(fail ? 1 : 0);
