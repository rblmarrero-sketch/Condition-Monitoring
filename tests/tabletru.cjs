/* RUSSIAN, ON A TABLET.

   Two things this project has already been caught by, together, because
   together is where they bite.

   Russian is longer. "Требуется внимание" is half again the width of
   "Attention", "Создать уведомление 1С - планировать ремонт" is four times
   "Schedule repair", and the overview table once ran 180 px past a 1366
   screen for exactly that reason — in English it fitted, so nobody saw it.

   A tablet is narrower. The office reads this on a Surface in a portacabin
   at 768 across, and a planner turns it landscape to 1024. Neither width is
   the 1366 or 1440 every other suite measures, and neither is a phone, so
   the mobile layout does not apply either.

   zoom200.cjs covers the narrow end — 683 and 960 — in English. This covers
   the tablet widths in RUSSIAN, on every page of the office and on the phone,
   and asks the questions that catch the failure above:

     · the page never scrolls sideways;
     · no element sticks out past the right edge of the window;
     · no line of text is cut off inside its own box — a label that cannot
       wrap and does not fit is a label that lies about what it says;
     · every control of the page header and toolbar is reachable;
     · text stays readable.

   Run: node tests/tabletru.cjs       (needs tests/mock.cjs on 8099) */
const { chromium } = require(require("./pw.cjs"));
const BASE = process.env.CMPORT ? "http://127.0.0.1:" + process.env.CMPORT : "http://127.0.0.1:8099";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };
const reset = q => fetch(BASE + "/__reset?" + q).then(r => r.text());

/* What "cut off" means, measured rather than eyeballed.

   An element whose text cannot wrap and whose scrollWidth exceeds its own box
   is printing fewer characters than it holds — the end of the word is simply
   not there. Four pixels of slack, because sub-pixel text metrics round
   differently per font and a one-pixel overhang is not a clipped word.

   Two things are deliberately not defects and are excluded below: anything
   inside a container the browser will scroll sideways (a wide table in an
   overflow-x wrapper is doing its job), and a one-pixel box holding a word,
   which is a label for a screen reader and the opposite of a defect. Both
   exclusions make the scan quieter, so section 0 proves it can still see. */
const SCAN = ([w]) => {
  /* ASK THE LAYOUT, NOT A LIST OF CLASS NAMES. A first pass named the
     containers it knew about and missed the ones it did not, so a count badge
     inside a segment bar that scrolls horizontally was reported as hanging off
     the page. Anything under an element the browser will scroll sideways is
     doing what it was built to do. */
  const inScroller = el => {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX;
      if (o === "auto" || o === "scroll") return true;
    }
    return false;
  };
  /* A box one pixel wide holding a word is not clipped text — it is a label
     for a screen reader, which is the opposite of a defect. */
  const offscreenLabel = el => el.clientWidth <= 2 || !!el.closest(".vh,[hidden],[aria-hidden=true]")
    || el.classList.contains("vh");
  const vis = el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.offsetParent !== null;
  };
  const clipped = [], past = [];
  document.querySelectorAll("body *").forEach(el => {
    if (!vis(el)) return;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    /* Past the right edge of the window. A fixed bar that hangs off screen is
       a control nobody can press. */
    if (r.right > w + 1 && !inScroller(el) && !offscreenLabel(el)
        && cs.position !== "fixed" && el.children.length === 0)
      past.push((el.tagName + "." + (el.className || "")).slice(0, 40) + " right=" + Math.round(r.right)
        + ' "' + (el.textContent || "").trim().slice(0, 24) + '"');
    /* Cut off inside its own box. */
    if (cs.whiteSpace === "nowrap" && !inScroller(el) && !offscreenLabel(el)
        && el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0
        && cs.overflow !== "visible" && cs.textOverflow !== "ellipsis")
      clipped.push((el.tagName + "." + (el.className || "")).slice(0, 40)
        + " " + el.scrollWidth + ">" + el.clientWidth
        + ' "' + (el.textContent || "").trim().slice(0, 24) + '"');
  });
  const tiny = [...document.querySelectorAll("body *")].filter(el => {
    if (!vis(el) || el.children.length) return false;
    const t = (el.textContent || "").trim();
    if (t.length < 3) return false;
    return parseFloat(getComputedStyle(el).fontSize) < 10.5;
  }).map(el => (el.className || el.tagName) + ' "' + (el.textContent || "").trim().slice(0, 18) + '"');
  return {
    docW: document.documentElement.scrollWidth,
    winW: window.innerWidth,
    past: past.slice(0, 6), pastN: past.length,
    clipped: clipped.slice(0, 6), clippedN: clipped.length,
    tiny: tiny.slice(0, 4), tinyN: tiny.length,
  };
};

async function office(b, w, h) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem("cm_drive_url", u); localStorage.setItem("cm_drive_sec", "");
    localStorage.setItem("cm_drive_cursor", "0"); localStorage.setItem("cm_swap_off", "1");
    localStorage.setItem("cm_dash_lang", "ru"); localStorage.setItem("cm_dash_who", "Планировщик");
  }, BASE + "/exec");
  await p.goto(BASE + "/dashboard/index.html", { waitUntil: "load" });
  await p.waitForFunction(() => typeof RECS !== "undefined" && RECS.length > 5, null, { timeout: 90000 });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const ov = document.getElementById("dataOv"); if (ov) ov.classList.add("hidden"); });
  return { p, errs };
}

