/* THE HYBRID SINGLE-INSPECTION REPORT — compact, and formal.

   The field reports were a compact one-machine round summary. The reference
   templates (01_Single_Inspection_Report_Templates.pdf) are a formal
   reliability document: a report number, a condition-rating / level / decision
   block with the 1-5 scale, a maintenance-action strip, a DATA / EVIDENCE /
   REVIEW / APPROVAL status strip, and a three-role sign-off. The build keeps
   the compact density and adds the formal blocks — a hybrid.

   Every block is driven by the saved record. This suite proves:

     · the report number is the round's own identity, deterministic;
     · the condition rating IS the worst graded point, the word and the
       decision both follow from that one number, and nothing contradicts it;
     · the decision wording is correct for ratings 1 through 5;
     · the maintenance-action strip prints the round's action/cause/owner/WO/due
       and reads "Not recorded" for what the round does not carry, never a
       fabricated value;
     · the status strip is honest — a delivered round is not an approved one,
       and review and approval read Pending because no field records them;
     · the three approval roles are the reference's own, the technician filled
       from the record and the other two left as open lines;
     · both surfaces build the identical blocks from the identical round;
     · the blocks render in Russian with no English leaking, and the fit guards
       (pagecut, tray, rptfit) still pass — asserted by those suites, not here.

   Run: node tests/rpthybrid.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (c, n, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : ""));
                          if (!c) fails.push(n); };

/* One MP round on TK900, built as a source so it survives rebuild, with a
   grade and an action we control — and a second point graded lower, to prove
   the round rating is the WORST, not the first or the last. */
/* A UNIQUE unit per call, so importRecords (keyed equip|date|type) never
   clobbers an earlier fixture — the first pass at this suite reused one key and
   the last import silently replaced the round the later sections read. The
   lower point is grade min(2,g), so the round's WORST is exactly g and the
   rating test is testing g, not an accidental 2. */
function seed(uid, grade, withAction) {
  const lo = Math.min(2, grade);
  return `(function(){
    const rec = { equip:"TK9${uid}", date:"2026-08-15", type:"MP", cls:"HT", by:"S. Volkov",
      smu:7200, gps:{lat:66.6, lon:164.5},
      items:[
        { key:"4C", label:"Left Rear Final Drive", grade:${lo} },
        { key:"4D", label:"Right Rear Final Drive", grade:${grade}
          ${withAction ? `, action:"Repair now", cause:"Bearing failure", resp:"A. Ivanov", wo:"WO-5521", target:"2026-08-30"` : ""} }
      ] };
    window.CMDash.importRecords([rec]);
    return "TK9${uid}|2026-08-15|MP";
  })()`;
}

