/* THE SCHEDULE, AS THE SITE STATED IT — AND IN ONE PLACE ONLY.

   Two things were wrong at once.

   The dashboard carried its own interval table. It said the magnetic plug round
   was every 90 days; the engine the phones and the due list use says 250 h,
   which at this fleet's two ten-hour shifts is 12.5 days. Coverage was
   therefore measuring "overdue" against a window seven times too wide, and
   machines a week past their plug round were being counted as reached. One
   fact, two tables, and the one on screen was the wrong one.

   And the interval was a property of the ROUND alone, so one number had to
   serve a dozer and an excavator. A dozer's chain is in the ground every hour
   it works; an excavator's carries the machine and turns far less. Running both
   at 500 h walked the excavators eight times more often than anybody asked for.

   The figures here are the ones the site stated, and where a class this round
   fits has no stated figure it keeps what it was walked on and is FLAGGED —
   inheriting a neighbouring class's number would be inventing a policy nobody
   set.

   Run: node tests/interval.cjs [port]   (needs tests/ed-srv.cjs on 8093)
*/
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

/* What the site stated, in the site's own words. */
const STATED = [
  ["MP", "HT",  250,  "Terex TR60 haul trucks — final drive magnetic plugs"],
  ["TB", "AT",  4000, "Komatsu HM400 articulated trucks — body inspection"],
  ["UC", "DOZ", 1000, "Dozers — undercarriage"],
  ["UC", "EXC", 4000, "Excavators — undercarriage"],
];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1800);

  console.log("\n── the stated figures are the figures");
  for (const [ty, cls, h, why] of STATED) {
    const got = await p.evaluate(([t2, c]) => DUE.hours(t2, null, c), [ty, cls]);
    ok(got === h, `${why}: ${h} h`, got + " h");
  }

  console.log("\n── there is one schedule, not two");
  /* The dashboard's own table is gone. If it comes back, this catches it by
     comparing what coverage measures against what the engine says. */
  const one = await p.evaluate(() => ({
    hasOwnTable: typeof DUE_DAYS !== "undefined",
    mpDays: ivDaysFor("MP", null),
    mpHours: DUE.hours("MP"),
    hpd: DUE.HOURS_PER_DAY,
  }));
  ok(one.hasOwnTable === false, "the dashboard has no interval table of its own",
     one.hasOwnTable ? "DUE_DAYS still exists" : "gone");
  ok(Math.abs(one.mpDays - one.mpHours / one.hpd) < 0.01,
     "and its overdue window is the engine's figure, converted",
     `${one.mpHours} h ÷ ${one.hpd} = ${one.mpDays} d`);
  /* The bug in one number: 250 h is 12.5 days, not 90. */
  ok(one.mpDays < 20, "not the 90 days it used to use", one.mpDays + " days");

  console.log("\n── a class with no stated figure keeps its own, and says so");
  const carried = await p.evaluate(() => ({
    tbHt: DUE.hours("TB", null, "HT"),
    tbHtFlag: !!DUE.spec("TB", "HT").carriedClass,
    tbAt: DUE.hours("TB", null, "AT"),
    tbAtFlag: !!DUE.spec("TB", "AT").carriedClass,
  }));
  ok(carried.tbHt === 1000, "the rigid trucks keep what they were walked on", carried.tbHt + " h");
  ok(carried.tbHtFlag === true, "flagged as carried, not stated", String(carried.tbHtFlag));
  ok(carried.tbAt === 4000 && carried.tbAtFlag === false,
     "while the articulated trucks carry the stated one",
     `${carried.tbAt} h, carried=${carried.tbAtFlag}`);

  console.log("\n── every existing caller still gets an answer");
  const compat = await p.evaluate(() => ({
    round: DUE.hours("UC"),
    part: DUE.hours("FC", "ENG"),
    partOther: DUE.hours("FC", "HYD"),
    days: DUE.days("MP"),
    next: !!DUE.next({ type: "MP", last: { d: "2026-08-01" }, today: "2026-08-20" }),
    nextCls: DUE.next({ type: "UC", cls: "EXC", last: { d: "2026-01-01" }, today: "2026-08-20" }),
    nextBase: DUE.next({ type: "UC", cls: "DOZ", last: { d: "2026-01-01" }, today: "2026-08-20" }),
  }));
  ok(compat.round === 1000, "a round asked without a class answers", compat.round + " h");
  ok(compat.part === 500 && compat.partOther === 1000,
     "the filter round still splits by part", `ENG ${compat.part} · HYD ${compat.partOther}`);
  ok(compat.days === 12.5, "days still convert at the fleet rate", compat.days + " d");
  ok(compat.next, "next() still answers without a class");
  /* The whole point: the same elapsed time is overdue for one and not the
     other. 231 days at 20 h/day is 4,620 h — past a dozer's 1,000 and past an
     excavator's 4,000, so both are over; the MARGIN is what differs. */
  ok(compat.nextCls.dueInHours > compat.nextBase.dueInHours,
     "and a class changes the answer it gives",
     `EXC ${compat.nextCls.dueInHours} h vs DOZ ${compat.nextBase.dueInHours} h`);

  console.log("\n── the coverage row names them rather than averaging them");
  const rows = await p.evaluate(() => {
    const pick = c => (window.ASSETS || []).find(a => a.cls === c);
    const add = [];
    /* MP is in this list now. It used to be missing because the plug round
       already had rows on screen — from data/magnetic_plug.js, the bundled
       history the dashboard merged in as a second source. That source is gone
       (its sixteen rounds live in the folder now, where the phones can see
       them too), so this suite supplies its own fixture for every round it
       asks about, which is what it should always have done. */
    [["UC", "DOZ"], ["UC", "EXC"], ["TB", "AT"], ["TB", "HT"], ["MP", "HT"]].forEach(([ty, cls], i) => {
      const a = pick(cls); if (!a) return;
      add.push({ equip: a.n, date: "2026-08-2" + i, type: ty, cls: a.cls, by: "I. P",
                 items: [{ key: "P1", label: "x", grade: "A" }] });
    });
    CMDash.importRecords(add);
    covOpen = true; renderCoverage();
    const out = {};
    [...document.querySelectorAll("#covTbl tbody tr")].forEach(tr => {
      const txt = tr.children[0].innerText.replace(/\s+/g, " ").trim();
      if (/Undercarriage|Ходовая/i.test(txt)) out.uc = txt;
      if (/body liner|кузов/i.test(txt)) out.tb = txt;
      if (/Magnetic|Пробк/i.test(txt)) out.mp = txt;
    });
    return out;
  });
  ok(/1,?000/.test(rows.uc || "") && /4,?000/.test(rows.uc || ""),
     "undercarriage shows both figures", rows.uc);
  ok(/4,?000/.test(rows.tb || ""), "body inspection shows the stated 4,000 h", rows.tb);
  ok(/carried|перенес/i.test(rows.tb || ""),
     "and marks the class that is on a carried figure", rows.tb);
  ok(/250 h|250 ч/.test(rows.mp || ""), "the plug round shows hours, not 90 days", rows.mp);

  ok(errs.length === 0, "nothing threw throughout", errs.slice(0, 2).join(" | "));
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
