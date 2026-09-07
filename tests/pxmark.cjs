/* MARKING WHERE THE FINDING IS.

   A caption can say what is wrong. Only a mark on the frame can say where.
   A planner reading nine photographs of one round has no way to know which
   corner of which frame "ferrous debris on the outboard half" is about, and a
   sentence cannot point at a picture.

   So the editor draws a ring or an arrow, and every rule the rest of the
   editor already lives by has to hold for it as well:

     · it is a RECIPE, not a repaint — the original file is never written to,
       and taking the marks off brings it back byte for byte;
     · a mark that changes nothing must not make a photograph "edited", so a
       tap is not a mark and leaves no undo step behind;
     · it is drawn in fractions of the frame, so the same recipe means the
       same thing at 400 px and at 2000 px;
     · it survives Save, comes back on the next open, and rides the same
       correction sidecar as every other office-side change;
     · Undo works on it, because an editor without one is an editor people are
       afraid of;
     · and it is a picture, not a caption: the derivative has to actually
       differ from the original in pixels, which is measured here rather than
       assumed.

   Run: node tests/pxmark.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
let fail = 0;
const ok = (c, w, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + w + (d !== undefined ? "   " + d : "")); if (!c) fail++; return c; };

/* Drag across the picture in its own client coordinates, so the suite exercises
   the real pointer path and not the state behind it. */
