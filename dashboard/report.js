/* ============================================================================
   Condition Monitoring — the dashboard's PDF report.
   ----------------------------------------------------------------------------
   The document is report-core.js, the same file the phones carry: same
   stylesheet, same four sections in the same order, same wording, same wear
   bar. A page printed here and a page printed in the pit are the same page.

   All this file does is three things the phone cannot:
     • pick a scope — one machine, one round, or a month
     • normalise the dashboard's records into the shape the core reads
     • add what only a fleet view knows — a machine's condition over time,
       and the fleet's failure modes ranked

   Depends on: jsPDF, html2canvas, report-core.js, and the dashboard's own
   RECS / SEV / HME globals.
   ========================================================================== */
(function () {
  "use strict";

  /* RECS and friends are `let`/`const` in the dashboard's own script, so they
     live in the global lexical scope and are NOT properties of window. */
  const allRecs = () => (typeof RECS !== "undefined" ? RECS : []);
  const folder  = () => (typeof folderPhotos !== "undefined" ? folderPhotos : null);
  const L       = (k, v) => (typeof t === "function" ? t(k, v) : k);
  const esc     = s => window.CMR.esc(s);
  /* The report prints both languages on every label, so it needs both
     renderings of anything this file translates on the way in — a component
     name, a round type. t() answers in whichever language the screen is in;
     this asks for the other one. */
  const OTHER   = () => ((typeof lang !== "undefined" && lang === "ru") ? "en" : "ru");
  function inOther(fn) {
    if (typeof lang === "undefined") return fn();
    const was = lang;
    try { lang = OTHER(); return fn(); } finally { lang = was; }
  }

  /* Sections built HERE print through the core's translator too. The bilingual
     pass covered report-core's own strings and stopped at the section
     boundary, so the Pareto page came out in one language inside a document
     where every other heading carried both. */
  const RT = () => window.CMR.makeT(typeof lang !== "undefined" ? lang : "en", true);
  const B = (T, k, v) => T.both(L(k, v), inOther(() => L(k, v)));

  function recsForScope(scope, target) {
    const R = allRecs().filter(r => !r._void);
    /* One inspection, by its storage key — what the button on a history card
       asks for. The card is the round; the report should be that round and
       nothing else. */
    if (scope === "one") return R.filter(r => `${r.equip}|${r.date}|${r.type}` === target);
    if (scope === "unit")  return R.filter(r => r.equip === target)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    if (scope === "round") return R.filter(r => r.date === target)
      .sort((a, b) => a.equip.localeCompare(b.equip));
    return R.filter(r => (r.date || "").slice(0, 7) === target)
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.equip.localeCompare(b.equip));
  }

  /* ---- photographs -------------------------------------------------------
     The folder picker indexes by file name, so rebuild the names both ends
     agreed on; Drive records already carry a usable URL. */
  function photoSrcs(it, rec) {
    /* One source of truth with the history screen. This used to rebuild the
       names itself and stopped at "_4", so a report could never carry more
       than five of a position's ten photographs — and it knew nothing about a
       photograph the office had removed, which would have put a withdrawn
       picture into a signed PDF. CMDash.mediaOf answers both. */
    if (window.CMDash && window.CMDash.mediaOf) {
      const med = window.CMDash.mediaOf(it, rec) || [];
      /* Stills only: a PDF cannot play a clip, and a black frame with no way
         to press anything is worse than leaving it out. The history screen is
         where a video is watched. */
      /* Excluded is a decision about the PDF and only about the PDF: the
         photograph stays on the record and stays on the history screen. This
         is the only reader of that flag, which is why it is a flag rather
         than a removal. */
      /* mediaAll already covers it.photo, so mediaOf is the WHOLE answer for
         this item - including the ones it removed because somebody filed them
         against another point, kept them as general evidence, or took them off
         the record. Falling through to it.photo below undid every one of those
         decisions: a photograph re-filed to 4D went on printing under 4C. */
      return med.filter(m => m.kind !== "video" && !m.excluded).map(m => m.src);
    }
    // a record that carries its own URL (Drive, or an import that inlined it)
    if (it.photo) {
      return [/^(data:|blob:|https?:|\/)/.test(it.photo) ? it.photo : "../" + it.photo];
    }
    return [];
  }

  /* The two frames, coloured by what each point read — the same drawing the
     phone prints, from the same module, so a fitter sees one machine picture
     wherever the report came from. */
  /* ---- the truck body, printed ------------------------------------------
     The phone has drawn this since the tray round shipped. This file did not:
     reportMap returned "" for anything that was not an undercarriage, so a
     dump-body report came out of the dashboard with no picture of the machine
     at all — forty-four thickness readings and nothing saying where on the
     body any of them were taken.

     Same module the app uses, so the plan view a superintendent reads on paper
     is the one the inspector tapped in the pit. */
  function bodyMapHTML(rec) {
    const bm = (typeof bodyModelOf === "function") ? bodyModelOf(rec.equip) : null;
    if (!bm || !window.BODY || !window.bodyMap) return "";
    const by = {}, mm = {};
    (rec.items || []).forEach(it => {
      const w = typeof wearOf === "function" ? wearOf(rec, it) : null;
      by[it.key] = !w ? "" : w.mm == null ? (w.reason ? "na" : "") : (w.band || "done");
      if (w && w.mm !== "" && w.mm != null) mm[it.key] = Number(w.mm);
    });
    const state = z => {
      const seen = BODY.inZone(bm, z).map(p => by[p.k]).filter(Boolean);
      if (!seen.length) return "";
      if (seen.includes("act")) return "act";
      if (seen.includes("watch")) return "watch";
      return seen.length === BODY.inZone(bm, z).length ? "done" : "";
    };
    return window.CMR.fitMap('<div class="ucmapwrap">'
      + bodyMapReport({ model: bm, lang: (typeof lang !== "undefined" ? lang : "en"),
                  mm: mm, state: k => by[k] || "", zoneState: state })
      + '</div>');
  }
  /* The zones, worst first, for the table report-core prints beside the
     drawing. Named by the THINNEST station in each, never the mean. */
  function bodyZones(rec) {
    const bm = (typeof bodyModelOf === "function") ? bodyModelOf(rec.equip) : null;
    if (!bm || !window.BODY) return null;
    const mm = {};
    (rec.items || []).forEach(it => {
      const w = typeof wearOf === "function" ? wearOf(rec, it) : null;
      if (w && w.mm !== "" && w.mm != null) mm[it.key] = Number(w.mm);
    });
    const rows = BODY.zones(bm).map(z => {
      const worst = BODY.worst(bm, z.k, mm);
      return { name: z.en, nameAlt: z.ru,
               got: BODY.inZone(bm, z.k).filter(p => mm[p.k] != null).length,
               of: BODY.inZone(bm, z.k).length,
               thin: worst ? worst.mm : null, at: worst ? worst.k : "" };
    });
    /* Thinnest first: the zone a superintendent has to read is the one that
       has least metal left, not the one that happens to be listed first. */
    return rows.sort((a, b) => (a.thin == null) - (b.thin == null)
      || (a.thin ?? 0) - (b.thin ?? 0));
  }

  /* The state of one measured point, in the words the drawings colour by. */
  function stateOf(rec) {
    const by = {};
    (rec.items || []).forEach(it => {
      const w = typeof wearOf === "function" ? wearOf(rec, it) : null;
      by[it.key] = !w ? "" : w.mm == null ? (w.reason ? "na" : "")
        : w.band === "act" ? "act" : w.band === "watch" ? "watch" : "done";
    });
    return k => by[k] || "";
  }
  /* Both sides of the machine, captioned, in both languages. */
  function sideLabel(sd) {
    const k = sd === "L" ? "uc_left_h" : "uc_right_h";
    const x = L(k), y = inOther(() => L(k));
    return WEAR.escMap(y && y !== x ? `${x} / ${y}` : x);
  }

  /* Same reasoning as the phone's rptMap: a drawing is the best part of the
     sheet and it is not worth the sheet. Every branch below reads a register
     entry, a wear profile or a body model, any of which can be absent on a
     browser holding a half-loaded cache — and thrown, that used to take the
     whole export down. */
  function reportMap(rec, photo) {
    try { return reportMapInner(rec, photo); }
    catch (e) { return { html: "", key: null }; }
  }
  function reportMapInner(rec, photo) {
    if (rec.type === "TB") return { html: bodyMapHTML(rec), key: null };
    const a = (typeof ASSET_BY !== "undefined" && ASSET_BY[rec.equip]) || null;
    if (!a || !window.WEAR) return { html: "", key: null };
    /* The GET round's own tool, numbered — the screen the inspector walked.
       The report drew nothing here at all. */
    if (rec.type === "GET") {
      const g = WEAR.reportGETMap && WEAR.reportGETMap({
        unit: rec.equip, cat: a.cat || a.cls || "", model: a.m || "", photo,
        lang: (typeof lang !== "undefined" ? lang : "en"), state: stateOf(rec) });
      return g ? { html: window.CMR.fitMap(g.html), key: g.key } : { html: "", key: null };
    }
    if (rec.type !== "UC") return { html: "", key: null };
    const prof = a.m && WEAR.modelFor ? WEAR.modelFor(a.m) : null;
    if (!prof) return { html: "", key: null };
    /* The photographed walk, exactly as the capture screen draws it — same
       module, same numbering, same eleven names underneath. */
    const u = WEAR.reportUCMap && WEAR.reportUCMap({
      model: a.m || "", rollers: prof.rollers, high: prof.frame === "highdrive",
      fam: (window.MFIG && MFIG.familyFor) ? MFIG.familyFor(rec.equip, a.cat || a.cls || "") : "",
      photo, lang: (typeof lang !== "undefined" ? lang : "en"),
      state: stateOf(rec), sideLabel });
    if (u) return { html: window.CMR.fitMap(u.html), key: u.key };
    /* No fallback to mapSVG. mapPhoto already draws the frame underneath when
       a model has no photograph — that is the same fallback the capture screen
       uses — so a second renderer here would only be a second picture of the
       same machine, waiting to disagree with the first. */
    return { html: "", key: null };
  }

  /* What is in this compartment, how we know, and whether it belongs there.

     The report engine draws the lubrication table from `it.lube` and prints
     NOTHING when it is absent - and this never set it. Every lubrication round
     exported from the dashboard came out as a header, a signature and no
     table: the one round whose entire content is this field. The phone built
     the same block from the same reference; only the office's copy was blank.

     The verdict comes from lube.js, so the sheet and the position card cannot
     disagree about the same compartment. */
  function lubeBlock(rec, it) {
    if (rec.type !== "LUBE" || !window.LUBE) return null;
    const product = String(it.lubeProduct || "").trim();
    const evidKey = it.lubeEvidence || "";
    const samp = it.lubeSampled ? true : false;
    if (!product && !evidKey && !samp) return null;
    const e = LUBE.EVID.filter(x => x.k === evidKey)[0];
    const a = (typeof ASSET_BY !== "undefined" && ASSET_BY[rec.equip]) || {};
    const v = LUBE.verdict(a.m || "", a.cls || "", it.key, product);
    return { product, evid: e ? { en: e.en, ru: e.ru } : null, samp,
             want: v.want || "", band: v.b || "", verdictKey: v.k || "",
             off: !!(product && v.off) };
  }

  /* ---- the dashboard's records, in the shape the core reads -------------- */
  function normalise(recs, opts) {
    const wantPhotos = !!(opts && opts.photos);
    /* Every round type names its points from a reference that holds BOTH
       languages — except that this only ever asked the undercarriage one.
       A dump-body round fell through to `it.label`, which is whatever single
       string the phone wrote at capture time, so every station on a TR60
       printed in Russian and nothing anywhere could produce the English. Same
       for a GET round: ucName's GET branch needs the record, and this called
       it without one, so it never fired.

       The names are keyed by language, so asking again with `lang` flipped is
       what makes the report bilingual — see inOther below. */
    const nameFor = (rec, it) =>
      (typeof ucRefName === "function" && ucRefName(it.key, rec))
      || it.label || it.key;
    /* Both renderings of every name, collected in ONE pass with the language
       switched rather than flipping it twice per item. */
    const altName = new Map(), altType = new Map();
    inOther(() => recs.forEach(rec => {
      altType.set(rec.type, (typeof TYPE_LABEL !== "undefined" && TYPE_LABEL[rec.type]) || rec.type);
      (rec.items || []).forEach(it =>
        altName.set(rec.type + "|" + it.key, nameFor(rec, it)));
    }));
    return recs.map(rec => ({
      equip: rec.equip,
      clsLabel: ((typeof ASSET_BY !== "undefined" && ASSET_BY[rec.equip]) || {}).cat || rec.cls || "",
      model: ((typeof ASSET_BY !== "undefined" && ASSET_BY[rec.equip]) || {}).m || "",
      type: rec.type,
      typeLabel: (typeof TYPE_LABEL !== "undefined" && TYPE_LABEL[rec.type]) || rec.type,
      typeAlt: altType.get(rec.type) || "",
      date: rec.date || "",
      by: rec.by || "", sup: rec.sup || "", smu: rec.smu || "",
      gps: rec.gps || null,
      signUrl: rec.signUrl || "",
      ...(() => { const m = reportMap(rec, (opts && opts.art && opts.art[rec.equip + "|" + rec.type]) || "");
                  return { mapHTML: m.html, mapKey: m.key }; })(),
      zones: rec.type === "TB" ? bodyZones(rec) : null,
      /* EVIDENCE THAT BELONGS TO THE MACHINE, NOT TO A COMPONENT.

         A photograph of the plate, the whole machine, the ground under it -
         filed as general evidence in the correction panel because it answers
         no single inspection point. It has no item to be printed under, so
         until now classifying one removed it from the report entirely. */
      general: wantPhotos && window.CMDash && CMDash.generalMedia
        ? CMDash.generalMedia(rec).filter(m => m.kind !== "video" && !m.excluded).map(m => m.cat ? { u: m.src, cat: m.cat } : m.src)
        : [],
      /* What this inspection says it photographed, against what actually
         reached this dashboard. A report that prints four pictures where six
         were taken, and says nothing, reads as complete. */
      gap: (window.CMDash && CMDash.evidenceGap ? CMDash.evidenceGap(rec) : null),
      /* Delivered by construction: every record this surface can print came
         out of the folder, which IS the office having it. Stated rather than
         assumed, because the engine asks both surfaces the same question and
         a field left undefined would read as "not delivered" and mark every
         office report preliminary. */
      delivered: true,
      wear: typeof isWearType === "function" && isWearType(rec.type),
      temp: rec.type === "TEMP",
      items: (rec.items || []).map(it => {
        const w = typeof wearOf === "function" ? wearOf(rec, it) : null;
        const read = [
          it.particle && `PC ${it.particle}`,
          it.comp && `comp ${it.comp} h`,
          it.oil && `oil ${it.oil} h`,
          it.tempC && `${it.tempC} °C${it.ambC ? ` / ${it.ambC}` : ""}`,
        ].filter(Boolean);
        return {
          key: it.key,
          name: nameFor(rec, it),
          nameAlt: altName.get(rec.type + "|" + it.key) || "",
          code: nameFor(rec, it) === it.key ? "" : it.key,
          /* The grade as the number, and the ISO class it exports as — the
             engine shows the class only where there is no grade. */
          grade: (typeof GRADE !== "undefined" ? GRADE.num(it.grade) : it.grade) || "",
          sev: (typeof GRADE !== "undefined" && typeof sevOf === "function")
                 ? (GRADE.iso(sevOf(rec, it)) || it.sev || "") : (it.sev || ""),
          general: it.general ? 1 : 0,
          cats: (Array.isArray(it.att) ? it.att : []).map(e => (e && e.category) || "COMPONENT"),
          resp: it.resp || "", target: it.target || "", opstat: it.opstat || "", gradeWhy: it.gradeWhy || "",
          defect: it.defect || "", defectCode: it.defectCode || "", iso: it.iso || "",
          cause: it.cause || "", action: it.actionLabel || "",
          prio: it.prio || "", prioLabel: it.prioLabel || "", wo: it.wo || "",
          comment: it.comment || "", readings: read,
          lube: lubeBlock(rec, it),
          photos: wantPhotos ? photoSrcs(it, rec) : [],
          w: w ? { mm: w.mm, newMM: w.newMM, condemnMM: w.condemnMM, pct: w.wearPct,
                   band: w.band || "", refSrc: w.refSrc || "",
                   reason: w.reason || "", reasonLabel: w.reasonLabel || "",
                   reasonAlt: w.reasonAlt || "",
                   stood: !!w.stood } : null,
        };
      }),
    }));
  }

  /* ---- what only a fleet view knows --------------------------------------
     Drawn in the core's own language — an eyebrow, a hairline table, the same
     bars — so these read as part of the report rather than bolted onto it. */
  const HEX = () => window.CMR.SEV_HEX;

  /* The unit report used to bolt a trend strip on the end: a row per machine
     with one coloured dot per round. On a single-machine report that is one
     row of dots, and it could tell you a round happened but never what moved.
     report-core prints a real measurement history now — every point on its own
     row with its readings in date order and the change over the series — so
     this was two ways of saying less. Deleted rather than kept in parallel:
     two trend renderers is how the two of them drift. */

  function paretoSection(recs) {
    const cnt = {}, sev = {};
    recs.forEach(r => (r.items || []).forEach(it => {
      if (!it.defect) return;
      cnt[it.defect] = (cnt[it.defect] || 0) + 1;
      const s = typeof sevOf === "function" ? sevOf(r, it) : it.sev;
      if (!sev[it.defect] || (sev[it.defect] !== "CRI" && s === "CRI")) sev[it.defect] = s;
    }));
    const rows = Object.keys(cnt).map(k => [k, cnt[k]]).sort((a, b) => b[1] - a[1]).slice(0, 12);
    if (!rows.length) return null;
    const top = rows[0][1], T = RT();
    let h = '<div class="sec"><div class="sechd"><span class="n">__N__</span>'
      + `<span class="h2">${B(T, "rpt_pareto")}</span>`
      + `<span class="muted" style="font-size:10.5px;margin-left:auto;">${B(T, "rpt_pareto_sub")}</span></div>`
      + `<table><tr><th>${B(T, "rpt_mode_h")}</th><th style="width:250px"></th>`
      + `<th class="r" style="width:44px">${B(T, "rpt_count_h")}</th></tr>`;
    rows.forEach(([k, n], i) => {
      const c = HEX()[sev[k]] || "#8a939b";
      h += `<tr class="${i % 2 ? "zebra" : ""}"><td>${esc(k)}</td>`
        + `<td><span class="wb" style="min-width:0"><i style="width:${(n / top * 100).toFixed(1)}%;background:${c}"></i></span></td>`
        + `<td class="r n"><b>${n}</b></td></tr>`;
    });
    return { nb: false, html: h + "</table></div>" };
  }

  /* ---- ground engaging tools, analysed ------------------------------------
     Written down so nobody has to work it out twice.

     A GET programme is judged on four questions. This round's data answers
     three of them honestly, and the fourth it cannot:

       WHICH POSITION EATS THE MONEY — wear rate per position, in millimetres
       per 1,000 machine hours. Needs two readings and an hour meter, and the
       round takes both. This is the number that says whether the money is
       going into teeth or into sidewall plate, which are different problems
       with different answers.

       WHEN TO ORDER — hours to condemn, from that rate. The Wear & life screen
       already forecasts every measured point on the fleet; what a GET report
       adds is the ranking within one tool.

       IS IT THE MACHINE OR THE OPERATOR — left against right on the paired
       positions: end bits, side cutters, sidewall plates. A blade run cocked,
       or a bucket always dug from the same side, shows up as a persistent
       imbalance long before either side is near its limit. It is the only
       finding on this page that changes behaviour instead of raising a parts
       order, which is what makes it worth the space.

       WHAT IS ACTUALLY BEING REPLACED — findings ranked by position.

     The fourth question a GET programme usually asks — cost per hour, or per
     tonne moved — is absent on purpose rather than estimated. Nothing in this
     system carries a part price or a payload figure. A cost-per-tonne chart
     built on neither would be the most quoted number in the report and the
     least true one in it; it needs the parts catalogue and the production
     figures joined in first. Until then the wear rate is the honest proxy,
     and saying so is better than a plausible invention. */
  const GET_PAIRS = [["ENDL", "ENDR"], ["EDGEL", "EDGER"], ["CUTL", "CUTR"], ["WALLL", "WALLR"]];
  const GET_IMBAL = 1.3;          // 30% apart is past anything a tape explains

  function getStats(recs) {
    const R = recs.filter(r => r.type === "GET" && !r._void);
    if (!R.length || !window.GET) return null;
    const ser = new Map();
    R.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")).forEach(r => {
      const a = (typeof ASSET_BY !== "undefined" && ASSET_BY[r.equip]) || {};
      (r.items || []).forEach(it => {
        const w = typeof wearOf === "function" ? wearOf(r, it) : null;
        if (!w || w.mm == null || w.mm === "") return;
        const k = r.equip + "|" + it.key;
        if (!ser.has(k)) ser.set(k, []);
        ser.get(k).push({ mm: Number(w.mm), smu: Number(r.smu) || null, w,
                          equip: r.equip, code: it.key, cat: a.cat || a.cls || "", model: a.m || "" });
      });
    });
    const rate = [], now = new Map();
    ser.forEach(list => {
      const last = list[list.length - 1];
      now.set(last.equip + "|" + last.code, last);
      if (list.length < 2) return;
      const first = list[0];
      /* Against the hour meter, never the calendar. A machine parked for a
         month has not worn, and a rate per day would say it had. */
      if (first.smu == null || last.smu == null) return;
      const dh = last.smu - first.smu, dmm = first.mm - last.mm;
      if (dh <= 0 || dmm <= 0) return;
      rate.push({ equip: last.equip, code: last.code, cat: last.cat, model: last.model,
                  per1k: dmm / dh * 1000, hours: dh, w: last.w });
    });
    /* Left against right, on the positions that come in pairs. Compared on
       how much metal each has LOST, not on what is left — two parts that
       started different sizes are not comparable any other way. */
    const bal = [];
    const byUnit = new Map();
    now.forEach(v => { if (!byUnit.has(v.equip)) byUnit.set(v.equip, new Map());
                       byUnit.get(v.equip).set(v.code, v); });
    byUnit.forEach((m, equip) => GET_PAIRS.forEach(([a, b]) => {
      const A = m.get(a), Bv = m.get(b);
      if (!A || !Bv) return;
      const lost = x => (x.w.newMM == null || x.w.newMM === "") ? null : Number(x.w.newMM) - x.mm;
      const la = lost(A), lb = lost(Bv);
      if (la == null || lb == null || la <= 0 || lb <= 0) return;
      /* Guarded against a near-zero denominator: one side barely touched and
         the other worn is a real finding, but 40 ÷ 0.02 is not a ratio, it is
         a division artefact that would sort to the top of the table for ever. */
      const ratio = Math.max(la, lb) / Math.max(0.5, Math.min(la, lb));
      bal.push({ equip, a, b, la, lb, ratio, worse: la >= lb ? a : b,
                 cat: A.cat, model: A.model });
    }));
    const pareto = {};
    R.forEach(r => (r.items || []).forEach(it => {
      const w = typeof wearOf === "function" ? wearOf(r, it) : null;
      const bad = (typeof GRADE !== "undefined" && GRADE.isFinding(it.grade)) || it.defect
        || (w && (w.band === "act" || w.band === "watch"));
      if (bad) pareto[it.key] = (pareto[it.key] || 0) + 1;
    }));
    rate.sort((x, y) => y.per1k - x.per1k);
    bal.sort((x, y) => y.ratio - x.ratio);
    return { rate, bal, pareto, units: byUnit.size,
             generic: R.some(r => (r.items || []).some(it => {
               const w = typeof wearOf === "function" ? wearOf(r, it) : null;
               return w && /generic/.test(w.refSrc || ""); })) };
  }

  function getSection(recs) {
    const s = getStats(recs);
    if (!s) return null;
    const T = RT();
    const nameOf = (equip, code) => {
      const a = (typeof ASSET_BY !== "undefined" && ASSET_BY[equip]) || {};
      const en = GET.label(equip, a.cat || a.cls || "", a.m || "", code, "en");
      const ru = GET.label(equip, a.cat || a.cls || "", a.m || "", code, "ru");
      return T.both(en, ru);
    };
    let h = '<div class="sec"><div class="sechd"><span class="n">__N__</span>'
      + `<span class="h2">${B(T, "g_an")}</span>`
      + `<span class="muted" style="font-size:10.5px;margin-left:auto;">${B(T, "g_an_sub")}</span></div>`;

    if (s.rate.length) {
      const top = s.rate[0].per1k;
      h += `<div class="subhd">${B(T, "g_rate")}</div>`
        + `<table class="mh"><tr><th style="width:70px">${B(T, "c_unit_h")}</th>`
        + `<th>${B(T, "g_pos")}</th><th style="width:196px"></th>`
        + `<th class="r" style="width:76px">${B(T, "g_mm1k")}</th>`
        + `<th class="r" style="width:70px">${B(T, "g_over")}</th></tr>`;
      s.rate.slice(0, 10).forEach((x, i) => {
        h += `<tr class="${i % 2 ? "zebra" : ""}"><td><span class="unit">${esc(x.equip)}</span></td>`
          + `<td>${nameOf(x.equip, x.code)}</td>`
          + `<td><span class="wb" style="min-width:0"><i style="width:${(x.per1k / top * 100).toFixed(1)}%;background:${HEX().DEG || "#ec835a"}"></i></span></td>`
          + `<td class="r n"><b>${x.per1k.toFixed(1)}</b></td>`
          + `<td class="r n">${Math.round(x.hours)} h</td></tr>`;
      });
      h += "</table>";
    }

    if (s.bal.length) {
      const bad = s.bal.filter(x => x.ratio >= GET_IMBAL);
      h += `<div class="subhd" style="margin-top:13px;">${B(T, "g_bal")}</div>`
        + `<div class="quiet" style="margin:0 0 5px;">${B(T, bad.length ? "g_bal_bad" : "g_bal_ok",
             { n: bad.length })}</div>`;
      if (bad.length) {
        h += `<table class="mh"><tr><th style="width:70px">${B(T, "c_unit_h")}</th>`
          + `<th>${B(T, "g_pair")}</th>`
          + `<th class="r" style="width:70px">${B(T, "g_lost_l")}</th>`
          + `<th class="r" style="width:70px">${B(T, "g_lost_r")}</th>`
          + `<th class="r" style="width:78px">${B(T, "g_ratio")}</th></tr>`;
        bad.slice(0, 8).forEach((x, i) => {
          h += `<tr class="${i % 2 ? "zebra" : ""}"><td><span class="unit">${esc(x.equip)}</span></td>`
            + `<td>${nameOf(x.equip, x.a)} <span class="muted">/</span> ${nameOf(x.equip, x.b)}</td>`
            + `<td class="r n">${x.la.toFixed(1)}</td><td class="r n">${x.lb.toFixed(1)}</td>`
            + `<td class="r n"><b style="color:${HEX().DEG || "#ec835a"}">${x.ratio.toFixed(1)}×</b></td></tr>`;
        });
        h += "</table>";
      }
    }

    const pk = Object.keys(s.pareto).sort((a, b) => s.pareto[b] - s.pareto[a]).slice(0, 8);
    if (pk.length) {
      const top = s.pareto[pk[0]], any = s.rate[0] || { equip: "" };
      h += `<div class="subhd" style="margin-top:13px;">${B(T, "g_top")}</div>`
        + `<table class="mh"><tr><th>${B(T, "g_pos")}</th><th style="width:250px"></th>`
        + `<th class="r" style="width:50px">${B(T, "rpt_count_h")}</th></tr>`;
      pk.forEach((k, i) => {
        h += `<tr class="${i % 2 ? "zebra" : ""}"><td>${nameOf(any.equip, k)}</td>`
          + `<td><span class="wb" style="min-width:0"><i style="width:${(s.pareto[k] / top * 100).toFixed(1)}%;background:${HEX().CRI || "#d03b3b"}"></i></span></td>`
          + `<td class="r n"><b>${s.pareto[k]}</b></td></tr>`;
      });
      h += "</table>";
    }
    /* Said once, at the bottom, where the numbers above it can be read in the
       light of it: these limits are starting points, not the supplier's. */
    if (s.generic) h += `<div class="quiet" style="margin-top:10px;">${B(T, "g_generic")}</div>`;
    /* And what this page deliberately does not claim. */
    h += `<div class="quiet" style="margin-top:6px;">${B(T, "g_nocost")}</div>`;
    return { nb: true, html: h + "</div>" };
  }

  /* The document title carries both languages too, at a size that reads as a
     subtitle rather than a second headline. */
  const EXTRA_CSS = `
#rptRoot .h1 .alt{font-size:14.5px;font-weight:600;line-height:1.2;margin-top:4px;
  letter-spacing:0;color:#5b6670;}
`;

  /* Everything report-core needs, assembled in ONE place.

     This used to be written inline inside generate(), and the suite that
     compares the phone's report against the dashboard's kept its own copy so
     it could hand over an arbitrary set of rounds. The copy drifted the moment
     the report went bilingual — it stopped passing the second-language
     severity labels, so the two legends stopped matching and the suite whose
     whole job is to catch that reported it as a defect in the code.

     A caller that needs this context asks for it. There is no second copy to
     go stale. */
  function ctxFor(recs, opts) {
    opts = opts || {};
    const scope = opts.scope || "";
    const target = opts.target == null ? "" : opts.target;
    /* An ISO class chip prints only on a point with no grade (see report-core
       sevIf); it wears the name of the grade that class reads as. */
    const sev = s => { const n = (typeof GRADE !== "undefined") ? GRADE.fromIso(s) : null;
      return n ? GRADE.name(n, typeof lang !== "undefined" ? lang : "en") : s; };
    return {
      lang: typeof lang !== "undefined" ? lang : "en",
      /* A single inspection is a unit report with one round in it — the same
         sheet, no cover and no triage list, which is what "one" means. */
      mode: (scope === "one" || scope === "unit") ? "unit" : undefined,
      title: L("rep_title_doc"),
      titleAlt: inOther(() => L("rep_title_doc")),
      sub: scope ? `${L("r_" + scope)} — ${target}` : "",
      subAlt: scope ? `${inOther(() => L("r_" + scope))} — ${target}` : "",
      stamp: opts.stamp || new Date(),
      sevLabel: sev,
      sevLabelAlt: s => inOther(() => sev(s)),
      /* The millimetre table's last column is "hours left on it", and the
         engine asks the HOST for it rather than working it out - so that the
         phone's sheet and the dashboard's sheet cannot quote different hours
         for the same part. The phone passed it. This did not, so every row of
         that column came off the dashboard empty while the same round printed
         a figure on the phone: not a wrong number, an absent one, which is the
         harder kind to notice. */
      forecast: (ref, series) =>
        (window.WEAR && WEAR.forecast ? WEAR.forecast(ref, series) : null),
      records: normalise(recs, opts),
      extra: opts.extra || [],
    };
  }

  /* The machine photographs this set of rounds needs, fetched once and turned
     into bytes. Has to happen before anything is laid out: the drawing carries
     the picture inside an inline <svg>, and html2canvas serialises that SVG —
     a relative href inside it resolves against nothing and comes out blank.

     Keyed by machine and round type, because one report prints the same dozer
     on several sheets and the encode is the expensive part. A URL that fails
     resolves to "", and mapPhoto draws the frame underneath instead — the same
     fallback the capture screen uses when a photo has not been shot yet. */
  async function artFor(recs) {
    if (!(window.WEAR && WEAR.reportPhotoFor && window.CMR)) return {};
    const want = new Map();
    recs.forEach(r => {
      const a = (typeof ASSET_BY !== "undefined" && ASSET_BY[r.equip]) || {};
      const k = r.equip + "|" + r.type;
      if (want.has(k)) return;
      want.set(k, WEAR.reportPhotoFor({ type: r.type, equip: r.equip,
        model: a.m || "", cat: a.cat || a.cls || "" }));
    });
    const art = {};
    await Promise.all([...want].map(async ([k, url]) => {
      art[k] = url ? await window.CMR.inlinePhoto(url) : "";
    }));
    return art;
  }

  /* ---------------------------------------------------------------------- */
  async function generate(scope, target, opts, onProgress) {
    if (!(window.jspdf && window.jspdf.jsPDF) || !window.html2canvas)
      throw new Error("PDF engine not loaded (jsPDF / html2canvas).");
    if (!window.CMR) throw new Error("report-core.js not loaded.");
    opts = opts || {};
    const recs = recsForScope(scope, target);
    if (!recs.length) throw new Error("No inspections match that selection.");

    const extra = [];
    /* A Pareto needs a population to rank. One machine, or one round of one
       machine, is not one — the measurement history in the core says more. */
    if (scope !== "unit" && scope !== "one") { const s = paretoSection(recs); if (s) extra.push(s); }
    /* GET is analysed wherever there is a GET round to analyse — including on
       one machine, because the questions it answers (which position is eating
       the metal, is one side wearing harder) are about that machine and do not
       need a fleet behind them. */
    { const g = getSection(recs); if (g) extra.push(g); }

    const art = await artFor(recs);

    const st = document.createElement("style"); st.textContent = EXTRA_CSS;
    document.head.appendChild(st);
    try {
      const sections = window.CMR.sections(
        ctxFor(recs, Object.assign({}, opts, { scope, target, extra, art })));
      const stamp = new Date().toISOString().slice(0, 10);
      const doc = await window.CMR.paginate({
        sections, jsPDF: window.jspdf.jsPDF, html2canvas: window.html2canvas,
        scale: Number(opts.scale) || 2, h2c: { useCORS: true },
        docId: `CM-${String(target).replace(/[^\w.-]+/g, "_")}-${stamp}`,
        onProgress,
      });
      const safe = String(target).replace(/[^\w.-]+/g, "_");
      doc.save(`CM_${scope}_${safe}_${stamp}.pdf`);
      return doc.getNumberOfPages();
    } finally { st.remove(); }
  }

  window.CMReport = { generate, recsForScope, normalise, ctxFor, artFor, getSection, getStats };
})();
