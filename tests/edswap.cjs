/* THE CORRECTION PANEL CAN SWAP TWO POINTS AND REMOVE A POSITION.

   Field report on build 257: "component (point) cannot be selected in the
   edit section". On a plug round where every position carried a finding the
   picker marked every other point "already has a finding" and disabled it, so
   the one correction that round needed — left rear and right rear logged the
   wrong way round, a thumb apart on a phone at −40 — could not be made.
   And: "sometimes they log a component but there are no photos or
   information in it" — a mis-tap in the field that every count downstream
   then carries.

   What has to be true:
     · on a round where the other point is taken, it is offered as a swap and
       choosing it moves BOTH findings, each with its photographs;
     · a position with nothing filed under it can be removed, the round no
       longer carries it, the removal is named on the panel, and it can be
       restored;
     · a position with photographs cannot be removed, and the panel says why.

   Run: node tests/edswap.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1800);
  await p.evaluate(BUNDLED + "()");
  await p.waitForTimeout(600);
  const T = await p.evaluate(() => {
    CMDrive.saveEdit = d => Promise.resolve({ ok: true });
    try { localStorage.setItem("cm_dash_who", "R. Marrero"); } catch (e) {}
    /* A round with two findings on two points, both with a photograph. */
    const rec = RECS.find(r => !r._void && (r.items || []).filter(i => !i.general && !itemEmpty(i) && mediaOf(i, r, true).length).length >= 2);
    const [A, B] = rec.items.filter(i => !i.general && !itemEmpty(i) && mediaOf(i, rec, true).length);
    return { rk: ekOf(rec), equip: rec.equip, date: rec.date, a: A.key, b: B.key,
             aPh: mediaOf(A, rec, true).map(m => m.name), bPh: mediaOf(B, rec, true).map(m => m.name), n: rec.items.length };
  });
  console.log("   " + JSON.stringify(T));

  console.log("── the picker offers a taken point as a swap");
  const pick = await p.evaluate(({ rk, a, b }) => {
    openEdit(rk);
    const sel = document.querySelector(`#edItems select[data-f="key"][data-k="${CSS.escape(a)}"]`);
    const o = [...sel.options].find(x => x.value === b);
    return { found: !!o, disabled: o ? o.disabled : null, text: o ? o.textContent : "", swapWord: t("ed_point_swap", { k: a }) };
  }, T);
  ok(pick.found && pick.disabled === false, "the other finding's point can be chosen", JSON.stringify(pick));
  ok(pick.text.indexOf(pick.swapWord) >= 0, "and it says it is a swap", pick.text);

  console.log("\n── choosing it moves both findings, each with its photographs");
  await p.evaluate(({ a, b }) => {
    const sel = document.querySelector(`#edItems select[data-f="key"][data-k="${CSS.escape(a)}"]`);
    sel.value = b; document.getElementById("edBy").value = "R. Marrero";
    document.getElementById("edSave").click();
  }, T);
  await p.waitForTimeout(700);
  const after = await p.evaluate(({ rk, a, b }) => {
    const r = RECS.find(x => ekOf(x) === rk);
    const nowB = r.items.find(i => i.key === b), nowA = r.items.find(i => i.key === a);
    const asg = (edits[rk] || {})[ASSIGN_KEY] || {};
    return { n: r.items.length, bFrom: nowB && nowB._from, aFrom: nowA && nowA._from,
             bPh: nowB ? mediaOf(nowB, r, true).map(m => m.name) : [], aPh: nowA ? mediaOf(nowA, r, true).map(m => m.name) : [],
             asg: Object.entries(asg).map(([n, v]) => n + "→" + v.point).sort(),
             marker: Object.entries((edits[rk] || {}).items || {}).map(([k, v]) => k + ":" + v.key).sort() };
  }, T);
  ok(after.bFrom === T.a && after.aFrom === T.b, "each finding now reads under the other's key, with where it came from", JSON.stringify({ bFrom: after.bFrom, aFrom: after.aFrom }));
  ok(after.n === T.n, "the round has the same number of positions", after.n + " vs " + T.n);
  ok(after.marker.join("|") === [T.a + ":" + T.b, T.b + ":" + T.a].sort().join("|"), "one marker carries both moves", after.marker.join(" "));
  const followed = T.aPh.every(n => after.bPh.indexOf(n) >= 0) && T.bPh.every(n => after.aPh.indexOf(n) >= 0);
  ok(followed, "and the photographs followed their findings", JSON.stringify({ wasA: T.aPh, nowUnderB: after.bPh }));

  console.log("\n── a position logged by mistake can be removed");
  const R = await p.evaluate(({ rk }) => {
    /* Into the RAW record rebuild() reads from, the way the phone would have
       written it: a named position with nothing on it. */
    const raw = imported.find(x => ekOf(x) === rk);
    raw.items.push({ key: "ZZ9", label: "Logged by mistake", detection: "DM-02" }); rebuild();
    const r2 = RECS.find(x => ekOf(x) === rk);
    openEdit(rk);
    const btn = document.querySelector('#edItems [data-edrm="ZZ9"]');
    const withPh = r2.items.find(i => !i.general && mediaOf(i, r2, true).length);
    const btn2 = withPh ? document.querySelector(`#edItems [data-edrm="${CSS.escape(withPh._from || withPh.key)}"]`) : null;
    return { there: r2.items.some(i => i.key === "ZZ9"), btn: !!btn, enabled: btn ? !btn.disabled : null,
             withPh: withPh && withPh.key, btn2: !!btn2, disabled2: btn2 ? btn2.disabled : null, why2: btn2 ? btn2.title : "", want: t("ed_rm_photos") };
  }, T);
  ok(R.there && R.btn && R.enabled, "an empty position offers Remove", JSON.stringify(R));
  ok(R.btn2 && R.disabled2 && R.why2 === R.want, "a position with photographs does not, and says why", R.why2);
  await p.evaluate(() => { document.querySelector('#edItems [data-edrm="ZZ9"]').click(); });
  await p.waitForTimeout(200);
  const marked = await p.evaluate(() => { const c = document.querySelector('#edItems [data-edcard="ZZ9"]'); return { cls: c && c.className, undo: !!document.querySelector('#edItems [data-edrm="ZZ9"]') }; });
  ok(marked.cls && /edrm/.test(marked.cls) && marked.undo, "pressing it marks the card and offers to keep it", JSON.stringify(marked));
  await p.evaluate(() => { document.getElementById("edBy").value = "R. Marrero"; document.getElementById("edSave").click(); });
  await p.waitForTimeout(700);
  const gone = await p.evaluate(({ rk }) => { const r = RECS.find(x => ekOf(x) === rk);
    return { has: r.items.some(i => i.key === "ZZ9"), removed: (r._removed || []).map(x => x.key + " by " + x.by), n: r.items.length,
             line: (document.querySelector("#edItems .edremoved") || {}).textContent || "", restore: !!document.querySelector('#edItems [data-edrestore="ZZ9"]') }; }, T);
  ok(!gone.has && gone.n === T.n, "saved: the round no longer carries it", gone.n + " positions");
  ok(gone.removed.join() === "ZZ9 by R. Marrero", "and names what was removed, and by whom", gone.removed.join());
  ok(/ZZ9/.test(gone.line) && gone.restore, "the panel shows the removal with a way back", gone.line.replace(/\s+/g, " ").slice(0, 80));

  console.log("\n── and restored");
  await p.evaluate(() => document.querySelector('#edItems [data-edrestore="ZZ9"]').click());
  await p.waitForTimeout(700);
  const back = await p.evaluate(({ rk }) => { const r = RECS.find(x => ekOf(x) === rk);
    return { has: r.items.some(i => i.key === "ZZ9"), removed: (r._removed || []).length, line: !!document.querySelector("#edItems .edremoved") }; }, T);
  ok(back.has && back.removed === 0 && !back.line, "the position is back on the round and the line is gone", JSON.stringify(back));

  ok(errs.length === 0, "no page errors", errs.join(" | ") || "none");
  console.log(fail ? `\nFAILED ${fail}` : "\nall passed");
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
