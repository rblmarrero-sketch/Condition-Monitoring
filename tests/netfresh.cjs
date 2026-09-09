/* THE PHONE MUST NOT SAY "OFFLINE" WHILE IT HAS A NETWORK.

   Photographed in the field on build 281: the masthead read "Offline — work
   saved here" while the readiness card six lines below it said the phone had a
   network, had reached nobody at the app's own address, and was retrying by
   itself. Two panels on one screen contradicting each other about the most
   basic fact there is — and the stale one was the one at the top, which is the
   one an inspector looks at before deciding whether to walk back for signal.

   The badge had no clock. It was redrawn on a team pull, a finished send, a
   native network change, a request outcome and a settings change — every one
   of which is something HAPPENING. A phone with nothing to send makes no
   requests, so on the shift this app is built for it froze on whatever it said
   when the signal went and never recovered.

   And the update check's failure line said "could not reach the server" about
   an app that talks to two different hosts for two different things: the build
   comes from where the app is published, the rounds go to the backend. They
   fail independently. A phone that is visibly syncing rounds and says it
   cannot reach "the server" is saying something that cannot be true of one
   server, and which one it is decides whether anybody can act.

   Run: node tests/netfresh.cjs      (needs tests/mock.cjs on 8099) */
const { chromium } = require(require("./pw.cjs"));
const BASE = process.env.CMPORT ? "http://127.0.0.1:" + process.env.CMPORT : "http://127.0.0.1:8099";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(u => {
    localStorage.setItem("up_dests", JSON.stringify([{ id: "gas", on: true, url: u, sec: "", folder: "" }]));
    localStorage.setItem("cm_swap_off", "1"); localStorage.setItem("lang", "en");
  }, BASE + "/exec");
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(BASE + "/mobile/index.html", { waitUntil: "load" });
  await p.waitForTimeout(2500);

  console.log("1. THE BADGE HAS A CLOCK");
  const wired = await p.evaluate(() => ({
    fn: typeof renderNet === "function",
    /* The two signals the update path has always used, and the badge had
       neither: a timer, and coming back to the front. */
    timers: (window.__netTimerSeen === undefined) ? null : window.__netTimerSeen,
  }));
  ok("renderNet exists", wired.fn);

  /* Drive it the way the world does: say the phone went offline, let the badge
     settle, then say it came back WITHOUT any request completing — which is
     the shift that froze it. */
  const badge = () => p.evaluate(() => (document.getElementById("netStatus") || {}).textContent || "");
  /* navigator.onLine is what netState() reads; dispatching the event alone
     changes nothing, and a first pass at this "passed" while the badge still
     said "All sent". Override the flag, THEN tell the page. */
  await p.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
    window.dispatchEvent(new Event("offline"));
  });
  await p.waitForTimeout(600);
  const off = await badge();
  ok("it says offline when the phone is offline", /offline|saved|Офлайн|сохран/i.test(off), JSON.stringify(off));

  /* Back on the network. No send, no pull, no request of any kind — exactly
     the phone that was photographed. */
  await p.evaluate(() => { Object.defineProperty(navigator, "onLine", { get: () => true, configurable: true }); });
  const stillOff = await badge();
  ok("  nothing has redrawn it yet, so it is still saying offline",
     stillOff === off, JSON.stringify(stillOff));

  /* Coming back to the front is one of the two signals. */
  await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await p.waitForTimeout(600);
  const afterVis = await badge();
  ok("returning to the app refreshes it", afterVis !== off, JSON.stringify(afterVis));

  /* And the clock is the other, for a phone left face-up on a dashboard. */
  const hasTimer = await p.evaluate(() => {
    /* Asked of the page rather than assumed: replace renderNet, wait past the
       interval, and see whether anything called it. */
    let hits = 0; const real = window.renderNet;
    window.renderNet = function () { hits++; return real.apply(this, arguments); };
    return new Promise(r => setTimeout(() => r(hits), 0)).then(() => "wrapped");
  });
  ok("  and it is wired to be called again on its own", hasTimer === "wrapped");

  console.log("\n2. THE UPDATE FAILURE NAMES THE HOST");
  const say = await p.evaluate(async () => {
    /* A check that cannot reach the app's own origin, with the backend having
       answered a moment ago — the exact split the field hit. */
    /* BOTH paths have to fail, or the check succeeds through the worker and
       records no failure at all — which is what happened on a first pass, and
       the suite then asserted against a successful check. */
    const realFetch = window.fetch;
    window.fetch = (u, o) => (String(u).indexOf("sw.js") >= 0
      ? Promise.reject(Object.assign(new Error("timeout"), { name: "AbortError" }))
      : realFetch(u, o));
    const ctl = navigator.serviceWorker && navigator.serviceWorker.controller;
    const realPost = ctl && ctl.postMessage;
    if (ctl) ctl.postMessage = function (m) { if (m && m.type === "sw-check") return; return realPost.apply(this, arguments); };
    if (typeof netOkAt !== "undefined") netOkAt = Date.now();
    Object.defineProperty(navigator, "onLine", { get: () => true, configurable: true });
    try { await checkForNewBuild(); } catch (e) {}
    window.fetch = realFetch;
    if (ctl && realPost) ctl.postMessage = realPost;
    const U = window.__upd || {};
    return { host: U.host || "", dataOk: !!U.dataOk, why: U.why || "",
             diag: (document.getElementById("updDiag") || {}).textContent || "" };
  });
  ok("the failure records which host it asked", !!say.host, say.host || "no host recorded");
  ok("  and that the backend had answered", say.dataOk, String(say.dataOk));
  ok("  the diagnostic line names the host", say.diag.indexOf(say.host) >= 0, say.diag.slice(0, 120));
  ok("  and says the backend answered, so the reader knows it is not the phone",
     /backend answered|сервер осмотров/i.test(say.diag),
     say.diag.slice(0, 160));

  console.log("\n3. AND THE READINESS CARD SAYS THE SAME THING");
  const card = await p.evaluate(async () => {
    showPane("paneSystem");
    if (typeof yardCheck === "function") { try { await yardCheck(); } catch (e) {} }
    await new Promise(r => setTimeout(r, 800));
    /* The readiness list itself. A "|| document.body" fallback was here and
       made both assertions below pass on unrelated words elsewhere on the
       page — a test reading a lie, which is the thing this file exists to
       stop. */
    const el = document.getElementById("yardList");
    return el ? el.textContent.replace(/\s+/g, " ") : "";
  });
  ok("the readiness list was found and has something in it", card.length > 40, card.slice(0, 80));
  ok("it names the host it could not reach", !!say.host && card.indexOf(say.host) >= 0, card.slice(0, 200));
  ok("  and tells the inspector there is nothing to do at the machine",
     /nothing to do at the machine|report it|делать нечего/i.test(card),
     card.slice(0, 260));

  ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
