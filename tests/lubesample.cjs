/* THE PHONE FOLLOWS THE OFFICE'S LUBE MASTER, AND NUMBERS ITS OIL SAMPLES.

   Two promises from 2026-10-04 (the dashboard is the master of the
   lubrication programme; the codes are the matrix's):

     1. A phone applies the office's decisions. The TR60 hydraulic is 5W30 in
        the matrix and HVLP 32 in 25 of 31 samples; until somebody decides, an
        HVLP 32 recorded there is "under decision". Once the office decides
        VG32 on the dashboard, the phone that pulls says it conforms — and goes
        on saying so offline, from its last copy.
     2. Ticking "Oil sample taken" fills in the bottle's number in the site's
        own form, DDMMYYYY-UNIT-CODE, with the code the matrix calls official,
        and that number survives the save, the wire, a reopen and the report.

   Run: node tests/lubesample.cjs   (spawns tests/ya-srv.cjs on 8196) */
const { chromium } = require(require("./pw.cjs"));
const { spawn } = require("child_process");
const path = require("path");
const PORT = 8196, B = `http://127.0.0.1:${PORT}`, EXEC = B + "/exec";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(__dirname, "ya-srv.cjs"), String(PORT), "NONE"], { stdio: "ignore" });
process.on("exit", () => { try { srv.kill(); } catch (e) {} });

