/* GET, TRAY AND TEMPERATURE LIMITS, SET IN THE OFFICE (build 547).

   Asked for on 2026-10-26, straight after the undercarriage panel
   (tests/wearlimits.cjs): the same panel sets the ground engaging tools'
   new / warning / wear limit per tool and point, the dump body tray's per
   model and zone, and the temperature warn / alarm per component row. One
   document (_meta/wear/limits.json), a `kind` on each change. These checks run
   both office pages against the real backend function (tests/ya-srv.cjs over
   an in-memory bucket) and the phone against the same folder:

     1. the panel offers the four kinds, each with its own models and points
     2. GET: "re-grade all history" re-scores every tooth reading
     3. tray: a side skin the table leaves ungraded is graded from a date,
        earlier readings stay ungraded; the warning moves the band
     4. temperature: warn / alarm per row, from today, impossible pairs refused
     5. each engine takes only its own kind (the undercarriage sees none of them)
     6. the other office page reads the same limits
     7. the phone pulls them and scores against them
     8. taking a change back, Russian, and no page errors

   Run: node tests/limitsall.cjs   (spawns tests/ya-srv.cjs) */
const { chromium } = require(require("./pw.cjs"));
const { spawn } = require("child_process");
const path = require("path");

const PORT = 8151, B = `http://127.0.0.1:${PORT}`, EXEC = B + "/exec";
const DOC = "_meta/wear/limits.json";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };
const wait = ms => new Promise(r => setTimeout(r, ms));

const srv = spawn(process.execPath, [path.join(__dirname, "ya-srv.cjs"), String(PORT), "NONE"], { stdio: "ignore" });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on("exit", bye); process.on("SIGINT", () => { bye(); process.exit(1); });

const readDoc = async () => {
  const r = await (await fetch(EXEC + "?action=file&id=" + encodeURIComponent(DOC))).json();
  return r.ok ? JSON.parse(Buffer.from(r.data, "base64").toString("utf8")) : null;
};

const TODAY = new Date(Date.now() + 12 * 3600e3).toISOString().slice(0, 10);   // site calendar
/* EX001/EX002 carry a bucket, TK146 is a TR60 tray. */
const RECS = [
  { equip: "EX001", date: "2026-09-01", type: "GET", cls: "EXC", by: "T", items: [{ key: "TOOTH", mm: 220 }] },
  { equip: "EX002", date: TODAY, type: "GET", cls: "EXC", by: "T", items: [{ key: "TOOTH", mm: 150 }] },
  { equip: "TK146", date: "2026-09-03", type: "TB", cls: "HT", by: "T", items: [{ key: "L11", mm: 12 }, { key: "F11", mm: 10 }] },
  { equip: "TK147", date: TODAY, type: "TB", cls: "HT", by: "T", items: [{ key: "L11", mm: 11 }, { key: "L12", mm: 8.5 }] },
];

