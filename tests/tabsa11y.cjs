/* EVERY TABLIST ON BOTH SURFACES, AGAINST THE SAME FOUR RULES.

   From the acceptance brief, and they are the right four:

     · exactly one tab has aria-selected="true";
     · the selected tab matches the panel that is displayed;
     · each tab controls one LABELLED tab panel;
     · hidden panels are out of keyboard and screen-reader reach.

   Written generically — it finds the tablists rather than naming them — so a
   bar added next month is audited the day it appears rather than the day
   somebody remembers to add it here. Three existed when this was written and
   two of them failed:

     · the six schedule tabs carried role="tab" and nothing else. No
       aria-controls, so a screen reader announced "tab" and could not say what
       pressing it changed, and all six sat in the keyboard order, so Tab
       walked through six buttons where the pattern is one stop and the arrows;
     · the seven lubrication panels had role="tabpanel" and no name, which is
       announced as "tab panel" and nothing else.

   And one thing that is NOT a tablist and must not be made one: the phone's
   bottom bar is four screens, not four views of one thing, so it is a nav and
   says which screen is open with aria-current. It said so with a CSS class,
   which no screen reader reads.

   Run: node tests/tabsa11y.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require("./pw.cjs"));
const BASE = process.env.CMPORT ? "http://127.0.0.1:" + process.env.CMPORT : "http://127.0.0.1:8099";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };

const AUDIT = () => {
  /* ON SCREEN MEANS ON SCREEN, ANCESTORS INCLUDED. getComputedStyle(el).display
     is the element's OWN display and stays "block" inside a page section that
     is display:none — so a first pass at this reported both dashboard bars as
     visible on all nine pages and cheerfully audited hidden ones. offsetParent
     is null whenever anything above has taken the element out of the layout;
     the rect check covers position:fixed, which offsetParent does not. */
  const seen = el => {
    if (!el) return false;
    if (el.hidden || el.classList.contains("hidden")) return false;
    if (getComputedStyle(el).visibility === "hidden") return false;
    if (el.offsetParent !== null) return true;
    const r = el.getBoundingClientRect();
    return getComputedStyle(el).position === "fixed" && r.width > 0 && r.height > 0;
  };
  return [...document.querySelectorAll('[role="tablist"]')].map(tl => {
    const tabs = [...tl.querySelectorAll('[role="tab"]')];
    return {
      id: tl.id || tl.className,
      shown: seen(tl),
      label: tl.getAttribute("aria-label") || tl.getAttribute("aria-labelledby") || "",
      n: tabs.length,
      selected: tabs.filter(t => t.getAttribute("aria-selected") === "true").length,
      inOrder: tabs.filter(t => t.tabIndex >= 0).length,
      tabs: tabs.map(t => {
        const id = t.getAttribute("aria-controls");
        const el = id && document.getElementById(id);
        return {
          on: t.getAttribute("aria-selected") === "true",
          controls: id || "",
          exists: !!el,
          role: el ? el.getAttribute("role") : "",
          named: el ? !!(el.getAttribute("aria-labelledby") || el.getAttribute("aria-label")) : false,
          namePoints: el ? (() => { const r = el.getAttribute("aria-labelledby");
            return r ? !!document.getElementById(r) : true; })() : false,
          shown: el ? seen(el) : false,
          text: (t.textContent || "").replace(/\s+/g, " ").trim().slice(0, 22),
        };
      }),
    };
  });
};

/* One tablist, four rules. Returns the failures as sentences so a break says
   which bar and what about it, not just "false". */
function judge(tl) {
  const why = [];
  if (tl.selected !== 1) why.push("has " + tl.selected + " selected tabs, not one");
  if (!tl.label) why.push("has no accessible name");
  tl.tabs.forEach(t => {
    if (!t.controls) why.push('"' + t.text + '" controls nothing');
    else if (!t.exists) why.push('"' + t.text + '" controls #' + t.controls + ", which is not on the page");
    else {
      if (t.role !== "tabpanel") why.push('"' + t.text + '" points at something that is not a tabpanel');
      if (!t.named) why.push('the panel behind "' + t.text + '" has no name');
      if (!t.namePoints) why.push('the panel behind "' + t.text + '" is named by an element that does not exist');
      if (t.on && !t.shown) why.push('"' + t.text + '" is selected but its panel is not shown');
      if (!t.on && t.shown && tl.tabs.filter(x => x.controls === t.controls).length === 1)
        why.push('"' + t.text + '" is not selected but its panel is shown');
    }
  });
  /* One stop in the keyboard order. Six tabs is six Tab presses to get past a
     bar the arrow keys are meant to move within. */
  if (tl.inOrder !== 1) why.push(tl.inOrder + " of its tabs are in the keyboard order, not one");
  return why;
}

