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
  await p.click('#tabs [data-tab="lube"]');
  await p.waitForTimeout(600);

  /* Since 2026-10-04 the standard is decided per GRADE on the lube master's
     Oils board (dashboard/lube-master.js) and kept on the server. The
     argument these checks make is the same one the old per-type panel made:
     hundreds of compartments are a handful of decisions. */
  await p.evaluate(() => lubeGo("oils"));
  await p.waitForTimeout(400);

  console.log("── hundreds of compartments are a handful of decisions");
  const R = await p.evaluate(() => {
    let comps = 0; const specs = new Set(), byGrade = {};
    Object.keys(lubeModelKeys()).forEach(k => {
      const i = k.indexOf("|"), m = k.slice(i+1), cls = k.slice(0,i);
      LUBE.comps(m, cls).forEach(c => {
        if (c.oem) specs.add(c.oem);
        if (!c.g) return;
        comps++;
        const G = byGrade[c.g] || (byGrade[c.g] = { models: {}, specs: {} });
        G.models[m] = 1; if (c.oem) G.specs[c.oem] = 1;
      });
    });
    const rows = [...document.querySelectorAll("#lmOils tr[data-lmxgr]")].map(r => r.dataset.lmxgr);
    const top = rows[0];
    const vol = (document.querySelector('#lmOils tr[data-lmxgr="' + top + '"] td.num') || {}).textContent || "";
    return { comps, specs: specs.size, grades: Object.keys(byGrade).length, rows, top,
             topModels: top && byGrade[top] ? Object.keys(byGrade[top].models).length : 0,
             topSpecs: top && byGrade[top] ? Object.keys(byGrade[top].specs).length : 0, vol };
  });
  ok(R.comps > 15, "there are graded compartments to group: " + R.comps);
  ok(R.grades < R.comps / 5, `and far fewer decisions than compartments (${R.grades} grades from ${R.comps})`);
  ok(R.specs > 30, "the masterlist really does carry dozens of spec strings: " + R.specs);
  ok(R.grades * 3 < R.specs, `grouping on grade collapses them (${R.grades} decisions vs ${R.specs} spec strings)`);
  ok(R.topModels > 1 && R.topSpecs > 1,
     "the biggest grade spans several models AND several different spec strings — " +
     "different badges, one decision (" + R.top + ": " + R.topModels + " models, " + R.topSpecs + " specs)");
  ok(R.rows.length >= R.grades - 1, "every grade in use is on the board: " + R.rows.length);
  ok(/\d/.test(R.vol), "the biggest is sized in litres a year, so consolidating is an argument with a number: " + R.vol);

  console.log("── and it does NOT collapse things that must stay apart");
  const apart = await p.evaluate(() => ({
    eng: LUBE.grade("0W40").t, gear: LUBE.grade("75W90").t, hyd: LUBE.grade("VG32").t,
    tr: LUBE.grade("5W30").t, zf: LUBE.grade("ZF VG32") && LUBE.grade("ZF VG32").code }));
  ok(apart.eng !== apart.gear && apart.eng !== apart.hyd, "an engine grade is not a gear or a hydraulic one");
  ok(apart.tr === "powertrain" && apart.gear === "gear", "TO-4 wet-clutch oil and GL-5 gear oil are different families");
  ok(apart.zf === "ZF VG32", "a ZF-approved hydraulic is its own grade, not folded into VG32");

  console.log("── the safety property: what is offered for a grade is of that grade's type");
  const unsafe = await p.evaluate(() => {
    const bad = [];
    document.querySelectorAll("#lmOils tr[data-lmxgr]").forEach(r => {
      const g = r.dataset.lmxgr, t = LUBE.grade(g).t;
      r.querySelectorAll("select[data-f] option").forEach(o => {
        if (!o.value || o.value === "__other") return;
        const pr = LUBE.registered(o.value) || LUBE.product(o.value);
        if (pr && pr.t && pr.t !== t) bad.push(o.value + " (" + pr.t + ") offered for " + g + " (" + t + ")");
      });
    });
    return bad;
  });
  eq(unsafe, [], "every product offered for a grade is of that grade's type");

  /* An option is either rated at or below the design minimum, or it is
     VISIBLY unrated. Silence is the failure — an unrated oil that looks
     approved is how a −15 product ends up in a machine on a −45 morning. */
  const cold = await p.evaluate(() => {
    const out = { silent: [], approved: [], locked: [] };
    document.querySelectorAll("#lmOils select[data-f] option").forEach(o => {
      if (!o.value || o.value === "__other") return;
      const s = o.textContent;
      if (!/no data sheet|pour point|нет спецификации|застывание/.test(s)) out.silent.push(s.trim());
      if (/\b(approved|rated to|fit for|suitable|допущен|пригоден)\b/i.test(s) && !/DISQUALIFIED|НЕ ПРИГОДЕН/.test(s))
        out.approved.push(s.trim());
      if (/DISQUALIFIED|НЕ ПРИГОДЕН/.test(s) && !o.disabled && !o.selected) out.locked.push(s.trim());
    });
    return out;
  });
  eq(cold.silent, [], "every option states where it stands on the cold");
  eq(cold.approved, [], "and nothing in the picker tells an engineer a product is approved");
  eq(cold.locked, [], "an oil disqualified by its own data sheet cannot be chosen");

  console.log("── the matrix shows what SHOULD be in a compartment nobody has audited");
  await p.evaluate(() => { lubeGo("matrix"); renderLubeTab(); });
  await p.waitForTimeout(400);
  const want = await p.evaluate(() => document.querySelectorAll("#lubeMtx td.cell.want").length);
  ok(want > 0, "unaudited compartments show the grade's approved product: " + want + " cells");
  const solid = await p.evaluate(() => {
    const a = document.querySelector("#lubeMtx td.cell:not(.want)");
    const b = document.querySelector("#lubeMtx td.cell.want");
    if (!a || !b) return null;
    return getComputedStyle(a).backgroundColor !== getComputedStyle(b).backgroundColor;
  });
  if (solid !== null) ok(solid, "a standard-only cell is drawn differently from one somebody audited");
  await p.evaluate(() => lubeGo("shop"));

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
