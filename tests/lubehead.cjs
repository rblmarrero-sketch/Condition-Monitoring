/* THE LUBRICATION TABLES, CLEAN IN BOTH LANGUAGES ON BOTH OFFICE PAGES.

   Build 529. The four lube-master tables and the shop poster had become
   fixed-width tables with one line a row (builds 516-519), and what was left
   showed in Russian: a heading wrapped at ANY letter, so "Система" printed as
   "СИСТЕМ / А" and "Заправка" as "ЗАПРАВ / КА", and on the poster the
   workbook's own "Гидравлич.система" broke as "Гидравлич.си / стема" and
   "Differential" as "DIFFERENTIA / L". The checks below ask the rendered page:

     1. every heading of the Lube master, Needs decision and Oils tables wraps
        between words or at a soft hyphen, and each piece fits its cell —
        English and Russian, dashboard/ and dashboard-next/
     2. every Lube master row is one height (the "decide" flag sits on the
        name's line, not under it)
     3. a compartment's answers in Needs decision sit on one line
     4. the poster's compartment headings carry the soft hyphens and the
        break after an abbreviation's full stop, and the soft hyphens stay
        OUT of the tooltips
     5. what a desk has typed and not saved survives the page's own redraw
        (the folder refresh at boot, every three minutes and on coming back
        to the window), while Discard and choosing another model still clear it
     6. no page errors

   Run: node tests/lubehead.cjs   (spawns tests/ya-srv.cjs) */
const { chromium } = require(require("./pw.cjs"));
const { spawn } = require("child_process");
const path = require("path");

const PORT = 8162, B = `http://127.0.0.1:${PORT}`, EXEC = B + "/exec";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };
const wait = ms => new Promise(r => setTimeout(r, ms));

const srv = spawn(process.execPath, [path.join(__dirname, "ya-srv.cjs"), String(PORT), "NONE"], { stdio: "ignore" });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on("exit", bye); process.on("SIGINT", () => { bye(); process.exit(1); });

/* Every piece of every heading — words split at spaces and at soft hyphens,
   a piece before a soft hyphen measured WITH the hyphen it prints — against
   the width the cell gives its text. */