(async () => {
  const b = await chromium.launch();
  let audited = 0;

  console.log("1. THE OFFICE");
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const derr = []; p.on("pageerror", e => derr.push(e.message));
  await p.addInitScript(() => { localStorage.setItem("cm_drive_url", ""); localStorage.setItem("cm_dash_lang", "en"); });
  await p.goto(BASE + "/dashboard/index.html", { waitUntil: "load" }); await p.waitForTimeout(1800);
  await p.evaluate(() => { const ov = document.getElementById("dataOv"); if (ov) ov.classList.add("hidden"); });
  /* Every page, because a tablist only renders on the page it belongs to and
     one nobody opened is one nobody audited. */
  const pages = await p.evaluate(() => [...document.querySelectorAll("#tabs button[data-tab]")].map(b => b.dataset.tab));
  for (const k of pages) {
    await p.evaluate(k => showTab(k, true), k); await p.waitForTimeout(500);
    const list = (await p.evaluate(AUDIT)).filter(t => t.shown);
    list.forEach(tl => {
      audited++;
      const why = judge(tl);
      ok("on " + k + ", the " + tl.id + " bar (" + tl.n + " tabs) is a proper tablist",
         why.length === 0, why.join(" · ") || tl.tabs.filter(t => t.on).map(t => t.text).join(""));
    });
  }
  ok("every page was visited", pages.length >= 8, pages.length + " pages");
  ok("  and the bars on them were audited", audited >= 2, audited + " tablists");

  console.log("\n2. THE PAGE NAVIGATION IS A NAV, AND SAYS WHICH PAGE IS OPEN");
  const nav = await p.evaluate(() => {
    const n = document.getElementById("tabs");
    return { role: n.getAttribute("role"), label: n.getAttribute("aria-label"),
             buttons: n.querySelectorAll("button[data-tab]").length,
             current: [...n.querySelectorAll("[aria-current]")].map(b => b.dataset.tab),
             active: [...n.querySelectorAll("button.active")].map(b => b.dataset.tab) };
  });
  ok("it is not dressed up as a tablist", nav.role !== "tablist", nav.role || "no role — a nav");
  ok("  it has a name", !!nav.label, nav.label);
  ok("  and exactly one page is marked current, the one that is open",
     nav.current.length === 1 && nav.current[0] === nav.active[0],
     "current " + JSON.stringify(nav.current) + " · active " + JSON.stringify(nav.active));

  console.log("\n3. THE PHONE");
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    localStorage.setItem("up_dests", JSON.stringify([{ id: "gas", on: true, url: "http://127.0.0.1:9/exec" }]));
    localStorage.setItem("lang", "en");
  });
  const m = await ctx.newPage(); const merr = []; m.on("pageerror", e => merr.push(e.message));
  await m.goto(BASE + "/mobile/index.html", { waitUntil: "load" }); await m.waitForTimeout(2500);
  const steps = (await m.evaluate(AUDIT)).filter(t => t.shown);
  steps.forEach(tl => {
    const why = judge(tl);
    ok("the " + tl.id + " bar (" + tl.n + " tabs) is a proper tablist",
       why.length === 0, why.join(" · ") || tl.tabs.filter(t => t.on).map(t => t.text).join(""));
  });
  ok("the step bar was found", steps.length === 1, steps.length + " tablist(s)");

  /* The Due tab's List/This week segment only exists on paneDue and is
     genuine role="tablist" markup (not another nav dressed up), so the
     generic sweep finds it exactly the way it finds the dashboard's own
     bars above — the same reason this file audits by discovery instead of
     by name. Restored to paneCapture afterwards because section 4 below
     reads its "current" pane starting from rest. */
  await m.evaluate(() => showPane("paneDue")); await m.waitForTimeout(400);
  const dueTabs = (await m.evaluate(AUDIT)).filter(t => t.shown);
  dueTabs.forEach(tl => {
    const why = judge(tl);
    ok("the " + tl.id + " bar (" + tl.n + " tabs) is a proper tablist",
       why.length === 0, why.join(" · ") || tl.tabs.filter(t => t.on).map(t => t.text).join(""));
  });
  ok("the Due view segment was found", dueTabs.length === 1, dueTabs.length + " tablist(s)");
  await m.evaluate(() => showPane("paneCapture")); await m.waitForTimeout(200);

  console.log("\n4. AND THE DESTINATION BAR SAYS WHICH SCREEN IS OPEN");
  const bar = async () => m.evaluate(() => {
    const n = document.getElementById("tabbar");
    return { role: n.getAttribute("role"),
             current: [...n.querySelectorAll("[aria-current]")].map(b => b.dataset.pane),
             on: [...n.querySelectorAll("button.on")].map(b => b.dataset.pane) };
  });
  const b0 = await bar();
  ok("four screens are a nav, not a tablist", b0.role !== "tablist", b0.role || "no role — a nav");
  ok("  one destination is current at rest", b0.current.length === 1 && b0.current[0] === b0.on[0],
     JSON.stringify(b0));
  for (const dest of ["paneQueue", "paneDue", "paneSystem", "paneCapture"]) {
    await m.evaluate(d => showPane(d), dest); await m.waitForTimeout(200);
    const s = await bar();
    ok("  moving to " + dest + " moves it", s.current.length === 1 && s.current[0] === dest, JSON.stringify(s.current));
  }

  ok("no page errors on either surface", derr.length === 0 && merr.length === 0,
     [...derr, ...merr].slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
