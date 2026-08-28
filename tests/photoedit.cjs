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

  console.log("\n── the editor is reachable from where people look at photos");
  /* It was wired only to the position drawer. The Photos view of Equipment
     History — the four-across grid somebody actually browses — opened the
     lightbox with no record context, so the Edit button stayed hidden and the
     whole editor was unreachable from the one place it is wanted. */
  const gallery = await p.evaluate(() => {
    lbClose();
    const rec = RECS.find(r => (r.items || []).some(i => mediaOf(i, r).length));
    showTab("equipment"); $("equipSel").value = rec.equip;
    histView = "photos"; renderHistory();
    return { cards: document.querySelectorAll("#history .pos").length,
             withCtx: document.querySelectorAll("#history .pos[data-rk]").length };
  });
  await p.waitForTimeout(600);
  ok(gallery.cards > 0, "the Photos view has cards", gallery.cards + "");
  ok(gallery.withCtx === gallery.cards,
     "and every one carries its record and file names",
     `${gallery.withCtx} of ${gallery.cards}`);
  await p.evaluate(() => document.querySelector("#history .pos [data-i]").click());
  await p.waitForTimeout(400);
  const fromGallery = await p.evaluate(() => ({
    edit: !document.getElementById("pxOpen").hidden,
    name: lbCtx ? lbCtx.name : null }));
  ok(fromGallery.edit, "Edit photo is offered from the gallery too");
  ok(!!fromGallery.name, "with the file it is looking at", fromGallery.name);
  await p.click("#pxOpen"); await p.waitForTimeout(300);

  console.log("\n── zoom is for looking, and changes nothing");
  const zoom = await p.evaluate(() => {
    const before = JSON.stringify(pxDraft);
    $("pxZoom").value = "250"; $("pxZoom").dispatchEvent(new Event("input", { bubbles: true }));
    return { z: pxZ, transform: $("lbimg").style.transform,
             label: $("pxZoomV").textContent, recipeUnchanged: JSON.stringify(pxDraft) === before };
  });
  ok(Math.abs(zoom.z - 2.5) < 0.01, "the slider zooms", zoom.label);
  ok(/scale\(2\.5\)/.test(zoom.transform), "the picture actually scales", zoom.transform);
  /* A fitter zooming to read a part number has not edited the photograph. */
  ok(zoom.recipeUnchanged, "and the recipe is untouched by it");
  await p.evaluate(() => { $("pxZoom").value = "100";
    $("pxZoom").dispatchEvent(new Event("input", { bubbles: true })); });

  console.log("\n── the crop is dragged, not just chosen");
  await p.selectOption("#pxRatio", "free"); await p.waitForTimeout(300);
  const shown = await p.evaluate(() => ({
    visible: !$("pxCrop").classList.contains("hidden"),
    left: $("pxCrop").style.left, width: $("pxCrop").style.width,
    crop: pxDraft.crop }));
  ok(shown.visible, "the box appears on the picture");
  /* The box is drawn from the recipe in fractions — the same coordinates it is
     saved in — so what is dragged IS what is saved. */
  ok(shown.left === (shown.crop.x * 100) + "%" && shown.width === (shown.crop.w * 100) + "%",
     "drawn straight from the recipe, in its own coordinates",
     `${shown.left} / ${shown.width}`);
  const handle = await p.$("#pxCrop i[data-h='se']");
  const bb = await handle.boundingBox();
  const before = shown.crop;
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.mouse.down();
  await p.mouse.move(bb.x - 60, bb.y - 40, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ crop: pxDraft.crop, sel: $("pxRatio").value }));
  ok(after.crop.w < before.w && after.crop.h < before.h,
     "dragging a corner resizes it",
     `${before.w.toFixed(2)}×${before.h.toFixed(2)} → ${after.crop.w.toFixed(2)}×${after.crop.h.toFixed(2)}`);
  ok(after.crop.x === before.x && after.crop.y === before.y,
     "leaving the opposite corner where it was",
     `x ${after.crop.x.toFixed(2)} y ${after.crop.y.toFixed(2)}`);
  ok(after.sel === "free", "and it is the operator's framing now, not a preset", after.sel);
  await p.evaluate(() => { $("pxReset").click(); });
  await p.waitForTimeout(200);

  console.log("\n── zooming in is framing, and Save keeps it");
  /* Pressing Save after a zoom used to DESTROY the edit that was already there.
     Zoom is not part of the recipe, so the draft came out empty, and Save read
     an empty draft as "remove this" — Save behaving as Reset, which is the
     worst possible pairing of a word and an action. The picture on screen when
     somebody presses Save is the picture they mean. */
  const asCrop = await p.evaluate(async () => {
    window.__w = [];
    $("pxReset").click();
    await new Promise(r => setTimeout(r, 150));
    $("pxZoom").value = "250"; $("pxZoom").dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 150));
    $("pxSave").click();
    await new Promise(r => setTimeout(r, 1100));
    const d = window.__w[0] || {}; const k = Object.keys(d.media || {})[0];
    return { crop: k ? d.media[k].crop : null,
             stored: Object.keys(CMDash.mediaEdits(lbCtx.rk)).length };
  });
  ok(!!asCrop.crop, "a zoomed view saves", JSON.stringify(asCrop.crop));
  /* 250% shows 1/2.5 of each axis, centred — the same fractions the recipe
     already stores, so there is no second idea of "what is cropped". */
  ok(Math.abs(asCrop.crop.w - 0.4) < 0.01 && Math.abs(asCrop.crop.h - 0.4) < 0.01,
     "as exactly the slice that was visible", `w ${asCrop.crop.w.toFixed(3)} (1/2.5 = 0.4)`);
  ok(asCrop.stored === 1, "and it is on the record", asCrop.stored + "");

  console.log("\n── Save never deletes; Reset does, because Reset asked to");
  const keep = await p.evaluate(async () => {
    window.__w = [];
    $("pxSave").click();
    await new Promise(r => setTimeout(r, 900));
    return { stored: Object.keys(CMDash.mediaEdits(lbCtx.rk)).length };
  });
  ok(keep.stored === 1, "saving an unchanged edit keeps it", keep.stored + "");
  const wiped = await p.evaluate(async () => {
    window.__w = [];
    $("pxReset").click();
    await new Promise(r => setTimeout(r, 200));
    $("pxSave").click();
    await new Promise(r => setTimeout(r, 1100));
    return { stored: Object.keys(CMDash.mediaEdits(lbCtx.rk)).length };
  });
  ok(wiped.stored === 0, "Reset then Save removes it", wiped.stored + "");
  const nothing = await p.evaluate(async () => {
    window.__w = [];
    $("pxSave").click();
    await new Promise(r => setTimeout(r, 600));
    return { writes: window.__w.length, msg: $("pxMsg").textContent };
  });
  ok(nothing.writes === 0, "and Save on an unedited photo writes nothing",
     nothing.writes + " write(s)");
  ok(/nothing to save/i.test(nothing.msg), "saying so rather than doing nothing quietly",
     nothing.msg.slice(0, 50));
  /* A successful save closes the panel after a moment, so reopen it before the
     checks below reach for its controls. */
  await p.evaluate(async () => {
    if ($("pxPanel").classList.contains("hidden")) $("pxOpen").click();
    await new Promise(r => setTimeout(r, 200));
  });
  await p.waitForTimeout(300);

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

  /* ---------------------------------------------------------------------
     WHAT IS ON SCREEN AFTER SAVE IS WHAT WAS SAVED.

     Everything above this line checks what got WRITTEN, and all of it passed
     while the editor was visibly broken: "it says saved and then goes back to
     the original." Both statements were true. The sidecar was correct and the
     picture was not, and a suite that only reads the write cannot tell the
     difference — so from here down it reads the screen.

     Zoom is the case that exposed it. Zoom is not part of the recipe: while
     the panel is open it is a CSS transform on the original image, so no
     canvas render ever ran. Save folded the zoom into a crop and stored it
     properly, then closing the panel dropped the transform and left the img
     element pointing at the untouched original file. --------------------- */
  console.log("\n── the picture after Save is the picture that was saved");
  await p.evaluate(() => { CMDrive.hasName = () => true; lbClose(); });
  await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector("#drwBody [data-i]").click());
  await p.waitForTimeout(400);
  await p.evaluate(() => { pxReset.click(); pxOpenPanel();
    const z = $("pxZoom"); z.value = "200"; z.dispatchEvent(new Event("input")); });
  await p.waitForTimeout(400);
  const zoomed = await p.evaluate(() => ({
    z: pxZ, drafted: pxTouched(pxDraft),
    src: $("lbimg").src.slice(0, 5) }));
  ok(Math.abs(zoomed.z - 2) < 0.01, "zooming to 200% is a view, not yet a recipe", "pxZ=" + zoomed.z);
  ok(zoomed.drafted === false, "so the draft is still empty at this point");
  await p.evaluate(() => $("pxSave").click());
  await p.waitForTimeout(1400);
  const kept = await p.evaluate(() => {
    const img = $("lbimg");
    return { src: img.src.slice(0, 11),
             crop: pxRecipe && pxRecipe.crop ? { w: pxRecipe.crop.w, h: pxRecipe.crop.h } : null,
             badge: !!$("lbcap").querySelector(".pxbadge"),
             nat: img.naturalWidth + "x" + img.naturalHeight,
             open: $("lb").classList.contains("open") };
  });
  ok(!!kept.crop && Math.abs(kept.crop.w - 0.5) < 0.01,
     "Save folds the zoom into a crop and stores it", JSON.stringify(kept.crop));
  /* THE ONE THAT NAMES THE BUG. */
  ok(kept.src === "data:image/", "and the picture on screen is the derivative, not the original file",
     kept.src);
  ok(kept.badge, "the frame is marked as edited straight away, not on the next visit");

  console.log("\n── Cancel puts back what is stored, not what was abandoned");
  await p.evaluate(() => { pxOpenPanel();
    const st = $("pxStr"); st.value = "6"; st.dispatchEvent(new Event("input")); st.dispatchEvent(new Event("change")); });
  await p.waitForTimeout(500);
  await p.evaluate(() => $("pxCancel").click());
  await p.waitForTimeout(600);
  const cancelled = await p.evaluate(() => ({
    straighten: pxDraft.straighten, stored: pxRecipe ? pxRecipe.straighten : null,
    src: $("lbimg").src.slice(0, 11) }));
  ok(cancelled.straighten === cancelled.stored,
     "the abandoned draft is gone", cancelled.straighten + " vs stored " + cancelled.stored);
  ok(cancelled.src === "data:image/", "and the stored edit is still what is shown", cancelled.src);

  /* ---------------------------------------------------------------------
     THE PANEL MAY NOT COVER THE EVIDENCE.

     The panel is absolutely positioned over the bottom of the lightbox, which
     centres the photograph in the FULL viewport — so the centring never knew
     the panel was there. The single mitigation was a hardcoded "100vh - 210px"
     guess at the panel's height; the controls wrap to three rows at a laptop
     width and more in Russian, and at 260px tall the panel hid the bottom
     fifth of every photograph. The crop box could then be dragged into the
     hidden part, so an engineer could crop away a measurement they could not
     see. Checked in both languages, because that is where the guess broke. */
  console.log("\n── the editing panel never covers the photograph");
  /* Narrow enough that the controls wrap to three rows, which is the condition
     the hardcoded 210px was wrong about, and the width a laptop actually is.
     The language really is switched — through the control a person presses,
     because a test that calls a function which does not exist passes without
     checking anything, and Russian is where the labels are longest. */
  /* The stored edit is removed first, and the viewport is made short. Both
     matter: with a small derivative on screen the photograph never reaches the
     panel however wrong the reservation is, and a check that cannot fail is
     not a check — an earlier draft of this section passed against the broken
     stylesheet for exactly that reason. */
  await p.evaluate(() => { pxOpenPanel(); $("pxReset").click(); $("pxSave").click(); });
  await p.waitForTimeout(1200);
  await p.setViewportSize({ width: 1180, height: 560 });
  for (const lang of ["en", "ru"]) {
    /* Through the control a person presses — dispatched rather than clicked
       only because the open lightbox is on top of it. */
    await p.evaluate(l => document.querySelector(`.lang button[data-lang="${l}"]`).click(), lang);
    await p.waitForTimeout(400);
    await p.evaluate(() => pxOpenPanel());
    await p.waitForTimeout(500);
    const geo = await p.evaluate(() => {
      const i = $("lbimg").getBoundingClientRect(), pn = $("pxPanel").getBoundingClientRect();
      return { imgBottom: Math.round(i.bottom), panelTop: Math.round(pn.top),
               panelH: Math.round(pn.height), imgH: Math.round(i.height),
               rows: $("pxPanel").querySelectorAll(".pxrow").length,
               natH: $("lbimg").naturalHeight,
               constrained: Math.round(i.height) < $("lbimg").naturalHeight - 2,
               varH: getComputedStyle($("lb")).getPropertyValue("--pxh").trim() };
    });
    ok(geo.imgBottom <= geo.panelTop + 1, "[" + lang + "] the picture ends above the panel",
       "img ends " + geo.imgBottom + ", panel starts " + geo.panelTop);
    ok(geo.imgH > 100, "[" + lang + "] and there is still a picture to look at", geo.imgH + "px tall");
    /* If the frame is not being constrained by the viewport at all, the two
       checks above are true for free. */
    ok(geo.constrained, "[" + lang + "] and the frame is genuinely being constrained here",
       geo.imgH + " shown of " + geo.natH + " natural");
    /* The height is measured, never guessed: the fallback constant in the
       stylesheet is what this replaced. */
    ok(geo.varH === geo.panelH + "px", "[" + lang + "] the height used is the panel's real height",
       geo.varH + " vs " + geo.panelH + "px, " + geo.rows + " rows");
    await p.evaluate(() => $("pxCancel").click());
    await p.waitForTimeout(300);
  }
  await p.evaluate(() => document.querySelector('.lang button[data-lang="en"]').click());
  await p.waitForTimeout(300);
  /* The constant was wrong in BOTH directions, which is the argument for
     measuring rather than for a bigger constant: too small and it hid the
     bottom of the photograph, too large and it threw away picture for nothing.
     So what is checked is that the reservation FOLLOWS the panel — read at two
     widths where the controls wrap differently. */
  const at = async w => {
    await p.setViewportSize({ width: w, height: 560 });
    await p.waitForTimeout(400);
    await p.evaluate(() => pxOpenPanel());
    await p.waitForTimeout(400);
    const g = await p.evaluate(() => {
      const i = $("lbimg").getBoundingClientRect(), pn = $("pxPanel").getBoundingClientRect();
      return { panelH: Math.round(pn.height), clears: i.bottom <= pn.top + 1,
               varH: getComputedStyle($("lb")).getPropertyValue("--pxh").trim() };
    });
    await p.evaluate(() => $("pxCancel").click());
    await p.waitForTimeout(250);
    return g;
  };
  await p.setViewportSize({ width: 1400, height: 560 });
  const wide = await at(1400), narrow = await at(620);
  ok(wide.panelH !== narrow.panelH, "the panel is a different height at a different width",
     wide.panelH + "px at 1400, " + narrow.panelH + "px at 620");
  ok(wide.varH === wide.panelH + "px" && narrow.varH === narrow.panelH + "px",
     "and the space reserved for it follows, at both", wide.varH + " / " + narrow.varH);
  ok(wide.clears && narrow.clears, "so the photograph clears it at both");
  await p.setViewportSize({ width: 1440, height: 900 });

  ok(errs.length === 0, "nothing threw throughout", errs.slice(0, 2).join(" | "));
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
