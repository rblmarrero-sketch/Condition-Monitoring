/* A PHOTOGRAPH THAT NEVER ARRIVED DOES NOT PRINT AS A GREY RECTANGLE.

   Found by looking at the rendered pages of the report matrix rather than at
   the code: a position whose record names photographs the office has not got
   laid out three empty grey boxes at the top of its card. html2canvas
   rasterises whatever is laid out, and an <img> whose source is not there
   occupies its box with nothing in it.

   In a signed document that is the worst thing this project makes: a reader
   sees a blank frame and cannot tell whether the photograph failed to print,
   whether the inspector photographed a clean plug, or whether somebody took
   evidence off the record. And the document already answers the question
   properly — the preliminary banner and the evidence-gap block count the
   photographs that have not reached the office — so the placeholder is a
   second, wordless, wrong answer standing next to the right one.

   What has to be true:
     · an image that cannot load is taken out, with the figure and caption
       around it, before anything is measured or rasterised;
     · an image that CAN load is kept — the guard must not quietly strip
       evidence that is present, which would be the same defect inverted;
     · a slow photograph is waited for rather than dropped, because a slow one
       and a dead one look identical until the slow one arrives;
     · and the estimate counts the same document the PDF will be, so a page
       that will not exist is not promised.

   Run: node tests/rptmiss.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require("./pw.cjs"));
const B = (process.env.CMPORT ? "http://127.0.0.1:" + process.env.CMPORT : "http://127.0.0.1:8099") + "/dashboard/index.html";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };

/* A one-pixel PNG that always loads, so "kept" and "dropped" are told apart by
   what the image IS and not by how the test happened to be timed. */
const GOOD = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem("cm_drive_url", ""); localStorage.setItem("cm_dash_lang", "en"); });
  await p.goto(B, { waitUntil: "load" }); await p.waitForTimeout(1500);

  console.log("1. THE PASS ITSELF, ON A DOCUMENT MADE OF KNOWN IMAGES");
  const one = await p.evaluate(async ([good]) => {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;left:-99999px;top:0;width:760px;";
    d.innerHTML =
      '<figure id="fGood"><img src="' + good + '"><figcaption>kept</figcaption></figure>' +
      '<figure id="fBad"><img src="./no-such-photograph-9f2a.jpg"><figcaption>gone</figcaption></figure>' +
      '<div id="plain">text</div>';
    document.body.appendChild(d);
    const dropped = await window.CMR.settleImages(d, 5000);
    const r = { dropped, good: !!d.querySelector("#fGood"), bad: !!d.querySelector("#fBad"),
                plain: !!d.querySelector("#plain"), imgs: d.querySelectorAll("img").length };
    d.remove();
    return r;
  }, [GOOD]);
  ok("the photograph that could not load is counted", one.dropped === 1, JSON.stringify(one));
  ok("  and taken out with its figure and caption", !one.bad);
  ok("  the one that loaded is left alone", one.good && one.imgs === 1);
  ok("  and nothing else on the page is touched", one.plain);

  console.log("\n2. A SLOW PHOTOGRAPH IS WAITED FOR, NOT DROPPED");
  /* Served by the mock behind a deliberate delay, so "slow" is a real network
     answer rather than a fake. */
  const slow = await p.evaluate(async () => {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;left:-99999px;top:0;width:760px;";
    /* A real photograph over a real connection, inserted and asked about in
       the same tick — so it is genuinely still loading when the pass begins,
       which is the only state that distinguishes "waited for" from "judged
       early". A cache-buster keeps it that way on the second run. */
    d.innerHTML = '<figure id="fSlow"><img src="../assets/photos/TK146_4C_2026-07-29.jpg?n='
      + Math.random() + '"></figure>';
    document.body.appendChild(d);
    const started = d.querySelector("img").complete;
    const dropped = await window.CMR.settleImages(d, 8000);
    const im = d.querySelector("img");
    const r = { dropped, kept: !!d.querySelector("#fSlow"), started,
                px: im ? im.naturalWidth : 0 };
    d.remove();
    return r;
  });
  ok("an image still loading when the pass starts is not judged yet", !slow.started, "complete=" + slow.started);
  ok("  it is waited for and kept", slow.dropped === 0 && slow.kept, JSON.stringify(slow));
  ok("  with its pixels actually in hand", slow.px > 0, slow.px + " px wide");

  console.log("\n3. AND THE DOCUMENT IS THE ONE THAT GETS MADE");
  /* A record naming photographs the office has not got — exactly the case the
     matrix rendered as three grey boxes. */
  await p.evaluate(() => {
    CMDash.importRecords([{
      equip: "TK900", date: "2026-08-14", type: "MP", cls: "HT", by: "I. Petrov", smu: "18422",
      items: [{ key: "4C", label: "Left Rear Final Drive", grade: 5, defect: "Ferrous debris",
                action: "REP", actionLabel: "Replace component",
                photos: ["never-arrived-1.jpg", "never-arrived-2.jpg", "never-arrived-3.jpg"] },
              { key: "4D", label: "Right Rear Final Drive", grade: 1 }],
    }]);
    const ov = document.getElementById("dataOv"); if (ov) ov.classList.add("hidden");
  });
  await p.waitForTimeout(400);
  const est = await p.evaluate(() =>
    CMReport.estimate("one", "TK900|2026-08-14|MP", { lang: "en", bi: false, photos: true, scale: 1.8 }));
  ok("the estimate counts no photographs, because none of them are there",
     !!est && est.photos === 0, JSON.stringify(est));

  const laid = await p.evaluate(async () => {
    const secs = CMReport.sectionsFor("one", "TK900|2026-08-14|MP", { lang: "en", bi: false, photos: true });
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;left:-99999px;top:0;width:760px;";
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + "</div>").join("");
    document.body.appendChild(d);
    const before = d.querySelectorAll("img").length;
    const dropped = await window.CMR.settleImages(d, 6000);
    const r = { before, dropped, after: d.querySelectorAll("figure").length,
                imgs: d.querySelectorAll("img").length,
                gap: /not reached|Evidence/i.test(d.textContent) };
    d.remove();
    return r;
  });
  ok("the document did lay the missing photographs out", laid.before === 3, String(laid.before));
  ok("  and the pass leaves none of them behind", laid.after === 0 && laid.imgs === 0,
     JSON.stringify({ dropped: laid.dropped, after: laid.after, imgs: laid.imgs }));
  ok("  while the document still SAYS the evidence is incomplete", laid.gap);

  ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
