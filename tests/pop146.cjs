/* BUNDLED EVIDENCE IS NOT A FIELD UPLOAD THAT NEVER ARRIVED.

   TK146 shows a photograph against each of 4C, 4D, 4E and 4F in Equipment
   History, and Sync Operations calls all four missing field files at the same
   moment. Both are drawn from the same records, on the same screen, from two
   different calculations:

     mediaPopulations()  knows about bundled evidence and excludes it
     syncScan()          has no bundled check at all

   syncScan walks mediaOf() for every record and asks whether the SERVER holds
   each name. A bundled photograph's name is a path that ships with the
   application — assets/photos/TK146_4C_2026-07-29.jpg — and no server will ever
   hold it. So four photographs that are present, on disk, and rendering on the
   screen are reported as four field uploads that never arrived, on a record
   nobody ever uploaded from a phone.

   That is this project's oldest failure in its other direction: not a real
   value rendered as nothing, but nothing rendered as a real problem. It also
   corrupts every percentage computed from that denominator.

   One population per attachment, and one calculation that decides which.

   Run: node tests/pop146.cjs [port]    (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
let fail = 0;
const ok = (c, w, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + w + (d !== undefined ? "   " + d : "")); if (!c) fail++; return c; };

/* A round as a phone actually sends one: no assets/ path anywhere, four
   photographs named the way the field names them. */
const FIELD = {
  equip: "TK900", date: "2026-07-29", type: "MP", cls: "HT", by: "R. Marrero", smu: 6100,
  src: "drive",
  items: ["4C", "4D", "4E", "4F"].map(k => ({
    key: k, label: k + " FINAL DRIVE", grade: "C", sev: "DEG",
    photo: `TK900_${k}_29.07.2026_MP.jpg`, photos: 1, video: 0,
  })),
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1800);

  /* The server holds nothing of TK900's yet, and could never hold TK146's
     bundled paths. Controlled rather than assumed, so the run is the same on
     every machine. */
  const setup = held => p.evaluate(h => {
    window.__held = h;
    CMDrive.configured = () => true;
    CMDrive.names = () => window.__held;
    try { folderPhotos = {}; } catch (e) {}
    if (!RECS.some(r => r.equip === "TK900")) RECS.push(window.__field);
    return true;
  }, held);

  await p.evaluate(f => { window.__field = f; }, FIELD);
  await setup([]);

  const scan = () => p.evaluate(() => {
    const s = syncScan();
    const of = u => (s.gaps.find(g => g.r.equip === u) || { miss: [] }).miss.map(m => m.name);
    return { expected: s.expected, present: s.present,
             tk146: of("TK146"), tk900: of("TK900"),
             gapUnits: s.gaps.map(g => g.r.equip) };
  });

  console.log("\n── the four photographs TK146 is showing on screen");
  {
    const s = await scan();
    /* THE CHECK THAT NAMES THE BUG. */
    ok(s.tk146.length === 0,
       "are not reported as field uploads that never arrived", JSON.stringify(s.tk146));
    ok(!s.tk146.some(n => /^assets\/photos\//i.test(n)),
       "and no path that ships with the application is in the missing list",
       s.tk146.filter(n => /^assets\//i.test(n)).join(" ") || "none");
    /* And they must not be in the denominator either, or every percentage
       computed from it is measuring the repository, not the field. */
    const pop = await p.evaluate(() => mediaPopulations());
    ok(pop.historical >= 4, "they are counted as bundled evidence instead", "historical=" + pop.historical);
  }

  console.log("\n── a real round from a phone, with four files that have not arrived");
  {
    const s = await scan();
    ok(s.tk900.length === 4, "counts four missing, and names them", JSON.stringify(s.tk900));
    ok(s.tk900.every(n => /^TK900_/.test(n)), "by the names the field gave them");
  }

  console.log("\n── and when those four files arrive");
  {
    const before = await scan();
    await setup(FIELD.items.map(i => i.photo));
    const after = await scan();
    ok(after.tk900.length === 0, "nothing of TK900's is missing any more", JSON.stringify(after.tk900));
    ok(after.present - before.present === 4,
       "received rises by exactly four", `${before.present} -> ${after.present}`);
    ok(after.expected === before.expected,
       "and the denominator does not move, because arriving is not expecting",
       `${before.expected} -> ${after.expected}`);
  }

  console.log("\n── the counts a person is asked to act on");
  {
    const inv = await p.evaluate(() => {
      const s = syncScan(), pop = mediaPopulations();
      const int = v => Number.isInteger(v) && v >= 0;
      return {
        ints: [s.expected, s.present, s.held, s.critWaiting, s.gaps.length,
               pop.mobExpected, pop.mobReceived, pop.mobMissing, pop.historical].every(int),
        presentWithin: s.present <= s.expected,
        popWithin: pop.mobReceived <= pop.mobExpected,
        adds: pop.mobReceived + pop.mobMissing === pop.mobExpected,
        critWithin: s.critWaiting <= s.gaps.length,
      };
    });
    ok(inv.ints, "every count is a whole number and none is negative");
    ok(inv.presentWithin, "received never exceeds expected");
    ok(inv.popWithin, "nor in the field population");
    ok(inv.adds, "received + missing accounts for the whole field population");
    ok(inv.critWithin, "and Critical-waiting is a subset of what is waiting");
  }

  console.log("\n── a percentage with nothing to divide by");
  {
    const na = await p.evaluate(() => {
      CMDrive.configured = () => false; renderSync();
      const tiles = [...document.querySelectorAll("#syncKpis .kpi")]
        .map(k => k.querySelector(".v").textContent.trim());
      CMDrive.configured = () => true; renderSync();
      return tiles;
    });
    ok(!na.some(v => /NaN/i.test(v)), "no tile reads NaN", na.join(" | "));
    ok(!na.some(v => v === "0%"), "and none reports 0% for a question nobody asked", na.join(" | "));
  }

  console.log("\n── the reconciliation ladder, which was audited as showing minus one");
  {
    /* The count was never negative: rivals is floored at zero, and it was 1.
       The ladder printed a leading minus on every subtraction step, so one
       conflict to settle rendered as "−1" — which reads as an impossible
       count, and was reported as a release blocker. Correct arithmetic said
       badly is still a screen nobody can act on. */
    const lad = await p.evaluate(() => {
      const rows = reconcile();
      renderSync();
      const dd = [...document.querySelectorAll("#syRecon dd")].map(x => x.textContent.trim());
      const dt = [...document.querySelectorAll("#syRecon dt")].map(x => x.textContent.trim());
      return { ns: rows.map(r => r.n), steps: rows.map(r => !!r.step), dd, dt,
               less: t("sy_r_less") };
    });
    ok(lad.ns.every(n => Number.isInteger(n) && n >= 0),
       "every line of the ladder is a whole number, none below zero", JSON.stringify(lad.ns));
    ok(!lad.dd.some(v => /^-|−/.test(v)),
       "and nothing on screen is printed as a negative", lad.dd.join(" | "));
    ok(lad.dt.filter((_, i) => lad.steps[i]).every(l => l.indexOf(lad.less) === 0),
       "a step that subtracts says so in words", lad.dt.join(" | "));
  }

  ok(errs.length === 0, "no page errors", errs.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall good");
  process.exit(fail ? 1 : 0);
})();
