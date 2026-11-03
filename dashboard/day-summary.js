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
      sub: 'Pick a day and the rounds. Copy the table into the e-mail, then attach the round reports.',
      day: 'Date inspected', who: 'Inspector', all: 'Everyone', rounds: 'Rounds',
      none: 'No rounds on this day.', pick: 'Tick at least one round.',
      copy: 'Copy table for e-mail', csv: 'Export CSV', copied: 'Table copied. Paste it into the e-mail.',
      copyfail: 'Could not copy. Select the table and press Ctrl+C.',
      c_date: 'Date inspected', c_unit: 'Unit', c_comp: 'Component', c_type: 'Type of defect',
      c_desc: 'Description', c_no: 'Defect / WO no.', c_prio: 'Priority', c_sev: 'Severity',
      normal_n: '{n} other points', intro: 'Condition monitoring, {d}: {r} round(s), {u} unit(s), {f} finding(s).',
      byline: 'Inspected by: {p}', foot: 'Reports of each round attached.', all_on: 'All', all_off: 'None',
      sel: '{n} of {m} rounds'
    },
    ru: {
      h: 'Итог дня для письма',
      sub: 'Выберите день и обходы. Скопируйте таблицу в письмо и приложите отчёты обходов.',
      day: 'Дата осмотра', who: 'Инспектор', all: 'Все', rounds: 'Обходы',
      none: 'В этот день обходов нет.', pick: 'Отметьте хотя бы один обход.',
      copy: 'Копировать таблицу для письма', csv: 'Экспорт CSV', copied: 'Таблица скопирована. Вставьте её в письмо.',
      copyfail: 'Не удалось скопировать. Выделите таблицу и нажмите Ctrl+C.',
      c_date: 'Дата осмотра', c_unit: 'Единица', c_comp: 'Узел', c_type: 'Тип дефекта',
      c_desc: 'Описание', c_no: '№ дефекта / наряда', c_prio: 'Приоритет', c_sev: 'Критичность',
      normal_n: 'Остальные точки: {n}', intro: 'Мониторинг состояния, {d}: обходов {r}, единиц {u}, дефектов {f}.',
      byline: 'Осмотр провёл: {p}', foot: 'Отчёты по каждому обходу приложены.', all_on: 'Все', all_off: 'Ни одного',
      sel: '{n} из {m} обходов'
    }
  };
  var S = { day: '', who: '', off: {} };
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
  /* the table rows for the chosen rounds */
  function rowsFor(list) {
    var out = [];
    list.forEach(function (r) {
      var its = (r.items || []).filter(function (i) { return !isGeneral(i) && recorded(r, i); });
      var bad = its.filter(function (i) { return grade(r, i) > 1 || i.defect || i.defectCode; });
      var ok = its.filter(function (i) { return bad.indexOf(i) < 0; });
      var many = its.length > 12;
      its.forEach(function (i) {
        if (many && ok.indexOf(i) >= 0) return;
        var g = grade(r, i), f = bad.indexOf(i) >= 0;
        out.push({ date: r.date, unit: r.equip, round: typeName(r.type), comp: (i.key && String(i.label || '').indexOf(i.key) !== 0 ? i.key + ' ' : '') + (i.label || ''),
          type: f ? (i.defect || i.defectCode || '') : '', desc: f ? (i.comment || '') : '', no: f ? (i.wo || '') : '',
          prio: f ? prio(i) : '', sev: sevName(g), g: g, by: r.by || '' });
      });
      if (many && ok.length) out.push({ date: r.date, unit: r.equip, round: typeName(r.type), comp: w('normal_n', { n: ok.length }),
        type: '', desc: '', no: '', prio: '', sev: sevName(1), g: 1, by: r.by || '' });
    });
    return out;
  }
  var COLS = [['date', 'c_date'], ['unit', 'c_unit'], ['comp', 'c_comp'], ['type', 'c_type'], ['desc', 'c_desc'], ['no', 'c_no'], ['prio', 'c_prio'], ['sev', 'c_sev']];
  var INK = { 1: '#1d6b3a', 2: '#4a6b1d', 3: '#8a5a00', 4: '#a33d00', 5: '#a32020' };
  /* the e-mail table: plain inline styles only, because a mail program keeps nothing else */
  function mailHtml(rows, list) {
    var units = {}, f = 0, people = {};
    list.forEach(function (r) { units[r.equip] = 1; if (r.by) people[r.by] = 1; });
    rows.forEach(function (x) { if (x.type || x.g > 1) f++; });
    var th = 'style="border:1px solid #9aa4ad;background:#e9edf1;padding:4px 8px;text-align:left;font:600 13px Arial,sans-serif"';
    var td = 'style="border:1px solid #c3cad1;padding:4px 8px;vertical-align:top;font:13px Arial,sans-serif"';
    var h = '<p style="font:14px Arial,sans-serif;margin:0 0 6px">' + e(w('intro', { d: S.day, r: list.length, u: Object.keys(units).length, f: f })) + '</p>';
    var p = Object.keys(people); if (p.length) h += '<p style="font:14px Arial,sans-serif;margin:0 0 8px">' + e(w('byline', { p: p.join(', ') })) + '</p>';
    h += '<table style="border-collapse:collapse"><thead><tr>' + COLS.map(function (c) { return '<th ' + th + '>' + e(w(c[1])) + '</th>'; }).join('') + '</tr></thead><tbody>';
    h += rows.map(function (x) {
      return '<tr>' + COLS.map(function (c) {
        var v = x[c[0]];
        if (c[0] === 'unit') v = x.unit + (x.round ? ' · ' + x.round : '');
        var st = c[0] === 'sev' && x.g ? td.replace('"', '"color:' + INK[x.g] + ';font-weight:600;') : td;
        return '<td ' + st + '>' + e(v || (c[0] === 'sev' ? '' : '—')) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    h += '</tbody></table><p style="font:14px Arial,sans-serif;margin:8px 0 0">' + e(w('foot')) + '</p>';
    return h;
  }
  function mailText(rows) {
    return [COLS.map(function (c) { return w(c[1]); }).join('\t')].concat(rows.map(function (x) {
      return COLS.map(function (c) { return c[0] === 'unit' ? x.unit + (x.round ? ' · ' + x.round : '') : (x[c[0]] || ''); }).join('\t');
    })).join('\n');
  }
  function chosen(dayList) { return dayList.filter(function (r) { return !S.off[rk(r)]; }); }
  function draw() {
    var box = document.getElementById('daySum'); if (!box) return;
    var all = recs();
    var days = Object.keys(all.reduce(function (o, r) { o[r.date] = 1; return o; }, {})).sort().reverse();
    if (!S.day || days.indexOf(S.day) < 0) S.day = days[0] || '';
    var onDay = all.filter(function (r) { return r.date === S.day; });
    var people = Object.keys(onDay.reduce(function (o, r) { if (r.by) o[r.by] = 1; return o; }, {})).sort();
    if (S.who && people.indexOf(S.who) < 0) S.who = '';
    var dayList = onDay.filter(function (r) { return !S.who || r.by === S.who; })
      .sort(function (a, b) { return String(a.equip).localeCompare(String(b.equip)) || String(a.type).localeCompare(String(b.type)); });
    var list = chosen(dayList), rows = rowsFor(list);
    var h = '<div class="secthd"><h2>' + e(w('h')) + '</h2></div><p class="sub dsSub">' + e(w('sub')) + '</p>';
    h += '<div class="ddbar dsBar"><label class="fld"><span>' + e(w('day')) + '</span><select id="dsDay">' +
      days.slice(0, 60).map(function (d) { return '<option' + (d === S.day ? ' selected' : '') + '>' + e(d) + '</option>'; }).join('') + '</select></label>' +
      '<label class="fld"><span>' + e(w('who')) + '</span><select id="dsWho"><option value="">' + e(w('all')) + '</option>' +
      people.map(function (p) { return '<option' + (p === S.who ? ' selected' : '') + ' data-1c>' + e(p) + '</option>'; }).join('') + '</select></label>' +
      '<span style="flex:1"></span><button type="button" class="btn primary" id="dsCopy"' + (rows.length ? '' : ' disabled') + '>' + e(w('copy')) + '</button>' +
      '<button type="button" class="btn ghost" id="dsCsv"' + (rows.length ? '' : ' disabled') + '>' + e(w('csv')) + '</button></div>';
    if (!dayList.length) { box.innerHTML = h + '<div class="empty">' + e(w('none')) + '</div>'; wire(box, dayList, rows, list); return; }
    h += '<div class="dsRounds"><b>' + e(w('rounds')) + '</b> <span class="muted">' + e(w('sel', { n: list.length, m: dayList.length })) + '</span> ' +
      '<button type="button" class="minibtn" data-dsall="1">' + e(w('all_on')) + '</button> <button type="button" class="minibtn" data-dsall="0">' + e(w('all_off')) + '</button><div class="dsChips">' +
      dayList.map(function (r) { var k = rk(r);
        return '<label class="dsChip"><input type="checkbox" data-dsk="' + e(k) + '"' + (S.off[k] ? '' : ' checked') + '> <b>' + e(r.equip) + '</b> ' + e(typeName(r.type)) + (r.by ? ' <span class="muted" data-1c>' + e(r.by) + '</span>' : '') + '</label>';
      }).join('') + '</div></div>';
    if (!list.length) { box.innerHTML = h + '<div class="empty">' + e(w('pick')) + '</div>'; wire(box, dayList, rows, list); return; }
    h += '<div class="tblwrap dsPrev" id="dsPrev">' + mailHtml(rows, list) + '</div><p class="sub" id="dsMsg" role="status"></p>';
    box.innerHTML = h; wire(box, dayList, rows, list);
  }
  function wire(box, dayList, rows, list) {
    var q = function (id) { return document.getElementById(id); };
    if (q('dsDay')) q('dsDay').onchange = function () { S.day = this.value; S.off = {}; draw(); };
    if (q('dsWho')) q('dsWho').onchange = function () { S.who = this.value; draw(); };
    box.querySelectorAll('[data-dsk]').forEach(function (c) { c.onchange = function () { S.off[c.dataset.dsk] = !c.checked; draw(); }; });
    box.querySelectorAll('[data-dsall]').forEach(function (b) { b.onclick = function () { dayList.forEach(function (r) { S.off[rk(r)] = b.dataset.dsall === '0'; }); draw(); }; });
    if (q('dsCopy')) q('dsCopy').onclick = function () {
      var html = mailHtml(rows, list), text = mailText(rows), msg = q('dsMsg');
      var done = function (ok) { if (msg) msg.textContent = w(ok ? 'copied' : 'copyfail'); };
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })])
            .then(function () { done(true); }, function () { done(legacy(html)); });
        } else done(legacy(html));
      } catch (x) { done(legacy(html)); }
    };
    if (q('dsCsv')) q('dsCsv').onclick = function () {
      var lines = [COLS.map(function (c) { return w(c[1]); }).concat(['Round']).join(',')].concat(rows.map(function (x) {
        return COLS.map(function (c) { return x[c[0]] || ''; }).concat([x.round]).map(function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',');
      }));
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
      a.download = 'cm_day_summary_' + S.day + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    };
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
      '#daySum .dsRounds{margin:6px 0 10px}#daySum .dsChips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}' +
      '#daySum .dsChip{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line,#d5dbe0);border-radius:7px;padding:4px 8px;font-size:13px;cursor:pointer}' +
      '#daySum .dsPrev{background:#fff;color:#1b232a;padding:10px;border:1px solid var(--line,#d5dbe0);border-radius:8px;overflow:auto}';
    document.head.appendChild(st);
    return true;
  }
  window.daySumShow = function () { if (ensure()) draw(); };
  window.CMDaySum = { rowsFor: rowsFor, mailHtml: mailHtml, state: S, draw: function () { window.daySumShow(); } };
})();
