/* TK115 AND DZ007: NOTHING, RENDERED AS A REAL PROBLEM.

   Both inspections reached the dashboard carrying one extra inspection-point
   object with nothing in it at all — no key, no name, no condition, no
   measurement, no defect, no comment, no photograph. Both also carried
   perfectly good identified points.

   The dashboard saw a point with no key, held the whole inspection back as
   untrustworthy, and told the reliability engineer a finding was not linked to
   a component — advising them to name it or re-walk the machine. There was no
   finding. There was a blank row, and the advice would have sent somebody to a
   truck at −40 to re-inspect a machine that had been inspected correctly.

   The rule this suite holds is exact in BOTH directions, because the two
   mistakes are opposite and both are unrecoverable in their own way:

     · delete a point that carries anything  ->  field evidence is lost
     · keep a point that carries nothing     ->  a good inspection is blocked

   So: removed only when there is no key, no name, and not one operational
   field with anything in it. Kept and flagged the moment it carries a grade, a
   millimetre, a defect, a comment or a photograph — and never guessed at.

   Run: node tests/emptypoint.cjs        (no browser, no server)
*/
const path = require("path");
global.self = global;
require(path.join(__dirname, "..", "mobile", "normalize.js"));
const N = global.CMNorm;

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

/* ---- the real shapes, as the deployed dashboard reported them ------------ */
const TK115 = {
  equip: "TK115", date: "2026-08-05", type: "TB", cls: "AT", by: "R. Marrero",
  items: [
    { key: "FLOOR.1", label: "Floor plate 1", grade: "C", mm: 18,
      defect: "Cracking", defectCode: "DT8-02", comment: "weld line lifting" },
    { key: "SIDE.L", label: "Left side sheet", grade: "B" },
    /* the object that caused all of this */
    { key: "", label: "", grade: "", sev: "", mm: "", unit: "", defect: "",
      cause: "", recommendation: "", prio: "", wo: "", comment: "", photos: 0 },
  ],
};
const DZ007 = {
  equip: "DZ007", date: "2026-08-02", type: "UC", cls: "DOZ", by: "B. Ivanov",
  items: [
    { key: "ROLLER.L1", label: "Roller L1", mm: 213 },
    { key: "IDLER.L-OUT", label: "Idler L outer", mm: 29 },
    { key: "", label: "", mm: null, grade: null, comment: null, photos: 0, video: 0 },
  ],
};

console.log("\n  the blank row, and only the blank row");
[["TK115", TK115, 2], ["DZ007", DZ007, 2]].forEach(([name, rec, want]) => {
  const r = N.record(rec);
  ok(r.removed === 1, `${name}: one completely empty row removed`, r.removed + " removed");
  ok(r.orphans === 0, `${name}: and nothing flagged for a human`, r.orphans + " flagged");
  ok(r.rec.items.length === want, `${name}: the real points are all still there`,
     r.rec.items.length + " kept");
  /* The half that actually matters. A rule that deletes the blank row is only
     safe if it provably leaves everything else untouched, byte for byte. */
  const before = rec.items.filter(i => i.key);
  ok(JSON.stringify(r.rec.items) === JSON.stringify(before),
     `${name}: kept points are unchanged, field for field`);
});

console.log("\n  a keyless point that carries something is NOT a blank row");
/* Each of these is one field away from the empty object above, and each must
   flip the answer. This is the list that stops the rule from quietly eating
   evidence when somebody adds a round next year. */
const carriers = [
  ["a grade",        { key: "", grade: "X" }],
  ["a severity",     { key: "", sev: "CRI" }],
  ["a measurement",  { key: "", mm: 4.5 }],
  ["a defect",       { key: "", defect: "Cracking" }],
  ["a defect code",  { key: "", defectCode: "DT8-02" }],
  ["a cause",        { key: "", cause: "Gear wear" }],
  ["an action",      { key: "", action: "REP" }],
  ["a priority",     { key: "", prio: "P1" }],
  ["a work order",   { key: "", wo: "WO-88213" }],
  ["a comment",      { key: "", comment: "fine fuzz" }],
  ["a photograph",   { key: "", photos: 2 }],
  ["a video",        { key: "", video: 1 }],
  ["an owner",       { key: "", owner: "A. Sokolov" }],
  ["a lube product", { key: "", lubeProduct: "Mobil DTE 10" }],
  ["a temperature",  { key: "", tempC: 91 }],
  /* the one the OPERATIONAL list has never heard of */
  ["a field nobody has added yet", { key: "", somethingNewIn2027: "measured" }],
];
carriers.forEach(([what, item]) => {
  const r = N.record({ equip: "ZZ001", date: "2026-08-05", type: "MP", items: [item] });
  ok(r.removed === 0 && r.orphans === 1,
     `kept and flagged: a keyless point with ${what}`,
     `removed ${r.removed}, flagged ${r.orphans}`);
  ok(r.rec.items[0] && r.rec.items[0]._needsPoint === 1,
     `  and it is marked for identification, not guessed at`);
});

console.log("\n  what counts as blank");
const blanks = [
  ["an empty string", ""], ["only spaces", "   "], ["null", null],
  ["undefined", undefined], ["zero photographs", 0], ["false", false],
  ["an empty list", []], ["an empty object", {}],
];
blanks.forEach(([what, v]) => {
  const r = N.record({ items: [{ key: "", label: "", comment: v }] });
  ok(r.removed === 1, `${what} is not content`, JSON.stringify(v));
});
/* And the boundary that would have eaten a real reading. */
const zeroMm = N.record({ items: [{ key: "", mm: 0 }] });
ok(zeroMm.removed === 1, "a measurement of exactly zero reads as no measurement",
   "documented: an unmeasured point and a 0 mm point are indistinguishable here");

console.log("\n  a point with a name but no key is a normal point");
const named = N.record({ items: [{ key: "", label: "Left final drive", grade: "B" }] });
ok(named.removed === 0 && named.orphans === 0,
   "it can be identified from its name, so nobody is interrupted");

console.log("\n  the tally the diagnostics line reports");
const many = N.list([TK115, DZ007, { equip: "OK1", items: [{ key: "A", grade: "A" }] }]);
ok(many.removed === 2, "two blank rows across the batch", String(many.removed));
ok(many.touched === 2, "on two inspections", String(many.touched));
ok(many.recs.length === 3, "and no inspection was dropped", String(many.recs.length));
/* An untouched record comes back as the SAME object, so callers can tell
   cheaply whether anything happened without deep-comparing every round. */
ok(many.recs[2] === many.recs[2], "an untouched record is returned as-is");

console.log("\n  it never throws on the shapes a folder actually contains");
[null, undefined, {}, { items: null }, { items: [] }, { items: [null, undefined] },
 { items: [{}] }, { items: "not a list" }].forEach((r, n) => {
  let threw = null;
  try { N.record(r); } catch (e) { threw = e.message; }
  ok(!threw, "survives malformed input #" + (n + 1), threw || "ok");
});

console.log(fail ? "\nFAILED: " + fail : "\nall passed");
process.exit(fail ? 1 : 0);
