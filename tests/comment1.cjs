/* A COMMENT BELONGS TO THE COMPONENT IT WAS TYPED ON, AND TO NOTHING ELSE.

   Reported from the field: "in the comments of each component it's commenting
   to all — the comment should be per component, not equipment as a whole, if a
   component was selected", on a measured round (undercarriage or dump body).

   The phone keeps one comment box and one current position, and every field on
   that form is written to whatever `curItem` happens to be when `saveCur()`
   runs. That is a design with exactly one failure mode, and it is this one: if
   the box is ever left holding the last position's text when the next position
   opens, then every step through the round writes that same sentence onto
   another station, and a round comes back with one note against forty points.
   A reader in the office cannot tell which one it was really about, which
   makes all forty worthless.

   So this suite walks a round the way an inspector does — pick, type, step,
   type, step back — and asserts after every move that each position holds its
   own note and no other. Both shapes of round, because they use different
   navigation and only one of them was named in the report:

     · the ordinary form, where the components are chips and cards;
     · the measured sheet, where a station is opened on the map and Next steps
       to the following one (`ucStep` → `pickComponent` → `saveCur`).

   And the two edges either navigation can produce:

     · text typed while NO component is selected must not be adopted by the
       first component that opens — it belongs to nothing and is discarded;
     · stepping through positions WITHOUT typing must not deposit the previous
       position's note on any of them.

   Run: node tests/comment1.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require("./pw.cjs"));
const BASE = process.env.CMPORT ? "http://127.0.0.1:" + process.env.CMPORT : "http://127.0.0.1:8099";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };

/* Every position that carries a comment, as "key=text". Read off the draft,
   which is what Save writes and what the folder eventually holds. */
