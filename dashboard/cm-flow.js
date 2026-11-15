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
  /* CM_SCHED1C_V1 (build 627): a deferral made on the phone or at a desk (the deferrals map, keyed round|unit)
     takes a 1C order off Overdue / Due when it covers EVERY round of the order: made after the last round walked,
     its date (if any) still ahead, and the order planned before the machine's next PM the deferral names (pm). */
  function deferOn(r, ty) {
    var m = (typeof deferrals !== 'undefined' && deferrals) || {}, u = String(r.w.equip || '').toUpperCase(), d = m[ty + '|' + u];
    if (!d) return null;
    var t0 = today(), at = String(d.at || '').slice(0, 10), last = r.last ? String(r.last.date || '') : '';
    if (last && at && last >= at) return null;
    if (d.until && String(d.until) < t0) return null;
    if (d.pm && String(r.w.planStart) >= String(d.pm)) return null;
    return d;
  }
  function deferred(r) { var ts = r.info.types || []; return ts.length && ts.every(function (ty) { return !!deferOn(r, ty); }); }
  function plan() {
    var t0 = today(), wk = addD(t0, WEEK), mon = monday(t0), out = { later: [], week: [], over: [], done: [], put: [] };
    planRows().forEach(function (r) {
      var p = String(r.w.planStart), open = r.w.open !== false;
      if (r.last && String(r.last.date) >= mon && String(r.last.date) <= t0 && p <= wk && walked(r)) { out.done.push(r); return; }
      if (!open || walked(r)) return;
      if (deferred(r)) { out.put.push(r); return; }
      if (p < t0) out.over.push(r); else if (p <= wk) out.week.push(r); else out.later.push(r);
    });
    return out;
  }
  /* One Inspection Schedule row per 1C order, the shape that tab's 1C rows already read (st "plan"). */
  function dueRow(r) {
    var t0 = today(), u = String(r.w.equip || '').toUpperCase(), tys = (r.info.types || []).slice(), p = String(r.w.planStart);
    var a = (window.ASSETS || []).find(function (x) { return x && String(x.n).toUpperCase() === u; });
    var d = tys.map(function (ty) { return deferOn(r, ty); }).filter(Boolean)[0] || null;
    return { c1: 1, st: 'plan', unit: u, ty: tys[0], tys: tys, plan: p, wo: r.w.woNumber || '', label: r.info.label || '',
             prio: r.w.priority || '', cat: (a && (a.cat || a.cls)) || '', late: p < t0, lateDays: p < t0 && typeof DUE !== 'undefined' ? Math.abs(DUE.dayDiff(t0, p)) : 0,
             last: r.last || null, d: d, status: r.status };
  }
  /* The 1C defect's responsible person, as the owner of a finding nobody named (build 627). Reads the link
     map only; never builds it, because building it asks actionState, which asks this. */
  function owner1C(r, i) { if (!i) return ''; var d = defectOf(r, i); return (d && d.by) ? String(d.by) : ''; }
  function warm() { try { links(base(typeof RECS !== 'undefined' ? RECS : [])); } catch (e) {} }
  /* ---- CM_FIND1C_V1 (build 630, Rickie 15.11 21:02 "when they found something they create a defect ... 1000+
     findings without actions is bad monitoring. Owner of that is always maintenance"; 21:03 "go").
     A finding graded 3-5 follows its point and its 1C defect:
       - a newer reading of the same machine and point: 1-2 = the finding is CLEARED at that inspection (closed);
         3-5 = the newer reading carries it (this one is folded into it, not a second job);
       - the 1C defect matched to it (links, the Day summary e-mail's rule): Completed = closed; Registered or
         In progress = open; none = open, the one thing missing is the 1C defect;
       - owner: the 1C defect's responsible person, else "Maintenance".
     A manual office decision (No action needed / Done / Verified) still wins: actionState checks it first. ---- */
  var latestCache = null;
  function latest() {
    if (latestCache) return latestCache;
    var m = {}, recs = typeof RECS !== 'undefined' ? RECS : [];
    recs.forEach(function (r) { if (!r || r._void) return; (r.items || []).forEach(function (i) {
      if (!i || i.general || i.key === 'MACHINE') return; var s = sevOf(r, i); if (!s) return;
      var k = String(r.equip || '').toUpperCase() + '|' + String(i.key || i.label || '');
      var d = String(r.date || ''); if (!m[k] || d > m[k].d) m[k] = { d: d, s: s, r: r }; }); });
    latestCache = m; setTimeout(function () { latestCache = null; }, 0);
    return m;
  }
  function find1C(r, i, o) {
    if (!o || !(o.sev >= 3)) return null;
    var k = String(r.equip || '').toUpperCase() + '|' + String(i.key || i.label || ''), n = latest()[k];
    if (n && n.d > String(r.date || '')) return n.s <= 2 ? { k: 'closed', miss: [], sev: o.sev, why: 'cleared', at: n.d } : { k: 'none', miss: [], sev: o.sev, why: 'later', at: n.d };
    var st = stageOf(defectOf(r, i));
    if (st === 'done') return { k: 'closed', miss: [], sev: o.sev, why: '1c' };
    if (st === 'reg' || st === 'prog') return { k: 'open', miss: [], sev: o.sev, why: '1c' };
    return { k: 'triage', miss: ['c1'], sev: o.sev, why: 'no1c' };
  }
  /* a point that now reads 1-2 while the 1C defect raised for an earlier 3-5 is still open: close it in 1C */
  function staleDefects() {
    var out = [], L1 = latest();
    base(typeof RECS !== 'undefined' ? RECS : []).forEach(function (x) {
      var k = String(x.r.equip || '').toUpperCase() + '|' + String(x.i.key || x.i.label || ''), n = L1[k];
      if (!n || !(n.d > String(x.r.date || '')) || n.s > 2) return;
      var d = defectOf(x.r, x.i); if (d && stageOf(d) !== 'done') out.push({ unit: x.r.equip, point: x.i.label || x.i.key, defect: d.defect, at: n.d });
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
  /* the findings graded 3-5, before any rule about their state: what a 1C defect is matched against */
  function base(recs) {
    if (typeof findings !== 'function' || typeof sevOf !== 'function') return [];
    return findings(recs).filter(function (x) { return sevOf(x.r, x.i) >= 3; });
  }
  /* the population: findings graded 3-5 that are still a finding (CM_FIND1C_V1: not folded into a newer reading of the
     same point, not cleared by one), the same rows the Maintenance Actions register lists */
  function finds(recs) {
    return base(recs).filter(function (x) { if (typeof actionState !== 'function') return true;
      var s = actionState(x.r, x.i); return s.k !== 'none' && s.why !== 'cleared'; });
  }
  function defectOf(r, i) { return links(base(typeof RECS !== 'undefined' ? RECS : [])).get(fkey(r, i)) || null; }
  function stage(r, i) { return stageOf(defectOf(r, i)); }
  function flow(recs) {
    var all = finds(recs), lk = links(base(typeof RECS !== 'undefined' ? RECS : [])), out = { all: all, none: [], reg: [], prog: [], done: [] };
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


  /* CM_ACTFLOW_V1 (build 628, Rickie 15.11 "go" on the mock-up): Maintenance Actions opens with the Overview's findings row
     (its own ids, so both can be in the page), the step that is the register's filter marked, and under it the two problems
     a planner chases - past the due date and no owner (named in CM or on the 1C defect). */
  function renderFind(el, recs, opt) {
    if (!el) return null;
    opt = opt || {};
    var fl = flow(recs), f = String(opt.filt || '');
    var C = { NAVY: 'var(--accent)', AMB: 'var(--warning)', GRN: 'var(--good)', GRY: '#8a96a3' };
    var rb = function (id, go, n, c, t, s, v, hot) {
      return '<button type="button" class="rb' + (hot && v ? ' hot' : '') + (f === go ? ' on' : '') + '" id="' + id + '" data-af="' + go + '" aria-pressed="' + (f === go) + '" style="--c:' + c + '">'
        + '<span class="rn">' + n + '</span><span class="rt">' + E(t) + '<small>' + E(s) + '</small></span><b class="v">' + v + '</b></button>'; };
    var pb = function (af, col, txt) { return '<button type="button" data-af="' + af + '" class="' + (f === af ? 'on' : '') + '" aria-pressed="' + (f === af) + '"><i style="background:' + col + '"></i>' + E(txt) + '</button>'; };
    el.className = 'cmflow';
    el.innerHTML = '<div class="cfsec" id="actFlowFind"><div class="cft"><span>' + E(L('Findings → 1C defects', 'Замечания → дефекты 1С')) + '</span><small>'
        + E(L('findings graded 3–5 and the 1C defect raised for them', 'замечания с оценкой 3–5 и дефекты 1С по ним')) + '</small>'
        + '<button type="button" class="cfgo" data-kgo="cmwo">' + E(L('Defects raised →', 'Дефекты →')) + '</button></div>'
        + '<div class="cfrib c5">'
        + rb('actFind', 'f_all', 1, C.NAVY, L('Findings', 'Замечания'), L('graded 3–5', 'оценка 3–5'), fl.all.length)
        + rb('actNodef', 'f_none', 2, C.AMB, L('Not raised in 1C', 'Не оформлено в 1С'), L('no defect yet', 'дефекта ещё нет'), fl.none.length, 1)
        + rb('actDreg', 'f_reg', 3, C.GRY, L('Registered', 'Зарегистрирован'), L('defect in 1C, no work order', 'дефект в 1С, без заказ-наряда'), fl.reg.length)
        + rb('actDprog', 'f_prog', 4, C.NAVY, L('In progress', 'В работе'), L('work order raised', 'заказ-наряд создан'), fl.prog.length)
        + rb('actDdone', 'f_done', 5, C.GRN, L('Completed', 'Выполнено'), L('completed in 1C', 'выполнено в 1С'), fl.done.length)
        + '</div>'
        + '<div class="cfkey cfprob">'
        + pb('over', 'var(--crit-ink)', (opt.over || 0) + ' ' + L('past the due date', 'просрочено по сроку'))
        + pb('noown', 'var(--warning)', (opt.noown || 0) + ' ' + L('with no owner (in CM or in 1C)', 'без ответственного (в МС и в 1С)'))
        + '</div></div>';
    return { all: fl.all.length, none: fl.none.length, reg: fl.reg.length, prog: fl.prog.length, done: fl.done.length };
  }
  /* "In 1C" on the register's tabs: a defect registered or a work order in progress */
  function inOneC(r, i) { var s = stage(r, i); return s === 'reg' || s === 'prog'; }

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
    try { oldNoown = findings(recs).filter(function (x) { var o = actionStateOld(x.r, x.i); return (o.k === 'open' || o.k === 'triage') && !x.i.owner && !x.i.resp; }).length; } catch (e) {}
    var oldOpen = '–', newOpen = '–', cleared = '–';
    try { var fr = findings(recs);
      oldOpen = fr.filter(function (x) { var o = actionStateOld(x.r, x.i); return o.k === 'open' || o.k === 'triage'; }).length;
      newOpen = fr.filter(function (x) { return actionRequired(x.r, x.i); }).length;
      cleared = fr.filter(function (x) { var a = actionState(x.r, x.i); return a.why === 'cleared' || a.why === 'later'; }).length; } catch (e) {}
    var p = plan(), c2 = comp(), f = flow(recs);
    var row = function (k, a, b, n) { return '<tr><td>' + E(k) + '</td><td class="num">' + E(a) + '</td><td class="num"><b>' + E(b) + '</b></td><td class="muted">' + E(n) + '</td></tr>'; };
    box.innerHTML = '<h2>' + E(L('Overview and findings: old rule and new rule', 'Обзор и замечания: старое и новое правило')) + '</h2>'
      + '<p class="hint">' + E(L('From build 626 the Overview counts against 1C PM work orders. Shown here until ', 'С версии 626 обзор считает по заказ-нарядам ТО 1С. Показывается до ') + CMP_UNTIL.split('-').reverse().join('.')) + '</p>'
      + '<div class="tblwrap"><table class="grid"><thead><tr><th>' + E(L('Number', 'Показатель')) + '</th><th class="num">' + E(L('Old rule', 'Старое правило')) + '</th><th class="num">'
      + E(L('New rule', 'Новое правило')) + '</th><th>' + E(L('New rule says', 'Новое правило')) + '</th></tr></thead><tbody>'
      + row(L('Overdue', 'Просрочено'), oldOver, p.over.length, L('1C plan date passed, no CM round, order open (old: CM interval in hours)', 'плановая дата 1С прошла, обхода МС нет, заказ-наряд открыт (старое: интервал МС в часах)'))
      + row(L('Inspection compliance', 'Соблюдение сроков'), oldComp, c2.pct == null ? '–' : c2.pct + '% (' + c2.onTime + ' / ' + c2.due + ')', L('CM round within 10 days of the 1C plan date, orders of the last 30 days', 'обход МС в пределах 10 дней от плановой даты 1С, заказ-наряды за 30 дней'))
      + row(L('Unassigned actions → Not raised in 1C', 'Без ответственного → Не оформлено в 1С'), oldNoown, f.none.length, L('findings graded 3–5 with no 1C defect raised for them', 'замечания с оценкой 3–5 без дефекта в 1С'))
      + row(L('Findings needing action (from build 630)', 'Замечания, требующие действий (с версии 630)'), oldOpen, newOpen, L('one finding per machine and point from its newest reading; status from the 1C defect; owner Maintenance when 1C names nobody', 'одно замечание на единицу и точку по последнему замеру; статус по дефекту 1С; ответственный — служба ТО, если в 1С никто не указан'))
      + row(L('Cleared or carried by a newer reading', 'Сняты или перенесены новым замером'), '–', cleared, L('a later inspection read the same point again: 1–2 clears it, 3–5 carries it as one finding', 'тот же узел осмотрен позже: 1–2 снимает замечание, 3–5 переносит его как одно'))
      + '</tbody></table></div>';
  }


  /* ---- CM_TABS2_V1 (build 629, Rickie 15.11 "go" on the mock-ups): card rows for Failure Analysis and Equipment
     History, one Checks card on Data & Sync. Same card shape as the rest of the office page (.kpi in a .kpis row),
     the explanation of each card in its (i). ---- */
  function css() {
    if (document.getElementById('cmTabs2Css')) return;
    var st = document.createElement('style'); st.id = 'cmTabs2Css';
    st.textContent = '.kpis.cmcards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:0 0 16px}'
      + '@media (max-width:1100px){.kpis.cmcards{grid-template-columns:repeat(3,minmax(0,1fr))}}'
      + '@media (max-width:640px){.kpis.cmcards{grid-template-columns:repeat(2,minmax(0,1fr))}}'
      + '.kpis.cmcards .kpi{min-width:0}.kpis.cmcards .kpi .k{display:inline-flex;align-items:center;gap:4px}'
      + '.kpis.cmcards .kpi .s{white-space:normal}.kpis.cmcards .kpi.hot .v{color:var(--crit-ink)}.kpis.cmcards .kpi.warnv .v{color:var(--g2-ink,#8a4b00)}'
      + '.kpis.cmcards .kpi[role=button]{cursor:pointer}.kpis.cmcards .kpi[role=button]:hover{border-color:var(--accent)}'
      + '.cmone{color:var(--muted);font-size:14px;padding:6px 0 2px}'
      + '.cmchk{margin:0 0 16px}.cmchk .cl{display:flex;gap:10px;align-items:baseline;padding:10px 0;border-top:1px solid var(--border);font-size:14px}'
      + '.cmchk .cl:first-of-type{border-top:0}.cmchk .cl b{min-width:18px;color:var(--good-ink)}.cmchk .cl.bad b{color:var(--crit-ink)}'
      + '.cmchk .cl .x{color:var(--muted)}.cmchk .cl a{margin-left:auto;font-weight:600}';
    document.head.appendChild(st);
  }
  function tip(txt) { return '<button type="button" class="cmTip cmp2tip cmt2" aria-expanded="false" aria-label="' + E(txt) + '"><i aria-hidden="true">i</i><span class="tipbox" role="tooltip">' + E(txt) + '</span></button>'; }
  function wireTips(el) {
    el.querySelectorAll('.cmt2').forEach(function (b) {
      var set = function (o) { b.classList.toggle('open', o); b.setAttribute('aria-expanded', String(o)); };
      b.onmouseenter = function () { set(true); }; b.onmouseleave = function () { if (document.activeElement !== b) set(false); };
      b.onfocus = function () { set(true); }; b.onblur = function () { set(false); };
      b.onclick = function (e) { e.stopPropagation(); set(!b.classList.contains('open')); };
    });
  }
  function card(k, v, s, info, cls, go) {
    return '<div class="kpi ' + (cls || '') + '"' + (go ? ' role="button" tabindex="0" data-cgo="' + E(go) + '"' : '') + '><span class="hd"><span class="k">' + E(k) + tip(info) + '</span></span>'
      + '<span class="v">' + E(v) + '</span><span class="s">' + E(s) + '</span></div>';
  }
  function dmy(d) { var p = String(d || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : String(d || ''); }
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }
  function wireGo(el, go) {
    el.querySelectorAll('[data-cgo]').forEach(function (c) {
      var f = function () { go(c.getAttribute('data-cgo')); };
      c.onclick = f; c.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); } };
    });
  }
  /* Failure Analysis: the findings graded 3-5 in view, the machines, repeat points, the top failure mode, not raised in 1C */
  function renderFail(el, f, recs) {
    if (!el) return null; css();
    var g3 = f.filter(function (x) { return (sevOf(x.r, x.i) || 0) >= 3; });
    var units = {}, pts = {}, top = {}, coded = 0;
    g3.forEach(function (x) { units[x.r.equip] = 1; var k = x.r.equip + '|' + (x.i.key || x.i.label || ''); pts[k] = pts[k] || {}; pts[k][x.r.date + '|' + x.r.type] = 1; });
    f.forEach(function (x) { var k = typeof defectKeyOf === 'function' ? defectKeyOf(x.i) : (x.i.defect || ''); if (!k) return; coded++; top[k] = (top[k] || 0) + 1; });
    var rep = Object.keys(pts).filter(function (k) { return Object.keys(pts[k]).length > 1; }).length;
    var tk = Object.keys(top).sort(function (a, b) { return top[b] - top[a]; })[0];
    var share = tk ? Math.round(top[tk] / coded * 100) : null;
    var tl = tk ? (typeof defectKeyLabel === 'function' ? (defectKeyLabel(tk) || tk) : tk) : '';
    var fl = flow(recs);
    el.className = 'kpis cmcards'; el.id = el.id || 'failFlow';
    el.innerHTML = card(L('Findings 3–5', 'Замечания 3–5'), num(g3.length), L('of ', 'из ') + num(f.length) + L(' findings', ' замечаний'),
        L('Findings graded Degraded, Severe or Critical in the view the filter bar sets.', 'Замечания с оценкой «Ухудшенное», «Серьёзное» или «Критическое» в выборке фильтра.'))
      + card(L('Machines', 'Единицы'), num(Object.keys(units).length), L('with a finding graded 3–5', 'с замечанием 3–5'),
        L('Machines carrying at least one finding graded 3–5.', 'Единицы, у которых есть хотя бы одно замечание с оценкой 3–5.'))
      + card(L('Repeat points', 'Повторы'), num(rep), L('same point graded 3+ twice', 'та же точка 3+ дважды'),
        L('The same point on the same machine graded 3 or worse on two or more rounds: a fix that did not hold.', 'Одна и та же точка единицы с оценкой 3 и хуже в двух и более обходах: устранение не помогло.'), rep ? 'warnv' : '')
      + card(L('Top failure mode', 'Главный вид отказа'), share == null ? '–' : share + '%', tl || L('no coded defect', 'нет кода дефекта'),
        L('Share of coded findings that carry the most frequent defect type (the first bar of the Pareto).', 'Доля замечаний с самым частым видом дефекта (первая строка Парето).'))
      + card(L('Not raised in 1C', 'Не оформлено в 1С'), num(fl.none.length), L('of ', 'из ') + num(fl.all.length) + L(' findings graded 3–5', ' замечаний 3–5'),
        L('Findings graded 3–5 with no 1C defect raised for them. Press to open them in Maintenance Actions.', 'Замечания 3–5, по которым дефект в 1С не оформлен. Нажмите, чтобы открыть их в «Действиях по ТО».'), fl.none.length ? 'hot' : '', 'f_none');
    wireTips(el);
    wireGo(el, function (go) { try { if (typeof setAFilt === 'function') setAFilt(go); showTab('actions'); } catch (e) {} });
    return { g3: g3.length, units: Object.keys(units).length, rep: rep, share: share, none: fl.none.length };
  }
  /* Equipment History: one row of cards about the chosen machine */
  function renderMachine(el, unit, recs) {
    if (!el) return null; css(); el.className = 'kpis cmcards'; el.id = el.id || 'eqCards';
    if (!unit) { el.innerHTML = ''; el.hidden = true; return null; }
    el.hidden = false;
    var U = String(unit).toUpperCase(), a = (typeof ASSET_BY !== 'undefined' && ASSET_BY[U]) || ((window.ASSETS || []).find(function (x) { return x && String(x.n).toUpperCase() === U; })) || {};
    var live = (recs || []).filter(function (r) { return !r._void; }).sort(function (x, y) { return String(y.date || '').localeCompare(String(x.date || '')); });
    var last = live[0] || null;
    var open = [];
    try { open = finds(live).filter(function (x) { return typeof actionState !== 'function' || ['closed', 'noaction'].indexOf(actionState(x.r, x.i).k) < 0; }); } catch (e) {}
    var worst = open.reduce(function (m, x) { return Math.max(m, sevOf(x.r, x.i) || 0); }, 0);
    var wn = {}; open.forEach(function (x) { var s = sevOf(x.r, x.i); wn[s] = (wn[s] || 0) + 1; });
    var ds = defects().filter(function (d) { return String(d.asset || '').toUpperCase() === U && (typeof cwStage !== 'function' || cwStage(d) !== 'done'); });
    var t0 = today(), next = null;
    try { (typeof paRows === 'function' ? paRows() : []).forEach(function (r) {
      if (!r.w || String(r.w.equip || '').toUpperCase() !== U || r.w.open === false || !r.w.planStart) return;
      if (!next || String(r.w.planStart) < String(next.w.planStart)) next = r; }); } catch (e) {}
    var model = [a.mk || a.model || '', a.cat || a.desc || ''].filter(Boolean).join(' · ') || (a.cls ? L('class ', 'класс ') + a.cls : '');
    var sevName = function (s) { return ((typeof SEV !== 'undefined' && SEV[s]) ? String(SEV[s].l) : String(s)).replace(/^\d+\s*[–-]\s*/, ''); };
    el.innerHTML = card(L('Machine', 'Единица'), U, model || '–', L('The machine chosen above, as the register names it.', 'Единица, выбранная выше, по реестру.'))
      + card(L('Last inspected', 'Последний осмотр'), last ? dmy(last.date) : '–', last ? [(typeof TYPE_LABEL !== 'undefined' && TYPE_LABEL[last.type]) || last.type, last.smu ? 'SMU ' + num(last.smu) + ' h' : ''].filter(Boolean).join(' · ') : L('no round recorded', 'обходов нет'),
        L('The newest CM round on this machine.', 'Самый новый обход МС на этой единице.'))
      + card(L('Open findings', 'Открытые замечания'), num(open.length), open.length ? Object.keys(wn).sort(function (x, y) { return y - x; }).map(function (s) { return wn[s] + ' ' + sevName(+s); }).join(' · ') : L('nothing graded 3–5 open', 'нет открытых 3–5'),
        L('Findings graded 3–5 on this machine whose action is not closed.', 'Замечания 3–5 на этой единице, действие по которым не закрыто.'), worst >= 5 ? 'hot' : (worst >= 3 ? 'warnv' : ''))
      + card(L('1C defects open', 'Дефекты 1С открыты'), num(ds.length), ds.length ? ds.slice(0, 2).map(function (d) { return d.defect; }).join(' · ') + (ds.length > 2 ? ' …' : '') : L('none open in 1C', 'в 1С нет открытых'),
        L('Defects raised in 1C for this machine that are not completed (Defects raised).', 'Дефекты 1С по этой единице, которые не выполнены (вкладка «Дефекты»).'), '', ds.length ? 'cmwo' : '')
      + card(L('Next 1C PM', 'Следующее ТО 1С'), next ? dmy(next.w.planStart) : '–', next ? [next.w.woNumber || '', next.info && next.info.label || ''].filter(Boolean).join(' · ') : L('no open PM work order', 'нет открытого наряда ТО'),
        L('The earliest open 1C PM work order for this machine (Plan vs Actual).', 'Ближайший открытый наряд ТО 1С по этой единице (План / факт).'), next && String(next.w.planStart) < t0 ? 'hot' : '');
    wireTips(el);
    wireGo(el, function (go) { try { var q = document.getElementById('fQ'); if (q) { q.value = U; q.dispatchEvent(new Event('input', { bubbles: true })); } showTab(go); } catch (e) {} });
    return { open: open.length, defects: ds.length, last: last ? last.date : '', next: next ? next.w.planStart : '' };
  }
  /* Data & Sync: one Checks card; a list section shows only while it has something in it */
  function syncChecks(c) {
    var tab = document.getElementById('tab-sync'); if (!tab) return; css();
    var box = document.getElementById('syChecks');
    var kp = document.getElementById('syncKpis');
    if (!box) { box = document.createElement('div'); box.className = 'section cmchk'; box.id = 'syChecks'; if (kp && kp.parentNode) kp.parentNode.insertBefore(box, kp.nextSibling); else tab.appendChild(box); }
    var sec = function (id) { var e = document.getElementById(id); return e ? (e.closest('.section') || e) : null; };
    var rows = [
      { n: c.sev, s: sec('sySevBox'), ok: L('Grades: every condition follows its grade or reading', 'Оценки: каждое состояние следует из оценки или замера'), bad: L('grade review required', 'нужна проверка оценки'), x: L(' to review', ' к проверке') },
      { n: c.quar, s: sec('syQuarTbl'), ok: L('Records: every inspection names its unit, date, round and points', 'Записи: у каждого осмотра есть единица, дата, обход и точки'), bad: L('inspections requiring correction', 'осмотров требуют исправления'), x: L(' to correct', ' к исправлению') },
      { n: c.gaps, s: sec('syGapTbl'), ok: L('Attachments: every photograph and video is on the server', 'Вложения: все фото и видео на сервере'), bad: L('records waiting on evidence', 'записей ждут вложений'), x: L(' waiting', ' ожидают'),
        na: L('Attachments: no server attached, nothing to compare against', 'Вложения: сервер не подключён, сравнивать не с чем') }
    ];
    box.innerHTML = '<div class="secthd"><h2>' + E(L('Checks', 'Проверки')) + tip(L('Each check reads the records this page holds. A list opens below only when a check finds something.', 'Каждая проверка читает записи этой панели. Список ниже открывается, только когда проверка что-то нашла.')) + '</h2></div>'
      + rows.map(function (r, ix) {
        if (r.n == null) return '<div class="cl"><b>–</b>' + E(r.na || '') + '</div>';
        if (!r.n) return '<div class="cl"><b>✓</b>' + E(r.ok) + '<span class="x">· 0' + E(r.x) + '</span></div>';
        return '<div class="cl bad"><b>!</b>' + E(r.n + ' ' + r.bad) + '<a href="#" data-chk="' + ix + '">' + E(L('Open the list ↓', 'Открыть список ↓')) + '</a></div>';
      }).join('')
      + (function () { var sd = []; try { sd = staleDefects(); } catch (e) {}   /* CM_FIND1C_V1 */
        if (!sd.length) return '<div class="cl" id="syStale1C"><b>✓</b>' + E(L('1C: no defect left open on a point that now reads normal', '1С: нет открытых дефектов на точках, которые теперь в норме')) + '</div>';
        var list = sd.slice(0, 12).map(function (x) { return x.defect + ' · ' + x.unit + ' ' + x.point + ' (' + dmy(x.at) + ')'; }).join('\n') + (sd.length > 12 ? '\n…' : '');
        return '<div class="cl bad" id="syStale1C" title="' + E(list) + '"><b>!</b>' + E(sd.length + ' ' + L('1C defects still open on a point that now reads 1–2: close them in 1C', 'дефектов 1С открыты, а точка теперь 1–2: закройте их в 1С')) + '</div>'; })();
    rows.forEach(function (r) { if (r.s) r.s.hidden = !(r.n > 0); });   /* a section shows only while its check finds something */
    box.querySelectorAll('[data-chk]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); var s = rows[+a.getAttribute('data-chk')].s; if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
    wireTips(box);
  }

  window.CMFlow = { find1C: find1C, staleDefects: staleDefects, base: base, renderFail: renderFail, renderMachine: renderMachine, syncChecks: syncChecks, dmy: dmy, renderFind: renderFind, inOneC: inOneC, compare: compare, plan: plan, dueRow: dueRow, owner1C: owner1C, warm: warm, deferOn: deferOn, comp: comp, flow: flow, stage: stage, isFind: function (r, i) { return sevOf(r, i) >= 3; }, defectOf: defectOf, render: render, cond: cond,
                    LINK_DAYS: LINK_DAYS, COMP_DAYS: COMP_DAYS, L: L };
})();
