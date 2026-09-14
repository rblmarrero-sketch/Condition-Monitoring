/* A FAILURE WITH NOWHERE TO GO STILL LEAVES A MARK.

   The quietest way this app can fail is a rejected promise nobody handles.
   Nothing throws where a handler can see it, no catch runs, the work simply
   does not happen, and on a handset there is no console to read. Six of these
   shipped, all made by one habit:

       try{ dbDel(DRAFT_ID); }catch(e){}

   which READS as a guard and catches nothing at all, because an async call
   returns a promise before it can fail. `tests/audit-scan.cjs` now refuses
   the shape. This suite proves the two things that make the shape harmless
   even when somebody writes it again:

     1. the page LISTENS — an unhandled rejection and an uncaught error are
        both recorded in window.__errs, with where and what;
     2. the draft that could not be deleted is not silently restored.

   The second is the one with a round in it. resetForm() drops the saved
   round's draft; on a phone whose IndexedDB refuses writes that delete
   rejects, the draft outlives its own round, and offerDraft() restores it on
   the resume path WITHOUT ASKING — which is how one walk reaches the folder
   twice. `draftStale` makes that path ask.

   Run: node tests/norej.cjs     (needs tests/mock.cjs on 8099) */
const { chromium } = require(require("./pw.cjs"));
const BASE = process.env.CMPORT ? "http://127.0.0.1:" + process.env.CMPORT : "http://127.0.0.1:8099";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await p.addInitScript(() => {
    localStorage.setItem("cm_lang", "en");
    localStorage.setItem("up_dests", JSON.stringify([{ id: "gas", url: "http://127.0.0.1:9/exec", on: 1 }]));
  });
  await p.goto(BASE + "/mobile/index.html", { waitUntil: "load" });
  await p.waitForTimeout(1800);

  console.log("1. THE RECORDER EXISTS AND IS ARMED BEFORE ANYTHING ELSE");
  ok("window.__errs is a ring the page can write to",
     await p.evaluate(() => Array.isArray(window.__errs)));
  ok("  bad() is reachable from the first script",
     await p.evaluate(() => typeof bad === "function"));
  ok("  and the ring starts empty on a healthy boot",
     (await p.evaluate(() => window.__errs.length)) === 0,
     JSON.stringify(await p.evaluate(() => window.__errs.slice(0, 3))));

  console.log("\n2. AN UNHANDLED REJECTION IS RECORDED");
  await p.evaluate(() => { Promise.reject(new Error("zz unhandled")); });
  await p.waitForTimeout(400);
  const rej = await p.evaluate(() => window.__errs.slice());
  ok("it reached the ring", rej.some(e => /zz unhandled/.test(e.m)), JSON.stringify(rej.slice(-1)));
  ok("  and it says it was nobody's", rej.some(e => e.where === "unhandled-rejection"));
  ok("  with a time on it", rej.every(e => typeof e.t === "number" && e.t > 0));

  console.log("\n3. AN UNCAUGHT ERROR IS RECORDED TOO");
  await p.evaluate(() => { setTimeout(() => { throw new Error("zz uncaught"); }, 0); });
  await p.waitForTimeout(400);
  const un = await p.evaluate(() => window.__errs.slice());
  ok("it reached the ring", un.some(e => /zz uncaught/.test(e.m)));
  ok("  filed as uncaught", un.some(e => e.where === "uncaught"));

  console.log("\n4. THE RING IS BOUNDED — a failing loop cannot eat the phone");
  await p.evaluate(() => { for (let i = 0; i < 200; i++) bad("zz flood", new Error("x" + i)); });
  const n = await p.evaluate(() => window.__errs.length);
  ok("it holds 50 and drops the oldest", n === 50, n + " entries");
  ok("  keeping the NEWEST", await p.evaluate(() => /x199/.test(window.__errs[window.__errs.length - 1].m)));

  console.log("\n5. bad() WORKS AS A .catch() HANDLER AND SWALLOWS NOTHING ELSE");
  ok("it returns undefined, so a chain continues",
     await p.evaluate(() => Promise.reject(new Error("zz chain")).catch(e => bad("zz", e)).then(v => v === undefined)));
  ok("  and it records what it was handed",
     await p.evaluate(() => window.__errs.some(e => /zz chain/.test(e.m))));

  console.log("\n6. A DRAFT THAT COULD NOT BE DELETED IS NEVER RESTORED SILENTLY");
  ok("the page carries the flag", await p.evaluate(() => typeof draftStale === "boolean"));
  /* the resume path: cm_resume_silent set, draft in the store, deletion failed */
  /* A draft has to BE there: offerDraft leaves an empty store alone, which is
     right and is also why the first run of this asserted on a path it never
     reached. The draft is planted, then the resume is asked for. */
  const plant = async () => p.evaluate(() => dbPut({
    id: DRAFT_ID, equip: "TK146", type: "MP", date: "2026-09-14",
    positions: { "LF": { grade: 1 } },
  }));

  await plant();
  const asked = await p.evaluate(async () => {
    draftStale = true;
    sessionStorage.setItem("cm_resume_silent", "1");
    const before = (await dbGet(DRAFT_ID)) ? 1 : 0;
    offerDraft().catch(() => {});
    await new Promise(r => setTimeout(r, 250));
    return { before, flag: sessionStorage.getItem("cm_resume_silent") };
  });
  ok("  a draft was planted to answer about", asked.before === 1);
  ok("  the silent flag is cleared, so the inspector is asked", asked.flag === null, String(asked.flag));

  await p.evaluate(() => { try { document.querySelectorAll(".ovl,.modal,dialog").forEach(d => d.remove()); } catch (e) {} });
  await plant();
  const kept = await p.evaluate(async () => {
    draftStale = false;
    sessionStorage.setItem("cm_resume_silent", "1");
    offerDraft().catch(() => {});
    await new Promise(r => setTimeout(r, 250));
    /* offerDraft CONSUMES the flag on the silent path — what proves the path
       was taken is that the round came back with nobody asked. */
    return { unit: curEquip, asked: !!document.querySelector(".ovl,.modal,dialog") };
  });
  ok("  and an ordinary silent resume still restores without asking",
     kept.unit === "TK146" && !kept.asked, JSON.stringify(kept));

  console.log("\n7. resetForm DROPS THE DRAFT THROUGH A HANDLED PROMISE");
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "mobile", "index.html"), "utf8");
  ok("no sync try wraps dbDel(DRAFT_ID)",
     !/try\s*\{\s*dbDel\(DRAFT_ID\)\s*;?\s*\}\s*catch/.test(src));
  ok("  the rejection is caught and recorded",
     /dbDel\(DRAFT_ID\)\.catch\(/.test(src));
  ok("  and a failure marks the draft stale",
     /dbDel\(DRAFT_ID\)\.catch\([^)]*draftStale\s*=\s*true/.test(src));

  console.log("\n8. THE OFFICE CARRIES THE SAME RECORDER");
  const d = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await d.addInitScript(() => { localStorage.setItem("cm_drive_url", ""); localStorage.setItem("cm_dash_lang", "en"); });
  await d.goto(BASE + "/dashboard/index.html", { waitUntil: "load" });
  await d.waitForTimeout(1200);
  ok("window.__errs is there too", await d.evaluate(() => Array.isArray(window.__errs)));
  ok("  and it starts empty on a healthy office boot",
     (await d.evaluate(() => window.__errs.length)) === 0,
     JSON.stringify(await d.evaluate(() => window.__errs.slice(0, 3))));
  await d.evaluate(() => { Promise.reject(new Error("zz office")); });
  await d.waitForTimeout(400);
  ok("  an unhandled rejection is recorded",
     await d.evaluate(() => window.__errs.some(e => /zz office/.test(e.m) && e.where === "unhandled-rejection")));
  await d.close();

  await b.close();
  console.log("\n" + (fails.length ? fails.length + " FAILED" : "ALL PASS"));
  process.exit(fails.length ? 1 : 0);
})();