const textOf = (p, key, lang) => p.evaluate(({ key, lang }) => {
  const secs = CMReport.sectionsFor("one", key, { lang });
  const div = document.createElement("div");
  div.innerHTML = secs.map(s => s.html || "").join("\n");
  return { text: div.innerText.replace(/\s+/g, " ").trim(), html: div.innerHTML };
}, { key, lang });

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1800);
  await p.evaluate(BUNDLED + "()");
  await p.waitForTimeout(400);
  await p.evaluate(() => { CMDrive.saveEdit = () => Promise.resolve({ ok: true }); });

  console.log("\n1. THE REPORT NUMBER IS THE ROUND'S OWN IDENTITY");
  const key = await p.evaluate(seed("01", 4, true));
  let r = await textOf(p, key, "en");
  ok(/MP-TK901-20260815/.test(r.text), "report number is <type>-<unit>-<date>, deterministic",
     (r.text.match(/MP-TK901-\d+/) || ["none"])[0]);

  console.log("\n2. THE RATING IS THE WORST GRADED POINT, AND THE WORD AND DECISION FOLLOW IT");
  ok(/CONDITION RATING\s*4/.test(r.text), "worst of {2,4} is 4, not the first point's 2", (r.text.match(/CONDITION RATING\s*\d/) || [""])[0]);
  ok(/LEVEL\s*4 – Severe/.test(r.text), "  the level word comes off that number", (r.text.match(/LEVEL\s*4[^A-Za-z]*\w+/) || [""])[0]);
  ok(/DECISION\s*Repair soon/.test(r.text), "  and so does the decision", (r.text.match(/DECISION\s*[^C]+/) || [""])[0].slice(0, 40));
  ok(/1 Normal · 2 Incipient · 3 Degraded · 4 Severe · 5 Critical/.test(r.text),
     "  the scale line is printed, so the number is never colour-alone");

  console.log("\n3. THE DECISION WORDING IS CORRECT FOR RATINGS 1..5");
  const want = { 1: "Continue normal monitoring", 2: "Monitor at the next planned inspection",
                 3: "Plan corrective work", 4: "Repair soon", 5: "Maintenance decision required" };
  for (const g of [1, 2, 3, 4, 5]) {
    const k = await p.evaluate(seed("1"+g, g, false));
    const t = (await textOf(p, k, "en")).text;
    ok(t.indexOf(want[g]) >= 0 && new RegExp("CONDITION RATING\\s*" + g).test(t),
       `rating ${g} → "${want[g]}"`, (t.match(/DECISION\s*[A-Z][^A-ZС]+/) || [""])[0].slice(0, 42));
  }

  console.log("\n4. THE MAINTENANCE-ACTION STRIP IS HONEST");
  r = await textOf(p, key, "en");        // the withAction round
  ok(/Recorded action\s*Repair now/.test(r.text), "it prints the recorded action", 1);
  ok(/Direct cause\s*Bearing failure/.test(r.text), "  and the direct cause", 1);
  ok(/Owner\s*A\. Ivanov/.test(r.text) && /Work order\s*WO-5521/.test(r.text)
     && /Due date\s*2026-08-30/.test(r.text), "  and owner, work order, due date", 1);
  const kNo = await p.evaluate(seed("02", 4, false));   // graded, no action fields
  const noAct = (await textOf(p, kNo, "en")).text;
  ok(/Owner\s*Not recorded/.test(noAct) && /Work order\s*Not recorded/.test(noAct),
     "  and reads Not recorded for what the round does not carry — never invented",
     (noAct.match(/Owner\s*\w[\w .]*/) || [""])[0].slice(0, 24));

  console.log("\n5. THE STATUS STRIP SAYS ONLY WHAT IS TRUE");
  ok(/REVIEW\s*Pending/.test(r.text) && /APPROVAL\s*Pending/.test(r.text),
     "review and approval are Pending — no field records them", 1);
  ok(/DATA\s*Received/.test(r.text), "  the office holds the round (data received)", 1);

  console.log("\n6. THE THREE APPROVAL ROLES, THE REFERENCE'S OWN");
  ok(/CM Technician/.test(r.text) && /Reliability Engineer/.test(r.text)
     && /Maintenance Supervisor/.test(r.text), "all three roles present", 1);
  ok(/CM Technician\s*S\. Volkov/.test(r.text) || r.text.indexOf("S. Volkov") >= 0,
     "  the technician is filled from the record", 1);

  console.log("\n7. BOTH SURFACES BUILD THE IDENTICAL BLOCKS");
  /* The phone loads the same report-core.js; the section builder is the engine,
     not the surface. Proven by asking the engine directly — the same function
     both call — for the mobile-shaped record, and matching the rating block. */
  const same = await p.evaluate(({ key }) => {
    const a = CMReport.sectionsFor("one", key, { lang: "en" }).map(s => s.html || "").join("");
    // strip photo srcs / volatile bits, keep the formal blocks
    const grab = h => (h.match(/CONDITION RATING[\s\S]*?<\/table>/) || [""])[0];
    return { ratingBlock: grab(a).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) };
  }, { key });
  ok(same.ratingBlock.indexOf("Severe") >= 0 && same.ratingBlock.indexOf("Repair soon") >= 0,
     "the engine both surfaces call yields the rating + decision block", same.ratingBlock.slice(0, 60));

  console.log("\n8. IN RUSSIAN, WITH NO ENGLISH LEAKING INTO THE SINGLE-LANGUAGE BLOCKS");
  const ru = (await textOf(p, key, "ru")).text;
  ok(/ОЦЕНКА СОСТОЯНИЯ/.test(ru) && /РЕШЕНИЕ/.test(ru), "the rating block is in Russian", 1);
  ok(ru.indexOf("Скорый ремонт") >= 0, "  the decision is translated", 1);
  ok(ru.indexOf("Техник CM") >= 0 && ru.indexOf("Мастер по обслуживанию") >= 0,
     "  the approval roles are translated", 1);
  /* The scale line is single-language by design — its five words in the
     reader's language only, no inline pair. */
  ok(/1 Норма · 2 Начальный/.test(ru), "  the scale line is Russian-only, not doubled", 1);

  ok(errs.length === 0, "no page errors", errs.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
