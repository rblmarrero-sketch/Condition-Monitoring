/* RELIABILITY ON REPORTS: THE SITE'S OWN FIGURES, NOT A SECOND CALCULATION.

   Decided by the site on 2026-10-26 ("show the site figures"). Until then this
   file worked MTBF, MTTR and availability out for itself from 1C's corrective
   work orders (data/reliability.json): calendar hours, P1 + P2 work orders as
   failures. The reliability site computes the official figures from 1C's
   Asset State (ISO 14224: one continuous breakdown = one failure, counted
   where it started; standby is up time; MTBF = operating hours ÷ failures;
   MTTR = P1 + P2 hours ÷ failures), and the two disagreed — two numbers for
   one question, the defect this project keeps naming. The office now reads
   the site's.

   WHERE THE NUMBERS COME FROM. PECHANKA's build writes /site_kpi.json
   (SITE_KPI_V1, askpi-site kit site_kpi_kit) right after the homepage, from
   the same engine call that draws the homepage cards, and only when it equals
   them. The office dashboards are served by the same server
   (maintenance.vegadevelopment.com/cm/dashboard/), so the file is same-origin.
   Nothing is computed here: every figure is printed as the file states it,
   rounded the way the homepage rounds it ("shown").

   ON ANY OTHER HOST (Firebase, GitHub Pages) there is no /site_kpi.json, or
   the host answers with a page that is not it. Then the panel says, in one
   sentence, where the site figures are — and prints no numbers, because a
   number from somewhere else is exactly what this replaced.

   data/reliability.json is no longer read by any office page. The ingester
   still writes it (ingest/ingest_work_orders.py, tests/relingest.py). */
