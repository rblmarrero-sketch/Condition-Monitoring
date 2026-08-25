/* Nothing on any inspection sheet may be cut in half by a page break.

   The undercarriage sheet was fixed one report at a time and that is exactly
   the wrong shape for this defect, because the cause is not in any report: the
   PDF is not laid out by the browser. CMR.paginate rasterises a section whole
   and slices the bitmap wherever the paper runs out, so `page-break-inside` in
   the stylesheet buys nothing and EVERY round type is exposed to the same
   thing. A fix that only covers undercarriage ships broken for the other seven.

   So this suite takes all eight round types, builds every document the app can
   produce from them — a sheet per round, and the fleet report — drives the REAL
   paginator with a renderer that records where each cut landed, and then asks
   two questions of every cut:

     did it slice a LINE of text in half?   (measured from Range rectangles, so
     it is the browser's own idea of where a line is, not this project's)

     did it separate a reading from its number, a card from its caption, a key
     entry from its label?   (measured from the rows and cells themselves)

   Both are measured against the real DOM at the moment html2canvas is handed
   it, which is the only moment the geometry is true.

   Run: node tests/pagecut.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL  = `http://127.0.0.1:${PORT}/mobile/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* One round of every type, on whatever machine carries that round. Types are
   read from the app rather than listed here, so a ninth round type joins this
   suite by existing. */
const SEED = `(async () => {
  const rnd = (n, i) => Math.round((n + (i % 5) * n * 0.03) * 10) / 10;
  const made = [];
  const META = (typeof TYPE_META !== "undefined") ? TYPE_META : {};
  const order = (typeof TYPE_ORDER !== "undefined") ? TYPE_ORDER : Object.keys(META);
  let d = 1;
  for (const ty of order) {
    /* Find a machine this round has positions for. Nothing here knows which
       units carry which round; it asks. */
    let unit = "", ks = [];
    for (const u of Object.keys(ASSET_BY)) {
      try { type = ty; selectEquip(u); const k = items().map(x => x.k);
        if (k.length > 4) { unit = u; ks = k; break; } } catch (e) {}
    }
    if (!unit) continue;
    const meta = META[ty] || {};
    const o = {};
    ks.forEach((k, i) => {
      if (meta.wear) {
        const sp = (typeof ucSplit === "function" ? ucSplit(k) : [k, ""]);
        const rf = WEAR.refFor(unit, (ASSET_BY[unit] || {}).m, sp[0], sp[1], "2026-08-0" + d);
        if (!rf || rf.x) { o[k] = { mm: null, reason: (WEAR.reasons[0] || {}).code || "", stood: 0, photos: [], video: null }; return; }
        const f = Math.min(1.2, 0.5 + ((i % 7) - 3) * 0.05);
        o[k] = { mm: Math.round((rf.n + (rf.c - rf.n) * f) * 10) / 10, stood: 0, reason: "", photos: [], video: null };
        return;
      }
      if (meta.lube) {
        const cat = (typeof LUBE !== "undefined" && LUBE.catalog) || [];
        o[k] = { grade: "A", sev: "NOF", prod: (cat[i % Math.max(1, cat.length)] || {}).p || "",
                 evid: i % 3 === 0 ? "label" : i % 3 === 1 ? "told" : "", samp: i % 2, photos: [], video: null };
        return;
      }
      const bad = i % 6 === 1, watch = i % 6 === 3;
      o[k] = { grade: bad ? "X" : watch ? "C" : "A", sev: bad ? "CRI" : watch ? "DEG" : "NOF",
        detect: "VI", defect: (bad || watch) ? "DT14-03" : "", cause: bad ? "CA-WEAR" : "",
        action: bad ? "RA-07" : watch ? "RA-02" : "", wo: bad ? "88214" : "",
        comment: bad ? "swarf across the whole face, second round running" : "",
        photos: [], video: null };
      if (meta.temp) { o[k].tempV = String(rnd(70, i)); o[k].tempA = "-31"; o[k].tempM = "IR"; }
      if (meta.get && i % 4 === 0) o[k].mm = String(rnd(120, i));
    });
    const id = "pc" + d;
    await dbPut({ id, type: ty, equip: unit, date: "2026-08-0" + d,
      by: "S. Volkov", sup: "A. Sokolov", smu: String(7000 + d * 11),
      cls: (ASSET_BY[unit] || {}).cls || "", gps: { lat: 68.0421, lon: 167.3318, acc: 6 },
      dev: "PH-01", sign: null, positions: o,
      created: "2026-08-0" + d + "T06:00:00.000Z", up: 0, upTo: {}, rev: 1 });
    made.push({ id: id, ty: ty, unit: unit, n: ks.length });
    d++;
  }
  return made;
})()`;

