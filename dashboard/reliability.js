/* MTBF, MTTR AND AVAILABILITY, FROM 1C's OWN WORK ORDERS.

   The audit of 2026-10-01: "Reports currently computes inspection compliance
   and programme coverage, not MTBF, MTTR, or availability." Nothing in this
   project had the data for them either — ingest/ingest_work_orders.py kept the
   planned services and the CM team's own defects and dropped every other row
   of WO.xlsx. It now also keeps the corrective work orders (`relEvents`), and
   this file is the ONE place the three numbers are worked out from them, loaded
   by both office pages so the two desks cannot compute them two ways.

   THE DEFINITIONS, stated once, and printed beside the numbers on screen:

     population   every machine 1C carries a work order for (`relUnits`), or
                  the class / unit chosen
     period       the last N days, ending at the time of the 1C pull
     time T       calendar hours: machines × days × 24. 1C's operating-hour
                  figure is a meter reading at registration, not a running
                  total, so it cannot be a denominator.
     failure      a corrective work order 1C marks P1 (breakdown) or counts
                  as a breakdown ("Count of break down from p1" > 0), starting
                  inside the period
     downtime D   per failure: 1C's "Down time by documents"; failing that
                  "Duration actual hours"; failing that the hours between the
                  actual start and end. A failure with none of the three is
                  COUNTED (it happened) and its downtime is UNKNOWN — said out
                  loud as a number, never silently read as zero.
     MTTR         D ÷ failures with a known downtime
     MTBF         (T − D) ÷ failures
     availability (T − D) ÷ T — breakdown downtime only (planned services
                  are not counted against it)

   A population with no failures has no MTBF — it is "no failures in N days",
   never a number. */
