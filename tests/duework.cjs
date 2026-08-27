/* THE DUE LIST IS A WORK QUEUE, NOT A REPORT.

   The audit found it read-only: it said what was overdue and offered no way to
   do anything about it. Two controls were missing and one of them turned out to
   be missing at both ends.

   START hands the phone the same unit and round the row is about, through the
   deep link the app already implements for a scanned QR label — so the
   inspection that follows is this one, not a second record about the same
   machine on the same day.

   DEFER says "not this time, and here is why". A deferral is not a correction
   to a record — it is keyed by unit and round — so it is written as its own
   small JSON document in the folder the phones already write theirs to, in the
   identical shape. Nothing new has to understand it.

   And the gap this found: the phone WROTE deferrals and never READ them. The
   backend has always returned them in the sync reply and the handler simply
   ignored the field, so an office deferral changed nothing in the field and a
   technician walked to a machine somebody had already decided to skip.

   Run: node tests/duework.cjs [port]   (needs tests/ed-srv.cjs on 8093)
*/
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const B = `http://127.0.0.1:${PORT}`;

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

(async () => {
  const b = await chromium.launch();
  const errs = [];

  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on("pageerror", e => errs.push("DASH " + e.message));
  await p.goto(B + "/dashboard/index.html", { waitUntil: "load" });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    window.__docs = [];
    CMDrive.putDoc = (n, o) => { window.__docs.push({ n, o }); return Promise.resolve({ ok: true }); };
    try { localStorage.setItem("cm_dash_who", "R. Marrero"); } catch (e) {}
    showTab("due"); if ($("ddScope")) $("ddScope").value = "all"; renderDueTab();
  });
  await p.waitForTimeout(500);

  console.log("\n── every due row can be acted on");
  const row = await p.evaluate(() => {
    const tr = document.querySelector("#ddList tbody tr");
    const a = tr.querySelector("a[href]");
    return { start: !!a, href: a ? a.getAttribute("href") : "",
             newTab: a ? a.getAttribute("target") : "",
             rel: a ? a.getAttribute("rel") : "",
             defer: !!tr.querySelector("[data-defer]"),
             key: (tr.querySelector("[data-defer]") || {}).dataset?.defer };
  });
  ok(row.start && row.defer, "there is a Start and a Defer");
  ok(/unit=/.test(row.href) && /type=/.test(row.href),
     "Start carries the unit AND the round, so nothing is re-picked", row.href);
  /* A new tab that can reach back into this page through window.opener is a
     hole; noopener closes it. */
  ok(row.newTab === "_blank" && /noopener/.test(row.rel || ""),
     "and opens safely", `${row.newTab} ${row.rel}`);

  console.log("\n── a deferral needs a reason and a name");
  await p.evaluate(() => document.querySelector("#ddList [data-defer]").click());
  await p.waitForTimeout(300);
  const dlg = await p.evaluate(() => ({
    open: !document.getElementById("dfBox").classList.contains("hidden"),
    what: $("dfWhat").textContent, by: $("dfBy").value }));
  ok(dlg.open, "the dialog opens");
  ok(dlg.what.length > 3, "naming the machine and the round", dlg.what);
  ok(!!dlg.by, "with the name already known", dlg.by);
  await p.click("#dfSave"); await p.waitForTimeout(300);
  const refused = await p.evaluate(() => ({ msg: $("dfMsg").textContent, docs: window.__docs.length }));
  ok(refused.docs === 0, "an empty reason writes nothing", refused.docs + " doc(s)");
  ok(/reason/i.test(refused.msg), "and says what is needed", refused.msg.slice(0, 44));

  console.log("\n── and is written where the phones already look");
  await p.fill("#dfWhy", "In the workshop for a hoist repair until Friday.");
  await p.fill("#dfUntil", "2026-09-04");
  await p.click("#dfSave"); await p.waitForTimeout(1000);
  const saved = await p.evaluate(() => ({
    docs: window.__docs.length, name: window.__docs[0] && window.__docs[0].n,
    doc: window.__docs[0] && window.__docs[0].o,
    closed: document.getElementById("dfBox").classList.contains("hidden") }));
  ok(saved.docs === 1, "one document", saved.docs + "");
  ok(/^_meta\/deferrals\/.+\.defer\.json$/.test(saved.name || ""),
     "in the deferrals folder, named as the phones name theirs", saved.name);
  ok(saved.doc.type === "cm-round-deferred" && saved.doc.version === 1,
     "in the shape the phones write", `${saved.doc.type} v${saved.doc.version}`);
  ["u", "t", "why", "by", "at"].forEach(f =>
    ok(!!saved.doc[f], `carrying ${f}`, String(saved.doc[f]).slice(0, 30)));
  ok(saved.closed, "and the dialog closes");

  console.log("\n── clearing one is an act, not a deletion");
  const cleared = await p.evaluate(async () => {
    window.__docs = [];
    document.querySelector("#ddList [data-defer]").click();
    await new Promise(r => setTimeout(r, 200));
    const offered = !document.getElementById("dfClear").hidden;
    document.getElementById("dfClear").click();
    await new Promise(r => setTimeout(r, 800));
    return { offered, docs: window.__docs.length, doc: window.__docs[0] && window.__docs[0].o };
  });
  ok(cleared.offered, "the option is offered only on a row that has one");
  ok(cleared.docs === 1 && cleared.doc.cleared === 1,
     "clearing writes a record of the clearing", JSON.stringify(cleared.doc && cleared.doc.cleared));
  ok(!!cleared.doc.by && !!cleared.doc.at, "with who and when", `${cleared.doc.by} @ ${cleared.doc.at}`);

  /* ── the field end ───────────────────────────────────────────────────── */
  const app = await b.newPage({ viewport: { width: 390, height: 844 } });
  app.on("pageerror", e => errs.push("APP " + e.message));
  await app.goto(B + "/mobile/index.html", { waitUntil: "load" });
  await app.waitForFunction(() => (document.getElementById("verNum") || {}).textContent !== "?",
                            null, { timeout: 20000 });
  await app.waitForTimeout(700);

  console.log("\n── and it reaches the phone");
  const sync = await app.evaluate(() => {
    const out = { before: Object.keys(deferAll()).length };
    out.n1 = teamDefer([{ u: "TK146", t: "MP", until: "2026-09-04",
                          why: "Workshop", by: "R. Marrero", at: "2026-08-27T14:00:00Z" }]);
    out.stored = deferAll()["MP|TK146"];
    /* Last write wins, both ways: an older statement arriving late must not
       undo a newer one. */
    out.n2 = teamDefer([{ u: "TK146", t: "MP", until: null, why: "stale",
                          by: "X", at: "2026-08-01T00:00:00Z" }]);
    out.afterOld = deferAll()["MP|TK146"].why;
    out.n3 = teamDefer([{ u: "TK146", t: "MP", cleared: 1, at: "2026-08-28T00:00:00Z" }]);
    out.afterClear = !!deferAll()["MP|TK146"];
    return out;
  });
  ok(sync.n1 === 1 && !!sync.stored, "an office deferral lands on the phone",
     JSON.stringify(sync.stored));
  ok(sync.stored.why === "Workshop" && sync.stored.by === "R. Marrero",
     "with the reason and who decided it", `${sync.stored.by}: ${sync.stored.why}`);
  /* It came FROM the server, so re-uploading it would be this phone claiming
     somebody else's decision. */
  ok(sync.stored.up === 1, "marked as already sent, so it is not echoed back",
     String(sync.stored.up));
  ok(sync.n2 === 0 && sync.afterOld === "Workshop",
     "an older statement does not undo a newer one", sync.afterOld);
  ok(sync.n3 === 1 && sync.afterClear === false,
     "and a newer clear removes it", String(sync.afterClear));

  ok(errs.length === 0, "nothing threw throughout", errs.slice(0, 2).join(" | "));
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
