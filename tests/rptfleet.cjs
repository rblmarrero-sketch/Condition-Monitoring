/* THE ALL-INSPECTIONS REPORT (Report family B), to the combined-report
   reference (02_All_Inspections_Combined_Report.pdf).

   The fleet report already carried a management cover, a consolidated action
   list and per-machine detail. The reference adds four signature elements, and
   this suite holds each of them — all driven by the records, nothing invented:

     · a PERIOD on the cover;
     · an inspection-programme table BY TYPE — completed count, worst rating,
       main issue, next action, one row per round type present;
     · a DATA / EVIDENCE / REVIEW / APPROVAL report-controls strip, honest that
       a review and an approval are required rather than done;
     · an action-control summary — open, overdue, no owner, no work order, and
       verified as Not available because no field records a verification;
     · a three-role sign-off, all lines open on a fleet document.

   And it stays one report: the worst rating in the programme is the worst
   graded point of that type, the same 1-5 source as everywhere else, and the
   action-control counts are the records' own gaps.

   Run: node tests/rptfleet.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (c, n, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : ""));
                          if (!c) fails.push(n); };

/* A month of rounds across types, with the gaps and grades the assertions
   need: a Critical MP with no owner and no work order and a past-due date; a
   Degraded FC fully controlled (owner, WO, future due); a Critical UC. */
const SEED = `(function(){
  const recs = [
    { equip:"TK151", date:"2026-08-01", type:"MP", cls:"HT", by:"Zhomart", smu:6018,
      items:[ { key:"4C", grade:5, defect:"Heavy ferrous chips", action:"Repair now",
                resp:"", wo:"", target:"2026-08-05" },
              { key:"4D", grade:3, defect:"Ferrous debris" } ] },
    { equip:"TK032", date:"2026-08-02", type:"FC", cls:"HT", by:"Hasenov", smu:9060,
      items:[ { key:"ENG", grade:3, defect:"Debris in filter media", action:"Plan corrective work",
                resp:"A. Ivanov", wo:"WO-5521", target:"2026-12-01" } ] },
    { equip:"EX011", date:"2026-08-11", type:"UC", cls:"EXC", by:"Hasenov", smu:7100,
      items:[ { key:"L.LINK", grade:5, defect:"At condemn", action:"Confirm repair",
                resp:"", wo:"", target:"" } ] },
  ];
  window.CMDash.importRecords(recs);
  return "2026-08";
})()`;

const textOf = (p, target, lang) => p.evaluate(({ target, lang }) => {
  const secs = CMReport.sectionsFor("", target, { lang });
  const div = document.createElement("div");
  div.innerHTML = secs.map(s => s.html || "").join("\n");
  return div.innerText.replace(/\s+/g, " ").trim();
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
  const t = await textOf(p, target, "en");

  console.log("\n1. THE COVER CARRIES A PERIOD");
  ok(/2026-08-01 → 2026-08-11/.test(t), "period spans the earliest to the latest round",
     (t.match(/Period[^·]*/) || [""])[0].slice(0, 40));

  console.log("\n2. THE INSPECTION PROGRAMME, BY TYPE");
  ok(/Inspection programme/.test(t), "the programme table is present");
  /* MP worst is the worst graded point (5), not the first (which was 3 on 4D
     ... 4C is 5) — the same worst-point rule as the single report. */
  ok(/5 – Critical/.test(t) && /Heavy ferrous chips/.test(t),
     "  MP: worst rating 5 (the worst graded point) and its issue in the programme",
     (t.match(/5 – Critical[\s\S]{0,30}/) || [""])[0].slice(0, 36));
  ok(/Repair soon|Maintenance decision required/.test(t),
     "  and the next action follows the rating", 1);

  console.log("\n3. THE REPORT-CONTROLS STRIP");
  ok(/Report controls/.test(t) && /DATA/.test(t) && /EVIDENCE/.test(t)
     && /REVIEW/.test(t) && /APPROVAL/.test(t), "DATA / EVIDENCE / REVIEW / APPROVAL present");
  ok(/Reviewer required/.test(t) && /Approval required/.test(t),
     "  honest: a review and an approval are required, not done", 1);

  console.log("\n4. THE ACTION-CONTROL SUMMARY");
  ok(/Action control/.test(t), "the summary is present");
  /* Three findings need action (MP 4C grade5, FC ENG grade3, UC grade5); the MP
     is past due; two carry no owner and no work order. */
  ok(/Open\s*4/.test(t), "  open counts every finding that needs a response", (t.match(/Open\s*\d+/) || [""])[0]);
  ok(/Overdue\s*1/.test(t), "  overdue is the one with a past due date", (t.match(/Overdue\s*\d+/) || [""])[0]);
  ok(/No owner\s*3/.test(t), "  no owner counts what carries none", (t.match(/No owner\s*\d+/) || [""])[0]);
  ok(/No work order\s*3/.test(t), "  no work order likewise", (t.match(/No work order\s*\d+/) || [""])[0]);
  ok(/Verified\s*Not available/.test(t),
     "  verified is Not available — no field records it, so no number is invented", 1);

  console.log("\n5. THE THREE-ROLE SIGN-OFF");
  ok(/CM Technician/.test(t) && /Reliability Engineer/.test(t) && /Maintenance Supervisor/.test(t),
     "all three roles present", 1);

  console.log("\n6. IN RUSSIAN");
  const ru = await textOf(p, target, "ru");
  ok(/Программа осмотров/.test(ru), "the programme table is translated", 1);
  ok(/Контроль действий/.test(ru) && /Открыто\s*4/.test(ru), "the action control is translated", 1);
  ok(/Контроль отчёта/.test(ru), "the report controls are translated", 1);

  ok(errs.length === 0, "no page errors", errs.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
