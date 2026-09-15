/* WHY A ROUND WAS NOT WALKED — ONE LIST, TWO SURFACES, AND A KEY THAT COUNTS.

   Two things were asked for and they are the same thing twice:

     · the fortnight's rows get the side menu the List already has, so a round
       is deferred from wherever it is being read;
     · the reason is CHOSEN from the ten the site actually gives, with free
       text still allowed for the eleventh.

   The trap in the second is the one this project has paid for before. A
   reason is free text printed verbatim, and free text alone puts "in the
   workshop", "In workshop", "в ремонте" and "ремонт" in the folder as four
   answers to one question — so the office can read them one at a time and can
   never count them. That is exactly what `respRole` was added to cure for the
   responsible person: THE LABEL IS FOR PEOPLE, THE KEY IS FOR COUNTING.

   So the rules held here:

     1. one table, in terms.js, that neither surface copies;
     2. both ends offer the same ten, in the reader's language;
     3. the key travels to the folder beside the words, through BOTH backends —
        a field dropped at the backend is a field nobody can ever count;
     4. typing over a chosen reason DROPS its key, so a key never travels
        beside words that contradict it;
     5. the office SHOWS the standard label in ITS reader's language, not the
        Russian sentence a phone stored;
     6. and with terms.js missing the free-text box alone still records a
        reason — a deferral that cannot be categorised is worth far more than
        one that cannot be written down.

   Run: node tests/deferwhy.cjs     (needs tests/mock.cjs on 8099) */
const fs = require("fs"), path = require("path");
const { chromium } = require(require("./pw.cjs"));
const BASE = process.env.CMPORT ? "http://127.0.0.1:" + process.env.CMPORT : "http://127.0.0.1:8099";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };
const R = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

