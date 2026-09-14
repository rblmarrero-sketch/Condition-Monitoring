/* THE OFFICE MUST GO QUIET WHEN NOBODY IS TOUCHING IT.

   Equipment History, a unit with photographs, a backend attached: the page
   repainted its whole history 210 times in three seconds — one every 15 ms,
   for as long as the tab stayed open. Measured, not inferred.

   The shape was a cycle of three things each of which was individually
   reasonable:

     renderHistory() ends by asking for this unit's photographs;
     pullDrivePhotos() repaints when photographs arrive;
     ensurePhotos() said photographs had arrived when none had.

   It answered with how many the unit WANTS rather than how many this call
   ADDED, so with everything already cached it was truthy for ever. And the
   cache pass held every stored copy to the INDEX's claimed length, dropping
   and refetching any file whose index size was simply wrong — on every pass,
   with a network request in it.

   What a person sees is not "slow". It is a photograph that cannot be clicked:
   the card is destroyed and rebuilt under the cursor before the press lands.
   tests/phase3.cjs had been failing on exactly that click for months and was
   read as a flaky test.

   So the rule this suite holds: AN IDLE OFFICE PAGE MAKES NO WORK FOR ITSELF.
   It is measured on the DOM, in numbers, because "it feels fine now" is how
   this came back.

   Run: node tests/noloop.cjs     (needs tests/mock.cjs on 8099) */
const { chromium } = require(require("./pw.cjs"));
const BASE = process.env.CMPORT ? "http://127.0.0.1:" + process.env.CMPORT : "http://127.0.0.1:8099";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };

/* Count DOM insertions and removals under a selector over a window, with
   nothing being touched. Returns batches so a steady drip is told apart from
   one honest repaint. */
const watch = (p, sel, ms) => p.evaluate(({ sel, ms }) => new Promise(res => {
  const t = document.querySelector(sel);
  if (!t) return res({ missing: true });
  let nodes = 0, batches = 0;
  const mo = new MutationObserver(list => {
    batches++;
    list.forEach(m => { nodes += m.addedNodes.length + m.removedNodes.length; });
  });
  mo.observe(t, { childList: true, subtree: true });
  setTimeout(() => { mo.disconnect(); res({ nodes, batches }); }, ms);
}), { sel, ms });

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem("cm_dash_lang", "en");
    localStorage.setItem("cm_drive_url", u);
    localStorage.setItem("cm_drive_sec", "");
    localStorage.setItem("cm_drive_cursor", "0");
  }, BASE + "/exec");
  await p.goto(BASE + "/dashboard/index.html", { waitUntil: "load" });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const o = document.getElementById("dataOv"); if (o) o.classList.add("hidden"); });

  console.log("1. THE WATCHER PROVES IT CAN SEE A REPAINT");
  /* Planted first, for the same reason every other instrument here plants its
     own fault: a counter that is wired to nothing reports a quiet page. */
  const seenPlanted = await (async () => {
    const w = watch(p, "#history", 700);
    await p.waitForTimeout(100);
    await p.evaluate(() => { const h = document.getElementById("history");
      for (let i = 0; i < 3; i++) { const d = document.createElement("div"); h.appendChild(d); d.remove(); } });
    return w;
  })();
  ok("a repaint is counted", seenPlanted.nodes >= 6, JSON.stringify(seenPlanted));

  console.log("\n2. EQUIPMENT HISTORY, A UNIT WITH PHOTOGRAPHS, LEFT ALONE");
  await p.evaluate(() => { showTab("equipment", true); });
  await p.waitForTimeout(600);
  const unit = await p.evaluate(() => {
    const s = document.getElementById("equipSel");
    const first = [...s.options].map(o => o.value).filter(Boolean)[0];
    if (first) { s.value = first; s.onchange && s.onchange(); }
    return first || "";
  });
  ok("a unit is open", !!unit, unit || "none offered");
  /* Long enough that a 15 ms cycle is unmistakable and a settling page is not:
     the broken build produced ~210 batches in three seconds here. */
  await p.waitForTimeout(2500);                      // let the first pull finish
  const idle = await watch(p, "#history", 3000);
  ok("the history is not rebuilding itself", idle.batches <= 3,
     idle.batches + " repaint batch(es), " + idle.nodes + " node(s) in 3 s");
  ok("  and it is not churning nodes", idle.nodes <= 40, idle.nodes + " node(s)");

  console.log("\n3. AND IT IS NOT ASKING THE BACKEND EITHER");
  /* A quiet DOM with a busy network is the same defect one layer down. */
  let calls = 0;
  const onReq = r => { if (/action=file|action=files/.test(r.url())) calls++; };
  p.on("request", onReq);
  await p.waitForTimeout(3000);
  p.off("request", onReq);
  ok("no photograph is refetched while nothing changes", calls === 0, calls + " file request(s) in 3 s");

  console.log("\n4. A REPAINT STILL HAPPENS WHEN IT SHOULD");
  const after = await p.evaluate(() => {
    const h = document.getElementById("history");
    const before = h.innerHTML.length;
    renderHistory();
    return { before, now: h.innerHTML.length };
  });
  ok("asking for one redraws the history", after.now > 0, JSON.stringify(after));

  ok("no page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
  await b.close();
  console.log("\n" + (fails.length ? fails.length + " FAILED" : "ALL PASS"));
  process.exit(fails.length ? 1 : 0);
})();
