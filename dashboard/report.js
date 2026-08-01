/* ============================================================================
   Condition Monitoring — bilingual PDF report builder (EN / RU)
   ----------------------------------------------------------------------------
   Three scopes, one section library:
     unit    — one machine, its inspection history + condition trend
     round   — one inspection date across every unit covered that day
     month   — management summary: KPIs, Pareto, worst units, open actions

   Each inspection type prints its own layout, because they answer different
   questions:
     MP    debris and wear, position by position, with a condition timeline
     FC    what the cut filter showed
     INSP  findings grouped by system, with ISO coded defect / cause / action
     TEMP  readings against per-component warn / alarm limits

   Pages are laid out as real A4 boxes and flowed block by block, so nothing is
   ever sliced through the middle of a row. Each finished page is rasterised
   (Cyrillic renders correctly this way) and placed into the PDF.

   Depends on: jsPDF, html2canvas, and the dashboard's RECS / SEV / HME globals.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------------- page geometry: A4 at 96 dpi ---------------- */
  const PAGE_W = 794, PAGE_H = 1123, MARGIN = 44;
  const BODY_W = PAGE_W - MARGIN * 2;
  const HEAD_H = 96;          // masthead, first page only
  const FOOT_H = 34;
  const ROWS_PER_CHUNK = 22;  // table rows per block, so a block always fits a page

  /* ---------------- bilingual labels ---------------- */
  const B = (en, ru) => `${en} / ${ru}`;
  const B2 = (en, ru) => `<div>${en}</div><div class="ru">${ru}</div>`;
  const T = {
    report: ["Condition Monitoring Report", "Отчёт по мониторингу состояния"],
    unit: ["Equipment report", "Отчёт по единице техники"],
    round: ["Inspection round", "Обход осмотра"],
    month: ["Fleet summary", "Сводка по парку"],
    generated: ["Generated", "Сформировано"],
    page: ["Page", "Стр."],
    sevMix: ["Severity mix", "Распределение по категориям"],
    attention: ["Requires attention", "Требуют внимания"],
    noFindings: ["No findings recorded.", "Замечаний не зафиксировано."],
    checkedOk: ["Checked, no findings", "Проверено, без замечаний"],
    inspections: ["Inspections", "Осмотров"],
    units: ["Units", "Единиц техники"],
    findings: ["Findings", "Замечаний"],
    critical: ["Critical", "Критических"],
    openAct: ["Actions to plan", "Действий запланировать"],
    photos: ["Photos", "Фотографии"],
    signoff: ["Sign-off", "Подписи"],
    inspector: ["Inspected by", "Осмотр выполнил"],
    supervisor: ["Verified by", "Проверил"],
    date: ["Date", "Дата"],
    signature: ["Signature", "Подпись"],
    trend: ["Condition trend", "Динамика состояния"],
    trendTemp: ["Temperature trend", "Динамика температуры"],
    topDefects: ["Top failure modes", "Основные виды отказов"],
    topCauses: ["Top direct causes", "Основные прямые причины"],
    topIso: ["ISO 14224 mechanisms", "Механизмы отказа ISO 14224"],
    worstUnits: ["Units needing attention", "Техника, требующая внимания"],
    openActions: ["Outstanding actions", "Незакрытые мероприятия"],
    coverage: ["Coverage by type", "Охват по типам осмотра"],
    exceed: ["Readings over limit", "Превышения предела"],
    limits: ["Limit", "Предел"],
    method: ["Method", "Метод"],
    rise: ["Rise", "Превышение"],
    reading: ["Reading", "Замер"],
    ambient: ["Ambient", "Окр. среда"],
    point: ["Measurement point", "Точка замера"],
    position: ["Position", "Позиция"],
    filter: ["Filter", "Фильтр"],
    component: ["Component", "Узел"],
    grade: ["Grade", "Степень"],
    sev: ["Severity", "Категория"],
    defect: ["Defect", "Дефект"],
    cause: ["Direct cause", "Прямая причина"],
    action: ["Action", "Действие"],
    wo: ["WO / 1C", "Заказ / 1С"],
    particles: ["Particles", "Частицы"],
    compH: ["Comp. hrs", "Нар. узла"],
    oilH: ["Oil hrs", "Нар. масла"],
    note: ["Note", "Примечание"],
    smu: ["SMU", "Моточасы"],
    location: ["Location", "Координаты"],
    nUnits: ["units", "ед."],
    nItems: ["items", "поз."],
    disclaimer: [
      "Severity follows ISO 14224:2016 severity classes. Temperature limits are general mobile-equipment values — confirm against OEM manuals.",
      "Категории отказов по ISO 14224:2016. Температурные пределы — общие значения для мобильной техники, сверяйте с руководствами изготовителя."
    ],
  };
  const L = (k) => B(T[k][0], T[k][1]);
  const L2 = (k) => B2(T[k][0], T[k][1]);

  const SEVL = {
    NOF: ["No failure", "Без отказа"], INC: ["Incipient", "Зарождающийся"],
    DEG: ["Degraded", "Частичный"], CRI: ["Critical", "Критический"],
  };
  const SEVHEX = { NOF: "#0ca30c", INC: "#fab219", DEG: "#ec835a", CRI: "#d03b3b" };
  const GRADEHEX = { A: "#0ca30c", B: "#fab219", C: "#ec835a", X: "#d03b3b" };
  const TYPEL = {
    MP: ["Magnetic Plug", "Магнитная пробка"], FC: ["Filter Cut", "Разрез фильтра"],
    INSP: ["Inspection", "Осмотр"], TEMP: ["Temperature", "Температура"],
  };

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ddmmyyyy = (iso) => { const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || ""); };
  const sevOf = (i) => i.sev || gradeSev()[i.grade] || "";
  const sevRank = (s) => ({ NOF: 0, INC: 1, DEG: 2, CRI: 3 }[s] ?? -1);
  const isFinding = (i) => i.grade || i.sev || i.defectCode || i.comment || i.action || i.tempC;

  /* A block marked sticky must stay on the same page as the block after it, so a
     section heading or a unit banner is never stranded at the foot of a page. */
  const S = (html) => ({ html, sticky: true });
  const norm = (b) => (typeof b === "string" ? { html: b, sticky: false } : b);
  /* Some imported labels repeat the item key ("4C 4C LEFT REAR FINAL DRIVE") — drop it. */
  const cleanLabel = (i) => {
    const k = String(i.key || ""), l = String(i.label || "");
    return l.toUpperCase().startsWith(k.toUpperCase() + " ") ? l.slice(k.length + 1) : l;
  };
  const plural = (n, en, ru) => `${n} ${en}${n === 1 ? "" : "s"} / ${ru}`;

  const pill = (s) => s ? `<span class="pill" style="background:${SEVHEX[s]}">${SEVL[s][0]} / ${SEVL[s][1]}</span>` : "";
  const pillS = (s) => s ? `<span class="pill sm" style="background:${SEVHEX[s]}">${SEVL[s][0]}</span>` : "";
  const gradeChip = (g) => g ? `<span class="pill sm" style="background:${GRADEHEX[g] || "#8b8a83"}">${esc(g)}</span>` : "";

  /* ---------------- report stylesheet (injected once) ---------------- */
  const CSS = `
html,body{margin:0;padding:0;background:#fff;}
.rpt-page{width:${PAGE_W}px;height:${PAGE_H}px;background:#fff;color:#15150f;position:relative;overflow:hidden;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:10px;line-height:1.42;}
.rpt-body{position:absolute;left:${MARGIN}px;right:${MARGIN}px;top:${MARGIN}px;}
.rpt-foot{position:absolute;left:${MARGIN}px;right:${MARGIN}px;bottom:18px;display:flex;font-size:8.5px;color:#8b8a83;
  border-top:1px solid #e4e3dc;padding-top:6px;}
.rpt-foot .c{flex:1;text-align:center;} .rpt-foot .r{text-align:right;}
.rpt-mast{border-bottom:2.5px solid #1f5fa8;padding-bottom:11px;margin-bottom:16px;display:flex;align-items:flex-end;}
.rpt-mast .ttl{font-size:19px;font-weight:750;letter-spacing:-.2px;}
.rpt-mast .ttl .ru{font-size:12.5px;font-weight:600;color:#52514e;letter-spacing:0;}
.rpt-mast .scope{font-size:11px;color:#52514e;margin-top:3px;}
.rpt-mast .meta{margin-left:auto;text-align:right;font-size:9px;color:#8b8a83;line-height:1.5;}
.rpt h3{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#1f5fa8;
  margin:0 0 7px;padding-bottom:4px;border-bottom:1px solid #e4e3dc;}
.rpt h3 .ru{text-transform:none;letter-spacing:0;color:#8b8a83;font-weight:600;}
.rpt .blk{margin-bottom:15px;}
.rpt .uhead{background:#f4f4f0;border:1px solid #e4e3dc;border-left:4px solid #1f5fa8;border-radius:5px;
  padding:8px 11px;display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:8px;}
.rpt .uhead .u{font-size:15px;font-weight:750;letter-spacing:-.2px;}
.rpt .uhead .k{font-size:9px;color:#8b8a83;text-transform:uppercase;letter-spacing:.5px;}
.rpt .uhead .v{font-size:10px;font-weight:600;}
.rpt .uhead .sp{margin-left:auto;}
.rpt .tag{background:#e6eef8;color:#1f5fa8;border-radius:4px;padding:1px 7px;font-size:9px;font-weight:700;}
.rpt .pill{display:inline-block;color:#fff;border-radius:9px;padding:1px 7px;font-size:8.5px;font-weight:700;white-space:nowrap;}
.rpt .pill.sm{font-size:8px;padding:1px 6px;}
.rpt table{width:100%;border-collapse:collapse;font-size:9px;}
.rpt th{background:#eeeee9;border:1px solid #ddddd5;padding:4px 5px;text-align:left;font-weight:700;font-size:8.5px;vertical-align:bottom;}
.rpt th .ru{font-weight:500;color:#75746e;font-size:7.5px;}
.rpt td{border:1px solid #e4e3dc;padding:4px 5px;vertical-align:top;}
.rpt td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
.rpt td.c{text-align:center;}
.rpt tr.alt td{background:#fafaf7;}
.rpt .muted{color:#8b8a83;}
.rpt .code{color:#8b8a83;font-size:8px;}
.rpt .strip{display:flex;flex-wrap:wrap;gap:5px;align-items:flex-start;margin-top:5px;}
.rpt .shot{width:112px;}
.rpt .shot img{width:112px;height:84px;object-fit:cover;border:1px solid #d8d7d0;border-radius:3px;display:block;}
.rpt .shot .cap{font-size:7.5px;color:#8b8a83;margin-top:2px;text-align:center;}
.rpt .kpis{display:flex;gap:8px;}
.rpt .kpi{flex:1;border:1px solid #e4e3dc;border-radius:6px;padding:8px 10px;background:#fafaf7;}
.rpt .kpi .k{font-size:8px;text-transform:uppercase;letter-spacing:.5px;color:#8b8a83;}
.rpt .kpi .v{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.15;}
.rpt .kpi .s{font-size:8px;color:#8b8a83;}
.rpt .sevbar{display:flex;height:11px;border-radius:6px;overflow:hidden;background:#eeeee9;margin:4px 0 3px;}
.rpt .sevkey{display:flex;gap:12px;font-size:8.5px;color:#52514e;}
.rpt .sevkey i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;}
.rpt .par{display:grid;grid-template-columns:minmax(150px,1.5fr) 1fr 26px;gap:8px;align-items:center;font-size:9px;margin-bottom:4px;}
.rpt .par .tr{background:#eeeee9;border-radius:3px;height:12px;overflow:hidden;}
.rpt .par .fl{height:100%;border-radius:3px;}
.rpt .par .n{text-align:right;font-variant-numeric:tabular-nums;font-weight:650;}
.rpt .tl{display:flex;gap:3px;align-items:center;}
.rpt .tl i{width:13px;height:13px;border-radius:3px;display:inline-block;color:#fff;font-size:8px;
  font-style:normal;text-align:center;line-height:13px;font-weight:700;}
.rpt .lim{width:118px;height:9px;background:#eeeee9;border-radius:5px;position:relative;overflow:hidden;}
.rpt .lim .f{position:absolute;left:0;top:0;bottom:0;border-radius:5px;}
.rpt .lim .t{position:absolute;top:-1px;bottom:-1px;width:1.5px;background:#52514e;}
.rpt .sign{display:flex;gap:26px;margin-top:6px;}
.rpt .sign .sb{flex:1;max-width:250px;}
.rpt .sign .ln{height:40px;border-bottom:1px solid #8b8a83;display:flex;align-items:flex-end;}
.rpt .sign .ln img{max-height:40px;max-width:100%;}
.rpt .sign .nm{font-size:9.5px;font-weight:650;margin-top:3px;}
.rpt .sign .k{font-size:8px;color:#8b8a83;text-transform:uppercase;letter-spacing:.5px;}
.rpt .note{font-size:8px;color:#8b8a83;font-style:italic;margin-top:5px;}
`;

  /* ---------------- data helpers ----------------
     RECS / GRADE_SEV / folderPhotos are `let`/`const` in the dashboard, so they live in
     the global lexical scope and are NOT properties of window — reference them directly. */
  const allRecs = () => (typeof RECS !== "undefined" ? RECS : []);
  const gradeSev = () => (typeof GRADE_SEV !== "undefined" ? GRADE_SEV : {});
  const folder = () => (typeof folderPhotos !== "undefined" ? folderPhotos : null);
  function recsForScope(scope, target) {
    const R = allRecs();
    if (scope === "unit") return R.filter(r => r.equip === target).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (scope === "round") return R.filter(r => r.date === target).sort((a, b) => a.equip.localeCompare(b.equip));
    return R.filter(r => (r.date || "").slice(0, 7) === target).sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.equip.localeCompare(b.equip));
  }
  function tempCtxOf(i) { return `${i.key || ""} ${i.label || ""}`; }
  function tempSevOf(i) {
    if (!i.tempC) return sevOf(i);
    return sevOf(i) || (window.tempSeverity ? window.tempSeverity(i.tempC, window.tempLimit(tempCtxOf(i))) : "");
  }

  /* photos: the folder picker indexes by file name, so rebuild the agreed names */
  function photoSrcs(it, rec, max) {
    const out = [];
    const fp = folder();
    if (fp) {
      const base = `${rec.equip}${usesRegister(rec.type) ? "." + it.key : "_" + String(it.key).replace(/\./g, "-")}_${ddmmyyyy(rec.date)}_${rec.type}`;
      for (const ext of ["jpg", "jpeg", "png", "JPG", "webp"]) {
        if (fp[`${base}.${ext}`]) out.push(fp[`${base}.${ext}`]);
        for (let n = 1; n <= 4; n++) if (fp[`${base}_${n}.${ext}`]) out.push(fp[`${base}_${n}.${ext}`]);
      }
    }
    if (!out.length && it.photo) out.push(/^(data:|blob:|https?:|\/)/.test(it.photo) ? it.photo : "../" + it.photo);
    return out.slice(0, max || 4);
  }
  function signatureSrc(rec) {
    const fp = folder(); if (!fp) return null;
    return fp[`${rec.equip}_${ddmmyyyy(rec.date)}_${rec.type}_SIGN.png`] || null;
  }

  /* ---------------- small view helpers ---------------- */
  function severityBar(cnt) {
    const total = ["CRI", "DEG", "INC", "NOF"].reduce((s, k) => s + (cnt[k] || 0), 0);
    if (!total) return `<div class="muted">${L("noFindings")}</div>`;
    const bar = ["CRI", "DEG", "INC", "NOF"].filter(k => cnt[k])
      .map(k => `<span style="flex:${cnt[k]};background:${SEVHEX[k]}"></span>`).join("");
    const key = ["CRI", "DEG", "INC", "NOF"].filter(k => cnt[k])
      .map(k => `<span><i style="background:${SEVHEX[k]}"></i>${SEVL[k][0]} / ${SEVL[k][1]}: <b>${cnt[k]}</b></span>`).join("");
    return `<div class="sevbar">${bar}</div><div class="sevkey">${key}</div>`;
  }
  function countSev(items) {
    const c = { NOF: 0, INC: 0, DEG: 0, CRI: 0 };
    items.forEach(i => { const s = i._sev !== undefined ? i._sev : sevOf(i); if (c[s] != null) c[s]++; });
    return c;
  }
  function limitBar(val, lim) {
    const n = parseFloat(val); if (isNaN(n)) return "";
    const scale = Math.max(lim.alarm * 1.2, n * 1.05);
    const pc = (x) => Math.min(100, Math.max(0, x / scale * 100));
    const sv = window.tempSeverity ? window.tempSeverity(val, lim) : "";
    return `<div class="lim"><div class="f" style="width:${pc(n)}%;background:${SEVHEX[sv] || "#8b8a83"}"></div>
      <div class="t" style="left:${pc(lim.warn)}%"></div><div class="t" style="left:${pc(lim.alarm)}%"></div></div>`;
  }
  function paretoRows(pairs, colour) {
    if (!pairs.length) return `<div class="muted">${L("noFindings")}</div>`;
    const max = pairs[0][1];
    return pairs.map(([lbl, n, sub]) => `<div class="par"><div>${esc(lbl)}${sub ? ` <span class="code">${esc(sub)}</span>` : ""}</div>
      <div class="tr"><div class="fl" style="width:${Math.max(3, n / max * 100)}%;background:${colour || "#1f5fa8"}"></div></div>
      <div class="n">${n}</div></div>`).join("");
  }
  function topN(list, keyFn, subFn, n) {
    const m = new Map();
    list.forEach(x => { const k = keyFn(x); if (!k) return; const e = m.get(k) || { n: 0, sub: subFn ? subFn(x) : "" }; e.n++; m.set(k, e); });
    return [...m.entries()].map(([k, v]) => [k, v.n, v.sub]).sort((a, b) => b[1] - a[1]).slice(0, n || 10);
  }

  /* ---------------- per-type detail tables ---------------- */
  function tblMP(rec, items) {
    const head = `<tr><th style="width:12%">${L2("position")}</th><th class="c" style="width:6%">${L2("grade")}</th>
      <th style="width:11%">${L2("sev")}</th><th class="c" style="width:7%">${L2("particles")}</th>
      <th class="c" style="width:8%">${L2("compH")}</th><th class="c" style="width:8%">${L2("oilH")}</th>
      <th>${L2("defect")}</th><th>${L2("cause")}</th><th style="width:14%">${L2("action")}</th></tr>`;
    const rows = items.map((i, n) => `<tr class="${n % 2 ? "alt" : ""}">
      <td><b>${esc(i.key)}</b><div class="code">${esc(cleanLabel(i))}</div></td>
      <td class="c">${gradeChip(i.grade)}</td><td>${pillS(sevOf(i))}</td>
      <td class="n">${esc(i.particle || "")}</td><td class="n">${esc(i.comp || "")}</td><td class="n">${esc(i.oil || "")}</td>
      <td>${i.defect ? esc(i.defect) + `<div class="code">${esc(i.defectCode)}${i.iso ? ` · ISO ${esc(i.iso)}/${esc(i.isoMode)}` : ""}</div>` : ""}${i.comment ? `<div class="muted">“${esc(i.comment)}”</div>` : ""}</td>
      <td>${esc(i.cause || "")}</td>
      <td>${esc(i.actionLabel || "")}${i.wo ? `<div class="code">${esc(i.wo)}</div>` : ""}</td></tr>`);
    return { head, rows };
  }
  function tblFC(rec, items) {
    const head = `<tr><th style="width:16%">${L2("filter")}</th><th class="c" style="width:6%">${L2("grade")}</th>
      <th style="width:11%">${L2("sev")}</th><th>${L2("defect")}</th><th>${L2("cause")}</th>
      <th style="width:15%">${L2("action")}</th><th style="width:10%">${L2("wo")}</th></tr>`;
    const rows = items.map((i, n) => `<tr class="${n % 2 ? "alt" : ""}">
      <td><b>${esc(i.key)}</b><div class="code">${esc(cleanLabel(i))}</div></td>
      <td class="c">${gradeChip(i.grade)}</td><td>${pillS(sevOf(i))}</td>
      <td>${i.defect ? esc(i.defect) + `<div class="code">${esc(i.defectCode)}${i.iso ? ` · ISO ${esc(i.iso)}/${esc(i.isoMode)}` : ""}</div>` : ""}${i.comment ? `<div class="muted">“${esc(i.comment)}”</div>` : ""}</td>
      <td>${esc(i.cause || "")}</td><td>${esc(i.actionLabel || "")}</td><td class="code">${esc(i.wo || "")}</td></tr>`);
    return { head, rows };
  }
  function tblINSP(rec, items) {
    const head = `<tr><th style="width:22%">${L2("component")}</th><th style="width:11%">${L2("sev")}</th>
      <th>${L2("defect")}</th><th>${L2("cause")}</th><th style="width:15%">${L2("action")}</th><th style="width:9%">${L2("wo")}</th></tr>`;
    const rows = items.map((i, n) => `<tr class="${n % 2 ? "alt" : ""}">
      <td><b>${esc(i.key)}</b><div class="code">${esc(cleanLabel(i))}</div></td>
      <td>${pillS(sevOf(i))}${i.grade ? " " + gradeChip(i.grade) : ""}</td>
      <td>${i.defect ? esc(i.defect) + `<div class="code">${esc(i.defectCode)}${i.iso ? ` · ISO ${esc(i.iso)}/${esc(i.isoMode)}` : ""}</div>` : ""}${i.comment ? `<div class="muted">“${esc(i.comment)}”</div>` : ""}</td>
      <td>${esc(i.cause || "")}</td><td>${esc(i.actionLabel || "")}</td><td class="code">${esc(i.wo || "")}</td></tr>`);
    return { head, rows };
  }
  function tblTEMP(rec, items) {
    const head = `<tr><th style="width:22%">${L2("point")}</th><th class="c" style="width:8%">${L2("reading")}</th>
      <th class="c" style="width:8%">${L2("ambient")}</th><th class="c" style="width:7%">${L2("rise")}</th>
      <th style="width:15%">${L2("limits")}</th><th style="width:11%">${L2("sev")}</th>
      <th class="c" style="width:7%">${L2("method")}</th><th>${L2("action")}</th></tr>`;
    const rows = items.map((i, n) => {
      const lim = window.tempLimit ? window.tempLimit(tempCtxOf(i)) : { warn: 80, alarm: 95 };
      const a = parseFloat(i.ambC), v = parseFloat(i.tempC);
      const rise = (!isNaN(a) && !isNaN(v)) ? (Math.round((v - a) * 10) / 10) : "";
      return `<tr class="${n % 2 ? "alt" : ""}">
        <td><b>${esc(i.key)}</b><div class="code">${esc(cleanLabel(i))}</div></td>
        <td class="n"><b>${esc(i.tempC || "")}</b></td><td class="n muted">${esc(i.ambC || "")}</td>
        <td class="n">${rise === "" ? "" : "+" + rise}</td>
        <td>${limitBar(i.tempC, lim)}<div class="code">${lim.warn} / ${lim.alarm} °C</div></td>
        <td>${pillS(tempSevOf(i))}</td><td class="c code">${esc(i.tempMethod || "")}</td>
        <td>${esc(i.actionLabel || "")}${i.defect ? `<div class="code">${esc(i.defect)}</div>` : ""}${i.comment ? `<div class="muted">“${esc(i.comment)}”</div>` : ""}</td></tr>`;
    });
    return { head, rows };
  }
  const TBL = { MP: tblMP, FC: tblFC, INSP: tblINSP, TEMP: tblTEMP };

  /* ---------------- record block (one unit, one inspection) ---------------- */
  function recordBlocks(rec, opts) {
    const out = [];
    const items = rec.items.filter(isFinding);
    const shown = items.length ? items : rec.items;
    const clean = rec.items.filter(i => !isFinding(i));
    const tl = TYPEL[rec.type] || [rec.type, rec.type];

    out.push(S(`<div class="uhead">
      <span class="u">${esc(rec.equip)}</span>
      <span class="tag">${tl[0]} / ${tl[1]}</span>
      <span><span class="k">${T.date[0]}</span> <span class="v">${ddmmyyyy(rec.date)}</span></span>
      ${rec.smu ? `<span><span class="k">${T.smu[0]}</span> <span class="v">${esc(rec.smu)}</span></span>` : ""}
      ${rec.by ? `<span class="sp"><span class="k">${T.inspector[0]}</span> <span class="v">${esc(rec.by)}</span></span>` : `<span class="sp"></span>`}
      ${rec.gps ? `<span><span class="k">${T.location[0]}</span> <span class="v">${rec.gps.lat.toFixed(4)}, ${rec.gps.lon.toFixed(4)}</span></span>` : ""}
    </div>`));

    // temperature exceedances get called out before the table
    if (rec.type === "TEMP") {
      const over = rec.items.filter(i => ["DEG", "CRI"].includes(tempSevOf(i)));
      if (over.length) out.push(S(`<div style="margin-bottom:7px;font-size:9.5px;"><b>${L("exceed")}:</b> ` +
        over.map(i => `${esc(i.key)} <b>${esc(i.tempC)} °C</b> ${pillS(tempSevOf(i))}`).join(" &nbsp; ") + `</div>`));
    } else {
      const att = shown.filter(i => sevRank(sevOf(i)) >= 2);
      out.push(S(`<div style="margin-bottom:7px;font-size:9.5px;"><b>${L("attention")}:</b> ` +
        (att.length ? att.map(i => `${esc(i.key)} ${pillS(sevOf(i))}${i.defect ? " " + esc(i.defect) : ""}`).join(" &nbsp; ")
          : `<span class="muted">${L("noFindings")}</span>`) + `</div>`));
    }

    const { head, rows } = (TBL[rec.type] || tblINSP)(rec, shown);
    for (let n = 0; n < rows.length; n += ROWS_PER_CHUNK) {
      out.push(`<table><thead>${head}</thead><tbody>${rows.slice(n, n + ROWS_PER_CHUNK).join("")}</tbody></table>`);
    }
    if (clean.length && rec.type === "INSP")
      out.push(`<div class="note">${L("checkedOk")}: ${clean.map(i => esc(i.key)).join(", ")}</div>`);

    if (opts.photos) {
      const strips = [];
      for (const i of shown) {
        const srcs = photoSrcs(i, rec, 4);
        srcs.forEach(s => strips.push(`<div class="shot"><img src="${s}"><div class="cap">${esc(i.key)}</div></div>`));
      }
      for (let n = 0; n < strips.length; n += 6)
        out.push(`<div class="strip">${strips.slice(n, n + 6).join("")}</div>`);
    }
    return out;
  }

  /* ---------------- condition trend (unit scope) ---------------- */
  function trendBlocks(recs) {
    const out = [];
    const byType = {};
    recs.forEach(r => (byType[r.type] ||= []).push(r));

    for (const [ty, rs] of Object.entries(byType)) {
      const dates = [...new Set(rs.map(r => r.date))].sort();
      if (dates.length < 2) continue;
      const keys = [...new Set(rs.flatMap(r => r.items.filter(isFinding).map(i => i.key)))].sort();
      if (!keys.length) continue;
      const isTemp = ty === "TEMP";
      const tl = TYPEL[ty] || [ty, ty];
      out.push(S(`<h3>${isTemp ? L("trendTemp") : L("trend")} — ${tl[0]} / ${tl[1]}</h3>`));
      const head = `<tr><th style="width:26%">${isTemp ? L2("point") : L2("component")}</th>` +
        dates.map(d => `<th class="c">${ddmmyyyy(d).slice(0, 5)}</th>`).join("") + `</tr>`;
      const rows = keys.map((k, n) => {
        const cells = dates.map(d => {
          const r = rs.find(x => x.date === d); const i = r && r.items.find(x => x.key === k);
          if (!i) return `<td class="c muted">—</td>`;
          if (isTemp) {
            const s = tempSevOf(i);
            return `<td class="c" style="background:${s ? SEVHEX[s] + "22" : "transparent"};font-variant-numeric:tabular-nums;"><b>${esc(i.tempC || "")}</b></td>`;
          }
          const s = sevOf(i);
          return `<td class="c">${i.grade ? gradeChip(i.grade) : (s ? pillS(s) : `<span class="muted">—</span>`)}</td>`;
        }).join("");
        const lbl = cleanLabel(rs.flatMap(r => r.items).find(i => i.key === k) || {});
        return `<tr class="${n % 2 ? "alt" : ""}"><td><b>${esc(k)}</b> <span class="code">${esc(lbl)}</span></td>${cells}</tr>`;
      });
      for (let n = 0; n < rows.length; n += ROWS_PER_CHUNK)
        out.push(`<table><thead>${head}</thead><tbody>${rows.slice(n, n + ROWS_PER_CHUNK).join("")}</tbody></table>`);
    }
    return out;
  }

  /* ---------------- sign-off ---------------- */
  function signBlock(recs) {
    const rec = recs.find(r => r.sup || r.signed) || recs[0] || {};
    const sig = signatureSrc(rec);
    const insp = [...new Set(recs.map(r => r.by).filter(Boolean))].join(", ");
    const sup = [...new Set(recs.map(r => r.sup).filter(Boolean))].join(", ");
    return `<h3>${L2("signoff")}</h3><div class="sign">
      <div class="sb"><div class="k">${L("inspector")}</div><div class="ln"></div><div class="nm">${esc(insp || "")}</div></div>
      <div class="sb"><div class="k">${L("supervisor")}</div><div class="ln">${sig ? `<img src="${sig}">` : ""}</div><div class="nm">${esc(sup || "")}</div></div>
      <div class="sb"><div class="k">${L("date")}</div><div class="ln"></div><div class="nm"></div></div>
    </div><div class="note">${L("disclaimer")}</div>`;
  }

  /* ---------------- scope builders ---------------- */
  function buildUnit(target, opts) {
    const recs = recsForScope("unit", target); const blocks = [];
    if (!recs.length) return { blocks: [`<div class="muted">${L("noFindings")}</div>`], recs };
    const all = recs.flatMap(r => r.items.filter(isFinding).map(i => ({ ...i, _sev: r.type === "TEMP" ? tempSevOf(i) : sevOf(i) })));
    const cnt = countSev(all);
    blocks.push(`<div class="kpis">
      <div class="kpi"><div class="k">${T.inspections[0]} / ${T.inspections[1]}</div><div class="v">${recs.length}</div><div class="s">${ddmmyyyy(recs[recs.length - 1].date)} → ${ddmmyyyy(recs[0].date)}</div></div>
      <div class="kpi"><div class="k">${T.findings[0]} / ${T.findings[1]}</div><div class="v">${all.length}</div><div class="s">${T.nItems[0]}</div></div>
      <div class="kpi"><div class="k">${T.attention[0]} / ${T.attention[1]}</div><div class="v">${cnt.DEG + cnt.CRI}</div><div class="s">degraded + critical</div></div>
      <div class="kpi"><div class="k">${T.critical[0]} / ${T.critical[1]}</div><div class="v" style="color:${cnt.CRI ? SEVHEX.CRI : "inherit"}">${cnt.CRI}</div><div class="s">&nbsp;</div></div></div>`);
    blocks.push(`<div class="blk"><h3>${L2("sevMix")}</h3>${severityBar(cnt)}</div>`);
    blocks.push(...trendBlocks(recs));
    recs.forEach(r => { blocks.push(S(`<h3>${TYPEL[r.type] ? TYPEL[r.type][0] + " / " + TYPEL[r.type][1] : r.type} — ${ddmmyyyy(r.date)}</h3>`)); blocks.push(...recordBlocks(r, opts)); });
    blocks.push(signBlock(recs));
    return { blocks, recs };
  }

  function buildRound(target, opts) {
    const recs = recsForScope("round", target); const blocks = [];
    if (!recs.length) return { blocks: [`<div class="muted">${L("noFindings")}</div>`], recs };
    const all = recs.flatMap(r => r.items.filter(isFinding).map(i => ({ ...i, _sev: r.type === "TEMP" ? tempSevOf(i) : sevOf(i), _r: r })));
    const cnt = countSev(all);
    const units = new Set(recs.map(r => r.equip)).size;
    blocks.push(`<div class="kpis">
      <div class="kpi"><div class="k">${T.units[0]} / ${T.units[1]}</div><div class="v">${units}</div><div class="s">${recs.length} ${T.inspections[0].toLowerCase()}</div></div>
      <div class="kpi"><div class="k">${T.findings[0]} / ${T.findings[1]}</div><div class="v">${all.length}</div><div class="s">${T.nItems[0]}</div></div>
      <div class="kpi"><div class="k">${T.attention[0]} / ${T.attention[1]}</div><div class="v">${cnt.DEG + cnt.CRI}</div><div class="s">degraded + critical</div></div>
      <div class="kpi"><div class="k">${T.critical[0]} / ${T.critical[1]}</div><div class="v" style="color:${cnt.CRI ? SEVHEX.CRI : "inherit"}">${cnt.CRI}</div><div class="s">&nbsp;</div></div></div>`);
    blocks.push(`<div class="blk"><h3>${L2("sevMix")}</h3>${severityBar(cnt)}</div>`);

    // what the supervisor reads first: everything needing action, across all units
    const att = all.filter(x => sevRank(x._sev) >= 2 || (x.action && x.action !== "MON"))
      .sort((a, b) => sevRank(b._sev) - sevRank(a._sev));
    blocks.push(S(`<h3>${L2("attention")}</h3>`));
    if (!att.length) blocks.push(`<div class="muted">${L("noFindings")}</div>`);
    else {
      const head = `<tr><th style="width:9%">${L2("sev")}</th><th style="width:9%">Unit / Ед.</th>
        <th style="width:18%">${L2("component")}</th><th>${L2("defect")}</th><th>${L2("cause")}</th>
        <th style="width:15%">${L2("action")}</th><th style="width:8%">${L2("wo")}</th></tr>`;
      const rows = att.map((x, n) => `<tr class="${n % 2 ? "alt" : ""}"><td>${pillS(x._sev)}</td>
        <td><b>${esc(x._r.equip)}</b><div class="code">${(TYPEL[x._r.type] || [""])[0]}</div></td>
        <td><b>${esc(x.key)}</b><div class="code">${esc(cleanLabel(x))}</div></td>
        <td>${esc(x.defect || "")}${x.tempC ? `<b>${esc(x.tempC)} °C</b>` : ""}</td><td>${esc(x.cause || "")}</td>
        <td>${esc(x.actionLabel || "")}</td><td class="code">${esc(x.wo || "")}</td></tr>`);
      for (let n = 0; n < rows.length; n += ROWS_PER_CHUNK)
        blocks.push(`<table><thead>${head}</thead><tbody>${rows.slice(n, n + ROWS_PER_CHUNK).join("")}</tbody></table>`);
    }
    recs.forEach(r => blocks.push(...recordBlocks(r, opts)));
    blocks.push(signBlock(recs));
    return { blocks, recs };
  }

  function buildMonth(target, opts) {
    const recs = recsForScope("month", target); const blocks = [];
    if (!recs.length) return { blocks: [`<div class="muted">${L("noFindings")}</div>`], recs };
    const all = recs.flatMap(r => r.items.filter(isFinding).map(i => ({ ...i, _sev: r.type === "TEMP" ? tempSevOf(i) : sevOf(i), _r: r })));
    const cnt = countSev(all);
    const units = new Set(recs.map(r => r.equip)).size;
    const openAct = all.filter(x => x.action && x.action !== "MON").length;
    blocks.push(`<div class="kpis">
      <div class="kpi"><div class="k">${T.inspections[0]} / ${T.inspections[1]}</div><div class="v">${recs.length}</div><div class="s">${units} ${T.nUnits[0]}</div></div>
      <div class="kpi"><div class="k">${T.findings[0]} / ${T.findings[1]}</div><div class="v">${all.length}</div><div class="s">${T.nItems[0]}</div></div>
      <div class="kpi"><div class="k">${T.attention[0]} / ${T.attention[1]}</div><div class="v">${cnt.DEG + cnt.CRI}</div><div class="s">degraded + critical</div></div>
      <div class="kpi"><div class="k">${T.critical[0]} / ${T.critical[1]}</div><div class="v" style="color:${cnt.CRI ? SEVHEX.CRI : "inherit"}">${cnt.CRI}</div><div class="s">&nbsp;</div></div>
      <div class="kpi"><div class="k">${T.openAct[0]} / ${T.openAct[1]}</div><div class="v">${openAct}</div><div class="s">excl. monitor</div></div></div>`);
    blocks.push(`<div class="blk"><h3>${L2("sevMix")}</h3>${severityBar(cnt)}</div>`);

    // coverage by inspection type
    const byType = {};
    recs.forEach(r => { const e = byType[r.type] ||= { n: 0, u: new Set() }; e.n++; e.u.add(r.equip); });
    blocks.push(S(`<h3>${L2("coverage")}</h3>`));
    blocks.push(`<table><thead><tr><th>${B2("Type", "Тип")}</th>
      <th class="c">${L2("inspections")}</th><th class="c">${L2("units")}</th><th class="c">${L2("findings")}</th></tr></thead><tbody>` +
      Object.entries(byType).map(([ty, e], n) => `<tr class="${n % 2 ? "alt" : ""}">
        <td><b>${(TYPEL[ty] || [ty])[0]}</b> <span class="code">${(TYPEL[ty] || ["", ty])[1]}</span></td>
        <td class="c">${e.n}</td><td class="c">${e.u.size}</td>
        <td class="c">${all.filter(x => x._r.type === ty).length}</td></tr>`).join("") + `</tbody></table>`);

    blocks.push(`<h3>${L2("topDefects")}</h3>` + paretoRows(topN(all, x => x.defect, x => x.defectCode, 10)));
    blocks.push(`<h3>${L2("topCauses")}</h3>` + paretoRows(topN(all, x => x.cause, x => x.causeCode, 10), "#ec835a"));
    blocks.push(`<h3>${L2("topIso")}</h3>` + paretoRows(topN(all, x => {
      const m = window.HME && window.HME.isoFailureModeCodes && window.HME.isoFailureModeCodes[x.iso];
      return x.iso ? `${x.iso} ${m ? m.en : ""}` : "";
    }, null, 10), "#1f5fa8"));

    // worst units
    const byUnit = {};
    all.forEach(x => { const e = byUnit[x._r.equip] ||= { w: "", n: 0, cri: 0, last: "" };
      if (sevRank(x._sev) > sevRank(e.w)) e.w = x._sev;
      if (x._sev === "CRI") e.cri++; e.n++;
      if ((x._r.date || "") > e.last) e.last = x._r.date; });
    const worst = Object.entries(byUnit).filter(([, e]) => sevRank(e.w) >= 2)
      .sort((a, b) => sevRank(b[1].w) - sevRank(a[1].w) || b[1].cri - a[1].cri || b[1].n - a[1].n);
    blocks.push(S(`<h3>${L2("worstUnits")}</h3>`));
    if (!worst.length) blocks.push(`<div class="muted">${L("noFindings")}</div>`);
    else {
      const head = `<tr><th style="width:14%">Unit / Ед.</th><th style="width:14%">${L2("sev")}</th>
        <th class="c" style="width:12%">${L2("findings")}</th><th class="c" style="width:12%">${L2("critical")}</th>
        <th style="width:14%">${B2("Last seen", "Последний осмотр")}</th><th>${L2("defect")}</th></tr>`;
      const rows = worst.map(([u, e], n) => {
        const top = all.filter(x => x._r.equip === u && x.defect).map(x => x.defect)[0] || "";
        return `<tr class="${n % 2 ? "alt" : ""}"><td><b>${esc(u)}</b></td><td>${pillS(e.w)}</td>
          <td class="c">${e.n}</td><td class="c">${e.cri || ""}</td><td class="n">${ddmmyyyy(e.last)}</td><td>${esc(top)}</td></tr>`;
      });
      for (let n = 0; n < rows.length; n += ROWS_PER_CHUNK)
        blocks.push(`<table><thead>${head}</thead><tbody>${rows.slice(n, n + ROWS_PER_CHUNK).join("")}</tbody></table>`);
    }

    // outstanding actions
    const acts = all.filter(x => x.action && x.action !== "MON").sort((a, b) => sevRank(b._sev) - sevRank(a._sev));
    blocks.push(S(`<h3>${L2("openActions")}</h3>`));
    if (!acts.length) blocks.push(`<div class="muted">${L("noFindings")}</div>`);
    else {
      const head = `<tr><th style="width:9%">${L2("sev")}</th><th style="width:9%">Unit / Ед.</th>
        <th style="width:18%">${L2("component")}</th><th>${L2("defect")}</th><th style="width:17%">${L2("action")}</th>
        <th style="width:9%">${L2("wo")}</th><th style="width:9%">${L2("date")}</th></tr>`;
      const rows = acts.map((x, n) => `<tr class="${n % 2 ? "alt" : ""}"><td>${pillS(x._sev)}</td>
        <td><b>${esc(x._r.equip)}</b></td><td><b>${esc(x.key)}</b><div class="code">${esc(cleanLabel(x))}</div></td>
        <td>${esc(x.defect || "")}</td><td>${esc(x.actionLabel || "")}</td>
        <td class="code">${esc(x.wo || "")}</td><td class="n">${ddmmyyyy(x._r.date)}</td></tr>`);
      for (let n = 0; n < rows.length; n += ROWS_PER_CHUNK)
        blocks.push(`<table><thead>${head}</thead><tbody>${rows.slice(n, n + ROWS_PER_CHUNK).join("")}</tbody></table>`);
    }
    blocks.push(`<div class="note">${L("disclaimer")}</div>`);
    return { blocks, recs };
  }

  /* ---------------- page flow ---------------- */
  function masthead(scopeLine, sub) {
    return `<div class="rpt-mast">
      <div><div class="ttl">${T.report[0]}<div class="ru">${T.report[1]}</div></div>
        <div class="scope">${scopeLine}</div></div>
      <div class="meta">${T.generated[0]} / ${T.generated[1]}<br><b>${new Date().toLocaleString()}</b>${sub ? `<br>${sub}` : ""}</div>
    </div>`;
  }

  /* The report is laid out inside its own iframe. That keeps the dashboard's
     stylesheet (and Chromium's modern color() computed values, which html2canvas
     cannot parse) completely out of the rasteriser. */
  function makeFrame() {
    const ifr = document.createElement("iframe");
    ifr.setAttribute("aria-hidden", "true");
    ifr.style.cssText = `position:fixed;left:-20000px;top:0;width:${PAGE_W}px;height:${PAGE_H}px;border:0;visibility:hidden;`;
    document.body.appendChild(ifr);
    const doc = ifr.contentDocument;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body class="rpt"></body></html>`);
    doc.close();
    return { ifr, doc };
  }

  async function flowPages(blocks, scopeLine, sub) {
    const { ifr, doc } = makeFrame();
    const host = doc.body;
    const pages = [];
    const newPage = (first) => {
      const pg = doc.createElement("div"); pg.className = "rpt-page";
      pg.innerHTML = `<div class="rpt-body">${first ? masthead(scopeLine, sub) : ""}</div>
        <div class="rpt-foot"><span>Condition Monitoring · ${esc(scopeLine)}</span><span class="c"></span><span class="r"></span></div>`;
      host.appendChild(pg); pages.push(pg); return pg.querySelector(".rpt-body");
    };
    let body = newPage(true);
    const limitFor = () => PAGE_H - MARGIN - FOOT_H - 10;

    // group each sticky block with what follows, then place groups atomically
    const groups = []; let gi = 0;
    while (gi < blocks.length) {
      const g = [norm(blocks[gi])];
      while (g[g.length - 1].sticky && gi + 1 < blocks.length) { gi++; g.push(norm(blocks[gi])); }
      groups.push(g); gi++;
    }
    const toEl = (html) => { const n = doc.createElement("div"); n.innerHTML = html;
      return n.childElementCount === 1 ? n.firstElementChild : n; };
    for (const g of groups) {
      const els = g.map(b => toEl(b.html));
      els.forEach(e => body.appendChild(e));
      if (MARGIN + body.scrollHeight > limitFor() && body.childElementCount > els.length) {
        els.forEach(e => body.removeChild(e));   // doesn't fit — move the whole group
        body = newPage(false);
        els.forEach(e => body.appendChild(e));
      }
    }
    // page numbers, now that the count is known
    pages.forEach((pg, n) => {
      pg.querySelector(".rpt-foot .r").textContent = `${T.page[0]} / ${T.page[1]} ${n + 1} / ${pages.length}`;
    });
    // make sure every photo is decoded before rasterising
    await Promise.all([...host.querySelectorAll("img")].map(img =>
      img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; })));
    return { ifr, pages };
  }

  /* ---------------- public entry point ---------------- */
  async function generate(scope, target, opts, onProgress) {
    if (!(window.jspdf && window.jspdf.jsPDF) || !window.html2canvas)
      throw new Error("PDF engine not loaded (jsPDF / html2canvas).");
    opts = opts || {};
    const build = scope === "unit" ? buildUnit : scope === "round" ? buildRound : buildMonth;
    const scopeName = scope === "unit" ? `${T.unit[0]} / ${T.unit[1]}` : scope === "round" ? `${T.round[0]} / ${T.round[1]}` : `${T.month[0]} / ${T.month[1]}`;
    const targetName = scope === "month" ? target : scope === "round" ? ddmmyyyy(target) : target;
    const scopeLine = `${scopeName} — ${targetName}`;
    const { blocks, recs } = build(target, opts);
    if (!recs.length) throw new Error("No inspections match that selection.");

    const sub = `${plural(recs.length, "inspection", "осм.")} · ${plural(new Set(recs.map(r => r.equip)).size, "unit", "ед.")}`;
    const { ifr, pages } = await flowPages(blocks, scopeLine, sub);
    try {
      const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4", compress: true });
      const PW = 595.28, PH = 841.89;
      for (let n = 0; n < pages.length; n++) {
        if (onProgress) onProgress(n + 1, pages.length);
        const canvas = await window.html2canvas(pages[n], { scale: opts.scale || 1.8, backgroundColor: "#ffffff", useCORS: true, logging: false });
        if (n) doc.addPage();
        doc.addImage(canvas.toDataURL("image/jpeg", 0.86), "JPEG", 0, 0, PW, PH, undefined, "FAST");
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const safe = String(targetName).replace(/[^\w.-]+/g, "_");
      doc.save(`CM_${scope}_${safe}_${stamp}.pdf`);
      return pages.length;
    } finally { ifr.remove(); }
  }

  window.CMReport = { generate, recsForScope };
})();
