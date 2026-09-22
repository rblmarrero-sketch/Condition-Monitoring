/* SENT IS NOT THE SAME AS STORED.

   `up:1` has always meant "the endpoint returned 2xx for every file I sent".
   That is a statement about a conversation, not about a folder, and the two
   come apart in exactly the ways that matter on this site: a write accepted
   and then lost, a file stored at zero bytes, a folder created for one
   destination and not the other. The phone could not tell any of that from
   success — which is why the queue's best state was worded as acceptance, and
   why "confirmed" was deliberately NOT one of the words it used.

   It can ask now. Both backends answer ?action=list with names and sizes and
   take the secret the phone already sends with its ping, so a round can be
   confirmed against the folder with nothing redeployed.

   Three things this suite holds:

     · A record is only "confirmed" when the server LISTED its files. Accepted
       is not confirmed, and saying so would be the same false reassurance the
       whole sync vocabulary was rewritten to remove.
     · A server that does not answer produces NO verdict. Silence is not
       evidence of loss, and a phone that reads an unanswered request as
       "missing" cries wolf on every weak-signal sync in the pit.
     · A file listed at zero bytes is missing. It is the failure mode a
       name-only check is blindest to, because the name is right there.

   Run: node tests/confirm.cjs [port]     (needs tests/ed-srv.cjs on 8093)
*/
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/mobile/index.html`;

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on("pageerror", e => { fail++; console.log("  FAIL  PAGEERROR " + e.message); });
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForFunction(() => (document.getElementById("verNum") || {}).textContent !== "?", null, { timeout: 20000 });
  await p.waitForTimeout(500);

  console.log("\n  the request it would make");
  const req = await p.evaluate(async () => {
    const seen = [];
    const realFetch = window.fetchT;
    window.fetchT = async (u, o, ms) => { seen.push(String(u)); throw new Error("no server"); };
    try { await serverNames({ id: "gas", url: "https://x.example/exec", sec: "s3cr3t" }, "Uploads/MP/2026-08"); }
    catch (e) {}
    window.fetchT = realFetch;
    return seen[0] || "";
  });
  ok(/action=list/.test(req), "it asks the endpoint to list, not to write", req);
  ok(/folder=Uploads%2FMP%2F2026-08|folder=Uploads\/MP\/2026-08/.test(req),
    "for the folder the round was actually filed in", req);
  ok(/secret=s3cr3t/.test(req), "with the secret the phone already holds", req);
  /* Only the two backends that answer it. A Power Automate flow rejects a body
     it does not recognise, and reporting that as an unconfirmed round would be
     the endpoint working correctly reported as the endpoint being broken. */
  const able = await p.evaluate(() => ["gas", "mirror", "pa", "post"]
    .filter(id => listCapable({ id, url: "https://x/exec" })));
  ok(able.join() === "gas,mirror", "only the endpoints that answer a listing are asked", able.join());

  console.log("\n  what the server says decides it");
  const PX = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
  const verdicts = await p.evaluate(async ({ d }) => {
    const shot = () => fetch(d).then(r => r.blob());
    const mk = async id => ({ id, equip: "TK151", type: "MP", date: "2026-08-20",
      by: "R", cls: "HT", created: new Date(2026, 7, 20).toISOString(), rev: 0,
      up: 1, upAt: "2026-08-20T09:00:00.000Z", upTo: { gas: 1 },
      positions: { "fd.l": { photos: [await shot(), await shot()] } } });
    const names = ["TK151_20082026_MP.json", "a_1.jpg", "a_2.jpg"];
    const dest = [{ id: "gas", on: 1, url: "https://x.example/exec", sec: "s", folder: "" }];

    const run = async (id, reply) => {
      const rec = await mk(id); await dbPut(rec);
      const realFetch = window.fetchT;
      window.fetchT = async () => reply === null
        ? Promise.reject(new Error("no signal"))
        : ({ ok: true, text: async () => JSON.stringify({ ok: true, files: reply }) });
      await confirmRun([{ rec, names }], dest);
      window.fetchT = realFetch;
      const back = await dbGet(id);
      return back.conf || null;
    };

    return {
      all: await run("C-ALL", names.map(n => ({ name: n, size: 1000 }))),
      short: await run("C-SHORT", names.slice(0, 2).map(n => ({ name: n, size: 1000 }))),
      zero: await run("C-ZERO", names.map((n, i) => ({ name: n, size: i === 2 ? 0 : 1000 }))),
      silent: await run("C-SILENT", null),
    };
  }, { d: PX });

  ok(verdicts.all && verdicts.all.n === 3 && verdicts.all.of === 3,
    "every file listed is a confirmed round", JSON.stringify(verdicts.all));
  ok(verdicts.short && verdicts.short.n === 2 && verdicts.short.of === 3,
    "a file the server does not have is counted as missing", JSON.stringify(verdicts.short));
  ok(verdicts.short && verdicts.short.miss.indexOf("a_2.jpg") >= 0,
    "and named, so somebody knows which one", JSON.stringify(verdicts.short.miss));
  /* The failure a name-only check cannot see: the name is right there. */
  ok(verdicts.zero && verdicts.zero.n === 2,
    "a file listed at zero bytes is missing, whatever its name says",
    JSON.stringify(verdicts.zero));
  /* And the rule that keeps this from becoming noise. */
  ok(verdicts.silent === null,
    "a server that did not answer produces no verdict at all",
    JSON.stringify(verdicts.silent));

  console.log("\n  and the queue says which of the two it is");
  const rows = await p.evaluate(async () => {
    showPane("paneQueue");
    await renderPending();
    /* An ARRAY, not a map keyed by the row's heading — all four fixtures are
       the same unit on the same day, so keying by that collapsed four rows
       into one and the suite read only whichever happened to be last. */
    return { texts: [...document.querySelectorAll("#pending .pitem")]
      .map(r => ((r.querySelector(".up") || {}).textContent || "").trim()) };
  });
  const joined = rows.texts.join(" | ");
  ok(/confirmed on (the )?server/i.test(joined),
    "a confirmed round says the server listed it", joined.slice(0, 130));
  ok(/server is missing/i.test(joined),
    "and a short one says what is missing rather than claiming success",
    joined.slice(0, 200));
  /* The distinction the whole change exists for: accepted is not confirmed. */
  const words = await p.evaluate(() => ({ yes: I18N.en.up_yes, conf: I18N.en.up_conf }));
  ok(!/confirm/i.test(words.yes), "acceptance does not borrow the word confirmed", words.yes);
  ok(/confirm/i.test(words.conf), "and confirmation does not borrow the word sent", words.conf);
  const ru = await p.evaluate(() => [I18N.ru.up_conf, I18N.ru.up_short]);
  ok(ru.every(x => x && /[Ѐ-ӿ]/.test(x)), "both states are translated", ru.join(" | "));

  console.log("\n  one round's own write-back failure does not stop confirmRun's other rounds");
  /* The identical shape syncNow's per-record try/catch already guards
     against (build 372) — confirmRun's own dbPut(fresh) had no such catch at
     all, so a write failure on ANY record aborted the whole pass, silently
     dropping every other folder/record still waiting to be confirmed behind
     it, and lost dbPut's own phase/hadReqErr detail into a bare error
     string at the outer per-call catch (readback-throw). Reproduces the real
     trace: D1ZMK6_2026-09-21T23-49-53.json, "Error preparing Blob/File data
     to be stored in object store", from confirmRun's own write this time. */
  const iso = await p.evaluate(async ({ d }) => {
    const shot = () => fetch(d).then(r => r.blob());
    const mk = async id => ({ id, equip: "TK900", type: "MP", date: "2026-08-20",
      by: "R", cls: "HT", created: new Date(2026, 7, 20).toISOString(), rev: 0,
      up: 1, upAt: "2026-08-20T09:00:00.000Z", upTo: { gas: 1 },
      positions: { "fd.l": { photos: [await shot()] } } });
    const names = ["x.json"];
    const dest = [{ id: "gas", on: 1, url: "https://x.example/exec", sec: "s", folder: "" }];
    const recA = await mk("ISO-A"); await dbPut(recA);
    const recB = await mk("ISO-B"); await dbPut(recB);
    const realFetch = window.fetchT, realDbPut = window.dbPut, realSlog = window.slog;
    window.fetchT = async () => ({ ok: true, text: async () =>
      JSON.stringify({ ok: true, files: names.map(n => ({ name: n, size: 1000 })) }) });
    let logged = null;
    window.slog = (ev, o) => { if (ev === "confirm-writeback-fail") logged = o;
      return realSlog ? realSlog(ev, o) : undefined; };
    window.dbPut = async (rec) => {
      if (rec.id === "ISO-A") { const e = new Error("Error preparing Blob/File data to be stored in object store");
        e.phase = "error"; e.hadReqErr = true; throw e; }
      return realDbPut(rec);
    };
    let threw = null;
    try { await confirmRun([{ rec: recA, names }, { rec: recB, names }], dest); }
    catch (e) { threw = String((e && e.message) || e); }
    window.fetchT = realFetch; window.dbPut = realDbPut; window.slog = realSlog;
    const backA = await dbGet("ISO-A"), backB = await dbGet("ISO-B");
    return { threw, aConf: (backA || {}).conf || null, bConf: (backB || {}).conf || null, logged };
  }, { d: PX });
  ok(iso.threw === null, "confirmRun itself does not throw out to its caller over one record's write failure", iso.threw);
  ok(iso.aConf === null, "the record whose write failed was never silently marked confirmed", JSON.stringify(iso.aConf));
  ok(!!iso.bConf && iso.bConf.n === 1, "the OTHER record in the same pass still got confirmed", JSON.stringify(iso.bConf));
  ok(!!iso.logged && iso.logged.phase === "error" && iso.logged.hadReqErr === true,
    "the failure keeps dbPut's own phase/hadReqErr detail, not just a bare error string", JSON.stringify(iso.logged));

  console.log(fail ? "\nFAILED: " + fail : "\nall passed");
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + e.message); process.exit(1); });
