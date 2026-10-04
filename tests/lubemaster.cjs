/* THE LUBE MASTER: kept on the server, edited from either office page.

   Decided 2026-10-04: the dashboard is the master of the lubrication
   programme and the workbook is an export that can be re-imported. These
   checks run both office pages against the REAL backend function
   (tests/ya-srv.cjs, docs/yandex/function.js over an in-memory bucket) and
   prove what the decision promises:

     1. a fresh folder shows the workbook baseline and says so
     2. a change needs a name, lands on the server, and survives a reload
     3. the change reaches the OTHER office page (dashboard-next) — the old
        "Machine reference" saved to one browser and reached nobody
     4. two desks saving different things at once keep both
     5. a decision on a "needs decision" compartment changes the grade, the
        product and the verdict everywhere
     6. approving a grade, choosing its products
     7. the Excel export opens as a real workbook with the grade colours, and
        an edited copy re-imports as exactly the changes made in it
     8. sample numbers in the site's own form, aliases resolving only onto a
        code the machine has
     9. Russian, and no page errors

   Run: node tests/lubemaster.cjs   (spawns tests/ya-srv.cjs) */
const { chromium } = require(require("./pw.cjs"));
const { spawn } = require("child_process");
const path = require("path"), fs = require("fs"), os = require("os");

const PORT = 8148, B = `http://127.0.0.1:${PORT}`, EXEC = B + "/exec";
const DOC = "_meta/lube/master.json";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };
const wait = ms => new Promise(r => setTimeout(r, ms));

const srv = spawn(process.execPath, [path.join(__dirname, "ya-srv.cjs"), String(PORT), "NONE"], { stdio: "ignore" });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on("exit", bye); process.on("SIGINT", () => { bye(); process.exit(1); });

const readDoc = async k => {
  const r = await (await fetch(EXEC + "?action=file&id=" + encodeURIComponent(k))).json();
  return r.ok ? JSON.parse(Buffer.from(r.data, "base64").toString("utf8")) : null;
};
const keys = async () => (await (await fetch(B + "/__keys")).json()).keys;

async function boot(b, file, opts) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  await ctx.addInitScript(([url, o]) => {
    if (!sessionStorage.getItem("booted")) {
      sessionStorage.setItem("booted", "1");
      localStorage.setItem("cm_drive_url", url);
      if (o && o.who) localStorage.setItem("cm_dash_who", o.who);
      if (o && o.lang) localStorage.setItem("cm_dash_lang", o.lang);
      if (o && o.legacy) localStorage.setItem("cm_lube_ref", JSON.stringify(o.legacy));
    }
  }, [EXEC, opts || {}]);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  p.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
  await p.goto(B + "/" + file + "#lube", { waitUntil: "load" });
  await p.waitForFunction(() => window.CMLube && window.LUBE && window.CMDrive && CMDrive.configured(), null, { timeout: 20000 });
  return { ctx, p, errs };
}
const open = async (d, sub) => {
  await d.p.evaluate(s => { if (typeof showTab === "function") showTab("lube"); lubeGo(s); }, sub);
  await d.p.waitForTimeout(150);
};
const state = d => d.p.evaluate(() => CMLube.state().state);
const until = async (d, fn, arg, ms) => d.p.waitForFunction(fn, arg, { timeout: ms || 15000 });
/* A save in panel k has been confirmed by the server: its message names a
   revision. Cleared by clearMsg() before the action, so an old message from
   the same panel cannot satisfy it. */