(function (root) {
  "use strict";
  const H = 3600 * 1000;

  // Hours between two ISO datetimes, or null.
  function spanH(a, b) {
    if (!a || !b) return null;
    const t0 = Date.parse(a), t1 = Date.parse(b);
    if (!isFinite(t0) || !isFinite(t1) || t1 < t0) return null;
    return (t1 - t0) / H;
  }

  function isFailure(e) {
    if (!e) return false;
    if ((e.bd || 0) > 0) return true;
    return /^\s*P1\b/i.test(String(e.priority || ""));
  }

  /* The downtime a failure cost, and where the figure came from. */
  function downtime(e) {
    if (e.downH != null && e.downH > 0) return { h: e.downH, from: "docs" };
    if (e.durH != null && e.durH > 0) return { h: e.durH, from: "duration" };
    const s = spanH(e.startDt || e.start, e.endDt || e.end);
    if (s != null && s > 0) return { h: s, from: "dates" };
    return { h: null, from: null };
  }

  /* data: window.CM_WO_DATA. opts: {days, cls, unit, classOf(unit)->cls}.
     Returns null when the pull carries no reliability data at all — the
     caller says so rather than printing zeros. */
  function compute(data, opts) {
    opts = opts || {};
    if (!data || !Array.isArray(data.relEvents) || !Array.isArray(data.relUnits)) return null;
    const days = Math.max(1, Number(opts.days) || 90);
    const end = Date.parse(data.generated) || Date.now();
    const start = end - days * 24 * H;
    const classOf = opts.classOf || (() => "");
    const want = u => (!opts.unit || u === opts.unit) && (opts.cls == null || classOf(u) === opts.cls);
    const units = data.relUnits.filter(want);
    const T = units.length * days * 24;
    const by = {};
    const out = { days, from: new Date(start).toISOString(), to: new Date(end).toISOString(),
      units: units.length, T, failures: 0, downH: 0, knownN: 0, unknownN: 0,
      fromDocs: 0, fromDuration: 0, fromDates: 0, mtbf: null, mttr: null, avail: null, rows: [] };
    const inUnits = new Set(units);
    data.relEvents.forEach(e => {
      if (!e || !inUnits.has(e.equip) || !isFailure(e)) return;
      const t = Date.parse(e.startDt || e.start);
      if (!isFinite(t) || t < start || t > end) return;
      out.failures++;
      const d = downtime(e);
      const r = by[e.equip] || (by[e.equip] = { unit: e.equip, cls: classOf(e.equip), failures: 0, downH: 0, unknownN: 0 });
      r.failures++;
      if (d.h == null) { out.unknownN++; r.unknownN++; return; }
      out.knownN++; out.downH += d.h; r.downH += d.h;
      if (d.from === "docs") out.fromDocs++; else if (d.from === "duration") out.fromDuration++; else out.fromDates++;
    });
    const D = Math.min(out.downH, T);
    if (T > 0) out.avail = (T - D) / T;
    if (out.failures > 0) out.mtbf = (T - D) / out.failures;
    if (out.knownN > 0) out.mttr = out.downH / out.knownN;
    const unitT = days * 24;
    out.rows = Object.values(by).map(r => Object.assign(r, {
      mtbf: (unitT - Math.min(r.downH, unitT)) / r.failures,
      mttr: (r.failures - r.unknownN) > 0 ? r.downH / (r.failures - r.unknownN) : null,
      avail: (unitT - Math.min(r.downH, unitT)) / unitT,
    })).sort((a, b) => b.downH - a.downH || b.failures - a.failures || (a.unit < b.unit ? -1 : 1));
    return out;
  }

  /* One row per class, the fleet first. */
  function byClass(data, opts) {
    opts = opts || {};
    if (!data || !Array.isArray(data.relUnits)) return null;
    const classOf = opts.classOf || (() => "");
    const classes = [...new Set(data.relUnits.map(u => classOf(u) || ""))].sort();
    return classes.map(c => Object.assign({ cls: c }, compute(data, Object.assign({}, opts, { cls: c, unit: "" }))));
  }

  /* ---- the panel -------------------------------------------------------
     Its own words, in both languages, so the two office pages cannot word
     the definitions two ways. */
  const L = {
    en: {
      title: "Reliability — MTBF, MTTR, availability",
      sub: "From 1C's corrective work orders. Calendar hours; failures are P1 breakdowns.",
      period: "Period", days: "{n} days", cls: "Class", all: "All classes",
      mtbf: "MTBF", mttr: "MTTR", avail: "Availability", fails: "Failures",
      mtbf_s: "hours between failures", mttr_s: "hours to repair", avail_s: "breakdown downtime only",
      fails_s: "{n} machines", none: "no failures in {n} days", h: "{v} h",
      basis: "{u} machines × {d} days × 24 h = {t} h. {f} failures, {dh} h downtime: {docs} from 1C's downtime, {dur} from the actual duration, {dates} from start–end dates.",
      unknown: "{n} failure(s) carry no downtime figure in 1C — counted as failures, left out of MTTR, and their downtime is not in availability.",
      nodata: "Reliability figures arrive with the hourly 1C pull (data/reliability.json). It has not been generated yet — the next pull after this change creates it.",
      loadfail: "data/reliability.json could not be read ({e}). Nothing below is a measurement.",
      stale: "From the 1C pull of {at}.",
      byclass: "By class", top: "Machines with the most breakdown downtime",
      c_cls: "Class", c_units: "Machines", c_unit: "Machine", c_f: "Failures", c_dh: "Downtime h",
      c_mtbf: "MTBF h", c_mttr: "MTTR h", c_av: "Availability",
      csv: "Export CSV", unclassed: "(no class)", nofail: "No breakdowns recorded in this period.",
    },
    ru: {
      title: "Надёжность — MTBF, MTTR, коэффициент готовности",
      sub: "По корректирующим заказ-нарядам 1С. Календарные часы; отказ — аварийный ремонт P1.",
      period: "Период", days: "{n} дн.", cls: "Класс", all: "Все классы",
      mtbf: "MTBF", mttr: "MTTR", avail: "Готовность", fails: "Отказы",
      mtbf_s: "часов между отказами", mttr_s: "часов на ремонт", avail_s: "только аварийные простои",
      fails_s: "машин: {n}", none: "нет отказов за {n} дн.", h: "{v} ч",
      basis: "{u} машин × {d} дн. × 24 ч = {t} ч. Отказов: {f}, простой {dh} ч: {docs} — по простою 1С, {dur} — по фактической длительности, {dates} — по датам начала и окончания.",
      unknown: "У {n} отказ(ов) в 1С нет данных о простое — они учтены как отказы, исключены из MTTR, а их простой не входит в готовность.",
      nodata: "Показатели надёжности приходят с ежечасной выгрузкой 1С (data/reliability.json). Файл ещё не сформирован — его создаст первая выгрузка после этого изменения.",
      loadfail: "Не удалось прочитать data/reliability.json ({e}). Ниже нет измерений.",
      stale: "По выгрузке 1С от {at}.",
      byclass: "По классам", top: "Машины с наибольшим аварийным простоем",
      c_cls: "Класс", c_units: "Машин", c_unit: "Машина", c_f: "Отказы", c_dh: "Простой, ч",
      c_mtbf: "MTBF, ч", c_mttr: "MTTR, ч", c_av: "Готовность",
      csv: "Экспорт CSV", unclassed: "(без класса)", nofail: "За период аварийных ремонтов не зарегистрировано.",
    },
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function tr(lang, k, v) {
    let s = (L[lang] && L[lang][k]) || L.en[k] || k;
    Object.keys(v || {}).forEach(n => { s = s.split("{" + n + "}").join(String(v[n])); });
    return s;
  }
  const n0 = x => (x == null || !isFinite(x)) ? "—" : Math.round(x).toLocaleString("en-US").replace(/,/g, "\u2009");
  const n1 = x => (x == null || !isFinite(x)) ? "—" : (Math.round(x * 10) / 10).toFixed(1);
  const pct = x => (x == null || !isFinite(x)) ? "—" : (Math.round(x * 1000) / 10).toFixed(1) + "%";

  let DATA = null, LOADING = null, LOAD_ERR = "";
  /* Fetched when the panel is first drawn, not at page load: nobody else on
     the page reads it, and it is the largest file in data/. A timestamp, not
     the build tag, steps past the cache, for the same reason woRefresh()
     does: the hourly job deliberately does not bump BUILD. */
  function load(url) {
    if (LOADING) return LOADING;
    LOADING = fetch((url || "../data/reliability.json") + "?t=" + Date.now(), { cache: "no-store" })
      .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(j => { DATA = j; LOAD_ERR = ""; return j; })
      .catch(e => { LOAD_ERR = String((e && e.message) || e); DATA = null; return null; })
      .finally(() => { setTimeout(() => { LOADING = null; }, 0); });
    return LOADING;
  }

  /* el: the container. opts: {lang, classOf, days, cls, onChange} */
  function render(el, opts) {
    opts = opts || {};
    const lang = opts.lang === "ru" ? "ru" : "en";
    const T = (k, v) => tr(lang, k, v);
    const days = [30, 90, 365].includes(Number(opts.days)) ? Number(opts.days) : 90;
    const cls = opts.cls == null ? null : String(opts.cls);
    const head = `<div class="secthd"><h2>${esc(T("title"))}</h2></div>
      <div class="sub" style="margin:0 0 10px">${esc(T("sub"))}</div>`;
    if (!DATA) {
      el.innerHTML = head + `<div class="hint" data-rel="nodata">${esc(LOAD_ERR ? T("loadfail", { e: LOAD_ERR }) : T("nodata"))}</div>`;
      return null;
    }
    const classOf = opts.classOf || (() => "");
    const r = compute(DATA, { days, cls, classOf });
    if (!r) { el.innerHTML = head + `<div class="hint" data-rel="nodata">${esc(T("nodata"))}</div>`; return null; }
    const classes = [...new Set(DATA.relUnits.map(u => classOf(u) || ""))].sort();
    const ctl = `<div class="row" style="gap:12px;flex-wrap:wrap;margin-bottom:10px">
      <div class="field"><label for="relDays">${esc(T("period"))}</label><select id="relDays">${
        [30, 90, 365].map(d => `<option value="${d}"${d === days ? " selected" : ""}>${esc(T("days", { n: d }))}</option>`).join("")}</select></div>
      <div class="field"><label for="relCls">${esc(T("cls"))}</label><select id="relCls"><option value="__all"${cls == null ? " selected" : ""}>${esc(T("all"))}</option>${
        classes.map(c => `<option value="${esc(c)}"${c === cls ? " selected" : ""}>${esc(c || T("unclassed"))}</option>`).join("")}</select></div>
      <div class="field" style="align-self:flex-end"><button class="btn" type="button" id="relCsv">${esc(T("csv"))}</button></div>
    </div>`;
    const tile = (id, k, v, s, tone) => `<div class="kpi ${tone || ""}" id="${id}"><span class="k">${esc(k)}</span><span class="v">${v}</span><span class="s">${esc(s)}</span></div>`;
    const kp = `<div class="kpis" id="relKpis">${
      tile("relMtbf", T("mtbf"), r.failures ? esc(T("h", { v: n0(r.mtbf) })) : "—", r.failures ? T("mtbf_s") : T("none", { n: days }), r.failures ? "" : "good")
      + tile("relMttr", T("mttr"), r.mttr != null ? esc(T("h", { v: n1(r.mttr) })) : "—", T("mttr_s"))
      + tile("relAvail", T("avail"), esc(pct(r.avail)), T("avail_s"), r.avail != null && r.avail < 0.85 ? "warn" : "good")
      + tile("relFails", T("fails"), String(r.failures), T("fails_s", { n: r.units }), r.failures ? "warn" : "good")}</div>`;
    const basis = `<div class="hint" data-rel="basis" style="margin-top:8px">${esc(T("basis", { u: r.units, d: days, t: n0(r.T),
      f: r.failures, dh: n1(r.downH), docs: r.fromDocs, dur: r.fromDuration, dates: r.fromDates }))}${
      r.unknownN ? `<br><span class="warn" data-rel="unknown">${esc(T("unknown", { n: r.unknownN }))}</span>` : ""}${
      DATA.generated ? `<br>${esc(T("stale", { at: String(DATA.generated).replace("T", " ").slice(0, 16) + " UTC" }))}` : ""}</div>`;
    const cl = byClass(DATA, { days, classOf }) || [];
    const ctab = `<div class="secthd" style="margin-top:16px"><h3 style="margin:0">${esc(T("byclass"))}</h3></div><div style="overflow-x:auto"><table class="grid" id="relByClass"><thead><tr>
      <th>${esc(T("c_cls"))}</th><th>${esc(T("c_units"))}</th><th>${esc(T("c_f"))}</th><th>${esc(T("c_dh"))}</th><th>${esc(T("c_mtbf"))}</th><th>${esc(T("c_mttr"))}</th><th>${esc(T("c_av"))}</th></tr></thead><tbody>${
      cl.map(c => `<tr data-cls="${esc(c.cls)}"><td>${esc(c.cls || T("unclassed"))}</td><td>${c.units}</td><td>${c.failures}</td><td>${n1(c.downH)}</td><td>${c.failures ? n0(c.mtbf) : "—"}</td><td>${n1(c.mttr)}</td><td>${pct(c.avail)}</td></tr>`).join("")}</tbody></table></div>`;
    const top = r.rows.slice(0, 15);
    const utab = `<div class="secthd" style="margin-top:16px"><h3 style="margin:0">${esc(T("top"))}</h3></div>${top.length ? `<div style="overflow-x:auto"><table class="grid" id="relTop"><thead><tr>
      <th>${esc(T("c_unit"))}</th><th>${esc(T("c_cls"))}</th><th>${esc(T("c_f"))}</th><th>${esc(T("c_dh"))}</th><th>${esc(T("c_mtbf"))}</th><th>${esc(T("c_mttr"))}</th><th>${esc(T("c_av"))}</th></tr></thead><tbody>${
      top.map(u => `<tr data-unit="${esc(u.unit)}"><td><b>${esc(u.unit)}</b></td><td>${esc(u.cls || "")}</td><td>${u.failures}</td><td>${n1(u.downH)}${u.unknownN ? " +?" : ""}</td><td>${n0(u.mtbf)}</td><td>${n1(u.mttr)}</td><td>${pct(u.avail)}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="hint">${esc(T("nofail"))}</div>`}`;
    el.innerHTML = head + ctl + kp + basis + ctab + utab;
    const fire = o => { if (opts.onChange) opts.onChange(Object.assign({ days, cls }, o)); };
    el.querySelector("#relDays").onchange = e => fire({ days: Number(e.target.value) });
    el.querySelector("#relCls").onchange = e => fire({ cls: e.target.value === "__all" ? null : e.target.value });
    el.querySelector("#relCsv").onclick = () => {
      const q = v => { const s = String(v == null ? "" : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const lines = [["scope", "class", "unit", "machines", "days", "failures", "downtime_h", "unknown_downtime", "mtbf_h", "mttr_h", "availability"].join(",")];
      cl.forEach(c => lines.push(["class", c.cls, "", c.units, days, c.failures, n1(c.downH), c.unknownN, c.failures ? Math.round(c.mtbf) : "", c.mttr != null ? n1(c.mttr) : "", c.avail != null ? (c.avail * 100).toFixed(1) : ""].map(q).join(",")));
      r.rows.forEach(u => lines.push(["unit", u.cls, u.unit, 1, days, u.failures, n1(u.downH), u.unknownN, Math.round(u.mtbf), u.mttr != null ? n1(u.mttr) : "", (u.avail * 100).toFixed(1)].map(q).join(",")));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
      a.download = "reliability_" + days + "d_" + String(DATA.generated || "").slice(0, 10) + ".csv";
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    return r;
  }

  root.CMRel = { compute, byClass, isFailure, downtime, spanH, load, render,
    _set(d) { DATA = d; LOAD_ERR = ""; }, data() { return DATA; } };
})(typeof window !== "undefined" ? window : globalThis);
