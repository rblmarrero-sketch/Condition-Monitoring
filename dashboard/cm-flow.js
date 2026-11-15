/* CM_FLOW_V1 (build 626, Rickie 15.11.2026 16:39 "the KPI cards are overwhelming ... make it simple, clean, standard";
   16:55 "1. 1C PM workorder 2. yes 1C plan date 3. yes ... look like WO manager, clean with flow"; 17:03 "build it").

   The Overview of BOTH office pages answers three questions, in three rows, the way the Work Order Manager's flow
   ribbon does (numbered steps left to right, one count each, a press opens the list behind it):

   1. FLEET CONDITION   machines by the worst finding of their latest round (one bar, five grades).
   2. CM ROUNDS - 1C PM WORK ORDERS   the round is due on the 1C work order's plan date (decision 1):
        planned later than 7 days · due in 7 days · OVERDUE (plan date passed, no CM round near it, order still open)
        · done this week (a CM round walked this week for an order of this week or earlier).
      One rule, the Plan vs Actual tab's own (paRows: the round nearest the plan date within PA_WINDOW_DAYS,
      on time within PA_ON_TIME_DAYS), so the Overview and that tab can never disagree.
   3. FINDINGS -> 1C DEFECTS   every finding graded 3-5, by the 1C defect raised for it (decision 3): same machine,
      raised on the inspection day or up to LINK_DAYS after, same system code where 1C names one (the Day summary
      e-mail's match). Not raised in 1C · Registered · In progress (work order raised) · Completed. A partition: the
      four steps add up to the first.
   Inspection compliance (decision 2) = 1C PM orders with a CM round whose plan date fell in the last COMP_DAYS:
   walked within PA_ON_TIME_DAYS of the plan date, of all of them (comp()).

   Reads the page's own functions (paRows, findings, sevOf, worstOf, cwStage, SEV, SEVC, t-free labels here) - both
   office pages define them identically. Labels are EN/RU here so the two pages carry one wording. */
