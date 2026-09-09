/* THE MACHINE'S OWN PHOTOGRAPHS, REPORTED AS NEVER HAVING ARRIVED.

   Data & Sync on the live folder, 9 September: "8 of 377 attachments have not
   arrived", seven rounds listed, and every single one of them missing exactly
   the point MACHINE. The folder held all eight files.

   The phone keeps the overview, the sides, the tray, the GET assembly and the
   plate on one pseudo-position and writes each file under the CATEGORY it was
   taken as — EX001_OVERVIEW_08.09.2026_FC_1.jpg. The office keys that position
   MACHINE so nothing counts it as a point, then predicted the file name from
   the key: EX001_MACHINE_08.09.2026_FC, which the phone writes only for a
   photograph with no category at all. So the files were never matched, never
   requested by drive.js, never displayed — and counted as missing.

   The manifest exists precisely so nobody has to predict. It was no help: the
   phone serialised the sidecar BEFORE filesForRecord() worked the names out,
   so every att entry in the folder carries storedName:"". Two independent
   defects, one visible symptom, and both of them this project's signature —
   a real file rendered as nothing.

   Run: node tests/machphoto.cjs      (needs tests/ed-srv.cjs on 8093
                                        and tests/mock.cjs on 8098) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const DASH = `http://127.0.0.1:${Number(process.argv[2] || 8093)}/dashboard/index.html`;
const PHONE = "http://127.0.0.1:8098/mobile/index.html";
const fails = [];
const ok = (c, n, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : ""));
                          if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();

  console.log("\n1. THE OFFICE LOOKS UNDER THE NAMES THE PHONE ACTUALLY WRITES");
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(DASH, { waitUntil: "load" });
  await p.waitForTimeout(1800);
  await p.evaluate(BUNDLED + "()");
  await p.waitForTimeout(600);

  /* The live folder's own shape, reproduced exactly: two machine photographs,
     categories on the manifest, storedName empty because that is what every
     record in the folder carries. */
  const T = await p.evaluate(() => {
    const rec = RECS.find(r => (r.items || []).length);
    rec.items.forEach(x => { ["photos","photo","video","attachments","media"].forEach(f => delete x[f]); x.att = []; });
    const gen = { key: "MACHINE", general: 1, label: "Machine", photos: 2,
                  att: [{ attachmentId: "a1", seq: 1, category: "OVERVIEW", mediaType: "photo",
                          storedName: "", serverObjectId: "" },
                        { attachmentId: "a2", seq: 2, category: "PLATE", mediaType: "photo",
                          storedName: "", serverObjectId: "" }] };
    rec.items.push(gen);
    rec.src = "folder";
    const d = (rec.date || "").split("-").reverse().join(".");
    const names = [`${rec.equip}_OVERVIEW_${d}_${rec.type}_1.jpg`,
                   `${rec.equip}_PLATE_${d}_${rec.type}_2.jpg`];
    window.__folder = new Set(names);
    CMDrive.hasName = n => window.__folder.has(n);
    CMDrive.names = () => [...window.__folder];
    CMDrive.configured = () => true;
    CMDrive.saveEdit = () => Promise.resolve({ ok: true });
    assignEpoch++; rebuild();
    return { rk: ekOf(rec), equip: rec.equip, date: rec.date, type: rec.type, names,
             bases: photoBases(gen, rec) };
  });
  ok(T.bases.indexOf(T.equip + "_OVERVIEW_" + T.date.split("-").reverse().join(".") + "_" + T.type) >= 0,
     "the candidate names include the category the photograph was taken as",
     T.bases.slice(0, 4).join(" | "));
  ok(/_MACHINE_/.test(T.bases[0]),
     "  and the uncategorised form still leads, so a desk upload is named where everything looks",
     T.bases[0]);

  const gap = () => p.evaluate(rk => { const r = RECS.find(x => ekOf(x) === rk); return evidenceGap(r); }, T.rk);
  let g = await gap();
  ok(g.expected === 2 && g.received === 2 && g.missing === 0,
     "both machine photographs are found in the folder", JSON.stringify(g));

  const listed = await p.evaluate(({ equip, date }) => {
    showTab("sync", true); renderSync();
    return [...document.querySelectorAll("#syGapTbl tbody tr")]
      .map(tr => tr.innerText.replace(/\s+/g, " "))
      .filter(x => x.indexOf(equip) >= 0 && x.indexOf(date) >= 0);
  }, T);
  ok(listed.length === 0, "  and Data & Sync does not list the round as waiting",
     listed.join(" | ") || "not listed");

  const shown = await p.evaluate(rk => {
    const r = RECS.find(x => ekOf(x) === rk), it = r.items.find(i => i.general);
    return serverMediaOf(it, r).map(m => m.name);
  }, T.rk);
  ok(shown.length === 2, "  the screens can show them", shown.join(" | "));

  /* drive.js asks for what photoBases offers; if it only ever saw the first
     name these files would never be fetched, so the page could not display
     them even though the audit had found them. */
  const asked = await p.evaluate(rk => {
    const r = RECS.find(x => ekOf(x) === rk), it = r.items.find(i => i.general);
    const out = [];
    (window.CMDash.photoBases ? window.CMDash.photoBases(it, r) : [window.CMDash.photoBase(it, r)])
      .forEach(bs => window.CMDash.photoNames(bs, r).forEach(n => out.push(n)));
    return out;
  }, T.rk);
  ok(T.names.every(n => asked.indexOf(n) >= 0),
     "  and the fetcher's candidate list contains both files",
     T.names.filter(n => asked.indexOf(n) < 0).join(" | ") || "both");

  console.log("\n2. A FILE THAT REALLY IS ABSENT STILL READS MISSING");
  await p.evaluate(n => { window.__folder.delete(n); assignEpoch++; rebuild(); }, T.names[1]);
  g = await gap();
  ok(g.expected === 2 && g.received === 1 && g.missing === 1,
     "one gone, one missing — no false reassurance", JSON.stringify(g));
  const named = await p.evaluate(rk => {
    const r = RECS.find(x => ekOf(x) === rk), it = r.items.find(i => i.general);
    return expectedNames(it, r, 2);
  }, T.rk);
  ok(named.some(n => /_PLATE_/.test(n)),
     "  and the shortfall is named as a file somebody could search the folder for",
     named.join(" | "));
  ok(!named.some(n => /_MACHINE_/.test(n)),
     "  not under a name the phone never wrote", named.join(" | "));
  ok(errs.length === 0, "no page errors on the office", errs.slice(0, 3).join(" | ") || "none");
  await p.close();

  console.log("\n3. AND THE SIDECAR SAYS WHAT EACH FILE IS CALLED");
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(u => {
    localStorage.setItem("up_dests", JSON.stringify([{ id: "gas", on: true, url: u, sec: "", folder: "" }]));
    localStorage.setItem("cm_swap_off", "1"); localStorage.setItem("lang", "en");
  }, "http://127.0.0.1:8098/exec");
  const ph = await ctx.newPage();
  const perr = []; ph.on("pageerror", e => perr.push(e.message));
  await ph.goto(PHONE, { waitUntil: "load" });
  await ph.waitForTimeout(2500);

  /* The real send path, not a hand-ordered reconstruction: the suite watches
     what leaves the phone, at the wire. The whole defect was an ORDER of two
     calls inside syncNow, so calling them in the right order here would prove
     nothing — and a stub on window.fetch proves nothing either, because the
     upload does not go through it. */
  /* The endpoint takes a batch or one file per request depending on what it
     said it could do, so both shapes are read here rather than assuming one. */
  const wire = [];
  ph.on("request", r => {
    if (r.method() !== "POST") return;
    let j = null; try { j = JSON.parse(r.postData() || ""); } catch (e) {}
    if (!j) return;
    if (Array.isArray(j.files)) j.files.forEach(f => wire.push({ name: f.name, data: f.data }));
    else if (j.name && j.file) wire.push({ name: j.name, data: j.file });
  });
  const sent = await ph.evaluate(async () => {
    const px = new Blob([new Uint8Array([255, 216, 255, 219, 0, 1, 2, 3, 4, 5])], { type: "image/jpeg" });
    const rec = { id: "test__EX001__2026-09-08__FC", rev: 1, equip: "EX001", date: "2026-09-08",
                  type: "FC", cls: "EXC", by: "S. Volkov", created: "2026-09-08T04:00:00Z",
                  positions: { "__general": { photos: [] } } };
    const p2 = rec.positions.__general;
    p2.photos.push(attWrap(px)); p2.photos.push(attWrap(px));
    await attSync(rec);
    /* A category on each, as the capture screen sets them. */
    const m = attMap(p2), ids = Object.keys(m);
    m[ids[0]].category = "OVERVIEW"; m[ids[1]].category = "PLATE";
    await dbPut(rec);

    try { await syncNow(true); } catch (e) {}
    return { queued: (await dbAll()).filter(r => !r.up).length };
  });
  await ph.waitForTimeout(400);

  const order = wire.map(f => f.name);
  ok(sent.queued === 0 && order.length >= 3,
     "the round went up — a sidecar and two photographs", order.join(" | "));
  ok(/\.json$/i.test(order[0] || ""), "  the sidecar still goes FIRST", order[0]);
  const side = (() => {
    const j = wire.find(f => /\.json$/i.test(f.name || ""));
    try { return JSON.parse(Buffer.from(j.data, "base64").toString("utf8")); } catch (e) { return null; }
  })();
  const gi = side && (side.records[0].items || []).find(i => i.general || i.key === "__general");
  ok(!!gi, "  and it carries the machine position", gi ? gi.key : "no general item");
  const st = ((gi && gi.att) || []).map(e => e.storedName);
  ok(st.length === 2 && st.every(Boolean),
     "  with the name each photograph was actually sent under", JSON.stringify(st));
  ok(st.every(n => order.indexOf(n) >= 0),
     "  and those are the names on the wire, not a second guess at them",
     JSON.stringify(st) + " of " + order.join(" | "));
  ok(st.some(n => /_OVERVIEW_/.test(n)) && st.some(n => /_PLATE_/.test(n)),
     "  filed by category, which is why the office could not guess them",
     JSON.stringify(st));
  ok(perr.length === 0, "no page errors on the phone", perr.slice(0, 3).join(" | ") || "none");

  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
