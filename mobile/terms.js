/* THE CONTROLLED VOCABULARY — one dictionary for the phone, the dashboard
   and the reports.

   Every word here is a word a technician, a planner, a supervisor or a
   reliability engineer already uses. The two surfaces and the report engine
   used to carry their own tables, and drifted: one screen said "Missed" where
   the other said "Overdue", "Put off" beside "Deferred", "Nobody owns it" over
   a column headed "Responsible". A term is written ONCE, in both languages,
   and each surface's own table points at it — so the phone, the office and a
   signed report cannot disagree about what a thing is called.

   Rules:
     · English and Russian carry the same operational meaning, never a literal
       translation of software words.
     · No internal vocabulary: nothing is "held back", "on hold", "triaged",
       "walked", "put off" or "never done" on a screen or in a report.
     · The Grade is the only condition decision; "severity" is derived from it
       and is never a field.
   tests/terms.cjs holds both languages to the same key set and holds every
   visible string on both surfaces and in the reports to this list. */
(function (root) {
  const en = {
    /* condition */
    grade: "Condition Grade", grade_short: "Grade", severity: "Severity",
    finding_critical: "Critical finding", finding_severe: "Severe finding", finding_degraded: "Degraded finding",
    component: "Component", point: "Inspection point", failure_mode: "Failure mode", direct_cause: "Direct cause",
    measurement: "Measurement", comment: "Comment",
    /* work */
    rec_action: "Recommended action", maint_action: "Maintenance action", action_required: "Action required",
    owner: "Owner", due: "Due date", wo: "Work order", status: "Status", priority: "Priority",
    owner_unassigned: "Owner not assigned",
    need_owner: "Owner required", need_due: "Due date required", need_action: "Action required",
    need_wo: "Work order required", need_prio: "Priority required", need_reason: "Reason required",
    /* schedule */
    overdue: "Overdue", due_soon: "Due soon", deferred: "Deferred", never_inspected: "Never inspected",
    completed: "Completed", insp_overdue: "Inspection overdue", deferred_to: "Deferred to {d}", not_being_done: "Not being done",
    defer_reason: "Reason inspection was not completed", hours_per_day: "Operating hours/day",
    /* evidence */
    evidence_received: "Evidence received", evidence_verified: "Evidence verified", evidence_missing: "Evidence missing",
    photo_not_received: "Photo file not received",
    /* data quality */
    correction_required: "Correction required", insp_needs_correction: "Inspection needs correction",
    component_unidentified: "Component not identified", grade_review: "Grade review required",
    server_unconfirmed: "Server confirmation unavailable",
    /* the phone's sync states, in the technician's words */
    saved_here: "Saved on this phone", waiting: "Waiting to send", sending: "Sending", sent: "Sent successfully",
    confirmed: "Confirmed on server", verified: "Verified byte for byte", attention: "Needs attention",
    all_sent: "All sent", offline_saved: "Offline — work saved here", send_now: "Send now",
    /* readiness */
    ready: "Ready", ready_warn: "Ready with warning", not_ready: "Not ready",
  };
  const ru = {
    grade: "Оценка состояния", grade_short: "Оценка", severity: "Степень",
    finding_critical: "Критичная находка", finding_severe: "Серьёзная находка", finding_degraded: "Находка с ухудшением",
    component: "Узел", point: "Точка осмотра", failure_mode: "Вид отказа", direct_cause: "Непосредственная причина",
    measurement: "Замер", comment: "Комментарий",
    rec_action: "Рекомендуемое действие", maint_action: "Работа по обслуживанию", action_required: "Требуется действие",
    owner: "Ответственный", due: "Срок", wo: "Заказ-наряд", status: "Статус", priority: "Приоритет",
    owner_unassigned: "Ответственный не назначен",
    need_owner: "Нужен ответственный", need_due: "Нужен срок", need_action: "Нужно действие",
    need_wo: "Нужен заказ-наряд", need_prio: "Нужен приоритет", need_reason: "Нужна причина",
    overdue: "Просрочено", due_soon: "Скоро срок", deferred: "Отложено", never_inspected: "Не проводился",
    completed: "Выполнено", insp_overdue: "Осмотр просрочен", deferred_to: "Отложено до {d}", not_being_done: "Не выполняется",
    defer_reason: "Причина невыполнения осмотра", hours_per_day: "Наработка, ч/сут",
    evidence_received: "Фото получены", evidence_verified: "Фото проверены", evidence_missing: "Фото отсутствуют",
    photo_not_received: "Файл фото не получен",
    correction_required: "Требуется исправление", insp_needs_correction: "Осмотр требует исправления",
    component_unidentified: "Узел не определён", grade_review: "Требуется проверка оценки",
    server_unconfirmed: "Нет подтверждения сервера",
    saved_here: "Сохранено на этом телефоне", waiting: "Ожидает отправки", sending: "Отправка", sent: "Отправлено",
    confirmed: "Подтверждено сервером", verified: "Проверено побайтно", attention: "Требует внимания",
    all_sent: "Всё отправлено", offline_saved: "Нет связи — работа сохранена здесь", send_now: "Отправить сейчас",
    ready: "Готово", ready_warn: "Готово, есть замечание", not_ready: "Не готово",
  };
  /* Words that must not appear on a screen or in a report, in either
     language — internal vocabulary the field has had to translate for itself. */
  const banned = [/\bheld back\b/i, /\bon hold\b/i, /point with no key/i, /\btriage/i, /cannot be trusted/i,
                  /not measurable from here/i, /nobody owns/i, /needs a plan/i, /\bwalked\b/i, /\bput off\b/i,
                  /\bnever done\b/i, /\bmissed\b/i, /на удержании/i, /пропущено/i];
  const T = {
    en, ru,
    /* A term in a language, with {d}-style substitution; the English where a
       language has no entry, the key where nothing has. */
    t(lang, key, vars) {
      const tab = T[lang] || en;
      let s = tab[key] != null ? tab[key] : (en[key] != null ? en[key] : key);
      if (vars) Object.keys(vars).forEach(v => { s = s.split("{" + v + "}").join(vars[v]); });
      return s;
    },
    keys() { return Object.keys(en); },
    banned,
    /* Does a visible string carry a banned word? Returns the pattern or null. */
    offends(s) { const x = String(s || ""); for (const re of banned) if (re.test(x)) return re; return null; },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = T;
  root.TERMS = T;
})(typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : globalThis));
