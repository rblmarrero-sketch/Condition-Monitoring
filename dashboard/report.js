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

  function recsForScope(scope, target) {
    const R = allRecs().filter(r => !r._void);
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
    const out = [];
    const fp = folder();
    if (fp && window.CMDash && window.CMDash.photoBase) {
      const base = window.CMDash.photoBase(it, rec);
      /* photoNames()'s third argument is a list of SUFFIXES — "", "_1", "_2" —
         and it appends the extensions itself. Handing it the extension list
         built names like "…_MP jpg.jpg", which matched nothing, and no report
         from the dashboard has ever carried a photograph. One name per slot,
         first hit wins, because the same photo exists under several extensions. */
      ["", "_1", "_2", "_3", "_4"].forEach(sfx => {
        const names = window.CMDash.photoNames(base, rec, [sfx]) || [];
        for (const n of names) {
          if (fp[n]) { if (out.indexOf(fp[n]) < 0) out.push(fp[n]); break; }
        }
      });
    }
    // a record that carries its own URL (Drive, or an import that inlined it)
    if (!out.length && it.photo) {
      out.push(/^(data:|blob:|https?:|\/)/.test(it.photo) ? it.photo : "../" + it.photo);
    }
    return out;
  }

  /* The two frames, coloured by what each point read — the same drawing the
     phone prints, from the same module, so a fitter sees one machine picture
     wherever the report came from. */
  function reportMap(rec) {
    if (rec.type !== "UC" || !(window.WEAR && WEAR.mapSVG)) return "";
    const a = (typeof ASSET_BY !== "undefined" && ASSET_BY[rec.equip]) || null;
    const prof = a && a.m && WEAR.modelFor ? WEAR.modelFor(a.m) : null;
    if (!prof) return "";
    const by = {};
    (rec.items || []).forEach(it => {
      const w = typeof wearOf === "function" ? wearOf(rec, it) : null;
      by[it.key] = !w ? "" : w.mm == null ? (w.reason ? "na" : "")
        : w.band === "act" ? "act" : w.band === "watch" ? "watch" : "done";
    });
    const short = h => h.replace(/(<text class="um-n um-chain"[^>]*>)([A-Z0-9]+)(<\/text>)/g,
      (m, x, code, y) => x + (WEAR.mapShort[code] || code) + y);
    const side = s => L(s === "L" ? "uc_left_h" : "uc_right_h");
    return window.CMR.fitMap(["L", "R"].map(s => '<div class="ucmapwrap">'
      + short(WEAR.mapSVG(s, prof.rollers || WEAR.rollersDefault,
          prof.frame === "highdrive", k => by[k] || "", "", side(s)))
      + '</div>').join(""));
  }

  /* ---- the dashboard's records, in the shape the core reads -------------- */
  function normalise(recs, opts) {
    const wantPhotos = !!(opts && opts.photos);
    return recs.map(rec => ({
      equip: rec.equip,
      clsLabel: ((typeof ASSET_BY !== "undefined" && ASSET_BY[rec.equip]) || {}).cat || rec.cls || "",
      model: ((typeof ASSET_BY !== "undefined" && ASSET_BY[rec.equip]) || {}).m || "",
      type: rec.type,
      typeLabel: (typeof TYPE_LABEL !== "undefined" && TYPE_LABEL[rec.type]) || rec.type,
      date: rec.date || "",
      by: rec.by || "", sup: rec.sup || "", smu: rec.smu || "",
      gps: rec.gps || null,
      signUrl: rec.signUrl || "",
      mapHTML: reportMap(rec),
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
          name: (typeof ucName === "function" && rec.type === "UC") ? ucName(it) : (it.label || it.key),
          code: ((typeof ucName === "function" && rec.type === "UC") ? ucName(it) : (it.label || it.key)) === it.key ? "" : it.key,
          grade: it.grade || "",
          sev: typeof sevOf === "function" ? sevOf(rec, it) : (it.sev || ""),
          defect: it.defect || "", defectCode: it.defectCode || "", iso: it.iso || "",
          cause: it.cause || "", action: it.actionLabel || "",
          prio: it.prio || "", prioLabel: it.prioLabel || "", wo: it.wo || "",
          comment: it.comment || "", readings: read,
          photos: wantPhotos ? photoSrcs(it, rec) : [],
          w: w ? { mm: w.mm, newMM: w.newMM, condemnMM: w.condemnMM, pct: w.wearPct,
                   band: w.band || "", refSrc: w.refSrc || "",
                   reason: w.reason || "", reasonLabel: w.reasonLabel || "",
                   stood: !!w.stood } : null,
        };
      }),
    }));
  }

  /* ---- what only a fleet view knows --------------------------------------
     Drawn in the core's own language — an eyebrow, a hairline table, the same
     bars — so these read as part of the report rather than bolted onto it. */
  const HEX = () => window.CMR.SEV_HEX;

  function trendSection(recs) {
    const byU = {};
    recs.forEach(r => { (byU[r.equip] = byU[r.equip] || []).push(r); });
    const units = Object.keys(byU).filter(u => byU[u].length > 1);
    if (!units.length) return null;
    const rank = { NOF: 0, INC: 1, DEG: 2, CRI: 3 };
    let h = '<div class="sec"><div class="sechd"><span class="n">__N__</span>'
      + `<span class="h2">${esc(L("rpt_trend"))}</span>`
      + `<span class="muted" style="font-size:10.5px;margin-left:auto;">${esc(L("rpt_trend_sub"))}</span></div>`
      + `<table><tr><th style="width:86px">${esc(L("c_unit_h"))}</th>`
      + `<th style="width:96px">${esc(L("rpt_type_h"))}</th><th>${esc(L("rpt_rounds_h"))}</th></tr>`;
    units.forEach((u, n) => {
      const rows = byU[u].slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      const dots = rows.map(r => {
        const w = typeof worstOf === "function" ? worstOf(r) : "";
        const c = HEX()[w] || "#c9d0d6";
        const pct = (r.items || []).map(it => (typeof wearOf === "function" ? wearOf(r, it) : null))
          .filter(x => x && x.wearPct != null).sort((a, b) => b.wearPct - a.wearPct)[0];
        return `<span class="tdot"><i style="background:${c}"></i>`
          + `<span>${esc(String(r.date || "").slice(5))}</span>`
          + (pct ? `<b>${esc(pct.wearPct)}%</b>` : "") + `</span>`;
      }).join("");
      h += `<tr class="${n % 2 ? "zebra" : ""}">`
        + `<td><span class="unit">${esc(u)}</span></td>`
        + `<td>${esc((typeof TYPE_LABEL !== "undefined" && TYPE_LABEL[rows[0].type]) || rows[0].type)}</td>`
        + `<td><div class="tline">${dots}</div></td></tr>`;
    });
    return { nb: true, html: h + "</table></div>" };
  }

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
    const top = rows[0][1];
    let h = '<div class="sec"><div class="sechd"><span class="n">__N__</span>'
      + `<span class="h2">${esc(L("rpt_pareto"))}</span>`
      + `<span class="muted" style="font-size:10.5px;margin-left:auto;">${esc(L("rpt_pareto_sub"))}</span></div>`
      + `<table><tr><th>${esc(L("rpt_mode_h"))}</th><th style="width:250px"></th>`
      + `<th class="r" style="width:44px">${esc(L("rpt_count_h"))}</th></tr>`;
    rows.forEach(([k, n], i) => {
      const c = HEX()[sev[k]] || "#8a939b";
      h += `<tr class="${i % 2 ? "zebra" : ""}"><td>${esc(k)}</td>`
        + `<td><span class="wb" style="min-width:0"><i style="width:${(n / top * 100).toFixed(1)}%;background:${c}"></i></span></td>`
        + `<td class="r n"><b>${n}</b></td></tr>`;
    });
    return { nb: false, html: h + "</table></div>" };
  }

  const EXTRA_CSS = `
#rptRoot .tline{display:flex;flex-wrap:wrap;gap:5px 9px;}
#rptRoot .tdot{display:inline-flex;align-items:center;gap:4px;font-size:9.5px;color:#5b6670;
  font-variant-numeric:tabular-nums;}
#rptRoot .tdot i{width:9px;height:9px;border-radius:2px;display:block;}
#rptRoot .tdot b{color:#12161a;font-weight:700;}
`;

  /* ---------------------------------------------------------------------- */
  async function generate(scope, target, opts, onProgress) {
    if (!(window.jspdf && window.jspdf.jsPDF) || !window.html2canvas)
      throw new Error("PDF engine not loaded (jsPDF / html2canvas).");
    if (!window.CMR) throw new Error("report-core.js not loaded.");
    opts = opts || {};
    const recs = recsForScope(scope, target);
    if (!recs.length) throw new Error("No inspections match that selection.");

    const scopeName = L("r_" + scope);
    const norm = normalise(recs, opts);
    const extra = [];
    if (scope === "unit")  { const s = trendSection(recs);  if (s) extra.push(s); }
    if (scope !== "unit")  { const s = paretoSection(recs); if (s) extra.push(s); }

    const st = document.createElement("style"); st.textContent = EXTRA_CSS;
    document.head.appendChild(st);
    try {
      const sections = window.CMR.sections({
        lang: typeof lang !== "undefined" ? lang : "en",
        title: L("rep_title_doc"),
        sub: `${scopeName} — ${target}`,
        stamp: new Date(),
        sevLabel: s => (typeof SEV !== "undefined" && SEV[s] ? SEV[s].l : s),
        records: norm,
        extra,
      });
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

  window.CMReport = { generate, recsForScope, normalise };
})();
