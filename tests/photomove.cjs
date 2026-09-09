/* MOVING A PHOTOGRAPH MUST NOT LOSE IT.

   Reported from the office: a photograph moved off a component onto the
   machine overview, and the overview then said 0 photographs. Sweeping the
   whole take-and-assign path turned up four separate ways a picture that is
   sitting in the folder stops being counted, and all four are this project's
   signature — a real file rendered as nothing.

   1  A photograph re-filed from a point to the machine was counted as MISSING.
      The audit asked serverMediaOfAll(), which applied the re-filing plan and
      therefore took the file OFF the point that claimed it, while the machine
      is not an item and claims nothing. So tidying a plug photograph onto the
      overview turned a complete round into "1 attachment has not arrived".
      Withdrawal was fixed for exactly this reason; re-filing is the same
      error with a different verb.

   2  The plan itself was built from mediaAll() — the photographs THIS BROWSER
      HAS DOWNLOADED — so on a page that has fetched none, every move was
      silently ignored: the overview read 0, the picture still sat under the
      point it had been moved off, and the evidence audit gave a different
      answer before and after somebody scrolled a thumbnail into view. That is
      the reported symptom. Data & Sync fetches no photographs at all.

   3  Re-filing a whole round onto the machine it was actually walked lost
      every photograph on it. The panel says "the findings, photographs and
      corrections travel with it"; the names are predicted from equip, date
      and type, and a move rewrites all three, so the round went looking for
      files under a name the folder has never held.

   4  On the PHONE, a team round's machine photographs were matched by nothing.
      Every candidate base is built from a position KEY, and the machine's
      photographs are named after their CATEGORY. An inspector opening a
      colleague's round got the components and no overview, no sides, no tray
      — with nothing on screen to say a picture existed.

   What must hold throughout: the measurement, the grade and the position
   itself survive the move. Moving a photograph is a statement about the
   photograph.

   Run: node tests/photomove.cjs      (needs tests/ed-srv.cjs on 8093
                                        and tests/mock.cjs on 8098) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const DASH = `http://127.0.0.1:${Number(process.argv[2] || 8093)}/dashboard/index.html`;
const PHONE = "http://127.0.0.1:8098/mobile/index.html";
const PX1 = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const fails = [];
const ok = (c, n, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : ""));
                          if (!c) fails.push(n); };

/* One round, one point, two photographs in the folder, a reading and a grade
   on the point. `bytes` says whether this browser has downloaded them — the
   whole of finding 2 is that the answer must not depend on it. */
const seed = bytes => `(() => {
  const rec = RECS.find(r => (r.items || []).some(i => !i.general && i.key));
  rec.items.forEach(x => { ["photos","photo","video","attachments","media"].forEach(f => delete x[f]); x.att = []; });
  const it = rec.items.find(i => !i.general && i.key);
  it.photos = 2; it.att = []; it.mm = 12.5; it.grade = 3;
  rec.src = "folder";
  const base = photoBases(it, rec)[0];
  const names = [1, 2].map(n => base + "_" + n + ".jpg");
  window.__folder = new Set(names);
  ${bytes ? 'names.forEach(n => window.CMDash.addPhoto(n, "' + PX1 + '"));' : ""}
  CMDrive.hasName = n => window.__folder.has(n);
  CMDrive.names = () => [...window.__folder];
  CMDrive.configured = () => true;
  CMDrive.saveEdit = () => Promise.resolve({ ok: true });
  assignEpoch++; rebuild();
  return { rk: ekOf(rec), ik: it.key, names, equip: rec.equip };
})()`;

const look = (p, T) => p.evaluate(({ rk, ik }) => {
  const r = RECS.find(x => ekOf(x) === rk);
  if (!r) return { gone: true };
  const it = (r.items || []).find(i => i.key === ik) || null;
  return { equip: r.equip,
           gap: evidenceGap(r),
           onPoint: it ? serverMediaOf(it, r).map(m => m.name) : null,
           general: generalMedia(r).map(m => m.name),
           /* The two things a move must never touch. */
           mm: it && it.mm, grade: it && it.grade, point: !!it };
}, T);

