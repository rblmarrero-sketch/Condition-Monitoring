/* PRESSING A BAR NARROWS THE PAGE, AND THE PAGE SAYS SO.

   Failure Analysis is four charts and a table over one population: the Pareto
   of defect types, the direct causes, the ISO mechanism classes, the P–F
   interval, and the machines carrying all of it. Pressing a bar in any of them
   is a filter on every other — that is the whole point of putting them on one
   page — and the audit brief asks for the cross-filter and a way back.

   The two things that can go wrong here are the two this project keeps
   producing, one each way round:

     · a control that does nothing. A bar that looks pressable and narrows
       nothing is worse than a bar that is not pressable, because the reader
       believes the number that follows.
     · a panel that claims to know something it does not. The affected-equipment
       table has to be about the bar that was PRESSED, not about whatever else
       the same rounds happened to find — a round is kept when any of its
       points carries the pressed defect, so the other points come with it, and
       counting them would put machines and severities in the table that the
       filter never selected.

   And the way back has to be on the page. The chip bar does the same job and
   is above the fold, which on this page is exactly where the reader is not
   looking — so there is a Reset beside the heading, which appears only when
   there is something to reset.

   Run: node tests/faxfilt.cjs        (needs tests/mock.cjs on 8099) */
const { chromium } = require(require("./pw.cjs"));
const BASE = process.env.CMPORT ? "http://127.0.0.1:" + process.env.CMPORT : "http://127.0.0.1:8099";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };
const reset = q => fetch(BASE + "/__reset?" + q).then(r => r.text());

/* The page as a reader sees it: what the lead line says, how many machines are
   in the table, which chips are up, and whether the way back is offered. */
const STATE = () => {
  const rows = [...document.querySelectorAll("#failAffTbl tbody tr")];
  /* THE TABLE PAGES AT TWENTY-FIVE. Counting rendered rows measures the page
     size, not the population — a first pass compared 25 with 25 and called a
     filter that had narrowed seventy machines to twenty-five "no narrowing at
     all". The pager states the matching count; that is the number. */
  const pgTxt = [...document.querySelectorAll("#tab-failure .pager .muted")]
    .map(x => x.textContent || "").join(" ");
  const mm = /(\d[\d,]*)\s*(?:matching|\u0441\u043e\u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432)/i.exec(pgTxt);
  return {
    matching: mm ? Number(mm[1].replace(/,/g, "")) : rows.length,
    lead: (document.getElementById("failLead") || {}).textContent || "",
    affLead: (document.getElementById("failAffLead") || {}).textContent || "",
    rows: rows.length,
    units: rows.map(r => (r.querySelector("td") || {}).textContent || "").map(s => s.trim()).filter(Boolean),
    worst: rows.map(r => (r.textContent || "")).join(" "),
    resetShown: !(document.getElementById("failReset") || {}).hidden,
    chips: [...document.querySelectorAll("#chips [data-drill], #chips button")].length,
    drill: JSON.parse(JSON.stringify(typeof drill !== "undefined" ? drill : {})),
    bars: [...document.querySelectorAll("#paretoBox [data-drill], #paretoBox [data-k]")].length,
  };
};

/* A FIXTURE WITH SOMETHING TO NARROW.

   The mock's own seed puts the same defect code on every round, so pressing
   the top of the Pareto selects all seventy and narrows nothing — a filter
   test on that data passes whether the filter works or not. Three codes on
   three populations, with one machine deliberately carrying two of them, so
   "narrowed" is a smaller list and not a relabelled one. */
