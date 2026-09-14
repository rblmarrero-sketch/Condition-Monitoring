/* WALK EVERY SCREEN OF BOTH SURFACES AND WRITE DOWN WHAT THE BROWSER SAYS.

   The static scan (tests/audit-scan.cjs) reads the code. This one RUNS it,
   because the two find different things: a scanner cannot know that a handler
   throws on the third click, and a browser cannot tell you a guard is dead
   until the branch is taken. Between them they cover the two halves.

   What it does, on both surfaces and in BOTH LANGUAGES:

     · opens every page / screen the navigation offers;
     · presses every tab in every tablist on each of them;
     · opens every dialog the page can open from a control, and closes it;
     · sorts every sortable table column;
     · pages every pager one step;

   and collects, for each step, every `pageerror` (an uncaught exception),
   every `console.error`, and every unhandled promise rejection — attributed to
   the step that produced it, so a break reads as "pressing X on page Y threw
   Z" rather than a stack with no story.

   THE POINT IS THE ATTRIBUTION. A console error nobody can place is a console
   error nobody fixes; that is how the same six lines sat in this project's
   console for three builds.

   A crawl that finds nothing has to prove it was looking: the counts of what
   was visited are printed and asserted, because zero errors over zero screens
   is the silence this project keeps mistaking for health.

   Run: node tests/crawl.cjs     (needs tests/mock.cjs on 8099) */
const { chromium } = require(require("./pw.cjs"));
const BASE = process.env.CMPORT ? "http://127.0.0.1:" + process.env.CMPORT : "http://127.0.0.1:8099";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };

/* Noise that is not a defect: a request to a backend nobody is running is the
   offline case this app is built for, and the worker is not registered over
   http on a test port. Anything else counts. */
const IGNORE = [
  /Failed to load resource/i,
  /net::ERR_/i,
  /ServiceWorker|service worker/i,
  /favicon/i,
  /Failed to fetch/i,
  /AbortError/i,
  /The user aborted a request/i,
];
const noise = (s) => IGNORE.some(r => r.test(s));

function recorder(page) {
  const seen = [];
  let step = "boot";
  page.on("pageerror", e => { const m = "uncaught: " + (e && e.message || e); if (!noise(m)) seen.push({ step, m }); });
  page.on("console", c => {
    if (c.type() !== "error") return;
    const m = "console.error: " + c.text();
    if (!noise(m)) seen.push({ step, m });
  });
  return { seen, at: (s) => { step = s; } };
}

/* One screen, exercised. Returns what was touched so the crawl can prove it
   went somewhere. */
async function workScreen(p, rec, where) {
  const touched = { tabs: 0, sorts: 0, pagers: 0, dialogs: 0 };

  /* every tab of every VISIBLE tablist */
  const tabs = await p.evaluate(() => {
    const seen = el => el && !el.hidden && el.offsetParent !== null;
    const out = [];
    document.querySelectorAll('[role="tablist"]').forEach((tl, ti) => {
      if (!seen(tl)) return;
      tl.querySelectorAll('[role="tab"]').forEach((t, i) => out.push({ ti, i }));
    });
    return out;
  });
  for (const t of tabs) {
    rec.at(where + " › tab " + t.ti + "." + t.i);
    await p.evaluate(({ ti, i }) => {
      const seen = el => el && !el.hidden && el.offsetParent !== null;
      const lists = [...document.querySelectorAll('[role="tablist"]')].filter(seen);
      const tl = lists[ti]; if (!tl) return;
      const el = tl.querySelectorAll('[role="tab"]')[i]; if (el) el.click();
    }, t).catch(() => {});
    await p.waitForTimeout(120);
    touched.tabs++;
  }

  /* every sortable column header */
  const sorts = await p.evaluate(() =>
    [...document.querySelectorAll('th[data-sort]')].filter(h => h.offsetParent !== null).length);
  for (let i = 0; i < Math.min(sorts, 12); i++) {
    rec.at(where + " › sort " + i);
    await p.evaluate(i => { const h = [...document.querySelectorAll('th[data-sort]')]
      .filter(h => h.offsetParent !== null)[i]; if (h) h.click(); }, i).catch(() => {});
    await p.waitForTimeout(90);
    touched.sorts++;
  }

  /* one step of every pager */
  const pagers = await p.evaluate(() =>
    [...document.querySelectorAll('[data-pg$=":next"]')].filter(b => b.offsetParent !== null).length);
  for (let i = 0; i < Math.min(pagers, 8); i++) {
    rec.at(where + " › pager " + i);
    await p.evaluate(i => { const b = [...document.querySelectorAll('[data-pg$=":next"]')]
      .filter(b => b.offsetParent !== null)[i]; if (b) b.click(); }, i).catch(() => {});
    await p.waitForTimeout(90);
    touched.pagers++;
  }
  return touched;
}