async function drag(p, fromX, fromY, toX, toY) {
  const box = await p.evaluate(() => {
    const r = document.getElementById("lbimg").getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const at = (fx, fy) => [box.x + box.w * fx, box.y + box.h * fy];
  const [x1, y1] = at(fromX, fromY), [x2, y2] = at(toX, toY);
  await p.mouse.move(x1, y1);
  await p.mouse.down();
  await p.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await p.mouse.move(x2, y2, { steps: 4 });
  await p.mouse.up();
  await p.waitForTimeout(120);
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" }); await p.waitForTimeout(1800);
  await p.evaluate(BUNDLED + "()"); await p.waitForTimeout(600);
  await p.evaluate(() => {
    window.__w = [];
    CMDrive.saveEdit = d => { window.__w.push(JSON.parse(JSON.stringify(d))); return Promise.resolve({ ok: true }); };
    CMDrive.hasName = () => true;
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
  await p.evaluate(() => document.querySelector("#drwBody [data-i]").click());
  await p.waitForTimeout(500);
  await p.evaluate(() => pxOpenPanel()); await p.waitForTimeout(400);

  console.log("\n1. THE CONTROLS ARE THERE AND SAY NOTHING IS MARKED");
  const c0 = await p.evaluate(() => ({
    ring: !!document.getElementById("pxRing"), arrow: !!document.getElementById("pxArrow"),
    clearOff: document.getElementById("pxNoMark").disabled,
    pressed: document.getElementById("pxRing").getAttribute("aria-pressed"),
    svgHidden: document.getElementById("pxMarks").classList.contains("hidden"),
    hint: document.getElementById("pxMarkHint").textContent.trim(),
    touched: pxTouched(pxDraft),
  }));
  ok(c0.ring && c0.arrow, "a ring tool and an arrow tool");
  ok(c0.clearOff, "  Clear marks is dead while there is nothing to clear");
  ok(c0.pressed === "false" && c0.svgHidden && !c0.hint, "  nothing armed, nothing drawn, nothing claimed", JSON.stringify(c0));
  ok(!c0.touched, "  and an unmarked photograph is not an edited one");

  console.log("\n2. A TAP IS NOT A MARK");
  await p.click("#pxRing"); await p.waitForTimeout(150);
  const armed = await p.evaluate(() => ({ pressed: document.getElementById("pxRing").getAttribute("aria-pressed"),
    hint: document.getElementById("pxMarkHint").textContent.trim(),
    cursor: document.getElementById("lb").classList.contains("marking") }));
  ok(armed.pressed === "true" && armed.cursor && /Drag/.test(armed.hint), "arming the tool says what to do next", JSON.stringify(armed));
  await drag(p, 0.5, 0.5, 0.503, 0.503);
  const tap = await p.evaluate(() => ({ n: pxMarksOf(pxDraft).length, undo: pxUndo.length, touched: pxTouched(pxDraft) }));
  ok(tap.n === 0 && tap.undo === 0 && !tap.touched,
     "a drag of nothing leaves no mark, no undo step and no edit", JSON.stringify(tap));

  console.log("\n3. A RING IS THE BOX THAT WAS DRAWN");
  await drag(p, 0.2, 0.25, 0.6, 0.7);
  const ring = await p.evaluate(() => { const m = pxMarksOf(pxDraft)[0] || {}; return {
    n: pxMarksOf(pxDraft).length, t: m.t, x: m.x, y: m.y, w: m.w, h: m.h,
    undo: pxUndo.length, shown: !document.getElementById("pxMarks").classList.contains("hidden"),
    ellipses: document.getElementById("pxMarks").querySelectorAll("ellipse").length,
    hint: document.getElementById("pxMarkHint").textContent.trim(),
    clearOn: !document.getElementById("pxNoMark").disabled }; });
  const near = (a, x) => Math.abs(a - x) < 0.03;
  ok(ring.n === 1 && ring.t === "ring", "one ring");
  ok(near(ring.x, 0.2) && near(ring.y, 0.25) && near(ring.w, 0.4) && near(ring.h, 0.45),
     "  at the fractions it was dragged over",
     [ring.x, ring.y, ring.w, ring.h].map(v => v.toFixed(3)).join(", "));
  ok(ring.shown && ring.ellipses === 2, "  drawn on the picture, dark stroke under bright", String(ring.ellipses));
  ok(ring.undo === 1, "  one undo step for the whole drag", String(ring.undo));
  ok(ring.clearOn && /1/.test(ring.hint), "  and the panel says how many there are", ring.hint);

  console.log("\n4. AN ARROW POINTS THE WAY IT WAS DRAWN");
  await p.click("#pxArrow"); await p.waitForTimeout(120);
  await drag(p, 0.8, 0.2, 0.55, 0.45);
  const arr = await p.evaluate(() => { const m = pxMarksOf(pxDraft)[1] || {}; return {
    n: pxMarksOf(pxDraft).length, t: m.t, x: m.x, y: m.y, w: m.w, h: m.h,
    paths: document.getElementById("pxMarks").querySelectorAll("path").length,
    ringStill: document.getElementById("pxMarks").querySelectorAll("ellipse").length }; });
  ok(arr.n === 2 && arr.t === "arrow", "an arrow beside the ring", JSON.stringify({ n: arr.n, t: arr.t }));
  ok(near(arr.x, 0.8) && near(arr.y, 0.2) && arr.w < 0, "  running right to left, which a normalised box could not say",
     [arr.x, arr.y, arr.w, arr.h].map(v => v.toFixed(3)).join(", "));
  ok(arr.paths === 2 && arr.ringStill === 2, "  and both marks are on screen", arr.paths + " paths, " + arr.ringStill + " ellipses");

  console.log("\n5. UNDO");
  await p.evaluate(() => pxStep(pxUndo, pxRedo)); await p.waitForTimeout(150);
  const u = await p.evaluate(() => pxMarksOf(pxDraft).length);
  await p.evaluate(() => pxStep(pxRedo, pxUndo)); await p.waitForTimeout(150);
  const r2 = await p.evaluate(() => pxMarksOf(pxDraft).length);
  ok(u === 1 && r2 === 2, "takes the last mark off and puts it back", u + " then " + r2);

  console.log("\n6. IT IS A PICTURE, NOT A CAPTION");
  const px = await p.evaluate(() => new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const bare = pxRender(img, { rot: 0, straighten: 0, crop: null }, 600);
      const with_ = pxRender(img, pxDraft, 600);
      if (!bare || !with_) return res({ err: "no canvas" });
      const A = bare.getContext("2d").getImageData(0, 0, bare.width, bare.height).data;
      const B = with_.getContext("2d").getImageData(0, 0, with_.width, with_.height).data;
      let diff = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) > 24) diff++;
      res({ px: A.length / 4, diff, w: with_.width, h: with_.height, visual: pxVisual(pxDraft) });
    };
    img.onerror = () => res({ err: "image" });
    img.src = pxOrigSrc;
  }));
  ok(!px.err && px.diff > 0, "the rendition differs from the original in pixels", JSON.stringify(px));
  ok(px.diff / px.px > 0.001 && px.diff / px.px < 0.25,
     "  by a drawing, not by a repaint of the whole frame",
     ((px.diff / px.px) * 100).toFixed(2) + "% of pixels");
  ok(px.visual, "  so the recipe counts as one that changes the picture");

  console.log("\n7. SAVED, AND STILL THERE ON THE WAY BACK IN");
  await p.evaluate(() => { document.getElementById("pxSave").click(); });
  await p.waitForTimeout(900);
  const saved = await p.evaluate(() => {
    const w = window.__w[window.__w.length - 1] || {};
    const m = (w.media || {})[pxKey(lbCtx.name)] || {};
    return { sent: !!w.media, marks: (m.marks || []).length, kinds: (m.marks || []).map(x => x.t).join(","),
             by: m.by || "", stored: pxMarksOf(pxGet(lbCtx.rk, lbCtx.name)).length };
  });
  ok(saved.sent && saved.marks === 2 && saved.kinds === "ring,arrow",
     "the marks go up in the correction sidecar", JSON.stringify(saved));
  ok(!!saved.by, "  with who made them");
  ok(saved.stored === 2, "  and are what the page holds afterwards", String(saved.stored));

  await p.evaluate(() => { closeLB && closeLB(); }).catch(() => {});
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector("#drwBody [data-i]").click());
  await p.waitForTimeout(600);
  const back = await p.evaluate(() => ({ n: pxMarksOf(pxDraft).length, badge: /px/i.test(document.getElementById("lbcap").innerHTML) }));
  ok(back.n === 2, "reopening the frame brings them back", String(back.n));
  ok(back.badge, "  and the frame says it carries an edit");

  console.log("\n8. AND THEY COME OFF AGAIN");
  await p.evaluate(() => pxOpenPanel()); await p.waitForTimeout(300);
  await p.click("#pxNoMark"); await p.waitForTimeout(200);
  const off = await p.evaluate(() => ({ n: pxMarksOf(pxDraft).length, marks: pxDraft.marks,
    touched: pxTouched(pxDraft), hidden: document.getElementById("pxMarks").classList.contains("hidden") }));
  ok(off.n === 0 && off.marks === null, "Clear marks empties the field rather than storing an empty list",
     JSON.stringify({ n: off.n, marks: off.marks }));
  ok(!off.touched, "  so the photograph is not edited any more");
  ok(off.hidden, "  and nothing is drawn over it");

  console.log("\n9. IN RUSSIAN");
  /* The lightbox is over the language switch, which is the point of a
     lightbox — so press the page's own button through the page rather than
     closing the editor this section is about. */
  await p.evaluate(() => document.querySelector('.lang button[data-lang="ru"]').click());
  await p.waitForTimeout(400);
  const ru = await p.evaluate(() => ({
    lab: (document.querySelector(".pxml") || {}).textContent || "",
    clr: document.getElementById("pxNoMark").textContent,
    ring: document.getElementById("pxRing").getAttribute("title") || "" }));
  const cyr = x => /[А-Яа-яЁё]/.test(x);
  ok(cyr(ru.lab) && cyr(ru.clr) && cyr(ru.ring), "the label, the button and the tool's name", [ru.lab, ru.clr, ru.ring].join(" · "));

  ok(errs.length === 0, "no page errors", errs.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fail ? "\nFAILED: " + fail : "\nall green");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
