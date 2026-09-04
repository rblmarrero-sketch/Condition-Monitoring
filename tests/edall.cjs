/* THE CORRECTION PANEL CAN CORRECT EVERYTHING THE PHONE RECORDED.

   Reported from the office on build 251: the machine's own photographs
   (overview and the rest) were nowhere in the panel; the location could not
   be corrected; and a finding filed under the wrong component could not be
   moved. "We need to edit everything."

   Also found on the way: a round captured since build 243 carries the
   machine photographs on a pseudo-point, and the panel listed that pseudo-
   point as a component with a grade control.

   What has to be true:
     · the machine's photographs are on their own card, with their categories,
       and open in the lightbox; the pseudo-point is not offered as a component;
     · latitude and longitude are round fields: typed, they become the record's
       location; cleared, they remove it; one alone changes nothing;
     · a finding can be filed under another point: the marker names the new
       key and label, its photographs are filed there by name, the record then
       reads the finding under the new key with its photographs, the empty
       position it landed on is gone, and the panel reopens on it with the
       control set to the new point and the marker still filed under the old;
     · a point that already carries a finding is offered but not selectable.

   Run: node tests/edall.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

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
    /* The folder, stood in for: every field photograph is safely there; a
       machine photograph is there once the office has uploaded it. */
    window.__put = [];
    CMDrive.hasName = n => window.__put.includes(n) || !/_(OVERVIEW|LEFT|RIGHT|BODY|GET|PLATE|EXTRA)_/.test(n);
    /* The folder, stood in for: what the office uploads is indexed and cached
       the way drive.js does it, so the panel can find what it just added. */
    CMDrive.putMedia = async (name, file) => { const url = URL.createObjectURL(file); window.__put.push(name); CMDash.addPhoto(name, url); return { name, url, id: "up" + window.__put.length }; };
    try { localStorage.setItem("cm_dash_who", "R. Marrero"); } catch (e) {}
  });
  const lastDoc = () => p.evaluate(() => window.__w[window.__w.length - 1] || null);
  const save = async () => { await p.click("#edSave"); await p.waitForTimeout(900); };

  console.log("── the machine's photographs, on their own card");
  const target = await p.evaluate(() => {
    let rec = null, it = null;
    for (const r of RECS) { for (const i of (r.items || [])) { if (mediaOf(i, r).some(m => m.kind !== "video")) { rec = r; it = i; break; } } if (rec) break; }
    if (!rec) return null;
    /* A machine photograph the way a phone since build 243 carries it: on the
       pseudo-point, with the file's category on its manifest. The bundled
       picture stands in for the file. */
    const src = mediaOf(it, rec)[0];
    /* A position the inspector walked past: nothing on it. The fixture's
       plug rounds carry a finding on every reference point, so one is made
       empty to be moved onto — which is also the position the move absorbs. */
    const other = rec.items.filter(x => !x.general && x !== it).pop();
    if (other) { other.grade = ""; other.sev = ""; other.photo = ""; other.photos = 0; other.defect = ""; other.comment = ""; other.action = ""; other.cause = ""; }
    rec.items.push({ key: "MACHINE", general: 1, photo: src.orig || src.src,
                     att: [{ storedName: (src.orig || src.src).split("/").pop(), category: "OVERVIEW" }] });
    openEdit(ekOf(rec));
    return { rk: ekOf(rec), ik: it.key, photos: mediaOf(it, rec).length, names: mediaOf(it, rec).map(m => m.name) };
  });
  if (!target) { console.log("  SKIP  the fixture has no photograph"); await b.close(); process.exit(0); }
  await p.waitForTimeout(700);
  const mc = await p.evaluate(() => ({
    shots: document.querySelectorAll("#edMachine [data-mshot]").length,
    caption: (document.querySelector("#edMachine figcaption") || {}).textContent || "",
    machineCard: !!document.querySelector('#edItems [data-f="grade"][data-k="MACHINE"]'),
    cards: document.querySelectorAll("#edItems .srccard").length }));
  ok(mc.shots === 1, "the overview photograph is on the machine card", mc.shots + " shot(s)");
  ok(/overview/i.test(mc.caption), "labelled by what it is of", mc.caption);
  ok(!mc.machineCard, "and the pseudo-point is NOT offered as a component", mc.cards + " component cards");
  await p.evaluate(() => document.querySelector("#edMachine [data-mshot]").click());
  await p.waitForTimeout(500);
  const lb = await p.evaluate(() => ({ open: document.getElementById("lb").classList.contains("open"), rk: lbCtx && lbCtx.rk, name: lbCtx && lbCtx.name }));
  ok(lb.open && lb.rk === target.rk && !!lb.name, "it opens in the lightbox with the record and file named", JSON.stringify(lb));
  await p.evaluate(() => lbClose());

  console.log("\n── the location is a round field");
  const g0 = await p.evaluate(() => ({ lat: $("edLat").value, lon: $("edLon").value, hint: $("edGpsHint").textContent }));
  ok(g0.lat === "" && g0.lon === "", "no location on this round to begin with, and it says so", g0.hint.slice(0, 60));
  await p.fill("#edLat", "66.6009"); await p.fill("#edLon", "164.4749");
  await save();
  let doc = await lastDoc();
  ok(doc && doc.fields && doc.fields.lat === "66.6009" && doc.fields.lon === "164.4749", "typed, both halves go to the marker", JSON.stringify(doc && doc.fields));
  let gps = await p.evaluate(({ rk }) => { const r = RECS.find(x => ekOf(x) === rk); return r.gps ? { lat: r.gps.lat, lon: r.gps.lon, office: r.gps.office } : null; }, target);
  ok(gps && Math.abs(gps.lat - 66.6009) < 1e-9 && Math.abs(gps.lon - 164.4749) < 1e-9 && gps.office === 1, "and the record now carries the location, marked as the office's", JSON.stringify(gps));
  const g1 = await p.evaluate(() => ({ lat: $("edLat").value, lon: $("edLon").value, link: !!$("edGpsHint").querySelector("a") }));
  ok(g1.lat === "66.6009" && g1.lon === "164.4749" && g1.link, "the panel reopens with it filled and a link to the map");
  const wrote = await p.evaluate(() => window.__w.length);
  await p.fill("#edLat", ""); await save();
  const half = await p.evaluate(({ rk, wrote }) => { const r = RECS.find(x => ekOf(x) === rk);
    return { gps: r.gps ? { lat: r.gps.lat, lon: r.gps.lon } : null, msg: $("edMsg").textContent, wrote: window.__w.length - wrote }; }, Object.assign({ wrote }, target));
  ok(half.gps && Math.abs(half.gps.lat - 66.6009) < 1e-9 && half.wrote === 0 && half.msg.indexOf(await p.evaluate(() => t("ed_gps_half"))) >= 0,
     "one half cleared alone is refused, out loud, and nothing is written", JSON.stringify(half));
  await p.fill("#edLat", ""); await p.fill("#edLon", ""); await save();
  gps = await p.evaluate(({ rk }) => { const r = RECS.find(x => ekOf(x) === rk); return r.gps || null; }, target);
  ok(gps === null, "both cleared remove the location", JSON.stringify(gps));

  console.log("\n── a finding is filed under another point");
  const sel = await p.evaluate(({ ik }) => {
    const s = document.querySelector('#edItems [data-f="key"][data-k="' + CSS.escape(ik) + '"]');
    if (!s) return null;
    const opts = [...s.options].map(o => ({ k: o.value, l: o.dataset.l, disabled: o.disabled, selected: o.selected }));
    return { init: s.dataset.init, value: s.value, opts };
  }, target);
  ok(sel && sel.value === target.ik && sel.init === target.ik, "the component control shows the point the finding is under", sel && sel.value);
  ok(sel && sel.opts.some(o => o.disabled), "a point that already carries a finding is offered but not selectable", sel && sel.opts.filter(o => o.disabled).map(o => o.k).slice(0, 3).join(","));
  ok(sel && !sel.opts.some(o => o.k === "MACHINE"), "and the machine's pseudo-point is never offered as a component");
  const free = sel.opts.find(o => !o.disabled && o.k !== target.ik);
  ok(!!free, "and there is a free point to move to", free && free.k);
  const before = await p.evaluate(({ rk }) => RECS.find(x => ekOf(x) === rk).items.filter(i => !i.general).length, target);
  await p.selectOption('#edItems [data-f="key"][data-k="' + target.ik + '"]', free.k);
  await save();
  doc = await lastDoc();
  const it = doc && doc.items && doc.items[target.ik];
  ok(it && it.key === free.k && it.label === free.l, "the marker, filed under the old key, names the new key and its label", JSON.stringify(it));
  const asg = doc && doc.assign || {};
  ok(target.names.every(n => asg[n] && asg[n].point === free.k && asg[n].found === 1), "every photograph of the finding is filed under the new point by name", target.names.map(n => n + "→" + (asg[n] && asg[n].point)).join(" "));
  const after = await p.evaluate(({ rk, ik, nk }) => { const r = RECS.find(x => ekOf(x) === rk);
    const moved = r.items.find(i => i.key === nk); const old = r.items.find(i => i.key === ik);
    return { has: !!moved, from: moved && moved._from, label: moved && moved.label, photos: moved ? mediaOf(moved, r).length : -1, oldLeft: !!old,
      count: r.items.filter(i => !i.general).length, dupes: r.items.filter(i => i.key === nk).length }; }, Object.assign({ nk: free.k }, target));
  ok(after.has && after.from === target.ik && after.label === free.l, "the record reads the finding under the new key, remembering where it came from", JSON.stringify({ from: after.from, label: after.label }));
  ok(after.photos === target.photos, "with all its photographs", after.photos + " of " + target.photos);
  ok(!after.oldLeft && after.dupes === 1, "the old key is gone and the new key is held once", JSON.stringify({ oldLeft: after.oldLeft, dupes: after.dupes }));
  ok(after.count <= before, "an empty position it landed on was absorbed, not doubled", before + " → " + after.count);
  const re = await p.evaluate(({ ik, nk }) => { const s = document.querySelector('#edItems [data-f="key"][data-k="' + CSS.escape(ik) + '"]');
    const head = s && s.closest(".srccard").querySelector(".srchead b"); return { ctrl: s && s.value, head: head && head.textContent.trim() }; }, Object.assign({ nk: free.k }, target));
  ok(re.ctrl === free.k && re.head === free.k, "the panel reopens on it: control on the new point, marker still under the old key", JSON.stringify(re));
  await p.selectOption('#edItems [data-f="key"][data-k="' + target.ik + '"]', target.ik);
  await save();
  const back = await p.evaluate(({ rk, ik }) => { const r = RECS.find(x => ekOf(x) === rk); const i = r.items.find(x => x.key === ik); return { has: !!i, from: i && i._from, photos: i ? mediaOf(i, r).length : -1 }; }, target);
  ok(back.has && !back.from && back.photos === target.photos, "and it can be moved back", JSON.stringify(back));

  console.log("\n── a machine photograph added from the office");
  const mcount = () => p.evaluate(() => document.querySelectorAll("#edMachine [data-mshot]").length);
  const m0 = await mcount();
  const jpgB64 = await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d"); x.fillStyle = "#4b6a3b"; x.fillRect(0, 0, 640, 480); return c.toDataURL("image/jpeg", 0.8).split(",")[1]; });
  ok(!!(await p.$("#edMadd input")) && !!(await p.$("#edMcat")), "the machine card offers to add a photograph, with what it is of");
  await p.selectOption("#edMcat", "LEFT");
  await p.setInputFiles("#edMadd input", { name: "left.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpgB64, "base64") });
  await p.waitForTimeout(1200);
  const put = await p.evaluate(({ rk }) => { const r = RECS.find(x => ekOf(x) === rk); const d = String(r.date).split("-");
    return { names: window.__put, want: `${r.equip}_LEFT_${d[2]}.${d[1]}.${d[0]}_${r.type}.jpg` }; }, target);
  ok(put.names.length === 1 && put.names[0] === put.want, "it is uploaded under the name the phone would have given it", put.names[0] + " (want " + put.want + ")");
  doc = await lastDoc();
  const filed = doc && doc.assign && doc.assign[put.names[0]];
  ok(filed && filed.general === 1 && filed.cat === "LEFT" && filed.found === 1, "and filed as the machine's, as Left side, by name", JSON.stringify(filed));
  ok((await mcount()) === m0 + 1, "the machine card shows it", (await mcount()) + " shot(s)");
  const cap = await p.evaluate(() => [...document.querySelectorAll("#edMachine figcaption")].map(f => f.textContent));
  ok(cap.some(c => /left/i.test(c)), "labelled Left side", cap.join(" | "));
  const gen = await p.evaluate(({ rk }) => { const r = RECS.find(x => ekOf(x) === rk); return CMReport.normalise([r], { photos: true })[0].general.map(g => typeof g === "object" ? g.cat : "?"); }, target);
  ok(gen.includes("LEFT"), "and the report is handed it with what it is of", gen.join(","));

  console.log("\n── a point's photograph filed as the machine's, and back");
  const pn = await p.evaluate(({ ik }) => { const s = document.querySelector('#edItems .edfacts[data-ik="' + CSS.escape(ik) + '"] .edtomach'); return s ? s.dataset.name : null; }, target);
  ok(!!pn, "each point photograph offers to be filed as the machine's", pn);
  await p.selectOption('#edItems .edfacts[data-ik="' + target.ik + '"] .edtomach', "OVERVIEW");
  await p.waitForTimeout(900);
  const moved = await p.evaluate(({ rk, ik, pn }) => { const r = RECS.find(x => ekOf(x) === rk); const it = r.items.find(i => i.key === ik);
    return { onPoint: mediaOf(it, r).some(m => m.name === pn), onMachine: generalMedia(r).some(m => m.name === pn && m.cat === "OVERVIEW"),
      shots: document.querySelectorAll("#edMachine [data-mshot]").length }; }, Object.assign({ pn }, target));
  ok(!moved.onPoint && moved.onMachine, "it leaves the point and appears as the machine's overview", JSON.stringify(moved));
  ok(moved.shots === m0 + 2, "the machine card counts it", moved.shots + " shot(s)");
  await p.selectOption('#edMachine .edtopt[data-name="' + pn + '"]', target.ik);
  await p.waitForTimeout(900);
  const back2 = await p.evaluate(({ rk, ik, pn }) => { const r = RECS.find(x => ekOf(x) === rk); const it = r.items.find(i => i.key === ik);
    return { onPoint: mediaOf(it, r).some(m => m.name === pn), onMachine: generalMedia(r).some(m => m.name === pn) }; }, Object.assign({ pn }, target));
  ok(back2.onPoint && !back2.onMachine, "and can be filed back under the point", JSON.stringify(back2));

  ok(errs.length === 0, "no page errors", errs.join(" | ") || "none");
  console.log(fail ? `\nFAILED ${fail}` : "\nall passed");
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