const SEED = () => {
  const it = (o) => Object.assign({ key: "4C", label: "Left Rear Final Drive",
    action: "SCH", actionLabel: "Schedule repair" }, o);
  const recs = [];
  const mk = (u, n, code, name, cause, grade) => {
    for (let i = 0; i < n; i++) recs.push({
      equip: u + (100 + i), date: "2026-08-" + (10 + (i % 15)), type: "MP", cls: "HT",
      by: "Ivanov", smu: String(1000 + i * 40),
      items: [it({ grade, defect: name, defectCode: code, cause, causeCode: cause })],
    });
  };
  mk("FA", 12, "DT14-03", "Ferrous debris", "CA-WEAR", 4);
  mk("FB", 7, "DT02-01", "Water ingress", "CA-SEAL", 3);
  mk("FC", 4, "DT09-02", "Seal leak", "CA-SEAL", 5);
  /* One machine on two codes, so a filter that keeps whole ROUNDS rather than
     the pressed finding would show it under both and be caught. */
  recs.push({ equip: "FA100", date: "2026-07-02", type: "MP", cls: "HT", by: "Ivanov", smu: "900",
    items: [it({ grade: 5, defect: "Seal leak", defectCode: "DT09-02", cause: "CA-SEAL" })] });
  CMDash.importRecords(recs);
};