const headFit = sel => {
  const t = [...document.querySelectorAll(sel)].find(x => x.offsetParent);
  if (!t) return null;
  const pr = document.createElement("span"); document.body.appendChild(pr);
  const bad = [];
  t.querySelectorAll("thead th").forEach(th => {
    const cs = getComputedStyle(th);
    const avail = th.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    pr.style.cssText = `font:${cs.font};letter-spacing:${cs.letterSpacing};text-transform:${cs.textTransform};white-space:nowrap;position:absolute;visibility:hidden`;
    th.textContent.split(/\s+/).filter(Boolean).forEach(w => {
      const q = w.split("­");
      q.forEach((x, i) => { pr.textContent = i < q.length - 1 ? x + "-" : x;
        if (pr.getBoundingClientRect().width > avail + 0.5) bad.push(pr.textContent + " " + Math.round(pr.getBoundingClientRect().width) + ">" + Math.round(avail)); });
    });
  });
  pr.remove();
  return { n: t.querySelectorAll("thead th").length, bad };
};

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(EXEC); break; } catch (e) { await wait(250); } }
  const b = await chromium.launch();
  for (const file of ["dashboard/index.html", "dashboard-next/index.html"]) {
    for (const lang of ["en", "ru"]) {
      const tag = file.split("/")[0] + " " + lang;
      const ctx = await b.newContext({ viewport: { width: 1366, height: 950 } });
      await ctx.addInitScript(([url, l]) => { localStorage.setItem("cm_drive_url", url); localStorage.setItem("cm_dash_lang", l); }, [EXEC, lang]);
      const p = await ctx.newPage();
      const errs = [];
      p.on("pageerror", e => errs.push(e.message));
      await p.goto(B + "/" + file + "#lube", { waitUntil: "load" });
      await p.waitForFunction(() => window.CMLube && window.LUBE && window.CMDrive && CMDrive.configured(), null, { timeout: 20000 });
      await p.evaluate(() => lubeMasterLoad());
      await p.waitForFunction(() => ["none", "ready"].includes(CMLube.state().state), null, { timeout: 40000 });
      const go = async s => { await p.evaluate(s => { showTab("lube"); lubeGo(s); }, s); await p.waitForTimeout(250); };

      console.log(`\n${tag}: 1. HEADINGS BREAK BETWEEN WORDS, AND EVERY PIECE FITS ITS CELL`);
      await go("master");
      await p.evaluate(() => { CMLube._ui.model = "AT|Komatsu HM400-3MO"; CMLube.redraw(); });
      await p.waitForTimeout(150);
      for (const [sub, sel] of [["master", "#lmMaster table.lmx-mtbl"], ["decide", "#lmDecide table.lmx-dtbl"], ["oils", "#lmOils table.lmx-oils"]]) {
        await go(sub);
        const r = await p.evaluate(headFit, sel);
        ok(`${tag} ${sub}: ${r ? r.n : 0} headings read, none wider than its column`, r && r.n > 3 && r.bad.length === 0, r && r.bad.join(" · "));
        const ow = await p.evaluate(sel => getComputedStyle(document.querySelector(sel + " thead th")).overflowWrap, sel);
        ok(`${tag} ${sub}: a heading never breaks at an arbitrary letter`, ow === "normal", ow);
      }
      if (lang === "ru") {
        await go("master");
        const h = await p.evaluate(() => [...document.querySelectorAll("#lmMaster thead th")].map(t => t.textContent).join("|"));
        ok(`${tag}: "Заправка" carries its soft hyphen`, h.includes("Заправ­ка"), h.replace(/­/g, "~"));
      }

      console.log(`\n${tag}: 2. ONE HEIGHT FOR EVERY LUBE MASTER ROW`);
      await go("master");
      const hs = await p.evaluate(() => {
        const rows = [...document.querySelectorAll("#lmMaster table.lmx-mtbl tbody tr")];
        return { n: rows.length, flagged: rows.filter(r => r.querySelector(".lmx-flag")).length,
          h: [...new Set(rows.map(r => Math.round(r.getBoundingClientRect().height)))],
          inline: rows.filter(r => r.querySelector(".lmx-flag")).every(r => { const n = r.querySelector(".lmx-cn .lmx-1"), f = r.querySelector(".lmx-flag");
            return Math.abs(n.getBoundingClientRect().top + n.getBoundingClientRect().height / 2 - (f.getBoundingClientRect().top + f.getBoundingClientRect().height / 2)) < 4; }) };
      });
      ok(`${tag}: ${hs.n} rows, ${hs.flagged} with a flag, all one height`, hs.n > 5 && hs.flagged > 0 && hs.h.length === 1, hs.h.join(","));
      ok(`${tag}: the flag sits on the name's line`, hs.inline);

      console.log(`\n${tag}: 3. ONE LINE OF ANSWERS PER COMPARTMENT`);
      await go("decide");
      const d = await p.evaluate(() => {
        const rows = [...document.querySelectorAll("#lmDecide tr.lmx-dec")];
        const multi = rows.filter(r => r.querySelectorAll(".lmx-opt").length >= 3);
        const lines = r => new Set([...r.querySelectorAll(".lmx-opt")].map(o => Math.round(o.getBoundingClientRect().top))).size;
        return { n: rows.length, multi: multi.length, worst: Math.max(0, ...rows.map(lines)),
          h: [...new Set(rows.map(r => Math.round(r.getBoundingClientRect().height)))],
          titled: multi.every(r => [...r.querySelectorAll(".lmx-opt")].every(o => (o.title || "").length > 3)) };
      });
      ok(`${tag}: ${d.n} compartments, ${d.multi} with three answers, every answer on one line`, d.n > 10 && d.multi > 0 && d.worst === 1, "lines " + d.worst);
      ok(`${tag}: rows are one height`, d.h.length <= 2 && Math.max(...d.h) - Math.min(...d.h) <= 2, d.h.join(","));
      ok(`${tag}: every answer names its sources in the tooltip`, d.titled);

      console.log(`\n${tag}: 4. THE POSTER'S HEADINGS`);
      await go("shop");
      await p.evaluate(() => { const w = document.getElementById("lpoWhich"); w.value = "fleet"; w.dispatchEvent(new Event("change")); });
      await p.waitForTimeout(400);
      const ps = await p.evaluate(() => {
        const ths = [...document.querySelectorAll(".poster table.mtx thead tr:first-child th")];
        const html = ths.map(t => t.innerHTML).join("");
        const tips = [...document.querySelectorAll(".poster [title]")].map(e => e.title).join("");
        return { n: ths.length, shy: (html.match(/­/g) || []).length, wbr: /Гидравлич\.<wbr>/.test(html) || !/Гидравлич\./.test(html),
          diff: /Dif­fer­en­tial/i.test(html) || !/Differential/i.test(html.replace(/­/g, "")), tipShy: /­/.test(tips) };
      });
      ok(`${tag}: ${ps.n} compartment headings, the long words carry soft hyphens`, ps.n > 5 && ps.shy > 0, ps.shy);
      ok(`${tag}: "Differential" divides at its syllables`, ps.diff);
      ok(`${tag}: "Гидравлич.система" may break after its full stop`, ps.wbr);
      ok(`${tag}: no soft hyphen leaks into a tooltip`, !ps.tipShy);

      console.log(`\n${tag}: 5. WHAT A DESK HAS TYPED SURVIVES THE PAGE'S OWN REDRAW`);
      await go("master");
      await p.evaluate(() => { CMLube._ui.model = "AT|Komatsu HM400-3MO"; CMLube.redraw(); });
      const cap = '#lmMaster tr[data-lmxk="1"] input[data-f="cap"]';
      const cap0 = await p.inputValue(cap);
      await p.fill(cap, "77"); await p.focus(cap);
      await p.evaluate(() => CMLube.redraw());              /* what the 3-minute refresh does */
      ok(`${tag}: a capacity typed and not saved is still there after a redraw`, (await p.inputValue(cap)) === "77", await p.inputValue(cap));
      ok(`${tag}: and the box still has the keyboard`, await p.evaluate(s => document.activeElement === document.querySelector(s), cap));
      await p.selectOption('#lmMaster tr[data-lmxk="1"] select[data-f="g"]', { index: 2 });
      const g1 = await p.inputValue('#lmMaster tr[data-lmxk="1"] select[data-f="g"]');
      await p.evaluate(() => CMLube.redraw());
      ok(`${tag}: so is a grade chosen, and its swatch says so`, await p.evaluate(g => {
        const s = document.querySelector('#lmMaster tr[data-lmxk="1"] select[data-f="g"]');
        return s.value === g && (s.parentNode.querySelector(".lmx-sw") || {}).textContent.trim() === g; }, g1), g1);
      await p.click("#lmxUndoM");
      ok(`${tag}: Discard still puts the document's value back`, (await p.inputValue(cap)) === cap0, await p.inputValue(cap));
      await p.fill(cap, "78");
      await p.evaluate(() => { CMLube._ui.model = "HT|NHL TR60"; CMLube.redraw(); CMLube._ui.model = "AT|Komatsu HM400-3MO"; CMLube.redraw(); });
      ok(`${tag}: choosing another model starts that model clean`, (await p.inputValue(cap)) === cap0, await p.inputValue(cap));
      await go("decide");
      const note = "#lmDecide tr.lmx-dec .lmx-dnote";
      await p.fill(note, "asked the OEM");
      await p.evaluate(() => CMLube.redraw());
      ok(`${tag}: a decision note typed and not used survives too`, (await p.inputValue(note)) === "asked the OEM");

      console.log(`\n${tag}: 6. NO PAGE ERRORS`);
      ok(`${tag}: no page errors`, errs.length === 0, errs.slice(0, 3).join(" | "));
      await ctx.close();
    }
  }
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : "\nall passed");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