const clearMsg = (d, k) => d.p.evaluate(k => { CMLube._ui.msg[k] = ""; document.querySelectorAll('[data-lmx-msg="' + k + '"]').forEach(e => e.textContent = ""); }, k);
const savedIn = (d, k) => until(d, k => /revision \d+/.test((document.querySelector('[data-lmx-msg="' + k + '"]') || {}).textContent || ""), k);

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(EXEC); break; } catch (e) { await wait(250); } }
  const b = await chromium.launch();
  const A = await boot(b, "dashboard/index.html", { who: "R. Marrero" });

  console.log("\n1. A FRESH FOLDER: THE WORKBOOK BASELINE, SAID IN WORDS");
  await A.p.evaluate(() => lubeMasterLoad());
  await until(A, () => ["none", "ready"].includes(CMLube.state().state));
  const st0 = await state(A);
  ok("nothing on the server yet reads as 'none', not as a failure", st0 === "none", st0);
  await open(A, "master");
  const st = await A.p.textContent("#lmMaster .lmx-status");
  ok("the status line says this is the workbook baseline", /workbook baseline/i.test(st), st);
  const tabs = await A.p.$$eval("#lubeSub button", bs => bs.map(b => b.dataset.lsub));
  ok("the four lube-master tabs are on the Lubrication page", ["master", "decide", "oils", "sample"].every(k => tabs.includes(k)), tabs.join(","));
  ok("the one-browser 'Standards' and 'Machine reference' tabs are gone", !tabs.includes("std") && !tabs.includes("ref"));

  console.log("\n2. A CHANGE NEEDS A NAME, LANDS ON THE SERVER, SURVIVES A RELOAD");
  await A.p.evaluate(() => { CMLube._ui.model = "HT|NHL TR60"; CMLube.redraw(); });
  const capSel = '#lmMaster tr[data-lmxk="1"] input[data-f="cap"]';
  ok("the TR60 engine shows the workbook's 70 L", (await A.p.inputValue(capSel)) === "70");
  await A.p.evaluate(() => localStorage.removeItem("cm_dash_who"));
  await A.p.fill("#lmxWhoM", "");
  await A.p.fill(capSel, "72");
  await A.p.click("#lmxSaveM");
  await until(A, () => /name/i.test((document.querySelector('[data-lmx-msg="model"]') || {}).textContent || ""));
  ok("without a name nothing is saved", (await readDoc(DOC)) === null);
  await A.p.fill("#lmxWhoM", "R. Marrero"); await A.p.dispatchEvent("#lmxWhoM", "change");
  await A.p.fill(capSel, "72");
  await A.p.click("#lmxSaveM");
  await savedIn(A, "model");
  let doc = await readDoc(DOC);
  ok("the server holds the edit", doc && doc.comps && doc.comps["HT|NHL TR60"] && doc.comps["HT|NHL TR60"]["1"].cap === 72, JSON.stringify(doc && doc.comps));
  ok("with a revision, a time and the name", doc && doc.rev === 1 && doc.by === "R. Marrero" && !!doc.at);
  ok("and a history line", doc && doc.hist && doc.hist[0] && doc.hist[0].rev === 1 && doc.hist[0].n === 1);
  const logs = (await keys()).filter(k => k.indexOf("_meta/lube/log/") === 0);
  ok("a detail record is written under _meta/lube/log/", logs.length === 1, logs.join(","));
  const det = logs[0] && await readDoc(logs[0]);
  ok("naming the field, what it was and what it is", det && det.changes && det.changes[0].from === 70 && det.changes[0].to === 72, JSON.stringify(det && det.changes));
  ok("LUBE itself now answers 72", await A.p.evaluate(() => LUBE.comp("NHL TR60", "1", "HT").cap) === 72);
  await A.p.reload({ waitUntil: "load" });
  await until(A, () => window.CMLube && CMLube.state().state === "ready");
  ok("after a reload the page reads it back from the server", await A.p.evaluate(() => LUBE.comp("NHL TR60", "1", "HT").cap) === 72);

  console.log("\n3. THE OTHER OFFICE PAGE SEES IT");
  const N = await boot(b, "dashboard-next/index.html", { who: "B. Ivanov" });
  await until(N, () => CMLube.state().state === "ready", null, 20000);
  ok("dashboard-next reads the same master", await N.p.evaluate(() => LUBE.comp("NHL TR60", "1", "HT").cap) === 72);

  console.log("\n4. TWO DESKS, DIFFERENT CHANGES, AT ONCE: BOTH KEPT");
  /* Each page still believes revision 1. A patches the TR60 transmission, N
     the TR60 coolant — both saves re-read the server first. */
  const [ra, rn] = await Promise.all([
    /* A change reports itself only when it actually changes something —
       the same contract as the page's own (setAt): the save re-applies it to
       what it reads back to learn whether it survived. */
    A.p.evaluate(() => CMLube.save(d => { const ch = []; const m = d.comps["HT|NHL TR60"] = d.comps["HT|NHL TR60"] || {};
      const c = m["2"] = m["2"] || {}; if (c.iv !== 2500) { c.iv = 2500; ch.push({ path: "x", from: 2000, to: 2500 }); } return ch; }, "A")),
    N.p.evaluate(() => CMLube.save(d => { const ch = []; const m = d.comps["HT|NHL TR60"] = d.comps["HT|NHL TR60"] || {};
      const c = m["9"] = m["9"] || {}; if (c.rf !== 140) { c.rf = 140; ch.push({ path: "y", from: 136, to: 140 }); } return ch; }, "N"))]);
  doc = await readDoc(DOC);
  const tr = doc.comps["HT|NHL TR60"];
  /* Serial in the bucket: whichever wrote second read the first's write. A
     genuine interleave inside one process is the lock's business (see
     tests/crossdashedit.cjs); this checks the page re-reads before writing. */
  ok("the engine edit from step 2 is still there", tr["1"] && tr["1"].cap === 72);
  ok("desk A's transmission interval is kept", tr["2"] && tr["2"].iv === 2500, JSON.stringify(tr["2"]));
  ok("desk N's coolant refill is kept", tr["9"] && tr["9"].rf === 140, JSON.stringify(tr["9"]));
  ok("the revision counted both (at least)", doc.rev >= 3, String(doc.rev));
  ok("and at least one save said it merged", ra.merged || rn.merged, JSON.stringify([ra, rn]));

  console.log("\n5. NEEDS DECISION: TR60 HYDRAULIC, 5W30 IN THE MATRIX, HVLP 32 IN THE SAMPLES");
  await A.p.evaluate(() => lubeMasterLoad());
  const rev3 = doc.rev;
  await until(A, r => CMLube.doc() && CMLube.doc().rev === r, rev3);
  const before = await A.p.evaluate(() => ({ g: LUBE.comp("NHL TR60", "3", "HT").g,
    v: LUBE.verdict("NHL TR60", "HT", "3", "NEXXOL HYDRAULIC SYNTH HVLP 32").k }));
  ok("before deciding: grade 5W30, and HVLP 32 in it is 'under decision', not a finding", before.g === "5W30" && before.v === "lube_v_pending", JSON.stringify(before));
  await open(A, "decide");
  const nOpen = await A.p.$$eval("#lmDecide .lmx-dec", x => x.length);
  ok("the open decisions are listed", nOpen > 20, String(nOpen));
  const card = '#lmDecide .lmx-dec[data-lmxid="NHL TR60|3"]';
  ok("the TR60 hydraulic is one of them", !!(await A.p.$(card)));
  await A.p.fill(card + " .lmx-dnote", "OEM Texamatic 1888 is an HVLP-type fluid; 25 of 31 samples H32");
  await clearMsg(A, "decide");
  await A.p.click(card + ' [data-lmxg="VG32"]');
  await savedIn(A, "decide");
  doc = await readDoc(DOC);
  ok("the decision is on the server with a name and the reason", doc.decide["NHL TR60|3"] && doc.decide["NHL TR60|3"].g === "VG32" &&
     doc.decide["NHL TR60|3"].by === "R. Marrero" && /Texamatic/.test(doc.decide["NHL TR60|3"].note));
  const after = await A.p.evaluate(() => ({ g: LUBE.comp("NHL TR60", "3", "HT").g, t: LUBE.comp("NHL TR60", "3", "HT").t,
    p: LUBE.forComp("NHL TR60", "3", "HT").p, v: LUBE.verdict("NHL TR60", "HT", "3", "NEXXOL HYDRAULIC SYNTH HVLP 32").k,
    w: LUBE.verdict("NHL TR60", "HT", "3", "Teboil Fluid TO-4 Synthetic 5W30").k }));
  ok("after: the grade is VG32 and the type hydraulic", after.g === "VG32" && after.t === "hydraulic", JSON.stringify(after));
  ok("the fitter is told the VG32 product", /NEXXOL/.test(after.p), after.p);
  ok("HVLP 32 now conforms", after.v === "lube_v_ok");
  ok("and TO-4 5W30 in the hydraulics is now the wrong kind of oil", after.w === "lube_v_wrong", after.w);
  await A.p.click('#lmDecide [data-lmxd="done"]');
  ok("the decided list shows it with the name", /Decided: VG32 · R\. Marrero/.test(await A.p.textContent("#lmDecide")));

  console.log("\n6. OILS: APPROVE A GRADE, CHOOSE ITS PRODUCTS");
  await open(A, "oils");
  const rows = await A.p.$$eval("#lmOils tr[data-lmxgr]", r => r.map(x => x.dataset.lmxgr));
  ok("every grade in use has a row, biggest volume first", rows[0] === "0W40" || rows[0] === "5W30", rows.slice(0, 4).join(","));
  const vol = await A.p.textContent('#lmOils tr[data-lmxgr="0W40"] td.num');
  ok("0W40 states its yearly litres from the sheet's own units", /\d{3}[ ,. ]?\d{3}/.test(vol), vol);
  await clearMsg(A, "oils");
  await A.p.click('#lmOils tr[data-lmxgr="0W40"] [data-lmxap="1"]');
  await savedIn(A, "oils");
  doc = await readDoc(DOC);
  ok("approval is recorded with a name", doc.grades["0W40"] && doc.grades["0W40"].state === "approved" && doc.grades["0W40"].by === "R. Marrero");
  await A.p.selectOption('#lmOils tr[data-lmxgr="75W90"] select[data-f="primary"]', "EXSOIL GEARTECH FE 75W90 GL-4/GL-5");
  await A.p.selectOption('#lmOils tr[data-lmxgr="75W90"] select[data-f="alt"]', "TEBOIL HYPOID 75W90");
  await clearMsg(A, "oils");
  await A.p.click("#lmxSaveO");
  await savedIn(A, "oils");
  doc = await readDoc(DOC);
  ok("the 75W90 primary and the 2027-shelf alternative are saved", doc.grades["75W90"].primary === "EXSOIL GEARTECH FE 75W90 GL-4/GL-5" &&
     doc.grades["75W90"].alt === "TEBOIL HYPOID 75W90", JSON.stringify(doc.grades["75W90"]));
  const p4 = await A.p.evaluate(() => ({ p: LUBE.forComp("NHL TR60", "4BL", "HT").p, v: LUBE.verdict("NHL TR60", "HT", "4BL", "TEBOIL HYPOID 75W90").k }));
  ok("the TR60 final drive is now told the new 75W90 primary", /GEARTECH FE 75W90/.test(p4.p), p4.p);
  ok("and the new alternative conforms there", p4.v === "lube_v_ok", p4.v);

  console.log("\n7. EXCEL OUT, EDITED, AND BACK IN");
  await open(A, "master");
  await A.p.evaluate(() => { CMLube._ui.model = "AT|Komatsu HM400-3MO"; CMLube.redraw(); });
  const [dl] = await Promise.all([A.p.waitForEvent("download"), A.p.click("#lmxXlOut")]);
  const file = path.join(os.tmpdir(), "lube-master-test.xlsx");
  await dl.saveAs(file);
  const bytes = fs.readFileSync(file);
  ok("the export is a zip (an .xlsx)", bytes[0] === 0x50 && bytes[1] === 0x4b);
  const back = await A.p.evaluate(async b64 => {
    const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
    const book = await CMLube.XLSX.read(buf);
    return book.map(s => ({ name: s.name, n: s.rows.length, head: s.rows[0],
      hm: s.rows.filter(r => r[1] === "Komatsu HM400-3MO" && r[2] === "1")[0] }));
  }, bytes.toString("base64"));
  ok("three sheets: Master, Grades, Decisions", back.map(s => s.name).join(",") === "Master,Grades,Decisions", back.map(s => s.name).join(","));
  const m = back[0];
  ok("Master has a row per compartment", m.n > 400, String(m.n));
  ok("the HM400 engine reads 58 L / 500 h / 0W40", m.hm && m.hm[8] === 58 && m.hm[10] === 500 && m.hm[5] === "0W40", JSON.stringify(m.hm));
  const styles = await A.p.evaluate(async b64 => {
    const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
    return new TextDecoder().decode(new Uint8Array(buf)).match(/FF0070C0/g);
  }, bytes.toString("base64"));
  ok("the grade colours travel into the workbook (engine blue fill)", !!(styles && styles.length));
  /* Edit two cells in the workbook the way somebody in Excel would: the
     simplest honest way here is to write a new workbook with the reader's own
     rows, two values changed, through the same writer. */
  const reimp = await A.p.evaluate(async b64 => {
    const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
    const book = await CMLube.XLSX.read(buf);
    const ms = book[0].rows.map(r => r.slice());
    const H = ms[0];
    const i = ms.findIndex(r => r[1] === "Komatsu HM400-3MO" && r[2] === "2");
    ms[i][H.indexOf("Refill L")] = 95;
    ms[i][H.indexOf("OEM interval h")] = 2000;
    const blob = CMLube.XLSX.write([{ name: "Master", rows: ms }, { name: "Grades", rows: book[1].rows }]);
    const f = new File([blob], "edited.xlsx");
    const input = document.querySelector("#lmxXlIn");
    const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files;
    input.dispatchEvent(new Event("change"));
    await new Promise(r => setTimeout(r, 600));
    return { panel: (document.querySelector(".lmx-imp") || {}).textContent || "" };
  }, bytes.toString("base64"));
  ok("the import finds exactly the two changes", /2 changes found in edited\.xlsx/.test(reimp.panel), reimp.panel.slice(0, 160));
  await clearMsg(A, "master");
  await A.p.click('[data-lmxi="go"]');
  await savedIn(A, "master");
  doc = await readDoc(DOC);
  const hm2 = doc.comps["AT|Komatsu HM400-3MO"] && doc.comps["AT|Komatsu HM400-3MO"]["2"];
  ok("and applies them to the server", hm2 && hm2.rf === 95 && hm2.ivo === 2000, JSON.stringify(hm2));
  ok("nothing else was touched (the engine stays at the workbook's value)",
     !(doc.comps["AT|Komatsu HM400-3MO"]["1"]), JSON.stringify(doc.comps["AT|Komatsu HM400-3MO"]));

  console.log("\n8. SAMPLING: THE SITE'S OWN NUMBERS, ALIASES ONLY ONTO A CODE THE MACHINE HAS");
  await open(A, "sample");
  await A.p.fill("#lmxSU", "TK154"); await A.p.dispatchEvent("#lmxSU", "change");
  await A.p.fill("#lmxSD", "2026-05-06"); await A.p.dispatchEvent("#lmxSD", "change");
  const nos = await A.p.$$eval("#lmSample .lmx-sno", x => x.map(e => e.textContent));
  ok("TK154's hydraulic sample on 6 May 2026 is 06052026-TK154-3 — the number on the site's own label", nos.includes("06052026-TK154-3"), nos.join(" "));
  const al = await A.p.evaluate(() => ({ d9: LUBE.sampleCode("CAT D9R", "DOZ", "4E"), tr: LUBE.sampleCode("NHL TR60", "HT", "4E"),
    bad: LUBE.sampleCode("NHL TR60", "HT", "ZZ") }));
  ok("a D9R's '4E' is its 4BL final drive", al.d9 === "4BL", JSON.stringify(al));
  ok("an unknown code resolves to nothing rather than a guess", al.bad === null);

  console.log("\n9. RUSSIAN, AND NO ERRORS");
  const R = await boot(b, "dashboard/index.html", { who: "Р. Марреро", lang: "ru" });
  await until(R, () => CMLube.state().state === "ready", null, 20000);
  await open(R, "decide");
  const ru = await R.p.textContent("#lmDecide h2");
  ok("the decision panel speaks Russian", /Требует решения/.test(ru), ru);
  const ruTab = await R.p.textContent('#lubeSub [data-lsub="master"]');
  ok("so does its tab", /Справочник смазки/.test(ruTab), ruTab);
  ok("no page errors on dashboard", A.errs.length === 0, A.errs.slice(0, 3).join(" | "));
  ok("no page errors on dashboard-next", N.errs.length === 0, N.errs.slice(0, 3).join(" | "));
  ok("no page errors in Russian", R.errs.length === 0, R.errs.slice(0, 3).join(" | "));

  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : "\nall passed");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