/* CMR.paginate wants an html2canvas and a jsPDF. It gets a pair that answer
   truthfully about size and record everything they are asked to draw — plus,
   at the one moment the element is really in the document, where every line of
   text and every row actually sits. */
const HARNESS = `(async (sections) => {
  const cap = [];
  const h2c = async (el, o) => {
    const er = el.getBoundingClientRect();
    /* Lines, measured by the browser. A Range over a text node reports one
       rectangle per rendered line, so this is where the lines ARE — not where
       this project believes they ought to be. */
    const lines = [];
    const wk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let tn;
    while ((tn = wk.nextNode())) {
      if (!String(tn.nodeValue || "").trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(tn);
      const rs = rg.getClientRects();
      for (let i = 0; i < rs.length; i++) {
        if (rs[i].height <= 1 || rs[i].height > 60) continue;
        lines.push({ t: rs[i].top - er.top, b: rs[i].bottom - er.top,
                     x: String(tn.nodeValue).trim().slice(0, 34) });
      }
    }
    const rows = [...el.querySelectorAll("tr,.lgrow,.cell,figure,.pkey > div,.ckey > div")]
      .map(n => { const r = n.getBoundingClientRect();
        return { t: r.top - er.top, b: r.bottom - er.top,
                 x: (n.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 34) }; })
      .filter(b => b.b - b.t > 1);
    cap.push({ w: er.width, h: er.height, lines: lines, rows: rows, slices: [],
               maps: !!el.querySelector(".ucmaps,.bodymap"), meas: !!el.querySelector(".meas") });
    const cv = document.createElement("canvas");
    cv.width  = Math.max(1, Math.round(er.width  * (o.scale || 2)));
    cv.height = Math.max(1, Math.round(er.height * (o.scale || 2)));
    const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);
    return cv;
  };
  let page = 1;
  const jsPDF = function () {
    this.addPage = function () { page++; };
    this.addImage = function (dd, f, x, y, w, h) { cap[cap.length - 1].slices.push({ page: page, y: y, h: h }); };
    this.getNumberOfPages = function () { return page; };
    this.setPage = function () {}; this.setDrawColor = function () {}; this.setLineWidth = function () {};
    this.line = function () {}; this.setFontSize = function () {}; this.setTextColor = function () {};
    this.text = function () {};
  };
  await CMR.paginate({ sections: sections, jsPDF: jsPDF, html2canvas: h2c, scale: 2, docId: "T" });
  return { cap: cap, pages: page };
})`;

/* Where the paper ended, in the element's own pixels. The image is placed at
   the same scale the whole element was placed at, so the width gives it. */
