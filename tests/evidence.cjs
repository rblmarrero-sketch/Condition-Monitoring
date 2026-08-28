/* THREE DECISIONS ABOUT A PHOTOGRAPH THAT HAD NO EFFECT ON ANYTHING.

   The correction panel has stored assignments since the orphan screen
   shipped — file this photograph against inspection point 4D, keep that one as
   general evidence — and nothing downstream read them. The decision was
   recorded, audited, synced to both backends, and the picture went on being
   listed under the keyless row it arrived on. The report, which asks each
   inspection point for its own photographs, printed it nowhere at all.

   That is this project's signature defect wearing its other face: not a real
   value rendered as nothing, but a real ACTION that does nothing. Nothing
   throws, the panel says "4 photograph(s) assigned", and the PDF a reliability
   engineer sends to a mine manager is missing the evidence somebody spent an
   afternoon filing.

   What this suite holds, in the order somebody meets it:

     re-file      a photograph filed against 4D leaves 4C and appears under 4D,
                  on the history screen AND in the report, because both go
                  through one function — two places deciding where a photograph
                  lives is two places that come to disagree
     general      evidence about the MACHINE — the plate, the whole unit, the
                  ground under it — gets its own section rather than vanishing
                  the moment somebody classifies it
     the gap      expected is a claim the phone made; received is a file
                  somebody can open. A report that prints four where six were
                  taken, and says nothing, reads as complete
     exclude      out of the report, still on the record and still on screen.
                  A blurred duplicate should not reach a signed PDF; that is
                  not the same as saying it was never part of the inspection
     off          off the record entirely — and it asks twice and will not
                  proceed without a reason, because it is field evidence

   Every round type is checked, not just the one I wrote the code against.
   unitSheets returns early for a lube round and again for a graded round, so a
   block written into only the wear branch reaches only undercarriage rounds —
   which is exactly what happened on the first attempt here.

   Run: node tests/evidence.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

/* Written once, by the app. A suite that keeps its own copy of a label makes
   the label expensive to fix, and six of them were found doing exactly that. */
