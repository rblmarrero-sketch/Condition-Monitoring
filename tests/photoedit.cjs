/* EVIDENCE IS NOT EDITABLE.

   A photograph of a cracked GET tooth is the reason a part gets ordered and,
   if it ever comes to it, the reason a warranty claim is paid. So the office
   can crop it, level it and caption it for a report, and none of that may touch
   the file the inspector took at the machine.

   What is stored is a RECIPE — rotate, straighten, crop, caption, and whether
   the report should prefer this frame. The picture on screen is that recipe
   applied to the original in a canvas, computed fresh every time. The original
   is one press away and byte-identical, because it was never written to.

   The two things this file exists to catch:
     · a save that reaches the original file rather than the sidecar
     · a "reset" that stores an empty recipe instead of removing it, so that
       "never edited" and "edited back to nothing" quietly diverge

   Run: node tests/photoedit.cjs [port]   (needs tests/ed-srv.cjs on 8093)
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
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    window.__w = [];
    CMDrive.saveEdit = d => { window.__w.push(JSON.parse(JSON.stringify(d))); return Promise.resolve({ ok: true }); };
    CMDrive.hasName = () => true;                       // original is safely stored
    try { localStorage.setItem("cm_dash_who", "R. Marrero"); } catch (e) {}
  });

  const target = await p.evaluate(() => {
    for (const r of RECS) for (const i of (r.items || [])) {
      const m = mediaOf(i, r);
      if (m.length && m[0].kind !== "video") {
        showTab("equipment"); openPos(recKey(r), i.key);
        return { rk: recKey(r), ik: i.key, name: m[0].name, src: m[0].src };
      }
    }
    return null;
  });
  if (!target) { console.log("  SKIP  the fixture has no photograph"); await b.close(); process.exit(0); }
  await p.waitForTimeout(500);

  console.log("\n── the editor is offered where there is something to edit");
  await p.evaluate(() => document.querySelector("#drwBody [data-i]").click());
  await p.waitForTimeout(500);
  const lb = await p.evaluate(() => ({
    open: document.getElementById("lb").classList.contains("open"),
    btn: !document.getElementById("pxOpen").hidden,
    ctx: lbCtx ? { rk: lbCtx.rk, name: lbCtx.name } : null }));
  ok(lb.open, "the lightbox opens");
  ok(lb.btn, "and offers Edit photo");
  ok(lb.ctx && lb.ctx.rk === target.rk && lb.ctx.name === target.name,
     "knowing which record and which file it is looking at", JSON.stringify(lb.ctx));

  await p.click("#pxOpen"); await p.waitForTimeout(300);
  const ctrls = await p.evaluate(() =>
    [...document.querySelectorAll("#pxPanel button,#pxPanel input,#pxPanel select")]
      .map(x => x.id).filter(Boolean));
  ["pxRotL", "pxRotR", "pxStr", "pxRatio", "pxCap", "pxPref", "pxCompare", "pxReset"].forEach(id =>
    ok(ctrls.includes(id), `it has ${id}`, ctrls.join(",")));

  console.log("\n── straighten is capped: presentation, not re-framing");
  const capped = await p.evaluate(() => {
    const r = $("pxStr");
    const attrs = { min: r.min, max: r.max };
    r.value = "40"; r.dispatchEvent(new Event("input", { bubbles: true }));
    return { attrs, got: pxDraft.straighten };
  });
  ok(Math.abs(Number(capped.attrs.max)) <= 10 && Math.abs(Number(capped.attrs.min)) <= 10,
     "the control itself only offers a small range", `${capped.attrs.min}..${capped.attrs.max}`);
  ok(Math.abs(capped.got) <= 8, "and a value forced past it is clamped anyway", String(capped.got));

  console.log("\n── a ratio crop is the ratio it says it is");
  const dims = await p.evaluate(() => new Promise(res => {
    const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.src = pxOrigSrc; }));
  for (const [v, label, want] of [["1", "1:1", 1], ["1.3333", "4:3", 4 / 3], ["1.7778", "16:9", 16 / 9]]) {
    await p.selectOption("#pxRatio", v); await p.waitForTimeout(350);
    const c = await p.evaluate(() => pxDraft.crop);
    const got = (dims[0] * c.w) / (dims[1] * c.h);
    /* The bug this replaces: the crop is stored in FRACTIONS, so 1:1 was
       computed as w=1,h=1 — the whole frame — until it asked the image how
       wide it actually is. */
    ok(Math.abs(got - want) < 0.01, `${label} crops to ${label}`, got.toFixed(3));
  }

  console.log("\n── the edit is a recipe, and the original is untouched");
  await p.evaluate(() => { $("pxRotR").click(); });
  await p.fill("#pxCap", "Debris on the plug face");
  await p.check("#pxPref");
  await p.waitForTimeout(300);
  await p.click("#pxSave"); await p.waitForTimeout(1200);
  const saved = await p.evaluate(() => {
    const d = window.__w[0] || {};
    const k = Object.keys(d.media || {})[0];
    return { writes: window.__w.length, key: k, rec: k ? d.media[k] : null,
             itemsUntouched: JSON.stringify(d.items || {}) === "{}" ||
                             !Object.keys(d.items || {}).length };
  });
  ok(saved.writes === 1, "one write", saved.writes + "");
  ok(saved.key === target.name, "keyed by the file it describes", saved.key);
  ok(saved.rec && saved.rec.rot === 90, "carrying the rotation", saved.rec && saved.rec.rot);
  ok(saved.rec && saved.rec.crop && saved.rec.crop.ratio === "1.7778",
     "the crop", saved.rec && JSON.stringify(saved.rec.crop));
  ok(saved.rec && saved.rec.caption === "Debris on the plug face", "the caption", saved.rec && saved.rec.caption);
  ok(saved.rec && saved.rec.preferred === 1, "and which frame the report should prefer");
  ok(!!(saved.rec && saved.rec.by && saved.rec.at), "with editor and timestamp",
     saved.rec && `${saved.rec.by} @ ${saved.rec.at}`);
  ok(!!(saved.rec && saved.rec.fp), "and a fingerprint identifying the derivative",
     saved.rec && saved.rec.fp);
  ok(saved.rec && saved.rec.src === target.name,
     "pointing back at the source media", saved.rec && saved.rec.src);

  /* THE assertion. Nothing in the write touches image bytes or the original
     file: the payload carries a recipe and nothing else. */
  const payload = await p.evaluate(() => JSON.stringify(window.__w[0]));
  ok(!/data:image/.test(payload), "the write carries no image data at all",
     payload.length + " chars, no data: URI");
  const origLive = await p.evaluate(async () => {
    const r = await fetch(pxOrigSrc, { method: "GET" });
    return { ok: r.ok, type: r.headers.get("content-type") || "" };
  });
  ok(origLive.ok, "and the original file is still there, served as it was",
     origLive.type);

  console.log("\n── it can be compared against the original, and put back");
  const cmp = await p.evaluate(() => {
    const before = $("pxCompare").getAttribute("aria-pressed");
    $("pxCompare").click();
    return { before, after: $("pxCompare").getAttribute("aria-pressed"), showing: pxCompare };
  });
  ok(cmp.before === "false" && cmp.after === "true" && cmp.showing,
     "Show original is a real toggle with a state", `${cmp.before} → ${cmp.after}`);
  await p.evaluate(() => $("pxCompare").click());

  const reset = await p.evaluate(async () => {
    window.__w = [];
    $("pxReset").click();
    $("pxSave").click();
    await new Promise(r => setTimeout(r, 900));
    const d = window.__w[0] || {};
    return { writes: window.__w.length,
             media: d.media || {},
             keys: Object.keys(d.media || {}),
             stored: Object.keys(CMDash.mediaEdits(lbCtx.rk)) };
  });
  /* Reset REMOVES the recipe. Storing an empty one would mean "never edited"
     and "edited back to nothing" are different rows that render identically —
     which is how an audit trail starts lying. */
  ok(reset.keys.length === 0, "reset removes the recipe rather than storing an empty one",
     JSON.stringify(reset.keys));
  ok(reset.stored.length === 0, "and the record holds none", JSON.stringify(reset.stored));

  console.log("\n── an original still uploading cannot be edited yet");
  const pend = await p.evaluate(async () => {
    CMDrive.hasName = () => false;                  // not on the server yet
    window.__w = [];
    pxOpenPanel();
    const msg = $("pxMsg").textContent;
    const disabled = ["pxRotL", "pxRotR", "pxSave"].filter(id => $(id).disabled);
    $("pxSave").click();
    await new Promise(r => setTimeout(r, 400));
    return { msg, disabled, writes: window.__w.length };
  });
  ok(/upload/i.test(pend.msg), "it says the original is still coming", pend.msg.slice(0, 50));
  ok(pend.disabled.length === 3, "the controls are held", pend.disabled.join(","));
  ok(pend.writes === 0, "and nothing is written", pend.writes + " write(s)");

  ok(errs.length === 0, "nothing threw throughout", errs.slice(0, 2).join(" | "));
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