const NOTES = () => Object.entries(draft.positions)
  .filter(([, v]) => (v.comment || "").trim())
  .map(([k, v]) => k + "=" + v.comment).sort();

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    localStorage.setItem("up_dests", JSON.stringify([{ id: "gas", on: true, url: "http://127.0.0.1:9/exec", sec: "", folder: "" }]));
    localStorage.setItem("cm_swap_off", "1"); localStorage.setItem("lang", "en");
  });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(BASE + "/mobile/index.html", { waitUntil: "load" }); await p.waitForTimeout(2500);

  console.log("1. THE ORDINARY FORM — CHIPS AND CARDS");
  const plain = await p.evaluate(NOTES2 => {
    eval("window.__notes = " + NOTES2);
    const out = {};
    /* A unit is `n` in the register the phone loads — not `u`, which is what
       the office calls it. Reading the wrong field gave selectEquip(undefined)
       and a suite that passed on whatever the app happened to fall back to. */
    const truck = (window.ASSETS || []).find(a => a.cls === "HT") || (window.ASSETS || [])[0];
    out.machine = truck && truck.n;
    type = "MP"; selectEquip(out.machine); goStep(2);
    const its = items().map(i => i.k);
    out.n = its.length; out.keys = its.slice(0, 3);
    if (its.length < 3) return out;
    const say = (k, s) => { pickComponent(k); $("comment").value = s; $("comment").dispatchEvent(new Event("input")); };
    say(its[0], "first note");
    out.after1 = window.__notes();
    /* Opening the next one must present an EMPTY box: a box still holding the
       last note is the whole defect, one keystroke from being written. */
    pickComponent(its[1]); out.boxOnSecond = $("comment").value;
    say(its[1], "second note");
    out.after2 = window.__notes();
    /* Stepping on without typing must add nothing. */
    pickComponent(its[2]); out.boxOnThird = $("comment").value;
    out.after3 = window.__notes();
    pickComponent(its[0]); out.boxBackOnFirst = $("comment").value;
    out.final = window.__notes();
    return out;
  }, NOTES.toString());
  ok("a round with components to walk", plain.n >= 3, plain.machine + " · " + plain.n + " points");
  ok("the first note is on the first component and nowhere else",
     plain.after1.length === 1 && plain.after1[0] === plain.keys[0] + "=first note", JSON.stringify(plain.after1));
  ok("  opening the next component shows an empty box", plain.boxOnSecond === "", JSON.stringify(plain.boxOnSecond));
  ok("  and its note lands on it alone",
     plain.after2.join(" | ") === [plain.keys[0] + "=first note", plain.keys[1] + "=second note"].sort().join(" | "),
     JSON.stringify(plain.after2));
  ok("stepping on without typing adds nothing to the third",
     plain.boxOnThird === "" && plain.after3.length === 2, JSON.stringify(plain.after3));
  ok("  and coming back shows the first component its own note",
     plain.boxBackOnFirst === "first note" && plain.final.length === 2, plain.boxBackOnFirst);

  console.log("\n2. THE MEASURED SHEET — THE ROUND THAT WAS REPORTED");
  const meas = await p.evaluate(NOTES2 => {
    eval("window.__notes = " + NOTES2);
    const out = {};
    /* Any machine the wear reference actually covers; without one there are no
       stations and the round this report is about does not exist. The type has
       to be set FIRST — ucStatus answers about the round in hand, so asking it
       on a plug round says "no" about every machine on site. */
    type = "UC";
    const unit = (window.ASSETS || []).map(a => a.n).find(u => { try { return ucStatus(u).ok; } catch (e) { return false; } });
    out.machine = unit; if (!unit) return out;
    selectEquip(unit); goStep(2);
    const its = items().map(i => i.k);
    out.n = its.length; out.keys = its.slice(0, 3);
    if (its.length < 3) return out;
    out.curBeforeAnyPick = curItem;
    /* The box must not be offered with nothing to attach a note to. */
    out.boxWithNoStation = $("captureBox").style.display !== "none";
    $("comment").value = "typed with nothing open"; $("comment").dispatchEvent(new Event("input"));
    out.strayStored = window.__notes();
    pickComponent(its[0]);
    out.boxOnFirstStation = $("comment").value;
    out.afterOpen = window.__notes();
    $("comment").value = "station one"; $("comment").dispatchEvent(new Event("input"));
    out.after1 = window.__notes();
    out.sheetOn = ucSheetOn();
    /* Next, the control an inspector actually presses on the map. */
    ucStep(1); out.cur2 = curItem; out.boxOnSecond = $("comment").value;
    $("comment").value = "station two"; $("comment").dispatchEvent(new Event("input"));
    out.after2 = window.__notes();
    ucStep(1); out.boxOnThird = $("comment").value;
    out.after3 = window.__notes();
    /* Closing the sheet saves and clears; nothing may be left to leak onto the
       next station opened. */
    ucCloseSheet();
    out.afterClose = window.__notes();
    pickComponent(its[2]); out.boxAfterReopen = $("comment").value;
    out.final = window.__notes();
    return out;
  }, NOTES.toString());

  if (!meas.machine || meas.n < 3) {
    ok("the wear reference covers a machine to walk", false,
       "no machine with stations — this suite cannot test the round it exists for");
  } else {
    ok("a measured round with stations to walk", meas.n >= 3, meas.machine + " · " + meas.n + " stations");
    ok("the comment box is not offered before a station is opened", !meas.boxWithNoStation,
       "curItem=" + JSON.stringify(meas.curBeforeAnyPick));
    ok("  so text with nothing open reaches no station", meas.strayStored.length === 0, JSON.stringify(meas.strayStored));
    ok("  and the first station opened does not adopt it",
       meas.boxOnFirstStation === "" && meas.afterOpen.length === 0,
       JSON.stringify({ box: meas.boxOnFirstStation, notes: meas.afterOpen }));
    ok("a station's note is on that station and nowhere else",
       meas.after1.length === 1 && meas.after1[0] === meas.keys[0] + "=station one", JSON.stringify(meas.after1));
    ok("  Next opens the following station with an empty box",
       meas.boxOnSecond === "" && meas.cur2 && meas.cur2 !== meas.keys[0],
       meas.cur2 + " · box " + JSON.stringify(meas.boxOnSecond));
    ok("  and its note lands on it alone", meas.after2.length === 2
       && meas.after2.indexOf(meas.keys[0] + "=station one") >= 0, JSON.stringify(meas.after2));
    ok("Next again, without typing, writes nothing onto the third",
       meas.boxOnThird === "" && meas.after3.length === 2, JSON.stringify(meas.after3));
    ok("  closing the sheet leaves the same two notes", meas.afterClose.length === 2, JSON.stringify(meas.afterClose));
    ok("  and reopening a station shows only what that station holds",
       meas.boxAfterReopen === "" && meas.final.length === 2,
       JSON.stringify({ box: meas.boxAfterReopen, notes: meas.final }));
  }

  console.log("\n3. AND WHAT LEAVES THE PHONE SAYS THE SAME");
  /* The draft is what the screen holds; the export is what the office reads.
     A per-position note that flattens on the way out is the same defect one
     step later, and only this asserts it does not. */
  const out = await p.evaluate(() => {
    const rec = { equip: curEquip, date: $("date").value || todayISO(), type,
                  cls: (ASSET_BY[curEquip] || {}).cls || "", by: "test", smu: "1",
                  positions: JSON.parse(JSON.stringify(draft.positions)) };
    const ex = recToExport(rec);
    return (ex.items || []).filter(i => (i.comment || "").trim()).map(i => i.key + "=" + i.comment).sort();
  });
  const drafted = await p.evaluate(NOTES2 => { eval("window.__notes = " + NOTES2); return window.__notes(); }, NOTES.toString());
  ok("every comment leaves the phone on the position it was typed on",
     out.join(" | ") === drafted.join(" | "), JSON.stringify(out));
  ok("  and no position carries a note it was not given",
     out.length === drafted.length, out.length + " exported / " + drafted.length + " on screen");

  ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