(async () => {
  console.log("1. ONE TABLE, AND IT IS THE ONE THE SITE GAVE");
  const TERMS = require("../mobile/terms.js");
  ok("terms.js carries the reasons", Array.isArray(TERMS.WHY), (TERMS.WHY || []).length + " reason(s)");
  ok("  all ten of them", (TERMS.WHY || []).length === 10, (TERMS.WHY || []).length);
  /* Named, not counted: a list that quietly loses one is a list that stops
     matching the paper the site works from. */
  const want = ["sched", "dup", "operator", "notgiven", "repair",
                "clean", "access", "unsafe", "transport", "tools"];
  ok("  in the order they were given", TERMS.WHY.map(w => w.k).join(",") === want.join(","),
     TERMS.WHY.map(w => w.k).join(","));
  ok("  every one has both languages",
     TERMS.WHY.every(w => w.en && w.ru && w.en !== w.ru),
     TERMS.WHY.filter(w => !w.en || !w.ru || w.en === w.ru).map(w => w.k).join(",") || "all two-language");
  ok("  and the keys are unique", new Set(TERMS.WHY.map(w => w.k)).size === 10);
  ok("a key reads back in each language",
     TERMS.whyLabel("repair", "en") === "Equipment under repair" &&
     TERMS.whyLabel("repair", "ru") === "Техника в ремонте",
     TERMS.whyLabel("repair", "en") + " / " + TERMS.whyLabel("repair", "ru"));
  /* A code is never printed at a superintendent: a key one surface does not
     know goes quiet so the caller falls back to the words. */
  ok("  an unknown key answers with nothing, never the code",
     TERMS.whyLabel("zz_unknown", "en") === "", JSON.stringify(TERMS.whyLabel("zz_unknown", "en")));
  ok("whyText prefers the standard label", TERMS.whyText("repair", "typed words", "ru") === "Техника в ремонте");
  ok("  and falls back to the inspector's own words",
     TERMS.whyText("", "on a low-loader", "en") === "on a low-loader");

  console.log("\n2. NEITHER SURFACE KEEPS A COPY OF THE LIST");
  /* COMMENTS ARE NOT COPIES. A note explaining the rule quotes a label to
     explain it, and the first run of this check read the office's own comment
     — "would file 'workshop' against the inspectors' 'Equipment under repair'"
     — as a second copy of the list. tests/audit-scan.cjs learned the identical
     lesson the identical way; a check that reads documentation as code reports
     the care somebody took as the defect it was taken against. */
  const noComments = x => String(x)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const mob = noComments(R("mobile/index.html")), dash = noComments(R("dashboard/index.html"));
  const copied = s => TERMS.WHY.filter(w => s.indexOf(w.en) >= 0 || s.indexOf(w.ru) >= 0).map(w => w.k);
  ok("the phone has no second copy", copied(mob).length === 0, copied(mob).join(",") || "reads TERMS.WHY");
  ok("the office has no second copy", copied(dash).length === 0, copied(dash).join(",") || "reads TERMS.WHY");

  console.log("\n3. THE KEY REACHES THE FOLDER, THROUGH BOTH BACKENDS");
  const mobRaw = R("mobile/index.html"), dashRaw = R("dashboard/index.html");
  ok("the phone sends it with the deferral", /whyKey:\s*d\.whyKey/.test(mobRaw));
  /* The backends whitelist the deferral's fields, so one they do not name is
     one the office can never see however carefully the phone records it. */
  ok("the live backend carries it through", /whyKey:\s*j\.whyKey/.test(R("docs/yandex/function.js")));
  ok("  and the retired one is kept field-for-field in step",
     (R("docs/google-upload.gs").match(/whyKey:\s*j\.whyKey/g) || []).length === 2,
     (R("docs/google-upload.gs").match(/whyKey:\s*j\.whyKey/g) || []).length + " of 2 call sites");
  ok("the office sends it too", /whyKey,\s*by,\s*at/.test(dashRaw) || /whyKey\s*=\s*clear/.test(dashRaw));

  const b = await chromium.launch();

  console.log("\n4. THE PHONE: THE FORTNIGHT HAS THE LIST'S SIDE MENU");
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const perr = []; p.on("pageerror", e => perr.push(e.message));
  await p.addInitScript(() => { localStorage.setItem("cm_lang", "en"); localStorage.setItem("cm_due_view", "week"); });
  await p.goto(BASE + "/mobile/index.html", { waitUntil: "load" });
  await p.waitForTimeout(1800);
  /* A schedule of this phone's own, so the fortnight has rows to draw
     whatever the fixture folder happens to hold. */
  const seeded = await p.evaluate(() => {
    const iso = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
    SCHED = { generated: new Date().toISOString(), byUnit: {
      TK146: [{ plan: iso(0), wo: "WO-000001", hours: 250, priority: "P2", types: ["MP"] }],
      TK147: [{ plan: iso(1), wo: "WO-000002", hours: 250, priority: "P2", types: ["MP"] }],
    } };
    showPane("paneDue"); dueView = "week"; dueSpan = "all"; renderDue();
    return document.querySelectorAll("#dueWeekList .agitem").length;
  });
  ok("the fortnight draws rows", seeded >= 2, seeded + " row(s)");
  const menus = await p.evaluate(() => ({
    rows: document.querySelectorAll("#dueWeekList .agrow").length,
    menus: document.querySelectorAll("#dueWeekList .dueforget").length,
    label: (document.querySelector("#dueWeekList .dueforget") || {}).getAttribute
      ? document.querySelector("#dueWeekList .dueforget").getAttribute("aria-label") : "",
  }));
  ok("every row has one", menus.menus === menus.rows && menus.rows >= 2,
     menus.menus + " menu(s) on " + menus.rows + " row(s)");
  ok("  and it is named for a screen reader", !!menus.label, menus.label);
  /* The same control as the List's — one name, so the two views cannot come
     to mean different things by the same press. */
  ok("  it is the same control the List uses",
     (mobRaw.match(/class="dueforget"/g) || []).length >= 2,
     (mobRaw.match(/class="dueforget"/g) || []).length + " uses of .dueforget");

  console.log("\n5. IT OPENS THE SAME DIALOG, WITH THE TEN IN IT");
  await p.evaluate(() => document.querySelector("#dueWeekList .dueforget").click());
  await p.waitForTimeout(400);
  const dlg = await p.evaluate(() => ({
    open: document.getElementById("dueDlg").open,
    opts: [...document.getElementById("dueWhySel").options].map(o => o.value),
    first: [...document.getElementById("dueWhySel").options].map(o => o.textContent)[1] || "",
    title: document.getElementById("dueDlgT").textContent,
  }));
  ok("the dialog opens on that round", dlg.open, dlg.title);
  ok("  the picker offers the ten and a blank", dlg.opts.length === 11 && dlg.opts[0] === "",
     dlg.opts.length + " option(s)");
  ok("  in the language on screen", dlg.first === "Incorrect schedule", dlg.first);

  console.log("\n6. CHOOSING FILLS THE WORDS; TYPING DROPS THE KEY");
  const chose = await p.evaluate(() => {
    const s = document.getElementById("dueWhySel");
    s.value = "repair"; s.dispatchEvent(new Event("change"));
    return document.getElementById("dueWhy").value;
  });
  ok("choosing writes the sentence somebody will read", chose === "Equipment under repair", chose);
  const typed = await p.evaluate(() => {
    const w = document.getElementById("dueWhy");
    w.value = "on a low-loader at the crusher"; w.dispatchEvent(new Event("input"));
    return document.getElementById("dueWhySel").value;
  });
  ok("  typing over it clears the chosen reason", typed === "", JSON.stringify(typed));

  /* CHOOSE OR TYPE, ONE AT A TIME. The box is the alternative to the ten, not
     an addition, so while a reason is chosen it is filled and put away —
     showing the same sentence twice reads as a mistake and invites somebody
     to edit one half of a pair that has to agree. */
  const swap = await p.evaluate(() => {
    const sel = document.getElementById("dueWhySel"), own = document.getElementById("dueWhy").closest("label");
    sel.value = "clean"; sel.dispatchEvent(new Event("change"));
    const chosen = { hidden: own.classList.contains("hidden"), why: document.getElementById("dueWhy").value };
    sel.value = ""; sel.dispatchEvent(new Event("change"));
    return { chosen, back: { hidden: own.classList.contains("hidden"), why: document.getElementById("dueWhy").value } };
  });
  ok("  with a reason chosen the box is put away", swap.chosen.hidden === true, JSON.stringify(swap.chosen));
  ok("    carrying that reason's words", swap.chosen.why === "Cleaning required", swap.chosen.why);
  ok("  and choosing the blank brings it back, empty",
     swap.back.hidden === false && swap.back.why === "", JSON.stringify(swap.back));

  console.log("\n7. WHAT IS STORED, AND WHAT IS SENT");
  const stored = await p.evaluate(async () => {
    const s = document.getElementById("dueWhySel");
    s.value = "unsafe"; s.dispatchEvent(new Event("change"));
    document.getElementById("dueDlgOk").click();
    await new Promise(r => setTimeout(r, 400));
    const d = deferOf("MP", "TK146");
    return d ? { why: d.why, whyKey: d.whyKey } : null;
  });
  ok("the deferral keeps both halves", !!stored && stored.whyKey === "unsafe", JSON.stringify(stored));
  ok("  the words are the ones shown, not the code",
     !!stored && stored.why === "Unsafe conditions", (stored || {}).why);

  console.log("\n7b. \"NOT BEING DONE\" IS A CHIP, NOT A COMPLETE ANSWER — AND OK SAYS SO");
  /* Read off a handset: tap the chip, tap OK, nothing visibly happens. It was
     never a dead handler — the chip highlighted exactly as written and OK's
     guard fired exactly as written — but a rejection was one small grey
     sentence under a dialog that stayed open, which a phone at -40 with
     gloves on cannot tell apart from a button doing nothing at all. The fix
     is not to relax the rule (a reason is still required); it is that OK
     must LOOK unpressable rather than silently refuse a real press, and a
     real press is what this asserts — page.click(), which fails the way a
     finger does when the element cannot be interacted with. */
  await p.evaluate(() => document.querySelector('#dueWeekList [data-f="TK147"]').click());
  await p.waitForTimeout(300);
  ok("the dialog opens on the second row", await p.evaluate(() => document.getElementById("dueDlg").open));
  /* THE CLASS NAME IS NOT THE PROOF. build 376 shipped with the "off" chip
     correctly gaining class="btn chipbtn danger" on a real tap and NOTHING
     ON SCREEN CHANGING, because .btn.danger had no rule at all — read off a
     handset the same day this shipped: "doesn't change color when touched".
     A test that only reads className would have called that build passing.
     getComputedStyle is what a screen actually shows. */
  const chipColorBefore = await p.evaluate(() =>
    getComputedStyle(document.querySelector('#dueWhen [data-w="off"]')).backgroundColor);
  await p.click('#dueWhen [data-w="off"]');
  const offState = await p.evaluate(() => ({
    chip: document.querySelector('#dueWhen [data-w="off"]').className,
    color: getComputedStyle(document.querySelector('#dueWhen [data-w="off"]')).backgroundColor,
    okDisabled: document.getElementById("dueDlgOk").disabled,
    msg: document.getElementById("dueDlgMsg").textContent,
  }));
  ok("  the chip itself still responds to the tap", /danger/.test(offState.chip), offState.chip);
  ok("  and a screen, not just the DOM, can see it: the fill actually changed",
     offState.color !== chipColorBefore, chipColorBefore + " -> " + offState.color);
  ok("  and OK is visibly disabled with no reason typed yet", offState.okDisabled === true,
     JSON.stringify(offState));
  let blocked = false;
  try { await p.click("#dueDlgOk", { timeout: 1000 }); } catch (e) { blocked = true; }
  ok("  a real tap on OK cannot even land while it is disabled", blocked === true);
  await p.fill("#dueWhy", "no access, gate locked");
  ok("  typing a reason re-enables it immediately",
     await p.evaluate(() => document.getElementById("dueDlgOk").disabled) === false);
  const offStored = await p.evaluate(async () => {
    document.getElementById("dueDlgOk").click();
    await new Promise(r => setTimeout(r, 400));
    return deferOf("MP", "TK147");
  });
  ok("  and the round is recorded as not being done at all, not merely deferred",
     !!offStored && offStored.until === null, JSON.stringify(offStored));
  ok("  with the reason that was typed", !!offStored && offStored.why === "no access, gate locked",
     (offStored || {}).why);

  console.log("\n7c. AND THE AGENDA ITSELF SAYS SO — NOT JUST cm_due_defer");
  /* Read off a handset the same day 7b's fix shipped: "when I press OK it
     doesn't do anything — it should update then synchronize." The dialog
     WAS saving correctly and closing correctly; dueWeekRows() had never once
     asked deferOf(), the identical gap this file's own §"THE AGENDA OBEYS
     THE HOLD-OFF" precedent already closed for DUE.offRound — so TK147 sat
     on the agenda completely unchanged, still counted as outstanding, with
     no visible sign the round had been answered at all. */
  const agenda = await p.evaluate(() => ({
    span: document.getElementById("dueSpanF").textContent.replace(/\s+/g, " "),
    stillOnScreen: !!document.querySelector('#dueWeekList [data-u="TK147"]'),
    rowClasses: (document.querySelector('#dueWeekList [data-u="TK147"]') || {}).className || "",
    rowText: (document.querySelector('#dueWeekList [data-u="TK147"]') || {}).textContent
      .replace(/\s+/g, " ") || "",
  }));
  ok("the round is not silently dropped — it is still on the agenda",
     agenda.stillOnScreen, agenda.rowText);
  ok("  visibly marked as answered, not outstanding", /deferred/.test(agenda.rowClasses),
     agenda.rowClasses);
  ok("  with the reason on the row, the same as the flat List prints its own",
     /no access, gate locked/.test(agenda.rowText), agenda.rowText);
  /* TK146 (section 7, put off 7 days) and TK147 (this section, cancelled
     outright) are the whole seed, so with both answered the badge the field
     actually watches — the one open in the earlier screenshot report — reads
     zero on both spans, not the two it opened this dialog showing. */
  ok("  and it no longer counts toward either badge — the number the field actually watches",
     agenda.span === "Today0All 14 days0", agenda.span);

  ok("no page errors on the phone", perr.length === 0, perr.slice(0, 2).join(" | "));
  await p.close();

  console.log("\n8. THE OFFICE OFFERS THE SAME TEN, AND READS THEM IN ITS OWN LANGUAGE");
  const d = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const derr = []; d.on("pageerror", e => derr.push(e.message));
  await d.addInitScript(() => { localStorage.setItem("cm_drive_url", ""); localStorage.setItem("cm_dash_lang", "en"); });
  await d.goto(BASE + "/dashboard/index.html", { waitUntil: "load" });
  await d.waitForTimeout(1800);
  await d.evaluate(() => { const o = document.getElementById("dataOv"); if (o) o.classList.add("hidden"); });
  const off = await d.evaluate(() => {
    askDefer("MP|TK146");
    return { opts: [...document.getElementById("dfWhySel").options].map(o => o.value),
             second: [...document.getElementById("dfWhySel").options][1].textContent };
  });
  ok("the office picker offers the same ten", off.opts.length === 11, off.opts.length + " option(s)");
  ok("  the same keys, in the same order",
     off.opts.slice(1).join(",") === want.join(","), off.opts.slice(1).join(","));
  /* THE HALF THAT MATTERS ACROSS A LANGUAGE BOUNDARY: a Russian phone stores
     Russian words, and an English-speaking engineer must not be handed them. */
  const shown = await d.evaluate(() => ({
    en: deferWhy({ whyKey: "repair", why: "Техника в ремонте" }),
    free: deferWhy({ whyKey: "", why: "on a low-loader" }),
  }));
  ok("a keyed reason is shown in the reader's language",
     shown.en === "Equipment under repair", shown.en);
  ok("  and a typed one is shown as it was written", shown.free === "on a low-loader", shown.free);
  const ru = await d.evaluate(() => { lang = "ru"; return deferWhy({ whyKey: "repair", why: "anything" }); });
  ok("  and it follows the office's own language switch", ru === "Техника в ремонте", ru);
  ok("no page errors in the office", derr.length === 0, derr.slice(0, 2).join(" | "));
  await d.close();

  console.log("\n9. WITHOUT terms.js THE REASON IS STILL RECORDED");
  /* The shim rule: TERMS must never be a hard dependency. A phone whose first
     load got index.html and nothing else must still be able to say why. */
  const q = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const qerr = []; q.on("pageerror", e => qerr.push(e.message));
  await q.route("**/terms.js*", r => r.abort());
  await q.addInitScript(() => { localStorage.setItem("cm_lang", "en"); });
  await q.goto(BASE + "/mobile/index.html", { waitUntil: "load" });
  await q.waitForTimeout(1800);
  const bare = await q.evaluate(async () => {
    dueNotDoing("MP", "TK199");
    await new Promise(r => setTimeout(r, 300));
    const sel = document.getElementById("dueWhySel");
    const wrap = sel && sel.closest("label");
    const hidden = !wrap || wrap.classList.contains("hidden");
    const w = document.getElementById("dueWhy");
    w.value = "no access to the bay"; w.dispatchEvent(new Event("input"));
    document.getElementById("dueDlgOk").click();
    await new Promise(r => setTimeout(r, 300));
    const d = deferOf("MP", "TK199");
    return { hidden, why: d && d.why, whyKey: d && d.whyKey };
  });
  ok("the picker is hidden rather than empty", bare.hidden === true, JSON.stringify(bare.hidden));
  ok("  and the free text alone still records the reason",
     bare.why === "no access to the bay", JSON.stringify(bare.why));
  ok("  with no key, because none was chosen", !bare.whyKey, JSON.stringify(bare.whyKey));
  ok("the page still booted", qerr.length === 0, qerr.slice(0, 2).join(" | "));
  await q.close();

  await b.close();
  console.log("\n" + (fails.length ? fails.length + " FAILED: " + fails.join(" | ") : "ALL PASS"));
  process.exit(fails.length ? 1 : 0);
})();
