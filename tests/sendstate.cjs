/* WHAT THE PHONE SAYS ABOUT WORK IT IS HOLDING.

   The queue had one word for two very different situations. A round whose
   findings are already on a screen in the office — the sidecar goes up first,
   on its own, in ten kilobytes, while the photographs climb out behind it over
   the next several minutes — read exactly the same as a round that has never
   left the phone: "Waiting to send".

   That is this project's worst defect class again. Nothing throws, nothing is
   lost, and an inspector reasonably concludes the app is not working, re-sends
   a round that is already in, or worse, keeps a phone on charge in a cab for
   an hour waiting for something that finished forty minutes ago.

   And the header said "Synced", which is a claim about a system this phone has
   never spoken to. What it knows is narrower: which destination accepted which
   file. So that is what it is allowed to say.

   Run: node tests/sendstate.cjs [port]    (needs tests/ed-srv.cjs on 8093)
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

  console.log("\n  the word itself");
  /* Never assert the absence of a string across the whole file — the design
     notes talk ABOUT the old wording, and a suite that fails on a comment is a
     suite somebody deletes. Ask the running app what the pill would say. */
  const pill = await p.evaluate(() => ({ en: I18N.en.net_synced, ru: I18N.ru.net_synced }));
  ok(!/^Synced$/i.test(pill.en), "the header does not claim a sync it cannot see", pill.en);
  ok(/sent/i.test(pill.en), "it claims only what it knows — that the files went", pill.en);
  ok(pill.ru && pill.ru !== "Синхронизировано", "and the Russian moved with it", pill.ru);

  console.log("\n  every state has a phrase in both languages");
  const keys = ["up_yes", "up_wait", "up_part", "up_rec", "up_sending", "up_err", "up_never"];
  const miss = await p.evaluate(ks => ks.filter(k => !I18N.en[k] || !I18N.ru[k]), keys);
  ok(miss.length === 0, "no state falls through to its own key name", miss.join(",") || "none");

  /* ---- the distinction the list used to lose -------------------------------
     Drive a record through the three states by hand rather than by uploading:
     the states are a function of what is stored on the record, and that is the
     contract worth pinning. */
  console.log("\n  a round with nothing sent, and a round whose findings are in");
  const PX = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
  const say = await p.evaluate(async d => {
    const shot = () => fetch(d).then(r => r.blob());
    // two identical rounds, five photographs each; only what has been ACCEPTED differs
    const base = async () => ({ equip: "TK151", type: "MP", date: "2026-08-20", by: "R. Marrero",
      cls: "HT", created: new Date(2026, 7, 20).toISOString(), rev: 0, up: 0, upTo: {},
      positions: { "fd.l": { photos: [await shot(), await shot(), await shot()] },
                   "fd.r": { photos: [await shot(), await shot()] } } });
    const a = await base(); a.id = "SEND-NONE";
    const b = await base(); b.id = "SEND-PART";
    // the sidecar landed and two of the five photographs followed it
    b.sent = { gas: { "TK151_20082026_MP.json": 1, "a_1.jpg": 1, "a_2.jpg": 1 } };
    await dbPut(a); await dbPut(b);
    localStorage.setItem("up_dests", JSON.stringify([{ id: "gas", on: 1, url: "https://x/exec" }]));
    UP.on = 1;
    showPane("paneQueue");
    await renderPending();
    const row = id => {
      const rows = [...document.querySelectorAll("#pending .pitem")];
      const r = rows.find(x => (x.querySelector(".b") || {}).textContent !== undefined
        && x.textContent.includes("TK151"));
      return r;
    };
    // read them back in list order, newest first — both share a date, so read all
    return [...document.querySelectorAll("#pending .pitem")].map(r => ({
      txt: (r.querySelector(".up") || {}).textContent || "",
      k: ((r.querySelector(".up") || {}).className || "").replace("up ", ""),
    }));
  }, PX);
  const texts = say.map(s => s.txt);
  ok(texts.some(t => /waiting to send/i.test(t)),
    "the round that has never left the phone still says so", texts.join(" | "));
  ok(texts.some(t => /photos still going/i.test(t)),
    "the round whose findings are in says the findings are in", texts.join(" | "));
  ok(new Set(texts).size === texts.length,
    "and the two no longer read identically", texts.join(" | "));

  console.log("\n  it counts the photographs, not the files");
  /* The sidecar is not a photograph. Counting it made a round with no
     photographs at all report "1/0", which is the kind of number that makes
     somebody stop believing the rest of the screen. */
  const cnt = texts.find(t => /photos still going/i.test(t)) || "";
  const m = cnt.match(/(\d+)\s*\/\s*(\d+)/);
  ok(m, "it shows how far through the photographs it is", cnt);
  ok(m && Number(m[2]) === 5, "out of the five this round actually carries", m ? m[0] : "-");
  ok(m && Number(m[1]) === 2, "and the sidecar is not counted as one of them", m ? m[0] : "-");

  console.log("\n  sending now is said of the round that is sending");
  const flight = await p.evaluate(async () => {
    syncingId = "SEND-NONE";
    await renderPending();
    const out = [...document.querySelectorAll("#pending .pitem")].map(r =>
      (r.querySelector(".up") || {}).textContent || "");
    syncingId = null;
    await renderPending();
    const after = [...document.querySelectorAll("#pending .pitem")].map(r =>
      (r.querySelector(".up") || {}).textContent || "");
    return { out, after };
  });
  ok(flight.out.filter(t => /sending now/i.test(t)).length === 1,
    "exactly one row claims to be on the wire", flight.out.join(" | "));
  /* A row still saying "sending" after the sync ended is the same lie in a
     smaller font. */
  ok(flight.after.every(t => !/sending now/i.test(t)),
    "and none of them says it once the sync has stopped", flight.after.join(" | "));

  console.log("\n  a finished round says what actually happened to it");
  const fin = await p.evaluate(async () => {
    const r = await dbGet("SEND-NONE");
    r.up = 1; r.upAt = "2026-08-20T09:14:00.000Z"; r.upTo = { gas: 1 };
    await dbPut(r); await renderPending();
    const rows = [...document.querySelectorAll("#pending .pitem")];
    return rows.map(x => (x.querySelector(".up") || {}).textContent || "");
  });
  /* The word for "every file accepted" is the dictionary's ("Sent successfully"); what
     must hold is that it is said, and that no row claims the cloud. */
  const sentWord = await p.evaluate(() => I18N.en.up_yes);
  ok(fin.some(t => t.indexOf(sentWord) === 0),
    "it names acceptance, not a cloud", fin.join(" | "));
  ok(fin.every(t => !/in the cloud/i.test(t)),
    "the unverifiable claim is gone", fin.join(" | "));

  console.log("\n  with uploading switched off it is honest about the risk");
  /* Only of the rounds that are actually in one place. A round every
     destination has already accepted is not phone-only just because the switch
     was turned off afterwards, and saying it was would be a false alarm — the
     same failure as the false reassurance this whole suite is about. */
  const off = await p.evaluate(async () => {
    /* UP.on is a GETTER over the destination list — assigning to it does
       nothing at all, silently, which is how this suite spent a run believing
       it had switched uploading off while every branch behaved as if it were
       on. Take the destinations away instead; that is what "off" means here. */
    /* An empty list is not "off" on this build: the shipped defaults are put
       back into it, on purpose, so an inspector never has to configure a phone.
       Off is every destination UNTICKED but still carrying its URL, which
       loadDests() leaves alone — and the parsed list is cached, so the cache
       has to be dropped or the next read answers with the old one. */
    localStorage.setItem("up_dests", JSON.stringify(
      loadDests().map(d => Object.assign({}, d, { on: false, url: d.url || "https://x/exec" }))));
    destsCache = null; destsRaw = null;
    /* A third round that has never been touched by the uploader, because by
       now the other two both have — and the whole point of the reordering
       above is that those two must NOT be called phone-only. */
    await dbPut({ id: "SEND-OFF", equip: "TK900", type: "MP", date: "2026-08-21",
      by: "R. Marrero", cls: "HT", created: new Date(2026, 7, 21).toISOString(),
      rev: 0, up: 0, upTo: {}, positions: { "fd.l": { photos: [] } } });
    await renderPending();
    return [...document.querySelectorAll("#pending .pitem")].map(x => ({
      unit: ((x.querySelector(".a") || {}).textContent || ""),
      txt: (x.querySelector(".up") || {}).textContent || "" }));
  });
  const virgin = off.filter(o => /TK900/.test(o.unit));
  ok(virgin.length === 1 && /this phone/i.test(virgin[0].txt),
    "a round that has never left says it exists in one place only",
    virgin.map(o => o.txt).join(" | "));
  const gone = off.filter(o => !/TK900/.test(o.unit));
  ok(gone.length === 2 && gone.every(o => !/this phone/i.test(o.txt)),
    "and the two that have left are not downgraded by a switch",
    gone.map(o => o.txt).join(" | "));

  console.log(fail ? "\nFAILED: " + fail : "\nall passed");
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + e.message); process.exit(1); });
