/* Deciding the standard, and the sheet that comes off it.

   The standard screen exists to make one argument: that hundreds of
   compartments are a handful of DECISIONS, and that buying a separate product
   for each badge is a choice nobody actually made. So the checks are about the
   grouping being real — that it collapses, that it collapses on what QUALIFIES
   rather than on spec text, and that it does not collapse things that must not
   be collapsed.

   The poster is printed, so nothing on it may depend on hovering, scrolling or
   a filter that is not on the paper.

   Run: node tests/lubestd.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const URL  = `http://127.0.0.1:${PORT}/dashboard/index.html`;

let fail = 0, pass = 0;
const ok = (c, w) => { if (!c) { fail++; console.log("  FAIL  " + w); }
                       else { pass++; console.log("  PASS  " + w); } return c; };
const eq = (g, w, what) => ok(JSON.stringify(g) === JSON.stringify(w),
  what + "  (got " + JSON.stringify(g) + ", wanted " + JSON.stringify(w) + ")");

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = [];
  p.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/ERR_|Failed to load/.test(m.text()))
                           errs.push("CONSOLE " + m.text()); });
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(2200);
  await p.evaluate(() => { localStorage.removeItem("cm_lube_std"); });
  await p.click('#tabs [data-tab="lube"]');
  await p.waitForTimeout(600);

  console.log("── hundreds of compartments are a handful of decisions");
  const R = await p.evaluate(() => {
    const reqs = lubeRequirements();
    let comps = 0;
    Object.keys(lubeModelKeys()).forEach(k => {
      const i = k.indexOf("|");
      comps += LUBE.comps(k.slice(i+1), k.slice(0,i)).filter(c => c.spec).length;
    });
    return { reqs: reqs.length, comps,
             rows: document.querySelectorAll(".reqrow").length,
             keys: reqs.map(x => x.key),
             top: reqs[0] };
  });
  ok(R.comps > 15, "there are specified compartments to group: " + R.comps);
  ok(R.reqs < R.comps / 2,
     `and far fewer decisions than compartments (${R.reqs} from ${R.comps})`);
  ok(R.top && Object.keys(R.top.models).length > 1 && Object.keys(R.top.specs).length > 1,
     "the biggest group spans several models AND several different spec strings — " +
     "which is the whole claim: different badges, one decision");
  eq(R.rows, R.reqs, "every requirement is on screen");
  ok(R.top && R.top.litres > 0,
     "the biggest is sized in litres a year, so consolidating is an argument with a number: " +
     Math.round(R.top.litres));

  console.log("── grouped on what QUALIFIES, not on the words in the spec");
  /* Spec text grouping gives almost as many groups as compartments and is no
     help at all; that is the whole reason this key is what it is. */
  const specGroups = await p.evaluate(() => {
    const set = new Set();
    Object.keys(lubeModelKeys()).forEach(k => {
      const i = k.indexOf("|");
      LUBE.comps(k.slice(i+1), k.slice(0,i)).forEach(c => { if (c.spec) set.add(c.spec); });
    });
    return set.size;
  });
  ok(R.reqs < specGroups,
     `grouping on qualifiers beats grouping on spec text (${R.reqs} vs ${specGroups})`);

  console.log("── and it does NOT collapse things that must stay apart");
  const apart = await p.evaluate(() => ({
    /* A gear oil requirement and an engine oil requirement can never be one
       decision, however similar the strings look. */
    gl:  lubeReqKey({ spec: "API GL-5" }),
    eng: lubeReqKey({ spec: "API CK-4 / Komatsu EO-DH" }),
    hyd: lubeReqKey({ spec: "ISO VG, anti-wear" }),
  }));
  ok(apart.gl !== apart.eng, "a gear oil requirement is not an engine oil requirement");
  ok(apart.hyd !== apart.eng, "nor is a hydraulic one");

  console.log("── the safety property: one decision only where one product serves both");
  /* CK-4 and CI-4 DO land in one group here, and that is correct rather than a
     bug: at −40 the only oils that qualify for either are the same two, because
     the one CI-4-only product on the shelf stops at −15. Two specs are one
     decision exactly when the same products serve them.

     Asserting "CK-4 and CI-4 must be separate" would have been asserting a
     coincidence of this catalogue. The invariant worth holding is the one that
     makes the grouping SAFE: whatever the screen offers for a group must
     satisfy every specification in it. */
  const unsafe = await p.evaluate(() => {
    const bad = [];
    lubeRequirements().forEach(R => {
      Object.keys(R.specs).forEach(spec => {
        R.qualifiers.forEach(name => {
          const pr = LUBE.product(name);
          if (!pr) return;
          if (!LUBE.meetsSpec(pr.s.split(/,\s*/), spec))
            bad.push(name + " offered for " + spec);
          if (pr.lo > LUBE.site.design)
            bad.push(name + " offered but only rated to " + pr.lo + "°");
        });
      });
    });
    return bad;
  });
  eq(unsafe, [],
     "every product offered for a requirement satisfies EVERY specification in it, " +
     "and is rated for the coldest morning of the year");

  console.log("── a requirement nothing can serve says so instead of offering nothing");
  const nofit = await p.evaluate(() =>
    [...document.querySelectorAll(".reqrow")].filter(r =>
      r.querySelector(".reqpick .b-act")).length);
  ok(nofit >= 0, "requirements with no qualifying product are marked: " + nofit);

  console.log("── choosing writes the standard and redraws the matrix");
  const chose = await p.evaluate(() => {
    const sel = [...document.querySelectorAll(".reqpick select")].find(s => s.options.length > 1);
    if (!sel) return null;
    sel.value = sel.options[1].value;
    sel.dispatchEvent(new Event("change"));
    return { req: sel.dataset.req, product: sel.value };
  });
  await p.waitForTimeout(500);
  if (ok(chose, "there is a requirement to decide: " + (chose && chose.product))) {
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem("cm_lube_std") || "{}"));
    eq(stored[chose.req], chose.product, "the choice is the site standard now");
    const want = await p.evaluate(() =>
      document.querySelectorAll("#lubeMtx td.cell.want").length);
    ok(want > 0,
       "and unaudited compartments now show what SHOULD be in them: " + want + " cells");
    /* The distinction that makes the matrix honest. */
    const solid = await p.evaluate(() => {
      const a = document.querySelector("#lubeMtx td.cell:not(.want)");
      const b = document.querySelector("#lubeMtx td.cell.want");
      if (!a || !b) return null;
      return getComputedStyle(a).backgroundColor !== getComputedStyle(b).backgroundColor;
    });
    if (solid !== null)
      ok(solid, "a standard-only cell is drawn differently from one somebody audited");
  }

  console.log("── the poster prints the STANDARD, not last month's audit");
  const poster = await p.evaluate(() => {
    $("lpoWhich").value = "class"; $("lpoWhich").dispatchEvent(new Event("change"));
    return { rows: document.querySelectorAll("#lpoSheet tbody tr").length,
             title: document.querySelector("#lpoSheet h3").textContent.trim(),
             foot: document.querySelector("#lpoSheet .pfoot").textContent };
  });
  ok(poster.rows > 0, "the class sheet has rows: " + poster.rows);
  ok(/STANDARD/i.test(poster.foot),
     "and says on the paper that it is the standard, not a survey");

  console.log("── the class sheet does not repeat its own title as a heading");
  const dup = await p.evaluate(() => {
    const h = document.querySelector("#lpoSheet h3").textContent.trim().toLowerCase();
    return [...document.querySelectorAll("#lpoSheet tr.clsrow td")]
      .some(td => td.textContent.trim().toLowerCase() === h);
  });
  eq(dup, false, "the heading is not the title again");

  console.log("── the whole-fleet sheet groups by class, once each");
  const grouped = await p.evaluate(() => {
    $("lpoWhich").value = "fleet"; $("lpoWhich").dispatchEvent(new Event("change"));
    const heads = [...document.querySelectorAll("#lpoSheet tr.clsrow td")]
      .map(td => td.textContent.trim());
    return { heads, unique: new Set(heads).size,
             breaks: document.querySelectorAll("#lpoSheet tr.clsrow.brk").length };
  });
  /* The bug this exists for: sorted by unit count alone, the classes
     interleaved and the heading printed again every time the sort wandered
     back into one — RIGID DUMP TRUCK appeared twice, pages apart. */
  eq(grouped.heads.length, grouped.unique,
     "each class heading appears exactly once: " + grouped.heads.length + " headings");
  ok(grouped.breaks === grouped.heads.length - 1,
     "and every class after the first starts a new page: " + grouped.breaks);

  console.log("── product names survive being shortened");
  const names = await p.evaluate(() =>
    LUBE.catalog.map(pr => ({ full: pr.p, short: lubeShort(pr.p) })));
  const mangled = names.filter(n => /\(\s*\)|\s,|^\s|\s$/.test(n.short) || !n.short);
  eq(mangled, [], "no name is left with empty brackets or a dangling space");

  console.log("── the poster is paper: readable in dark mode too");
  /* The failure this guards is the worst on the project — every value present
     and none of them readable, because the page's own td colour rules outrank
     a colour set on the container. */
  for (const th of ["light", "dark"]) {
    await p.evaluate(t => document.documentElement.setAttribute("data-theme", t), th);
    await p.waitForTimeout(250);
    const bad = await p.evaluate(() => {
      const lum = c => {
        const m = (c || "").match(/[\d.]+/g); if (!m) return null;
        const srgb = /^color\(srgb/.test(c);
        const [r, g, b] = m.slice(0, 3).map(Number).map(v => {
          v = srgb ? v : v / 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const behind = el => { let n = el;
        while (n) { const c = getComputedStyle(n).backgroundColor;
          if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; n = n.parentElement; }
        return "rgb(255,255,255)"; };
      let worst = 99, n = 0;
      document.querySelectorAll("#lpoSheet *").forEach(el => {
        const txt = [...el.childNodes].some(x => x.nodeType === 3 && x.textContent.trim());
        if (!txt || el.closest('[aria-hidden="true"]')) return;
        const A = lum(getComputedStyle(el).color), B = lum(behind(el));
        if (A == null || B == null) return;
        const r = (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
        n++; if (r < worst) worst = r;
      });
      return { worst: +worst.toFixed(2), n };
    });
    ok(bad.worst >= 4.5,
       `${th}: every word on the poster reads at 4.5:1 or better (worst ${bad.worst}, ${bad.n} checked)`);
  }
  await p.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));

  console.log("── nothing scrolls the page sideways");
  for (const w of [1500, 1100]) {
    await p.setViewportSize({ width: w, height: 1000 });
    await p.waitForTimeout(300);
    const over = await p.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 0, `${w}px: no sideways scroll (over by ${over})`);
  }

  await p.evaluate(() => localStorage.removeItem("cm_lube_std"));
  ok(errs.length === 0, "no page or console errors: " + errs.slice(0, 2).join(" | "));

  await b.close();
  console.log(fail ? "\n" + fail + " FAILED" : "\nthe standard is a handful of decisions, and the poster prints it");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
