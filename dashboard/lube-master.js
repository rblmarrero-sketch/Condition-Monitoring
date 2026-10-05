/* THE LUBE MASTER — the site's lubrication programme, kept on the server and
   edited from the office.

   Decided 2026-10-04: the dashboard is the master and the workbook is an
   export that can be re-imported. Until then the programme lived in an Excel
   workbook with five sheets that disagreed with each other, and the dashboard
   could only edit a copy in ONE browser's localStorage — a correction made on
   one desk was invisible on the other, and on every phone.

   ONE DOCUMENT: _meta/lube/master.json, written through CMDrive.putDoc and
   read back through CMDrive.getDoc. No backend change: the folder already
   stores and returns a JSON document by path. Its shape is LUBE.applyMaster's
   (mobile/lube.js): comps / grades / decide / alias, plus rev, at, by and a
   short history. Each save also writes a detail record under _meta/lube/log/.

   TWO DESKS, ONE DOCUMENT. A save re-reads the document first and re-applies
   ITS OWN change on top of whatever is there now — a change is a patch (set
   these fields), not a whole document — so a second desk's edit made in the
   meantime is kept rather than overwritten. Every save carries a name.

   THE BASELINE stays mobile/lube.js, generated from the workbook. Taking an
   edit back restores the workbook's value, because the master is applied to
   a pristine copy every time.

   Loaded by both office pages; its words are its own, like reliability.js. */
