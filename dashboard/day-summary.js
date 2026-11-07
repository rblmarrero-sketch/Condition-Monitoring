/* CM_DAYSUM_V1 - Day summary for the end-of-day e-mail (Rickie 04.11.2026 00:21 site):
   "usually they send the report what they did in the day ... select the round, and create a summary table.
    Date inspected, unit number, component number, type of defect, description, defect number, priority,
    severity. If its normal it will be selected but without the defect only severity. Its like a body of the
    email but in a table, then they attached the report they did on that round."

   Loaded by both office pages (dashboard/ and dashboard-next/). It reads the page's own records (RECS) and the
   page's own rules for a grade (sevOf, GRADE) and a priority (prioName), so a number here can never differ from
   the same round on Equipment History. It changes nothing: it only reads, and copies a table to the clipboard.

   One row per position. A position with a finding carries the defect, the inspector's words, the defect / WO
   number and the priority. A Normal position carries the severity only. A round with many measured points
   (undercarriage, tray, GET) lists every point that is not Normal and ONE line for the Normal ones, so the
   e-mail stays short. A position nobody recorded (no grade, no photo, no defect, no comment) is left out. */
(function () {
  'use strict';
  var W = {
    en: {
      h: 'Day summary for the e-mail',
      sub: 'Pick the days and the rounds. Copy the subject and the report into the e-mail, then attach the round reports.',
      day: 'Date inspected', who: 'Inspector', all: 'Everyone', rounds: 'Rounds',
      none: 'No rounds on this day.', pick: 'Tick at least one round.',
      copy: 'Copy for e-mail', csv: 'Export CSV', copied: 'Copied. Paste it into the e-mail body.',
      copyfail: 'Could not copy. Select the table and press Ctrl+C.',
      c_date: 'Date inspected', c_unit: 'Unit', c_comp: 'Component', c_type: 'Type of defect',
      c_desc: 'Description', c_no: 'Defect no.', c_ex: 'Existing defect', nodef: 'Not raised in 1C', c_prio: 'Priority', c_sev: 'Severity',
      normal_n: '{n} other points', meas: '{n} points measured', worst: 'Worst: {p}', intro: 'Condition monitoring, {d}: {r} round(s), {u} unit(s), {f} finding(s).',
      byline: 'Inspected by: {p}', foot: 'Reports of each round attached.', all_on: 'All', all_off: 'None',
      sel: '{n} of {m} rounds'
    },
    ru: {
      h: 'Итог дня для письма',
      sub: 'Выберите дни и обходы. Скопируйте тему и отчёт в письмо и приложите отчёты обходов.',
      day: 'Дата осмотра', who: 'Инспектор', all: 'Все', rounds: 'Обходы',
      none: 'В этот день обходов нет.', pick: 'Отметьте хотя бы один обход.',
      copy: 'Копировать для письма', csv: 'Экспорт CSV', copied: 'Скопировано. Вставьте в текст письма.',
      copyfail: 'Не удалось скопировать. Выделите таблицу и нажмите Ctrl+C.',
      c_date: 'Дата осмотра', c_unit: 'Единица', c_comp: 'Узел', c_type: 'Тип дефекта',
      c_desc: 'Описание', c_no: '№ дефекта', c_ex: 'Существующий дефект', nodef: 'Нет в 1С', c_prio: 'Приоритет', c_sev: 'Критичность',
      normal_n: 'Остальные точки: {n}', meas: 'Замерено точек: {n}', worst: 'Худшие: {p}', intro: 'Мониторинг состояния, {d}: обходов {r}, единиц {u}, дефектов {f}.',
      byline: 'Осмотр провёл: {p}', foot: 'Отчёты по каждому обходу приложены.', all_on: 'Все', all_off: 'Ни одного',
      sel: '{n} из {m} обходов'
    }
  };
  var S = { day: '', from: '', to: '', who: '', off: {}, lang: lsGet('cm_daymail_lang') || 'both', every: lsGet('cm_daymail_every') === '1' };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (x) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (x) {} }
  function L() { return (typeof lang !== 'undefined' && lang === 'ru') ? 'ru' : 'en'; }
  function w(k, v) { var s = (W[L()][k] || W.en[k] || k); if (v) for (var x in v) s = s.split('{' + x + '}').join(v[x]); return s; }
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function recs() {
    var all = (typeof RECS !== 'undefined' && RECS) || [];
    return all.filter(function (r) { return r && !r._void && r.date && !(typeof isDeleted === 'function' && isDeleted(r)); });
  }
  function rk(r) { return (typeof ekOf === 'function' ? ekOf(r) : (r.equip + '|' + r.date + '|' + r.type)); }
  function typeName(t) { try { return (typeof TYPE_LABEL !== 'undefined' && TYPE_LABEL[t]) || t; } catch (x) { return t; } }
  function sevName(n) { try { return n ? GRADE.name(n, L()) : ''; } catch (x) { return n ? String(n) : ''; } }
  function grade(r, i) { try { return typeof sevOf === 'function' ? sevOf(r, i) : (i.grade || 0); } catch (x) { return 0; } }
  function prio(i) { if (!i.prio) return ''; try { var p = prioName(i.prio, L()); return /^P\d/.test(p) ? p : i.prio + ' ' + p; } catch (x) { return i.prio; } }
  function isGeneral(i) { return !i || i.general || i.key === 'MACHINE' || i.key === '__general'; }
  function recorded(r, i) { return grade(r, i) || i.defect || i.defectCode || i.comment || i.photos; }
  /* CM_DAYSUM_V2 (Rickie 04.11): the number column is the DEFECT raised in 1C for the finding (DD-...),
     never the work order the round was walked against - every position carries that one, so it said
     nothing about the finding. A finding is matched to a defect in 1C's Defects raised list
     (CM_WO_DATA.cmWorkOrders): same unit, raised on the inspection day or up to DEF_DAYS after it, the
     same system code (EX007.HS.MP <-> HS.MP). What is left over pairs up only when exactly one finding and
     one defect remain (a magnetic plug's code is not 1C's). Each defect is used once. */
  var DEF_DAYS = 7;
  function addDays(d, n) { var t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function defectsOf(r) {
    var all = (window.CM_WO_DATA && window.CM_WO_DATA.cmWorkOrders) || [];
    var u = String(r.equip || '').toUpperCase(), to = addDays(r.date, DEF_DAYS);
    return all.filter(function (d) {
      var on = String(d.raised || d.date || '').slice(0, 10);
      return d && d.defect && String(d.asset || '').toUpperCase() === u && on >= r.date && on <= to;
    });
  }
  function sysHas(d, key) {
    if (!key) return false;
    var s = String(d.system || '').toUpperCase(), k = String(key).toUpperCase();
    return s.indexOf('.' + k + ' ') >= 0 || s.indexOf('.' + k + '(') >= 0 || s.slice(-k.length - 1) === '.' + k;
  }
  function matchDefects(r, finds, used) {
    var cand = defectsOf(r).filter(function (d) { return !used[d.defect]; }), got = new Map();
    finds.forEach(function (i) {
      var d = cand.find(function (x) { return !used[x.defect] && sysHas(x, i.key); });
      if (d) { got.set(i, d); used[d.defect] = 1; }
    });
    var leftF = finds.filter(function (i) { return !got.has(i); }), leftD = cand.filter(function (d) { return !used[d.defect]; });
    if (leftF.length === 1 && leftD.length === 1) { got.set(leftF[0], leftD[0]); used[leftD[0].defect] = 1; }
    return got;
  }
  function prio1c(d) { var m = /^(P\d)\s*(.*)$/.exec(String(d.priority || '').trim()); return m ? (m[1] + ' ' + m[2].replace(/[()]/g, '')).trim() : (d.priority || ''); }
  function type1c(d) { return String(d.defectType || '').trim(); }
  /* the table rows for the chosen rounds */
  /* CM_DAYSUM_V3 (Rickie 04.11): a measured round (Dump body liner, Undercarriage) is not listed station by
     station - 40 rows of F31..F95 bury the e-mail. It gives one row per defect raised in 1C against that
     system (dump body CH.BY / CH.BED, undercarriage CH.UC / CH.ROL / TRK / IDL / SPR), with the round's
     worst severity; with no such defect, ONE line: how many points were measured and the worst of them,
     saying "Not raised in 1C" when the worst is Degraded or worse, so a Critical tray never drops out. */
  var WEAR_SYS = { TB: /\.CH\.(BY|BED)\b/i, UC: /\.CH\.(UC|ROL|TRK|IDL|SPR)\b/i };
  function wearRows(r, its, used, out) {
    var re = WEAR_SYS[r.type], g = 0, worst = [];
    its.forEach(function (i) { var x = grade(r, i); if (x > g) g = x; });
    its.filter(function (i) { return grade(r, i) === g && g > 1; }).forEach(function (i) { worst.push(i.key || i.label); });
    var ds = defectsOf(r).filter(function (d) { return !used[d.defect] && re.test(String(d.system || '')); });
    var base = { rk: rk(r), type0: r.type, wear: 1, pts: its.length, date: r.date, unit: r.equip, round: typeName(r.type), by: r.by || '', g: g, sev: sevName(g) };
    var wl = worst.length ? w('worst', { p: worst.slice(0, 6).join(', ') + (worst.length > 6 ? ' +' + (worst.length - 6) : '') }) : '';
    if (ds.length) ds.forEach(function (d) { used[d.defect] = 1;
      out.push(Object.assign({}, base, { comp: String(d.system || '').replace(/^[^.]+\./, ''), type: type1c(d), desc: d.descr || '',
        no: d.defect, nodef: false, st: d.status || '', prio: prio1c(d) })); });
    else out.push(Object.assign({}, base, { measLine: 1, worstKeys: worst, comp: w('meas', { n: its.length }), type: '', desc: wl,
      no: g >= 3 ? w('nodef') : '', nodef: g >= 3, st: '', prio: '' }));
  }
  function rowsFor(list) {
    var out = [], used = {};
    list = list.slice().sort(function (a, b) { return (WEAR_SYS[b.type] ? 1 : 0) - (WEAR_SYS[a.type] ? 1 : 0); });
    var wearDone = {};
    list.forEach(function (r) {
      if (WEAR_SYS[r.type]) { var wi = (r.items || []).filter(function (i) { return !isGeneral(i) && grade(r, i); });
        if (wi.length) { wearRows(r, wi, used, out); wearDone[rk(r)] = 1; } }
    });
    var wearOut = out; out = [];
    list.forEach(function (r) {
      if (wearDone[rk(r)]) return;
      var its = (r.items || []).filter(function (i) { return !isGeneral(i) && recorded(r, i); });
      var bad = its.filter(function (i) { return grade(r, i) > 1 || i.defect || i.defectCode; });
      var ok = its.filter(function (i) { return bad.indexOf(i) < 0; });
      var many = its.length > 12;
      var dd = matchDefects(r, bad.filter(function (i) { return grade(r, i) >= 3 || i.defect || i.defectCode; }), used);
      its.forEach(function (i) {
        if (many && ok.indexOf(i) >= 0) return;
        var g = grade(r, i), f = bad.indexOf(i) >= 0, d = dd.get(i);
        var need = f && (g >= 3 || i.defect || i.defectCode);
        out.push({ rk: rk(r), type0: r.type, key: i.key || '', date: r.date, unit: r.equip, round: typeName(r.type), comp: (i.key && String(i.label || '').indexOf(i.key) !== 0 ? i.key + ' ' : '') + (i.label || ''),
          type: f ? ((d && type1c(d)) || i.defect || i.defectCode || '') : '', desc: f ? (i.comment || (d && d.descr) || '') : '', cmt: i.comment || '',
          no: d ? d.defect : (need ? w('nodef') : ''), nodef: !d && need, st: d ? (d.status || '') : '',
          prio: f ? ((d && prio1c(d)) || prio(i)) : '', sev: sevName(g), g: g, by: r.by || '' });
      });
      if (many && ok.length) out.push({ rk: rk(r), type0: r.type, nOk: ok.length, keys: ok.map(function (i) { return i.key || ''; }), date: r.date, unit: r.equip, round: typeName(r.type), comp: w('normal_n', { n: ok.length }),
        type: '', desc: '', no: '', prio: '', sev: sevName(1), g: 1, by: r.by || '' });
    });
    var all = out.concat(wearOut);
    /* CM_DAYMAIL_V1: worst first, then the newest day, then the unit */
    return all.sort(function (a, b) { return (b.g || 0) - (a.g || 0) || String(b.date).localeCompare(String(a.date)) || String(a.unit).localeCompare(String(b.unit)); });
  }
  /* CM_DAYMAIL_V1 (Rickie 04.11.2026 15:25 site): "Can they select multiple dates, and can you create a body of
     RU/EN. Also make the table header (en/ru). Act as a copywriter. The goal is to email these to all maintenance,
     make it clean and professional, if critical highlight it. Arrange based on criticality ... Is it possible to
     flag if repeat failure or previous defect were created?" and "Include in the email where they can view more
     details online." Mock-up approved 15:41 ("Proceed"); the e-mail he sends today was the model (greeting, unit, finding, defect no., link).
     The e-mail is built from tables and inline styles only (Outlook keeps nothing else): a title band, five count
     tiles, an ACTION REQUIRED box when a point is Critical, the findings worst first, one line per round for what
     was inspected and found normal, a box with the links to the dashboard (every unit number links to its
     Equipment History), who inspected, and a one-line key. Language: EN + RU (default), EN or RU. */
  var DASH_URL = 'https://maintenance.vegadevelopment.com/cm/dashboard-next/';
  var REPEAT_DAYS = 180;
  var M = {
    en: { title: 'Condition Monitoring — Daily Report', hello: 'Good day, colleagues. Below are the condition monitoring results; the report of each round is attached.',
      rounds: 'rounds', units: 'units', act: 'ACTION REQUIRED', find: 'Findings', worst: 'worst first', clean: 'Inspected — no findings',
      t_sev: 'Severity', t_date: 'Date', t_unit: 'Unit · round', t_comp: 'Component', t_def: 'Defect · description', t_no: 'Defect no. · priority', t_ex: 'Existing defect', ex_cited: 'from the comment', ex_st: 'Status in 1C', ex_by: 'Registered by', ex_on: 'Date', ex_noby: 'not filled in 1C',
      nodef: 'Not raised in 1C', rep: 'Repeat', rep_cm: '{g} on {d}', rep_1c: 'earlier defect {n} ({s})', pts: '{n} points', meas: '{n} points measured', worstK: 'worst: {p}',
      others: 'other points normal', online: 'View more details online', online_t: 'Photos, full readings and each unit’s history are on the CM dashboard. Click a unit number to open its Equipment History.',
      open: 'Open the CM dashboard', net: 'Company network or VPN', by: 'Inspected by', att: 'The report of each round is attached.',
      key: 'Severity per ISO 14224: 1 Normal · 2 Incipient · 3 Degraded · 4 Severe · 5 Critical', key_rep: 'Repeat = the same point had a finding or a 1C defect in the last {n} days',
      subj: 'CM daily report', subj_ok: 'no defects', nofind: 'No findings: every inspected point is normal.',
      ok_MP: 'Magnetic drain plugs inspected: ferromagnetic deposits within the operating standard.', ok_FC: 'Oil filter control section: no wear particles found.',
      ok_INSP: 'General inspection: no defects found.', ok_UC: 'Undercarriage measurements within the operating standard.', ok_TB: 'Dump body liner thickness within limits.',
      ok_GET: 'Ground engaging tools within wear limits.', ok_TEMP: 'Temperatures within limits.', ok_LUBE: 'Lubrication audit: no deviations.', ok_: 'No defects found.' },
    ru: { title: 'Мониторинг состояния — ежедневный отчёт', hello: 'Добрый день, коллеги. Ниже результаты мониторинга состояния; отчёт по каждому обходу приложен.',
      rounds: 'обходов', units: 'единиц', act: 'ТРЕБУЮТСЯ ДЕЙСТВИЯ', find: 'Замечания', worst: 'по степени критичности', clean: 'Осмотрено — без замечаний',
      t_sev: 'Критичность', t_date: 'Дата', t_unit: 'Единица · обход', t_comp: 'Узел', t_def: 'Дефект · описание', t_no: '№ дефекта · приоритет', t_ex: 'Существующий дефект', ex_cited: 'из комментария', ex_st: 'Статус в 1С', ex_by: 'Зарегистрировал', ex_on: 'Дата', ex_noby: 'не заполнено в 1С',
      nodef: 'Нет в 1С', rep: 'Повтор', rep_cm: '{g} от {d}', rep_1c: 'ранее дефект {n} ({s})', pts: 'точек: {n}', meas: 'замерено точек: {n}', worstK: 'худшие: {p}',
      others: 'остальные точки в норме', online: 'Подробности онлайн', online_t: 'Фото, все замеры и история каждой единицы — на панели мониторинга состояния. Нажмите номер единицы, чтобы открыть её историю.',
      open: 'Открыть панель МС', net: 'Сеть компании или VPN', by: 'Осмотр провели', att: 'Отчёт по каждому обходу приложен.',
      key: 'Критичность по ISO 14224: 1 Норма · 2 Начальное · 3 Ухудшенное · 4 Серьёзное · 5 Критическое', key_rep: 'Повтор = на этой точке было замечание или дефект в 1С за последние {n} дней',
      subj: 'Отчёт МС', subj_ok: 'без дефектов', nofind: 'Замечаний нет: все осмотренные точки в норме.',
      ok_MP: 'Магнитные пробки осмотрены: ферромагнитные отложения в пределах нормы.', ok_FC: 'Контрольный разрез масляного фильтра: частиц износа не обнаружено.',
      ok_INSP: 'Общий осмотр: дефектов не выявлено.', ok_UC: 'Замеры ходовой части в пределах нормы.', ok_TB: 'Толщина футеровки кузова в пределах допуска.',
      ok_GET: 'Рабочий инструмент в пределах износа.', ok_TEMP: 'Температуры в пределах нормы.', ok_LUBE: 'Аудит смазки: отклонений нет.', ok_: 'Дефектов не выявлено.' }
  };
  var TILE = { 5: ['#fdecea', '#b3261e', '#b3261e'], 4: ['#fdf0e8', '#c4520f', '#a33d00'], 3: ['#fdf6e6', '#d9890c', '#8a5a00'], 2: ['#fbf8e6', '#c9a227', '#6b5a10'], 1: ['#eaf5ee', '#2e7d4f', '#1d6b3a'] };
  var PILL = { 5: ['#b3261e', '#fff'], 4: ['#c4520f', '#fff'], 3: ['#d9890c', '#fff'], 2: ['#e9c46a', '#3d3200'], 1: ['#2e7d4f', '#fff'] };
  var ROWBG = { 5: '#fdecea', 4: '#fdf3ec' };
  function langs() { return S.lang === 'en' ? ['en'] : S.lang === 'ru' ? ['ru'] : ['en', 'ru']; }
  function m(l, k, v) { var s = (M[l][k] != null ? M[l][k] : M.en[k] != null ? M.en[k] : k); if (v) for (var x in v) s = s.split('{' + x + '}').join(v[x]); return s; }
  /* one text in the chosen languages: inline "EN · RU", or stacked with the second line quieter */
  function bi(k, v, stack, ink) {
    var L2 = langs(); if (L2.length === 1) return e(m(L2[0], k, v));
    return e(m('en', k, v)) + (stack ? '<br><span style="font-weight:400;color:' + (ink || '#5b6670') + '">' : ' · ') + e(m('ru', k, v)) + (stack ? '</span>' : '');
  }
  function biText(k, v) { return langs().map(function (l) { return m(l, k, v); }).join(' · '); }
  function typeIn(t, l) { try { return (I18N[l] && I18N[l]['type_' + t]) || t; } catch (x) { return t; } }
  function typeBi(t) { var L2 = langs(); return L2.map(function (l) { return typeIn(t, l); }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(' / '); }
  function gName(n, l) { try { return GRADE.name(n, l); } catch (x) { return String(n); } }
  function gAct(n, l) { try { return GRADE.action(n, l); } catch (x) { return ''; } }
  function gBi(n) { return langs().map(function (l) { return gName(n, l); }).join(' · '); }
  function dmy(d) { var x = String(d || ''); return x.length >= 10 ? x.slice(8, 10) + '.' + x.slice(5, 7) + '.' + x.slice(0, 4) : x; }
  function dm(d) { var x = String(d || ''); return x.length >= 10 ? x.slice(8, 10) + '.' + x.slice(5, 7) : x; }
  function span() { return S.from === S.to ? dmy(S.from) : (S.from.slice(0, 7) === S.to.slice(0, 7) ? S.from.slice(8, 10) : dmy(S.from).slice(0, 5)) + '–' + dmy(S.to); }
  function link(u) { return '<a href="' + e(DASH_URL + '#equipment?eq=' + encodeURIComponent(u)) + '" style="color:#16304F;font-weight:700;text-decoration:underline">' + e(u) + '</a>'; }
  /* repeat: the same unit and point had a finding graded 2 or worse, or a 1C defect on the same system, in the
     REPEAT_DAYS before this round. Both are said; the CM history says the grade and the day, 1C the number. */
  function repeatOf(x) {
    if (!x.g || x.g < 2) return null;
    var from = addDays(x.date, -REPEAT_DAYS), u = String(x.unit || '').toUpperCase(), cm = null, dd = null;
    ((typeof RECS !== 'undefined' && RECS) || []).forEach(function (r) {
      if (!r || r._void || String(r.equip || '').toUpperCase() !== u || !(r.date < x.date) || r.date < from) return;
      if (x.wear) { if (r.type !== x.type0) return; var gg = 0; (r.items || []).forEach(function (i) { if (!isGeneral(i)) gg = Math.max(gg, grade(r, i)); });
        if (gg >= 3 && (!cm || r.date > cm.d)) cm = { d: r.date, g: gg }; return; }
      (r.items || []).forEach(function (i) { if (isGeneral(i) || !x.key || i.key !== x.key) return; var g = grade(r, i);
        if (g >= 2 && (!cm || r.date > cm.d)) cm = { d: r.date, g: g }; });
    });
    var sysKey = x.wear ? String(x.comp || '').split(' ')[0] : x.key;
    ((window.CM_WO_DATA && window.CM_WO_DATA.cmWorkOrders) || []).forEach(function (d) {
      var on = String(d.raised || d.date || '').slice(0, 10);
      if (!d || !d.defect || d.defect === x.no || String(d.asset || '').toUpperCase() !== u || !(on < x.date) || on < from || !sysHas(d, sysKey)) return;
      if (!dd || on > dd.d) dd = { d: on, n: d.defect, s: d.status || '' };
    });
    return (cm || dd) ? { cm: cm, dd: dd } : null;
  }
  function repText(rp, l) {
    var p = []; if (rp.cm) p.push(m(l, 'rep_cm', { g: rp.cm.g + ' ' + gName(rp.cm.g, l), d: dm(rp.cm.d) }));
    if (rp.dd) p.push(m(l, 'rep_1c', { n: rp.dd.n, s: rp.dd.s || dm(rp.dd.d) }));
    return p.join('; ');
  }
  /* CM_EXISTDEF_V1 (Rickie 08.11.2026): "sometimes they find a defect, come to the office to raise it in 1C and find
     it is already raised by another supervisor; they put that number in the comment. Add a column: existing defect."
     Two sources, both shown: a defect number the inspector wrote in the finding's comment (DD-…, any number of
     digits), looked up in 1C for its status and owner; and any defect raised in 1C by someone else on the same unit
     and system, raised on or before the inspection and still open (CM_WO_DATA.otherDefects, from the ingester).
     A finding with an existing defect is no longer flagged "Not raised in 1C". */
  var EX_MAX = 3;
  function exOpen(d) { return !/complet|выполн|closed|закры/i.test(String(d.status || '')); }
  function exKey(n) { var m2 = /^([A-Za-zА-Яа-я]{2,})\s*-?\s*0*(\d+)$/.exec(String(n || '').trim()); return m2 ? m2[1].toUpperCase().replace('ДД', 'DD') + '-' + m2[2] : ''; }
  function existOf(x) {
    if (!((x.g || 0) >= 2 || x.type)) return [];
    var D = window.CM_WO_DATA || {}, other = D.otherDefects || [], all = other.concat(D.cmWorkOrders || []), by = {};
    all.forEach(function (d) { if (d && d.defect) { var k = exKey(d.defect); if (k && !by[k]) by[k] = d; } });
    var out = [], seen = {}; if (x.no && !x.nodef) seen[exKey(x.no)] = 1;
    (String(x.cmt || '').match(/(?:DD|GD|ДД)\s*-?\s*\d{3,}/gi) || []).forEach(function (t) {
      var k = exKey(t.replace(/\s+/g, '')); if (!k || seen[k]) return; seen[k] = 1; var d = by[k];
      out.push({ n: d ? d.defect : t.replace(/\s+/g, '').toUpperCase(), s: d ? (d.status || '') : '', by: d ? (d.regBy || '') : '', know: !!d, on: d ? String(d.raised || d.date || '').slice(0, 10) : '', cited: 1 });
    });
    var u = String(x.unit || '').toUpperCase(), sysKey = x.wear ? String(x.comp || '').split(' ')[0] : x.key;
    other.forEach(function (d) {
      if (out.length >= EX_MAX || !d || !d.defect) return;
      var k = exKey(d.defect), on = String(d.raised || '').slice(0, 10);
      if (seen[k] || String(d.asset || '').toUpperCase() !== u || !on || on > x.date || !exOpen(d) || !sysHas(d, sysKey)) return;
      seen[k] = 1; out.push({ n: d.defect, s: d.status || '', by: d.regBy || '', on: on, know: true });
    });
    return out.slice(0, EX_MAX);
  }
  function exText(ex) { var l = L(); return ex.map(function (d) { var a = [];
    if (d.s) a.push(m(l, 'ex_st') + ': ' + d.s); if (d.know) a.push(m(l, 'ex_by') + ': ' + (d.by || m(l, 'ex_noby'))); if (d.on) a.push(m(l, 'ex_on') + ': ' + dm(d.on));
    return d.n + (a.length ? ' (' + a.join('; ') + ')' : ''); }).join('; '); }
  function repBi(rp) { var L2 = langs(); return '↻ ' + L2.map(function (l) { return m(l, 'rep'); }).join(' · ') + ': ' + repText(rp, L2[0]) + (L2.length > 1 && repText(rp, 'en') !== repText(rp, 'ru') ? ' · ' + repText(rp, 'ru') : ''); }
  /* split the rows into findings (anything graded 2 or worse, or carrying a defect) and the clean lines */
  function shape(rows, list) {
    var finds = rows.filter(function (x) { return (x.g || 0) >= 2 || x.type || x.nodef; });
    var cleanBy = {};
    rows.forEach(function (x) { if (finds.indexOf(x) >= 0) return; var c = cleanBy[x.rk] || (cleanBy[x.rk] = { keys: [], n: 0 }); c.n += x.nOk || x.pts || 1; c.keys = c.keys.concat(x.keys || (x.key ? [x.key] : [])); c.row = c.row || x; });
    var hasFind = {}; finds.forEach(function (x) { hasFind[x.rk] = 1; });
    var clean = list.filter(function (r) { return cleanBy[rk(r)]; }).map(function (r) { var c = cleanBy[rk(r)];
      return { r: r, n: c.n, keys: c.keys.filter(Boolean), partial: !!hasFind[rk(r)], rows: rows.filter(function (x) { return x.rk === rk(r) && finds.indexOf(x) < 0; }) }; })
      .sort(function (a, b) { return String(b.r.date).localeCompare(String(a.r.date)) || String(a.r.equip).localeCompare(String(b.r.equip)); });
    finds.forEach(function (x) { x.rep = repeatOf(x); x.ex = existOf(x); if (x.ex.length && x.nodef) { x.nodef = false; x.no = ''; } });
    var cnt = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    finds.forEach(function (x) { if (x.g >= 1 && x.g <= 5) cnt[x.g]++; });
    clean.forEach(function (c) { cnt[1] += c.n; });
    return { finds: finds, clean: clean, cnt: cnt };
  }
  function subject(sh) {
    var L2 = langs(), c = sh.cnt;
    return L2.map(function (l) { var p = [];
      [5, 4, 3].forEach(function (g) { if (c[g]) p.push(c[g] + ' ' + gName(g, l)); });
      return m(l, 'subj') + ' ' + span() + ' — ' + (p.length ? p.join(', ') : m(l, 'subj_ok'));
    }).join(' · ');
  }
  var F = 'font-family:Arial,Helvetica,sans-serif;';
  function mailHtml(rows, list) {
    var sh = shape(rows, list), L2 = langs(), units = {}, people = {};
    list.forEach(function (r) { units[r.equip] = 1; if (r.by) people[r.by] = 1; });
    var h = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:980px">';
    h += '<tr><td style="' + F + 'font-size:14px;color:#16212a;padding:0 0 10px">' + bi('hello', null, true) + '</td></tr>';
    h += '<tr><td style="background:#16304F;padding:16px 20px;border-bottom:4px solid #C2531F">' +
      '<div style="' + F + 'font-size:11px;font-weight:700;letter-spacing:2px;color:#f0a26b">BAIMSKAYA COPPER PROJECT · HME RELIABILITY</div>' +
      '<div style="' + F + 'font-size:22px;font-weight:700;color:#ffffff;margin-top:4px">' + e(m(L2[0], 'title')) + '</div>' +
      (L2.length > 1 ? '<div style="' + F + 'font-size:15px;color:#c9d6e3;margin-top:2px">' + e(m('ru', 'title')) + '</div>' : '') +
      '<div style="' + F + 'font-size:14px;font-weight:700;color:#ffffff;margin-top:8px">' + e(span()) + ' &nbsp;·&nbsp; ' + list.length + ' ' + e(L2.map(function (l) { return m(l, 'rounds'); }).join(' / ')) +
      ' &nbsp;·&nbsp; ' + Object.keys(units).length + ' ' + e(L2.map(function (l) { return m(l, 'units'); }).join(' / ')) + '</div></td></tr>';
    /* count tiles */
    h += '<tr><td style="padding:14px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:6px 0"><tr>' +
      [5, 4, 3, 2, 1].map(function (g) { var t = TILE[g];
        return '<td width="20%" style="background:' + t[0] + ';border-left:5px solid ' + t[1] + ';padding:10px 12px">' +
          '<div style="' + F + 'font-size:26px;font-weight:700;color:' + t[2] + '">' + sh.cnt[g] + '</div>' +
          '<div style="' + F + 'font-size:12px;font-weight:700;color:' + t[2] + '">' + e(gName(g, L2[0]).toUpperCase()) + '</div>' +
          (L2.length > 1 ? '<div style="' + F + 'font-size:12px;color:#3d474f">' + e(gName(g, 'ru')) + '</div>' : '') + '</td>'; }).join('') +
      '</tr></table></td></tr>';
    /* the Critical box */
    var crit = sh.finds.filter(function (x) { return x.g === 5; });
    if (crit.length) {
      h += '<tr><td style="padding:14px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td data-ds="crit" style="background:#b3261e;padding:12px 16px">' +
        '<div style="' + F + 'font-size:15px;font-weight:700;color:#ffffff">⚠ ' + e(L2.map(function (l) { return m(l, 'act'); }).join(' · ')) + '</div>' +
        crit.map(function (x) {
          var what = [x.comp, x.type, x.desc].filter(Boolean).join(' — ');
          return '<div style="' + F + 'font-size:14px;color:#ffffff;margin-top:6px"><a href="' + e(DASH_URL + '#equipment?eq=' + encodeURIComponent(x.unit)) + '" style="color:#ffffff;font-weight:700;text-decoration:underline">' + e(x.unit) + '</a> ' +
            e(what) + '. ' + e(L2.map(function (l) { return gAct(5, l); }).join(' · ')) + (x.no && !x.nodef ? '. ' + e(x.no) + (x.prio ? ' · ' + e(x.prio) : '') : '') + '</div>' +
            (x.rep ? '<div style="' + F + 'font-size:13px;font-weight:700;color:#ffe08a;margin-top:2px">' + e(repBi(x.rep)) + '</div>' : '');
        }).join('') + '</td></tr></table></td></tr>';
    }
    /* findings, worst first */
    var TH = 'style="' + F + 'text-align:left;padding:7px 8px;border-bottom:2px solid #16304F;font-size:12px;font-weight:700;color:#16212a;background:#f6f7f8"';
    h += '<tr><td style="padding:18px 0 6px"><div style="' + F + 'font-size:15px;font-weight:700;color:#16212a;border-left:4px solid #C2531F;padding-left:8px">' + bi('find') +
      ' <span style="font-weight:400;font-size:13px;color:#5b6670">— ' + bi('worst') + '</span></div></td></tr>';
    if (sh.finds.length) {
      h += '<tr><td><table data-ds="find" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><thead><tr>' +
        ['t_sev', 't_date', 't_unit', 't_comp', 't_def', 't_no', 't_ex'].map(function (k) { return '<th ' + TH + '>' + bi(k, null, true) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        sh.finds.map(function (x) {
          var bg = ROWBG[x.g] || '#ffffff', p = PILL[x.g] || PILL[3];
          var TD = 'style="' + F + 'font-size:13px;color:#16212a;padding:8px;border-bottom:1px solid #e3e7ea;vertical-align:top;background:' + bg + '"';
          var wk = x.worstKeys || [], wp = wk.slice(0, 6).join(', ') + (wk.length > 6 ? ' +' + (wk.length - 6) : '');
          var comp = x.measLine ? e(L2.map(function (l) { return m(l, 'meas', { n: x.pts }); }).join(' · ')) : e(x.comp);
          var desc = x.measLine ? (wk.length ? L2.map(function (l) { return m(l, 'worstK', { p: wp }); }).join(' · ') : '') : x.desc;
          var def = (x.type ? '<b>' + e(x.type) + '</b>' : '') + (desc ? (x.type ? '<br>' : '') + e(desc) : '') +
            (x.g >= 3 ? '<br><span style="color:#3d474f">→ ' + e(L2.map(function (l) { return gAct(x.g, l); }).join(' · ')) + '</span>' : '') +
            (x.rep ? '<br><span style="color:#a33d00;font-weight:700">' + e(repBi(x.rep)) + '</span>' : '');
          var no = x.nodef ? '<span style="color:#a33d00;font-weight:700">' + bi('nodef', null, true, '#a33d00') + '</span>' : (x.no ? '<b>' + e(x.no) + '</b>' + (x.prio ? '<br>' + e(x.prio) : '') : (x.prio ? e(x.prio) : '—'));
          /* 08.11: labelled. The name is who REGISTERED the defect in 1C (Contact person initiator WR, regBy), never
             Responsible person -- that is often a CM name on a defect a mechanic registered (Rickie 08.11 09:15). */
          var exL = function (k) { return '<span style="color:#5b6670;font-size:12px">' + e(L2.map(function (l) { return m(l, k); }).join(' · ')) + ':</span> '; };
          var ex = (x.ex || []).map(function (d) { return '<b>' + e(d.n) + '</b>' + (d.s ? '<br>' + exL('ex_st') + '<span style="color:#3d474f">' + e(d.s) + '</span>' : '') +
            (d.know ? '<br>' + exL('ex_by') + (d.by ? '<span style="color:#16212a;font-weight:600">' + e(d.by) + '</span>' : '<span style="color:#5b6670">' + e(L2.map(function (l) { return m(l, 'ex_noby'); }).join(' · ')) + '</span>') : '') +
            (d.on ? '<br>' + exL('ex_on') + '<span style="color:#3d474f">' + e(dm(d.on)) + '</span>' : '') +
            (d.cited ? '<br><span style="color:#5b6670;font-size:12px">' + e(L2.map(function (l) { return m(l, 'ex_cited'); }).join(' · ')) + '</span>' : ''); }).join('<br><br>') || '—';
          return '<tr><td ' + TD + '><span style="background:' + p[0] + ';color:' + p[1] + ';' + F + 'font-size:12px;font-weight:700;padding:3px 8px;white-space:nowrap">' + x.g + ' ' + e(gName(x.g, L2[0])) + '</span>' +
            (L2.length > 1 ? '<div style="' + F + 'font-size:11px;color:#5b6670;margin-top:3px">' + e(gName(x.g, 'ru')) + '</div>' : '') + '</td>' +
            '<td ' + TD + '>' + e(dm(x.date)) + '</td><td ' + TD + '>' + link(x.unit) + ' · ' + e(typeBi(x.type0)) + '</td><td ' + TD + '>' + comp + '</td><td ' + TD + '>' + (def || '—') + '</td><td ' + TD + '>' + no + '</td><td ' + TD + '>' + ex + '</td></tr>';
        }).join('') + '</tbody></table></td></tr>';
    } else h += '<tr><td style="' + F + 'font-size:13px;color:#1d6b3a;padding:4px 0">✓ ' + bi('nofind') + '</td></tr>';
    /* inspected, nothing found */
    if (sh.clean.length) {
      var TC = 'style="' + F + 'font-size:13px;color:#16212a;padding:6px 8px;border-bottom:1px solid #e3e7ea;vertical-align:top"';
      h += '<tr><td style="padding:18px 0 6px"><div style="' + F + 'font-size:15px;font-weight:700;color:#16212a;border-left:4px solid #2e7d4f;padding-left:8px">' + bi('clean') + '</div></td></tr>';
      h += '<tr><td><table data-ds="clean" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">';
      sh.clean.forEach(function (c) {
        var r = c.r, ok = '<span style="color:#1d6b3a;font-weight:700;white-space:nowrap">✓ 1 ' + e(gName(1, L2[0])) + '</span>';
        if (S.every && c.rows.length) c.rows.forEach(function (x) {
          h += '<tr><td ' + TC + ' width="120">' + ok + '</td><td ' + TC + ' width="56">' + e(dm(r.date)) + '</td><td ' + TC + ' width="230">' + link(r.equip) + ' · ' + e(typeBi(r.type)) + '</td><td ' + TC + '>' + e(x.comp) + '</td></tr>'; });
        else {
          var line = c.partial ? L2.map(function (l) { return m(l, 'others'); }).join(' · ') : L2.map(function (l) { return m(l, 'ok_' + (M.en['ok_' + r.type] ? r.type : '')); }).join(' ');
          var pts = c.keys.length && c.keys.length <= 12 ? ' (' + c.keys.join(', ') + ')' : (c.n > 1 ? ' (' + L2.map(function (l) { return m(l, 'pts', { n: c.n }); }).join(' / ') + ')' : '');
          h += '<tr><td ' + TC + ' width="120">' + ok + '</td><td ' + TC + ' width="56">' + e(dm(r.date)) + '</td><td ' + TC + ' width="230">' + link(r.equip) + ' · ' + e(typeBi(r.type)) + '</td><td ' + TC.replace('color:#16212a', 'color:#3d474f') + '>' + e(line + pts) + '</td></tr>';
        }
      });
      h += '</table></td></tr>';
    }
    /* online */
    h += '<tr><td style="padding:16px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="background:#f1f4f7;border:1px solid #dde2e6;padding:14px 16px">' +
      '<div style="' + F + 'font-size:14px;font-weight:700;color:#16212a">' + bi('online') + '</div>' +
      '<div style="' + F + 'font-size:13px;color:#3d474f;margin-top:4px">' + bi('online_t', null, true) + '</div>' +
      '<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px"><tr><td style="background:#16304F;padding:9px 16px"><a href="' + e(DASH_URL + '#overview') + '" style="' + F + 'font-size:13px;font-weight:700;color:#ffffff;text-decoration:none">' + bi('open') + ' →</a></td>' +
      '<td style="' + F + 'padding-left:12px;font-size:12px;color:#5b6670"><a href="' + e(DASH_URL + '#overview') + '" style="color:#5b6670">' + e(DASH_URL) + '</a><br>' + bi('net') + '</td></tr></table></td></tr></table></td></tr>';
    var p = Object.keys(people);
    h += '<tr><td style="' + F + 'font-size:13px;color:#3d474f;padding:14px 0 0">' + (p.length ? bi('by') + ': ' + e(p.join(', ')) + '<br>' : '') + bi('att') + '</td></tr>';
    h += '<tr><td style="' + F + 'font-size:11px;color:#8a949c;padding:10px 0 0;border-top:1px solid #e3e7ea">' + bi('key') + ' &nbsp;|&nbsp; ↻ ' + bi('key_rep', { n: REPEAT_DAYS }) + '</td></tr>';
    return h + '</table>';
  }
  function mailText(rows, list) {
    var sh = shape(rows, list), L2 = langs(), out = [];
    out.push(biText('hello'), '', subject(sh), '');
    if (sh.finds.length) { out.push(biText('find').toUpperCase());
      sh.finds.forEach(function (x) { out.push('[' + x.g + ' ' + gBi(x.g) + '] ' + dm(x.date) + ' ' + x.unit + ' · ' + typeBi(x.type0) + ' — ' + [x.comp, x.type, x.desc].filter(Boolean).join(' — ') +
        (x.no ? ' — ' + (x.nodef ? biText('nodef') : x.no + (x.prio ? ' ' + x.prio : '')) : '') + (x.ex && x.ex.length ? ' — ' + biText('t_ex') + ': ' + exText(x.ex) : '') + (x.rep ? ' — ' + repBi(x.rep) : '')); }); out.push(''); }
    if (sh.clean.length) { out.push(biText('clean').toUpperCase());
      sh.clean.forEach(function (c) { out.push('✓ ' + dm(c.r.date) + ' ' + c.r.equip + ' · ' + typeBi(c.r.type) + (c.keys.length ? ' (' + c.keys.join(', ') + ')' : '')); }); out.push(''); }
    out.push(biText('online') + ': ' + DASH_URL + '#overview', biText('att'));
    return out.join('\n');
  }
  function chosen(dayList) { return dayList.filter(function (r) { return !S.off[rk(r)]; }); }
  function siteToday() { return new Date(Date.now() + 12 * 3600e3).toISOString().slice(0, 10); }
  function mondayOf(d) { var t = new Date(d + 'T00:00:00Z'), w = (t.getUTCDay() + 6) % 7; return addDays(d, -w); }
  var QUICK = { today: function (n) { return [n, n]; }, yday: function (n) { var y = addDays(n, -1); return [y, y]; }, d3: function (n) { return [addDays(n, -2), n]; }, week: function (n) { return [mondayOf(n), n]; } };
  var QW = { en: { today: 'Today', yday: 'Yesterday', d3: 'Last 3 days', week: 'This week', from: 'From', to: 'To', lang: 'E-mail language', every: 'List every Normal point', subj: 'Copy subject', subjok: 'Subject copied.', subjL: 'Subject' },
    ru: { today: 'Сегодня', yday: 'Вчера', d3: 'Последние 3 дня', week: 'Эта неделя', from: 'С', to: 'По', lang: 'Язык письма', every: 'Каждая точка «Норма» отдельной строкой', subj: 'Копировать тему', subjok: 'Тема скопирована.', subjL: 'Тема' } };
  function q2(k) { return (QW[L()] || QW.en)[k]; }
  function draw() {
    var box = document.getElementById('daySum'); if (!box) return;
    var all = recs();
    var days = Object.keys(all.reduce(function (o, r) { o[r.date] = 1; return o; }, {})).sort().reverse();
    if (S.day && !S.from) { S.from = S.to = S.day; }
    if (!S.to || (days.length && !all.some(function (r) { return r.date >= S.from && r.date <= S.to; }) && !S.pinned)) { S.from = S.to = days[0] || ''; }
    if (S.from > S.to) { var tmp = S.from; S.from = S.to; S.to = tmp; }
    S.day = S.to;
    var inSpan = all.filter(function (r) { return r.date >= S.from && r.date <= S.to; });
    var people = Object.keys(inSpan.reduce(function (o, r) { if (r.by) o[r.by] = 1; return o; }, {})).sort();
    if (S.who && people.indexOf(S.who) < 0) S.who = '';
    var dayList = inSpan.filter(function (r) { return !S.who || r.by === S.who; })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(a.equip).localeCompare(String(b.equip)) || String(a.type).localeCompare(String(b.type)); });
    var list = chosen(dayList), rows = rowsFor(list);
    var opts = function (v) { var ds = days.slice(0, 120); if (v && ds.indexOf(v) < 0) ds = [v].concat(ds).sort().reverse();
      return ds.map(function (d) { return '<option value="' + e(d) + '"' + (d === v ? ' selected' : '') + '>' + e(dmy(d)) + '</option>'; }).join(''); };
    var seg = function (id, items, on) { return '<span class="seg dsSeg" id="' + id + '">' + items.map(function (it) { return '<button type="button" data-v="' + it[0] + '" aria-pressed="' + (it[0] === on) + '"' + (it[0] === on ? ' class="on"' : '') + '>' + e(it[1]) + '</button>'; }).join('') + '</span>'; };
    var h = '<div class="secthd"><h2>' + e(w('h')) + '</h2></div><p class="sub dsSub">' + e(w('sub')) + '</p>';
    h += '<div class="ddbar dsBar">' +
      '<label class="fld"><span>' + e(q2('from')) + '</span><select id="dsFrom">' + opts(S.from) + '</select></label>' +
      '<label class="fld"><span>' + e(q2('to')) + '</span><select id="dsDay">' + opts(S.to) + '</select></label>' +
      '<span class="fld"><span>&nbsp;</span>' + seg('dsQuick', [['today', q2('today')], ['yday', q2('yday')], ['d3', q2('d3')], ['week', q2('week')]], S.quick || '') + '</span>' +
      '<label class="fld"><span>' + e(w('who')) + '</span><select id="dsWho"><option value="">' + e(w('all')) + '</option>' +
      people.map(function (p) { return '<option' + (p === S.who ? ' selected' : '') + ' data-1c>' + e(p) + '</option>'; }).join('') + '</select></label>' +
      '<span class="fld"><span>' + e(q2('lang')) + '</span>' + seg('dsLang', [['both', 'EN + RU'], ['en', 'EN'], ['ru', 'RU']], S.lang) + '</span></div>';
    h += '<div class="ddbar dsBar"><button type="button" class="btn primary" id="dsCopy"' + (list.length ? '' : ' disabled') + '>' + e(w('copy')) + '</button>' +
      '<button type="button" class="btn ghost" id="dsSubj"' + (list.length ? '' : ' disabled') + '>' + e(q2('subj')) + '</button>' +
      '<button type="button" class="btn ghost" id="dsCsv"' + (rows.length ? '' : ' disabled') + '>' + e(w('csv')) + '</button>' +
      '<label class="dsEvery"><input type="checkbox" id="dsEvery"' + (S.every ? ' checked' : '') + '> ' + e(q2('every')) + '</label></div>';
    if (!dayList.length) { box.innerHTML = h + '<div class="empty">' + e(w('none')) + '</div>'; wire(box, dayList, rows, list); return; }
    h += '<div class="dsRounds"><b>' + e(w('rounds')) + '</b> <span class="muted">' + e(w('sel', { n: list.length, m: dayList.length })) + '</span> ' +
      '<button type="button" class="minibtn" data-dsall="1">' + e(w('all_on')) + '</button> <button type="button" class="minibtn" data-dsall="0">' + e(w('all_off')) + '</button><div class="dsChips">' +
      dayList.map(function (r) { var k = rk(r);
        return '<label class="dsChip"><input type="checkbox" data-dsk="' + e(k) + '"' + (S.off[k] ? '' : ' checked') + '> ' + (S.from !== S.to ? '<span class="muted">' + e(dm(r.date)) + '</span> ' : '') + '<b>' + e(r.equip) + '</b> ' + e(typeName(r.type)) + (r.by ? ' <span class="muted" data-1c>' + e(r.by) + '</span>' : '') + '</label>';
      }).join('') + '</div></div>';
    if (!list.length) { box.innerHTML = h + '<div class="empty">' + e(w('pick')) + '</div>'; wire(box, dayList, rows, list); return; }
    h += '<div class="dsSubjLine"><b>' + e(q2('subjL')) + ':</b> <span id="dsSubjTxt">' + e(subject(shape(rows, list))) + '</span></div>';
    h += '<div class="tblwrap dsPrev" id="dsPrev">' + mailHtml(rows, list) + '</div><p class="sub" id="dsMsg" role="status"></p>';
    box.innerHTML = h; wire(box, dayList, rows, list);
  }
  function wire(box, dayList, rows, list) {
    var q = function (id) { return document.getElementById(id); };
    if (q('dsDay')) q('dsDay').onchange = function () { S.to = this.value; S.quick = ''; S.pinned = 1; S.off = {}; draw(); };
    if (q('dsFrom')) q('dsFrom').onchange = function () { S.from = this.value; S.quick = ''; S.pinned = 1; S.off = {}; draw(); };
    box.querySelectorAll('#dsQuick [data-v]').forEach(function (b) { b.onclick = function () { var r = QUICK[b.dataset.v](siteToday()); S.from = r[0]; S.to = r[1]; S.quick = b.dataset.v; S.pinned = 1; S.off = {}; draw(); }; });
    box.querySelectorAll('#dsLang [data-v]').forEach(function (b) { b.onclick = function () { S.lang = b.dataset.v; lsSet('cm_daymail_lang', S.lang); draw(); }; });
    if (q('dsEvery')) q('dsEvery').onchange = function () { S.every = this.checked; lsSet('cm_daymail_every', S.every ? '1' : '0'); draw(); };
    if (q('dsWho')) q('dsWho').onchange = function () { S.who = this.value; draw(); };
    box.querySelectorAll('[data-dsk]').forEach(function (c) { c.onchange = function () { S.off[c.dataset.dsk] = !c.checked; draw(); }; });
    box.querySelectorAll('[data-dsall]').forEach(function (b) { b.onclick = function () { dayList.forEach(function (r) { S.off[rk(r)] = b.dataset.dsall === '0'; }); draw(); }; });
    var msgOf = function (k) { var msg = q('dsMsg'); return function (ok) { if (msg) msg.textContent = ok ? k : w('copyfail'); }; };
    if (q('dsCopy')) q('dsCopy').onclick = function () { clip(mailHtml(rows, list), mailText(rows, list), msgOf(w('copied'))); };
    if (q('dsSubj')) q('dsSubj').onclick = function () { clip(null, subject(shape(rows, list)), msgOf(q2('subjok'))); };
    if (q('dsCsv')) q('dsCsv').onclick = function () {
      var C = [['date', 'c_date'], ['unit', 'c_unit'], ['comp', 'c_comp'], ['type', 'c_type'], ['desc', 'c_desc'], ['no', 'c_no'], ['prio', 'c_prio'], ['sev', 'c_sev']];
      var lines = [C.map(function (c) { return w(c[1]); }).concat(['Round', 'Repeat', w('c_ex')]).join(',')].concat(rows.map(function (x) {
        var rp = x.rep || repeatOf(x);
        return C.map(function (c) { return x[c[0]] || ''; }).concat([x.round, rp ? repText(rp, L()) : '', exText(x.ex || existOf(x))]).map(function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',');
      }));
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
      a.download = 'cm_day_summary_' + S.from + (S.to !== S.from ? '_' + S.to : '') + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    };
  }
  function clip(html, text, done) {
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        var it = { 'text/plain': new Blob([text], { type: 'text/plain' }) }; if (html) it['text/html'] = new Blob([html], { type: 'text/html' });
        navigator.clipboard.write([new ClipboardItem(it)]).then(function () { done(true); }, function () { done(legacy(html || e(text))); });
      } else done(legacy(html || e(text)));
    } catch (x) { done(legacy(html || e(text))); }
  }
  function legacy(html) {
    try {
      var d = document.createElement('div'); d.contentEditable = 'true'; d.style.position = 'fixed'; d.style.left = '-9999px'; d.innerHTML = html;
      document.body.appendChild(d); var r = document.createRange(); r.selectNodeContents(d); var s = getSelection(); s.removeAllRanges(); s.addRange(r);
      var ok = document.execCommand('copy'); s.removeAllRanges(); d.remove(); return ok;
    } catch (x) { return false; }
  }
  function ensure() {
    if (document.getElementById('daySum')) return true;
    var anchor = document.getElementById('relPanel'); if (!anchor) return false;
    var s = document.createElement('div'); s.className = 'section'; s.id = 'daySum'; s.style.marginTop = 'var(--s4,16px)';
    anchor.parentNode.insertBefore(s, anchor);
    var st = document.createElement('style'); st.id = 'daySumCss';
    st.textContent = '#daySum .dsBar{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin:8px 0}' +
      '#daySum .dsSeg{display:inline-flex;flex-wrap:wrap}#daySum .dsEvery{display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;min-height:32px}' +
      '@media (max-width:899px){#daySum .dsEvery{min-height:44px}#daySum .dsPrev a{display:inline-block;min-height:32px;line-height:32px}}' +
      '#daySum .dsRounds{margin:6px 0 10px}#daySum .dsChips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}' +
      '#daySum .dsChip{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line,#d5dbe0);border-radius:7px;padding:4px 8px;font-size:13px;cursor:pointer}' +
      '#daySum .dsSubjLine{font-size:13px;margin:6px 0;overflow-wrap:anywhere}' +
      '#daySum .dsPrev{background:#fff;color:#1b232a;padding:14px;border:1px solid var(--line,#d5dbe0);border-radius:8px;overflow:auto}';
    document.head.appendChild(st);
    return true;
  }
  window.daySumShow = function () { if (ensure()) draw(); };
  window.CMDaySum = { rowsFor: rowsFor, mailHtml: mailHtml, mailText: mailText, shape: shape, subject: subject, repeatOf: repeatOf, state: S, draw: function () { window.daySumShow(); } };
})();
