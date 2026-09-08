/* THE DETAIL TABLE IS A TABLE, NOT A COLUMN OF PROSE.

   Found by rendering page four of a real round report and looking at it: an
   inspector's three-hundred-character note about gear-tooth spalling had been
   squeezed into the last column — a hundred and fifty points wide, because
   five fixed columns had taken the rest — and ran forty lines down the page,
   while the grade, the finding and the action sat alone at the top of a row
   seven hundred points tall. Two of those five columns had nothing in them on
   any row: severity, which the grade replaced, and cause, which most findings
   do not carry. The document was spending a fifth of its width on white space
   and taking it from the one column somebody has to read.

   Three things have to hold:
     · a column no row in this table has anything for is not printed;
     · a long note leaves the row and becomes a full-width line under it,
       inside the same stripe, so it is unmistakably about the position above;
     · a short one stays where it is — a sentence like "Clean." is a label,
       not a paragraph, and a row of its own for it is the opposite defect.

   And one thing that is not about layout at all: the row's class is "rnote"
   and not "note", because the report is built inside the host page and the
   dashboard has a .note callout in color-mix() whose computed value
   html2canvas cannot parse. Calling the row "note" made every round and month
   PDF fail to rasterise. That is worth a guard of its own.

   Run: node tests/rptnote.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require("./pw.cjs"));
const B = (process.env.CMPORT ? "http://127.0.0.1:" + process.env.CMPORT : "http://127.0.0.1:8099") + "/dashboard/index.html";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };
const LONG = "Ferrous debris across the full face of the plug, heavier on the outboard half, with a fine grey paste bridging the magnet gap and several curled slivers up to four millimetres long consistent with gear-tooth spalling rather than ordinary running-in wear.";
const SHORT = "Emulsified oil on the plug face.";

/* A round, not one machine: the detail table is what a round prints instead
   of the per-position cards a single inspection gets. */