(async () => {
  await reset("n=70");
  const b = await chromium.launch();

  console.log("0. THE SCAN CAN STILL SEE");
  /* Two exclusions were added to this detector after its first run reported
     fifteen failures that were all screen-reader labels and a scrolling
     segment bar. A loosened detector that then reports "clean" everywhere has
     to prove it is looking: two faults are put on the page on purpose and it
     has to find both, and find nothing once they are gone. */
  {
    const { p } = await office(b, 1024, 768);
    const probe = await p.evaluate(async ([w]) => {
      const d = document.createElement("div");
      d.innerHTML = '<div id="cmOver" style="position:absolute;left:' + (w - 20) + 'px;top:40px;'
        + 'width:300px;white-space:nowrap">Уведомление о ремонте</div>'
        + '<div id="cmClip" style="width:40px;overflow:hidden;white-space:nowrap">'
        + 'Создать уведомление 1С — планировать ремонт</div>';
      document.body.appendChild(d);
      await new Promise(r => requestAnimationFrame(r));
      window.__probe = d;
      return true;
    }, [1024]);
    const dirty = await p.evaluate(SCAN, [1024]);
    await p.evaluate(() => { window.__probe.remove(); });
    const clean = await p.evaluate(SCAN, [1024]);
    ok("it finds an element hanging off the right edge",
       dirty.past.some(x => /cmOver|Уведомление о ремонте/.test(x)), dirty.past.join(" · ") || "found nothing");
    ok("  and a label cut off inside its own box",
       dirty.clipped.some(x => /планировать ремонт|Создать/.test(x)), dirty.clipped.join(" · ") || "found nothing");
    ok("  and says nothing once they are taken away",
       clean.pastN === 0 && clean.clippedN === 0,
       [...clean.past, ...clean.clipped].join(" · ") || "clean");
    await p.close();
  }

  for (const [w, h, what] of [[768, 1024, "a tablet held upright"], [1024, 768, "and turned on its side"]]) {
    console.log("\n" + w + "×" + h + " — " + what);
    const { p, errs } = await office(b, w, h);
    const lang = await p.evaluate(() => document.documentElement.lang || (typeof lang !== "undefined" ? lang : ""));
    ok("the office is in Russian", /ru/.test(lang) || await p.evaluate(() =>
      /[А-Яа-яЁё]/.test(document.querySelector("#tabs button span").textContent)), lang);
    const pages = await p.evaluate(() => [...document.querySelectorAll("#tabs button[data-tab]")].map(x => x.dataset.tab));
    let worstPast = 0, worstClip = 0, worstTiny = 0, wideOn = [];
    for (const k of pages) {
      await p.evaluate(k => showTab(k, true), k);
      await p.waitForTimeout(450);
      const s = await p.evaluate(SCAN, [w]);
      if (s.docW > s.winW + 1) wideOn.push(k + " (" + s.docW + ">" + s.winW + ")");
      if (s.pastN > worstPast) { worstPast = s.pastN; }
      if (s.clippedN > worstClip) { worstClip = s.clippedN; }
      if (s.tinyN > worstTiny) { worstTiny = s.tinyN; }
      ok("  " + k + ": nothing past the right edge, nothing cut off",
         s.pastN === 0 && s.clippedN === 0,
         [...s.past, ...s.clipped].join(" · ") || "clean");
    }
    ok("no page scrolls sideways", wideOn.length === 0, wideOn.join(", ") || "none of " + pages.length);
    ok("  and no text is under 10.5px anywhere", worstTiny === 0, String(worstTiny));

    /* The page header and toolbar are the controls a planner reaches for
       first; if Russian pushes one off the edge it is gone at this width. */
    const bar = await p.evaluate(([w]) => {
      showTab("actions", true);
      const out = [];
      document.querySelectorAll(".pagehd *, .controls *").forEach(el => {
        if (!el.offsetParent || el.children.length) return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > w + 1 || r.left < -1))
          out.push((el.className || el.tagName) + " " + Math.round(r.left) + ".." + Math.round(r.right));
      });
      return out;
    }, [w]);
    ok("every control of the header and toolbar is on screen", bar.length === 0, bar.slice(0, 4).join(" · ") || "all inside");
    ok("no page errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "none");
    await p.close();
  }

  console.log("\nTHE PHONE, IN RUSSIAN, ON A TABLET-SIZED SCREEN");
  /* The phone layout is used on a tablet too — an inspector's spare device, a
     supervisor reading a round at their desk — and it is the one that was
     rebuilt into steps, so it is the one most likely to have a width nobody
     tried. */
  for (const [w, h] of [[768, 1024], [1024, 768]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true });
    await ctx.addInitScript(u => {
      localStorage.setItem("up_dests", JSON.stringify([{ id: "gas", on: true, url: u, sec: "", folder: "" }]));
      localStorage.setItem("cm_swap_off", "1"); localStorage.setItem("lang", "ru");
    }, BASE + "/exec");
    const m = await ctx.newPage(); const errs = []; m.on("pageerror", e => errs.push(e.message));
    await m.goto(BASE + "/mobile/index.html", { waitUntil: "load" });
    await m.waitForTimeout(2500);
    const ru = await m.evaluate(() => /[А-Яа-яЁё]/.test(document.querySelector("#tabbar button span:last-child").textContent));
    ok(w + "×" + h + ": the phone is in Russian", ru);
    for (const pane of ["paneCapture", "paneDue", "paneQueue", "paneSystem"]) {
      await m.evaluate(d => showPane(d), pane); await m.waitForTimeout(350);
      const s = await m.evaluate(SCAN, [w]);
      ok("  " + pane + ": nothing past the right edge, nothing cut off",
         s.pastN === 0 && s.clippedN === 0 && s.docW <= s.winW + 1,
         [...s.past, ...s.clipped].join(" · ") || (s.docW > s.winW + 1 ? "scrolls sideways " + s.docW + ">" + s.winW : "clean"));
    }
    ok("  no page errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "none");
    await ctx.close();
  }

  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
