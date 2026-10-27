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
   _meta/wear/log/.

   FOUR KINDS OF ROUND, ONE DOCUMENT (build 547). A change carries `kind`:
   none (or "uc") is the undercarriage, per model and point; "get" is a ground
   engaging tool, per TOOL (bucket / blade, mobile/get.js) and point; "tb" is
   the dump body tray, per tray model and ZONE (mobile/body-points.js); "temp"
   is a temperature row (mobile/temp-limits.js), warn and alarm in °C. Each
   engine takes only its own kind, so a phone on an older build ignores the
   new kinds rather than misreading them. A temperature grade is the
   inspector's, proposed at the reading, so a temperature change applies from
   today and has no "re-grade all history". */
(function (root) {
  "use strict";
  const DOC = "_meta/wear/limits.json";
  const LOGDIR = "_meta/wear/log/";
  const WHO = "cm_dash_who";
  const REGRADE = "0000-01-01";

  const WORDS = {
    en: {
      title: "Measurement limits",
      sub: "New and wear limit for each model and point, or warning and alarm for a temperature. A limit set here replaces the reference figure on the phone, on both dashboards and in every report.",
      kind: "Round", k_uc: "Undercarriage", k_get: "Ground engaging tools", k_tb: "Dump body tray", k_temp: "Temperature",
      tool: "Tool", tray: "Tray model", t_bucket: "Bucket", t_blade: "Blade & ripper",
      th_zone: "Zone", th_row: "Component", th_tref: "Reference (warning → alarm, °C)", th_tnow: "In force today (warning → alarm, °C)",
      generic: "generic", site: "site", notgraded: "not graded",
      f_twarn: "Warning, °C", f_talarm: "Alarm, °C",
      f_temp_hint: "Applies from today. A temperature grade is proposed on the phone when the reading is taken, so grades already given are not changed.",
      e_tnum: "The warning and the alarm must both be numbers.", e_tdir: "The alarm must be higher than the warning.",
      pv_t: "{n} reading(s) of this kind on record. With these limits {chg} would be proposed a different grade ({worse} higher, {better} lower); grades already given stay as they are.",
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
      hist: "Changes for this model", hist_t: "Temperature changes", none_hist_t: "No temperature changes.", h_void: "Take back", h_voided: "taken back {at} by {by}",
      void_ask: "Take this change back? Readings return to the limit in force before it.",
      void_who: "Type your name in the form first — taking a change back is signed too.",
      none_hist: "No changes for this model."
    },
    ru: {
      title: "Пределы замеров",
      sub: "Новый размер и предел износа для каждой модели и точки или предупреждение и тревога для температуры. Предел, заданный здесь, заменяет эталонное значение в телефоне, на обеих панелях и во всех отчётах.",
      kind: "Осмотр", k_uc: "Ходовая часть", k_get: "Навесное (GET)", k_tb: "Кузов самосвала", k_temp: "Температура",
      tool: "Орудие", tray: "Модель кузова", t_bucket: "Ковш", t_blade: "Отвал и рыхлитель",
      th_zone: "Зона", th_row: "Узел", th_tref: "Эталон (предупр. → тревога, °C)", th_tnow: "Действует сегодня (предупр. → тревога, °C)",
      generic: "типовое", site: "участок", notgraded: "без оценки",
      f_twarn: "Предупреждение, °C", f_talarm: "Тревога, °C",
      f_temp_hint: "Действует с сегодняшнего дня. Оценка температуры предлагается в телефоне при замере, поэтому уже выставленные оценки не меняются.",
      e_tnum: "Предупреждение и тревога должны быть числами.", e_tdir: "Тревога должна быть выше предупреждения.",
      pv_t: "{n} замер(ов) этого вида. С этими пределами {chg} получили бы другую предложенную оценку ({worse} выше, {better} ниже); выставленные оценки остаются.",
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
      hist: "Изменения по этой модели", hist_t: "Изменения температурных пределов", none_hist_t: "Изменений температурных пределов нет.", h_void: "Отменить", h_voided: "отменено {at}, {by}",
      void_ask: "Отменить это изменение? Замеры вернутся к пределу, действовавшему до него.",
      void_who: "Сначала введите имя в форме — отмена тоже подписывается.",
      none_hist: "Изменений по этой модели нет."
    }
  };
  let HOST = { lang: () => "en", recs: () => [], onApplied: () => {} };
  const S = { state: "idle", doc: null, err: "", kind: "uc", model: "", edit: "", msg: "", msgBad: false, el: null };

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
  /* Every engine takes the whole document and keeps the changes of its own kind. */
  function engines(doc) {
    if (W() && W().setLimits) W().setLimits(doc || null);
    if (root.GET && root.GET.setLimits) root.GET.setLimits(doc || null);
    if (root.BODY && root.BODY.setLimits) root.BODY.setLimits(doc || null);
    if (root.tempSetLimits) root.tempSetLimits(doc || null);
  }
  function apply(doc) {
    engines(doc);
    try { HOST.onApplied(); } catch (e) { if (root.bad) root.bad("wear-limits-apply", e); }
  }
  const kindOf = x => (x && x.kind) || "uc";

  /* ── the four kinds: their models, points, references and readings ── */
  function modelOfUnit(a) { const m = a && a.m && W() && W().map[a.m]; return (m && m.m) || ""; }
  const G = () => root.GET, B = () => root.BODY;
  const toolOfUnit = a => { try { const p = G() && G().profileFor(a.n, a.cat || a.cls || "", a.m || ""); return (p && p.tool) || ""; } catch (e) { return ""; } };
  const trayOfUnit = a => { try { return (HOST.bodyModel && HOST.bodyModel(a.n)) || ""; } catch (e) { return ""; } };
  const assetOf = u => (HOST.asset && HOST.asset(u)) || (root.ASSETS || []).find(x => x.n === u) || null;
  const splitKey = k => { k = String(k || ""); const i = k.indexOf("."); return [i < 0 ? k : k.slice(0, i), i < 0 ? "" : k.slice(i + 1)]; };
  const numOf = v => (v === "" || v == null) ? null : (isFinite(Number(v)) ? Number(v) : null);
  const TEMP_KEYS = () => ((root.TEMP_LIMITS || []).map(r => r[3]).filter(Boolean)).concat(["*"]);
  function tempRow(key) {
    if (key === "*") return root.TEMP_LIMIT_DEFAULT || { warn: 80, alarm: 95 };
    const r = (root.TEMP_LIMITS || []).find(x => x[3] === key);
    return r ? { warn: r[1], alarm: r[2] } : null;
  }
  const KINDS = {
    uc: {
      models: () => Object.keys((W() && W().models) || {}).sort(),
      unitOk: (a, model) => modelOfUnit(a) === model,
      points: model => ((W() && W().points) || []).map(p => ({ code: p.code, en: p.en, ru: p.ru })),
      ref: (model, code) => { const m = W().models[model], c = m && m.pts[code];
        return c ? { n: c.n, c: c.c, tag: c.x === "borrowed" ? "borrowed" : c.x === "rival" ? "rival" : "" } : null; },
      now: (model, code) => W().limitFor(model, code, today()),
      dir: (model, code) => { const m = W().models[model], c = m && m.pts[code]; return (c && c.d) || ""; },
      reads(model, point) {
        const out = [];
        (HOST.recs() || []).forEach(r => {
          if (!r || r.type !== "UC") return;
          const a = assetOf(r.equip);
          if (!a || modelOfUnit(a) !== model) return;
          (r.items || []).forEach(it => { const [pt, pos] = splitKey(it.key); const mm = numOf(it.mm);
            if (pt === point && mm != null) out.push({ unit: r.equip, m: a.m, pos, date: r.date || "", mm }); });
        });
        return out;
      },
      grade(r, point) {
        const ref = W().refFor(r.unit, r.m, point, r.pos, r.date);
        if (!ref || ref.x) return { g: null, odd: false };
        if (W().outOfRange(ref, r.mm)) return { g: null, odd: true };
        const p = W().wear(ref, r.mm);
        return { g: p == null ? null : (root.GRADE ? root.GRADE.fromWorn(p, W().warnPct ? W().warnPct(ref) : null) : null), odd: false };
      }
    },
    get: {
      models: () => G() ? Object.keys(G().tools) : [],
      unitOk: (a, model) => toolOfUnit(a) === model,
      label: model => tr("t_" + model),
      points: model => { const T = G() && G().tools[model];
        return T ? T.pts.filter(r => r[4] === "mm").map(r => ({ code: r[1], en: r[2], ru: r[3] })) : []; },
      ref: (model, code) => { const T = G() && G().tools[model], L = T && T.lim && T.lim[code];
        return L ? { n: L.n, c: L.c, tag: L.src === "site" ? "site" : "generic" } : null; },
      now: (model, code) => G().limitFor(model, code, today()),
      dir: () => "shrink",
      reads(model, point) {
        const out = [];
        (HOST.recs() || []).forEach(r => {
          if (!r || r.type !== "GET") return;
          const a = assetOf(r.equip);
          if (!a || toolOfUnit(a) !== model) return;
          (r.items || []).forEach(it => { const [pt] = splitKey(it.key); const mm = numOf(it.mm);
            if (pt === point && mm != null) out.push({ unit: r.equip, a, date: r.date || "", mm }); });
        });
        return out;
      },
      grade(r, point) {
        const ref = G().refFor(r.unit, r.a.cat || r.a.cls || "", r.a.m || "", point, r.date);
        if (!ref) return { g: null, odd: false };
        if (W().outOfRange(ref, r.mm)) return { g: null, odd: true };
        const p = W().wear(ref, r.mm);
        return { g: p == null ? null : (root.GRADE ? root.GRADE.fromWorn(p, W().warnPct(ref)) : null), odd: false };
      }
    },
    tb: {
      models: () => (B() && B().models) ? B().models.slice().sort() : [],
      unitOk: (a, model) => trayOfUnit(a) === model,
      points: model => (B() ? B().zones(model) : []).map(z => ({ code: z.k, en: z.en, ru: z.ru })),
      ref: (model, code) => { const L = B() && B().limits[model] && B().limits[model][code];
        return L ? { n: L.n, c: L.c, tag: L.src === "site" ? "site" : "" } : null; },
      now: (model, code) => { const L = B().limitFor(model, (B().inZone(model, code)[0] || {}).k, today());
        return (L && L.src === "limit") ? L.lim : null; },
      dir: () => "shrink",
      reads(model, zone) {
        const out = [];
        (HOST.recs() || []).forEach(r => {
          if (!r || r.type !== "TB") return;
          const a = assetOf(r.equip);
          if (!a || trayOfUnit(a) !== model) return;
          (r.items || []).forEach(it => { const p = B().get(model, it.key); const mm = numOf(it.mm);
            if (p && p.z === zone && mm != null) out.push({ unit: r.equip, k: it.key, date: r.date || "", mm }); });
        });
        return out;
      },
      grade(r) {
        const L = B().limitFor(S.model, r.k, r.date);
        if (!L) return { g: null, odd: false };
        if (W().outOfRange({ n: L.n, c: L.c, d: "shrink" }, r.mm)) return { g: null, odd: true };
        const p = B().wear(S.model, r.k, r.mm, r.date);
        return { g: p == null ? null : (root.GRADE ? root.GRADE.fromWorn(p, B().warnPct(L)) : null), odd: false };
      }
    },
    temp: {
      models: () => ["*"],
      unitOk: () => true,
      points: () => TEMP_KEYS().map(k => { const nm = (root.TEMP_LIMIT_NAMES || {})[k] || [k, k]; return { code: k, en: nm[0], ru: nm[1] }; }),
      ref: (model, code) => { const r = tempRow(code); return r ? { n: r.warn, c: r.alarm, tag: "" } : null; },
      now: (model, code) => {
        const changes = ((S.doc && S.doc.changes) || []).filter(x => kindOf(x) === "temp" && !x.void && x.point === code && (x.from || "") <= today());
        if (!changes.length) return null;
        changes.sort((x, y) => (x.from || "").localeCompare(y.from || "") || String(x.at || "").localeCompare(String(y.at || "")));
        const x = changes[changes.length - 1];
        return { n: x.warn, c: x.alarm, from: x.from }; },
      dir: () => "",
      reads(model, key) {
        const out = [];
        (HOST.recs() || []).forEach(r => {
          if (!r || r.type !== "TEMP") return;
          (r.items || []).forEach(it => {
            const v = numOf(it.tempV != null && it.tempV !== "" ? it.tempV : it.tempC);
            if (v == null) return;
            const ctx = [it.key, it.comp, it.name, it.label, it.labelRu, it.compRu].filter(Boolean).join(" ");
            if (root.tempBase && root.tempBase(ctx).key === key) out.push({ ctx, date: r.date || "", v });
          });
        });
        return out;
      },
      grade(r) {
        const sv = root.tempSeverity(r.v, root.tempLimit(r.ctx, r.date));
        return { g: sv && root.GRADE ? root.GRADE.fromIso(sv) : null, odd: false };
      }
    }
  };
  const K = () => KINDS[S.kind] || KINDS.uc;
  function unitsOf(model, kind) {
    const k = KINDS[kind || S.kind] || KINDS.uc;
    if ((kind || S.kind) === "temp") return [];
    return (root.ASSETS || []).filter(a => k.unitOk(a, model));
  }
  function readings(model, point) { return K().reads(model, point); }
  /* A change shaped for its kind. */
  function changeOf(point, n, c, from, w) {
    if (S.kind === "temp") return { kind: "temp", model: "*", point, warn: n, alarm: c, from };
    const ch = { model: S.model, point, n, w: (w == null ? null : w), c, from };
    if (S.kind !== "uc") ch.kind = S.kind;
    return ch;
  }
  /* What a change would do: the grade of every reading of this point, scored
     now and scored with the change added, by the engine itself. */
  function preview(model, point, n, c, from, w) {
    const rs = readings(model, point);
    if (!rs.length || !W()) return { n: 0 };
    const grade = r => K().grade(r, point);
    const base = S.doc || empty();
    const before = rs.map(grade);
    const trial = JSON.parse(JSON.stringify(base));
    trial.changes.push(Object.assign(changeOf(point, n, c, from, w), { id: "preview", at: "9999", by: "" }));
    engines(trial);
    let after;
    try { after = rs.map(grade); } finally { engines(S.doc || null); }
    let chg = 0, worse = 0, better = 0, odd = 0, keep = 0;
    const units = {};
    rs.forEach((r, i) => {
      if (r.unit) units[r.unit] = 1;
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
    if (S.kind === "temp") {
      if (!(isFinite(n) && isFinite(c))) return tr("e_tnum");
      if (!(c > n)) return tr("e_tdir");
      if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return tr("e_date");
      if (!why) return tr("e_why");
      if (!who()) return tr("e_who");
      return "";
    }
    if (!(isFinite(n) && isFinite(c) && n > 0 && c > 0)) return tr("e_num");
    if (n === c) return tr("e_same");
    if (w != null && !(isFinite(w) && ((c < n && w < n && w > c) || (c > n && w > n && w < c)))) return tr("e_warn");
    const d = K().dir(S.model, point);
    if (d === "shrink" && !(c < n)) return tr("e_dir", { dir: tr("down"), rel: tr("smaller") });
    if (d === "grow" && !(c > n)) return tr("e_dir", { dir: tr("up"), rel: tr("larger") });
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return tr("e_date");
    if (!why) return tr("e_why");
    if (!who()) return tr("e_who");
    return "";
  }
  async function setLimit(point, n, c, from, why, w) {
    if (w === "" || (typeof w === "number" && !isFinite(w))) w = null;
    if (S.kind === "temp") { w = null; from = today(); }
    const err = check(point, n, c, from, why, w);
    if (err) throw new Error(err);
    const id = "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ch = Object.assign({ id }, changeOf(point, n, c, from, w), { at: new Date().toISOString(), by: who(), why });
    return save(d => {
      if (d.changes.some(x => x.id === id)) return false;
      d.changes.push(ch); return true;
    }, (S.kind === "uc" ? "" : S.kind + " ") + (S.kind === "temp" ? "" : S.model + " ") + point + " " + n + (w != null ? "/" + w : "") + "/" + c + " from " + from);
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
  /* A card like its sibling sections on Data & Sync (audit M14). */
  .wl-panel.section{padding:16px 0 2px}
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
  .wl-panel .wl-tag.off{color:var(--accent);font-weight:600}
  .wl-panel .wl-tag.warn{color:var(--warn-ink,#8a4b00)}
  .wl-panel .wl-form{border:1px solid var(--line,#ccd3d9);border-radius:8px;padding:12px;margin:10px 0;
    display:flex;flex-direction:column;gap:10px;background:var(--surface-2,#f5f7f9)}
  .wl-panel .wl-row{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:end}
  .wl-panel .wl-radio{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:13px}
  .wl-panel .wl-pv{font-size:12.5px;color:var(--ink,#12161a)}
  .wl-panel .wl-msg{font-size:12.5px}
  .wl-panel .wl-msg.bad{color:var(--crit-ink,#a1271b)}
  .wl-panel .wl-msg.ok{color:var(--good-ink,#2c7a3f)}
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
    const p = K().points(S.model).find(x => x.code === code);
    return p ? (lang() === "ru" ? p.ru : p.en) : code;
  }
  function modelLabel(k) { return K().label ? K().label(k) : k; }
  function statusLine() {
    if (S.state === "off") return [tr("st_off"), false];
    if (S.state === "loading" || S.state === "idle") return [tr("st_load"), false];
    if (S.state === "error") return [tr("st_err", { e: S.err }), true];
    if (S.state === "none") return [tr("st_none"), false];
    const d = S.doc || {};
    return [tr("st_ready", { rev: d.rev || 0, by: d.by || "—", at: String(d.at || "").slice(0, 16).replace("T", " ") }), false];
  }
  const span = (a, w, c) => esc(fmt(a)) + " → " + (w != null && w !== "" ? esc(fmt(w)) + " → " : "") + esc(fmt(c));
  function tagOf(t) { return t ? `<span class="wl-tag warn">${esc(tr(t))}</span>` : ""; }
  function nowCell(model, code) {
    const lim = K().now(model, code), ref = K().ref(model, code);
    if (lim) return `<td class="num">${span(lim.n, lim.w, lim.c)}<span class="wl-tag off">${esc(tr("office"))} · ${
      esc(lim.from && lim.from > "0001" ? tr("from", { d: lim.from }) : tr("all_hist"))}</span></td>`;
    if (!ref) return `<td class="num">${tr("none")}${S.kind === "tb" ? tagOf("notgraded") : ""}</td>`;
    return `<td class="num">${span(ref.n, null, ref.c)}${tagOf(ref.tag)}</td>`;
  }
  function histText(x) {
    const amt = kindOf(x) === "temp" ? span(x.warn, null, x.alarm) + " °C" : span(x.n, x.w, x.c);
    return `${esc(ptName(x.point))}: ${amt} · ${esc(x.from && x.from > "0001" ? tr("from", { d: x.from }) : tr("all_hist"))} · ${
      esc(x.by || "")} · ${esc(String(x.at || "").slice(0, 10))} · ${esc(x.why || "")}${
      x.void ? " · " + esc(tr("h_voided", { at: String(x.void.at || "").slice(0, 10), by: x.void.by || "" })) : ""}`;
  }
  function draw() {
    const el = S.el; if (!el || !W()) return;
    css();
    const [st, bad] = statusLine();
    if (!KINDS[S.kind]) S.kind = "uc";
    if (S.kind === "temp") S.model = "*";
    const models = K().models();
    if (!S.model || models.indexOf(S.model) < 0) S.model = "";
    const kinds = ["uc", "get", "tb", "temp"].filter(k => k === "uc" || k === "temp" ? (k !== "temp" || root.TEMP_LIMITS) : KINDS[k].models().length);
    const kopts = kinds.map(k => `<option value="${k}"${k === S.kind ? " selected" : ""}>${esc(tr("k_" + k))}</option>`).join("");
    const mlabel = S.kind === "get" ? tr("tool") : S.kind === "tb" ? tr("tray") : tr("model");
    const opts = `<option value="">${esc(tr("pick"))}</option>` + models.map(k =>
      `<option value="${esc(k)}"${k === S.model ? " selected" : ""}>${esc(modelLabel(k))} (${unitsOf(k).length})</option>`).join("");
    const tmp = S.kind === "temp";
    let body = "";
    if (S.model) {
      const pts = K().points(S.model);
      const thP = tmp ? tr("th_row") : S.kind === "tb" ? tr("th_zone") : tr("th_point");
      const thR = tmp ? tr("th_tref") : tr("th_ref"), thN = tmp ? tr("th_tnow") : tr("th_now");
      body += `<div class="tblwrap"><table class="grid wltbl"><colgroup><col style="width:28%"><col style="width:24%"><col><col style="width:120px"></colgroup>
        <thead><tr><th>${esc(thP)}</th><th class="r">${esc(thR)}</th><th class="r">${esc(thN)}</th><th></th></tr></thead><tbody>` +
        pts.map(p => {
          const ref = K().ref(S.model, p.code);
          return `<tr data-wlpt="${esc(p.code)}"><td title="${esc(p.code)}">${esc(lang() === "ru" ? p.ru : p.en)}</td>
            <td class="num">${ref ? span(ref.n, null, ref.c) : tr("none")}</td>
            ${nowCell(S.model, p.code)}
            <td><button class="btn ghost sm" type="button" data-wledit="${esc(p.code)}"${S.state === "error" || S.state === "off" ? " disabled" : ""}>${esc(tr("edit"))}</button></td></tr>`;
        }).join("") + `</tbody></table></div>`;
      if (S.edit) body += formHtml();
      const hist = ((S.doc && S.doc.changes) || []).filter(x => kindOf(x) === S.kind && (tmp || x.model === S.model)).slice().reverse();
      body += `<div class="secthd" style="margin-top:12px"><h3 style="font-size:14px;margin:0">${esc(tr(tmp ? "hist_t" : "hist"))}</h3></div>`;
      body += hist.length ? `<ul class="wl-hist">` + hist.map(x => `<li class="${x.void ? "void" : ""}" data-wlid="${esc(x.id)}">
          <span class="sp" title="${esc(x.why || "")}">${histText(x)}</span>
          ${x.void ? "" : `<button class="btn ghost sm" type="button" data-wlvoid="${esc(x.id)}">${esc(tr("h_void"))}</button>`}</li>`).join("") + `</ul>`
        : `<div class="sub">${esc(tr(tmp ? "none_hist_t" : "none_hist"))}</div>`;
    }
    el.innerHTML = `<div class="secthd"><h2>${esc(tr("title"))}</h2></div>
      <div class="sub">${esc(tr("sub"))}</div>
      <div class="wl-top"><label class="wl-f">${esc(tr("kind"))}<select id="wlKind">${kopts}</select></label>
        ${tmp ? "" : `<label class="wl-f">${esc(mlabel)}<select id="wlModel">${opts}</select></label>`}
        <span class="wl-st${bad ? " bad" : ""}" id="wlStatus">${esc(st)}</span></div>
      ${S.msg && !S.edit ? `<div class="wl-msg ${S.msgBad ? "bad" : "ok"}" id="wlMsg">${esc(S.msg)}</div>` : ""}
      ${body}`;
    wire();
  }
  function formHtml() {
    const code = S.edit, ref = K().ref(S.model, code), lim = K().now(S.model, code);
    const n0 = lim ? lim.n : (ref ? ref.n : ""), c0 = lim ? lim.c : (ref ? ref.c : ""), w0 = lim && lim.w != null ? lim.w : "";
    const tmp = S.kind === "temp";
    const title = tmp ? ptName(code) : tr("f_title", { pt: ptName(code), model: modelLabel(S.model) });
    return `<div class="wl-form" id="wlForm">
      <b>${esc(title)}</b>
      <div class="wl-row">
        <label class="wl-f">${esc(tr(tmp ? "f_twarn" : "f_new"))}<input type="number" step="any" id="wlN" value="${esc(n0)}"></label>
        ${tmp ? "" : `<label class="wl-f">${esc(tr("f_warn"))}<input type="number" step="any" id="wlW" value="${esc(w0)}"></label>`}
        <label class="wl-f">${esc(tr(tmp ? "f_talarm" : "f_lim"))}<input type="number" step="any" id="wlC" value="${esc(c0)}"></label>
      </div>
      <div class="sub" style="margin:0">${esc(tr(tmp ? "f_temp_hint" : "f_warn_hint"))}</div>
      ${tmp ? "" : `<div class="wl-radio" role="radiogroup" aria-label="${esc(tr("f_apply"))}"><span>${esc(tr("f_apply"))}:</span>
        <label><input type="radio" name="wlApply" id="wlFromOn" value="from" checked> ${esc(tr("f_from"))}</label>
        <input type="date" id="wlFrom" value="${esc(today())}" aria-label="${esc(tr("f_from"))}">
        <label><input type="radio" name="wlApply" id="wlAllOn" value="all"> ${esc(tr("f_all"))}</label></div>`}
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
    if (S.kind === "temp")
      return { n: Number($("wlN").value), c: Number($("wlC").value), w: null, from: today(), why: ($("wlWhy").value || "").trim() };
    const all = $("wlAllOn") && $("wlAllOn").checked;
    const wv = ($("wlW").value || "").trim();
    return { n: Number($("wlN").value), c: Number($("wlC").value), w: wv === "" ? null : Number(wv),
             from: all ? REGRADE : ($("wlFrom").value || ""), why: ($("wlWhy").value || "").trim() };
  }
  function drawPreview() {
    const pv = S.el && S.el.querySelector("#wlPv"); if (!pv) return;
    const v = formVals();
    if (S.kind === "temp") {
      if (!(isFinite(v.n) && isFinite(v.c) && v.c > v.n)) { pv.textContent = ""; return; }
      const r = preview(S.model, S.edit, v.n, v.c, v.from, null);
      pv.textContent = r.n ? tr("pv_t", { n: r.n, chg: r.chg, worse: r.worse, better: r.better }) : tr("pv_none");
      return;
    }
    if (!(isFinite(v.n) && isFinite(v.c) && v.n > 0 && v.c > 0 && v.n !== v.c) || !v.from) { pv.textContent = ""; return; }
    if (check(S.edit, v.n, v.c, v.from, "x", v.w) === tr("e_warn")) { pv.textContent = tr("e_warn"); return; }
    const r = preview(S.model, S.edit, v.n, v.c, v.from, v.w);
    if (!r.n) { pv.textContent = tr("pv_none"); return; }
    pv.textContent = tr("pv", { n: r.n, m: r.m, chg: r.chg, worse: r.worse, better: r.better, odd: r.odd })
      + (r.keep ? " " + tr("pv_keep", { k: r.keep }) : "");
  }
  function wire() {
    const el = S.el, q = s => el.querySelector(s);
    const ks = q("#wlKind");
    if (ks) ks.onchange = () => { S.kind = ks.value; S.model = ""; S.edit = ""; S.msg = ""; draw(); };
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
    state: () => ({ state: S.state, rev: S.doc ? S.doc.rev : 0, kind: S.kind, model: S.model, edit: S.edit }),
    select(model, kind) { if (kind) S.kind = kind; S.model = kind === "temp" ? "*" : model; S.edit = ""; S.msg = ""; draw(); },
    words: WORDS
  };
})(window);
