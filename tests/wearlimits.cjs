/* MEASUREMENT LIMITS, SET IN THE OFFICE (dashboard/wear-limits.js).

   Asked for on 2026-10-26: the undercarriage limits — new and wear limit per
   model and point — editable on the CM dashboard, with the choice of applying
   a change from a date forward or re-grading all history. These checks run
   both office pages against the real backend function (tests/ya-srv.cjs over
   an in-memory bucket) and the phone against the same folder:

     1. a fresh folder: no office limits, the reference figures in force, said
     2. the preview counts what each choice would change, before saving
     3. a change needs a name and a source, and refuses impossible figures
     4. "re-grade all history" re-scores every reading; "from a date" leaves
        the earlier ones on the limit they were scored against
     5. the other office page reads the same limits
     6. taking a change back puts the reference back, and is kept on record
     7. the phone pulls the limits with the folder and keeps them
     8. Russian, and no page errors

   Run: node tests/wearlimits.cjs   (spawns tests/ya-srv.cjs) */
const { chromium } = require(require("./pw.cjs"));
const { spawn } = require("child_process");
const path = require("path");

const PORT = 8149, B = `http://127.0.0.1:${PORT}`, EXEC = B + "/exec";
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

/* Two SD90 bushing readings (borrowed reference: no percentage) and two SD60
   bushing readings, one before today and one today. */
