/* LUBELINK_HANDOVER_V1 (build 538): LubeLink is the one editor of the lube master.

   The Lubrication tab stays a full read-only view of the same document — a desk or a
   phone off the company network still sees the reference — but every edit control in
   the four lube-master panels is off, each panel says where the edits are made, and
   the save path itself refuses. The suites that test the editor (lubemaster, lubehead,
   luberef, lubestd, lube-next) set window.CM_LUBE_EDIT_HERE = true; this one proves
   both sides of that switch, on both office pages, in English and Russian.

   Run: node tests/lubehandover.cjs [port]   (any static server of the repo on 8093) */
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
let fail = 0, pass = 0;
const ok = (c, w, x) => { if (!c) { fail++; console.log("  FAIL  " + w + (x !== undefined ? "   " + x : "")); }
                          else { pass++; console.log("  PASS  " + w); } return c; };

(async () => {
  const b = await chromium.launch();
  for (const page of ["dashboard", "dashboard-next"]) for (const lang of ["en", "ru"]) for (const edit of [false, true]) {
    if (edit && lang === "ru") continue;
    console.log(`── ${page} · ${lang} · ${edit ? "editing switched back on" : "default: hand-over"}`);
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
    await ctx.addInitScript(([l, e]) => { localStorage.setItem("cm_dash_lang", l); if (e) window.CM_LUBE_EDIT_HERE = true; }, [lang, edit]);
    const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", e => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${PORT}/${page}/index.html`, { waitUntil: "load" });
    await p.waitForTimeout(1800);
    await p.click('[data-tab="lube"]'); await p.waitForTimeout(500);
    const top = await p.evaluate(() => { const a = document.getElementById("lubeLinkBtn"), n = document.getElementById("lubeHoNote");
      return { href: a && a.href, primary: a && a.classList.contains("primary"), txt: a && a.textContent.trim(), note: n && n.offsetParent !== null ? n.textContent.trim() : "" }; });
    ok(top.href === "https://maintenance.vegadevelopment.com/lube/" && top.primary, "header: a primary button to LubeLink", JSON.stringify(top));
    ok(lang === "ru" ? /Открыть LubeLink/.test(top.txt) && /LubeLink/.test(top.note) && /[а-я]/.test(top.note) : /Open LubeLink/.test(top.txt) && /read-only view/.test(top.note),
       "the tab says LubeLink manages the master, in the page's language", top.txt + " | " + top.note.slice(0, 60));
    for (const sub of ["master", "decide", "oils", "sample"]) {
      await p.evaluate(s => lubeGo(s), sub); await p.waitForTimeout(350);
      if (sub === "master") { await p.evaluate(() => { const m = document.querySelector("#lmMaster .lmx-mrow"); if (m) m.click(); }); await p.waitForTimeout(350); }
      if (sub === "sample") { await p.evaluate(() => { const u = document.getElementById("lmxSU"); u.value = "TK101"; u.dispatchEvent(new Event("change", { bubbles: true })); u.dispatchEvent(new Event("input", { bubbles: true })); }); await p.waitForTimeout(350); }
      const id = { master: "lmMaster", decide: "lmDecide", oils: "lmOils", sample: "lmSample" }[sub];
      const r = await p.evaluate(id => {
        const el = document.getElementById(id), bar = el.querySelector(".lmx-ho");
        const vis = x => x && x.offsetParent !== null;
        const live = [...el.querySelectorAll("input,select,textarea")].filter(x => !x.disabled && x.type !== "search" && !["lmxQ", "lmxSU", "lmxSD"].includes(x.id) && x.type !== "file");
        const saves = [...el.querySelectorAll("#lmxSaveM,#lmxUndoM,#lmxRevM,#lmxSaveO,#lmxSaveA,#lmxMig,.lmx-file,[data-lmxap],[data-lmxre]")].filter(vis);
        const opts = [...el.querySelectorAll("[data-lmxg]")], optsLive = opts.filter(x => !x.disabled);
        const keep = ["lmxQ", "lmxSU", "lmxSD"].map(i => el.querySelector("#" + i)).filter(Boolean).filter(x => x.disabled);
        return { bar: !!bar, barLink: bar ? (bar.querySelector("a") || {}).href : "", barTxt: bar ? bar.textContent : "",
                 inputs: el.querySelectorAll("input,select,textarea").length, live: live.length, saves: saves.map(x => x.id || x.className).join(","),
                 opts: opts.length, optsLive: optsLive.length, keepOff: keep.length, rows: el.querySelectorAll("tr").length };
      }, id);
      if (!edit) {
        ok(r.bar && r.barLink === "https://maintenance.vegadevelopment.com/lube/", `${sub}: the hand-over bar, linking to LubeLink`, JSON.stringify(r).slice(0, 160));
        ok(lang === "ru" ? /редактируется в LubeLink/.test(r.barTxt) : /edited in LubeLink/.test(r.barTxt), `${sub}: the bar is in the page's language`, r.barTxt.slice(0, 70));
        ok(r.live === 0, `${sub}: no edit control is live (${r.inputs} boxes drawn)`, r.live);
        ok(!r.saves, `${sub}: no save / undo / revert / import / approve button shows`, r.saves);
        ok(r.optsLive === 0, `${sub}: decision options cannot be pressed (${r.opts})`, r.optsLive);
        ok(r.keepOff === 0, `${sub}: what only reads stays usable (search, sampling unit and date)`);
        ok(r.rows > 1 || sub === "decide", `${sub}: the reference is still shown (${r.rows} rows)`);
      } else {
        ok(!r.bar, `${sub}: editing on: no hand-over bar`);
        if (sub === "master" || sub === "oils") ok(r.live > 0, `${sub}: editing on: the edit controls are live`, r.live);
      }
    }
    const sv = await p.evaluate(async () => { try { await CMLube.save(d => [{ path: "x", from: 1, to: 2 }], "test"); return "saved"; } catch (e) { return String(e.message || e); } });
    if (!edit) ok(lang === "ru" ? /LubeLink/.test(sv) && /[а-я]/.test(sv) : /edited in LubeLink/.test(sv), "the save path itself refuses, and says why", sv);
    else ok(!/LubeLink/.test(sv), "editing on: the save path does not refuse for the hand-over", sv);
    ok(!errs.length, "0 page errors", errs.join(" | "));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL exception " + e); process.exit(1); });
