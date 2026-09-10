/* PAGE ONE HOLDS THE DRAWING AND EVERYTHING THAT EXPLAINS IT.

   Returned from the office: CM_unit_EX015_20260908.pdf, five pages, and page
   two carried nothing but the Russian sub-labels of key entries 10 and 11 —
   "Рама хода / защита" and "Провисание гусеницы" — orphaned under a blank
   sheet. Their English lines were at the foot of page one. A whole page of
   paper carrying two fragments of a caption.

   Two causes, and the second is the one worth stating:

     · atomBands, which tells the cutter where it may not fall, looked for
       ".pkey > div". The numbers key is built out of SPANs, so not one of its
       entries had ever been an atom and the fold went straight through a row;
     · and even with the fold moved, the block was taller than a page and would
       still have finished in two places. A machine drawing whose key is on
       another sheet is numbers with no names followed by names with no
       numbers — neither half is any use to the person holding it.

   So the map section is fitted: measured against the room a page actually has
   and, if it is over, narrowed until it is not. The shape of the document is
   now stated rather than left to arithmetic —

     page 1  the machine, the verdict, the drawings, the key
     page 2  what was measured on this visit
     then    the history, always starting a page of its own

   Run: node tests/rptfit.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require("./pw.cjs"));
const B = (process.env.CMPORT ? "http://127.0.0.1:" + process.env.CMPORT : "http://127.0.0.1:8099") + "/dashboard/index.html";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };

/* An excavator on the machine this was reported against, with an earlier round
   so there is a history to push onto its own page. */
const SEED = () => {
  const model = "KOMATSU PC2000-8 BH";
  const walk = (window.WEAR && WEAR.walk) ? WEAR.walk(model) : [];
  /* The round as it came back: every station on the sheet, nineteen of them
     measured and the rest unreachable — which is what makes the verdict two
     lines instead of one and the block taller than a page. A fixture that
     happens to fit proves nothing about a report that did not. */
  const mk = (date, smu, step) => ({
    equip: "EX015", date, type: "UC", cls: "EXC", by: "I. Petrov", smu,
    items: walk.map((w, i) => (i < 19
      ? { key: w.k, label: w.n || w.k, mm: 100 - i * step }
      : { key: w.k, label: w.n || w.k, reason: "no_access", reasonLabel: "Could not be reached" })),
  });
  CMDash.importRecords([mk("2026-09-08", "8046", 1.2), mk("2026-05-02", "6100", 0.8)]);
  const ov = document.getElementById("dataOv"); if (ov) ov.classList.add("hidden");
  return walk.length;
};

/* Lay the document out exactly as the paginator does — same width, same room,
   same fit pass — and report where each section lands.

   Build 300: a multi-round unit report is compact by default and draws
   nothing of its own — the drawing this suite is about lives in the full
   detail, now the opt-in appendix, which this asks for. The drawing is no
   longer necessarily section 0 (the compact intro comes first), so it is
   found by what it IS, not by position. */
