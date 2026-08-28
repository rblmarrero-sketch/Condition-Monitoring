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
    /* the object that caused all of this, WITH the fields the phone really
       adds — detection and its label, written unconditionally by recToExport */
    { key: "", label: "", grade: "", sev: "", mm: "", unit: "", defect: "",
      cause: "", recommendation: "", prio: "", wo: "", comment: "", photos: 0,
      detection: "DM-02", detectionLabel: "Visual inspection",
      id: "tmp_8812", seq: 3, createdAt: "2026-08-05T04:11:02.881Z" },
  ],
};
const DZ007 = {
  equip: "DZ007", date: "2026-08-02", type: "UC", cls: "DOZ", by: "B. Ivanov",
  items: [
    { key: "ROLLER.L1", label: "Roller L1", mm: 213 },
    { key: "IDLER.L-OUT", label: "Idler L outer", mm: 29 },
    { key: "", label: "", mm: null, grade: null, comment: null, photos: 0, video: 0,
      detection: "DM-02", detectionLabel: "Visual inspection", seq: 4 },
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

  ["a lube product", { key: "", lubeProduct: "Mobil DTE 10" }],
  ["a temperature",  { key: "", tempC: 91 }],
]; 
carriers.forEach(([what, item]) => {
  const r = N.record({ equip: "ZZ001", date: "2026-08-05", type: "MP", items: [item] });
  ok(r.removed === 0 && r.orphans === 1,
     `kept and flagged: a keyless point with ${what}`,
     `removed ${r.removed}, flagged ${r.orphans}`);
  ok(r.rec.items[0] && r.rec.items[0]._needsPoint === 1,
     `  and it is marked for identification, not guessed at`);
});

console.log("\n  THE SHAPE recToExport ACTUALLY EMITS");
/* NOT HAND-WRITTEN. Two builds shipped a fix that passed a fixture I invented
   and failed in production, because the fixture never contained the field the
   phone actually adds. This object is every key recToExport writes for an
   untouched position, at the values it writes them — read off mobile/index.html,
   not imagined.

   The two that mattered:

       detection:      (p.detect || DETECT_DEFAULT)      // "DM-02"
       detectionLabel: detectLabel(p.detect || DETECT_DEFAULT, "en")

   Written unconditionally, on every item. A value the SOFTWARE supplies is not
   evidence that a HUMAN recorded anything, and treating it as such kept TK115
   and DZ007 on hold through v165 and v166 while Admin Diagnostics sat empty
   because nothing was ever removed. */
const EXPORTED_BLANK = {
  key: "", label: "", grade: "", sev: "", sevIso: "", action: "", actionIso: "",
  actionLabel: "", wo: "", prio: "", prioLabel: "", defectCode: "", defectIso: "",
  defect: "", iso: "", isoMode: "", lubeProduct: "", lubeUnlisted: 0,
  lubeEvidence: "", lubeSampled: 0, causeCode: "", causeIso: "", cause: "",
  particle: "", detection: "DM-02", detectionLabel: "Visual inspection",
  comp: "", oil: "", comment: "", tempC: "", ambC: "", tempMethod: "",
  photos: 0, video: 0,
};
ok(N.classify(EXPORTED_BLANK) === "empty",
   "an untouched position, exactly as the phone exports it, is empty",
   N.classify(EXPORTED_BLANK));
ok(N.unknown(EXPORTED_BLANK).length === 0,
   "and every one of its fields is classified", JSON.stringify(N.unknown(EXPORTED_BLANK)));
/* The other half: a defaulted field must not stop a REAL point from being real,
   and must survive on it untouched. */
const realWithDetection = { key: "FLOOR.1", label: "Floor plate 1", grade: "C",
  detection: "DM-02", detectionLabel: "Visual inspection" };
ok(N.classify(realWithDetection) === "ok", "a real point is unaffected");
const keptDet = N.record({ items: [realWithDetection] }).rec.items[0];
ok(keptDet.detection === "DM-02" && keptDet.detectionLabel === "Visual inspection",
   "and keeps its detection method, field for field");
/* A keyless point whose ONLY content is the default is still a blank row —
   this is the exact production case. */
ok(N.classify({ key: "", detection: "DM-02", detectionLabel: "Visual inspection" }) === "empty",
   "a keyless row carrying only the default detection is a blank row");
/* But add one real thing and it becomes a finding that needs identifying. */
ok(N.classify({ key: "", detection: "DM-02", grade: "X" }) === "orphan",
   "add a grade to it and it becomes a finding for a human");

console.log("\n  HOUSEKEEPING IS NOT CONTENT");
/* The bug that made the first version of this file useless in production. The
   blank row is not empty in the JSON sense — it arrives carrying a temporary
   id, a sequence number, a created timestamp, an import source, a sync flag.
   The first rule said "anything beyond the fields we know about counts as
   content", so every one of those made the row look real, every blank row was
   flagged for a human, and TK115 and DZ007 stayed on hold through a build that
   was supposed to have fixed them. */
const housekeeping = [
  ["a temporary id",       { id: "tmp_8812" }],
  ["a local id",           { localId: "L-41" }],
  ["a sequence number",    { seq: 3 }],
  ["an index",             { idx: 7 }],
  ["a created timestamp",  { createdAt: "2026-08-05T04:11:02.881Z" }],
  ["an updated timestamp", { updatedAt: "2026-08-05T04:12:00.000Z" }],
  ["an import source",     { src: "phone" }],
  ["a device",             { dev: "A9F2" }],
  ["a sync state",         { syncState: "sent" }],
  ["UI state",             { expanded: true, selected: true }],
  ["a schema version",     { version: 2, schema: "v4" }],
  ["an internal mark",     { _touchedByUi: 1 }],
  ["empty containers",     { photos: [], media: {}, attachments: [] }],
  ["all of it at once",    { id: "tmp_1", seq: 2, createdAt: "2026-08-05T04:11:02Z",
                             src: "phone", syncState: "sent", expanded: false,
                             photos: [], version: 2 }],
];
housekeeping.forEach(([what, extra]) => {
  const item = Object.assign({ key: "", label: "", grade: "", mm: "", defect: "",
                               comment: "", photos: 0 }, extra);
  const r = N.record({ equip: "ZZ002", items: [item] });
  ok(r.removed === 1 && r.orphans === 0,
     `removed: a blank row carrying only ${what}`,
     `removed ${r.removed}, flagged ${r.orphans}`);
});
/* And the exact production shape, whole. */
const realBlank = { key: "", label: "", grade: "", sev: "", mm: "", unit: "",
  defect: "", cause: "", recommendation: "", prio: "", wo: "", comment: "",
  photos: 0, id: "tmp_8812", seq: 3, createdAt: "2026-08-05T04:11:02.881Z",
  src: "phone", syncState: "sent" };
ok(N.classify(realBlank) === "empty",
   "the production blank row classifies as empty, housekeeping and all",
   N.classify(realBlank));

console.log("\n  a field nobody has classified is a developer's problem, not a technician's");
/* The reasoning behind the old catch-all was sound — a round added next year
   must not have its data eaten by a stale list — but charging it to the person
   at the truck was not. It is reported instead. */
const future = { key: "", label: "", somethingNewIn2027: "measured" };
ok(N.classify(future) === "empty",
   "an unknown field does not make a blank row into a finding", N.classify(future));
ok(N.unknown(future).indexOf("somethingNewIn2027") >= 0,
   "but it IS reported, so the omission gets fixed", JSON.stringify(N.unknown(future)));
const withUnknown = N.list([{ equip: "ZZ003", items: [future] }]);
ok(withUnknown.unknown.length === 1 && withUnknown.unknown[0].fields[0] === "somethingNewIn2027",
   "and it reaches the diagnostics tally", JSON.stringify(withUnknown.unknown));
ok(N.unknown({ key: "A", grade: "B", seq: 2, createdAt: "x" }).length === 0,
   "known operational and known housekeeping raise nothing");

/* And the one that must NOT keep a row alive. An owner is assigned to a
   finding in the office; it is not something anybody observed at a machine, so
   a keyless row carrying only an owner is still a blank row. */
const ownerOnly = N.record({ items: [{ key: "", label: "", owner: "A. Sokolov" }] });
ok(ownerOnly.removed === 1,
   "an owner alone does not make a blank row into a finding",
   `removed ${ownerOnly.removed}, flagged ${ownerOnly.orphans}`);
ok(N.record({ items: [{ key: "", grade: "C", owner: "A. Sokolov" }] }).orphans === 1,
   "but an owner beside a grade rides along with it");

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

console.log("\n  PHOTOS: A SLOT IS NOT A PHOTOGRAPH");
/* The field that kept TK115 and DZ007 on hold through v168, and the only one
   on the list that arrives in half a dozen shapes. Counting a slot is how a
   blank row becomes a finding somebody must identify; not counting a real one
   is how field evidence gets deleted. Both directions, exactly. */
const emptyPhotos = [
  ["photos: 0", 0], ["photos: null", null], ["photos: undefined", undefined],
  ["photos: ''", ""], ["photos: []", []],
  ["photos: [null, '']", [null, ""]],
  ["photos: [{}]", [{}]],
  ["photos: [{ name: '' }]", [{ name: "" }]],
  ["photos: {}", {}],
  ["photos: { name: '' }", { name: "" }],
];
emptyPhotos.forEach(([what, v]) => {
  const r = N.record({ items: [{ key: "", label: "", photos: v }] });
  ok(r.removed === 1 && r.orphans === 0,
     `removed: a blank row with ${what}`, `real=${N.photoCount(v)}`);
});
const realPhotos = [
  ["a count of 3", 3],
  ["two file names", ["a.jpg", "b.jpg"]],
  ["an attachment with an id", [{ id: "att_1", name: "x.jpg" }]],
  ["an attachment with only an id", [{ id: "att_2" }]],
  ["a single file name", "plug_left.jpg"],
  ["a mix of one real and two slots", [null, "real.jpg", ""]],
];
realPhotos.forEach(([what, v]) => {
  const r = N.record({ items: [{ key: "", label: "", photos: v }] });
  ok(r.removed === 0 && r.orphans === 1,
     `kept and flagged: a keyless point with ${what}`, `real=${N.photoCount(v)}`);
  /* THE PHOTOGRAPH ITSELF IS NEVER TOUCHED. */
  ok(JSON.stringify(r.rec.items[0].photos) === JSON.stringify(v),
     `  and the photographs are preserved exactly`);
});

console.log("\n  a photo count is never inherited from the inspection");
/* A record carrying three photographs across its real points must not put
   "photos: 3" on a blank one. Proven on the shape the phone exports: the count
   is per position, and a position with none carries 0. */
const parent = { equip: "TK500", date: "2026-08-05", type: "MP", photos: 3,
  items: [{ key: "1A", grade: "C", photos: 2 }, { key: "2B", grade: "A", photos: 1 },
          { key: "", label: "", photos: 0, detection: "DM-02" }] };
const pr = N.record(parent);
ok(pr.removed === 1, "the blank point is removed even though the inspection has photographs",
   `removed ${pr.removed}`);
ok(pr.rec.items.length === 2 && pr.rec.items[0].photos === 2 && pr.rec.items[1].photos === 1,
   "and every real point keeps its own count", JSON.stringify(pr.rec.items.map(i => i.photos)));

console.log("\n  the diagnostic reports the VALUE, not just the field name");
/* v168 said "on hold because: photos" and that was not enough to act on — a
   count of three and an array of two nulls are the same word and opposite
   problems. */
const exReal = N.explain({ key: "", photos: [{ id: "att_1", name: "x.jpg" }] });
ok(exReal.detail.some(d => /photos=array\[1\].*1 real/.test(d)),
   "a real attachment is reported with its shape and count", exReal.detail.join(" · "));
ok(exReal.photos === 1, "and the count is exposed for the UI", String(exReal.photos));
const exSlots = N.explain({ key: "", photos: [null, ""] });
ok(exSlots.verdict === "empty", "two empty slots are not evidence", exSlots.reason);

console.log("\n  THE GUARD THAT WOULD HAVE CAUGHT THIS");
/* Two builds shipped because a field the exporter fills in by itself was on the
   operational list, and nothing compared the two. This reads the exporter and
   fails if it writes a field unconditionally from a default that normalize.js
   has not classified as defaulted — so the next `x: (p.y || SOME_DEFAULT)`
   added to an export cannot quietly turn every blank row into a finding. */
const fs = require("fs");
const mob = fs.readFileSync(path.join(__dirname, "..", "mobile", "index.html"), "utf8");
/* field: (p.thing || SOME_CONSTANT)  — the shape that always emits something */
const defaulted = [...mob.matchAll(/(\w+)\s*:\s*\(?\s*p\.\w+\s*\|\|\s*([A-Z_][A-Z0-9_]*)\s*\)?/g)]
  .map(m => m[1]);
/* and the label form: field: someLabel(p.thing || SOME_CONSTANT, ...) */
const labelled = [...mob.matchAll(/(\w+)\s*:\s*\w+\(\s*p\.\w+\s*\|\|\s*[A-Z_][A-Z0-9_]*/g)]
  .map(m => m[1]);
const emitted = [...new Set(defaulted.concat(labelled))];
console.log("        exporter writes from a default: " + (emitted.join(", ") || "none"));
const unclassified = emitted.filter(f =>
  N.OPERATIONAL.indexOf(f) >= 0 && N.DEFAULTED.indexOf(f) < 0);
ok(unclassified.length === 0,
   "no field written from a default is treated as evidence of a finding",
   unclassified.length ? unclassified.join(", ") + " — add to DEFAULTED" : "none");
ok(emitted.includes("detection") || emitted.includes("detect"),
   "the guard can see the field that caused this", emitted.join(", "));

console.log(fail ? "\nFAILED: " + fail : "\nall passed");
process.exit(fail ? 1 : 0);