async function boot(b, file, o) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addInitScript(([url, o]) => {
    if (sessionStorage.getItem("booted")) return;
    sessionStorage.setItem("booted", "1");
    localStorage.setItem("cm_drive_url", url);
    if (o.who) localStorage.setItem("cm_dash_who", o.who);
    if (o.lang) localStorage.setItem("cm_dash_lang", o.lang);
  }, [EXEC, o || {}]);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  p.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource|site_kpi/i.test(m.text())) errs.push(m.text()); });
  await p.goto(B + "/" + file, { waitUntil: "load" });
  await p.waitForFunction(() => window.CMWearLimits && window.WEAR && window.GET && window.BODY && window.CMDrive && CMDrive.configured(), null, { timeout: 20000 });
  await p.waitForFunction(() => ["none", "ready"].includes(CMWearLimits.state().state), null, { timeout: 30000 });
  await p.evaluate(r => { window.CMDash.importRecords(r); if (typeof showTab === "function") showTab("sync"); }, RECS);
  await p.waitForTimeout(300);
  return { ctx, p, errs };
}
const wo = (d, unit, date, key) => d.p.evaluate(([u, dt, k]) => {
  const r = RECS.find(x => x.equip === u && x.date === dt);
  const it = r && r.items.find(x => x.key === k);
  const w = it && wearOf(r, it);
  return w ? { pct: w.wearPct, band: w.band, warn: w.warnPct, n: w.newMM, c: w.condemnMM, src: w.refSrc } : "no-row";
}, [unit, date, key]);
const panel = d => d.p.evaluate(() => document.getElementById("wlPanel").innerText);
const row = (d, code) => d.p.evaluate(c => { const r = document.querySelector(`#wlPanel tr[data-wlpt="${c}"]`); return r ? r.innerText : ""; }, code);

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(EXEC); break; } catch (e) { await wait(250); } }
  const b = await chromium.launch();
  const A = await boot(b, "dashboard/index.html", { who: "R. Marrero" });

  console.log("\n1. FOUR KINDS");
  const kinds = await A.p.evaluate(() => [...document.querySelectorAll("#wlKind option")].map(o => o.value));
  ok("the panel offers undercarriage, GET, tray and temperature", JSON.stringify(kinds) === '["uc","get","tb","temp"]', JSON.stringify(kinds));
  await A.p.selectOption("#wlKind", "get");
  const tools = await A.p.evaluate(() => [...document.querySelectorAll("#wlModel option")].map(o => o.textContent));
  ok("GET lists the tools with how many machines carry each", tools.some(t => /^Bucket \(\d+\)$/.test(t)) && tools.some(t => /^Blade & ripper \(\d+\)$/.test(t)), JSON.stringify(tools));
  await A.p.selectOption("#wlModel", "bucket");
  const tooth = await row(A, "TOOTH");
  ok("the bucket's tooth shows its generic reference", /320 → 130/.test(tooth) && /generic/.test(tooth), tooth);
  ok("a visual point (retainers) is not offered — there is nothing to measure", !(await row(A, "PIN")));
  await A.p.selectOption("#wlKind", "tb");
  await A.p.selectOption("#wlModel", "TR60");
  const left = await row(A, "LEFT"), flr = await row(A, "FLR1");
  ok("the tray lists zones: the floor at the site's 20 → 3, the side skin not graded", /20 → 3/.test(flr) && /not graded/.test(left), flr + " | " + left);
  ok("the TR60's own machines are counted", /TR60 \((?!0\))\d+\)/.test(await A.p.evaluate(() => document.querySelector("#wlModel").selectedOptions[0].textContent)));
  await A.p.selectOption("#wlKind", "temp");
  const brg = await row(A, "bearing");
  ok("temperature lists the component rows with warning → alarm", /Bearings/.test(brg) && /70 → 85/.test(brg), brg);
  ok("temperature has no model to choose", !(await A.p.$("#wlModel")));

  console.log("\n2. GET — RE-GRADE ALL HISTORY");
  const g0 = await wo(A, "EX001", "2026-09-01", "TOOTH");
  ok("before: the 220 mm tooth is 53% against 320 → 130", g0.pct === 53, JSON.stringify(g0));
  await A.p.selectOption("#wlKind", "get");
  await A.p.selectOption("#wlModel", "bucket");
  await A.p.click('[data-wledit="TOOTH"]');
  await A.p.fill("#wlN", "320"); await A.p.fill("#wlW", "230"); await A.p.fill("#wlC", "180");
  await A.p.check("#wlAllOn");
  await A.p.waitForTimeout(150);
  const pv = await A.p.textContent("#wlPv");
  ok("the preview counts both tooth readings and what moves", /^2 reading\(s\) on 2 machine\(s\)/.test(pv) && /[12] change grade \([12] worse, 0 better\)/.test(pv), pv);
  await A.p.fill("#wlWhy", "ESCO chart, bucket teeth");
  await A.p.click("#wlSave");
  await A.p.waitForFunction(() => /Saved/.test((document.getElementById("wlMsg") || {}).textContent || ""), null, { timeout: 20000 });
  const d1 = await readDoc();
  const c1 = d1 && d1.changes[d1.changes.length - 1];
  ok("the change is kept with kind 'get', the tool and the point", c1 && c1.kind === "get" && c1.model === "bucket" && c1.point === "TOOTH" && c1.n === 320 && c1.w === 230 && c1.c === 180 && c1.from === "0000-01-01", JSON.stringify(c1));
  const g1 = await wo(A, "EX001", "2026-09-01", "TOOTH"), g2 = await wo(A, "EX002", TODAY, "TOOTH");
  ok("the old reading is re-scored: 220 mm is 71%, past the 230 mm warning (64%)", g1.pct === 71 && g1.warn === 64 && g1.band === "watch" && g1.src === "limit", JSON.stringify(g1));
  ok("today's 150 mm is past the limit", g2.pct === 121 && g2.band === "act", JSON.stringify(g2));
  ok("the row says office, all history", /320 → 230 → 180/.test(await row(A, "TOOTH")) && /office · all history/.test(await row(A, "TOOTH")));

  console.log("\n3. TRAY — FROM A DATE, A ZONE THE TABLE LEAVES UNGRADED");
  const t0 = await wo(A, "TK147", TODAY, "L11");
  ok("before: a side-skin reading has no percentage", t0.pct == null && t0.n == null, JSON.stringify(t0));
  await A.p.evaluate(() => CMWearLimits.select("TR60", "tb"));
  const err = await A.p.evaluate(t => CMWearLimits.setLimit("LEFT", 6, 16, t, "x").then(() => "", e => e.message), TODAY);
  ok("a limit thicker than new is refused", /wears down/.test(err), err);
  await A.p.evaluate(t => CMWearLimits.setLimit("LEFT", 16, 6, t, "Site sheet — side skins", 9), TODAY);
  const t1 = await wo(A, "TK147", TODAY, "L11"), t2 = await wo(A, "TK146", "2026-09-03", "L11"), t3 = await wo(A, "TK147", TODAY, "L12");
  ok("today's 11 mm side skin is 50% of 16 → 6", t1.pct === 50 && t1.n === 16 && t1.c === 6 && t1.band === "ok" && t1.src === "limit", JSON.stringify(t1));
  ok("the reading from before the date keeps no grade", t2.pct == null, JSON.stringify(t2));
  ok("8.5 mm is past the 9 mm warning: watch", t3.pct === 75 && t3.warn === 70 && t3.band === "watch", JSON.stringify(t3));
  await A.p.evaluate(() => CMWearLimits.setLimit("FLR1", 25, 5, "0000-01-01", "thicker floor plate"));
  const t4 = await wo(A, "TK146", "2026-09-03", "F11");
  ok("re-grading the floor re-scores the September reading (10 mm of 25 → 5 = 75%)", t4.pct === 75, JSON.stringify(t4));

  console.log("\n4. TEMPERATURE");
  await A.p.evaluate(() => CMWearLimits.select("*", "temp"));
  const te = await A.p.evaluate(() => CMWearLimits.setLimit("bearing", 70, 60, "2000-01-01", "x").then(() => "", e => e.message));
  ok("an alarm below the warning is refused", /higher than the warning/.test(te), te);
  await A.p.click('[data-wledit="bearing"]');
  ok("the temperature form has no warning-mm box and no re-grade choice", !(await A.p.$("#wlW")) && !(await A.p.$("#wlAllOn")));
  await A.p.fill("#wlN", "60"); await A.p.fill("#wlC", "75"); await A.p.fill("#wlWhy", "OEM bearing chart");
  await A.p.click("#wlSave");
  await A.p.waitForFunction(() => /Saved/.test((document.getElementById("wlMsg") || {}).textContent || ""), null, { timeout: 20000 });
  const d2 = await readDoc(), c2 = d2.changes[d2.changes.length - 1];
  ok("kept as kind 'temp' with warn and alarm, from today", c2.kind === "temp" && c2.point === "bearing" && c2.warn === 60 && c2.alarm === 75 && c2.from === TODAY && c2.n === undefined, JSON.stringify(c2));
  ok("the row shows 60 → 75 in force", /60 → 75/.test(await row(A, "bearing")) && /office/.test(await row(A, "bearing")));
  const tl = await A.p.evaluate(() => [tempLimit("Front wheel bearing").warn, tempLimit("Front wheel bearing").alarm, tempLimit("Engine block").alarm]);
  ok("the engine reads it for a bearing and leaves the engine row alone", JSON.stringify(tl) === "[60,75,110]", JSON.stringify(tl));

  console.log("\n5. EACH ENGINE TAKES ITS OWN KIND");
  const iso = await A.p.evaluate(() => ({ uc: WEAR.limits.length, kinds: WEAR.limits.map(x => x.kind || "uc") }));
  ok("the undercarriage engine holds none of the new kinds", iso.uc === 0, JSON.stringify(iso));
  ok("the undercarriage tab still opens on its own models", await A.p.evaluate(() => { CMWearLimits.select("", "uc");
    return [...document.querySelectorAll("#wlModel option")].some(o => /Shantui SD60/.test(o.textContent)); }));

  console.log("\n6. THE OTHER OFFICE PAGE");
  const N = await boot(b, "dashboard-next/index.html", { who: "Desk 2" });
  await N.p.evaluate(() => CMWearLimits.load());
  const n1 = await wo(N, "EX001", "2026-09-01", "TOOTH"), n2 = await wo(N, "TK147", TODAY, "L11");
  ok("dashboard-next scores the tooth and the side skin the same way", n1.pct === 71 && n2.pct === 50, JSON.stringify([n1, n2]));

  console.log("\n7. THE PHONE");
  const pc = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await pc.addInitScript(u => {
    if (sessionStorage.getItem("b")) return; sessionStorage.setItem("b", "1");
    localStorage.setItem("up_dests", JSON.stringify([{ id: "gas", on: true, url: u, sec: "", folder: "" }]));
  }, EXEC);
  const P = await pc.newPage();
  const perr = []; P.on("pageerror", e => perr.push(e.message));
  await P.goto(B + "/mobile/index.html", { waitUntil: "load" });
  await P.waitForFunction(() => window.WEAR && typeof wearLimitsPull === "function", null, { timeout: 20000 });
  const ph = await P.evaluate(async () => {
    await wearLimitsPull(true);
    const g = GET.refFor("EX002", "EXC", "HITACHI EX1200-6BH", "TOOTH", DUE.today());
    const L = BODY.limitFor("TR60", "L11", DUE.today());
    const w = wearOut({ equip: "TK147", type: "TB", date: DUE.today(), positions: {} }, "L12", { mm: 8.5 });
    return { g: g && [g.n, g.w, g.c, g.src], L: L && [L.n, L.w, L.c], tb: w && [w.wearPct, w.warnPct, w.band],
             t: [tempLimit("Rear bearing").warn, tempLimit("Rear bearing").alarm], uc: WEAR.limits.length };
  });
  ok("the phone's GET reference is the office's", JSON.stringify(ph.g) === '[320,230,180,"limit"]', JSON.stringify(ph.g));
  ok("the phone grades the side skin and carries the warning out with the reading", JSON.stringify(ph.L) === "[16,9,6]" && JSON.stringify(ph.tb) === '[75,70,"watch"]', JSON.stringify(ph));
  ok("the phone proposes temperature grades from the office's bearing limits", JSON.stringify(ph.t) === "[60,75]", JSON.stringify(ph.t));
  ok("and its undercarriage engine took none of them", ph.uc === 0);
  await P.reload({ waitUntil: "load" });
  await P.waitForFunction(() => window.GET && window.BODY && window.tempLimit, null, { timeout: 20000 });
  ok("after a restart with no pull, the kept limits are in force",
     await P.evaluate(() => GET.refFor("EX002", "EXC", "HITACHI EX1200-6BH", "TOOTH").c === 180 && tempLimit("bearing").alarm === 75 && BODY.limitFor("TR60", "L11").n === 16));

  console.log("\n8. TAKING BACK, RUSSIAN, NO ERRORS");
  await A.p.evaluate(() => CMWearLimits.load());
  const tid = (await readDoc()).changes.find(x => x.kind === "temp").id;
  A.p.once("dialog", dl => dl.accept());
  await A.p.evaluate(() => CMWearLimits.select("*", "temp"));
  await A.p.click(`[data-wlvoid="${tid}"]`);
  await A.p.waitForFunction(() => /taken back/.test(document.getElementById("wlPanel").innerText), null, { timeout: 20000 });
  ok("taking the bearing change back restores 70 → 85, and the record stays", (await A.p.evaluate(() => tempLimit("bearing").alarm)) === 85
     && (await readDoc()).changes.find(x => x.id === tid).void);
  const R = await boot(b, "dashboard/index.html", { who: "Р. Марреро", lang: "ru" });
  await R.p.evaluate(() => CMWearLimits.select("TR60", "tb"));
  const rt = await R.p.evaluate(() => document.getElementById("wlPanel").textContent);
  ok("the panel speaks Russian for the new kinds", /Кузов самосвала/.test(rt) && /Зона/.test(rt) && /Левый борт/.test(rt), rt.slice(0, 160));
  ok("no page errors on either office page or the phone", !A.errs.length && !N.errs.length && !R.errs.length && !perr.length,
     A.errs.concat(N.errs, R.errs, perr).join(" | "));

  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : "\nall passed");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