(function (root) {
  "use strict";
  const SITE = "https://maintenance.vegadevelopment.com";
  const URL_DEF = "/site_kpi.json";
  const WAIT_MS = 8000;
  const STALE_H = 26;            // the site builds every ~10 min; a day without a build is worth saying

  const L = {
    en: {
      title: "Reliability — MTBF, MTTR, availability",
      sub: "The reliability site's official figures, Primary fleet, ISO 14224 counting.",
      same: "Same figures as the reliability site homepage:",
      home: "reliability site", weekly: "Weekly report",
      away: "Site reliability figures are on maintenance.vegadevelopment.com",
      wk: "Week {n}", wk_s: "{a} – {b}",
      avail: "Availability", fails: "Failures", mtbf: "MTBF", mttr: "MTTR",
      avail_s: "plan {p}%", avail_np: "scheduled hours less P1–P4 downtime",
      fails_s: "{u} Primary units", mtbf_s: "operating hours ÷ failures", mttr_s: "P1 + P2 hours ÷ failures",
      none: "no failures this week", h: "{v} h",
      periods: "Week, month to date, year to date",
      fleets: "By fleet — week {n}", fleets_s: "The fleets of the site's Weekly report, Primary units.",
      c_per: "Period", c_fleet: "Fleet", c_units: "Units", c_av: "Availability", c_f: "Failures", c_mtbf: "MTBF h", c_mttr: "MTTR h",
      p_week: "Week {n}", p_mtd: "Month to date", p_ytd: "Year to date",
      s_primary: "Primary ({u} units)", s_all: "All equipment ({u} units)",
      basis: "Data as of {at} site · week {from} – {to} · ISO 14224: one continuous breakdown = one failure, counted in the period where it started; 0 failures = no MTBF or MTTR.",
      stale: "These figures are from {at} site — the site has not published newer ones for more than a day.",
      nofleet: "Fleet rows are not in today's file: {why}",
      csv: "Export CSV", loading: "Reading the reliability site's figures…",
    },
    ru: {
      title: "Надёжность — MTBF, MTTR, коэффициент готовности",
      sub: "Официальные показатели сайта надёжности, основной парк, учёт по ISO 14224.",
      same: "Те же показатели, что на главной странице сайта надёжности:",
      home: "сайт надёжности", weekly: "Недельный отчёт",
      away: "Показатели надёжности сайта — на maintenance.vegadevelopment.com",
      wk: "Неделя {n}", wk_s: "{a} – {b}",
      avail: "Готовность", fails: "Отказы", mtbf: "MTBF", mttr: "MTTR",
      avail_s: "план {p}%", avail_np: "плановые часы минус простои P1–P4",
      fails_s: "основных единиц: {u}", mtbf_s: "часы работы ÷ отказы", mttr_s: "часы P1 + P2 ÷ отказы",
      none: "отказов за неделю нет", h: "{v} ч",
      periods: "Неделя, с начала месяца, с начала года",
      fleets: "По паркам — неделя {n}", fleets_s: "Парки недельного отчёта сайта, основная техника.",
      c_per: "Период", c_fleet: "Парк", c_units: "Ед.", c_av: "Готовность", c_f: "Отказы", c_mtbf: "MTBF, ч", c_mttr: "MTTR, ч",
      p_week: "Неделя {n}", p_mtd: "С начала месяца", p_ytd: "С начала года",
      s_primary: "Основная ({u} ед.)", s_all: "Вся техника ({u} ед.)",
      basis: "Данные на {at} (время участка) · неделя {from} – {to} · ISO 14224: один непрерывный простой = один отказ, учитывается в периоде, где он начался; 0 отказов = MTBF и MTTR не рассчитываются.",
      stale: "Показатели от {at} (время участка) — сайт не публиковал новых больше суток.",
      nofleet: "Строк по паркам в сегодняшнем файле нет: {why}",
      csv: "Экспорт CSV", loading: "Читаем показатели сайта надёжности…",
    },
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function tr(lang, k, v) {
    let s = (L[lang] && L[lang][k]) || L.en[k] || k;
    Object.keys(v || {}).forEach(n => { s = s.split("{" + n + "}").join(String(v[n])); });
    return s;
  }
  /* "2026-10-19" -> "19.10.2026" (the site's own date style, DATE_DMY_V1) */
  const dmy = t => { const m = /^(\d{4})-(\d\d)-(\d\d)(.*)$/.exec(String(t || "")); return m ? m[3] + "." + m[2] + "." + m[1] + m[4] : String(t || "—"); };
  const dash = v => (v == null || v === "") ? "—" : String(v);
  const pctS = v => (v == null || v === "") ? "—" : (/%$/.test(String(v)) ? String(v) : v + "%");

  const COLG = '<colgroup><col style="width:28%"><col style="width:12%"><col style="width:15%">'
    + '<col style="width:15%"><col style="width:15%"><col style="width:15%"></colgroup>';
  const COLP = '<colgroup><col style="width:32%"><col style="width:17%"><col style="width:17%">'
    + '<col style="width:17%"><col style="width:17%"></colgroup>';
  function css() {
    if (typeof document === "undefined" || document.getElementById("relCss")) return;
    const st = document.createElement("style"); st.id = "relCss";
    st.textContent = "#relPanel table.reltbl{table-layout:fixed;width:100%;}"
      + "#relPanel table.reltbl th,#relPanel table.reltbl td{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;}"
      + "#relPanel table.reltbl .num{text-align:right;font-variant-numeric:tabular-nums;}"
      + "#relPanel table.reltbl th.num{text-align:right;}"
      + "#relPanel table.reltbl tr.relgrp td{font-weight:600;background:var(--surface-2,rgba(0,0,0,.03));}"
      + "#relPanel .relsrc a,#relPanel [data-rel=away] a{white-space:nowrap;display:inline-flex;align-items:center;min-height:32px;}";   // a pressable target, not a line of text (tests/phase6.cjs)
    document.head.appendChild(st);
  }

  /* A file is the site's only when it says so; a host that answers every
     address with its own page (a single-page fallback) is not the site. */
  function valid(j) {
    return !!(j && j.marker === "SITE_KPI_V1" && j.scopes && j.scopes.Primary && j.scopes.Primary.week && j.week);
  }

  let DATA = null, LOADING = null, WHY = "", TRIED = false;
  /* Read when the panel is first drawn and on every later draw (a timestamp,
     not the build tag, steps past the cache: the site rewrites the file on
     its own clock, ~every 10 minutes). */
  function load(url) {
    if (LOADING) return LOADING;
    const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), WAIT_MS) : null;
    LOADING = fetch((url || URL_DEF) + "?t=" + Date.now(), { cache: "no-store", signal: ac ? ac.signal : undefined })
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(j => { if (!valid(j)) throw new Error("not the site file"); DATA = j; WHY = ""; return j; })
      .catch(e => { WHY = String((e && e.message) || e); DATA = null; return null; })
      .finally(() => { TRIED = true; if (timer) clearTimeout(timer); setTimeout(() => { LOADING = null; }, 0); });
    return LOADING;
  }

  function siteLinks(T) {
    return `<a href="${SITE}/" target="_blank" rel="noopener">${esc(T("home"))} ↗</a> · `
      + `<a href="${SITE}/weekly_report.html" target="_blank" rel="noopener">${esc(T("weekly"))} ↗</a>`;
  }

  /* el: the container. opts: {lang}. Older callers also pass days / cls /
     classOf / onChange (the work-order panel's controls); they are ignored —
     the site's periods are its own. Returns the file, or null. */
  function render(el, opts) {
    opts = opts || {};
    css();
    const lang = opts.lang === "ru" ? "ru" : "en";
    const T = (k, v) => tr(lang, k, v);
    const head = `<div class="secthd"><h2>${esc(T("title"))}</h2></div>`;
    if (!DATA && !TRIED) {   // the first read has not answered yet: say so, never "away" for a moment on the site itself
      el.innerHTML = head + `<div class="hint" data-rel="loading">${esc(T("loading"))}</div>`;
      return null;
    }
    if (!DATA) {
      el.innerHTML = head + `<div class="hint" data-rel="away"${WHY ? ` data-why="${esc(WHY)}"` : ""}>`
        + `<a href="${SITE}/" target="_blank" rel="noopener">${esc(T("away"))} ↗</a></div>`;
      return null;
    }
    const d = DATA, P = d.scopes.Primary, A = d.scopes.All, W = P.week, wn = d.week.no;
    const sh = x => (x && x.shown) || {};
    const fail0 = !W.failures;
    const tile = (id, k, v, s, tone) => `<div class="kpi ${tone || ""}" id="${id}"><span class="k">${esc(k)}</span><span class="v">${v}</span><span class="s">${esc(s)}</span></div>`;
    const kp = `<div class="kpis" id="relKpis">${
      tile("relAvail", T("avail") + " · " + T("wk", { n: wn }), esc(pctS(sh(W).pa)), W.plan_pct != null ? T("avail_s", { p: W.plan_pct }) : T("avail_np"))
      + tile("relFails", T("fails") + " · " + T("wk", { n: wn }), esc(dash(W.failures)), T("fails_s", { u: P.units }), fail0 ? "good" : "")
      + tile("relMtbf", T("mtbf") + " · " + T("wk", { n: wn }), fail0 || sh(W).mtbf == null ? "—" : esc(T("h", { v: sh(W).mtbf })), fail0 ? T("none") : T("mtbf_s"), fail0 ? "good" : "")
      + tile("relMttr", T("mttr") + " · " + T("wk", { n: wn }), fail0 || sh(W).mttr == null ? "—" : esc(T("h", { v: sh(W).mttr })), fail0 ? T("none") : T("mttr_s"))}</div>`;
    const src = `<div class="hint relsrc" data-rel="site" style="margin:8px 0 0">${esc(T("same"))} ${siteLinks(T)}</div>`;
    const row = (lab, x) => `<tr><td>${esc(lab)}</td><td class="num">${esc(pctS(sh(x).pa))}</td><td class="num">${esc(dash(x.failures))}</td>`
      + `<td class="num">${esc(x.failures ? dash(sh(x).mtbf) : "—")}</td><td class="num">${esc(x.failures ? dash(sh(x).mttr) : "—")}</td></tr>`;
    const block = (S, lab) => S ? `<tr class="relgrp"><td colspan="5">${esc(lab)}</td></tr>`
      + row(T("p_week", { n: wn }), S.week) + row(T("p_mtd"), S.mtd) + row(T("p_ytd"), S.ytd) : "";
    const ptab = `<div class="secthd" style="margin-top:16px"><h3 style="margin:0">${esc(T("periods"))}</h3></div><div style="overflow-x:auto"><table class="grid reltbl" id="relPeriods">${COLP}<thead><tr>
      <th>${esc(T("c_per"))}</th><th class="num">${esc(T("c_av"))}</th><th class="num">${esc(T("c_f"))}</th><th class="num">${esc(T("c_mtbf"))}</th><th class="num">${esc(T("c_mttr"))}</th></tr></thead><tbody>${
      block(P, T("s_primary", { u: P.units })) + block(A, A ? T("s_all", { u: A.units }) : "")}</tbody></table></div>`;
    const fl = Array.isArray(d.fleets) ? d.fleets : [];
    const num = v => v == null ? "—" : String(v);
    const ftab = `<div class="secthd" style="margin-top:16px"><h3 style="margin:0">${esc(T("fleets", { n: wn }))}</h3></div>${fl.length
      ? `<div class="sub" style="margin:0 0 6px">${esc(T("fleets_s"))}</div><div style="overflow-x:auto"><table class="grid reltbl" id="relFleets">${COLG}<thead><tr>
      <th>${esc(T("c_fleet"))}</th><th class="num">${esc(T("c_units"))}</th><th class="num">${esc(T("c_av"))}</th><th class="num">${esc(T("c_f"))}</th><th class="num">${esc(T("c_mtbf"))}</th><th class="num">${esc(T("c_mttr"))}</th></tr></thead><tbody>${
      fl.map(f => `<tr data-fleet="${esc(f.k)}"><td>${esc(lang === "ru" ? (f.ru || f.en) : f.en)}</td><td class="num">${f.units}</td><td class="num">${esc(pctS(num(sh(f).pa)))}</td><td class="num">${f.failures}</td>`
        + `<td class="num">${f.failures ? num(sh(f).mtbf) : "—"}</td><td class="num">${f.failures ? num(sh(f).mttr) : "—"}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="hint" data-rel="nofleet">${esc(T("nofleet", { why: d.fleets_note || "—" }))}</div>`}`;
    const at = d.data_as_of_site || d.generated_site;
    const old = (() => { const t = Date.parse(String(at || "").replace(" ", "T") + ":00+12:00"); return isFinite(t) && Date.now() - t > STALE_H * 3600 * 1000; })();
    const basis = `<div class="hint" data-rel="basis" style="margin-top:10px">${esc(T("basis", { at: dmy(at), from: dmy(d.week.from), to: dmy(d.week.to) }))}${
      old ? `<br><span class="warn" data-rel="stale">${esc(T("stale", { at: dmy(at) }))}</span>` : ""}</div>`;
    const ctl = `<div class="row" style="justify-content:flex-end;margin:-4px 0 6px"><button class="btn" type="button" id="relCsv">${esc(T("csv"))}</button></div>`;
    el.innerHTML = head + `<div class="sub" style="margin:0 0 10px">${esc(T("sub"))} ${esc(T("wk_s", { a: dmy(d.week.from), b: dmy(d.week.to) }))}</div>`
      + ctl + kp + src + ptab + ftab + basis;
    el.querySelector("#relCsv").onclick = () => {
      const q = v => { const s = String(v == null ? "" : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const lines = [["scope", "period", "from", "to", "units", "availability_pct", "failures", "mtbf_h", "mttr_h"].join(",")];
      [["Primary", P], ["All", A]].forEach(([nm, S]) => S && ["week", "mtd", "ytd"].forEach(k => {
        const x = S[k], per = k === "week" ? d.week : d[k] || {};
        lines.push([nm, k, per.from, per.to, x.units, x.pa_pct, x.failures, x.mtbf_h, x.mttr_h].map(q).join(","));
      }));
      fl.forEach(f => lines.push(["fleet:" + f.en, "week", d.week.from, d.week.to, f.units, f.pa_pct, f.failures, f.mtbf_h, f.mttr_h].map(q).join(",")));
      lines.push(["source", q(d.source + ", data as of " + at + " site")].join(","));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
      a.download = "site_reliability_" + d.week.label + ".csv";
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    return d;
  }

  root.CMRel = { load, render, valid, SITE, URL: URL_DEF,
    _set(d) { DATA = valid(d) ? d : null; WHY = ""; TRIED = true; }, data() { return DATA; }, why() { return WHY; } };
})(typeof window !== "undefined" ? window : globalThis);