const say = (p, k, v) => p.evaluate(([k, v]) => t(k, v || undefined), [k, v]);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    window.__w = [];
    CMDrive.saveEdit = d => { window.__w.push(JSON.parse(JSON.stringify(d))); return Promise.resolve({ ok: true }); };
    CMDrive.hasName = () => true;
    /* The media editor is only offered where there is somewhere to write to,
       and taking a photograph off the record is a write. */
    CMDrive.configured = () => true;
    try { localStorage.setItem("cm_dash_who", "R. Marrero");
          localStorage.setItem("cm_drive_url", "https://stub/exec"); } catch (e) {}
  });

  /* A record with at least two inspection points and a real photograph on the
     first — the shape a re-file needs to be observable at all. */
  const T = await p.evaluate(() => {
    for (const r of RECS) {
      const withPh = (r.items || []).find(i => mediaOf(i, r).some(m => m.kind !== "video"));
      const other = (r.items || []).find(i => withPh && i.key !== withPh.key);
      if (withPh && other) return { rk: ekOf(r), src: withPh.key, dst: other.key,
                                    name: mediaOf(withPh, r)[0].name, equip: r.equip, type: r.type };
    }
    return null;
  });
  if (!T) { console.log("  SKIP  no record with a photograph and two points"); await b.close(); process.exit(0); }
  console.log("  ·      " + T.equip + " " + T.type + "   " + T.src + " → " + T.dst);

  /* Straight onto the sidecar, the same shape the correction panel writes.
     The panel's own path is covered by orphanphoto.cjs; what is unproven is
     whether anything downstream READS what it wrote. */
  const decide = (name, d) => p.evaluate(([rk, name, d]) => {
    const keep = edits[rk] || {};
    const asg = Object.assign({}, keep.assign || {});
    if (d === null) delete asg[name];
    else asg[name] = Object.assign({ by: "R. Marrero", at: new Date().toISOString() }, d);
    CMDash.setEdits([{ key: rk, by: "R. Marrero", at: new Date().toISOString(),
      void: !!keep.void, reason: keep.reason || "", note: keep.note || "",
      items: keep.items || {}, assign: asg }]);
  }, [T.rk, name, d]);
  const look = () => p.evaluate(rk => {
    const rec = RECS.find(r => ekOf(r) === rk);
    const norm = CMReport.normalise([rec], { photos: true })[0];
    const item = k => (rec.items || []).find(x => x.key === k);
    const secs = CMR.sections(CMReport.ctxFor([rec], { photos: true, scope: "unit", target: rec.equip }));
    const html = secs.map(s => s.html).join("");
    return {
      onScreen: k => 0,
      screenSrc: mediaOf(item(window.__T.src), rec).map(m => m.name),
      screenDst: mediaOf(item(window.__T.dst), rec).map(m => m.name),
      general: CMDash.generalMedia(rec).map(m => m.name),
      rptSrc: (norm.items.find(x => x.key === window.__T.src) || {}).photos || [],
      rptDst: (norm.items.find(x => x.key === window.__T.dst) || {}).photos || [],
      rptGeneral: norm.general || [],
      gap: norm.gap,
      html,
    };
  }, T.rk);
  await p.evaluate(t => { window.__T = t; }, T);

  console.log("\n── a photograph filed against another point moves there");
  await decide(T.name, { point: T.dst });
  let v = await look();
  ok(!v.screenSrc.includes(T.name), "it leaves the point it arrived on", v.screenSrc.join(" ") || "(none)");
  ok(v.screenDst.includes(T.name), "and appears under the one it was filed against", v.screenDst.join(" "));
  /* THE ONE THAT NAMES THE BUG. The screen and the PDF must agree, and the PDF
     was the half nobody had wired. */
  ok(!v.rptSrc.some(u => u.endsWith(T.name)), "the report drops it from the old point",
     v.rptSrc.length + " photo(s) left there");
  ok(v.rptDst.some(u => u.endsWith(T.name)), "and prints it under the new one",
     v.rptDst.length + " photo(s)");

  console.log("\n── evidence about the machine gets a section of its own");
  await decide(T.name, { general: 1 });
  v = await look();
  ok(!v.screenSrc.includes(T.name) && !v.screenDst.includes(T.name),
     "it belongs to no single inspection point");
  ok(v.general.includes(T.name), "the history screen still has it", v.general.join(" "));
  /* Without this, classifying a photograph as general evidence DELETED it from
     the report — a decision meant to file it removed it from the reader's view. */
  ok(v.rptGeneral.some(u => u.endsWith(T.name)), "and so does the report", v.rptGeneral.length + " general");
  /* The heading comes from report-core's own dictionary, not from a copy of
     it kept here — the wording has been rewritten once already, and a suite
     that pins it makes rewriting it expensive. */
  const genT = await p.evaluate(() => CMR.makeT("en", false).I("gen_t"));
  ok(v.html.includes(genT), "under a heading that says what it is", genT);

  console.log("\n── what did not arrive is said out loud");
  const gap = v.gap;
  ok(gap && gap.expected >= gap.received, "expected and received are separate numbers",
     JSON.stringify(gap));
  if (gap && gap.missing > 0) {
    ok(v.html.includes("evgap"), "the report carries the note", gap.missing + " missing");
    ok(/unaffected|still stand/i.test(v.html),
       "and says the readings and findings are unaffected");
  } else {
    ok(!v.html.includes("evgap"), "and no note where nothing is missing", JSON.stringify(gap));
  }

  console.log("\n── excluded: out of the report, still on the record");
  await decide(T.name, { point: T.dst, exclude: 1, why: "blurred" });
  v = await look();
  ok(v.screenDst.includes(T.name), "the history screen still shows it", v.screenDst.join(" "));
  ok(!v.rptDst.some(u => u.endsWith(T.name)), "the report does not print it", v.rptDst.length + " printed");
  const flag = await p.evaluate(([rk, k, n]) => {
    const rec = RECS.find(r => ekOf(r) === rk);
    const it = (rec.items || []).find(x => x.key === k);
    const m = mediaOf(it, rec).find(x => x.name === n);
    return m ? { ex: m.excluded, why: m.excludeWhy } : null;
  }, [T.rk, T.dst, T.name]);
  ok(flag && flag.ex === true, "it is marked as excluded rather than removed", JSON.stringify(flag));
  ok(flag && flag.why === "blurred", "and carries the reason somebody gave", JSON.stringify(flag));

  console.log("\n── every round type, not just the one the code was written against");
  /* unitSheets returns early for a lube round and again for a graded round.
     A block written into only the wear branch reaches only undercarriage
     rounds, which is what the first attempt at this did. */
  const perBranch = await p.evaluate(gen => {
    const base = CMReport.normalise([RECS[0]], { photos: true })[0];
    /* The three ways a sheet can END, which is what decides whether a block
       written near the bottom is ever reached:
         lube    returns after lubeSections
         graded  returns after the board and the drawing
         wear    runs to the bottom of the function
       Built by hand rather than hunted for in the fixture: a fixture with no
       lube round would report this as covered while covering nothing. */
    const make = kind => {
      const r = JSON.parse(JSON.stringify(base));
      r.wear = kind === "wear";
      r.items = (r.items || []).slice(0, 3).map(function (it, i) {
        const c = JSON.parse(JSON.stringify(it));
        c.lube = kind === "lube" ? { prod: "Mobil 424", off: false } : null;
        c.w = kind === "wear" ? { mm: 40 + i, newMM: 50, condemnMM: 30, pct: 45, band: "" } : null;
        return c;
      });
      r.general = [gen];
      r.gap = { expected: 6, received: 4, missing: 2 };
      return r;
    };
    const out = {};
    ["lube", "graded", "wear"].forEach(kind => {
      const secs = CMR.sections({ records: [make(kind)], lang: "en", bi: true, mode: "unit",
        stamp: new Date(), sevLabel: s => s, sevLabelAlt: s => s,
        title: "x", titleAlt: "x", sub: "", subAlt: "" });
      const html = secs.map(s => s.html).join("");
      out[kind] = { gen: html.indexOf("genrow") >= 0, gap: html.indexOf("evgap") >= 0 };
    });
    return out;
  }, "data:image/gif;base64,R0lGODlhAQABAAAAACw=");
  Object.keys(perBranch).forEach(kind => {
    ok(perBranch[kind].gen, "[" + kind + " round] general evidence reaches the sheet");
    ok(perBranch[kind].gap, "[" + kind + " round] and so does the incomplete-evidence note");
  });

  console.log("\n── taking a photograph off the record asks twice, and asks why");
  const off = await p.evaluate(async ([rk, k, n, equip]) => {
    /* The media editor lives on the history card, in the photo view - not in
       the drawer. Reached the way a person reaches it. */
    showTab("equipment");
    const sel = document.getElementById("equipSel");
    sel.value = equip; sel.dispatchEvent(new Event("change"));
    await new Promise(r => setTimeout(r, 400));
    const pv = document.querySelector('#histView button[data-hv="photo"]');
    if (pv) pv.click();
    await new Promise(r => setTimeout(r, 400));
    const rec = RECS.find(r => ekOf(r) === rk);
    const box = document.querySelector('#history .medit[data-ik="' + k + '"]');
    if (!box) return { no: "no editor" };
    box.querySelector(".mtog").click();
    await new Promise(r => setTimeout(r, 150));
    const btn = [...box.querySelectorAll(".mx")].find(b => b.dataset.name === n && b.dataset.on === "1");
    if (!btn) return { no: "no remove button for " + n };
    const before = mediaOf((rec.items || []).find(x => x.key === k), rec).length;
    btn.click();
    await new Promise(r => setTimeout(r, 200));
    const asked = !box.querySelector(".mwhy").classList.contains("hidden");
    window.__w = [];
    box.querySelector(".mgo").click();                    // empty reason
    await new Promise(r => setTimeout(r, 300));
    const wroteOnEmpty = window.__w.length;
    box.querySelector(".mwhyi").value = "thumb over the lens";
    box.querySelector(".mgo").click();
    await new Promise(r => setTimeout(r, 500));
    const rec2 = RECS.find(r => ekOf(r) === rk);
    const after = mediaOf((rec2.items || []).find(x => x.key === k), rec2).length;
    const doc = window.__w[window.__w.length - 1] || null;
    return { asked, wroteOnEmpty, before, after, doc };
  }, [T.rk, T.dst, T.name, T.equip]);
  if (off.no) { ok(false, "the media editor was reachable", off.no); }
  else {
    ok(off.asked, "the first press asks rather than removes");
    ok(off.wroteOnEmpty === 0, "an empty reason writes nothing", off.wroteOnEmpty + " write(s)");
    ok(off.after === off.before - 1, "the second press takes it off",
       off.before + " → " + off.after);
    const a = off.doc && off.doc.assign && off.doc.assign[T.name];
    ok(!!a && a.off === 1 && a.offWhy === "thumb over the lens",
       "and the reason is stored against that photograph", JSON.stringify(a));
    ok(!!(a && a.by && a.at), "with who and when", JSON.stringify(a && [a.by, a.at]));
    /* Never destroyed. The file is kept so the decision can be undone, which
       is the whole reason this is a correction and not a delete. */
    ok(!(await p.evaluate(() => window.__w.some(d => d && d.op === "delete"))),
       "nothing was deleted from the folder");
  }

  ok(errs.length === 0, "nothing threw throughout", errs.slice(0, 2).join(" | "));
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
