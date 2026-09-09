/* THE EQUIPMENT CONDITION SUMMARY (Report family C), to the reference
   (03_Equipment_Condition_Summary.pdf).

   One machine, the latest completed round of each inspection type, in a
   cross-type comparison — not a full sheet per type (that is the unit report),
   the reference's single page-1 table a planner reads at a glance:

     · an equipment overview — unit, model, latest SMU, report date;
     · a comparison table over the seven site inspection types: last completed,
       SMU, rating, key result, next step — the rating being the worst graded
       point of that type, the same 1-5 source as everywhere else;
     · a type with no round reads "Not inspected", never Normal;
     · an equipment decision that follows the worst rating across the machine;
     · a report-controls strip and a consolidated action list over all its
       rounds, deduped, with the missing control fields left visible;
     · a three-role sign-off.

   Run: node tests/rptsummary.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (c, n, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : ""));
                          if (!c) fails.push(n); };

/* One machine, three of the seven types walked — MP and FC in June, a UC in
   September at a higher SMU. GET, Tray, Lube and Thermal are NOT walked, so the
   summary must show them "Not inspected". The UC is the worst (Severe). */
const SEED = `(function(){
  const recs = [
    { equip:"TK777", date:"2026-06-02", type:"MP", cls:"HT", by:"Hasenov", smu:9060,
      items:[ { key:"4C", grade:3, defect:"Ferrous debris", action:"Plan corrective work",
                resp:"A. Ivanov", wo:"WO-9001", target:"2026-12-01" } ] },
    { equip:"TK777", date:"2026-06-02", type:"FC", cls:"HT", by:"Hasenov", smu:9060,
      items:[ { key:"ENG", grade:2, defect:"Light debris" } ] },
    { equip:"TK777", date:"2026-09-01", type:"UC", cls:"HT", by:"Hasenov", smu:9300,
      items:[ { key:"L.LINK", grade:4, defect:"Track group near limit", action:"Plan intervention",
                resp:"", wo:"", target:"" } ] },
  ];
  window.CMDash.importRecords(recs);
  return "TK777";
})()`;

const textOf = (p, target, lang) => p.evaluate(({ target, lang }) => {
  const secs = CMReport.sectionsFor("summary", target, { lang });
  const div = document.createElement("div");
  div.innerHTML = secs.map(s => s.html || "").join("\n");
  return { text: div.innerText.replace(/\s+/g, " ").trim(), n: secs.length };
}, { target, lang });

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1800);
  await p.evaluate(BUNDLED + "()");
  await p.waitForTimeout(400);
  await p.evaluate(() => { CMDrive.saveEdit = () => Promise.resolve({ ok: true }); });
  const target = await p.evaluate(SEED);
  const r = await textOf(p, target, "en");
  const t = r.text;

  console.log("\n1. IT IS ONE MACHINE'S CROSS-TYPE SUMMARY, NOT A SHEET PER TYPE");
  ok(/Equipment Condition Summary/.test(t), "the summary title", 1);
  ok(r.n <= 3, "a compact document, not one full sheet per round", r.n + " sections");

  console.log("\n2. THE EQUIPMENT OVERVIEW");
  ok(/Latest SMU/.test(t) && /9300/.test(t), "latest SMU is the highest across the rounds (9300, not 9060)",
     (t.match(/Latest SMU[^A-Za-zА-Яа-я]*\d[\d, ]*/) || [""])[0].slice(0, 30));
  ok(/Report date/.test(t), "  and a report date", 1);

  console.log("\n3. THE COMPARISON TABLE OVER THE SEVEN TYPES");
  ok(/Overall condition/.test(t), "the comparison table is present", 1);
  ok(/Magnetic Plug/.test(t) && /Filter Cut/.test(t) && /Undercarriage/.test(t),
     "  the walked types are listed", 1);
  ok(/4 – Severe/.test(t), "  the UC rating is its worst graded point (4)", 1);
  ok(/Track group near limit/.test(t), "  its key result is the finding", 1);

  console.log("\n4. A TYPE WITH NO ROUND IS 'NOT INSPECTED', NEVER NORMAL");
  ok(/Not inspected/.test(t), "types not walked read Not inspected", 1);
  /* GET / Thermal / Tray / Lube were never walked; none may show a 1-Normal. */
  ok(!/Ground Engaging[\s\S]{0,40}1 – Normal/.test(t) && !/Thermography[\s\S]{0,40}1 – Normal/.test(t),
     "  and none of them is quietly rendered as Normal", 1);

  console.log("\n5. THE EQUIPMENT DECISION FOLLOWS THE WORST RATING");
  ok(/Equipment decision/.test(t), "the decision is present", 1);
  /* Worst is 4 (Severe) → plan, not the critical wording and not the all-clear. */
  ok(/require planned maintenance/.test(t),
     "  worst is Severe, so it reads plan — not critical, not all-clear", 1);

  console.log("\n6. CONTROLS, CONSOLIDATED ACTIONS, AND THE SIGN-OFF");
  ok(/Report controls/.test(t), "the report-controls strip", 1);
  ok(/Consolidated actions/.test(t), "the consolidated action list", 1);
  ok(/WO-9001/.test(t) && /A\. Ivanov/.test(t), "  it carries the recorded owner and work order", 1);
  ok(/CM Technician/.test(t) && /Reliability Engineer/.test(t) && /Maintenance Supervisor/.test(t),
     "  and the three-role sign-off", 1);

  console.log("\n7. IN RUSSIAN");
  const ru = (await textOf(p, target, "ru")).text;
  ok(/Сводка состояния техники/.test(ru), "the summary is translated", 1);
  ok(/Не осмотрено/.test(ru), "  'Not inspected' is translated", 1);
  ok(/Общее состояние/.test(ru), "  the comparison table is translated", 1);

  ok(errs.length === 0, "no page errors", errs.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