const putDoc = (key, obj) => fetch(B + "/__put?key=" + encodeURIComponent(key) + "&type=application/json",
  { method: "POST", body: JSON.stringify(obj) });

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(EXEC); break; } catch (e) { await wait(250); } }
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(u => {
    if (sessionStorage.getItem("b")) return; sessionStorage.setItem("b", "1");
    localStorage.setItem("up_dests", JSON.stringify([{ id: "gas", on: true, url: u, sec: "", folder: "" }]));
  }, EXEC);
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(B + "/mobile/index.html", { waitUntil: "load" });
  await p.waitForFunction(() => window.LUBE && typeof lubeMasterPull === "function", null, { timeout: 20000 });

  console.log("\n1. BEFORE THE OFFICE DECIDES: UNDER DECISION, NOT A FINDING");
  const v0 = await p.evaluate(async () => { await lubeMasterPull(true);
    return LUBE.verdict("NHL TR60", "HT", "3", "NEXXOL HYDRAULIC SYNTH HVLP 32").k; });
  ok("no master on the server: HVLP 32 in the TR60 hydraulics is 'under decision'", v0 === "lube_v_pending", v0);

  console.log("\n2. THE OFFICE DECIDES; THE PHONE PULLS AND FOLLOWS");
  await putDoc("_meta/lube/master.json", { type: "cm-lube-master", version: 1, rev: 1, at: "2026-10-04T10:00:00.000Z", by: "R. Marrero",
    comps: {}, grades: { "75W90": { primary: "TEBOIL HYPOID 75W90" } },
    decide: { "NHL TR60|3": { g: "VG32", by: "R. Marrero", at: "2026-10-04T10:00:00.000Z" } }, alias: {}, hist: [] });
  const v1 = await p.evaluate(async () => { const d = await lubeMasterPull(true);
    return { rev: d && d.rev, v: LUBE.verdict("NHL TR60", "HT", "3", "NEXXOL HYDRAULIC SYNTH HVLP 32").k,
             fd: (LUBE.forComp("NHL TR60", "4BL", "HT") || {}).p, kept: !!localStorage.getItem("cm_lube_master") }; });
  ok("the phone read revision 1", v1.rev === 1, JSON.stringify(v1));
  ok("HVLP 32 there now conforms", v1.v === "lube_v_ok", v1.v);
  ok("the office's new 75W90 primary is what the fitter is told for the final drive", v1.fd === "TEBOIL HYPOID 75W90", v1.fd);
  ok("and the phone keeps a copy for the pit", v1.kept);
  await p.reload({ waitUntil: "load" });
  await p.waitForFunction(() => window.LUBE && typeof lubeMasterPull === "function", null, { timeout: 20000 });
  const v2 = await p.evaluate(() => LUBE.verdict("NHL TR60", "HT", "3", "NEXXOL HYDRAULIC SYNTH HVLP 32").k);
  ok("after a restart, before any pull, the decision still holds (the kept copy)", v2 === "lube_v_ok", v2);

  console.log("\n3. THE SAMPLE NUMBER");
  const r = await p.evaluate(async () => {
    const unit = (window.ASSETS || []).find(a => /TR60/.test(a.m || "") && (lubeComps(a.n) || []).some(c => c.k === "3"));
    type = "LUBE"; curEquip = unit.n; eqClass = unit.cls || "";
    document.getElementById("date").value = "2026-05-06";
    document.getElementById("inspector").value = "R. Marrero";
    document.getElementById("smu").value = "12000";
    draft = { positions: {} };
    curItem = "3";
    renderLube();
    const wrapHiddenBefore = document.getElementById("lubeSnoWrap").classList.contains("hidden");
    document.getElementById("lubeSamp").checked = true;
    document.getElementById("lubeSamp").dispatchEvent(new Event("change"));
    const shown = !document.getElementById("lubeSnoWrap").classList.contains("hidden");
    const filled = document.getElementById("lubeSno").value;
    const pos = Object.assign({}, draft.positions["3"]);
    /* save the round */
    { const bytes = new Uint8Array([0xff,0xd8,0xff,0xdb,1,2,3,4,5,6,7,8,9,0xff,0xd9]); const g = (draft.positions[GEN_KEY] ||= {});
      for (const s of machineSlots(type)) if (s.req && !genPhotos(draft, s.cat).length) addPos(g, attWrap(new File([bytes], s.cat + ".jpg", { type: "image/jpeg" })), s.cat); }
    draft.positions["3"].prod = "NEXXOL HYDRAULIC SYNTH HVLP 32"; draft.positions["3"].evid = "label";
    const real = window.saveCur; window.saveCur = () => {};
    document.getElementById("saveBtn").click();
    await new Promise(r2 => setTimeout(r2, 900));
    window.saveCur = real;
    const rec = (await dbAll()).find(x => x.type === "LUBE");
    const wire = rec ? (recToExport(rec).items || []).find(i => i.key === "3") || {} : {};
    let back = {}; if (rec) { editRecord(rec); back = Object.assign({}, draft.positions["3"] || {}); }
    const blk = lubeReportBlock(unit.m, unit.cls, "3", { product: "X", samp: 1, sno: wire.lubeSampleNo });
    /* untick: no sample, no number */
    curItem = "3"; renderLube();
    document.getElementById("lubeSamp").checked = false;
    document.getElementById("lubeSamp").dispatchEvent(new Event("change"));
    const gone = draft.positions["3"] ? draft.positions["3"].sno : undefined;
    return { unit: unit.n, wrapHiddenBefore, shown, filled, pos, saved: rec ? rec.positions["3"].sno : null,
             wire: wire.lubeSampleNo, back: back, blk: blk && blk.sno, gone };
  });
  ok("the number box is hidden until a sample is ticked", r.wrapHiddenBefore && r.shown);
  ok("ticking fills it in the site's own form: 06052026-" + r.unit + "-3", r.filled === "06052026-" + r.unit + "-3", r.filled);
  ok("it is on the position", r.pos.sno === r.filled, JSON.stringify(r.pos));
  ok("it survives the save", r.saved === r.filled, r.saved);
  ok("it reaches the wire as lubeSampleNo", r.wire === r.filled, r.wire);
  ok("reopening the round shows it back", r.back.sno === r.filled, r.back.sno);
  ok("the report block carries it", r.blk === r.filled, r.blk);
  ok("unticking the sample takes the number away", !r.gone, String(r.gone));
  const alias = await p.evaluate(() => [LUBE.sampleCode("CAT D9R", "DOZ", "4E"), LUBE.sampleCode("NHL TR60", "HT", "6C")]);
  ok("an older form's code resolves onto the matrix code only where the machine has it", alias[0] === "4BL" && alias[1] === null, JSON.stringify(alias));

  console.log("\n4. RUSSIAN, AND NO ERRORS");
  const ru = await p.evaluate(() => { lang = "ru"; if (typeof applyLang === "function") applyLang();
    return (document.querySelector('#lubeSnoWrap [data-i18n="lube_sno"]') || {}).textContent; });
  ok("the box is named in Russian", ru === "Номер пробы", ru);
  ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length : "\nall passed");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