function cutsOf(c) {
  const out = [], scale = (595 - 76) / c.w;
  let acc = 0;
  for (let j = 0; j < c.slices.length - 1; j++) { acc += c.slices[j].h / scale; out.push(acc); }
  return out;
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  const made = await p.evaluate(SEED);

  console.log('\n  every round type is on the paper');
  const want = await p.evaluate(() => (typeof TYPE_ORDER !== 'undefined' ? TYPE_ORDER : []).length);
  ok('a round of each type was seeded', made.length === want,
    made.map(m => m.ty + ':' + m.unit + '/' + m.n).join(' '));

  /* Every document the app can produce: one sheet per round, and the fleet
     report that holds all of them — in BOTH languages. Every label on this
     report is printed twice, and which of the two leads decides how many lines
     a cell takes; a document that paginates cleanly in English is not evidence
     about the one the Russian-reading supervisor signs. */
  const docs = [];
  for (const lg of ['en', 'ru']) {
    await p.evaluate(async l => { const el = document.querySelector('.lang [data-lang="' + l + '"]');
      if (el) el.click(); await new Promise(r => setTimeout(r, 400)); }, lg);
    for (const m of made) {
      const secs = await p.evaluate(async id => (await buildReportSections(id)).map(s => ({ nb: s.nb, html: s.html })), m.id);
      docs.push({ name: m.ty + ' sheet [' + lg + ']', secs: secs });
    }
    docs.push({ name: 'fleet report [' + lg + ']',
      secs: await p.evaluate(async () => (await buildReportSections()).map(s => ({ nb: s.nb, html: s.html }))) });
  }
  await p.evaluate(async () => { const el = document.querySelector('.lang [data-lang="en"]');
    if (el) el.click(); await new Promise(r => setTimeout(r, 300)); });
  ok('both languages produced a document of their own', (() => {
    const en = docs.filter(d => /\[en\]/.test(d.name)), ru = docs.filter(d => /\[ru\]/.test(d.name));
    return en.length === ru.length && en.length === made.length + 1
      && JSON.stringify(en.map(d => d.secs.length)) !== '[]'; })(),
    docs.length + ' documents');

  /* And the same document printed from the office. The dashboard is not a
     second report engine — it loads report-core.js and calls the same
     paginate() — but it hands it sections of its own (the fleet analysis, the
     GET summary) which the phone never builds, and those are tables too. A
     page break through one of them is the same defect on the same paper. */
  const payload = await p.evaluate(async () => (await dbAll()).map(recToExport));
  const dash = await ctx.newPage();
  dash.on('pageerror', e => fails.push('DASH ' + e.message));
  await dash.goto(URL.replace('/mobile/index.html', '/dashboard/index.html'), { waitUntil: 'load' });
  await dash.waitForTimeout(1800);
  await dash.evaluate(pl => window.CMDash.importRecords(pl), payload);
  await dash.waitForTimeout(900);
  const dashSecs = await dash.evaluate(() => {
    const recs = window.CMDash.allRecs().filter(r => !r._void);
    return CMR.sections(window.CMReport.ctxFor(recs, { photos: false }))
      .map(s => ({ nb: s.nb, html: s.html }));
  });
  ok('the dashboard built the document too', dashSecs.length > 2, dashSecs.length + ' sections');
  docs.push({ name: 'dashboard report', secs: dashSecs, page: dash });

  let cuts = 0; const slicedLines = [], splitRows = [];
  for (const d of docs) {
    const out = await (d.page || p).evaluate(async ([h, s]) => (0, eval)(h)(s), [HARNESS, d.secs]);
    d.out = out;
    out.cap.forEach((c, i) => {
      cutsOf(c).forEach(at => {
        cuts++;
        const ln = c.lines.find(r => at > r.t + 0.5 && at < r.b - 0.5);
        if (ln) slicedLines.push(d.name + ' §' + i + ' @' + Math.round(at) + ' "' + ln.x + '"');
        const rw = c.rows.find(r => at > r.t + 0.5 && at < r.b - 0.5 && (r.b - r.t) < 520);
        if (rw) splitRows.push(d.name + ' §' + i + ' @' + Math.round(at) + ' "' + rw.x + '"');
      });
    });
  }

  console.log('\n  no page break falls through anything that has to be read whole');
  ok('there are cuts to get wrong', cuts >= docs.length, cuts + ' cuts across ' + docs.length + ' documents');
  ok('not one of them slices a line of text', slicedLines.length === 0,
    slicedLines.slice(0, 5).join(' | ') || 'clean');
  ok('and not one separates a reading from its number',
    splitRows.length === 0, splitRows.slice(0, 5).join(' | ') || 'clean');

  console.log('\n  a drawing is a drawing, not a column of one');
  const sliced = [];
  docs.forEach(d => d.out.cap.forEach((c, i) => {
    if (c.maps && c.slices.length > 1) sliced.push(d.name + ' §' + i + ' (' + c.slices.length + ' pieces)');
  }));
  const drew = docs.filter(d => d.out.cap.some(c => c.maps));
  ok('some sheet actually drew a machine', drew.length > 0,
    drew.map(d => d.name).join(', ') || 'none');
  ok('and no drawing was split across two pages', sliced.length === 0,
    sliced.join(' | ') || 'clean');

  console.log('\n  and nothing was rendered as nothing');
  const junk = [];
  docs.forEach(d => { const txt = d.secs.map(s => s.html).join(' ').replace(/<[^>]*>/g, ' ');
    if (/undefined|NaN|\[object/.test(txt)) junk.push(d.name); });
  ok('no document printed undefined, NaN or [object Object]', junk.length === 0, junk.join(', ') || 'clean');

  await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED' : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