const SEED = ([LONG, SHORT]) => {
  const recs = [{
    equip: "TK900", date: "2026-08-14", type: "MP", cls: "HT", by: "I. Petrov", smu: "18422",
    items: [
      { key: "4C", label: "Left Rear Final Drive", grade: 5, defect: "Ferrous debris",
        action: "REP", actionLabel: "Replace component", comment: LONG },
      { key: "3C", label: "Left Front Final Drive", grade: 3, defect: "Water ingress",
        action: "MON", actionLabel: "Monitor", comment: SHORT },
      { key: "4D", label: "Right Rear Final Drive", grade: 1 },
    ],
  }];
  for (let i = 0; i < 4; i++) recs.push({
    equip: "TK91" + i, date: "2026-08-14", type: "MP", cls: "HT", by: "S. Volkov", smu: String(9000 + i * 40),
    items: [{ key: "4C", label: "Left Rear Final Drive", grade: 2 + (i % 3), defect: "Ferrous debris",
              action: "SCH", actionLabel: "Schedule repair" },
            { key: "4D", label: "Right Rear Final Drive", grade: 1 }],
  });
  CMDash.importRecords(recs);
  const ov = document.getElementById("dataOv"); if (ov) ov.classList.add("hidden");
};
/* Lay the round's sections out and read the detail table's real shape. */
const READ = ([cause]) => {
  if (cause) RECS.forEach(r => (r.items || []).forEach(i => { if (i.key === "4C") i.cause = "CA-WEAR"; }));
  const secs = CMReport.sectionsFor("round", "2026-08-14", { lang: "en", bi: false, photos: false });
  const d = document.createElement("div"); d.id = "rptRoot";
  d.style.cssText = "position:fixed;left:-99999px;top:0;width:760px;";
  d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + "</div>").join("");
  document.body.appendChild(d);
  /* The detail table is the one headed by the item column. */
  const tbl = [...d.querySelectorAll("table")].filter(t =>
    /ITEM|Item/.test((t.querySelector("th") || {}).textContent || ""))[0];
  const out = { found: !!tbl };
  if (tbl) {
    out.heads = [...tbl.querySelectorAll("th")].map(x => x.textContent.trim());
    const rows = [...tbl.querySelectorAll("tr")].slice(1);
    out.rows = rows.length;
    out.notes = rows.filter(r => r.classList.contains("rnote")).length;
    out.badClass = rows.filter(r => r.classList.contains("note")).length;
    const n = rows.filter(r => r.classList.contains("rnote"))[0];
    out.noteText = n ? n.textContent.trim().slice(0, 60) : "";
    out.noteSpan = n ? Number((n.querySelector("td") || {}).colSpan || 0) : 0;
    out.noteStripe = n ? !!n.querySelector("td.stripe") : false;
    out.cells = rows.filter(r => !r.classList.contains("rnote"))
      .map(r => r.querySelectorAll("td").length);
    out.inline = [...tbl.querySelectorAll("tr:not(.rnote) td")]
      .some(td => td.textContent.indexOf("Emulsified oil") >= 0);
    out.longInline = [...tbl.querySelectorAll("tr:not(.rnote) td")]
      .some(td => td.textContent.indexOf("gear-tooth spalling") >= 0);
  }
  d.remove();
  return out;
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem("cm_drive_url", ""); localStorage.setItem("cm_dash_lang", "en"); });
  await p.goto(B, { waitUntil: "load" }); await p.waitForTimeout(1500);
  await p.evaluate(SEED, [LONG, SHORT]); await p.waitForTimeout(400);

  console.log("1. AN EMPTY COLUMN IS NOT A COLUMN");
  const a = await p.evaluate(READ, [false]);
  ok("the detail table is there", a.found, JSON.stringify(a.heads || []));
  ok("  severity, which the grade replaced, is not printed",
     !(a.heads || []).some(h => /Sever|Класс/i.test(h)), (a.heads || []).join(" · "));
  ok("  nor is a cause column no finding has anything for",
     !(a.heads || []).some(h => /Cause|причина/i.test(h)), (a.heads || []).join(" · "));
  ok("  and every row has exactly one cell per column",
     a.cells.every(c => c === a.heads.length), a.heads.length + " columns, rows " + a.cells.join(","));

  const c = await p.evaluate(READ, [true]);
  ok("a cause column comes back the moment one finding carries a cause",
     (c.heads || []).some(h => /Cause/i.test(h)) && c.heads.length === a.heads.length + 1,
     (c.heads || []).join(" · "));
  ok("  and the rows grow with it", c.cells.every(x => x === c.heads.length), c.cells.join(","));

  console.log("\n2. A LONG NOTE LEAVES THE ROW; A SHORT ONE DOES NOT");
  ok("the long note is on its own full-width line", c.notes === 1 && c.noteSpan === c.heads.length,
     JSON.stringify({ notes: c.notes, span: c.noteSpan, cols: c.heads.length }));
  ok("  and it is the note, not something else", /gear-tooth|Ferrous debris across/.test(c.noteText), c.noteText);
  ok("  it is not ALSO left in the cell it came from", !c.longInline);
  ok("  it keeps the position's stripe, so it reads as part of that row", c.noteStripe);
  ok("a short comment stays in its cell", c.inline && c.notes === 1,
     "inline=" + c.inline + " extra rows=" + c.notes);

  console.log("\n3. AND THE ROW IS NAMED SOMETHING THE HOST PAGE DOES NOT USE");
  /* The dashboard's own .note is built with color-mix(); html2canvas cannot
     parse the computed value, and a report row wearing that class took every
     round and month PDF down with it. Proven against the real rasteriser. */
  ok("the row does not wear the host page's .note class", c.badClass === 0, String(c.badClass));
  const raster = await p.evaluate(async () => {
    const secs = CMReport.sectionsFor("round", "2026-08-14", { lang: "en", bi: false, photos: false });
    const st = document.createElement("style"); st.textContent = CMR.CSS; document.head.appendChild(st);
    const d = document.createElement("div"); d.id = "rptRoot";
    d.style.cssText = "position:fixed;left:-99999px;top:0;width:760px;background:#fff;";
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + "</div>").join("");
    document.body.appendChild(d);
    let err = "";
    try { for (const el of d.children) await html2canvas(el, { scale: 1, backgroundColor: "#fff", logging: false }); }
    catch (e) { err = String((e && e.message) || e).slice(0, 90); }
    st.remove(); d.remove();
    return err;
  });
  ok("  every section of the document rasterises", raster === "", raster || "no error");

  ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
