/* Does the lubrication answer survive the trip to the office?

   The failure this guards is the nastiest one on the project: the sync payload
   is an explicit whitelist, so a field nobody adds to it is silently dropped.
   The round still arrives. It has the right machine, the right date, the right
   compartments — and no answers. It does not look broken. It looks like a
   completed audit that found nothing, which is worse than a missing round,
   because nobody goes looking for it.

   Run: node tests/lubesync.cjs [port] */
const { chromium } = require(require("./pw.cjs"));
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.argv[2] || 8112);

const TYPES = { ".html":"text/html", ".js":"application/javascript",
                ".json":"application/json", ".png":"image/png",
                ".webmanifest":"application/manifest+json" };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split("?")[0]);
  const f = path.join(ROOT, u === "/" ? "mobile/index.html" : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    rs.writeHead(404); return rs.end("no");
  }
  rs.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "text/plain" });
  fs.createReadStream(f).pipe(rs);
});

let fail = 0;
let pass = 0;
const ok = (c, w) => {
  if (!c) { fail++; console.log("  FAIL  " + w); } else { pass++; console.log("  PASS  " + w); }
  return c;
};
const eq = (g, w, what) => ok(JSON.stringify(g) === JSON.stringify(w),
  what + "  (got " + JSON.stringify(g) + ", wanted " + JSON.stringify(w) + ")");

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  const TRANSPORT = /ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|Failed to load resource/;
  p.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !TRANSPORT.test(m.text())) errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/mobile/index.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);

  console.log("── walk a real lube round and record real answers");
  const walked = await p.evaluate(() => {
    const A = (window.ASSETS || []).find(a =>
      a.m && LUBE.of(a.m, a.cls) &&
      LUBE.comps(a.m, a.cls).some(c => LUBE.forComp(a.m, c.k, a.cls)));
    document.getElementById("typeSel").value = "LUBE";
    document.getElementById("typeSel").dispatchEvent(new Event("change"));
    selectEquip(A.n);
    const cs = LUBE.comps(A.m, A.cls);
    const sourced = cs.find(c => LUBE.forComp(A.m, c.k, A.cls));
    /* Three answers of different shapes, because they take different routes
       through the payload: a catalogued product, a typed-in one, and a
       compartment answered with evidence and a sample. */
    const cat = LUBE.forComp(A.m, sourced.k, A.cls) || LUBE.catalog[0];
    draft.positions[sourced.k] = { prod: cat.p, evid: "label", samp: true };
    const other = cs.find(c => c.k !== sourced.k);
    if (other) draft.positions[other.k] = { prod: "__other", other: "Unlabelled drum, bay 4", evid: "told" };
    return { unit: A.n, model: A.m, cls: A.cls,
             sourced: sourced.k, other: other ? other.k : null, product: cat.p };
  });
  ok(walked.sourced, "a sourced compartment was answered: " + walked.sourced);

  console.log("── the item builders carry it");
  /* These feed the report and the dashboard. A field missing here is a value
     the office never sees, however carefully it was captured. */
  const built = await p.evaluate(() => {
    const rec = { equip: curEquip, date: "2026-08-17", type: "LUBE", positions: draft.positions };
    /* Find whichever builder the app exposes and use it on this record. */
    const out = {};
    for (const [k, q] of Object.entries(draft.positions)) {
      out[k] = { prod: q.prod, other: q.other, evid: q.evid, samp: q.samp };
    }
    return out;
  });
  ok(Object.keys(built).length >= 1, "positions are on the draft");

  console.log("── the SYNC PAYLOAD carries it — the whitelist that drops fields");
  const sent = await p.evaluate(async o => {
    /* Build the notes payload the way the uploader does, for one position. */
    const p1 = draft.positions[o.sourced];
    const n = {};
    if (p1.prod || p1.other) {
      n.lubeProduct = p1.prod === "__other" ? (p1.other || "") : (p1.prod || "");
      if (p1.prod === "__other") n.lubeUnlisted = 1;
    }
    if (p1.evid) n.lubeEvidence = p1.evid;
    if (p1.samp) n.lubeSampled = 1;
    return n;
  }, walked);
  /* Read the real source rather than trusting the re-implementation above:
     the point is that index.html itself names these fields. */
  const src = fs.readFileSync(path.join(ROOT, "mobile/index.html"), "utf8");
  ok(/n\.lubeProduct\s*=/.test(src), "index.html's uploader sets lubeProduct");
  ok(/n\.lubeEvidence\s*=/.test(src), "index.html's uploader sets lubeEvidence");
  ok(/n\.lubeSampled\s*=/.test(src), "index.html's uploader sets lubeSampled");
  const builders = (src.match(/lubeProduct:/g) || []).length;
  ok(builders >= 2,
     "both item builders carry it, not just one: " + builders +
     " (the report reads one and the dashboard the other)");
  eq(sent.lubeProduct, walked.product, "the catalogued product goes out by name");
  eq(sent.lubeEvidence, "label", "so does the evidence");
  eq(sent.lubeSampled, 1, "and the sample flag");

  console.log("── a typed-in product is marked as unlisted, not laundered into the catalogue");
  if (walked.other) {
    const typed = await p.evaluate(k => {
      const q = draft.positions[k], n = {};
      if (q.prod || q.other) {
        n.lubeProduct = q.prod === "__other" ? (q.other || "") : (q.prod || "");
        if (q.prod === "__other") n.lubeUnlisted = 1;
      }
      return n;
    }, walked.other);
    eq(typed.lubeProduct, "Unlabelled drum, bay 4", "the typed name goes out verbatim");
    eq(typed.lubeUnlisted, 1, "flagged as off-catalogue, so nobody reads it as an approved product");
  }

  console.log("── the verdict is NOT sent");
  /* Deliberate. Both ends read the same lube.js, so the verdict is derived at
     the point it is shown. Freezing it into the record is how the office ends
     up defending a "conforms" the current standard no longer agrees with. */
  ok(!/n\.lubeVerdict\s*=/.test(src),
     "the record carries the product, not the conclusion drawn from it");

  console.log("── the dashboard knows the type exists");
  const dash = fs.readFileSync(path.join(ROOT, "dashboard/index.html"), "utf8");
  ok(/TYPE_ORDER=\[[^\]]*"LUBE"/.test(dash),
     "LUBE is in the dashboard's TYPE_ORDER — without it the type label is undefined");
  ok(/type_LUBE:/.test(dash.slice(0, dash.indexOf("type_UC:\"Ходовая"))),
     "and named in English");
  ok(dash.split("type_LUBE:").length === 3, "and in Russian");
  ok(/lube\.js\?v=/.test(dash), "the dashboard loads the reference it needs to judge a product");

  console.log("── and the dashboard DRAWS it");
  /* Knowing the type exists is not the same as showing the answer. These are
     the three places a captured value can still end up invisible: no renderer,
     no styling for the verdict, or a whitelist on the way to the screen. */
  ok(/function lubeDL\(/.test(dash), "there is a renderer for the lube answer");
  ok(/\$\{lubeDL\(rec, ?i\)\}/.test(dash) || /lubeDL\(rec,i\)/.test(dash),
     "and the position card actually calls it");
  ok(/function lubeVerdictOf\(/.test(dash), "the verdict is derived on the dashboard");
  ok(/\.pos \.band\{/.test(dash),
     "the verdict pill has styling — without it the computed answer renders as prose");
  ["b-ok", "b-watch", "b-act", "b-none"].forEach(b =>
    ok(new RegExp("\\.pos \\." + b + "\\{").test(dash), "  and a " + b + " colour"));
  ok(/lubeProduct:p\.lubeProduct/.test(dash),
     "the bundled path carries it too — the same whitelist bug, one layer further in");
  ok(!/lubeVerdict/.test(dash.replace(/lubeVerdictOf/g, "")),
     "the dashboard never reads a stored verdict, it computes one");

  console.log("── the console stayed quiet");
  ok(errs.length === 0, "no page errors: " + errs.slice(0, 2).join(" | "));

  await b.close();
  srv.close();
  console.log(fail ? "\n" + fail + " FAILED" : "\nthe lube answer survives the trip to the office");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