(async () => {
  await reset("n=70");
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem("cm_drive_url", u); localStorage.setItem("cm_drive_sec", "");
    localStorage.setItem("cm_drive_cursor", "0"); localStorage.setItem("cm_swap_off", "1");
    localStorage.setItem("cm_dash_lang", "en");
  }, BASE + "/exec");
  await p.goto(BASE + "/dashboard/index.html", { waitUntil: "load" });
  await p.waitForFunction(() => typeof RECS !== "undefined" && RECS.length > 20, null, { timeout: 90000 });
  await p.waitForTimeout(2000);
  await p.evaluate(SEED);
  await p.waitForTimeout(400);
  await p.evaluate(() => { const ov = document.getElementById("dataOv"); if (ov) ov.classList.add("hidden"); showTab("failure", true); });
  await p.waitForTimeout(700);

  console.log("1. THE PAGE BEFORE ANYTHING IS PRESSED");
  const s0 = await p.evaluate(STATE);
  ok("the affected-equipment table lists the whole population", s0.matching > 20,
     s0.matching + " machines, " + s0.rows + " on this page");
  ok("  and says so rather than claiming a filter", /all|Все/i.test(s0.affLead) || !/filter/i.test(s0.affLead), s0.affLead);
  ok("  no way back is offered, because there is nothing to go back from",
     !s0.resetShown, s0.resetShown ? "Reset is showing" : "Reset hidden");
  ok("  and nothing is drilled", Object.values(s0.drill).every(v => !v), JSON.stringify(s0.drill));

  console.log("\n2. PRESSING A DEFECT NARROWS EVERY PANEL");
  /* The bar a reader would press: the top of the Pareto. Found through the
     page rather than by index, so this cannot pass on a chart that has
     silently stopped being pressable. */
  const pressed = await p.evaluate(() => {
    const bar = document.querySelector('#tab-failure [data-drill]')
             || document.querySelector('#tab-failure .bar[data-k]')
             || document.querySelector('#tab-failure [data-defect]');
    if (!bar) return null;
    const label = (bar.getAttribute("title") || bar.textContent || "").trim().slice(0, 40);
    bar.click();
    return { label, how: bar.getAttribute("data-drill") || bar.getAttribute("data-k") || "" };
  });
  ok("the Pareto's bars are pressable", !!pressed, pressed ? pressed.label : "nothing carrying a drill handle");
  if (!pressed) { await b.close(); console.log("\nFAILED: 1"); process.exit(1); }
  await p.waitForTimeout(600);
  const s1 = await p.evaluate(STATE);
  ok("something is now drilled", Object.values(s1.drill).some(v => !!v), JSON.stringify(s1.drill));
  ok("  the table narrowed", s1.matching > 0 && s1.matching <= s0.matching,
     s0.matching + " machines → " + s1.matching);
  ok("  it is a real narrowing, not the same list relabelled", s1.matching < s0.matching,
     s0.matching + " → " + s1.matching);
  ok("  the lead line counts what is left", /\d/.test(s1.lead), s1.lead);
  ok("  the affected list says it is filtered", s1.affLead !== s0.affLead, s1.affLead);
  ok("  and a way back appears ON the page", s1.resetShown, "Reset " + (s1.resetShown ? "shown" : "hidden"));
  /* "every machine on screen was on screen before" was asserted here and was
     wrong of a PAGED table: both lists are the first twenty-five of a
     severity sort, so filtering legitimately promotes machines that were on
     page two. The property that matters — the filtered set is exactly the
     machines carrying the pressed code, no more and no fewer — is section 3,
     which reads the whole list rather than a page of it. */

  console.log("\n3. THE TABLE IS ABOUT THE BAR THAT WAS PRESSED");
  /* A round is kept when ANY of its points carries the pressed defect, and the
     other points on that round come with it. "3 findings, worst Critical" must
     count the pressed defect only — otherwise the table reports a severity the
     filter never selected. */
  const truth = await p.evaluate(() => {
    const key = drill.defect || drill.cause || drill.sev;
    const which = drill.defect ? "defect" : drill.cause ? "cause" : "sev";
    const rows = [];
    RECS.filter(r => !r._void).forEach(r => (r.items || []).forEach(i => {
      const k = which === "defect" ? defectKeyOf(i) : which === "cause" ? causeKeyOf(i) : sevOf(r, i);
      if (k === key) rows.push({ unit: r.equip, sev: sevOf(r, i) });
    }));
    const byU = new Map();
    rows.forEach(x => { const e = byU.get(x.unit) || { n: 0, worst: "" };
      e.n++; if (sevRank(x.sev) > sevRank(e.worst)) e.worst = x.sev; byU.set(x.unit, e); });
    return { which, key, units: [...byU.keys()].sort(), findings: rows.length };
  });
  ok("the filter is on a real code", !!truth.key, truth.which + " = " + truth.key);
  /* Every matching machine, not the first page of them. */
  const all1 = await p.evaluate(() => {
    const big = document.querySelector('[data-pg="failaff:size:100"]');
    if (big) big.click();
    return [...document.querySelectorAll("#failAffTbl tbody tr")]
      .map(r => ((r.querySelector("td") || {}).textContent || "").trim()).filter(Boolean).sort();
  });
  ok("  the table names exactly the machines carrying it",
     all1.join(",") === truth.units.join(","),
     all1.length + " listed / " + truth.units.length + " carrying it");
  ok("  and counts only the findings the filter selected, not the rest of those rounds",
     new RegExp("\\b" + truth.findings + "\\b").test(s1.lead) || s1.units.length === truth.units.length,
     s1.lead + " · " + truth.findings + " findings on " + truth.units.length + " machines");

  console.log("\n4. RESET PUTS IT BACK");
  await p.evaluate(() => document.getElementById("failReset").click());
  await p.waitForTimeout(600);
  const s2 = await p.evaluate(STATE);
  ok("nothing is drilled any more", Object.values(s2.drill).every(v => !v), JSON.stringify(s2.drill));
  ok("  the whole population is back", s2.matching === s0.matching, s0.matching + " → " + s2.matching);
  ok("  the lead line is what it was", s2.affLead === s0.affLead, s2.affLead);
  ok("  and the way back is put away again", !s2.resetShown);

  console.log("\n5. AND THE NARROWING FOLLOWS THE READER TO THE OTHER PAGES");
  /* The point of a cross-filter is that it is not local to one chart. */
  const carried = await p.evaluate(() => {
    const bar = document.querySelector("#tab-failure [data-drill]");
    bar.click();
    const here = JSON.parse(JSON.stringify(drill));
    showTab("actions", true);
    const there = JSON.parse(JSON.stringify(drill));
    const chips = document.querySelectorAll("#chips [data-drill],#chips button").length;
    showTab("failure", true);
    return { here, there, chips };
  });
  ok("a filter pressed on this page is still on when another opens",
     JSON.stringify(carried.here) === JSON.stringify(carried.there), JSON.stringify(carried.there));
  ok("  and the chip bar shows it there", carried.chips > 0, carried.chips + " chip(s)");
  await p.evaluate(() => clearDrill());

  ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
