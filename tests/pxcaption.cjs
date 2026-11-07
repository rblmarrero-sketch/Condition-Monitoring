/* A CAPTION TYPED IN EDIT PHOTO IS PRINTED IN THE REPORT.

   Reported 2026-11-06 with a screenshot: TK126's overview photograph,
   caption "TK126 - All good", saved — and not on the report. The caption was
   stored in the recipe (edits[rk].media[name].caption) and nothing read it:
   pxPresent handed out the rendition and dropped the words.

   What has to be true, on BOTH office pages:
     · a caption saved on a finding's photograph reaches the report's pages,
       under that photograph, escaped;
     · a general (machine) photograph prints its caption under the category;
     · a photograph with no caption prints nothing extra.

   Run: node tests/pxcaption.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const PORT = Number(process.argv[2] || 8093);
let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };
const CAP = "TK126 - All good <ok>";

async function page(b, path) {
  console.log("\n══ " + path);
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/${path}`, { waitUntil: "load" });
  await p.waitForTimeout(1800);
  await p.evaluate(BUNDLED + "()");
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    CMDrive.saveEdit = d => Promise.resolve({ ok: true });
    CMDrive.hasName = () => true;
    try { localStorage.setItem("cm_dash_who", "R. Marrero"); } catch (e) {}
  });
  const target = await p.evaluate(() => {
    for (const r of RECS) for (const i of (r.items || [])) {
      const m = mediaOf(i, r);
      if (m.length && m[0].kind !== "video") { showTab("equipment"); openPos(recKey(r), i.key);
        return { rk: recKey(r), ik: i.key, name: m[0].name, n: m.length }; }
    }
    return null;
  });
  if (!ok(!!target, "the fixture has a photograph")) { await p.close(); return; }
  await p.waitForTimeout(500);
  const render = () => p.evaluate(({ rk }) => {
    const recs = CMReport.recsForScope("one", rk);
    return CMR.sections({ lang, mode: "unit", title: "t", titleAlt: "t", sub: "s", subAlt: "s", stamp: new Date(),
      records: CMReport.normalise(recs, { photos: true }), sevLabel: s => s, sevLabelAlt: s => s, extra: [] })
      .map(s => s.html).join("");
  }, target);
  const before = await render();
  ok(before.indexOf('class="pcap') < 0, "with no caption, no caption line is printed");

  await p.evaluate(() => document.querySelector("#drwBody [data-i]").click());
  await p.waitForTimeout(500);
  await p.click("#pxOpen"); await p.waitForTimeout(300);
  await p.fill("#pxCap", CAP);
  await p.click("#pxSave"); await p.waitForTimeout(1200);
  await p.evaluate(() => { try { lbClose(); } catch (e) {} });
  await p.waitForTimeout(300);
  const m = await p.evaluate(({ rk, ik, name }) => { const rec = RECS.find(r => ekOf(r) === rk);
    const it = rec.items.find(i => i.key === ik); const x = mediaOf(it, rec).find(y => y.name === name);
    return x ? x.caption : null; }, target);
  ok(m === CAP, "mediaOf carries the caption", JSON.stringify(m));
  const html = await render();
  ok(html.indexOf("TK126 - All good &lt;ok&gt;") >= 0, "the report prints the caption, escaped");
  ok(html.indexOf(CAP) < 0, "and never the raw markup");

  console.log("── a general photograph prints its caption under the category");
  const gen = await p.evaluate(() => {
    const px = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const rec = { equip: "TK126", date: "2026-11-05", type: "INSP", by: "x", items: [],
      general: [{ u: px, cat: "overview", cap: "TK126 - All good" }, { u: px + "#2", cat: "overview" }] };
    return CMR.sections({ lang: "en", bi: false, mode: "unit", title: "t", titleAlt: "", sub: "s", subAlt: "",
      stamp: new Date(), records: [rec], sevLabel: s => s, sevLabelAlt: s => s, extra: [] }).map(s => s.html).join("");
  });
  const fig = (gen.match(/<figcaption>[\s\S]*?<\/figcaption>/g) || []);
  ok(fig.some(f => /pcap">TK126 - All good</.test(f)), "the overview tile carries the caption", fig.length + " captions");
  ok(fig.filter(f => /pcap/.test(f)).length === 1, "and only the photograph that has one");
  console.log("── the fleet summary, its appendix, and a folded magnetic plug keep it too");
  const more = await p.evaluate(() => {
    const mk = c => { const cv = document.createElement("canvas"); cv.width = 40; cv.height = 30;
      const g = cv.getContext("2d"); g.fillStyle = c; g.fillRect(0, 0, 40, 30); return cv.toDataURL(); };
    const a = mk("#a33"), b2 = mk("#3a3"), c = mk("#33a"), d = mk("#aa3");
    const run = (recs, mode) => CMR.sections({ lang: "en", bi: false, mode, title: "t", titleAlt: "", sub: "s", subAlt: "",
      stamp: new Date(), records: recs, sevLabel: s => s, sevLabelAlt: s => s, extra: [] }).map(s => s.html).join("");
    const fleet = run([
      { equip: "TK126", date: "2026-11-05", type: "INSP", by: "x", items: [{ key: "HS.MP", name: "Hydraulic pump", grade: 4,
        defect: "Leak", photos: [a], photoCaps: { [a]: "Fleet caption A" } }] },
      { equip: "TK127", date: "2026-11-05", type: "INSP", by: "x", items: [{ key: "HS.MP", name: "Hydraulic pump", grade: 5,
        defect: "Leak", photos: [b2], photoCaps: { [b2]: "Fleet caption B" } }] }], "fleet");
    const mp = run([{ equip: "TK128", date: "2026-11-05", type: "MP", by: "x", items: [
      { key: "4C", name: "4C", grade: 2, photos: [c], photoCaps: { [c]: "Old angle caption" } },
      { key: "4E", name: "4E", grade: 3, photos: [d], photoCaps: { [d]: "New angle caption" } }] }], "unit");
    return { fa: (fleet.match(/Fleet caption A/g) || []).length, fb: (fleet.match(/Fleet caption B/g) || []).length,
             mo: mp.indexOf("Old angle caption") >= 0, mn: mp.indexOf("New angle caption") >= 0 };
  });
  ok(more.fa >= 1 && more.fb >= 1, "the fleet report prints both captions", JSON.stringify(more));
  ok(more.mo && more.mn, "a retired 4C angle folded into 4E keeps both captions");
  ok(errs.length === 0, "no page errors", errs.join(" | ") || "none");
  await p.close();
}

(async () => {
  const b = await chromium.launch();
  await page(b, "dashboard/index.html");
  await page(b, "dashboard-next/index.html");
  console.log(fail ? `\nFAILED ${fail}` : "\nall passed");
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