(async () => {
  const b = await chromium.launch();

  console.log("\n1. A PHOTOGRAPH FILED ON THE MACHINE HAS STILL ARRIVED");
  {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto(DASH, { waitUntil: "load" }); await p.waitForTimeout(1800);
    await p.evaluate(BUNDLED + "()"); await p.waitForTimeout(600);
    const T = await p.evaluate(seed(true));
    let s = await look(p, T);
    ok(s.gap.expected === 2 && s.gap.missing === 0, "the round starts complete", JSON.stringify(s.gap));

    await p.evaluate(({ rk, names }) => {
      window.CMDash.setEdits([{ key: rk, by: "R", at: new Date().toISOString(),
        assign: { [names[0]]: { general: 1, cat: "OVERVIEW" } } }]);
    }, T);
    await p.waitForTimeout(300);
    s = await look(p, T);
    ok(s.general.length === 1, "the photograph is now the machine's", s.general.join(" | "));
    ok(s.onPoint.length === 1, "  and off the component, which is what was asked for", s.onPoint.join(" | "));
    ok(s.gap.missing === 0 && s.gap.received === 2,
       "  and the round is STILL complete — the file did not leave the folder",
       JSON.stringify(s.gap));
    ok(s.point && s.mm === 12.5 && s.grade === 3,
       "  the reading and the grade are untouched", s.mm + " mm · grade " + s.grade);

    console.log("\n2. AND BACK AGAIN");
    await p.evaluate(({ rk, ik, names }) => {
      window.CMDash.setEdits([{ key: rk, by: "R", at: new Date().toISOString(),
        assign: { [names[0]]: { point: ik } } }]);
    }, T);
    await p.waitForTimeout(300);
    s = await look(p, T);
    ok(s.general.length === 0 && s.onPoint.length === 2, "it is back on the component",
       s.onPoint.join(" | "));
    ok(s.gap.missing === 0, "  and nothing was ever missing", JSON.stringify(s.gap));

    console.log("\n3. A FILE THAT REALLY IS ABSENT IS STILL MISSING");
    await p.evaluate(({ names }) => { window.__folder.delete(names[1]); assignEpoch++; rebuild(); }, T);
    s = await look(p, T);
    ok(s.gap.missing === 1 && s.gap.received === 1,
       "one gone, one missing — no false reassurance either", JSON.stringify(s.gap));
    ok(errs.length === 0, "no page errors", errs.slice(0, 3).join(" | ") || "none");
    await p.close();
  }

  console.log("\n4. THE MOVE TAKES EFFECT ON A PAGE THAT HAS DOWNLOADED NOTHING");
  {
    /* Data & Sync fetches no photographs. Before this, every re-filing was
       invisible there — which is the panel whose whole job is to say what has
       and has not arrived. */
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto(DASH, { waitUntil: "load" }); await p.waitForTimeout(1800);
    await p.evaluate(BUNDLED + "()"); await p.waitForTimeout(600);
    const T = await p.evaluate(seed(false));
    const before = await look(p, T);
    ok(before.general.length === 0, "nothing is filed on the machine yet", "0");
    await p.evaluate(({ rk, names }) => {
      window.CMDash.setEdits([{ key: rk, by: "R", at: new Date().toISOString(),
        assign: { [names[0]]: { general: 1, cat: "OVERVIEW" } } }]);
    }, T);
    await p.waitForTimeout(300);
    const s = await look(p, T);
    ok(s.general.length === 1,
       "the machine has it, with not one byte downloaded", s.general.join(" | "));
    ok(s.onPoint.length === 1, "  and the component does not", s.onPoint.join(" | "));
    ok(s.gap.missing === 0, "  and the audit says nothing is waiting", JSON.stringify(s.gap));
    ok(errs.length === 0, "no page errors", errs.slice(0, 3).join(" | ") || "none");
    await p.close();
  }

  console.log("\n5. A ROUND RE-FILED ONTO ANOTHER MACHINE KEEPS ITS PHOTOGRAPHS");
  {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto(DASH, { waitUntil: "load" }); await p.waitForTimeout(1800);
    await p.evaluate(BUNDLED + "()"); await p.waitForTimeout(600);
    const T = await p.evaluate(seed(true));
    await p.evaluate(({ rk }) => {
      window.CMDash.setEdits([{ key: rk, by: "R", at: new Date().toISOString(),
        move: { equip: "TK999", why: "walked at the wrong machine", by: "R",
                at: new Date().toISOString() } }]);
    }, T);
    await p.waitForTimeout(300);
    const s = await look(p, T);
    ok(s.equip === "TK999", "the round now reads as the machine it was walked on", s.equip);
    ok(s.onPoint && s.onPoint.length === 2,
       "  and both photographs came with it — the panel says they do", (s.onPoint || []).join(" | "));
    ok(s.gap.received === 2 && s.gap.missing === 0,
       "  so the evidence audit is not told they vanished", JSON.stringify(s.gap));
    ok(errs.length === 0, "no page errors", errs.slice(0, 3).join(" | ") || "none");
    await p.close();
  }

  console.log("\n6. THE PHONE FINDS THE MACHINE'S PHOTOGRAPHS IN A TEAM ROUND");
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(u => {
      localStorage.setItem("up_dests", JSON.stringify([{ id: "gas", on: true, url: u, sec: "", folder: "" }]));
      localStorage.setItem("cm_swap_off", "1"); localStorage.setItem("lang", "en");
    }, "http://127.0.0.1:9/exec");
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", e => errs.push(e.message));
    /* The folder as it really is: one component photograph and two of the
       machine, named after their categories. */
    const FILES = [{ id: "f1", name: "TK149_4C_09.09.2026_MP.jpg" },
                   { id: "f2", name: "TK149_OVERVIEW_09.09.2026_MP.jpg" },
                   { id: "f3", name: "TK149_PLATE_09.09.2026_MP_2.jpg" }];
    const asked = [];
    await p.route("**/exec*", route => {
      let body = {}; try { body = JSON.parse(route.request().postData() || "{}"); } catch (e) {}
      const q = new URL(route.request().url()).searchParams;
      const action = body.action || q.get("action");
      const send = o => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
      if (action === "list") return send({ ok: true, files: FILES });
      if (action === "files") {
        String(body.ids || q.get("ids") || "").split(",").forEach(i => asked.push(i));
        return send({ ok: true, files: [] });
      }
      return send({ ok: true });
    });
    await p.goto(PHONE, { waitUntil: "load" }); await p.waitForTimeout(2500);
    await p.evaluate(async () => {
      const rec = { equip: "TK149", date: "2026-09-09", type: "MP", cls: "HT",
        items: [{ key: "4C", label: "LF" },
                { key: "__general", general: 1,
                  att: [{ attachmentId: "a1", category: "OVERVIEW", seq: 1 },
                        { attachmentId: "a2", category: "PLATE", seq: 2 }] }] };
      const g = loadDests().find(d => d.id === "gas");
      try { await teamPhotosFor(g, rec, null); } catch (e) {}
    });
    await p.waitForTimeout(300);
    const names = asked.map(id => (FILES.find(f => f.id === id) || {}).name).filter(Boolean);
    ok(names.indexOf("TK149_4C_09.09.2026_MP.jpg") >= 0,
       "the component's photograph is fetched, as it always was", names.join(" | "));
    ok(names.indexOf("TK149_OVERVIEW_09.09.2026_MP.jpg") >= 0,
       "  and the machine overview, which was matched by nothing", names.join(" | "));
    ok(names.indexOf("TK149_PLATE_09.09.2026_MP_2.jpg") >= 0,
       "  and the plate", names.join(" | "));
    ok(errs.length === 0, "no page errors on the phone", errs.slice(0, 3).join(" | ") || "none");
    await ctx.close();
  }

  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