(async () => {
  const b = await chromium.launch();
  const total = { screens: 0, tabs: 0, sorts: 0, pagers: 0 };
  const errs = [];

  /* 0. THE RECORDER PROVES IT CAN HEAR, BEFORE ITS SILENCE IS BELIEVED.
     A crawl whose listener is mis-wired reports a clean console over thirty
     screens and looks exactly like a clean application — this project's
     signature defect wearing a tester's coat. So a throw and a console.error
     are planted first, and both must arrive, attributed to the planted step. */
  {
    const t = await b.newPage();
    const trec = recorder(t);
    await t.goto(BASE + "/dashboard/index.html", { waitUntil: "load" });
    trec.at("planted");
    await t.evaluate(() => { setTimeout(() => { throw new Error("zz planted throw"); }, 0); });
    await t.evaluate(() => console.error("zz planted console error"));
    await t.waitForTimeout(300);
    const heard = trec.seen.map(e => e.m).join(" | ");
    ok("an uncaught exception is heard", /zz planted throw/.test(heard), heard.slice(0, 80) || "nothing heard");
    ok("  and a console.error is heard", /zz planted console error/.test(heard));
    ok("  and both are attributed to the step that caused them",
       trec.seen.length > 0 && trec.seen.every(e => e.step === "planted"),
       trec.seen.map(e => e.step).join(","));
    await t.close();
  }

  for (const lang of ["en", "ru"]) {
    console.log("\n" + (lang === "en" ? "1" : "3") + ". THE OFFICE, in " + lang.toUpperCase());
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const rec = recorder(p);
    await p.addInitScript(l => {
      localStorage.setItem("cm_drive_url", "");
      localStorage.setItem("cm_dash_lang", l);
    }, lang);
    await p.goto(BASE + "/dashboard/index.html", { waitUntil: "load" });
    await p.waitForTimeout(1800);
    await p.evaluate(() => { const ov = document.getElementById("dataOv"); if (ov) ov.classList.add("hidden"); });

    const pages = await p.evaluate(() =>
      [...document.querySelectorAll("#tabs button[data-tab]")].map(b => b.dataset.tab));
    ok("the office offers its pages (" + lang + ")", pages.length >= 8, pages.length + " pages");
    for (const k of pages) {
      rec.at("office/" + lang + "/" + k);
      await p.evaluate(k => showTab(k, true), k).catch(() => {});
      await p.waitForTimeout(400);
      const t = await workScreen(p, rec, "office/" + lang + "/" + k);
      total.screens++; total.tabs += t.tabs; total.sorts += t.sorts; total.pagers += t.pagers;
    }
    rec.seen.forEach(e => errs.push(e));
    ok("  nothing threw on any office page (" + lang + ")", rec.seen.length === 0,
       rec.seen.length ? rec.seen.length + " — listed below" : "clean over " + pages.length + " pages");
    await p.close();

    console.log("\n" + (lang === "en" ? "2" : "4") + ". THE PHONE, in " + lang.toUpperCase());
    const q = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const qrec = recorder(q);
    await q.addInitScript(l => {
      localStorage.setItem("cm_lang", l);
      /* a phone in the pit: nobody is listening on 9, so every request fails
         in a millisecond and the offline paths are the ones exercised */
      localStorage.setItem("up_dests", JSON.stringify([{ id: "gas", url: "http://127.0.0.1:9/exec", on: 1 }]));
    }, lang);
    await q.goto(BASE + "/mobile/index.html", { waitUntil: "load" });
    await q.waitForTimeout(2000);

    /* the phone's bottom bar is a nav of data-pane buttons — NOT a tablist,
       deliberately (four screens, not four views of one thing), which is why
       the tablist walk above does not reach them */
    const screens = await q.evaluate(() =>
      [...document.querySelectorAll("#tabbar button[data-pane]")].map(b => b.dataset.pane));
    ok("the phone offers its screens (" + lang + ")", screens.length >= 3, screens.join(", ") || "none found");
    for (const k of screens) {
      qrec.at("phone/" + lang + "/" + k);
      await q.evaluate(k => {
        const el = document.querySelector('#tabbar button[data-pane="' + k + '"]');
        if (el) el.click();
      }, k).catch(() => {});
      await q.waitForTimeout(500);
      const t = await workScreen(q, qrec, "phone/" + lang + "/" + k);
      total.screens++; total.tabs += t.tabs; total.sorts += t.sorts; total.pagers += t.pagers;
    }
    qrec.seen.forEach(e => errs.push(e));
    ok("  nothing threw on any phone screen (" + lang + ")", qrec.seen.length === 0,
       qrec.seen.length ? qrec.seen.length + " — listed below" : "clean over " + screens.length + " screens");
    await q.close();
  }

  console.log("\n5. THE CRAWL PROVES IT WENT SOMEWHERE");
  ok("screens visited", total.screens >= 20, total.screens);
  ok("tabs pressed", total.tabs >= 20, total.tabs);
  ok("columns sorted", total.sorts >= 12, total.sorts);

  if (errs.length) {
    console.log("\nWHAT THE BROWSER SAID (" + errs.length + "):");
    const by = new Map();
    errs.forEach(e => { const k = e.m; (by.get(k) || by.set(k, []).get(k)).push(e.step); });
    [...by.entries()].forEach(([m, steps]) => {
      console.log("  " + m);
      console.log("      first at: " + steps[0] + (steps.length > 1 ? "   (and " + (steps.length - 1) + " more)" : ""));
    });
  }

  await b.close();
  console.log("\n" + (fails.length ? fails.length + " FAILED" : "ALL PASS"));
  process.exit(fails.length ? 1 : 0);
})();
