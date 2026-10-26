/* MEASUREMENT LIMITS, SET IN THE OFFICE (both office pages load this file).

   The undercarriage figures — "new" and the wear limit for each model and
   point — came only from docs/wear-limits.json, so every correction (a wrong
   ZX 1200 link height, the site's own sheet) waited on a code change and a
   build. This panel lets the office set them.

   ONE DOCUMENT: _meta/wear/limits.json, written through CMDrive.putDoc and read
   back through CMDrive.getDoc, the way the lube master was. Each change is kept
   in it for good — model, point, new, limit, the date it applies FROM, who, why
   — and a change taken back is voided, not deleted, so the history stays
   readable. WEAR.setLimits (mobile/wear.js) applies the document on all three
   surfaces; the phone pulls it with the folder (wearLimitsPull).

   "From a date" or "re-grade all history" is the change's own date: today
   leaves every earlier reading scored against the limit it was taken against;
   re-grade is the date 0000-01-01, so every reading takes the new limit. The
   panel says how many readings each choice changes before anything is saved.

   Two desks, one document, no compare-and-swap: a save re-reads, adds its
   change, writes, reads back, and writes again if another desk's save replaced
   it (the lube master's rule). Every change also writes a detail record under
   _meta/wear/log/. */
(function (root) {
  "use strict";
  const DOC = "_meta/wear/limits.json";
  const LOGDIR = "_meta/wear/log/";
  const WHO = "cm_dash_who";
  const REGRADE = "0000-01-01";

  const WORDS = {
    en: {
      title: "Measurement limits — undercarriage",
      sub: "New and wear limit for each model and point. A limit set here replaces the reference figure on the phone, on both dashboards and in every report.",
      st_off: "No folder attached — limits can be read and set once a backend is attached.",
      st_load: "Reading the office's limits…",
      st_none: "No office limits set yet. The reference figures are in force.",
      st_ready: "Revision {rev} · {by} · {at}",
      st_err: "The office's limits could not be read ({e}). Nothing can be saved until they can.",
      model: "Model", units: "Machines", pick: "Choose a model",
      th_point: "Point", th_ref: "Reference (new → limit)", th_now: "In force today (new → warning → critical)", th_act: "",
      none: "—", borrowed: "borrowed", rival: "two figures", office: "office",
      from: "from {d}", all_hist: "all history", edit: "Set limit",
      f_title: "{pt} — {model}", f_new: "New, mm", f_warn: "Warning, mm", f_lim: "Critical (wear limit), mm",
      f_warn_hint: "Optional. Past the warning a reading is Severe; past the wear limit it is Critical. Left empty, the fixed percentage scale grades it.",
      e_warn: "The warning must lie between new and the wear limit.",
      f_apply: "Applies", f_from: "From", f_all: "Re-grade all history",
      f_why: "Source / reason", f_why_ph: "e.g. site sheet 26.10.2026, Hitachi manual p. W155-03-07-001",
      f_who: "Your name", f_save: "Save limit", f_cancel: "Cancel",
      e_num: "New and the wear limit must both be numbers above zero.",
      e_same: "New and the wear limit cannot be the same figure.",
      e_dir: "This point wears {dir}: the limit must be {rel} than new.",
      e_why: "Say where the figures come from.",
      e_who: "Type your name — every change is signed.",
      e_date: "Choose the date the limit applies from.",
      down: "down", up: "up", smaller: "smaller", larger: "larger",
      pv_none: "No readings on record for this point on this model yet.",
      pv: "{n} reading(s) on {m} machine(s) for this point. With this choice: {chg} change grade ({worse} worse, {better} better), {odd} outside the new limits.",
      pv_keep: "{k} earlier reading(s) keep the limit they were scored against.",
      saved: "Saved — revision {rev}.", saved_merged: "Saved on top of another desk's change — revision {rev}.",
      log_fail: " The detail record could not be written; the change itself is saved.",
      hist: "Changes for this model", h_void: "Take back", h_voided: "taken back {at} by {by}",
      void_ask: "Take this change back? Readings return to the limit in force before it.",
      void_who: "Type your name in the form first — taking a change back is signed too.",
      none_hist: "No changes for this model."
    },
    ru: {
      title: "Пределы замеров — ходовая часть",
      sub: "Новый размер и предел износа для каждой модели и точки. Предел, заданный здесь, заменяет эталонное значение в телефоне, на обеих панелях и во всех отчётах.",
      st_off: "Папка не подключена — пределы можно читать и задавать после подключения.",
      st_load: "Чтение пределов офиса…",
      st_none: "Офис пока не задал пределов. Действуют эталонные значения.",
      st_ready: "Версия {rev} · {by} · {at}",
      st_err: "Пределы офиса не удалось прочитать ({e}). Сохранение невозможно, пока они не прочитаны.",
      model: "Модель", units: "Машин", pick: "Выберите модель",
      th_point: "Точка", th_ref: "Эталон (новый → предел)", th_now: "Действует сегодня (новый → предупр. → критич.)", th_act: "",
      none: "—", borrowed: "заимствовано", rival: "два значения", office: "офис",
      from: "с {d}", all_hist: "вся история", edit: "Задать предел",
      f_title: "{pt} — {model}", f_new: "Новый, мм", f_warn: "Предупреждение, мм", f_lim: "Критический (предел износа), мм",
      f_warn_hint: "Необязательно. После предупреждения замер — «Серьёзное», после предела износа — «Критическое». Без него оценка идёт по фиксированной шкале процентов.",
      e_warn: "Предупреждение должно быть между новым размером и пределом износа.",
      f_apply: "Применяется", f_from: "С даты", f_all: "Пересчитать всю историю",
      f_why: "Источник / причина", f_why_ph: "напр. лист участка 26.10.2026, руководство Hitachi стр. W155-03-07-001",
      f_who: "Ваше имя", f_save: "Сохранить предел", f_cancel: "Отмена",
      e_num: "Новый размер и предел износа должны быть числами больше нуля.",
      e_same: "Новый размер и предел износа не могут совпадать.",
      e_dir: "Эта точка изнашивается {dir}: предел должен быть {rel} нового.",
      e_why: "Укажите, откуда взяты значения.",
      e_who: "Введите своё имя — каждое изменение подписывается.",
      e_date: "Выберите дату, с которой действует предел.",
      down: "вниз", up: "вверх", smaller: "меньше", larger: "больше",
      pv_none: "Замеров этой точки на этой модели пока нет.",
      pv: "{n} замер(ов) на {m} машин(ах) по этой точке. При этом выборе: {chg} меняют оценку ({worse} хуже, {better} лучше), {odd} вне новых пределов.",
      pv_keep: "{k} более ранних замер(ов) сохраняют предел, по которому они оценены.",
      saved: "Сохранено — версия {rev}.", saved_merged: "Сохранено поверх изменения с другого рабочего места — версия {rev}.",
      log_fail: " Подробную запись сохранить не удалось; само изменение сохранено.",
      hist: "Изменения по этой модели", h_void: "Отменить", h_voided: "отменено {at}, {by}",
      void_ask: "Отменить это изменение? Замеры вернутся к пределу, действовавшему до него.",
      void_who: "Сначала введите имя в форме — отмена тоже подписывается.",
      none_hist: "Изменений по этой модели нет."
    }
  };
  let HOST = { lang: () => "en", recs: () => [], onApplied: () => {} };
  const S = { state: "idle", doc: null, err: "", model: "", edit: "", msg: "", msgBad: false, el: null };

  const W = () => root.WEAR;
  const lang = () => (HOST.lang && HOST.lang() === "ru") ? "ru" : "en";
  const tr = (k, v) => {
    let s = (WORDS[lang()] && WORDS[lang()][k]) || WORDS.en[k] || k;
    if (v) Object.keys(v).forEach(x => { s = s.split("{" + x + "}").join(v[x]); });
    return s;
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const who = () => { try { return (localStorage.getItem(WHO) || "").trim(); } catch (e) { return ""; } };
  const setWho = v => { try { localStorage.setItem(WHO, v); } catch (e) {} };
  const configured = () => !!(root.CMDrive && root.CMDrive.configured && root.CMDrive.configured());
  const today = () => (root.DUE && root.DUE.today) ? root.DUE.today() : new Date().toISOString().slice(0, 10);
  const fmt = n => (n == null || n === "") ? "—" : String(n);

  function empty() { return { type: "cm-wear-limits", version: 1, rev: 0, at: "", by: "", changes: [] }; }
  function apply(doc) {
    if (W() && W().setLimits) W().setLimits(doc || null);
    try { HOST.onApplied(); } catch (e) { if (root.bad) root.bad("wear-limits-apply", e); }
  }

  /* ── which machines a model covers, and their readings ─────────────── */
  function modelOfUnit(a) { const m = a && a.m && W() && W().map[a.m]; return (m && m.m) || ""; }
  function unitsOf(model) {
    return (root.ASSETS || []).filter(a => modelOfUnit(a) === model);
  }
  function readings(model, point) {
    const units = {}; unitsOf(model).forEach(a => { units[a.n] = a; });
    const out = [];
    (HOST.recs() || []).forEach(r => {
      if (!r || r.type !== "UC" || !units[r.equip]) return;
      (r.items || []).forEach(it => {
        const k = String(it.key || ""), i = k.indexOf(".");
        if ((i < 0 ? k : k.slice(0, i)) !== point) return;
        const mm = (it.mm === "" || it.mm == null) ? null : Number(it.mm);
        if (mm == null || !isFinite(mm)) return;
        out.push({ unit: r.equip, m: units[r.equip].m, pos: i < 0 ? "" : k.slice(i + 1), date: r.date || "", mm });
      });
    });
    return out;
  }
  /* What a change would do: the grade of every reading of this point on this
     model, scored now and scored with the change added, by the engine itself. */
  function preview(model, point, n, c, from, w) {
    const rs = readings(model, point);
    if (!rs.length || !W()) return { n: 0 };
    const grade = (r) => {
      const ref = W().refFor(r.unit, r.m, point, r.pos, r.date);
      if (!ref || ref.x) return { g: null, odd: false };
      if (W().outOfRange(ref, r.mm)) return { g: null, odd: true };
      const p = W().wear(ref, r.mm);
      return { g: p == null ? null : (root.GRADE ? root.GRADE.fromWorn(p, W().warnPct ? W().warnPct(ref) : null) : null), odd: false };
    };
    const base = S.doc || empty();
    const before = rs.map(grade);
    const trial = JSON.parse(JSON.stringify(base));
    trial.changes.push({ id: "preview", model, point, n, c, w: (w == null ? null : w), from, at: "9999", by: "" });
    W().setLimits(trial);
    let after;
    try { after = rs.map(grade); } finally { W().setLimits(S.doc || null); }
    let chg = 0, worse = 0, better = 0, odd = 0, keep = 0;
    const units = {};
    rs.forEach((r, i) => {
      units[r.unit] = 1;
      if (from > r.date) keep++;
      if (after[i].odd) odd++;
      const a = before[i].g || 0, b = after[i].g || 0;
      if (a !== b) { chg++; if (b > a) worse++; else better++; }
    });
    return { n: rs.length, m: Object.keys(units).length, chg, worse, better, odd, keep };
  }

  /* ── the store ──────────────────────────────────────────────────────── */
  async function load() {
    if (!configured() || !root.CMDrive.getDoc) { S.state = "off"; S.doc = null; apply(null); redraw(); return null; }
    if (S.state !== "ready" && S.state !== "none") S.state = "loading";
    try {
      const d0 = await root.CMDrive.getDoc(DOC);
      const d = (d0 && d0.type === "cm-wear-limits") ? d0 : null;
      /* The folder is re-read every few minutes; the page is only re-scored
         when the document actually moved. */
      const moved = !!S.doc !== !!d || (S.doc && d && (S.doc.rev !== d.rev || S.doc.at !== d.at));
      S.doc = d; S.state = d ? "ready" : "none"; S.err = "";
      if (moved) apply(S.doc); else if (W() && W().setLimits) W().setLimits(S.doc);
    } catch (e) {
      S.state = "error"; S.err = String((e && e.message) || e);
      if (root.bad) root.bad("wear-limits-load", e);
    }
    redraw();
    return S.doc;
  }
  /* add(doc) edits the document and returns true when it changed something;
     it is applied to the server's CURRENT copy, and again after the write if
     another desk replaced it in between. */
  async function save(add, summary) {
    if (!who()) throw new Error(tr("e_who"));
    if (!configured()) throw new Error(tr("st_off"));
    if (S.state === "error") throw new Error(tr("st_err", { e: S.err }));
    const fresh = async () => {
      const d = await root.CMDrive.getDoc(DOC);
      const x = (d && d.type === "cm-wear-limits") ? JSON.parse(JSON.stringify(d)) : empty();
      if (!Array.isArray(x.changes)) x.changes = [];
      return x;
    };
    let cur = await fresh(), merged = false;
    if (!add(cur)) return { none: true };
    for (let round = 0; round < 6; round++) {
      cur.type = "cm-wear-limits"; cur.version = 1;
      cur.rev = (cur.rev || 0) + 1; cur.at = new Date().toISOString(); cur.by = who();
      await root.CMDrive.putDoc(DOC, cur);
      await new Promise(r => setTimeout(r, 120 + Math.floor(Math.random() * 240)));
      const back = await fresh();
      if (!add(back)) { cur = back; break; }
      cur = back; merged = true;
    }
    let logged = true;
    try {
      await root.CMDrive.putDoc(LOGDIR + cur.at.replace(/[:.]/g, "-") + "_r" + cur.rev + ".json",
        { type: "cm-wear-change", rev: cur.rev, at: cur.at, by: cur.by, summary });
    } catch (e) { logged = false; if (root.bad) root.bad("wear-limits-log", e); }
    S.doc = cur; S.state = "ready"; apply(cur);
    return { rev: cur.rev, merged, logged };
  }
  function check(point, n, c, from, why, w) {
    if (!(isFinite(n) && isFinite(c) && n > 0 && c > 0)) return tr("e_num");
    if (n === c) return tr("e_same");
    if (w != null && !(isFinite(w) && ((c < n && w < n && w > c) || (c > n && w > n && w < c)))) return tr("e_warn");
    const m = W() && W().models[S.model], ref = m && m.pts[point];
    if (ref && ref.d) {
      if (ref.d === "shrink" && !(c < n)) return tr("e_dir", { dir: tr("down"), rel: tr("smaller") });
      if (ref.d === "grow" && !(c > n)) return tr("e_dir", { dir: tr("up"), rel: tr("larger") });
    }
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return tr("e_date");
    if (!why) return tr("e_why");
    if (!who()) return tr("e_who");
    return "";
  }
  async function setLimit(point, n, c, from, why, w) {
    if (w === "" || (typeof w === "number" && !isFinite(w))) w = null;
    const err = check(point, n, c, from, why, w);
    if (err) throw new Error(err);
    const id = "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ch = { id, model: S.model, point, n, w: (w == null ? null : w), c, from, at: new Date().toISOString(), by: who(), why };
    return save(d => {
      if (d.changes.some(x => x.id === id)) return false;
      d.changes.push(ch); return true;
    }, S.model + " " + point + " " + n + (w != null ? "/" + w : "") + "/" + c + " from " + from);
  }
  async function voidChange(id) {
    if (!who()) throw new Error(tr("void_who"));
    const stamp = { at: new Date().toISOString(), by: who() };
    return save(d => {
      const x = d.changes.find(y => y.id === id);
      if (!x || x.void) return false;
      x.void = stamp; return true;
    }, "void " + id);
  }

  /* ── drawing ────────────────────────────────────────────────────────── */
  const CSS = `
  .wl-panel{margin-top:var(--s4,24px)}
  .wl-panel .wl-top{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:end;margin:8px 0}
  .wl-panel label.wl-f{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--ink-2,#3d474f)}
  .wl-panel select,.wl-panel input[type=number],.wl-panel input[type=text],.wl-panel input[type=date]{
    font:inherit;font-size:13px;padding:5px 8px;border:1px solid var(--line,#ccd3d9);border-radius:6px;
    background:var(--surface,#fff);color:var(--ink,#12161a);min-width:0;min-height:32px;box-sizing:border-box}
  .wl-panel input[type=number]{width:96px}
  .wl-panel .wl-st{font-size:12px;color:var(--ink-2,#3d474f)}
  .wl-panel .wl-st.bad{color:var(--crit-ink,#a1271b)}
  .wl-panel table.wltbl{table-layout:fixed;width:100%}
  .wl-panel table.wltbl td,.wl-panel table.wltbl th{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .wl-panel td.num{font-variant-numeric:tabular-nums;text-align:right}
  .wl-panel .wl-tag{font-size:11px;color:var(--ink-2,#3d474f);margin-left:6px}
  .wl-panel .wl-tag.off{color:var(--accent,#1f5fa8);font-weight:600}
  .wl-panel .wl-tag.warn{color:var(--warn-ink,#8a4b00)}
  .wl-panel .wl-form{border:1px solid var(--line,#ccd3d9);border-radius:8px;padding:12px;margin:10px 0;
    display:flex;flex-direction:column;gap:10px;background:var(--surface-2,#f5f7f9)}
  .wl-panel .wl-row{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:end}
  .wl-panel .wl-radio{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:13px}
  .wl-panel .wl-pv{font-size:12.5px;color:var(--ink,#12161a)}
  .wl-panel .wl-msg{font-size:12.5px}
  .wl-panel .wl-msg.bad{color:var(--crit-ink,#a1271b)}
  .wl-panel .wl-msg.ok{color:var(--good,#2c7a3f)}
  .wl-panel ul.wl-hist{list-style:none;margin:6px 0 0;padding:0;font-size:12.5px}
  .wl-panel ul.wl-hist li{display:flex;gap:10px;align-items:center;padding:4px 0;border-bottom:1px solid var(--line,#e3e7eb)}
  .wl-panel ul.wl-hist li.void{color:var(--muted,#5b6670);text-decoration:line-through}
  .wl-panel ul.wl-hist li .sp{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  `;
  function css() {
    if (document.getElementById("wlCss")) return;
    const s = document.createElement("style"); s.id = "wlCss"; s.textContent = CSS;
    document.head.appendChild(s);
  }
  function ptName(code) {
    const p = W() && (W().points || []).find(x => x.code === code);
    return p ? (lang() === "ru" ? p.ru : p.en) : code;
  }
  function statusLine() {
    if (S.state === "off") return [tr("st_off"), false];
    if (S.state === "loading" || S.state === "idle") return [tr("st_load"), false];
    if (S.state === "error") return [tr("st_err", { e: S.err }), true];
    if (S.state === "none") return [tr("st_none"), false];
    const d = S.doc || {};
    return [tr("st_ready", { rev: d.rev || 0, by: d.by || "—", at: String(d.at || "").slice(0, 16).replace("T", " ") }), false];
  }
  function nowCell(model, code) {
    const lim = W().limitFor(model, code, today());
    const m = W().models[model], cat = m && m.pts[code];
    if (lim) return `<td class="num">${esc(fmt(lim.n))} → ${lim.w != null ? esc(fmt(lim.w)) + " → " : ""}${esc(fmt(lim.c))}<span class="wl-tag off">${esc(tr("office"))} · ${
      esc(lim.from && lim.from > "0001" ? tr("from", { d: lim.from }) : tr("all_hist"))}</span></td>`;
    if (!cat) return `<td class="num">${tr("none")}</td>`;
    const tag = cat.x === "borrowed" ? tr("borrowed") : cat.x === "rival" ? tr("rival") : "";
    return `<td class="num">${esc(fmt(cat.n))} → ${esc(fmt(cat.c))}${tag ? `<span class="wl-tag warn">${esc(tag)}</span>` : ""}</td>`;
  }
  function draw() {
    const el = S.el; if (!el || !W()) return;
    css();
    const [st, bad] = statusLine();
    const models = Object.keys(W().models || {}).sort();
    if (!S.model || !W().models[S.model]) S.model = "";
    const opts = `<option value="">${esc(tr("pick"))}</option>` + models.map(k =>
      `<option value="${esc(k)}"${k === S.model ? " selected" : ""}>${esc(k)} (${unitsOf(k).length})</option>`).join("");
    let body = "";
    if (S.model) {
      const m = W().models[S.model];
      const codes = (W().points || []).map(p => p.code);
      body += `<div class="tblwrap"><table class="grid wltbl"><colgroup><col style="width:28%"><col style="width:24%"><col><col style="width:120px"></colgroup>
        <thead><tr><th>${esc(tr("th_point"))}</th><th class="r">${esc(tr("th_ref"))}</th><th class="r">${esc(tr("th_now"))}</th><th></th></tr></thead><tbody>` +
        codes.map(code => {
          const cat = m.pts[code];
          return `<tr data-wlpt="${esc(code)}"><td title="${esc(code)}">${esc(ptName(code))}</td>
            <td class="num">${cat ? esc(fmt(cat.n)) + " → " + esc(fmt(cat.c)) : tr("none")}</td>
            ${nowCell(S.model, code)}
            <td><button class="btn ghost sm" type="button" data-wledit="${esc(code)}"${S.state === "error" || S.state === "off" ? " disabled" : ""}>${esc(tr("edit"))}</button></td></tr>`;
        }).join("") + `</tbody></table></div>`;
      if (S.edit) body += formHtml();
      const hist = ((S.doc && S.doc.changes) || []).filter(x => x.model === S.model).slice().reverse();
      body += `<div class="secthd" style="margin-top:12px"><h3 style="font-size:14px;margin:0">${esc(tr("hist"))}</h3></div>`;
      body += hist.length ? `<ul class="wl-hist">` + hist.map(x => `<li class="${x.void ? "void" : ""}" data-wlid="${esc(x.id)}">
          <span class="sp" title="${esc(x.why || "")}">${esc(ptName(x.point))}: ${esc(fmt(x.n))} → ${x.w != null ? esc(fmt(x.w)) + " → " : ""}${esc(fmt(x.c))} · ${
            esc(x.from && x.from > "0001" ? tr("from", { d: x.from }) : tr("all_hist"))} · ${esc(x.by || "")} · ${esc(String(x.at || "").slice(0, 10))} · ${esc(x.why || "")}${
            x.void ? " · " + esc(tr("h_voided", { at: String(x.void.at || "").slice(0, 10), by: x.void.by || "" })) : ""}</span>
          ${x.void ? "" : `<button class="btn ghost sm" type="button" data-wlvoid="${esc(x.id)}">${esc(tr("h_void"))}</button>`}</li>`).join("") + `</ul>`
        : `<div class="sub">${esc(tr("none_hist"))}</div>`;
    }
    el.innerHTML = `<div class="secthd"><h2>${esc(tr("title"))}</h2></div>
      <div class="sub">${esc(tr("sub"))}</div>
      <div class="wl-top"><label class="wl-f">${esc(tr("model"))}<select id="wlModel">${opts}</select></label>
        <span class="wl-st${bad ? " bad" : ""}" id="wlStatus">${esc(st)}</span></div>
      ${S.msg && !S.edit ? `<div class="wl-msg ${S.msgBad ? "bad" : "ok"}" id="wlMsg">${esc(S.msg)}</div>` : ""}
      ${body}`;
    wire();
  }
  function formHtml() {
    const code = S.edit, m = W().models[S.model], cat = m && m.pts[code];
    const lim = W().limitFor(S.model, code, today());
    const n0 = lim ? lim.n : (cat ? cat.n : ""), c0 = lim ? lim.c : (cat ? cat.c : ""), w0 = lim && lim.w != null ? lim.w : "";
    return `<div class="wl-form" id="wlForm">
      <b>${esc(tr("f_title", { pt: ptName(code), model: S.model }))}</b>
      <div class="wl-row">
        <label class="wl-f">${esc(tr("f_new"))}<input type="number" step="any" id="wlN" value="${esc(n0)}"></label>
        <label class="wl-f">${esc(tr("f_warn"))}<input type="number" step="any" id="wlW" value="${esc(w0)}"></label>
        <label class="wl-f">${esc(tr("f_lim"))}<input type="number" step="any" id="wlC" value="${esc(c0)}"></label>
      </div>
      <div class="sub" style="margin:0">${esc(tr("f_warn_hint"))}</div>
      <div class="wl-radio" role="radiogroup" aria-label="${esc(tr("f_apply"))}"><span>${esc(tr("f_apply"))}:</span>
        <label><input type="radio" name="wlApply" id="wlFromOn" value="from" checked> ${esc(tr("f_from"))}</label>
        <input type="date" id="wlFrom" value="${esc(today())}" aria-label="${esc(tr("f_from"))}">
        <label><input type="radio" name="wlApply" id="wlAllOn" value="all"> ${esc(tr("f_all"))}</label></div>
      <div class="wl-row">
        <label class="wl-f" style="flex:1;min-width:260px">${esc(tr("f_why"))}<input type="text" id="wlWhy" placeholder="${esc(tr("f_why_ph"))}"></label>
        <label class="wl-f">${esc(tr("f_who"))}<input type="text" id="wlWho" value="${esc(who())}"></label>
      </div>
      <div class="wl-pv" id="wlPv" aria-live="polite"></div>
      <div class="wl-msg${S.msgBad ? " bad" : ""}" id="wlFormMsg">${esc(S.edit && S.msg ? S.msg : "")}</div>
      <div class="wl-row"><button class="btn primary sm" type="button" id="wlSave">${esc(tr("f_save"))}</button>
        <button class="btn ghost sm" type="button" id="wlCancel">${esc(tr("f_cancel"))}</button></div>
    </div>`;
  }
  function formVals() {
    const $ = id => S.el.querySelector("#" + id);
    const all = $("wlAllOn") && $("wlAllOn").checked;
    const wv = ($("wlW").value || "").trim();
    return { n: Number($("wlN").value), c: Number($("wlC").value), w: wv === "" ? null : Number(wv),
             from: all ? REGRADE : ($("wlFrom").value || ""), why: ($("wlWhy").value || "").trim() };
  }
  function drawPreview() {
    const pv = S.el && S.el.querySelector("#wlPv"); if (!pv) return;
    const v = formVals();
    if (!(isFinite(v.n) && isFinite(v.c) && v.n > 0 && v.c > 0 && v.n !== v.c) || !v.from) { pv.textContent = ""; return; }
    if (check(S.edit, v.n, v.c, v.from, "x", v.w) === tr("e_warn")) { pv.textContent = tr("e_warn"); return; }
    const r = preview(S.model, S.edit, v.n, v.c, v.from, v.w);
    if (!r.n) { pv.textContent = tr("pv_none"); return; }
    pv.textContent = tr("pv", { n: r.n, m: r.m, chg: r.chg, worse: r.worse, better: r.better, odd: r.odd })
      + (r.keep ? " " + tr("pv_keep", { k: r.keep }) : "");
  }
  function wire() {
    const el = S.el, q = s => el.querySelector(s);
    const sel = q("#wlModel");
    if (sel) sel.onchange = () => { S.model = sel.value; S.edit = ""; S.msg = ""; draw(); };
    el.querySelectorAll("[data-wledit]").forEach(b => b.onclick = () => {
      S.edit = b.dataset.wledit; S.msg = ""; draw(); drawPreview();
      const n = q("#wlN"); if (n) n.focus();
    });
    el.querySelectorAll("[data-wlvoid]").forEach(b => b.onclick = async () => {
      if (!who()) { S.msg = tr("void_who"); S.msgBad = true; draw(); return; }
      if (!root.confirm(tr("void_ask"))) return;
      b.disabled = true;
      try { const r = await voidChange(b.dataset.wlvoid); S.msg = r.none ? "" : tr("saved", { rev: r.rev }); S.msgBad = false; }
      catch (e) { S.msg = String((e && e.message) || e); S.msgBad = true; }
      draw();
    });
    const f = q("#wlForm");
    if (!f) return;
    ["#wlN", "#wlW", "#wlC", "#wlFrom", "#wlFromOn", "#wlAllOn"].forEach(s => {
      const x = q(s); if (x) { x.oninput = drawPreview; x.onchange = drawPreview; } });
    q("#wlWho").onchange = () => setWho(q("#wlWho").value.trim());
    q("#wlCancel").onclick = () => { S.edit = ""; S.msg = ""; draw(); };
    q("#wlSave").onclick = async () => {
      setWho(q("#wlWho").value.trim());
      const v = formVals(), btn = q("#wlSave");
      const err = check(S.edit, v.n, v.c, v.from, v.why, v.w);
      const m = q("#wlFormMsg");
      if (err) { m.textContent = err; m.className = "wl-msg bad"; return; }
      btn.disabled = true;
      try {
        const r = await setLimit(S.edit, v.n, v.c, v.from, v.why, v.w);
        S.edit = ""; S.msgBad = false;
        S.msg = r.none ? "" : (r.merged ? tr("saved_merged", { rev: r.rev }) : tr("saved", { rev: r.rev })) + (r.logged === false ? tr("log_fail") : "");
        draw();
      } catch (e) {
        btn.disabled = false; m.textContent = String((e && e.message) || e); m.className = "wl-msg bad";
      }
    };
  }
  function redraw() {
    /* A form being typed into is not redrawn under the hands: the folder
       refresh every few minutes redraws the table only when nobody is editing. */
    if (S.edit) { const st = S.el && S.el.querySelector("#wlStatus"); if (st) { const [s, b] = statusLine(); st.textContent = s; st.className = "wl-st" + (b ? " bad" : ""); } return; }
    draw();
  }

  root.CMWearLimits = {
    DOC, REGRADE,
    init(h) { HOST = Object.assign(HOST, h || {}); },
    mount(el) { S.el = el; draw(); },
    load, preview, setLimit, voidChange, redraw: draw,
    state: () => ({ state: S.state, rev: S.doc ? S.doc.rev : 0, model: S.model, edit: S.edit }),
    select(model) { S.model = model; S.edit = ""; S.msg = ""; draw(); },
    words: WORDS
  };
})(window);