(function (root) {
  "use strict";
  const DOC = "_meta/lube/master.json";
  const LOGDIR = "_meta/lube/log/";
  const WHO = "cm_dash_who";
  const HIST_MAX = 300;
  const DRUM = 208;

  const S = { doc: null, state: "idle", err: "", loadedAt: 0, busy: false };
  const UI = { model: null, q: "", fleetOnly: true, dFilter: "open",
               sUnit: "", sDate: "", msg: {}, imp: null };
  let HOST = { lang: () => "en", seen: () => ({}), onApplied: () => {} };

  /* ── words ──────────────────────────────────────────────────────────── */
  const TXT = {
    en: {
      st_off: "No backend attached — this is the workbook baseline. Edits need the folder (Data sources).",
      st_load: "Reading the shared lube master…",
      st_none: "Shared lube master: nothing decided yet — this is the workbook baseline. The first save creates it.",
      st_ready: "Shared lube master · revision {rev} · last change {at} by {by}",
      st_err: "The shared lube master could not be read ({e}). Showing the workbook baseline; saving is off until it reads.",
      who: "Your name", who_ph: "recorded with every change",
      who_need: "Type your name first — every change to the lube master is recorded with it.",
      saving: "Saving…", saved: "Saved — revision {rev}.", saved_merged: "Saved — revision {rev}. Another desk had saved in the meantime; both changes are kept.",
      save_fail: "Not saved: {e}", nothing: "Nothing changed.",
      m_title: "Lube master", m_sub: "Every model and compartment: code, grade, approved and alternative oil, capacities, intervals and the OEM specification. Edits are shared with every desk and phone.",
      m_search: "Find a model", m_fleet: "Fleet models", m_all: "All models",
      m_units: "{n} on the register", m_plan: "Plan 2026 / 27 / 28: {a} / {b} / {c}",
      c_code: "Code", c_comp: "Component", c_grade: "Grade", c_prod: "Approved oil · alternative",
      c_seen: "In use on site", c_cap: "System, L", c_rf: "Refill, L", c_iv: "Site interval, h",
      c_ivo: "OEM interval, h", c_oem: "OEM specification", c_flags: "Flags",
      c_src: "Source: manual · page", c_doc: "manual / document", c_page: "page", src_by: "{who} · {when}",
      g_none: "— no grade —", save_model: "Save changes to this model", undo_model: "Discard",
      revert: "Back to workbook", revert_t: "Take every office edit off this model",
      f_verify: "figure to confirm", f_noiv: "no interval", f_ask: "OEM vs grade", f_dec: "decide",
      f_edit: "edited", rf_src: "from {s}", seen_none: "not audited yet",
      xl_out: "⬇ Excel", xl_in: "⬆ Import Excel", hist: "Change history",
      hist_none: "No changes yet.", hist_row: "rev {rev} · {at} · {by}: {s}",
      migrate: "This browser still holds {n} edits from the old one-desk reference. Move them into the shared master?",
      migrate_go: "Move them", migrate_done: "Moved. The old copy on this browser is cleared.",
      none_sel: "Choose a model.", flagged: "{n} flagged",
      d_title: "Needs decision", d_sub: "The workbook's own sheets name a different oil for the same compartment — the matrix, the per-machine sampling form, Using table New and the sample log. Decide once; every desk, phone and report follows.",
      d_open: "Open", d_done: "Decided", d_all: "All", d_kpi_open: "open", d_kpi_done: "decided",
      d_units: "{n} units in 2026", d_matrix: "matrix",
      d_pick: "Make this the standard", d_note: "Why (optional)",
      d_decided: "Decided: {g} · {by} · {at}", d_reopen: "Reopen", d_empty: "Nothing in this list.",
      d_why_none: "",
      o_title: "Oils and consolidation", o_sub: "One approved product and one alternative per grade. This is the list procurement buys from and the shops stock.",
      o_k_grades: "grades in use", o_k_prod: "products named", o_k_vol: "litres a year", o_k_appr: "approved",
      o_grade: "Grade", o_type: "Type", o_appr: "Approved product", o_alt: "Alternative",
      o_state: "State", o_use: "Used in", o_vol: "L / year", o_drums: "Drums / year", o_seen: "Seen on site",
      o_proposed: "Proposed", o_approved: "Approved", o_approve: "Approve", o_unapprove: "Back to proposed",
      o_use_n: "{c} compartments · {m} models", o_other: "Other…", o_other_p: "Product name",
      o_seen_n: "{n} names", o_seen_none: "—", o_save: "Save", o_csv: "⬇ Procurement list (CSV)",
      o_print: "🖨 Wall chart", o_unused: "Grades on the sheet that no compartment uses",
      o_verify: "product not chosen yet (VERIFY on the sheet)", o_shelf: "on the 2027 shelf",
      c_nosheet: "no data sheet", c_nopour: "sheet states no pour point",
      c_pourbelow: "pour point {d}° — clears the design minimum, not the field",
      c_toowarm: "pour point {d}° — DISQUALIFIED at this site", o_wall_t: "Lubricant identification chart",
      o_wall_s: "One approved product per grade · the colour is on every drum, tote and fill point",
      o_wall_alt: "Alternative", o_wall_for: "Used for",
      s_title: "Oil sampling", s_sub: "Sample numbers in the site's own form (DDMMYYYY-UNIT-CODE), the official component codes, and a printable sampling form for each machine.",
      s_unit: "Machine", s_unit_ph: "e.g. TK154", s_date: "Sample date", s_nomodel: "No lube reference for this machine.",
      s_no: "Sample number", s_point: "Sample point", s_oil: "Oil", s_print: "🖨 Sampling form",
      s_alias: "Code aliases", s_alias_sub: "A code written on an older form or in the sample log, and the official matrix code it means. An alias applies only where the machine actually has that official code.",
      s_from: "Written as", s_to: "Official code(s)", s_save: "Save aliases", s_add: "Add alias",
      f_title: "Oil Sample and Change Oil Information Sheet", f_id: "FRM-OIL-001",
      f_taken: "Sample taken ✓/✗", f_top: "Top up, L", f_chg: "Changed ✓/✗", f_ohrs: "Oil hours",
      f_hrs: "Hour meter", f_by: "Sampled by", f_remarks: "Remarks", f_unit: "Unit",
      i_title: "Import from Excel", i_rows: "{n} changes found in {f}", i_none: "No differences from the master in {f}.",
      i_apply: "Apply these changes", i_cancel: "Cancel", i_skip: "{n} rows skipped (model or grade not known): {l}",
      i_bad: "This file could not be read as an Excel workbook ({e}).",
      i_sheet: "Expected a sheet named “Master” (export first, edit, then import).",
      x_master: "Master", x_grades: "Grades", x_decide: "Decisions",
    },
    ru: {
      st_off: "Сервер не подключён — показан базовый вариант из книги Excel. Для правок нужна папка (Источники данных).",
      st_load: "Читаем общий справочник смазки…",
      st_none: "Общий справочник смазки: решений ещё нет — показан базовый вариант из книги. Первое сохранение создаст его.",
      st_ready: "Общий справочник смазки · редакция {rev} · последнее изменение {at}, {by}",
      st_err: "Не удалось прочитать общий справочник ({e}). Показан базовый вариант; сохранение недоступно.",
      who: "Ваше имя", who_ph: "сохраняется с каждым изменением",
      who_need: "Сначала введите имя — каждое изменение справочника записывается с ним.",
      saving: "Сохранение…", saved: "Сохранено — редакция {rev}.", saved_merged: "Сохранено — редакция {rev}. Другое рабочее место сохраняло одновременно; сохранены оба изменения.",
      save_fail: "Не сохранено: {e}", nothing: "Изменений нет.",
      m_title: "Справочник смазки", m_sub: "Каждая модель и узел: код, класс масла, основной и альтернативный продукт, объёмы, интервалы и спецификация OEM. Правки видны всем рабочим местам и телефонам.",
      m_search: "Найти модель", m_fleet: "Модели парка", m_all: "Все модели",
      m_units: "{n} в реестре", m_plan: "План 2026 / 27 / 28: {a} / {b} / {c}",
      c_code: "Код", c_comp: "Узел", c_grade: "Класс", c_prod: "Основное · альтернатива",
      c_seen: "Фактически", c_cap: "Система, л", c_rf: "Заправка, л", c_iv: "Интервал участка, ч",
      c_ivo: "Интервал OEM, ч", c_oem: "Спецификация OEM", c_flags: "Отметки",
      c_src: "Источник: руководство · стр.", c_doc: "руководство / документ", c_page: "стр.", src_by: "{who} · {when}",
      g_none: "— без класса —", save_model: "Сохранить изменения модели", undo_model: "Отменить",
      revert: "Вернуть из книги", revert_t: "Снять все правки офиса с этой модели",
      f_verify: "уточнить", f_noiv: "нет интервала", f_ask: "OEM vs класс", f_dec: "решить",
      f_edit: "изменено", rf_src: "из {s}", seen_none: "аудита ещё не было",
      xl_out: "⬇ Excel", xl_in: "⬆ Загрузить Excel", hist: "История изменений",
      hist_none: "Изменений ещё нет.", hist_row: "ред. {rev} · {at} · {by}: {s}",
      migrate: "В этом браузере остались {n} правок из старого локального справочника. Перенести их в общий?",
      migrate_go: "Перенести", migrate_done: "Перенесено. Старая копия в браузере очищена.",
      none_sel: "Выберите модель.", flagged: "{n} отметок",
      d_title: "Требует решения", d_sub: "Листы книги называют разное масло для одного узла — матрица, бланк отбора проб, «Using table New» и журнал проб. Решите один раз — все рабочие места, телефоны и отчёты последуют.",
      d_open: "Открытые", d_done: "Решённые", d_all: "Все", d_kpi_open: "открыто", d_kpi_done: "решено",
      d_units: "{n} ед. в 2026", d_matrix: "матрица",
      d_pick: "Сделать стандартом", d_note: "Причина (необязательно)",
      d_decided: "Решено: {g} · {by} · {at}", d_reopen: "Открыть снова", d_empty: "Список пуст.",
      d_why_none: "",
      o_title: "Масла и унификация", o_sub: "Один основной продукт и одна альтернатива на каждый класс. По этому списку закупают и комплектуют склад.",
      o_k_grades: "классов в работе", o_k_prod: "продуктов названо", o_k_vol: "литров в год", o_k_appr: "утверждено",
      o_grade: "Класс", o_type: "Тип", o_appr: "Основной продукт", o_alt: "Альтернатива",
      o_state: "Статус", o_use: "Применение", o_vol: "л / год", o_drums: "Бочек / год", o_seen: "Встречается",
      o_proposed: "Предложено", o_approved: "Утверждено", o_approve: "Утвердить", o_unapprove: "Вернуть в предложенные",
      o_use_n: "{c} узлов · {m} моделей", o_other: "Другое…", o_other_p: "Название продукта",
      o_seen_n: "{n} назв.", o_seen_none: "—", o_save: "Сохранить", o_csv: "⬇ Список закупки (CSV)",
      o_print: "🖨 Плакат", o_unused: "Классы листа, не применённые ни в одном узле",
      o_verify: "продукт ещё не выбран (VERIFY в книге)", o_shelf: "на полке 2027",
      c_nosheet: "нет спецификации", c_nopour: "застывание не указано",
      c_pourbelow: "застывание {d}° — ниже расчётного минимума, но не допуск",
      c_toowarm: "застывание {d}° — НЕ ПРИГОДЕН на этой площадке", o_wall_t: "Таблица идентификации смазочных материалов",
      o_wall_s: "Один утверждённый продукт на класс · цвет на каждой бочке, ёмкости и точке заправки",
      o_wall_alt: "Альтернатива", o_wall_for: "Применяется",
      s_title: "Отбор проб масла", s_sub: "Номера проб в формате участка (ДДММГГГГ-ЕДИНИЦА-КОД), официальные коды узлов и бланк отбора проб для каждой машины.",
      s_unit: "Машина", s_unit_ph: "напр. TK154", s_date: "Дата отбора", s_nomodel: "Для этой машины нет справочника смазки.",
      s_no: "Номер пробы", s_point: "Точка отбора", s_oil: "Масло", s_print: "🖨 Бланк отбора",
      s_alias: "Синонимы кодов", s_alias_sub: "Код со старого бланка или из журнала проб и официальный код матрицы, который он означает. Синоним действует, только если у машины есть этот официальный код.",
      s_from: "Записано как", s_to: "Официальный код(ы)", s_save: "Сохранить синонимы", s_add: "Добавить синоним",
      f_title: "Информация по отбору проб и замене масла", f_id: "FRM-OIL-001",
      f_taken: "Проба ✓/✗", f_top: "Долив, л", f_chg: "Замена ✓/✗", f_ohrs: "Наработка масла",
      f_hrs: "Моточасы", f_by: "Отобрал", f_remarks: "Замечания", f_unit: "Ед.",
      i_title: "Загрузка из Excel", i_rows: "Найдено изменений: {n} в {f}", i_none: "Отличий от справочника в {f} нет.",
      i_apply: "Применить изменения", i_cancel: "Отмена", i_skip: "Пропущено строк: {n} (модель или класс не найдены): {l}",
      i_bad: "Файл не удалось прочитать как книгу Excel ({e}).",
      i_sheet: "Нужен лист «Master» (сначала выгрузите, измените, затем загрузите).",
      x_master: "Master", x_grades: "Grades", x_decide: "Decisions",
    },
  };
  function lang() { return HOST.lang() === "ru" ? "ru" : "en"; }
  function tr(k, v) {
    let s = (TXT[lang()] && TXT[lang()][k]); if (s == null) s = TXT.en[k]; if (s == null) s = k;
    if (v) Object.keys(v).forEach(x => { s = s.split("{" + x + "}").join(v[x] == null ? "" : v[x]); });
    return s;
  }
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtN = n => (n == null || !isFinite(n)) ? "—" : Math.round(n).toLocaleString(lang() === "ru" ? "ru-RU" : "en-GB");
  const fmtAt = iso => { if (!iso) return "—"; const d = new Date(iso); if (!isFinite(d)) return iso;
    const p = n => String(n).padStart(2, "0");
    return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes()); };
  const todayISO = () => { const d = new Date(), p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };
  const who = () => { try { return (localStorage.getItem(WHO) || "").trim(); } catch (e) { return ""; } };
  const setWho = v => { try { localStorage.setItem(WHO, String(v || "").trim()); } catch (e) {} };
  const L = () => root.LUBE;
  const textOn = hex => { const h = String(hex || "#ffffff").replace("#", "");
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const lum = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
    const Y = .2126 * lum(r) + .7152 * lum(g) + .0722 * lum(b);
    return (1.05 / (Y + .05)) >= ((Y + .05) / .05) ? "#ffffff" : "#16242c"; };
  /* A grade's swatch always carries its code: two grades share a fill on the
     site's own sheet (MOLY EP 00/0 and OG), so colour is never the only cue. */
  function swatch(g, big) {
    if (!g) return `<span class="lmx-sw lmx-sw-none">—</span>`;
    const G0 = L() && L().grade(g), hex = (G0 && G0.hex) || "#d9d9d9";
    return `<span class="lmx-sw${big ? " big" : ""}" style="background:${esc(hex)};color:${textOn(hex)}"` +
      ` title="${esc(G0 ? (lang() === "ru" ? G0.ru : G0.en) : g)}">${esc(g)}</span>`;
  }

  /* ── the store ──────────────────────────────────────────────────────── */
  const configured = () => !!(root.CMDrive && root.CMDrive.configured && root.CMDrive.configured());
  function empty() {
    return { type: "cm-lube-master", version: 1, rev: 0, at: "", by: "",
             comps: {}, grades: {}, decide: {}, alias: {}, hist: [] };
  }
  function apply(doc) {
    if (L() && L().applyMaster) L().applyMaster(doc);
    try { HOST.onApplied(); } catch (e) { if (root.bad) root.bad("lube-master-apply", e); }
  }
  async function load() {
    if (!configured() || !root.CMDrive.getDoc) {
      S.state = "off"; S.doc = null; apply(null); return null;
    }
    /* "Reading…" only until the folder has answered once. A refresh of a
       folder that has already said "nothing decided yet" keeps saying that
       while it asks again, instead of flickering every three minutes. */
    if (S.state !== "ready" && S.state !== "none") S.state = "loading";
    try {
      const d = await root.CMDrive.getDoc(DOC);
      S.doc = d || null; S.state = d ? "ready" : "none"; S.err = ""; S.loadedAt = Date.now();
      apply(S.doc);
    } catch (e) {
      S.state = "error"; S.err = String((e && e.message) || e);
      if (root.bad) root.bad("lube-master-load", e);
    }
    redraw();
    return S.doc;
  }
  /* A change is a function that edits a document and returns what it changed
     ([{path, from, to}]). Applied to the CURRENT server copy, read just before
     the write, so an edit from another desk in between is not lost. */
  async function save(patch, summary) {
    if (!who()) throw new Error(tr("who_need"));
    if (!configured()) throw new Error(tr("st_off"));
    if (S.state === "error") throw new Error(tr("st_err", { e: S.err }));
    const seenRev = S.doc ? (S.doc.rev || 0) : 0;
    const fresh = async () => {
      let d = await root.CMDrive.getDoc(DOC);
      d = d ? JSON.parse(JSON.stringify(d)) : empty();
      ["comps", "grades", "decide", "alias"].forEach(k => { if (!d[k] || typeof d[k] !== "object") d[k] = {}; });
      if (!Array.isArray(d.hist)) d.hist = [];
      return d;
    };
    let cur = await fresh();
    let changes = patch(cur) || [];
    if (!changes.length) return { none: true };
    let merged = (cur.rev || 0) !== seenRev;
    /* WRITE, THEN LOOK. The folder has no compare-and-swap for a plain
       document, so two desks saving in the same instant can both read revision
       N and both write N+1 — and the second write would silently carry away
       the first desk's change. So after writing, the document is read back
       and the change is applied to it once more: if that changes nothing, the
       change is there, whoever wrote last; if it changes something, another
       desk's write replaced ours, and ours goes again ON TOP of theirs. A few
       rounds at most; two desks editing the SAME field still end with the last
       one, which is the only answer there is. */
    for (let round = 0; round < 6; round++) {
      cur.type = "cm-lube-master"; cur.version = 1;
      cur.rev = (cur.rev || 0) + 1; cur.at = new Date().toISOString(); cur.by = who();
      cur.hist.unshift({ rev: cur.rev, at: cur.at, by: cur.by, s: summary, n: changes.length });
      cur.hist = cur.hist.slice(0, HIST_MAX);
      await root.CMDrive.putDoc(DOC, cur);
      await new Promise(r => setTimeout(r, 120 + Math.floor(Math.random() * 240)));
      const back = await fresh();
      const again = patch(back) || [];
      if (!again.length) { cur = back; break; }
      cur = back; changes = again; merged = true;
    }
    /* The detail record is the audit trail; the document carries the summary.
       A detail that fails to write is said, never silently dropped. */
    let logged = true;
    try {
      const stamp = cur.at.replace(/[:.]/g, "-");
      await root.CMDrive.putDoc(LOGDIR + stamp + "_r" + cur.rev + ".json",
        { type: "cm-lube-change", rev: cur.rev, at: cur.at, by: cur.by, summary, changes });
    } catch (e) { logged = false; if (root.bad) root.bad("lube-master-log", e); }
    S.doc = cur; S.state = "ready"; apply(cur); redraw();
    return { rev: cur.rev, merged, logged };
  }
  /* Set one field at a path inside the document, recording the change. `to`
     undefined removes the edit (back to the workbook). */
  function setAt(doc, path, field, to, changes, from) {
    let o = doc;
    for (const p of path) { o[p] = o[p] && typeof o[p] === "object" ? o[p] : {}; o = o[p]; }
    const was = o[field];
    if (to === undefined) { if (was === undefined) return; delete o[field]; }
    else { if (JSON.stringify(was) === JSON.stringify(to)) return; o[field] = to; }
    changes.push({ path: path.concat(field).join(" › "), from: from !== undefined ? from : (was === undefined ? null : was),
                   to: to === undefined ? null : to });
  }
  function prune(doc) {
    const walk = o => { Object.keys(o).forEach(k => {
      if (o[k] && typeof o[k] === "object" && !Array.isArray(o[k])) { walk(o[k]); if (!Object.keys(o[k]).length) delete o[k]; } }); };
    ["comps", "grades", "decide", "alias"].forEach(k => doc[k] && walk(doc[k]));
  }
  async function run(key, patch, summary, done) {
    UI.msg[key] = tr("saving"); redraw();
    try {
      const r = await save(d => { const c = patch(d); prune(d); return c; }, summary);
      UI.msg[key] = r.none ? tr("nothing") : tr(r.merged ? "saved_merged" : "saved", { rev: r.rev });
      if (done) done(r);
    } catch (e) { UI.msg[key] = tr("save_fail", { e: (e && e.message) || e }); }
    redraw();
  }

  /* ── what the programme is, after the master ───────────────────────── */
  function assetsByModelKey() {
    const out = {};
    (root.ASSETS || []).forEach(a => {
      const k = L() && L().key(a.m || "", a.cls || "");
      if (!k) return;
      (out[k] = out[k] || []).push(a.n);
    });
    return out;
  }
  /* Demand by grade, from the sheet's own units per model (u[0], 2026) and the
     site's operating hours. One model row is one label: a label split across
     two classes in the register is still one row of units on the sheet. */
  function gradeUse() {
    const lb = L(); const out = {}; const H = (lb.site && lb.site.hoursPerYear) || 7000;
    const seenLabel = {};
    lb.models.forEach(k => {
      const M = lb.of(k.slice(k.indexOf("|") + 1), k.slice(0, k.indexOf("|")));
      if (!M) return;
      const first = !seenLabel[M.m]; seenLabel[M.m] = 1;
      const u = (M.u && M.u[0]) || 0;
      M.comps.forEach(c => {
        if (!c.g) return;
        const o = out[c.g] || (out[c.g] = { comps: 0, models: {}, lyr: 0 });
        if (first) o.comps++;
        o.models[M.m] = 1;
        if (first && u && c.cap && c.iv) o.lyr += c.cap / c.iv * H * u;
      });
    });
    return out;
  }
  function seenNamesByGrade() {
    const seen = HOST.seen() || {}, lb = L(), out = {};
    Object.keys(seen).forEach(key => {
      const s = seen[key]; if (!s || !s.product) return;
      const parts = key.split("|"), k = parts.pop(), m = parts.slice(1).join("|"), cls = parts[0];
      const c = lb.comp(m, k, cls); if (!c || !c.g) return;
      (out[c.g] = out[c.g] || {})[s.product] = 1;
    });
    return out;
  }
  function modelRows() {
    const lb = L(), reg = assetsByModelKey();
    return lb.models.map(k => {
      const i = k.indexOf("|"), M = lb.of(k.slice(i + 1), k.slice(0, i));
      if (!M) return null;
      const flags = M.comps.filter(c => c.verify || c.noiv || c.ask).length;
      const open = M.comps.filter(c => lb.openDecision(M.m, c.k)).length;
      return { key: k, M, n: (reg[k] || []).length, u: M.u || [0, 0, 0], flags, open,
               fleet: (reg[k] || []).length > 0 || (M.u && M.u[0] > 0) };
    }).filter(Boolean).sort((a, b) => (b.n - a.n) || (b.u[0] - a.u[0]) || (a.M.m < b.M.m ? -1 : 1));
  }

  /* ── drawing ────────────────────────────────────────────────────────── */
  /* Only the panel on screen is drawn. The Lubrication tab repaints on every
     refresh, and drawing four panels nobody is looking at cost it 80 ms over
     the 150 ms a tab is allowed (tests/perf.cjs). A panel is drawn the moment
     it is shown (show()), so it is never stale when somebody looks. With no
     active panel named, all four are drawn — a host that does not say. */
  const EL = {};
  function redraw() {
    const on = k => EL[k] && (!UI.active || UI.active === k);
    if (on("master")) drawMaster(EL.master);
    if (on("decide")) drawDecide(EL.decide);
    if (on("oils")) drawOils(EL.oils);
    if (on("sample")) drawSample(EL.sample);
  }
  function statusLine() {
    const d = S.doc;
    const s = S.state === "off" ? tr("st_off") : S.state === "loading" ? tr("st_load")
      : S.state === "error" ? tr("st_err", { e: S.err }) : S.state === "none" || !d ? tr("st_none")
      : tr("st_ready", { rev: d.rev, at: fmtAt(d.at), by: d.by || "—" });
    const cls = S.state === "error" ? "bad" : S.state === "ready" ? "ok" : "";
    return `<div class="lmx-status ${cls}" data-lmx-state="${esc(S.state)}">${esc(s)}</div>`;
  }
  function whoBox(id) {
    return `<label class="lmx-who"><span>${esc(tr("who"))}</span>` +
      `<input id="${id}" class="lmx-in" value="${esc(who())}" placeholder="${esc(tr("who_ph"))}" autocomplete="name"></label>`;
  }
  function bindWho(el, id) {
    const w = el.querySelector("#" + id);
    if (w) w.onchange = () => { setWho(w.value); document.querySelectorAll(".lmx-who input").forEach(x => { if (x !== w) x.value = w.value; }); };
  }
  function msg(key) { return UI.msg[key] ? `<span class="lmx-msg" data-lmx-msg="${key}">${esc(UI.msg[key])}</span>` : `<span class="lmx-msg" data-lmx-msg="${key}"></span>`; }

  /* ---- MASTER ---------------------------------------------------------- */
  function legacyRefCount() {
    try { const o = JSON.parse(localStorage.getItem("cm_lube_ref") || "{}");
      let n = 0; Object.values(o).forEach(m => { n += Object.keys(m || {}).length; }); return n; }
    catch (e) { return 0; }
  }
  function drawMaster(el) {
    const lb = L(); if (!lb) { el.innerHTML = ""; return; }
    const rows = modelRows();
    const q = UI.q.trim().toUpperCase();
    const list = rows.filter(r => (!UI.fleetOnly || r.fleet) &&
      (!q || (r.M.m + " " + (r.M.regs || []).join(" ") + " " + r.M.cls).toUpperCase().indexOf(q) >= 0));
    if (!UI.model || !rows.some(r => r.key === UI.model)) UI.model = (list[0] || rows[0] || {}).key || null;
    const sel = rows.filter(r => r.key === UI.model)[0];
    const legacy = legacyRefCount();
    el.innerHTML =
      `<div class="secthd"><h2>${esc(tr("m_title"))}</h2><span class="spacer"></span>` +
      `<button class="btn" type="button" id="lmxXlOut">${esc(tr("xl_out"))}</button>` +
      `<label class="btn lmx-file">${esc(tr("xl_in"))}<input type="file" id="lmxXlIn" accept=".xlsx,.xlsm"></label>` +
      `</div><p class="sub">${esc(tr("m_sub"))}</p>` + statusLine() +
      `<div class="lmx-bar">${whoBox("lmxWhoM")}` +
      (legacy ? `<span class="lmx-mig">${esc(tr("migrate", { n: legacy }))} <button class="btn" type="button" id="lmxMig">${esc(tr("migrate_go"))}</button></span>` : "") +
      msg("master") + `</div>` + importPanel() +
      `<div class="lmx-two">
        <div class="lmx-list">
          <input class="lmx-in" id="lmxQ" type="search" placeholder="${esc(tr("m_search"))}" value="${esc(UI.q)}">
          <div class="seg lmx-seg"><button type="button" data-lmxf="1" class="${UI.fleetOnly ? "on" : ""}">${esc(tr("m_fleet"))}</button>` +
          `<button type="button" data-lmxf="0" class="${UI.fleetOnly ? "" : "on"}">${esc(tr("m_all"))}</button></div>
          <div class="lmx-models" role="listbox" aria-label="${esc(tr("m_title"))}">` +
          list.map(r => `<button type="button" role="option" class="lmx-mrow${r.key === UI.model ? " on" : ""}" data-lmxm="${esc(r.key)}" aria-selected="${r.key === UI.model}">` +
            `<b>${esc(r.M.m)}</b><i>${esc(r.M.cls)} · ${r.n}${r.open ? ` · <span class="lmx-dot">${r.open}</span>` : ""}</i></button>`).join("") +
          `</div></div>
        <div class="lmx-ed">${sel ? modelEditor(sel) : `<p class="sub">${esc(tr("none_sel"))}</p>`}</div>
      </div>
      <details class="lmx-hist"><summary>${esc(tr("hist"))}</summary>${histList()}</details>`;
    bindWho(el, "lmxWhoM");
    const qi = el.querySelector("#lmxQ");
    qi.oninput = () => { UI.q = qi.value; const pos = qi.selectionStart; drawMaster(el);
      const n = el.querySelector("#lmxQ"); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} };
    el.querySelectorAll("[data-lmxf]").forEach(b => b.onclick = () => { UI.fleetOnly = b.dataset.lmxf === "1"; drawMaster(el); });
    el.querySelectorAll("[data-lmxm]").forEach(b => b.onclick = () => { UI.model = b.dataset.lmxm; drawMaster(el); });
    el.querySelector("#lmxXlOut").onclick = () => exportXlsx();
    el.querySelector("#lmxXlIn").onchange = e => { const f = e.target.files && e.target.files[0]; if (f) importXlsx(f); e.target.value = ""; };
    const mig = el.querySelector("#lmxMig"); if (mig) mig.onclick = migrateLegacy;
    bindImport(el);
    if (sel) bindEditor(el, sel);
  }
  function histList() {
    const h = (S.doc && S.doc.hist) || [];
    if (!h.length) return `<p class="sub">${esc(tr("hist_none"))}</p>`;
    return `<ol class="lmx-histl">` + h.slice(0, 60).map(x =>
      `<li>${esc(tr("hist_row", { rev: x.rev, at: fmtAt(x.at), by: x.by, s: x.s }))}</li>`).join("") + `</ol>`;
  }
  function gradeOptions(cur) {
    const lb = L(), gs = Object.keys(lb.grades);
    return `<option value="">${esc(tr("g_none"))}</option>` + gs.map(g =>
      `<option value="${esc(g)}"${g === cur ? " selected" : ""}>${esc(g)} — ${esc(lang() === "ru" ? lb.grades[g].ru : lb.grades[g].en)}</option>`).join("") +
      (cur && !lb.grades[cur] ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : "");
  }
  function modelEditor(r) {
    const lb = L(), M = r.M, seen = HOST.seen() || {};
    const base = (lb.base().MODELS[r.key] || { comps: [] }).comps;
    const baseOf = k => base.filter(c => c.k === k)[0] || {};
    const num = (k, f, v) => `<input class="lmx-in num" data-k="${esc(k)}" data-f="${f}" value="${esc(v == null ? "" : v)}" inputmode="decimal" aria-label="${esc(tr("c_" + f))} ${esc(k)}">`;
    const head = `<div class="lmx-edhd"><h3>${esc(M.m)}</h3><span class="lmx-chip">${esc(M.cls)}</span>` +
      `<span class="sub">${esc(tr("m_units", { n: r.n }))} · ${esc(tr("m_plan", { a: r.u[0], b: r.u[1], c: r.u[2] }))}</span></div>`;
    const rows = M.comps.map(c => {
      const b = baseOf(c.k), s = seen[r.key + "|" + c.k];
      const prod = c.g ? lb.grade(c.g) : null;
      const open = lb.openDecision(M.m, c.k);
      const flags = [c.verify ? tr("f_verify") : "", c.noiv ? tr("f_noiv") : "", c.ask ? tr("f_ask") : "",
                     open ? tr("f_dec") : "", c.edited ? tr("f_edit") : ""].filter(Boolean);
      const v = lb.verdict(M.m, M.cls, c.k, s && s.product);
      return `<tr data-lmxk="${esc(c.k)}"${c.edited ? ' class="lmx-edited"' : ""}>
        <td class="lmx-code"><b>${esc(c.k)}</b></td>
        <td>${esc(lang() === "ru" ? c.ru : c.en)}</td>
        <td><div class="lmx-gsel">${swatch(c.g)}<select class="lmx-in" data-k="${esc(c.k)}" data-f="g" aria-label="${esc(tr("c_grade"))} ${esc(c.k)}">${gradeOptions(c.g)}</select></div></td>
        <td class="lmx-prod">${prod ? (prod.verify ? `<i class="sub">${esc(tr("o_verify"))}</i>` :
          `<b>${esc(prod.primary || "—")}</b>${prod.alt ? `<i>${esc(prod.alt)}</i>` : ""}`) : "—"}</td>
        <td class="lmx-seen">${s ? `<span class="${v.b === "ok" ? "ok" : v.b === "act" ? "bad" : "warn"}">${esc(s.product)}</span><i>${esc(s.unit)} · ${esc(s.date)}</i>` : `<i class="sub">${esc(tr("seen_none"))}</i>`}</td>
        <td>${num(c.k, "cap", c.cap)}</td>
        <td>${num(c.k, "rf", c.rf)}${c.rfs ? `<i class="sub lmx-src">${esc(tr("rf_src", { s: c.rfs }))}</i>` : ""}</td>
        <td>${num(c.k, "iv", c.iv)}</td>
        <td>${num(c.k, "ivo", c.ivo)}</td>
        <td><input class="lmx-in" data-k="${esc(c.k)}" data-f="oem" value="${esc(c.oem || "")}" aria-label="${esc(tr("c_oem"))} ${esc(c.k)}" title="${esc(b.oem || "")}"></td>
        <td class="lmx-srccell"><input class="lmx-in" data-k="${esc(c.k)}" data-s="doc" value="${esc((c.src || {}).doc || "")}" placeholder="${esc(tr("c_doc"))}" aria-label="${esc(tr("c_doc"))} ${esc(c.k)}">` +
        `<input class="lmx-in lmx-page" data-k="${esc(c.k)}" data-s="page" value="${esc((c.src || {}).page || "")}" placeholder="${esc(tr("c_page"))}" aria-label="${esc(tr("c_page"))} ${esc(c.k)}">` +
        `${c.src && c.src.who ? `<i class="sub lmx-src">${esc(tr("src_by", { who: c.src.who, when: c.src.when || "" }))}</i>` : ""}</td>
        <td class="lmx-flags">${flags.map(f => `<span class="lmx-flag">${esc(f)}</span>`).join("")}</td>
      </tr>`;
    }).join("");
    return head + `<div class="tblwrap scrollbox lmx-tw" style="--sb:560px"><table class="grid lmx-tbl">
      <thead><tr><th>${esc(tr("c_code"))}</th><th>${esc(tr("c_comp"))}</th><th>${esc(tr("c_grade"))}</th>
      <th>${esc(tr("c_prod"))}</th><th>${esc(tr("c_seen"))}</th><th>${esc(tr("c_cap"))}</th><th>${esc(tr("c_rf"))}</th>
      <th>${esc(tr("c_iv"))}</th><th>${esc(tr("c_ivo"))}</th><th>${esc(tr("c_oem"))}</th><th>${esc(tr("c_src"))}</th><th>${esc(tr("c_flags"))}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="lmx-bar"><button class="btn primary" type="button" id="lmxSaveM">${esc(tr("save_model"))}</button>
      <button class="btn" type="button" id="lmxUndoM">${esc(tr("undo_model"))}</button>
      <button class="btn" type="button" id="lmxRevM" title="${esc(tr("revert_t"))}">${esc(tr("revert"))}</button>${msg("model")}</div>`;
  }
  function bindEditor(el, r) {
    const lb = L();
    el.querySelectorAll('select[data-f="g"]').forEach(s => s.onchange = () => {
      const sw = s.parentNode.querySelector(".lmx-sw"); if (sw) sw.outerHTML = swatch(s.value);
    });
    el.querySelector("#lmxUndoM").onclick = () => drawMaster(el);
    el.querySelector("#lmxRevM").onclick = () => run("model", d => {
      const ch = [];
      const o = d.comps && d.comps[r.key];
      if (o) { Object.keys(o).forEach(k => Object.keys(o[k] || {}).forEach(f => setAt(d, ["comps", r.key, k], f, undefined, ch))); }
      return ch;
    }, r.M.m + ": back to the workbook");
    el.querySelector("#lmxSaveM").onclick = () => {
      /* Read the boxes, not a shadow copy: what is on screen is what is saved. */
      const want = {};
      el.querySelectorAll(".lmx-tbl [data-f]").forEach(x => {
        const k = x.dataset.k, f = x.dataset.f, v = String(x.value).trim();
        (want[k] = want[k] || {})[f] = v;
      });
      const srcs = {};
      el.querySelectorAll(".lmx-tbl [data-s]").forEach(x => {
        (srcs[x.dataset.k] = srcs[x.dataset.k] || {})[x.dataset.s] = String(x.value).trim();
      });
      run("model", d => {
        const ch = [];
        const base = (lb.base().MODELS[r.key] || { comps: [] }).comps;
        Object.keys(want).forEach(k => {
          const b = base.filter(c => c.k === k)[0] || {};
          const cur = lb.comp(r.M.m, k, r.M.cls) || {};
          Object.keys(want[k]).forEach(f => {
            const v = want[k][f], isNum = f !== "g" && f !== "oem";
            const nowV = cur[f] == null ? "" : String(cur[f]);
            if (v === nowV) return;                         /* untouched */
            const bV = b[f] == null ? "" : String(b[f]);
            if (isNum && v !== "" && !isFinite(Number(v.replace(",", ".")))) return;
            const val = isNum && v !== "" ? Number(v.replace(",", ".")) : v;
            /* Back to exactly what the workbook says: the edit goes, rather
               than an edit equal to the baseline sitting in the document. */
            setAt(d, ["comps", r.key, k], f, v === bV ? undefined : val, ch, cur[f] == null ? null : cur[f]);
          });
        });
        /* Where a figure came from: the manual and the page, and who traced
           it and when — recorded, not typed. */
        Object.keys(srcs).forEach(k => {
          const cur = (lb.comp(r.M.m, k, r.M.cls) || {}).src || {};
          const s = srcs[k];
          if ((s.doc || "") === (cur.doc || "") && (s.page || "") === (cur.page || "")) return;
          setAt(d, ["comps", r.key, k], "src", (s.doc || s.page)
            ? { doc: s.doc || "", page: s.page || "", who: who(), when: todayISO() } : undefined, ch, cur.doc ? cur : null);
        });
        return ch;
      }, r.M.m);
    };
  }
  function migrateLegacy() {
    let o = {}; try { o = JSON.parse(localStorage.getItem("cm_lube_ref") || "{}"); } catch (e) {}
    run("master", d => {
      const ch = [];
      Object.keys(o).forEach(mk => Object.keys(o[mk] || {}).forEach(k => {
        const e = o[mk][k] || {};
        ["cap", "iv", "oem"].forEach(f => { if (e[f] !== undefined) setAt(d, ["comps", mk, k], f, e[f] === "" ? "" : (f === "oem" ? e[f] : Number(e[f])), ch); });
        if (e.src) setAt(d, ["comps", mk, k], "src", e.src, ch);
      }));
      return ch;
    }, "moved from one browser's local reference", () => {
      try { localStorage.removeItem("cm_lube_ref"); } catch (e) {}
      UI.msg.master = tr("migrate_done");
    });
  }

  /* ---- NEEDS DECISION -------------------------------------------------- */
  function drawDecide(el) {
    const lb = L(); if (!lb) { el.innerHTML = ""; return; }
    const dm = (S.doc && S.doc.decide) || {};
    const all = lb.decide.map(d => ({ d, done: dm[d.id] && dm[d.id].g ? dm[d.id] : null }));
    const nOpen = all.filter(x => !x.done).length, nDone = all.length - nOpen;
    const list = all.filter(x => UI.dFilter === "all" || (UI.dFilter === "open" ? !x.done : !!x.done));
    el.innerHTML =
      `<div class="secthd"><h2>${esc(tr("d_title"))}</h2><span class="spacer"></span>` +
      `<span class="hdfacts"><span><b>${nOpen}</b> ${esc(tr("d_kpi_open"))}</span><span><b>${nDone}</b> ${esc(tr("d_kpi_done"))}</span></span></div>` +
      `<p class="sub">${esc(tr("d_sub"))}</p>` + statusLine() +
      `<div class="lmx-bar">${whoBox("lmxWhoD")}<div class="seg">` +
      [["open", "d_open", nOpen], ["done", "d_done", nDone], ["all", "d_all", all.length]].map(([k, l, n]) =>
        `<button type="button" data-lmxd="${k}" class="${UI.dFilter === k ? "on" : ""}">${esc(tr(l))}<span class="n">${n}</span></button>`).join("") +
      `</div>${msg("decide")}</div>` +
      (list.length ? `<div class="lmx-dlist">` + list.map(({ d, done }) => {
        const cur = done ? done.g : d.cur;
        return `<div class="lmx-dec${done ? " done" : ""}" data-lmxid="${esc(d.id)}">
          <div class="lmx-dwhat"><b>${esc(d.m)}</b><span class="lmx-code">${esc(d.k)}</span> ${esc(d.en)}
            <i>${esc(tr("d_units", { n: d.units }))}</i></div>
          <div class="lmx-dopts">` + d.opts.map(o => `<button type="button" class="lmx-opt${o.g === cur ? " cur" : ""}" data-lmxg="${esc(o.g)}" ${done ? "disabled" : ""}>` +
            `${swatch(o.g)}<span class="lmx-osrc">${esc(o.src.map(s => s === "matrix" ? tr("d_matrix") : s).join(" · "))}</span>` +
            (done ? "" : `<span class="lmx-opick">${esc(tr("d_pick"))}</span>`) + `</button>`).join("") +
          `</div>` +
          (done ? `<div class="lmx-dres">${esc(tr("d_decided", { g: done.g, by: done.by || "—", at: fmtAt(done.at) }))}${done.note ? " — " + esc(done.note) : ""}` +
                  ` <button class="btn" type="button" data-lmxre="${esc(d.id)}">${esc(tr("d_reopen"))}</button></div>`
                : `<input class="lmx-in lmx-dnote" placeholder="${esc(tr("d_note"))}" aria-label="${esc(tr("d_note"))}">`) +
        `</div>`;
      }).join("") + `</div>` : `<p class="sub">${esc(tr("d_empty"))}</p>`);
    bindWho(el, "lmxWhoD");
    el.querySelectorAll("[data-lmxd]").forEach(b => b.onclick = () => { UI.dFilter = b.dataset.lmxd; drawDecide(el); });
    el.querySelectorAll(".lmx-dec:not(.done) [data-lmxg]").forEach(b => b.onclick = () => {
      const box = b.closest(".lmx-dec"), id = box.dataset.lmxid, g = b.dataset.lmxg;
      const note = (box.querySelector(".lmx-dnote") || {}).value || "";
      run("decide", d => { const ch = [];
        setAt(d, ["decide"], id, { g, by: who(), at: new Date().toISOString(), note: note.trim() }, ch); return ch; },
        id + " → " + g);
    });
    el.querySelectorAll("[data-lmxre]").forEach(b => b.onclick = () => {
      const id = b.dataset.lmxre;
      run("decide", d => { const ch = []; setAt(d, ["decide"], id, undefined, ch); return ch; }, id + " reopened");
    });
  }

  /* ---- OILS AND CONSOLIDATION ----------------------------------------- */
  function candidates(t) {
    const lb = L(), out = [], seen = {};
    const add = (p, tag) => { const k = String(p || "").toUpperCase().replace(/[^A-Z0-9А-Я]/g, "");
      if (!p || seen[k]) return; seen[k] = 1; out.push({ p, tag }); };
    lb.catalog.forEach(x => { if (x.t === t) add(x.p, ""); });
    ((root.LUBE2027 && root.LUBE2027.shelf) || []).forEach(x => { if (x.t === t) add(x.p, tr("o_shelf")); });
    return out;
  }
  /* Whether a product is fit for the cold is not something this screen may
     assert. Every option says what its data sheet says, and nothing more: no
     sheet, no pour point stated, a pour point below the design minimum (one
     hurdle cleared, NOT approval), or a pour point at or above it — which
     disqualifies it, so it stays on the list, says so, and cannot be chosen.
     Carried over unchanged from the old "Standards" panel. */
  function cold(p) {
    return root.LUBETDS && root.LUBETDS.coldVerdict ? root.LUBETDS.coldVerdict(p) : { k: "nosheet" };
  }
  function coldWarn(p) { return cold(p).k === "toowarm"; }
  function coldWords(p) { const v = cold(p); return tr("c_" + v.k, { d: v.pour }); }
  function drawOils(el) {
    const lb = L(); if (!lb) { el.innerHTML = ""; return; }
    const use = gradeUse(), seenG = seenNamesByGrade(), gm = (S.doc && S.doc.grades) || {};
    const gs = Object.keys(lb.grades);
    const used = gs.filter(g => use[g] && use[g].comps), unused = gs.filter(g => !(use[g] && use[g].comps));
    used.sort((a, b) => (use[b].lyr - use[a].lyr) || (use[b].comps - use[a].comps));
    const total = used.reduce((s, g) => s + use[g].lyr, 0);
    const nAppr = used.filter(g => lb.grades[g].state === "approved").length;
    const prodNamed = lb.catalog.length;
    const row = g => {
      const G0 = lb.grades[g], u = use[g] || { comps: 0, models: {}, lyr: 0 };
      const cands = candidates(G0.t);
      const opts = cur => cands.map(c => `<option value="${esc(c.p)}"${c.p === cur ? " selected" : ""}${coldWarn(c.p) && c.p !== cur ? " disabled" : ""}>${esc(c.p)}${c.tag ? " · " + esc(c.tag) : ""} · ${esc(coldWords(c.p))}</option>`).join("") +
        (cur && !cands.some(c => c.p === cur) ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : "") +
        `<option value="__other">${esc(tr("o_other"))}</option>`;
      const names = Object.keys(seenG[g] || {});
      const st = G0.state === "approved";
      return `<tr data-lmxgr="${esc(g)}"${gm[g] ? ' class="lmx-edited"' : ""}>
        <td>${swatch(g, true)}</td>
        <td>${esc(lang() === "ru" ? G0.ru : G0.en)}</td>
        <td>${G0.verify ? `<i class="sub">${esc(tr("o_verify"))}</i>` : `<select class="lmx-in" data-f="primary" aria-label="${esc(tr("o_appr"))} ${esc(g)}"><option value=""></option>${opts(G0.primary)}</select>`}</td>
        <td>${G0.verify ? "" : `<select class="lmx-in" data-f="alt" aria-label="${esc(tr("o_alt"))} ${esc(g)}"><option value=""></option>${opts(G0.alt)}</select>`}</td>
        <td><span class="band ${st ? "b-ok" : "b-none"}">${esc(tr(st ? "o_approved" : "o_proposed"))}</span>
            ${G0.verify ? "" : `<button class="btn lmx-sm" type="button" data-lmxap="${st ? "0" : "1"}">${esc(tr(st ? "o_unapprove" : "o_approve"))}</button>`}
            ${st && G0.by ? `<i class="sub">${esc(G0.by)} · ${esc(fmtAt(G0.at))}</i>` : ""}</td>
        <td>${esc(tr("o_use_n", { c: u.comps, m: Object.keys(u.models).length }))}</td>
        <td class="num">${fmtN(u.lyr)}</td><td class="num">${fmtN(u.lyr / DRUM)}</td>
        <td>${names.length ? `<span class="${names.length > 2 ? "lmx-warn" : ""}" title="${esc(names.join("\n"))}">${esc(tr("o_seen_n", { n: names.length }))}</span>` : esc(tr("o_seen_none"))}</td>
      </tr>`;
    };
    el.innerHTML =
      `<div class="secthd"><h2>${esc(tr("o_title"))}</h2><span class="spacer"></span>` +
      `<button class="btn" type="button" id="lmxCsv">${esc(tr("o_csv"))}</button>` +
      `<button class="btn" type="button" id="lmxWall">${esc(tr("o_print"))}</button></div>` +
      `<p class="sub">${esc(tr("o_sub"))}</p>` + statusLine() +
      `<div class="kpis lmx-kpis">
        <div class="kpi"><span class="k">${esc(tr("o_k_grades"))}</span><span class="v">${used.length}</span></div>
        <div class="kpi"><span class="k">${esc(tr("o_k_prod"))}</span><span class="v">${prodNamed}</span></div>
        <div class="kpi"><span class="k">${esc(tr("o_k_vol"))}</span><span class="v">${fmtN(total)}</span></div>
        <div class="kpi ${nAppr === used.length ? "good" : "warn"}"><span class="k">${esc(tr("o_k_appr"))}</span><span class="v">${nAppr}<span class="of"> / ${used.length}</span></span></div>
      </div>
      <div class="lmx-bar">${whoBox("lmxWhoO")}${msg("oils")}</div>
      <div class="tblwrap scrollbox" style="--sb:640px"><table class="grid lmx-tbl lmx-oils"><thead><tr>
        <th>${esc(tr("o_grade"))}</th><th>${esc(tr("o_type"))}</th><th>${esc(tr("o_appr"))}</th><th>${esc(tr("o_alt"))}</th>
        <th>${esc(tr("o_state"))}</th><th>${esc(tr("o_use"))}</th><th class="num">${esc(tr("o_vol"))}</th><th class="num">${esc(tr("o_drums"))}</th><th>${esc(tr("o_seen"))}</th>
      </tr></thead><tbody>${used.map(row).join("")}</tbody></table></div>
      <div class="lmx-bar"><button class="btn primary" type="button" id="lmxSaveO">${esc(tr("o_save"))}</button></div>
      ${unused.length ? `<details class="lmx-hist"><summary>${esc(tr("o_unused"))} (${unused.length})</summary>
        <table class="grid lmx-tbl lmx-oils"><tbody>${unused.map(row).join("")}</tbody></table></details>` : ""}`;
    bindWho(el, "lmxWhoO");
    el.querySelectorAll('select[data-f]').forEach(s => s.onchange = () => {
      if (s.value !== "__other") return;
      const p = (root.prompt ? root.prompt(tr("o_other_p")) : "") || "";
      if (!p.trim()) { s.value = ""; return; }
      const o = document.createElement("option"); o.value = p.trim(); o.textContent = p.trim(); o.selected = true;
      s.insertBefore(o, s.lastChild);
    });
    el.querySelector("#lmxSaveO").onclick = () => {
      const want = {};
      el.querySelectorAll("tr[data-lmxgr]").forEach(tr_ => {
        const g = tr_.dataset.lmxgr;
        tr_.querySelectorAll("select[data-f]").forEach(s => { (want[g] = want[g] || {})[s.dataset.f] = s.value === "__other" ? "" : s.value; });
      });
      run("oils", d => {
        const ch = [], base = lb.base().GRADES;
        Object.keys(want).forEach(g => Object.keys(want[g]).forEach(f => {
          const v = want[g][f], now = lb.grades[g][f] || "", b = (base[g] || {})[f] || "";
          if (v === now) return;
          setAt(d, ["grades", g], f, v === b ? undefined : v, ch, now);
        }));
        return ch;
      }, "oils and alternatives");
    };
    el.querySelectorAll("[data-lmxap]").forEach(b => b.onclick = () => {
      const g = b.closest("tr").dataset.lmxgr, on = b.dataset.lmxap === "1";
      run("oils", d => { const ch = [];
        setAt(d, ["grades", g], "state", on ? "approved" : undefined, ch);
        setAt(d, ["grades", g], "by", on ? who() : undefined, ch);
        setAt(d, ["grades", g], "at", on ? new Date().toISOString() : undefined, ch);
        return ch; }, g + (on ? " approved" : " back to proposed"));
    });
    el.querySelector("#lmxCsv").onclick = () => procurementCsv(used, use);
    el.querySelector("#lmxWall").onclick = () => printWall(used, use);
  }
  function download(name, blob) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function procurementCsv(used, use) {
    const lb = L();
    const q = v => { const s = String(v == null ? "" : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [["Grade", "Type", "Approved product", "Alternative", "State", "Compartments", "Models", "Litres/year", "Drums/year (208 L)"]];
    used.forEach(g => { const G0 = lb.grades[g], u = use[g];
      rows.push([g, G0.t, G0.primary, G0.alt, G0.state || "proposed", u.comps, Object.keys(u.models).length,
                 Math.round(u.lyr), Math.ceil(u.lyr / DRUM)]); });
    download("lube-procurement_" + todayISO() + ".csv",
      new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
  }
  /* Printing: a sheet appended to the body and everything else hidden while it
     prints, so the page's own print styles never fight it. */
  function printSheet(html) {
    let host = document.getElementById("lmxPrint");
    if (!host) { host = document.createElement("div"); host.id = "lmxPrint"; document.body.appendChild(host); }
    host.innerHTML = html;
    document.body.classList.add("lmx-printing");
    const done = () => { document.body.classList.remove("lmx-printing"); root.removeEventListener("afterprint", done); };
    root.addEventListener("afterprint", done);
    try { root.print(); } catch (e) {}
    setTimeout(() => { if (!root.matchMedia || !root.matchMedia("print").matches) done(); }, 1500);
  }
  function printWall(used, use) {
    const lb = L();
    const usedFor = g => { const names = {};
      lb.models.forEach(k => { const M = lb.of(k.slice(k.indexOf("|") + 1), k.slice(0, k.indexOf("|")));
        (M ? M.comps : []).forEach(c => { if (c.g === g) names[lang() === "ru" ? c.ru : c.en] = 1; }); });
      return Object.keys(names).slice(0, 8).join(", "); };
    printSheet(`<div class="lmx-wall"><h1>${esc(tr("o_wall_t"))}</h1><p>${esc(tr("o_wall_s"))}</p><div class="lmx-wgrid">` +
      used.filter(g => !lb.grades[g].verify).map(g => { const G0 = lb.grades[g];
        return `<div class="lmx-wcard" style="border-color:${esc(G0.hex)}">
          <div class="lmx-wsw" style="background:${esc(G0.hex)};color:${textOn(G0.hex)}">${esc(g)}</div>
          <div class="lmx-wbody"><b>${esc(G0.primary || "—")}</b>
          ${G0.alt ? `<span>${esc(tr("o_wall_alt"))}: ${esc(G0.alt)}</span>` : ""}
          <span>${esc(lang() === "ru" ? G0.ru : G0.en)}</span>
          <i>${esc(tr("o_wall_for"))}: ${esc(usedFor(g))}</i></div></div>`; }).join("") + `</div></div>`);
  }

  /* ---- SAMPLING -------------------------------------------------------- */
  function unitModel(u) {
    const a = (root.ASSETS || []).filter(x => String(x.n).toUpperCase() === String(u || "").trim().toUpperCase())[0];
    if (!a) return null;
    const M = L().of(a.m || "", a.cls || "");
    return M ? { a, M } : null;
  }
  function drawSample(el) {
    const lb = L(); if (!lb) { el.innerHTML = ""; return; }
    if (!UI.sDate) UI.sDate = todayISO();
    const hit = UI.sUnit ? unitModel(UI.sUnit) : null;
    const al = Object.assign({}, lb.codeAlias, (S.doc && S.doc.alias) || {});
    const units = (root.ASSETS || []).filter(a => lb.key(a.m || "", a.cls || "")).map(a => a.n);
    el.innerHTML =
      `<div class="secthd"><h2>${esc(tr("s_title"))}</h2><span class="spacer"></span>` +
      (hit ? `<button class="btn" type="button" id="lmxForm">${esc(tr("s_print"))}</button>` : "") + `</div>` +
      `<p class="sub">${esc(tr("s_sub"))}</p>` +
      `<div class="lmx-bar"><label class="fld"><span>${esc(tr("s_unit"))}</span><input class="lmx-in" id="lmxSU" list="lmxSUL" value="${esc(UI.sUnit)}" placeholder="${esc(tr("s_unit_ph"))}"></label>` +
      `<datalist id="lmxSUL">${units.map(u => `<option value="${esc(u)}">`).join("")}</datalist>` +
      `<label class="fld"><span>${esc(tr("s_date"))}</span><input class="lmx-in" id="lmxSD" type="date" value="${esc(UI.sDate)}"></label></div>` +
      (UI.sUnit && !hit ? `<p class="sub">${esc(tr("s_nomodel"))}</p>` : "") +
      (hit ? `<div class="lmx-edhd"><h3>${esc(hit.a.n)}</h3><span class="lmx-chip">${esc(hit.M.m)}</span></div>
        <div class="tblwrap"><table class="grid lmx-tbl lmx-samp"><thead><tr><th>${esc(tr("c_code"))}</th><th>${esc(tr("s_point"))}</th>
        <th>${esc(tr("s_oil"))}</th><th>${esc(tr("s_no"))}</th><th>${esc(tr("c_rf"))}</th><th>${esc(tr("c_iv"))}</th></tr></thead><tbody>` +
        sampleRows(hit).map(r => `<tr><td class="lmx-code"><b>${esc(r.k)}</b></td><td>${esc(r.name)}</td><td>${swatch(r.g)} ${esc(r.prod)}</td>` +
          `<td><code class="lmx-sno">${esc(r.no)}</code></td><td class="num">${r.rf == null ? "—" : esc(r.rf)}</td><td class="num">${r.iv == null ? "—" : esc(r.iv)}</td></tr>`).join("") +
        `</tbody></table></div>` : "") +
      `<h3 class="lmx-h3">${esc(tr("s_alias"))}</h3><p class="sub">${esc(tr("s_alias_sub"))}</p>
       <div class="lmx-bar">${whoBox("lmxWhoS")}${msg("alias")}</div>
       <table class="grid lmx-tbl lmx-alias"><thead><tr><th>${esc(tr("s_from"))}</th><th>${esc(tr("s_to"))}</th></tr></thead><tbody>` +
      Object.keys(al).map(k => `<tr><td><input class="lmx-in" data-a="from" value="${esc(k)}" aria-label="${esc(tr("s_from"))}"></td>` +
        `<td><input class="lmx-in" data-a="to" value="${esc((al[k] || []).join(", "))}" aria-label="${esc(tr("s_to"))}"></td></tr>`).join("") +
      `<tr><td><input class="lmx-in" data-a="from" value="" aria-label="${esc(tr("s_from"))}"></td><td><input class="lmx-in" data-a="to" value="" aria-label="${esc(tr("s_to"))}"></td></tr>` +
      `</tbody></table><div class="lmx-bar"><button class="btn primary" type="button" id="lmxSaveA">${esc(tr("s_save"))}</button></div>`;
    bindWho(el, "lmxWhoS");
    const su = el.querySelector("#lmxSU"), sd = el.querySelector("#lmxSD");
    su.onchange = () => { UI.sUnit = su.value.trim().toUpperCase(); drawSample(el); };
    sd.onchange = () => { UI.sDate = sd.value || todayISO(); drawSample(el); };
    const fb = el.querySelector("#lmxForm"); if (fb) fb.onclick = () => printForm(hit);
    el.querySelector("#lmxSaveA").onclick = () => {
      const want = {};
      el.querySelectorAll(".lmx-alias tbody tr").forEach(r => {
        const f = r.querySelector('[data-a="from"]').value.trim(), to = r.querySelector('[data-a="to"]').value
          .split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
        if (f && to.length) want[f] = to;
      });
      run("alias", d => {
        const ch = [], base = lb.codeAlias;
        const keys = {}; Object.keys(want).concat(Object.keys(d.alias || {}), Object.keys(base)).forEach(k => keys[k] = 1);
        Object.keys(keys).forEach(k => {
          const v = want[k], b = base[k];
          const same = (x, y) => JSON.stringify(x || null) === JSON.stringify(y || null);
          setAt(d, ["alias"], k, v === undefined ? (b ? [] : undefined) : (same(v, b) ? undefined : v), ch);
        });
        return ch;
      }, "sample-code aliases");
    };
  }
  function sampleRows(hit) {
    const lb = L();
    return hit.M.comps.filter(c => c.k !== "10").map(c => {
      const p = lb.forComp(hit.M.m, c.k, hit.M.cls);
      return { k: c.k, name: lang() === "ru" ? c.ru : c.en, g: c.g, prod: p ? p.p : "",
               no: lb.sampleNo(UI.sDate, hit.a.n, c.k), rf: c.rf != null ? c.rf : c.cap, iv: c.iv };
    });
  }
  function printForm(hit) {
    const rows = sampleRows(hit);
    printSheet(`<div class="lmx-form"><div class="lmx-fhd"><b>GDK Baimskaya</b><span>${esc(tr("f_id"))}</span></div>
      <h1>${esc(tr("f_title"))}</h1>
      <table class="lmx-fmeta"><tr><td>${esc(tr("f_unit"))}: <b>${esc(hit.a.n)}</b></td><td>${esc(hit.M.m)}</td>
        <td>${esc(tr("s_date"))}: <b>${esc(UI.sDate)}</b></td><td>${esc(tr("f_hrs"))}: ________</td></tr></table>
      <table class="lmx-ftbl"><thead><tr><th>${esc(tr("c_code"))}</th><th>${esc(tr("s_point"))}</th><th>${esc(tr("s_oil"))}</th>
        <th>${esc(tr("s_no"))}</th><th>${esc(tr("f_taken"))}</th><th>${esc(tr("f_top"))}</th><th>${esc(tr("f_chg"))}</th>
        <th>${esc(tr("f_ohrs"))}</th><th>${esc(tr("c_rf"))}</th></tr></thead><tbody>` +
      rows.map(r => { const G0 = r.g && L().grade(r.g);
        return `<tr><td><b>${esc(r.k)}</b></td><td>${esc(r.name)}</td>` +
          `<td style="background:${esc(G0 ? G0.hex : "#fff")};color:${textOn(G0 ? G0.hex : "#ffffff")}"><b>${esc(r.g || "")}</b> ${esc(r.prod)}</td>` +
          `<td>${esc(r.no)}</td><td></td><td></td><td></td><td></td><td>${r.rf == null ? "" : esc(r.rf)}</td></tr>`; }).join("") +
      `</tbody></table><p>${esc(tr("f_remarks"))}: ____________________________________________</p>
      <p>${esc(tr("f_by"))}: ______________________ &nbsp; ______________</p></div>`);
  }

  /* ── Excel: a real .xlsx out, with the grade colours, and back in ───── */
  const XHDR = ["Class", "Model", "Code", "Component", "Component (RU)", "Grade", "Approved product", "Alternative",
                "System capacity L", "Refill L", "Site interval h", "OEM interval h", "OEM specification", "Flags"];
  const GHDR = ["Grade", "Type", "Approved product", "Alternative", "State"];
  function exportXlsx() {
    const lb = L();
    const master = [XHDR];
    const fills = [];
    lb.models.forEach(k => {
      const i = k.indexOf("|"), M = lb.of(k.slice(i + 1), k.slice(0, i)); if (!M) return;
      M.comps.forEach(c => {
        const G0 = c.g ? lb.grade(c.g) : null;
        master.push([M.cls, M.m, c.k, c.en, c.ru, c.g || "", G0 ? G0.primary : "", G0 ? G0.alt : "",
          c.cap == null ? "" : c.cap, c.rf == null ? "" : c.rf, c.iv == null ? "" : c.iv, c.ivo == null ? "" : c.ivo,
          c.oem || "", [c.verify ? "verify" : "", c.noiv ? "no interval" : "", c.ask ? "OEM vs grade" : "",
                       lb.openDecision(M.m, c.k) ? "needs decision" : ""].filter(Boolean).join(", ")]);
        fills.push(G0 ? G0.hex : null);
      });
    });
    const grades = [GHDR].concat(Object.keys(lb.grades).map(g => { const G0 = lb.grades[g];
      return [g, G0.t, G0.primary || "", G0.alt || "", G0.state || "proposed"]; }));
    const decide = [["Model", "Code", "Component", "Current", "Options (sources)", "Decided", "By", "At"]].concat(
      lb.decide.map(d => { const dd = (S.doc && S.doc.decide && S.doc.decide[d.id]) || {};
        return [d.m, d.k, d.en, d.cur, d.opts.map(o => o.g + " (" + o.src.join(", ") + ")").join("; "), dd.g || "", dd.by || "", dd.at || ""]; }));
    const blob = XLSX.write([
      { name: tr("x_master"), rows: master, fillCol: 5, fills, widths: [6, 30, 7, 26, 26, 12, 34, 34, 10, 9, 10, 10, 30, 22] },
      { name: tr("x_grades"), rows: grades, fillCol: 0, fills: Object.keys(lb.grades).map(g => lb.grades[g].hex), widths: [14, 12, 40, 40, 11] },
      { name: tr("x_decide"), rows: decide, widths: [30, 7, 26, 12, 60, 10, 18, 22] },
    ]);
    download("lube-master_" + todayISO() + ".xlsx", blob);
  }
  function importPanel() {
    const I = UI.imp; if (!I) return "";
    if (I.err) return `<div class="lmx-imp bad">${esc(I.err)} <button class="btn" type="button" data-lmxi="x">${esc(tr("i_cancel"))}</button></div>`;
    return `<div class="lmx-imp"><b>${esc(tr("i_title"))}</b> — ${esc(I.ch.length ? tr("i_rows", { n: I.ch.length, f: I.file }) : tr("i_none", { f: I.file }))}` +
      (I.skip.length ? `<p class="sub">${esc(tr("i_skip", { n: I.skip.length, l: I.skip.slice(0, 8).join(", ") }))}</p>` : "") +
      (I.ch.length ? `<ol class="lmx-histl">${I.ch.slice(0, 40).map(c => `<li>${esc(c.label)}: ${esc(c.from === "" ? "—" : c.from)} → <b>${esc(c.to === "" ? "—" : c.to)}</b></li>`).join("")}${I.ch.length > 40 ? `<li>… +${I.ch.length - 40}</li>` : ""}</ol>` : "") +
      `<div class="lmx-bar">${I.ch.length ? `<button class="btn primary" type="button" data-lmxi="go">${esc(tr("i_apply"))}</button>` : ""}` +
      `<button class="btn" type="button" data-lmxi="x">${esc(tr("i_cancel"))}</button></div></div>`;
  }
  function bindImport(el) {
    el.querySelectorAll("[data-lmxi]").forEach(b => b.onclick = () => {
      if (b.dataset.lmxi === "x") { UI.imp = null; redraw(); return; }
      const I = UI.imp; if (!I) return;
      run("master", d => { const ch = []; I.ch.forEach(c => c.apply(d, ch)); return ch; },
        "import " + I.file, () => { UI.imp = null; });
    });
  }
  async function importXlsx(file) {
    const lb = L();
    try {
      const book = await XLSX.read(await file.arrayBuffer());
      const sheet = book.filter(s => /^master$/i.test(s.name))[0] || book.filter(s => s.rows[0] && s.rows[0].indexOf("Code") >= 0 && s.rows[0].indexOf("Model") >= 0)[0];
      if (!sheet) { UI.imp = { err: tr("i_sheet") }; redraw(); return; }
      const H = sheet.rows[0].map(x => String(x || "").trim());
      const col = n => H.indexOf(n);
      const ch = [], skip = [];
      const baseM = lb.base().MODELS, baseG = lb.base().GRADES;
      const NUM = { "System capacity L": "cap", "Refill L": "rf", "Site interval h": "iv", "OEM interval h": "ivo" };
      sheet.rows.slice(1).forEach((r, i) => {
        const cls = String(r[col("Class")] || "").trim(), m = String(r[col("Model")] || "").trim(), k = String(r[col("Code")] || "").trim();
        if (!m || !k) return;
        const key = lb.key(m, cls) || (lb.of(m, cls) ? cls + "|" + m : null);
        const M = key && lb.of(key.slice(key.indexOf("|") + 1), key.slice(0, key.indexOf("|")));
        const c = M && M.comps.filter(x => x.k === k)[0];
        if (!c) { skip.push(m + " " + k); return; }
        const b = ((baseM[key] || { comps: [] }).comps.filter(x => x.k === k)[0]) || {};
        const add = (f, v, label) => {
          const now = c[f] == null ? "" : String(c[f]); if (v === now) return;
          const bV = b[f] == null ? "" : String(b[f]);
          const val = NUM_F[f] && v !== "" ? Number(v) : v;
          ch.push({ label: M.m + " " + k + " " + label, from: now, to: v,
                    apply: (d, out) => setAt(d, ["comps", key, k], f, v === bV ? undefined : val, out, c[f] == null ? null : c[f]) });
        };
        const NUM_F = { cap: 1, rf: 1, iv: 1, ivo: 1 };
        Object.keys(NUM).forEach(h => { if (col(h) < 0) return;
          let v = r[col(h)]; v = v == null ? "" : String(v).trim().replace(",", ".");
          if (v !== "" && !isFinite(Number(v))) return;
          if (v !== "") v = String(Number(v));
          add(NUM[h], v, h); });
        if (col("OEM specification") >= 0) add("oem", String(r[col("OEM specification")] || "").trim(), "OEM");
        if (col("Grade") >= 0) { const g = String(r[col("Grade")] || "").trim();
          if (g && !lb.grade(g)) skip.push(m + " " + k + " (" + g + ")"); else add("g", g, "grade"); }
      });
      const gs = book.filter(s => /^grades$/i.test(s.name))[0];
      if (gs) {
        const GH = gs.rows[0].map(x => String(x || "").trim()), gc = n => GH.indexOf(n);
        gs.rows.slice(1).forEach(r => {
          const g = String(r[gc("Grade")] || "").trim(); if (!g || !lb.grade(g)) return;
          [["Approved product", "primary"], ["Alternative", "alt"]].forEach(([h, f]) => { if (gc(h) < 0) return;
            const v = String(r[gc(h)] || "").trim(), now = lb.grades[g][f] || "", b = (baseG[g] || {})[f] || "";
            if (v === now) return;
            ch.push({ label: g + " " + h, from: now, to: v, apply: (d, out) => setAt(d, ["grades", g], f, v === b ? undefined : v, out, now) });
          });
        });
      }
      UI.imp = { file: file.name, ch, skip };
    } catch (e) { UI.imp = { err: tr("i_bad", { e: (e && e.message) || e }) }; }
    redraw();
  }

  /* ── a small .xlsx writer and reader ──────────────────────────────────
     No library: a workbook is a zip of XML. Written STORED (uncompressed),
     read with the browser's own DecompressionStream, so nothing is fetched
     from anywhere and the office does not depend on a CDN. */
  const XLSX = (function () {
    const CRC = (() => { const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
      return t; })();
    const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    const enc = s => new TextEncoder().encode(s);
    const x = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    function zip(files) {
      const parts = [], central = []; let off = 0;
      files.forEach(f => {
        const name = enc(f.name), data = f.data, crc = crc32(data);
        const h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
        h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
        h.setUint16(26, name.length, true);
        parts.push(new Uint8Array(h.buffer), name, data);
        const c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
        c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
        c.setUint16(28, name.length, true); c.setUint32(42, off, true);
        central.push(new Uint8Array(c.buffer), name);
        off += 30 + name.length + data.length;
      });
      const csize = central.reduce((s, p) => s + p.length, 0);
      const e = new DataView(new ArrayBuffer(22));
      e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
      e.setUint32(12, csize, true); e.setUint32(16, off, true);
      return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]),
        { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    }
    const colName = i => { let s = ""; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
    function write(sheets) {
      /* Styles: 0 plain, 1 bold header, then one solid fill per colour used. */
      const colours = [];
      sheets.forEach(s => (s.fills || []).forEach(h => { const c = String(h || "").replace("#", "").toUpperCase(); if (c && colours.indexOf(c) < 0) colours.push(c); }));
      const lum = h => { const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return .299 * r + .587 * g + .114 * b; };
      const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="${3 + colours.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/><bgColor indexed="64"/></patternFill></fill>` +
        colours.map(c => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`).join("") + `</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${2 + colours.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
        colours.map((c, i) => `<xf numFmtId="0" fontId="${lum(c) < 140 ? 2 : 1}" fillId="${3 + i}" borderId="0" xfId="0" applyFont="1" applyFill="1"/>`).join("") + `</cellXfs>
</styleSheet>`;
      const files = [];
      const sheetXml = s => {
        const cols = (s.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
        const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => {
          const ref = colName(ci) + (ri + 1);
          let st = ri === 0 ? 1 : 0;
          if (ri > 0 && s.fillCol === ci && s.fills && s.fills[ri - 1]) {
            const c = String(s.fills[ri - 1]).replace("#", "").toUpperCase(); st = 2 + colours.indexOf(c); }
          if (typeof v === "number" && isFinite(v)) return `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
          if (v === "" || v == null) return st ? `<c r="${ref}" s="${st}"/>` : "";
          return `<c r="${ref}" t="inlineStr" s="${st}"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
        }).join("") + `</row>`).join("");
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
          (cols ? `<cols>${cols}</cols>` : "") + `<sheetData>${rows}</sheetData>` +
          (s.rows.length > 1 ? `<autoFilter ref="A1:${colName(s.rows[0].length - 1)}${s.rows.length}"/>` : "") + `</worksheet>`;
      };
      files.push({ name: "[Content_Types].xml", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") + `</Types>`) });
      files.push({ name: "_rels/.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) });
      files.push({ name: "xl/workbook.xml", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        sheets.map((s, i) => `<sheet name="${x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + `</sheets></workbook>`) });
      files.push({ name: "xl/_rels/workbook.xml.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) });
      files.push({ name: "xl/styles.xml", data: enc(styles) });
      sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(sheetXml(s)) }));
      return zip(files);
    }
    async function unzip(buf) {
      const u8 = new Uint8Array(buf), dv = new DataView(buf);
      let eo = -1;
      for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; }
      if (eo < 0) throw new Error("not a zip");
      const n = dv.getUint16(eo + 10, true); let p = dv.getUint32(eo + 16, true);
      const out = {};
      for (let i = 0; i < n; i++) {
        if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("bad zip directory");
        const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true);
        const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
        const lo = dv.getUint32(p + 42, true);
        const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
        p += 46 + nl + xl + cl;
        const lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true);
        const data = u8.subarray(lo + 30 + lnl + lxl, lo + 30 + lnl + lxl + csz);
        out[name] = { method, data };
      }
      return out;
    }
    async function inflate(e) {
      if (e.method === 0) return e.data;
      if (e.method !== 8) throw new Error("compression " + e.method);
      if (typeof DecompressionStream === "undefined") throw new Error("this browser cannot unpack .xlsx");
      const s = new Blob([e.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(s).arrayBuffer());
    }
    const colIdx = ref => { const m = /^([A-Z]+)/.exec(ref); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
    async function read(buf) {
      const z = await unzip(buf);
      const txt = async n => z[n] ? new TextDecoder().decode(await inflate(z[n])) : null;
      const dom = s => new DOMParser().parseFromString(s, "application/xml");
      const allT = el => Array.from(el.getElementsByTagName("t")).map(t => t.textContent).join("");
      const ss = []; const sst = await txt("xl/sharedStrings.xml");
      if (sst) Array.from(dom(sst).getElementsByTagName("si")).forEach(si => ss.push(allT(si)));
      const wb = dom(await txt("xl/workbook.xml"));
      const rels = dom(await txt("xl/_rels/workbook.xml.rels"));
      const target = {}; Array.from(rels.getElementsByTagName("Relationship")).forEach(r => { target[r.getAttribute("Id")] = r.getAttribute("Target"); });
      const out = [];
      for (const sh of Array.from(wb.getElementsByTagName("sheet"))) {
        const rid = sh.getAttribute("r:id") || sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
        let t = target[rid] || ""; t = t.replace(/^\/?xl\//, "").replace(/^\//, "");
        const x2 = await txt("xl/" + t); if (!x2) continue;
        const rows = [];
        Array.from(dom(x2).getElementsByTagName("row")).forEach(r => {
          const ri = Number(r.getAttribute("r")) - 1, row = [];
          Array.from(r.getElementsByTagName("c")).forEach(c => {
            const ty = c.getAttribute("t"), v = c.getElementsByTagName("v")[0];
            let val = "";
            if (ty === "s") val = ss[Number(v && v.textContent)] || "";
            else if (ty === "inlineStr") val = allT(c);
            else if (ty === "b") val = v && v.textContent === "1";
            else if (v) { const s = v.textContent; val = ty === "str" || ty === "e" ? s : (isFinite(Number(s)) ? Number(s) : s); }
            row[colIdx(c.getAttribute("r"))] = val;
          });
          rows[ri] = row;
        });
        out.push({ name: sh.getAttribute("name"), rows: Array.from(rows, r => r || []) });
      }
      return out;
    }
    return { write, read };
  })();

  /* ── styles, once ───────────────────────────────────────────────────── */
  function css() {
    if (document.getElementById("lmxCss")) return;
    const s = document.createElement("style"); s.id = "lmxCss";
    s.textContent = `
.lmx-status{font-size:12.5px;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin:10px 0}
.lmx-status.ok{border-left:3px solid var(--good)}.lmx-status.bad{border-left:3px solid var(--critical);color:var(--crit-ink)}
.lmx-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0}
.lmx-who{display:inline-flex;gap:6px;align-items:center;font-size:12.5px;color:var(--muted)}
.lmx-in{font:inherit;font-size:13px;color:var(--ink);background:var(--surface);border:1px solid var(--axis);border-radius:6px;padding:5px 7px;min-width:0}
.lmx-in.num{width:74px;text-align:right;font-variant-numeric:tabular-nums}
.lmx-in:focus-visible,.lmx-mrow:focus-visible,.lmx-opt:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.lmx-msg{font-size:12.5px;color:var(--ink-2)}
.lmx-file{position:relative;overflow:hidden;display:inline-flex;align-items:center}
.lmx-file input{position:absolute;inset:0;opacity:0;cursor:pointer}
.lmx-two{display:grid;grid-template-columns:minmax(200px,260px) 1fr;gap:14px;align-items:start}
@media (max-width:900px){.lmx-two{grid-template-columns:1fr}}
.lmx-list{display:flex;flex-direction:column;gap:8px}
.lmx-seg{align-self:flex-start}
.lmx-models{display:flex;flex-direction:column;max-height:560px;overflow:auto;border:1px solid var(--border);border-radius:8px;background:var(--surface)}
.lmx-mrow{all:unset;cursor:pointer;display:flex;flex-direction:column;gap:2px;padding:7px 10px;border-bottom:1px solid var(--grid)}
.lmx-mrow b{font-size:13px;color:var(--ink);font-weight:600}.lmx-mrow i{font-style:normal;font-size:11.5px;color:var(--muted)}
.lmx-mrow:hover{background:var(--surface-2)}.lmx-mrow.on{background:color-mix(in srgb,var(--accent) 12%,var(--surface));box-shadow:inset 3px 0 0 var(--accent)}
.lmx-dot{display:inline-block;min-width:16px;padding:0 4px;border-radius:8px;background:var(--warning);color:#16242c;font-weight:700;text-align:center}
.lmx-edhd{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;margin:2px 0 8px}.lmx-edhd h3{margin:0;font-size:17px}
.lmx-chip{font-size:11.5px;font-weight:700;padding:2px 7px;border-radius:5px;background:var(--surface-3);color:var(--ink-2)}
.lmx-tbl td{vertical-align:middle}.lmx-tbl td.num,.lmx-tbl th.num{text-align:right;font-variant-numeric:tabular-nums}
.lmx-code b{font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
.lmx-sw{display:inline-flex;align-items:center;justify-content:center;min-width:44px;padding:2px 6px;border-radius:5px;font:700 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;border:1px solid rgba(22,36,44,.25);white-space:nowrap}
.lmx-sw.big{min-width:80px;padding:5px 8px;font-size:12px}.lmx-sw-none{background:transparent;color:var(--muted);border-style:dashed}
.lmx-gsel{display:flex;gap:6px;align-items:center}.lmx-gsel select{width:22px;padding:5px 2px}
.lmx-prod b{display:block;font-weight:600;font-size:12.5px}.lmx-prod i,.lmx-seen i,.lmx-src{display:block;font-style:normal;font-size:11.5px;color:var(--muted)}
.lmx-seen .ok{color:var(--good-ink);font-weight:600}.lmx-seen .bad{color:var(--crit-ink);font-weight:600}.lmx-seen .warn{color:var(--warn-ink);font-weight:600}
.lmx-flag{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 6px;margin:1px 2px 1px 0;border-radius:4px;background:color-mix(in srgb,var(--warning) 30%,var(--surface));color:var(--warn-ink)}
tr.lmx-edited td:first-child{box-shadow:inset 3px 0 0 var(--accent)}
.lmx-hist{margin-top:14px}.lmx-hist summary{cursor:pointer;font-weight:600;color:var(--ink-2)}
.lmx-histl{font-size:12.5px;color:var(--ink-2);margin:8px 0;padding-left:20px;max-height:280px;overflow:auto}
.lmx-mig{font-size:12.5px;background:color-mix(in srgb,var(--warning) 22%,var(--surface));padding:6px 10px;border-radius:8px}
.lmx-imp{border:1px solid var(--accent);border-radius:8px;padding:10px 12px;margin:10px 0;background:var(--surface)}.lmx-imp.bad{border-color:var(--critical)}
.lmx-dlist{display:flex;flex-direction:column;gap:10px}
.lmx-dec{border:1px solid var(--border);border-radius:10px;padding:10px 12px;background:var(--surface)}
.lmx-dec.done{background:var(--surface-2)}
.lmx-dwhat{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;margin-bottom:8px}.lmx-dwhat i{font-style:normal;font-size:12px;color:var(--muted)}
.lmx-dopts{display:flex;flex-wrap:wrap;gap:8px}
.lmx-opt{all:unset;cursor:pointer;display:inline-flex;gap:8px;align-items:center;border:1px solid var(--axis);border-radius:8px;padding:6px 9px;background:var(--surface)}
.lmx-opt:hover:not([disabled]){border-color:var(--accent)}.lmx-opt.cur{box-shadow:0 0 0 2px var(--accent)}.lmx-opt[disabled]{cursor:default;opacity:.85}
.lmx-osrc{font-size:12px;color:var(--ink-2)}.lmx-opick{font-size:11.5px;font-weight:700;color:var(--accent)}
.lmx-dnote{margin-top:8px;width:min(420px,100%)}.lmx-dres{margin-top:8px;font-size:12.5px;color:var(--good-ink)}
.lmx-kpis{margin:10px 0}.lmx-oils select{width:100%;max-width:210px}.lmx-oils td:nth-child(2){max-width:150px}.lmx-sm{padding:4px 8px;font-size:12px;margin-left:6px}
.lmx-warn{color:var(--warn-ink);font-weight:700}
.lmx-h3{margin:22px 0 4px;font-size:15px}.lmx-sno{font-size:12.5px}
.lmx-alias input{width:100%}
.lmx-srccell{min-width:170px}.lmx-srccell input{width:120px}.lmx-srccell .lmx-page{width:46px;margin-left:4px}
#lmxPrint{display:none}
@media print{body.lmx-printing>*:not(#lmxPrint){display:none!important}body.lmx-printing #lmxPrint{display:block!important}
 #lmxPrint{color:#000;font-family:Arial,Helvetica,sans-serif}
 .lmx-wall h1,.lmx-form h1{font-size:22pt;margin:0 0 4pt}.lmx-wgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8pt;margin-top:10pt}
 .lmx-wcard{border:4pt solid;border-radius:6pt;display:flex;break-inside:avoid}.lmx-wsw{min-width:70pt;display:flex;align-items:center;justify-content:center;font:700 16pt Arial;-webkit-print-color-adjust:exact;print-color-adjust:exact}
 .lmx-wbody{padding:5pt 7pt;display:flex;flex-direction:column;gap:2pt;font-size:9.5pt}.lmx-wbody b{font-size:11pt}
 .lmx-fhd{display:flex;justify-content:space-between;font-size:10pt}.lmx-fmeta,.lmx-ftbl{width:100%;border-collapse:collapse;font-size:9.5pt;margin:6pt 0}
 .lmx-ftbl th,.lmx-ftbl td{border:0.7pt solid #000;padding:4pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
}`;
    document.head.appendChild(s);
  }

  root.CMLube = {
    init(opts) { HOST = Object.assign(HOST, opts || {}); css(); },
    load, save, state: () => S, doc: () => S.doc,
    /* Draw into the four panels the host page provides. */
    mount(els, active) { Object.assign(EL, els || {}); if (active !== undefined) UI.active = active; css(); redraw(); },
    show(active) { if (UI.active === active) return; UI.active = active; redraw(); },
    redraw,
    DOC, XLSX,
    _ui: UI,
  };
})(window);