const TODAY = new Date(Date.now() + 12 * 3600e3).toISOString().slice(0, 10);   // site calendar
const RECS = [
  { equip: "DZ017", date: "2026-09-01", type: "UC", cls: "DOZ", by: "T", items: [{ key: "BUSH.L", mm: 115 }, { key: "BUSH.R", mm: 114 }] },
  { equip: "DZ019", date: "2026-09-02", type: "UC", cls: "DOZ", by: "T", items: [{ key: "BUSH.L", mm: 96 }] },
  { equip: "DZ021", date: TODAY, type: "UC", cls: "DOZ", by: "T", items: [{ key: "BUSH.L", mm: 96 }] },
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
  await p.waitForFunction(() => window.CMWearLimits && window.WEAR && window.CMDrive && CMDrive.configured(), null, { timeout: 20000 });
  await p.waitForFunction(() => ["none", "ready"].includes(CMWearLimits.state().state), null, { timeout: 30000 });
  await p.evaluate(r => { window.CMDash.importRecords(r); if (typeof showTab === "function") showTab("sync"); }, RECS);
  await p.waitForTimeout(300);
  return { ctx, p, errs };
}
const pct = (d, i, j) => d.p.evaluate(([i, j]) => {
  const r = RECS.find(x => x.equip === i[0] && x.date === i[1] && x.type === "UC");
  const it = r && r.items.find(x => x.key === j);
  const w = it && wearOf(r, it); return w ? w.wearPct : "no-row";
}, [i, j]);

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(EXEC); break; } catch (e) { await wait(250); } }
  const b = await chromium.launch();
  const A = await boot(b, "dashboard/index.html", { who: "R. Marrero" });

  console.log("\n1. A FRESH FOLDER");
  const s1 = await A.p.evaluate(() => ({ st: CMWearLimits.state().state, txt: document.getElementById("wlPanel").innerText }));
  ok("the panel is on the Data & Sync tab", /Measurement limits/.test(s1.txt), s1.txt.slice(0, 80));
  ok("no office limits yet, and it says the reference is in force", s1.st === "none" && /reference figures are in force/.test(s1.txt));
  ok("the SD90 bushing scores no percentage (borrowed reference)", (await pct(A, ["DZ017", "2026-09-01"], "BUSH.L")) == null);
  ok("the SD60 bushing scores against 98.5 / 92.5", (await pct(A, ["DZ019", "2026-09-02"], "BUSH.L")) === 42);

  console.log("\n2. THE PREVIEW");
  await A.p.evaluate(() => CMWearLimits.select("Shantui SD90"));
  await A.p.click('[data-wledit="BUSH"]');
  await A.p.fill("#wlN", "116"); await A.p.fill("#wlC", "107.5");
  await A.p.waitForTimeout(150);
  const pvFrom = await A.p.textContent("#wlPv");
  ok("from today: both earlier readings keep their limit", /2 reading\(s\) on 1 machine/.test(pvFrom) && /0 change grade/.test(pvFrom) && /2 earlier/.test(pvFrom), pvFrom);
  await A.p.check("#wlAllOn"); await A.p.waitForTimeout(150);
  const pvAll = await A.p.textContent("#wlPv");
  ok("re-grade all history: both readings change grade", /2 change grade/.test(pvAll) && !/earlier/.test(pvAll), pvAll);

  console.log("\n3. WHAT A SAVE NEEDS");
  await A.p.click("#wlSave");
  ok("no source: refused, said in words", /where the figures come from/.test(await A.p.textContent("#wlFormMsg")));
  await A.p.fill("#wlWhy", "site sheet 26.10.2026");
  await A.p.fill("#wlC", "120"); await A.p.click("#wlSave");
  ok("a limit larger than new on a point that wears down: refused", /must be smaller than new/.test(await A.p.textContent("#wlFormMsg")));
  await A.p.fill("#wlC", "116"); await A.p.click("#wlSave");
  ok("new equal to the limit: refused", /cannot be the same/.test(await A.p.textContent("#wlFormMsg")));
  await A.p.fill("#wlC", "107.5"); await A.p.fill("#wlWho", "");
  await A.p.click("#wlSave");
  ok("no name: refused", /Type your name/.test(await A.p.textContent("#wlFormMsg")));
  ok("...and nothing reached the server", (await readDoc()) === null);

  console.log("\n4. RE-GRADE ALL HISTORY, THEN FROM A DATE");
  await A.p.fill("#wlWho", "R. Marrero");
  await A.p.click("#wlSave");
  await A.p.waitForFunction(() => /revision \d+/i.test((document.getElementById("wlMsg") || {}).textContent || ""), null, { timeout: 20000 });
  const d1 = await readDoc();
  const c1 = d1 && d1.changes && d1.changes[0];
  ok("the change is on the server, signed, with its source", c1 && c1.model === "Shantui SD90" && c1.point === "BUSH" && c1.n === 116 && c1.c === 107.5
     && c1.by === "R. Marrero" && c1.why === "site sheet 26.10.2026", JSON.stringify(c1));
  ok("re-grade is the change dated from the beginning", c1 && c1.from === "0000-01-01");
  ok("the old reading is now scored against it (12 %)", (await pct(A, ["DZ017", "2026-09-01"], "BUSH.L")) === 12);
  ok("the table says it is the office's, for all history",
     /office · all history/.test(await A.p.textContent('tr[data-wlpt="BUSH"]')));
  ok("a change log was written", await (async () => {
    const r = await (await fetch(EXEC + "?action=list&folder=_meta/wear/log&ext=.json")).json();
    return ((r.files || r.items || []).length) >= 1; })());

  await A.p.evaluate(() => CMWearLimits.select("Shantui SD60"));
  await A.p.click('[data-wledit="BUSH"]');
  await A.p.fill("#wlN", "98.5"); await A.p.fill("#wlC", "90");
  await A.p.fill("#wlWhy", "manual check");
  await A.p.click("#wlSave");
  await A.p.waitForFunction(() => /revision 2/i.test((document.getElementById("wlMsg") || {}).textContent || ""), null, { timeout: 20000 });
  ok("from today: the reading before keeps 98.5 / 92.5 (42 %)", (await pct(A, ["DZ019", "2026-09-02"], "BUSH.L")) === 42);
  ok("from today: today's reading takes 98.5 / 90 (29 %)", (await pct(A, ["DZ021", TODAY], "BUSH.L")) === 29);

  console.log("\n5. THE OTHER OFFICE PAGE");
  const N = await boot(b, "dashboard-next/index.html", { who: "Desk 2" });
  const n1 = await N.p.evaluate(() => CMWearLimits.state());
  ok("dashboard-next reads the same limits", n1.state === "ready" && n1.rev === 2, JSON.stringify(n1));
  ok("and scores the same (12 % / 42 % / 29 %)",
     (await pct(N, ["DZ017", "2026-09-01"], "BUSH.L")) === 12 && (await pct(N, ["DZ019", "2026-09-02"], "BUSH.L")) === 42
     && (await pct(N, ["DZ021", TODAY], "BUSH.L")) === 29);

  console.log("\n6. TAKING A CHANGE BACK");
  N.p.on("dialog", dlg => dlg.accept());
  await N.p.evaluate(() => CMWearLimits.select("Shantui SD90"));
  await N.p.click("[data-wlvoid]");
  await N.p.waitForFunction(() => CMWearLimits.state().rev === 3, null, { timeout: 20000 });
  const d3 = await readDoc();
  const v = d3.changes.find(x => x.model === "Shantui SD90");
  ok("the change is kept, marked taken back, signed", v && v.void && v.void.by === "Desk 2");
  ok("the SD90 bushing is back to no percentage", (await pct(N, ["DZ017", "2026-09-01"], "BUSH.L")) == null);
  await A.p.evaluate(() => CMWearLimits.load());
  ok("the first page sees it too after its next read", (await pct(A, ["DZ017", "2026-09-01"], "BUSH.L")) == null);

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
  const ph = await P.evaluate(async () => { const d = await wearLimitsPull(true);
    const r = WEAR.refFor("DZ021", "SHANTUI SD60-C5", "BUSH", "L", DUE.today());
    return { rev: d && d.rev, n: r.n, c: r.c, src: r.src, kept: !!localStorage.getItem("cm_wear_limits") }; });
  ok("the phone pulls the limits and scores against them", ph.rev === 3 && ph.n === 98.5 && ph.c === 90 && ph.src === "limit", JSON.stringify(ph));
  ok("and keeps them for the pit", ph.kept);
  await P.reload({ waitUntil: "load" });
  await P.waitForFunction(() => window.WEAR && WEAR.limits, null, { timeout: 20000 });
  ok("after a restart with no pull, the kept limits are in force",
     await P.evaluate(() => WEAR.refFor("DZ021", "SHANTUI SD60-C5", "BUSH", "L", DUE.today()).c === 90));

  console.log("\n8. RUSSIAN, AND NO ERRORS");
  const R = await boot(b, "dashboard/index.html", { who: "Р. Марреро", lang: "ru" });
  const rt = await R.p.evaluate(() => document.getElementById("wlPanel").innerText);
  ok("the panel speaks Russian", /Пределы замеров/.test(rt) && /Версия 3/.test(rt), rt.slice(0, 80));
  ok("no page errors on either office page or the phone", !A.errs.length && !N.errs.length && !R.errs.length && !perr.length,
     A.errs.concat(N.errs, R.errs, perr).join(" | "));

  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : "\nall passed");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