(function () {
  'use strict';
  var LINK_DAYS = 14, COMP_DAYS = 30, WEEK = 7;
  var L = function (en, ru) { return (typeof lang !== 'undefined' && lang === 'ru') ? ru : en; };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var today = function () { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); };
  function addD(d, n) { var x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  function monday(d) { var dow = (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; return addD(d, -dow); }
  function unitOk(u) { return typeof window.cmUnitOK !== 'function' || window.cmUnitOK(u); }

  /* ---- 2. the 1C plan, by Plan vs Actual's own scoring ---- */
  function planRows() {
    if (typeof paRows !== 'function') return [];
    var cls = (document.getElementById('fClass') || {}).value || '', ty = (document.getElementById('fType') || {}).value || '';
    return paRows().filter(function (r) {
      var types = r.info && r.info.types;
      if (!types || !types.length || r.heldOff || !r.w || !r.w.planStart) return false;
      if (ty && types.indexOf(ty) < 0) return false;
      var u = String(r.w.equip || '').toUpperCase();
      if (cls) { var a = (window.ASSETS || []).find(function (x) { return String(x.n).toUpperCase() === u; }); if (!a || a.cls !== cls) return false; }
      return unitOk(u);
    });
  }
  function walked(r) { return r.status === 'ontime' || r.status === 'early' || r.status === 'late'; }
  function plan() {
    var t0 = today(), wk = addD(t0, WEEK), mon = monday(t0), out = { later: [], week: [], over: [], done: [] };
    planRows().forEach(function (r) {
      var p = String(r.w.planStart), open = r.w.open !== false;
      if (r.last && String(r.last.date) >= mon && String(r.last.date) <= t0 && p <= wk && walked(r)) { out.done.push(r); return; }
      if (!open || walked(r)) return;
      if (p < t0) out.over.push(r); else if (p <= wk) out.week.push(r); else out.later.push(r);
    });
    return out;
  }
  /* decision 2: compliance against the 1C plan date */
  function comp(days) {
    var t0 = today(), from = addD(t0, -(days || COMP_DAYS)), due = 0, onTime = 0;
    planRows().forEach(function (r) {
      var p = String(r.w.planStart); if (p < from || p > t0) return;
      due++; if (r.status === 'ontime' || r.status === 'early') onTime++;
    });
    return { pct: due ? Math.round(onTime / due * 100) : null, onTime: onTime, due: due, days: days || COMP_DAYS };
  }

  /* ---- 3. findings -> 1C defects ---- */
  var linkCache = { k: '', m: null };
  function defects() { return (window.CM_WO_DATA && window.CM_WO_DATA.cmWorkOrders) || []; }
  function fkey(r, i) { return (r.id || r.equip + '|' + r.date + '|' + r.type) + '#' + (i.key || i.label || ''); }
  function links(all) {
    var ds = defects(), k = (window.CM_WO_DATA && window.CM_WO_DATA.generated || '') + '|' + all.length + '|' + ds.length;
    if (linkCache.k === k && linkCache.m) return linkCache.m;
    var used = {}, m = new Map();
    var sorted = all.slice().sort(function (a, b) { return String(a.r.date || '').localeCompare(String(b.r.date || '')); });
    sorted.forEach(function (x) {
      var u = String(x.r.equip || '').toUpperCase(), d0 = String(x.r.date || ''), to = addD(d0, LINK_DAYS), sk = String(x.i.key || '').toUpperCase();
      var ok = function (d) { var on = String(d.raised || d.date || '').slice(0, 10);
        return d && d.defect && !used[d.defect] && String(d.asset || '').toUpperCase() === u && on >= d0 && on <= to; };
      var sys = function (d) { var s = String(d.system || '').toUpperCase(); return sk && (s.indexOf('.' + sk + ' ') >= 0 || s.indexOf('.' + sk + '(') >= 0 || s.slice(-sk.length - 1) === '.' + sk); };
      var d = ds.find(function (d) { return ok(d) && sys(d); });
      if (!d) { var left = ds.filter(ok); if (left.length === 1) d = left[0]; }   /* a lone defect on the machine in the window */
      if (d) { used[d.defect] = 1; m.set(fkey(x.r, x.i), d); }
    });
    linkCache = { k: k, m: m };
    return m;
  }
  function stageOf(d) { return d ? (typeof cwStage === 'function' ? cwStage(d) : 'reg') : 'none'; }
  /* the population: findings graded 3-5 in the records the page shows */
  function finds(recs) {
    if (typeof findings !== 'function' || typeof sevOf !== 'function') return [];
    /* the same rows the Maintenance Actions register lists (actionRows: actionState not "none"), graded 3-5,
       so a step's count and the register filtered to that step are one number */
    return findings(recs).filter(function (x) { return sevOf(x.r, x.i) >= 3 && (typeof actionState !== 'function' || actionState(x.r, x.i).k !== 'none'); });
  }
  function defectOf(r, i) { var all = finds(typeof RECS !== 'undefined' ? RECS : []); return links(all).get(fkey(r, i)) || null; }
  function stage(r, i) { return stageOf(defectOf(r, i)); }
  function flow(recs) {
    var all = finds(recs), lk = links(finds(typeof RECS !== 'undefined' ? RECS : [])), out = { all: all, none: [], reg: [], prog: [], done: [] };
    all.forEach(function (x) { out[stageOf(lk.get(fkey(x.r, x.i)))].push(x); });
    return out;
  }

  /* ---- 1. fleet condition ---- */
  function cond(recs) {
    var latest = {}, g = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    recs.forEach(function (r) { var k = r.equip; if (!latest[k] || (r.date || '') > (latest[k].date || '')) latest[k] = r; });
    Object.keys(latest).forEach(function (k) { var w = worstOf(latest[k]); if (g[w] != null) g[w]++; });
    return g;
  }

  function render(el, recs, opt) {
    if (!el) return null;
    opt = opt || {};
    var g = cond(recs), pl = plan(), fl = flow(recs), drillSev = opt.drillSev == null ? '' : String(opt.drillSev);
    var C = { NAVY: 'var(--accent)', RED: 'var(--critical)', AMB: 'var(--warning)', GRN: 'var(--good)', GRY: '#8a96a3' };
    var rb = function (id, go, n, c, t, s, v, hot) {
      return '<button type="button" class="rb' + (hot && v ? ' hot' : '') + '" id="' + id + '" data-kgo="' + go + '" style="--c:' + c + '">'
        + '<span class="rn">' + n + '</span><span class="rt">' + E(t) + '<small>' + E(s) + '</small></span><b class="v">' + v + '</b></button>'; };
    var gn = function (s) { return (typeof SEV !== 'undefined' && SEV[s] && SEV[s].l) || (window.GRADE && GRADE.label ? GRADE.label(s, typeof lang !== 'undefined' ? lang : 'en') : s); };
    el.className = 'kpis cmflow';
    el.innerHTML =
      '<div class="cfsec" id="cfCond"><div class="cft"><span>' + E(L('Fleet condition', 'Состояние парка')) + '</span><small>'
        + E(L('machines by the worst finding of their latest round', 'техника по худшему замечанию последнего обхода')) + '</small>'
        + '<button type="button" class="cfgo" data-kgo="fleet">' + E(L('Equipment requiring attention ↓', 'Техника, требующая внимания ↓')) + '</button></div>'
        + '<div class="cfcond"><div class="cfbar" role="img" aria-label="' + E([5, 4, 3, 2, 1].map(function (s) { return gn(s) + ' ' + g[s]; }).join(', ')) + '">'
        + [5, 4, 3, 2, 1].map(function (s) { return g[s] ? '<i style="flex:' + g[s] + ';background:' + SEVC[s] + '"></i>' : ''; }).join('') + '</div>'
        + '<div class="cfkey">' + [5, 4, 3, 2, 1].map(function (s) {
            var id = { 5: 'kpiCrit', 4: 'kpiSev', 3: 'kpiDeg', 2: 'kpiInc', 1: 'kpiNorm' }[s];
            return '<button type="button" id="' + id + '" data-sev="' + s + '" class="' + (drillSev === String(s) ? 'on' : '') + '"' + (g[s] ? '' : ' disabled')
              + ' aria-pressed="' + (drillSev === String(s)) + '"><i style="background:' + SEVC[s] + '"></i>' + E(gn(s)) + ' <b class="v">' + g[s] + '</b></button>'; }).join('')
        + '</div></div></div>'
      + '<div class="cfsec" id="cfPlan"><div class="cft"><span>' + E(L('CM rounds — 1C PM work orders', 'Обходы МС — заказ-наряды ТО 1С')) + '</span><small>'
        + E(L('the round is due on the work order’s plan date', 'обход к плановой дате заказ-наряда')) + '</small>'
        + '<button type="button" class="cfgo" data-kgo="pa">' + E(L('Plan vs Actual →', 'План и факт →')) + '</button></div>'
        + '<div class="cfrib c4">'
        + rb('kpiPlan', 'pa_later', 1, C.NAVY, L('Planned in 1C', 'Запланировано в 1С'), L('more than 7 days ahead', 'позже чем через 7 дней'), pl.later.length)
        + rb('kpiWeek', 'pa_week', 2, C.AMB, L('Due in 7 days', 'Через 7 дней'), L('plan date this week', 'плановая дата на этой неделе'), pl.week.length)
        + rb('kpiOver', 'pa_over', 3, C.RED, L('Overdue', 'Просрочено'), L('plan date passed, no CM round', 'дата прошла, обхода МС нет'), pl.over.length, 1)
        + rb('kpiDone', 'pa_done', 4, C.GRN, L('Done this week', 'Выполнено за неделю'), L('CM round walked this week', 'обход МС на этой неделе'), pl.done.length)
        + '</div></div>'
      + '<div class="cfsec" id="cfFind"><div class="cft"><span>' + E(L('Findings → 1C defects', 'Замечания → дефекты 1С')) + '</span><small>'
        + E(L('findings graded 3–5 and the 1C defect raised for them', 'замечания с оценкой 3–5 и дефекты 1С по ним')) + '</small>'
        + '<button type="button" class="cfgo" data-kgo="actions">' + E(L('Maintenance Actions →', 'Работы по обслуживанию →')) + '</button></div>'
        + '<div class="cfrib c5">'
        + rb('kpiFind', 'f_all', 1, C.NAVY, L('Findings', 'Замечания'), L('graded 3–5', 'оценка 3–5'), fl.all.length)
        + rb('kpiNodef', 'f_none', 2, C.AMB, L('Not raised in 1C', 'Не оформлено в 1С'), L('no defect yet', 'дефекта ещё нет'), fl.none.length, 1)
        + rb('kpiDreg', 'f_reg', 3, C.GRY, L('Registered', 'Зарегистрирован'), L('defect in 1C, no work order', 'дефект в 1С, без заказ-наряда'), fl.reg.length)
        + rb('kpiDprog', 'f_prog', 4, C.NAVY, L('In progress', 'В работе'), L('work order raised', 'заказ-наряд создан'), fl.prog.length)
        + rb('kpiDdone', 'f_done', 5, C.GRN, L('Completed', 'Выполнено'), L('completed in 1C', 'выполнено в 1С'), fl.done.length)
        + '</div></div>';
    var res = { cond: g, plan: { later: pl.later.length, week: pl.week.length, over: pl.over.length, done: pl.done.length },
                find: { all: fl.all.length, none: fl.none.length, reg: fl.reg.length, prog: fl.prog.length, done: fl.done.length } };
    return res;
  }


  /* Old rule beside new rule, on Data & Sync, for the first week (Rickie 15.11: check the numbers on the real site). */
  var CMP_UNTIL = '2026-11-23';
  function compare() {
    var tab = document.getElementById('tab-sync'); if (!tab) return;
    var box = document.getElementById('cfCompare');
    if (today() > CMP_UNTIL) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'section'; box.id = 'cfCompare';
      tab.appendChild(box); }
    var oldOver = '–', oldComp = '–', oldNoown = '–', recs = typeof filtered === 'function' ? filtered() : [];
    try { oldOver = dueTabRows().filter(function (r) { return r.st === 'over'; }).length; } catch (e) {}
    try { var c = complianceCM(); oldComp = c.pct == null ? '–' : c.pct + '% (' + c.onTime + ' / ' + c.due + ')'; } catch (e) {}
    try { oldNoown = findings(recs).filter(function (x) { return actionRequired(x.r, x.i) && !x.i.owner; }).length; } catch (e) {}
    var p = plan(), c2 = comp(), f = flow(recs);
    var row = function (k, a, b, n) { return '<tr><td>' + E(k) + '</td><td class="num">' + E(a) + '</td><td class="num"><b>' + E(b) + '</b></td><td class="muted">' + E(n) + '</td></tr>'; };
    box.innerHTML = '<h2>' + E(L('Overview numbers: old rule and new rule', 'Числа обзора: старое и новое правило')) + '</h2>'
      + '<p class="hint">' + E(L('From build 626 the Overview counts against 1C PM work orders. Shown here until ', 'С версии 626 обзор считает по заказ-нарядам ТО 1С. Показывается до ') + CMP_UNTIL.split('-').reverse().join('.')) + '</p>'
      + '<div class="tblwrap"><table class="grid"><thead><tr><th>' + E(L('Number', 'Показатель')) + '</th><th class="num">' + E(L('Old rule', 'Старое правило')) + '</th><th class="num">'
      + E(L('New rule', 'Новое правило')) + '</th><th>' + E(L('New rule says', 'Новое правило')) + '</th></tr></thead><tbody>'
      + row(L('Overdue', 'Просрочено'), oldOver, p.over.length, L('1C plan date passed, no CM round, order open (old: CM interval in hours)', 'плановая дата 1С прошла, обхода МС нет, заказ-наряд открыт (старое: интервал МС в часах)'))
      + row(L('Inspection compliance', 'Соблюдение сроков'), oldComp, c2.pct == null ? '–' : c2.pct + '% (' + c2.onTime + ' / ' + c2.due + ')', L('CM round within 10 days of the 1C plan date, orders of the last 30 days', 'обход МС в пределах 10 дней от плановой даты 1С, заказ-наряды за 30 дней'))
      + row(L('Unassigned actions → Not raised in 1C', 'Без ответственного → Не оформлено в 1С'), oldNoown, f.none.length, L('findings graded 3–5 with no 1C defect raised for them', 'замечания с оценкой 3–5 без дефекта в 1С'))
      + '</tbody></table></div>';
  }

  window.CMFlow = { compare: compare, plan: plan, comp: comp, flow: flow, stage: stage, isFind: function (r, i) { return sevOf(r, i) >= 3; }, defectOf: defectOf, render: render, cond: cond,
                    LINK_DAYS: LINK_DAYS, COMP_DAYS: COMP_DAYS, L: L };
})();
