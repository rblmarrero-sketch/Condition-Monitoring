/* THE CROP YOU DRAW IS THE CROP YOU GET.

   Reported from the office on build 248: cropping "does not work properly",
   and a saved photograph "goes back to the original, or is not the same as
   the edit".

   Two faults, one cause. While the editor was open the picture was repainted
   with the crop already applied, and the crop box was then laid — in fractions
   of the frame — over that already-cropped picture. So the box never showed
   the frame it stood for, it jumped after every drag as the picture re-cropped
   beneath it, and Save stored a frame nobody had seen. Under zoom the box was
   a sibling of the picture rather than inside it, so the picture scaled out
   from under the box and a drag stored yet another frame.

   What has to be true, measured in pixels against the real controls:
     · while framing, the picture under the box is the WHOLE frame;
     · a corner dragged N pixels changes the stored crop by exactly N over the
       picture's width, at 100% and at 200%;
     · the box stays on the pixels it names under zoom;
     · what is shown after Save is the stored recipe applied to the original —
       the same pixels, the cropped size — and it is still that on reopening;
     · opening the editor again shows the whole frame with the box where the
       stored crop is.

   Run: node tests/pxcrop.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1800);
  await p.evaluate(BUNDLED + "()");
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    window.__w = [];
    CMDrive.saveEdit = d => { window.__w.push(JSON.parse(JSON.stringify(d))); return Promise.resolve({ ok: true }); };
    CMDrive.hasName = () => true;
    try { localStorage.setItem("cm_dash_who", "R. Marrero"); } catch (e) {}
  });
  const target = await p.evaluate(() => {
    for (const r of RECS) for (const i of (r.items || [])) {
      const m = mediaOf(i, r);
      if (m.length && m[0].kind !== "video") { showTab("equipment"); openPos(recKey(r), i.key);
        return { rk: recKey(r), ik: i.key, name: m[0].name }; }
    }
    return null;
  });
  if (!target) { console.log("  SKIP  the fixture has no photograph"); await b.close(); process.exit(0); }
  await p.waitForTimeout(500);

  const dims = () => p.evaluate(() => ({ w: $("lbimg").naturalWidth, h: $("lbimg").naturalHeight }));
  const rects = () => p.evaluate(() => { const i = $("lbimg").getBoundingClientRect(), c = $("pxCrop").getBoundingClientRect();
    return { img: { x: i.left, y: i.top, w: i.width, h: i.height }, box: { x: c.left, y: c.top, w: c.width, h: c.height } }; });
  const crop = () => p.evaluate(() => pxDraft && pxDraft.crop ? Object.assign({}, pxDraft.crop) : null);
  const settled = async (w, h) => p.waitForFunction(({ w, h }) => $("lbimg").complete && $("lbimg").naturalWidth === w && $("lbimg").naturalHeight === h,
    { w, h }, { timeout: 8000 }).then(() => true).catch(() => false);
  const drag = async (x1, y1, x2, y2) => { await p.mouse.move(x1, y1); await p.mouse.down(); await p.mouse.move(x2, y2, { steps: 6 }); await p.mouse.up(); };

  console.log("── the frame, then a crop box on it");
  await p.evaluate(() => document.querySelector("#drwBody [data-i]").click());
  await p.waitForTimeout(500);
  const O = await dims();
  ok(O.w > 0 && O.h > 0, "the original is on screen", O.w + "×" + O.h);
  await p.click("#pxOpen"); await p.waitForTimeout(300);
  await p.selectOption("#pxRatio", "free"); await p.waitForTimeout(400);
  ok(await settled(O.w, O.h), "choosing a crop leaves the WHOLE frame under the box — it is not cropped yet", JSON.stringify(await dims()));
  let c0 = await crop();
  ok(c0 && near(c0.x, 0.08, 1e-6) && near(c0.w, 0.84, 1e-6), "the freeform box starts at 8% in, 84% wide", JSON.stringify(c0));
  let r = await rects();
  ok(near(r.box.x, r.img.x + c0.x * r.img.w, 1.5) && near(r.box.w, c0.w * r.img.w, 1.5),
     "and is drawn exactly where those fractions fall on the picture", `box ${Math.round(r.box.x)}..${Math.round(r.box.x + r.box.w)} vs ${Math.round(r.img.x + c0.x * r.img.w)}..${Math.round(r.img.x + (c0.x + c0.w) * r.img.w)}`);

  console.log("\n── a corner dragged N pixels moves the crop by N pixels");
  {
    const se = await p.evaluate(() => { const h = document.querySelector('#pxCrop [data-h="se"]').getBoundingClientRect(); return { x: h.left + h.width / 2, y: h.top + h.height / 2 }; });
    const DX = 60, DY = 40;
    await drag(se.x, se.y, se.x - DX, se.y - DY);
    await p.waitForTimeout(200);
    const c1 = await crop(); r = await rects();
    ok(near(c1.w, c0.w - DX / r.img.w, 0.004) && near(c1.h, c0.h - DY / r.img.h, 0.004),
       "the stored width and height shrank by exactly the drag", `w ${c0.w.toFixed(3)} → ${c1.w.toFixed(3)} (want ${(c0.w - DX / r.img.w).toFixed(3)}), h ${c0.h.toFixed(3)} → ${c1.h.toFixed(3)} (want ${(c0.h - DY / r.img.h).toFixed(3)})`);
    ok(near(c1.x, c0.x, 1e-6) && near(c1.y, c0.y, 1e-6), "the opposite corner stayed put");
    ok(await settled(O.w, O.h), "and the picture under the box did not change", JSON.stringify(await dims()));
    ok(near(r.box.w, c1.w * r.img.w, 1.5) && near(r.box.h, c1.h * r.img.h, 1.5), "the box on screen is the stored crop", `${Math.round(r.box.w)}×${Math.round(r.box.h)} vs ${Math.round(c1.w * r.img.w)}×${Math.round(c1.h * r.img.h)}`);
    c0 = c1;
  }

  console.log("\n── the same at 200%: the box stays on the pixels it names");
  {
    await p.evaluate(() => { $("pxZoom").value = "200"; $("pxZoom").dispatchEvent(new Event("input", { bubbles: true })); });
    await p.waitForTimeout(200);
    r = await rects();
    ok(near(r.img.w, 2 * (r.img.w / 2), 0) && r.img.w > 0, "zoomed", Math.round(r.img.w) + "px wide");
    ok(near(r.box.x, r.img.x + c0.x * r.img.w, 2) && near(r.box.w, c0.w * r.img.w, 2),
       "the box scaled with the picture, still on its fractions", `box x ${Math.round(r.box.x)} vs ${Math.round(r.img.x + c0.x * r.img.w)}`);
    const mid = { x: r.box.x + r.box.w / 2, y: r.box.y + r.box.h / 2 };
    const MX = -50, MY = 30;
    await drag(mid.x, mid.y, mid.x + MX, mid.y + MY);
    await p.waitForTimeout(200);
    const c2 = await crop(); r = await rects();
    ok(near(c2.x, c0.x + MX / r.img.w, 0.004) && near(c2.y, c0.y + MY / r.img.h, 0.004),
       "moved by exactly the drag, measured on the zoomed picture", `x ${c0.x.toFixed(3)} → ${c2.x.toFixed(3)} (want ${(c0.x + MX / r.img.w).toFixed(3)})`);
    ok(near(c2.w, c0.w, 1e-6) && near(c2.h, c0.h, 1e-6), "without changing its size");
    await p.evaluate(() => { $("pxZoom").value = "100"; $("pxZoom").dispatchEvent(new Event("input", { bubbles: true })); });
    await p.waitForTimeout(200);
    c0 = c2;
  }

  console.log("\n── Save: what is shown is the recipe applied to the original");
  const wantW = Math.round(O.w * c0.w), wantH = Math.round(O.h * c0.h);
  await p.click("#pxSave");
  await p.waitForTimeout(1400);
  const saved = await p.evaluate(({ name }) => { const d = window.__w[window.__w.length - 1]; const m = d && d.media && d.media[name];
    return { crop: m ? m.crop : null, panelClosed: $("pxPanel").classList.contains("hidden"), msg: $("pxMsg").textContent }; }, target);
  ok(saved.crop && near(saved.crop.x, c0.x, 1e-6) && near(saved.crop.w, c0.w, 1e-6), "the recipe written is the box that was on screen", JSON.stringify(saved.crop));
  ok(saved.panelClosed, "the panel closed");
  ok(await settled(wantW, wantH), "and the lightbox now shows the CROPPED picture, at the cropped size", JSON.stringify(await dims()) + " want " + wantW + "×" + wantH);
  const same = await p.evaluate(async ({ name, rk }) => {
    /* The picture on screen against a fresh render of the original with the
       stored recipe: the same pixels, or it is not the edit. */
    const rec = pxGet(rk, name);
    const orig = new Image(); orig.src = pxOrigSrc; await new Promise(r => { orig.onload = r; orig.onerror = r; });
    const fresh = pxRender(orig, rec, 2000); if (!fresh) return { err: "no render" };
    const shown = $("lbimg");
    if (shown.naturalWidth !== fresh.width || shown.naturalHeight !== fresh.height) return { err: "size " + shown.naturalWidth + "×" + shown.naturalHeight + " vs " + fresh.width + "×" + fresh.height };
    /* Compared at full size. The lightbox holds a JPEG of the render, which
       alone moves a channel by about one and a half on average; anything
       beyond a few is a different picture. */
    const px = im => { const c = document.createElement("canvas"); c.width = fresh.width; c.height = fresh.height; c.getContext("2d").drawImage(im, 0, 0); return c.getContext("2d").getImageData(0, 0, c.width, c.height).data; };
    const a = px(fresh), bb = px(shown); let diff = 0;
    for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - bb[i]) + Math.abs(a[i + 1] - bb[i + 1]) + Math.abs(a[i + 2] - bb[i + 2]);
    return { mean: diff / (a.length / 4 * 3), w: fresh.width, h: fresh.height };
  }, target);
  ok(!same.err && same.mean < 4, "pixel for pixel, it is the stored recipe applied to the original", same.err || ("mean channel difference " + (same.mean || 0).toFixed(2) + " over " + same.w + "×" + same.h));

  console.log("\n── closed and opened again, it is still the edit");
  await p.evaluate(() => lbClose());
  await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector("#drwBody [data-i]").click());
  await p.waitForTimeout(700);
  ok(await settled(wantW, wantH), "reopened: the cropped picture, not the original", JSON.stringify(await dims()));
  const kept = await p.evaluate(() => pxRecipe && pxRecipe.crop ? pxRecipe.crop : null);
  ok(kept && near(kept.x, c0.x, 1e-6) && near(kept.w, c0.w, 1e-6), "with the same recipe", JSON.stringify(kept));

  console.log("\n── opening the editor shows the whole frame, box on the stored crop");
  await p.click("#pxOpen"); await p.waitForTimeout(500);
  ok(await settled(O.w, O.h), "the whole frame is back under the box", JSON.stringify(await dims()));
  r = await rects();
  ok(!(await p.evaluate(() => $("pxCrop").classList.contains("hidden"))) && near(r.box.x, r.img.x + c0.x * r.img.w, 1.5) && near(r.box.w, c0.w * r.img.w, 1.5),
     "and the box is exactly where the stored crop is", `box x ${Math.round(r.box.x)} w ${Math.round(r.box.w)} vs x ${Math.round(r.img.x + c0.x * r.img.w)} w ${Math.round(c0.w * r.img.w)}`);
  await p.click("#pxCancel"); await p.waitForTimeout(500);
  ok(await settled(wantW, wantH), "Cancel leaves the stored edit on screen", JSON.stringify(await dims()));

  ok(errs.length === 0, "no page errors", errs.join(" | ") || "none");
  console.log(fail ? `\nFAILED ${fail}` : "\nall passed");
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
