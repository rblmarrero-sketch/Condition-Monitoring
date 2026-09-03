/* THE EDIT IS WHAT EVERY SCREEN AND THE REPORT SHOW.

   Reported from the office on build 249: "the saved photo is different in the
   report — you can see I cropped it." The recipe was applied in the lightbox
   and nowhere else. The history cards, the position drawer and the PDF all
   asked mediaOf() for a URL and were handed the original file.

   What has to be true:
     · once a crop is saved, mediaOf() hands out the rendition and keeps the
       original beside it;
     · the rendition is the cropped size, and pixel for pixel the recipe
       applied to the original;
     · the drawer thumbnails and the history cards show it;
     · the report is built from it, and waits for it;
     · the lightbox and its editor still open on the ORIGINAL;
     · removing the recipe puts the original back everywhere.

   Run: node tests/pxreport.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
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
        return { rk: recKey(r), ik: i.key, name: m[0].name, equip: r.equip, date: r.date }; }
    }
    return null;
  });
  if (!target) { console.log("  SKIP  the fixture has no photograph"); await b.close(); process.exit(0); }
  await p.waitForTimeout(500);
  const media = () => p.evaluate(({ rk, ik, name }) => { const rec = RECS.find(r => ekOf(r) === rk); const it = rec.items.find(i => i.key === ik);
    const m = mediaOf(it, rec).find(x => x.name === name); return m ? { src: m.src, orig: m.orig, derived: m.src !== m.orig } : null; }, target);
  const imgDims = url => p.evaluate(async u => { const i = new Image(); i.src = u; await new Promise(r => { i.onload = r; i.onerror = r; }); return { w: i.naturalWidth, h: i.naturalHeight }; }, url);
  const waitDerived = () => p.waitForFunction(({ rk, ik, name }) => { const rec = RECS.find(r => ekOf(r) === rk); const it = rec.items.find(i => i.key === ik);
    const m = mediaOf(it, rec).find(x => x.name === name); return !!(m && m.src !== m.orig); }, target, { timeout: 15000 }).then(() => true).catch(() => false);

  console.log("── before any edit, the original is what everything shows");
  const m0 = await media();
  ok(m0 && !m0.derived && m0.orig === m0.src, "mediaOf hands out the original", JSON.stringify(m0));
  const O = await imgDims(m0.orig);

  console.log("\n── a crop is saved");
  await p.evaluate(() => document.querySelector("#drwBody [data-i]").click());
  await p.waitForTimeout(500);
  await p.click("#pxOpen"); await p.waitForTimeout(300);
  await p.selectOption("#pxRatio", "free"); await p.waitForTimeout(400);
  const c = await p.evaluate(() => Object.assign({}, pxDraft.crop));
  await p.click("#pxSave"); await p.waitForTimeout(1200);
  ok((await p.evaluate(() => window.__w.length)) === 1, "the recipe went to the sidecar");
  await p.evaluate(() => lbClose());
  await p.waitForTimeout(300);

  console.log("\n── mediaOf now hands out the rendition, with the original beside it");
  ok(await waitDerived(), "a rendition exists");
  const m1 = await media();
  ok(m1 && m1.derived && m1.orig === m0.orig, "src is the rendition, orig is still the file", JSON.stringify(m1));
  const D = await imgDims(m1.src);
  const wantW = Math.round(O.w * c.w), wantH = Math.round(O.h * c.h);
  ok(near(D.w, wantW, 1) && near(D.h, wantH, 1), "at the cropped size", `${D.w}×${D.h} want ${wantW}×${wantH} (original ${O.w}×${O.h})`);
  const same = await p.evaluate(async ({ rk, name, src, orig }) => {
    const rec = pxGet(rk, name);
    const load = async u => { const i = new Image(); i.src = u; await new Promise(r => { i.onload = r; i.onerror = r; }); return i; };
    const o = await load(orig), d = await load(src);
    const fresh = pxRender(o, rec, 1600); if (!fresh) return { err: "no render" };
    if (fresh.width !== d.naturalWidth || fresh.height !== d.naturalHeight) return { err: "size " + d.naturalWidth + "×" + d.naturalHeight + " vs " + fresh.width + "×" + fresh.height };
    const px = im => { const cv = document.createElement("canvas"); cv.width = fresh.width; cv.height = fresh.height; cv.getContext("2d").drawImage(im, 0, 0); return cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; };
    const a = px(fresh), bb = px(d); let diff = 0;
    for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - bb[i]) + Math.abs(a[i + 1] - bb[i + 1]) + Math.abs(a[i + 2] - bb[i + 2]);
    return { mean: diff / (a.length / 4 * 3) };
  }, Object.assign({}, target, m1));
  ok(!same.err && same.mean < 4, "and pixel for pixel the recipe applied to the original", same.err || ("mean channel difference " + same.mean.toFixed(2)));

  console.log("\n── the drawer and the history cards show it");
  await p.evaluate(({ rk, ik }) => openPos(rk, ik), target);
  await p.waitForTimeout(500);
  const drw = await p.evaluate(() => [...document.querySelectorAll("#drwBody img[data-i]")].map(i => i.getAttribute("src")));
  ok(drw.includes(m1.src) && !drw.includes(m1.orig), "the drawer thumbnail is the rendition", drw.length + " thumbnails");
  await p.evaluate(({ equip }) => { showTab("equipment"); $("equipSel").value = equip; histView = "photos"; renderHistory(); }, target);
  await p.waitForTimeout(700);
  const cards = await p.evaluate(({ name }) => {
    const out = { card: null, med: null };
    for (const card of document.querySelectorAll("#history .pos[data-rk]")) {
      let names = []; try { names = JSON.parse(card.dataset.names || "[]"); } catch (e) {}
      const ix = names.indexOf(name); if (ix < 0) continue;
      let med = []; try { med = JSON.parse(card.dataset.med || "[]"); } catch (e) {}
      const im = card.querySelector(`img[data-i="${ix}"]`) || card.querySelector("img");
      out.card = im ? im.getAttribute("src") : null; out.med = med[ix] ? med[ix][0] : null; break;
    }
    return out;
  }, target);
  ok(cards.card === m1.src, "the history card shows the rendition", cards.card ? cards.card.slice(0, 40) : "no card");
  ok(cards.med === m1.orig, "while the card's lightbox data still names the original", cards.med ? cards.med.slice(0, 40) : "none");

  console.log("\n── the report is built from it");
  const rpt = await p.evaluate(({ rk, src, orig }) => {
    const recs = CMReport.recsForScope("one", rk);
    const html = CMR.sections({ lang, mode: "unit", title: "t", titleAlt: "t", sub: "s", subAlt: "s", stamp: new Date(),
      records: CMReport.normalise(recs, { photos: true }), sevLabel: s => s, sevLabelAlt: s => s, extra: [] }).map(s => s.html).join("");
    return { rendition: html.indexOf(src) >= 0, original: html.indexOf(orig) >= 0 };
  }, Object.assign({}, target, m1));
  ok(rpt.rendition && !rpt.original, "the report's pages carry the rendition and not the original file");
  const waited = await p.evaluate(async ({ rk }) => { const t0 = Date.now(); await pxDeriveAll(CMReport.recsForScope("one", rk)); return Date.now() - t0 < 5000; }, target);
  ok(waited, "and the report runner has something to wait on before it lays out a page");

  console.log("\n── the lightbox and its editor still open on the original");
  await p.evaluate(() => document.querySelector("#history .pos [data-i]").click());
  await p.waitForTimeout(500);
  const lb = await p.evaluate(() => ({ orig: pxOrigSrc, shown: $("lbimg").naturalWidth }));
  ok(lb.orig === m1.orig, "pxOrigSrc is the file, not the rendition", lb.orig.slice(0, 40));
  await p.waitForFunction(({ w }) => $("lbimg").complete && $("lbimg").naturalWidth === w, { w: wantW }, { timeout: 8000 }).catch(() => {});
  ok((await p.evaluate(() => $("lbimg").naturalWidth)) === wantW, "and paints the edit from it", String(await p.evaluate(() => $("lbimg").naturalWidth)));

  console.log("\n── removing the recipe puts the original back everywhere");
  await p.click("#pxOpen"); await p.waitForTimeout(300);
  await p.click("#pxReset"); await p.waitForTimeout(200);
  await p.click("#pxSave"); await p.waitForTimeout(1200);
  await p.evaluate(() => lbClose());
  await p.waitForTimeout(300);
  const m2 = await media();
  ok(m2 && !m2.derived, "mediaOf hands out the original again", JSON.stringify(m2));
  await p.evaluate(({ rk, ik }) => openPos(rk, ik), target);
  await p.waitForTimeout(400);
  const drw2 = await p.evaluate(() => [...document.querySelectorAll("#drwBody img[data-i]")].map(i => i.getAttribute("src")));
  ok(drw2.includes(m1.orig) && !drw2.includes(m1.src), "and so does the drawer");

  ok(errs.length === 0, "no page errors", errs.join(" | ") || "none");
  console.log(fail ? `\nFAILED ${fail}` : "\nall passed");
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