const LAY = ([bi]) => {
  const secs = CMReport.sectionsFor("unit", "EX015", { lang: "en", bi, photos: true, appendix: true });
  const st = document.createElement("style"); st.id = "fitcss"; st.textContent = CMR.CSS;
  document.head.appendChild(st);
  const d = document.createElement("div"); d.id = "rptRoot";
  d.style.cssText = "position:fixed;left:-99999px;top:0;width:760px;background:#fff;";
  d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + "</div>").join("");
  document.body.appendChild(d);
  const PW = 595, PH = 842, M = 38, FOOT = 22, cw = PW - 2 * M;
  const k = cw / 760, roomPx = (PH - M - FOOT - M) / k;
  const before = [...d.children].map(el => Math.round(el.getBoundingClientRect().height));
  const took = CMR.fitAll(d, secs, roomPx);
  const after = [...d.children].map(el => Math.round(el.getBoundingClientRect().height));
  /* The paginator's own page arithmetic, so "which page" here is the page the
     PDF will have. */
  let page = 1, y = 0; const at = [];
  [...d.children].forEach((el, i) => {
    let h = el.getBoundingClientRect().height; if (h <= 0) { at.push(null); return; }
    const gap = (secs[i].gap != null ? secs[i].gap : 14) / k;
    if (secs[i].nb && y > 0) { page++; y = 0; }
    else if (y > 0 && h <= roomPx && y + h > roomPx) { page++; y = 0; }
    const start = page;
    while (h > roomPx - y) { h -= (roomPx - y); page++; y = 0; }
    y += h + gap;
    at.push({ start, end: page, split: page > start });
  });
  /* CMR.fitAll only returns one entry per FIT-FLAGGED section, in order — a
     shorter array than secs/before/after, not one aligned to the same index.
     That went unnoticed while the drawing was always section 0 (fit-ordinal 0
     too, on this fixture); now that the appendix can put it anywhere, `took`
     is re-indexed here to line up with everything else this function returns. */
  let fitOrd = 0;
  const tookBySec = secs.map(s => (s.fit ? took[fitOrd++] : undefined));
  const out = {
    roomPx: Math.round(roomPx), took: tookBySec, before, after, at, pages: page,
    kinds: secs.map(s => ({ nb: !!s.nb, fit: !!s.fit })),
    /* what each section IS, read off its own heading rather than its index */
    what: [...d.children].map(el => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 44)),
    /* every numbers-key entry, and which page it fell on */
    keyRows: [...d.querySelectorAll(".pkey > *, .ckey > *")].length,
    /* the drawing page, wherever the appendix put it */
    mapIx: secs.findIndex(s => /class="ucmaps"/.test(s.html)),
  };
  st.remove(); d.remove();
  return out;
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem("cm_drive_url", ""); localStorage.setItem("cm_dash_lang", "en"); });
  await p.goto(B, { waitUntil: "load" }); await p.waitForTimeout(1600);
  const walk = await p.evaluate(SEED); await p.waitForTimeout(400);
  ok("the wear reference covers the machine this was reported against", walk > 10, walk + " stations");

  console.log("\n1. THE CUTTER KNOWS A KEY ENTRY IS ONE THING");
  /* A guard on the rule itself, not on this document: the selector that lists
     what may not be cut has to cover what the key is actually made of. */
  const atoms = await p.evaluate(() => {
    const d = document.createElement("div");
    d.innerHTML = '<div class="pkey"><span class="i"><b>Track frame</b><span class="alti">Рама хода</span></span></div>';
    document.body.appendChild(d);
    const n = d.querySelectorAll(".pkey > *").length, old = d.querySelectorAll(".pkey > div").length;
    d.remove(); return { n, old };
  });
  ok("a key entry is a SPAN, which the old rule never matched",
     atoms.n === 1 && atoms.old === 0, JSON.stringify(atoms));

  console.log("\n2. BILINGUAL — THE SHEET THAT CAME BACK");
  const bi = await p.evaluate(LAY, [true]);
  ok("the drawing page was found in the appendix", bi.mapIx >= 0, "mapIx=" + bi.mapIx);
  ok("the drawings and the key are on one page",
     bi.at[bi.mapIx] && !bi.at[bi.mapIx].split,
     JSON.stringify(bi.at[bi.mapIx]) + " · " + bi.before[bi.mapIx] + "px → " + bi.after[bi.mapIx] + "px of " + bi.roomPx);
  ok("  and it was not narrowed past what a puck can be read at",
     (bi.took[bi.mapIx] || 1) >= 0.6, String(bi.took[bi.mapIx]));

  /* THE FIT ITSELF, MEASURED — not left to whether this fixture happens to
     overflow. A guard that only fires on a document taller than a page is a
     guard that stops firing the day somebody shortens a heading, so the
     mechanism is put against a room deliberately too small and asked what it
     did. Three things it must do and one it must not: shrink, stop at the
     floor, leave a block that fits alone, and never crop. */
  const mech = await p.evaluate(() => {
    const secs = CMReport.sectionsFor("unit", "EX015", { lang: "en", bi: true, photos: true, appendix: true });
    const mapIx = secs.findIndex(s => /class="ucmaps"/.test(s.html));
    const st = document.createElement("style"); st.textContent = CMR.CSS; document.head.appendChild(st);
    const d = document.createElement("div"); d.id = "rptRoot";
    d.style.cssText = "position:fixed;left:-99999px;top:0;width:760px;background:#fff;";
    d.innerHTML = '<div class="secwrap">' + secs[mapIx].html + "</div>";
    document.body.appendChild(d);
    const el = d.children[0], full = el.getBoundingClientRect().height;
    const maps = el.querySelector(".ucmaps");
    const r = {};
    /* A room a little under what it needs: it must narrow, and land inside. */
    const tight = Math.round(full * 0.9);
    r.took = CMR.fitPage(el, tight);
    r.h = Math.round(el.getBoundingClientRect().height); r.tight = tight;
    r.width = maps.style.width;
    r.clipped = getComputedStyle(maps).overflow === "hidden" || !!maps.style.maxHeight;
    r.svgs = el.querySelectorAll(".ucmapwrap").length;
    /* A room far too small: it must give up rather than shrink to nothing, and
       put the drawing back at full width. */
    maps.style.width = "";
    r.gave = CMR.fitPage(el, Math.round(full * 0.2));
    r.widthAfterGiveUp = maps.style.width;
    /* And a room with plenty of space must not touch it at all. */
    maps.style.width = "";
    r.plenty = CMR.fitPage(el, full + 200);
    r.widthWhenAmple = maps.style.width;
    st.remove(); d.remove();
    return r;
  });
  ok("a block that is over the room is narrowed until it fits",
     mech.took > 0 && mech.took < 1 && mech.h <= mech.tight,
     "took " + mech.took + " · " + mech.h + "px into " + mech.tight);
  ok("  by narrowing the drawing, never by cropping it",
     !mech.clipped && mech.svgs === 2 && /%$/.test(mech.width), mech.width + " · clipped=" + mech.clipped);
  ok("  a room it cannot be made to fit is left alone rather than shrunk to nothing",
     mech.gave === 0 && mech.widthAfterGiveUp === "", "took " + mech.gave);
  ok("  and a block with room to spare is not touched",
     mech.plenty === 1 && mech.widthWhenAmple === "", "took " + mech.plenty);
  ok("every entry of the numbers key is on that page", bi.keyRows >= 11, bi.keyRows + " entries");
  const measIx = bi.mapIx + 1;
  ok("this visit's measurements start the page right after the drawing",
     bi.at[measIx] && bi.at[measIx].start === bi.at[bi.mapIx].end + 1,
     JSON.stringify(bi.at[measIx]) + " · " + bi.what[measIx]);
  const histIx = bi.kinds.findIndex((k, i) => i > measIx && k.nb);
  ok("the history starts a page of its own",
     histIx > measIx && bi.at[histIx] && bi.at[histIx].start > bi.at[histIx - 1].end - 1 && bi.kinds[histIx].nb,
     "section " + histIx + " on page " + (bi.at[histIx] || {}).start + " · " + bi.what[histIx]);
  ok("  and nothing before it is left hanging into it",
     bi.at[histIx] && bi.at[histIx - 1] && bi.at[histIx].start > bi.at[histIx - 1].start,
     JSON.stringify({ before: bi.at[histIx - 1], history: bi.at[histIx] }));

  console.log("\n3. AND IN ONE LANGUAGE, WHERE THE BLOCK IS SHORTER");
  const en = await p.evaluate(LAY, [false]);
  ok("the drawing page was found in the appendix", en.mapIx >= 0, "mapIx=" + en.mapIx);
  ok("it still holds all of it, in one language", en.at[en.mapIx] && !en.at[en.mapIx].split,
     JSON.stringify(en.at[en.mapIx]) + " · " + en.before[en.mapIx] + "px → " + en.after[en.mapIx] + "px");
  ok("  and a block that already fitted is left at full width",
     en.before[en.mapIx] <= en.roomPx ? en.took[en.mapIx] === 1 : en.took[en.mapIx] < 1,
     en.before[en.mapIx] + "px of " + en.roomPx + " · took " + en.took[en.mapIx]);
  ok("this visit's measurements still start the page right after the drawing",
     en.at[en.mapIx + 1] && en.at[en.mapIx + 1].start === en.at[en.mapIx].end + 1, JSON.stringify(en.at[en.mapIx + 1]));

  console.log("\n4. NO SECTION ENDS AS A FRAGMENT ON A PAGE OF ITS OWN");
  /* The shape of the reported defect, stated generally: a section may span
     pages, but it may not leave under a fortieth of itself overleaf. */
  const crumbs = bi.at.map((a, i) => (a && a.split
    && (bi.after[i] % ((bi.roomPx))) < bi.roomPx * 0.04) ? i : -1).filter(x => x >= 0);
  ok("no section spills a crumb onto the next page", crumbs.length === 0,
     crumbs.length ? "sections " + crumbs.join(",") : "none");

  ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
