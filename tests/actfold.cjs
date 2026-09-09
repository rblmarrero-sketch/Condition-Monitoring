/* "EXPAND ALL" OVER A LIST THAT IS ALREADY EXPANDED.

   Photographed on the action register, by machine: sixteen groups on screen,
   every one of them open, and a button above them offering to expand them.
   Pressing it did nothing anybody could see.

   The label was read off aOpenUnits — the set of machines the reader had
   opened BY HAND. But a group is also open when it has something late or
   something critical, which is most of this page most of the time, and those
   groups are open without ever entering the set. So on the ordinary case the
   set was empty, the button said "Expand all", and pressing it merely filled
   the set: every group stayed exactly as it was.

   The same set made the header of an always-open group inert. `shut` was
   `... && !aOpenUnits.has(unit)`, so adding a critical machine to the set left
   it open, and clicking to close it did nothing at all.

   Both are this project's signature defect in its purest form: a control that
   describes the wrong thing, and then does nothing. The rule now is that the
   label is counted from the groups actually drawn, and the state a reader
   chooses is held apart from the default so it can always overrule it.

   Run: node tests/actfold.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

/* Everything is read off what is on the page: the groups, the flag that draws
   each one, and the word on the button. The suite keeps no copy of the rule. */
const state = p => p.evaluate(() => {
  const g = [...document.querySelectorAll("#actionTbl .wlu")];
  const h = [...document.querySelectorAll("#actionTbl .wlh")];
  return {
    groups: g.length,
    shut: g.filter(x => x.classList.contains("shut")).length,
    open: h.filter(x => x.getAttribute("aria-expanded") === "true").length,
    caret: h.map(x => (x.querySelector(".tw") || {}).textContent || ""),
    btn: (document.getElementById("wlAll") || {}).textContent || "",
  };
});
const words = p => p.evaluate(() => ({ fold: t("a_fold"), unfold: t("a_unfold") }));

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1800);
  await p.evaluate(BUNDLED + "()");
  await p.waitForTimeout(500);
  await p.evaluate(() => { actView = "unit"; renderActions(); showTab("actions"); });
  await p.waitForTimeout(600);

  console.log("\n── the button says what the page is");
  const W = await words(p);
  let s = await state(p);
  ok(s.groups > 6, "a list big enough to fold", s.groups + " machines");
  ok(!!s.btn, "and the control is offered", s.btn);
  ok(s.open === s.groups && s.shut === 0,
     "  as it opens, every group on screen is expanded", s.open + " of " + s.groups + " open");
  /* The photographed defect, stated as the assertion that would have caught it. */
  ok(s.btn.trim() === W.fold,
     "  so it offers to COLLAPSE them, not to expand what is already expanded",
     JSON.stringify(s.btn) + "  (expand=" + JSON.stringify(W.unfold) + ")");

  console.log("\n── and pressing it changes the page");
  await p.click("#wlAll"); await p.waitForTimeout(400);
  const shutAll = await state(p);
  ok(shutAll.shut === shutAll.groups && shutAll.open === 0,
     "collapse all closes every group", shutAll.shut + " of " + shutAll.groups + " folded");
  ok(shutAll.btn.trim() === W.unfold, "  and the label turns over", shutAll.btn);
  ok(shutAll.caret.every(c => c && c !== s.caret[0]),
     "  the carets turn with it", JSON.stringify(shutAll.caret.slice(0, 3)));

  await p.click("#wlAll"); await p.waitForTimeout(400);
  const openAll = await state(p);
  ok(openAll.open === openAll.groups && openAll.shut === 0,
     "expand all opens every group", openAll.open + " of " + openAll.groups + " open");
  ok(openAll.btn.trim() === W.fold, "  and the label turns back", openAll.btn);

  console.log("\n── a group's own header always does something");
  /* The first group is the worst one — Critical, therefore open by default and
     never in the old set. Clicking it used to be swallowed. */
  const first = await p.evaluate(() =>
    (document.querySelector("#actionTbl .wlh") || {}).dataset.unit || "");
  ok(!!first, "there is a group to click", first);
  const was = await p.evaluate(u => {
    const h = document.querySelector('#actionTbl .wlh[data-unit="' + u + '"]');
    return h ? h.getAttribute("aria-expanded") : null;
  }, first);
  ok(was === "true", "  it is open, because it is the worst machine on the page", String(was));
  await p.click('#actionTbl .wlh[data-unit="' + first + '"]'); await p.waitForTimeout(350);
  const now = await p.evaluate(u => {
    const h = document.querySelector('#actionTbl .wlh[data-unit="' + u + '"]');
    return h ? h.getAttribute("aria-expanded") : null;
  }, first);
  ok(now === "false", "  and a click closes it — the reader overrules the default", String(now));
  const mixed = await state(p);
  ok(mixed.shut === 1 && mixed.btn.trim() === W.unfold,
     "  with one folded, the control offers to open everything",
     mixed.shut + " folded · " + mixed.btn);
  await p.click('#actionTbl .wlh[data-unit="' + first + '"]'); await p.waitForTimeout(350);
  const back = await state(p);
  ok(back.shut === 0 && back.btn.trim() === W.fold,
     "  clicking again reopens it and the label follows", back.shut + " folded · " + back.btn);

  console.log("\n── the choice survives a repaint");
  await p.click("#wlAll"); await p.waitForTimeout(350);
  await p.evaluate(() => renderActions()); await p.waitForTimeout(300);
  const kept = await state(p);
  ok(kept.shut === kept.groups,
     "a save that repaints the list does not undo what the reader folded",
     kept.shut + " of " + kept.groups);

  console.log("\n── in Russian too");
  /* The office reads its language at load, like the field does. */
  await p.evaluate(() => { try { localStorage.setItem("cm_dash_lang", "ru"); } catch (e) {} });
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(1800);
  await p.evaluate(BUNDLED + "()");
  await p.waitForTimeout(500);
  await p.evaluate(() => { actView = "unit"; renderActions(); showTab("actions"); });
  await p.waitForTimeout(600);
  const ru = await words(p), rs = await state(p);
  ok(ru.fold !== W.fold && ru.unfold !== W.unfold, "the page is in Russian",
     ru.fold + " / " + ru.unfold);
  ok(rs.btn.trim() === (rs.shut ? ru.unfold : ru.fold),
     "  and the same word describes the same screen", rs.btn + " · " + rs.shut + " folded");
  await p.evaluate(() => { try { localStorage.removeItem("cm_dash_lang"); } catch (e) {} });

  ok(errs.length === 0, "no page errors", errs.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fail ? "\nFAILED: " + fail : "\nall green");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
