/* A GRADE IS REVIEWED WITH THE EVIDENCE IN VIEW, AND THE NOTICE IS READABLE.

   Reported from the office on build 250, with a screenshot: in the correction
   panel the "grade review required" notice was a tall yellow box with a tick
   box floating in the middle and the words beside it cut into a one-word-per-
   line sliver at the edge; and the panel showed nothing of what the inspector
   had recorded — no photograph, no reading — so a grade had to be judged from
   the position's code alone. In the same breath: the attention table could not
   be sorted by when a machine was last inspected.

   The notice: ".srcbody input{width:100%}" came later in the sheet than
   ".agree input{width:16px}" and won, so the tick box was 540px wide,
   invisibly, and the label was pushed out of the box.

   What has to be true:
     · the tick box is a tick box, and its words sit inside the notice;
     · the notice is a few lines tall, not a screen;
     · each point in the panel shows its photographs and its reading — defect,
       cause, measurement, who found it — and a photograph opens the lightbox
       with its record and file named;
     · the attention table has an Inspected column that sorts by date, latest
       first on the first click, oldest first on the second.

   Run: node tests/edreview.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1800);
  await p.evaluate(BUNDLED + "()");
  await p.waitForTimeout(600);
  await p.evaluate(() => { try { localStorage.setItem("cm_dash_who", "R. Marrero"); } catch (e) {} });

  console.log("── the correction panel on a point that needs its grade reviewed");
  const target = await p.evaluate(async () => {
    let rec = null, it = null;
    for (const r of RECS) for (const i of (r.items || [])) {
      if (mediaOf(i, r).some(m => m.kind !== "video") && gradeNum(i.grade)) { rec = r; it = i; break; }
      if (rec) break;
    }
    if (!rec) return null;
    it.grade = 2; it.sev = "DEG"; it.defect = it.defect || "Ferrous debris — heavy"; it.cause = it.cause || "Assembly / installation error";
    it.comment = "На подшипнике обнаружена вмятина на поверхности дорожек качения, на внешней обойме продольная вмятина в виде полосы.";
    openEdit(ekOf(rec)); await new Promise(r => setTimeout(r, 700));
    return { rk: ekOf(rec), ik: it.key, photos: mediaOf(it, rec).length, defect: it.defect, by: rec.by || "" };
  });
  if (!target) { console.log("  SKIP  the fixture has no graded point with a photograph"); await b.close(); process.exit(0); }

  const m = await p.evaluate(({ ik }) => {
    const card = [...document.querySelectorAll("#edItems .srccard")].find(c => c.querySelector('[data-f="grade"][data-k="' + CSS.escape(ik) + '"]'));
    const q = s => card.querySelector(s); const rc = e => { const x = e.getBoundingClientRect(); return { x: x.left, y: x.top, w: x.width, h: x.height, r: x.right, b: x.bottom }; };
    const note = q(".note"), inp = q(".agree input"), span = q(".agree span"), para = q(".note p");
    return { hasNote: !!note, note: note && rc(note), input: inp && rc(inp), span: span && rc(span), para: !!para,
      lines: note ? Math.round(note.getBoundingClientRect().height / parseFloat(getComputedStyle(note).lineHeight || "16")) : 0,
      facts: !!q(".edfacts"), shots: q(".edfacts") ? q(".edfacts").querySelectorAll("[data-shot]").length : 0,
      dl: q(".edfacts dl") ? q(".edfacts dl").innerText.replace(/\s+/g, " ") : "" };
  }, target);
  ok(m.hasNote, "the notice is shown for the stale point");
  ok(m.input && m.input.w <= 20 && m.input.h <= 20, "the tick box is a tick box", m.input && `${Math.round(m.input.w)}×${Math.round(m.input.h)}px`);
  ok(m.span && m.span.r <= m.note.r + 1 && m.span.x >= m.note.x && m.span.w > 200, "its words sit inside the notice, on a proper line", m.span && `span ${Math.round(m.span.x)}..${Math.round(m.span.r)} in note ${Math.round(m.note.x)}..${Math.round(m.note.r)}`);
  ok(m.note.h < 150, "and the notice is a few lines tall, not a screen", Math.round(m.note.h) + "px");
  ok(m.para, "the explanation is its own paragraph above the tick");

  console.log("\n── what the inspector recorded is in the panel");
  ok(m.facts, "an evidence block is on the point");
  ok(m.shots === target.photos && m.shots > 0, "every photograph of the point is shown", m.shots + " of " + target.photos);
  ok(m.dl.indexOf(target.defect) >= 0, "with the defect", m.dl.slice(0, 120));
  ok(!target.by || m.dl.indexOf(target.by) >= 0, "and who found it", target.by);
  await p.evaluate(({ ik }) => { const card = [...document.querySelectorAll("#edItems .srccard")].find(c => c.querySelector('[data-f="grade"][data-k="' + CSS.escape(ik) + '"]'));
    card.querySelector(".edfacts [data-shot]").click(); }, target);
  await p.waitForTimeout(500);
  const lb = await p.evaluate(() => ({ open: document.getElementById("lb").classList.contains("open"), ctx: lbCtx ? { rk: lbCtx.rk, ik: lbCtx.ik, name: lbCtx.name } : null, edit: !document.getElementById("pxOpen").hidden }));
  ok(lb.open && lb.ctx && lb.ctx.rk === target.rk && lb.ctx.ik === target.ik && !!lb.ctx.name, "a photograph opens the lightbox with its record and file named", JSON.stringify(lb.ctx));
  ok(lb.edit, "and the editor is offered there");
  await p.evaluate(() => lbClose());
  await p.evaluate(() => { const x = document.getElementById("edCancel") || document.getElementById("edClose"); if (x) x.click(); });
  await p.waitForTimeout(300);

  console.log("\n── the attention table sorts by when a machine was inspected");
  await p.evaluate(() => { showTab("overview"); clearFilters(); fleetAll = true; renderFleet(); });
  await p.waitForTimeout(400);
  const col = await p.evaluate(() => { const th = document.querySelector('#fleetTbl thead th[data-sort="date"]'); return th ? { text: th.textContent.trim(), visible: th.getBoundingClientRect().width > 0 } : null; });
  ok(col && col.visible, "an Inspected column is there and visible on a wide screen", col && col.text);
  const dates = () => p.evaluate(() => { const cols = [...document.querySelectorAll("#fleetTbl thead th")].map(t => t.dataset.sort);
    return [...document.querySelectorAll("#fleetTbl tbody tr")].map(tr => (tr.children[cols.indexOf("date")].querySelector(".mono") || {}).textContent || ""); });
  await p.click('#fleetTbl thead th[data-sort="date"]'); await p.waitForTimeout(300);
  let d = await dates();
  const desc = d.every((x, i) => i === 0 || d[i - 1] >= x);
  ok(d.length > 3 && desc && (await p.evaluate(() => fleetSort.k === "date" && fleetSort.dir === -1)), "first click: latest inspection first", d.slice(0, 4).join(" > "));
  await p.click('#fleetTbl thead th[data-sort="date"]'); await p.waitForTimeout(300);
  d = await dates();
  const asc = d.every((x, i) => i === 0 || d[i - 1] <= x);
  ok(asc, "second click: oldest first", d.slice(0, 4).join(" < "));
  const cell = await p.evaluate(() => { const cols = [...document.querySelectorAll("#fleetTbl thead th")].map(t => t.dataset.sort);
    const tr = document.querySelector("#fleetTbl tbody tr"); return tr.children[cols.indexOf("date")].innerText.replace(/\s+/g, " ").trim(); });
  ok(/^\d{4}-\d{2}-\d{2}/.test(cell), "the cell carries the date, and the inspector beneath it", cell);
  await p.setViewportSize({ width: 1366, height: 800 });
  await p.waitForTimeout(300);
  const narrow = await p.evaluate(() => { const th = document.querySelector('#fleetTbl thead th[data-sort="date"]'); const tw = document.getElementById("fleetTbl"); const box = tw.parentNode;
    return { hidden: th.getBoundingClientRect().width === 0, fits: tw.scrollWidth <= box.clientWidth + 1 }; });
  ok(narrow.hidden && narrow.fits, "on a 1366 screen the column steps aside and the table still fits", JSON.stringify(narrow));

  ok(errs.length === 0, "no page errors", errs.join(" | ") || "none");
  console.log(fail ? `\nFAILED ${fail}` : "\nall passed");
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
