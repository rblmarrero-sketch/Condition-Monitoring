/* ONE DECISION ABOUT A PHOTOGRAPH, READ THE SAME WAY ON BOTH SURFACES.

   The correction panel has been writing photograph decisions per file name
   since the orphan screen shipped — file it under a point, file it as the
   machine's, keep it out of the report, take it off the record. Only the
   dashboard ever read them. The phone stores the same markers, applies the
   grade, the move, the removed position and the hour meter from them through
   mobile/edits.js, and walked straight past the photograph decisions.

   So an engineer moved a plug photograph onto the machine overview, watched
   it move, and the inspector printing that round at the machine got it under
   the component still. One document, two answers — the same shape as the
   grade that never reached the inspector, which is why CMEdits.apply exists.

   CMEdits.fileOf is now the rule, and both surfaces call it. What must hold:

     · the office and the phone place the same file on the same position;
     · `general` is answered as a FLAG, because the machine's position is
       spelled __general on the phone and MACHINE in the office, and a rule
       that returned one spelling would be wrong on the other surface;
     · a file nobody has filed does not move — the no-decision case must
       never look like a decision;
     · off the record and kept-out-of-the-report never reach a sheet;
     · a photograph filed onto a position the round never walked still gets
       printed, on a position carrying the picture and nothing else.

   Run: node tests/refile2.cjs      (needs tests/ed-srv.cjs on 8093
                                     and tests/mock.cjs on 8098) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const CMEdits = require("../mobile/edits.js");
const DASH = `http://127.0.0.1:${Number(process.argv[2] || 8093)}/dashboard/index.html`;
const PHONE = "http://127.0.0.1:8098/mobile/index.html";
const PX1 = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const fails = [];
const ok = (c, n, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : ""));
                          if (!c) fails.push(n); };

(async () => {
  console.log("\n1. THE RULE ITSELF, ASKED DIRECTLY");
  {
    /* Taken from the module both pages load, not from a copy — a suite that
       keeps its own table of the rule proves the table, not the app. */
    const a = { "a.jpg": { general: 1, cat: "OVERVIEW" },
                "b.jpg": { point: "4D" },
                "c.jpg": { off: 1, offWhy: "thumb over the lens" },
                "d.jpg": { exclude: 1, why: "duplicate" },
                "e.jpg": { point: "4C" } };
    const f = (n, from, gen) => CMEdits.fileOf(a, n, from, gen);
    let r = f("a.jpg", "4C", false);
    ok(r.general === true && r.key === null && r.cat === "OVERVIEW" && r.moved === true,
       "filed as the machine's: a flag and a category, never a key", JSON.stringify(r));
    r = f("b.jpg", "4C", false);
    ok(r.general === false && r.key === "4D" && r.moved === true,
       "filed under another point: that point, and it moved", JSON.stringify(r));
    r = f("e.jpg", "4C", false);
    ok(r.key === "4C" && r.moved === false,
       "filed under the point it was already on: no move", JSON.stringify(r));
    r = f("zz.jpg", "4C", false);
    ok(r.key === "4C" && r.moved === false && !r.off && !r.exclude,
       "a file nobody has filed stays exactly where it arrived", JSON.stringify(r));
    r = f("c.jpg", "4C", false);
    ok(r.off === true, "off the record is answered", JSON.stringify(r));
    r = f("d.jpg", "4C", false);
    ok(r.exclude === true && r.off === false,
       "  and kept-out-of-the-report is a different answer", JSON.stringify(r));
    /* The machine's own photograph, sent back to a component. */
    r = f("b.jpg", "__general", true);
    ok(r.general === false && r.key === "4D" && r.moved === true,
       "off the machine and onto a component", JSON.stringify(r));
    r = f("a.jpg", "__general", true);
    ok(r.general === true && r.moved === false,
       "  and one already on the machine, filed as the machine's, has not moved",
       JSON.stringify(r));
  }

  const b = await chromium.launch();

  console.log("\n2. THE OFFICE PLACES IT THERE");
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(DASH, { waitUntil: "load" }); await p.waitForTimeout(1800);
  await p.evaluate(BUNDLED + "()"); await p.waitForTimeout(600);
  const office = await p.evaluate(px => {
    const rec = RECS.find(r => (r.items || []).some(i => !i.general && i.key));
    rec.items.forEach(x => { ["photos","photo","video","attachments","media"].forEach(f => delete x[f]); x.att = []; });
    const it = rec.items.find(i => !i.general && i.key);
    it.photos = 2; it.att = []; rec.src = "folder";
    const base = photoBases(it, rec)[0];
    const names = [1, 2].map(n => base + "_" + n + ".jpg");
    const folder = new Set(names);
    names.forEach(n => window.CMDash.addPhoto(n, px));
    CMDrive.hasName = n => folder.has(n);
    CMDrive.names = () => [...folder];
    CMDrive.configured = () => true;
    CMDrive.saveEdit = () => Promise.resolve({ ok: true });
    window.CMDash.setEdits([{ key: ekOf(rec), by: "R", at: new Date().toISOString(),
      assign: { [names[0]]: { general: 1, cat: "OVERVIEW" } } }]);
    const r2 = RECS.find(x => ekOf(x) === ekOf(rec));
    const it2 = (r2.items || []).find(i => i.key === it.key);
    return { ik: it.key, names,
             machine: generalMedia(r2).map(m => m.name),
             onPoint: serverMediaOf(it2, r2).map(m => m.name) };
  }, PX1);
  ok(office.machine.length === 1 && office.machine[0] === office.names[0],
     "the office shows it on the machine", office.machine.join(" | "));
  ok(office.onPoint.length === 1 && office.onPoint[0] === office.names[1],
     "  and no longer on the component", office.onPoint.join(" | "));
  ok(errs.length === 0, "no page errors on the office", errs.slice(0, 3).join(" | ") || "none");
  await p.close();

  console.log("\n3. AND THE PHONE PUTS IT IN THE SAME PLACE");
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(u => {
      localStorage.setItem("up_dests", JSON.stringify([{ id: "gas", on: true, url: u, sec: "", folder: "" }]));
      localStorage.setItem("cm_swap_off", "1"); localStorage.setItem("lang", "en");
    }, "http://127.0.0.1:9/exec");
    const ph = await ctx.newPage();
    const perr = []; ph.on("pageerror", e => perr.push(e.message));
    /* One component photograph, one of the machine, and one the office has
       taken off the record — all three in the folder. */
    const FILES = [{ id: "f1", name: "TK149_4C_09.09.2026_MP_1.jpg" },
                   { id: "f2", name: "TK149_4C_09.09.2026_MP_2.jpg" },
                   { id: "f3", name: "TK149_OVERVIEW_09.09.2026_MP.jpg" }];
    await ph.route("**/exec*", route => {
      let body = {}; try { body = JSON.parse(route.request().postData() || "{}"); } catch (e) {}
      const q = new URL(route.request().url()).searchParams;
      const action = body.action || q.get("action");
      const send = o => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
      if (action === "list") return send({ ok: true, files: FILES });
      if (action === "files") {
        const ids = String(body.ids || q.get("ids") || "").split(",");
        /* A real one-pixel JPEG, so the decode succeeds and the placement is
           measured on photographs rather than on failures. */
        const JPG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a"
          + "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAA"
          + "AAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
        return send({ ok: true, files: ids.map(id => ({ id, ok: true, mime: "image/jpeg", data: JPG })) });
      }
      return send({ ok: true });
    });
    await ph.goto(PHONE, { waitUntil: "load" }); await ph.waitForTimeout(2500);

    const REC = { equip: "TK149", date: "2026-09-09", type: "MP", cls: "HT",
                  items: [{ key: "4C", label: "LF", photos: 2 },
                          { key: "__general", general: 1, photos: 1,
                            att: [{ attachmentId: "a1", category: "OVERVIEW", seq: 1 }] }] };

    const before = await ph.evaluate(async rec => {
      const g = loadDests().find(d => d.id === "gas");
      const got = await teamPhotosFor(g, rec, null);
      return got ? Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v.length])) : null;
    }, REC);
    ok(before && before["4C"] === 2 && before["__general"] === 1,
       "with no correction, the pictures sit where they were taken",
       JSON.stringify(before));

    /* The office's decision, stored the way a team pull stores it. */
    const after = await ph.evaluate(async rec => {
      teamEditsStore([{ key: rec.equip + "|" + rec.date + "|" + rec.type,
        by: "R. Marrero", at: new Date().toISOString(),
        assign: { "TK149_4C_09.09.2026_MP_1.jpg": { general: 1, cat: "OVERVIEW" } } }]);
      const g = loadDests().find(d => d.id === "gas");
      const got = await teamPhotosFor(g, rec, null);
      return got ? Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v.length])) : null;
    }, REC);
    ok(after && after["__general"] === 2 && after["4C"] === 1,
       "the phone reads the office's decision and moves it to the machine",
       JSON.stringify(after));

    console.log("\n4. AND WHAT WAS TAKEN OFF THE RECORD STAYS OFF");
    const off = await ph.evaluate(async rec => {
      teamEditsStore([{ key: rec.equip + "|" + rec.date + "|" + rec.type,
        by: "R. Marrero", at: new Date(Date.now() + 1000).toISOString(),
        assign: { "TK149_4C_09.09.2026_MP_1.jpg": { off: 1, offWhy: "thumb over the lens" },
                  "TK149_4C_09.09.2026_MP_2.jpg": { exclude: 1, why: "duplicate" } } }]);
      const g = loadDests().find(d => d.id === "gas");
      const got = await teamPhotosFor(g, rec, null);
      return got ? Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v.length])) : null;
    }, REC);
    ok(!off["4C"], "neither the withdrawn one nor the excluded one reaches the sheet",
       JSON.stringify(off));
    ok(off["__general"] === 1, "  and the machine's own photograph is untouched",
       JSON.stringify(off));

    console.log("\n5. A POSITION THE ROUND NEVER WALKED STILL GETS ITS PICTURE");
    const onto = await ph.evaluate(async rec => {
      teamEditsStore([{ key: rec.equip + "|" + rec.date + "|" + rec.type,
        by: "R. Marrero", at: new Date(Date.now() + 2000).toISOString(),
        assign: { "TK149_4C_09.09.2026_MP_1.jpg": { point: "4F" } } }]);
      const g = loadDests().find(d => d.id === "gas");
      const got = await teamPhotosFor(g, rec, null);
      /* Through the report's own placing step, which is where it was dropped. */
      const norm = { items: (rec.items || []).map(i => ({ key: i.key, name: i.key, photos: [] })) };
      attachTeamPhotos(norm, rec, got);
      return norm.items.map(i => ({ k: i.key, n: (i.photos || []).length, filed: !!i._filed }));
    }, REC);
    const f4 = onto.find(x => x.k === "4F");
    ok(!!f4 && f4.n === 1, "the photograph is on the sheet, under the point it was filed to",
       JSON.stringify(onto));
    ok(!!f4 && f4.filed === true,
       "  on a position that carries the picture and nothing else", JSON.stringify(f4));
    ok(perr.length === 0, "no page errors on the phone", perr.slice(0, 3).join(" | ") || "none");
    await ctx.close();
  }

  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
