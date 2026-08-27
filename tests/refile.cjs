/* A ROUND FILED AGAINST THE WRONG MACHINE.

   `equip|date|type` was this record's identity and its filing address at once,
   which is exactly why the three of them could not be corrected. A round
   entered against TK151 while the inspector was standing at TK158 had one
   remedy: void it and walk the machine again — a shift, a truck held, and a
   coat in −40. In practice nobody did it, so the wrong record stayed, counted
   in the coverage and put a due date in front of a planner.

   Three things have to be true for a re-file to be safe, and each of them was
   a way to lose an inspection:

     1. The correction stays filed under the address the round ARRIVED with.
        File it under the new one and the next Drive refresh — which re-reads
        the round under its original identity — finds no marker and silently
        undoes the move.
     2. Two rounds may never share an address. `rebuild` keys them into a Map,
        so a collision is not a merge; it is one of them disappearing behind
        the other with nothing reported anywhere.
     3. The backends must actually store it. Both whitelist the fields of an
        edit document, and a field that is not on the list is dropped after the
        save has already said "Saved" — which is how `media` and `reports` were
        being thrown away, silently, on both of them.

   Run: node tests/refile.cjs [port]    (needs tests/ed-srv.cjs on 8093)
*/
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on("pageerror", e => { fail++; console.log("  FAIL  PAGEERROR " + e.message); });
  await p.goto(URL, { waitUntil: "load" });
  /* RECS is a top-level `let`, so it is reachable as a bare identifier and NOT
     as window.RECS — waiting on the latter waits for ever. */
  await p.waitForFunction(() => !!window.CMDash && typeof RECS !== "undefined" && RECS.length > 0,
    null, { timeout: 25000 });
  await p.waitForTimeout(400);

  console.log("\n  the panel no longer says it cannot be done");
  const sub = await p.evaluate(() => I18N.en.ed_round_sub);
  ok(!/cannot be changed/i.test(sub), "the round card stopped refusing", sub.slice(0, 60) + "…");
  ok(await p.evaluate(() => !!document.getElementById("edMoveCard")), "there is a re-file card");
  ok(await p.evaluate(() => ["edMvUnit", "edMvDate", "edMvType", "edMvWhy", "edMove"]
      .every(id => !!document.getElementById(id))), "with all three identity fields and a reason");
  /* A duplicate class attribute is dropped by the parser, so a button meant to
     start hidden was on screen for every record. */
  ok(await p.evaluate(() => (document.getElementById("edMoveBack").outerHTML.match(/class=/g) || []).length === 1),
    "and the put-back button has exactly one class attribute");

  console.log("\n  what a move is refused for");
  const pick = await p.evaluate(() => {
    const r = RECS.find(x => !x._void && ASSET_BY[x.equip]);
    return r ? { k: ekOf(r), equip: r.equip, date: r.date, type: r.type } : null;
  });
  ok(!!pick, "a record to work on", pick && pick.k);
  const checks = await p.evaluate(o => {
    openEdit(o.k);
    const r = RECS.find(x => ekOf(x) === edKey);
    const other = RECS.find(x => ekOf(x) !== edKey);
    const future = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);
    return {
      same:    mvCheck(r, { equip: r.equip, date: r.date, type: r.type }, "because"),
      nounit:  mvCheck(r, { equip: "", date: r.date, type: r.type }, "because"),
      nowhy:   mvCheck(r, { equip: r.equip, date: "2020-01-01", type: r.type }, ""),
      unknown: mvCheck(r, { equip: "ZZ999", date: r.date, type: r.type }, "because"),
      future:  mvCheck(r, { equip: r.equip, date: future, type: r.type }, "because"),
      clash:   other ? mvCheck(r, { equip: other.equip, date: other.date, type: other.type }, "because") : "no rival",
      good:    mvCheck(r, { equip: r.equip, date: "2020-01-02", type: r.type }, "because"),
    };
  }, pick);
  ok(/already is/i.test(checks.same), "moving a round to where it is is not a move", checks.same);
  ok(/unit/i.test(checks.nounit), "a move with no unit is refused", checks.nounit);
  ok(/why/i.test(checks.nowhy), "and one with no reason", checks.nowhy);
  ok(/not on the fleet/i.test(checks.unknown), "a machine that is not on the fleet list", checks.unknown);
  ok(/future/i.test(checks.future), "and a date that has not happened", checks.future);
  /* The one that would lose an inspection rather than annoy somebody. */
  ok(/already exists/i.test(checks.clash),
    "moving one round onto another's address is refused, not merged", checks.clash);
  ok(checks.good === null, "a real move is allowed", String(checks.good));

  console.log("\n  the move itself");
  const moved = await p.evaluate(o => {
    const r0 = RECS.find(x => ekOf(x) === o.k);
    const to = { equip: r0.equip, date: "2020-01-03", type: r0.type };
    edits[o.k] = { key: o.k, by: "R. Marrero", at: new Date().toISOString(),
                   move: Object.assign({}, to, { why: "wrong day", by: "R. Marrero" }) };
    rebuild();
    const r = RECS.find(x => ekOf(x) === o.k);
    return r ? { ek: ekOf(r), rk: recKey(r), date: r.date, moved: r._moved,
                 was: r._wasKey, why: r._moveWhy } : null;
  }, pick);
  ok(!!moved, "the record is still findable after the move");
  ok(moved && moved.date === "2020-01-03", "it reads as the day it was actually walked", moved && moved.date);
  /* THE ONE THAT MATTERS. Address it by the new identity and the next refresh
     re-reads the round under the old one, finds no marker, and undoes the
     move — silently, which is this project's worst defect class. */
  ok(moved && moved.ek === pick.k,
    "but it is still filed under the address it arrived with", moved && moved.ek);
  ok(moved && moved.rk !== moved.ek, "which is no longer the address it reads under",
    moved && (moved.rk + "  vs  " + moved.ek));
  ok(moved && moved.moved && moved.moved.indexOf("date") >= 0,
    "it says what changed", moved && String(moved.moved));
  ok(moved && moved.was === pick.k, "and where it came from", moved && moved.was);
  ok(moved && moved.why === "wrong day", "with the reason on the record", moved && moved.why);

  console.log("\n  a move that changes nothing is not a move");
  const noop = await p.evaluate(o => {
    edits[o.k] = { key: o.k, by: "R", at: new Date().toISOString(),
                   move: { equip: o.equip, date: o.date, type: o.type, why: "x" } };
    rebuild();
    const r = RECS.find(x => ekOf(x) === o.k);
    return { moved: !!(r && r._moved) };
  }, pick);
  ok(!noop.moved, "no badge on a record nobody actually moved");

  console.log("\n  putting it back");
  const back = await p.evaluate(o => {
    edits[o.k] = { key: o.k, by: "R", at: new Date().toISOString(), move: null };
    rebuild();
    const r = RECS.find(x => ekOf(x) === o.k);
    return { date: r.date, moved: !!r._moved, rk: recKey(r) };
  }, pick);
  ok(back.date === pick.date && !back.moved,
    "it goes back to where it came from", back.rk);

  console.log("\n  what the backends agree to store");
  /* Three fields the dashboard writes on every correction. `media` and
     `reports` were being written and dropped on BOTH backends — the save
     succeeded, the panel said "Saved", and the crop or the issued report was
     gone the next time the folder was read. */
  const fs = require("fs");
  const yx = fs.readFileSync(__dirname + "/../docs/yandex/function.js", "utf8");
  const gs = fs.readFileSync(__dirname + "/../docs/google-upload.gs", "utf8");
  /* The edit document's literal, from its type tag to the line that writes it.
     Sized by the closing rather than by a character count — the count was 2400
     and the comments explaining these three fields are longer than that, so it
     reported the fields missing on a backend that stores them. */
  const doc = s => {
    const i = s.indexOf("cm-record-edit");
    if (i < 0) return "";
    const j = s.indexOf("items:", i);
    return j < 0 ? s.slice(i) : s.slice(i, j + 200);
  };
  ["move", "media", "reports"].forEach(f => {
    ok(new RegExp("\\b" + f + ":").test(doc(yx)), "the Yandex backend stores " + f);
    ok(new RegExp("\\b" + f + ":").test(doc(gs)), "and the Apps Script stores " + f);
  });

  console.log("\n  a backend answering \"nothing here\" does not delete anything");
  /* Both now answer with an explicit null for a record that has no recipes.
     `"media" in e` reads that as "the writer means to remove them" — and one
     refresh from Drive would strip every crop in the office. */
  const nulls = await p.evaluate(o => {
    CMDash.setEdits([{ key: o.k, by: "R", at: "2030-01-01T00:00:00.000Z",
                       media: { "a.jpg": { rot: 90 } } }]);
    const had = JSON.stringify(CMDash.mediaEdits(o.k));
    CMDash.setEdits([{ key: o.k, by: "R", at: "2030-01-02T00:00:00.000Z",
                       media: null, reports: null }]);
    return { had, now: JSON.stringify(CMDash.mediaEdits(o.k)) };
  }, pick);
  ok(nulls.had !== "{}", "a recipe was stored", nulls.had);
  ok(nulls.now === nulls.had, "and an explicit null did not take it away", nulls.now);
  /* An empty object still does, because that is how "reset to original"
     removes one — the distinction is the whole point. */
  const wiped = await p.evaluate(o => {
    CMDash.setEdits([{ key: o.k, by: "R", at: "2030-01-03T00:00:00.000Z", media: {} }]);
    return JSON.stringify(CMDash.mediaEdits(o.k));
  }, pick);
  ok(wiped === "{}", "but an empty one, written on purpose, does", wiped);

  console.log(fail ? "\nFAILED: " + fail : "\nall passed");
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + e.message); process.exit(1); });
