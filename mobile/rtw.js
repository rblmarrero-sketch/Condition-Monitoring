/* Return to Work — the pre-release/repair-release checklist.

   Source: the site's own "Pre_inspection" form (Peschanka Project template,
   as supplied — see CLAUDE.md for the note on that name). 23 items in two
   sections, word for word from the document, not a paraphrase — a technician
   signing this against a paper original has to find the same sentence in
   the same order. RTW_RESULTS is the form's own four-way release legend
   (S/R/N/D); S applies to a plain pre-use check with no repair behind it and
   is included for completeness even though the app's own Return to Work flow
   is specifically post-repair (R/N/D).

   Loaded by both surfaces (mobile/index.html for the capture screen,
   dashboard/index.html for history and report-core.js for the printed
   document) so the checklist text is never held in two places — same
   pattern as mp-fc.js/points.js. */
window.RTW_ITEMS = [
  { no: "1.1", section: 1, en: "Confirm the original repair work is complete.", ru: "Убедитесь, что первоначальные ремонтные работы завершены." },
  { no: "1.2", section: 1, en: "Check the display for active alarms or fault codes.", ru: "Проверьте активные аварийные сигналы / ошибки на дисплее." },
  { no: "1.3", section: 1, en: "Check the seat belt.", ru: "Проверьте ремень безопасности." },
  { no: "1.4", section: 1, en: "Check the fire extinguisher.", ru: "Проверьте огнетушитель." },
  { no: "1.5", section: 1, en: "Check that all machine lights operate correctly.", ru: "Проверьте работоспособность всех осветительных приборов на оборудовании." },
  { no: "1.6", section: 1, en: "Confirm all guards and covers are fitted and in good condition.", ru: "Убедитесь, что все защитные ограждения/кожухи находятся на своих местах и в хорошем состоянии." },
  { no: "1.7", section: 1, en: "Confirm the hoist mechanism is isolated (water trucks only).", ru: "Механизм подъёма отключён (только для поливомоечных машин / водовозов)." },
  { no: "1.8", section: 1, en: "For excavators, dozers and graders: inspect GET including teeth, blades and rippers.", ru: "*Для EX (экскаваторов), DZ (бульдозеров), GR (грейдеров): проверьте GET (рабочее навесное оборудование: коронки, ножи, рыхлители)." },
  { no: "1.9", section: 1, en: "Inspect the repair area for loose bolts, unsecured hoses and unfinished work.", ru: "Осмотрите зону ремонта/техобслуживания на наличие незатянутых болтов, незакреплённых шлангов и т.д." },
  { no: "1.10", section: 1, en: "Check the braking system.", ru: "Проверьте тормозную систему." },
  { no: "1.11", section: 1, en: "Check oil, fluid and grease levels are correct.", ru: "Проверьте правильность уровней масла и технических жидкостей, включая консистентную смазку." },
  { no: "1.12", section: 1, en: "Confirm all wheel nuts are tightened to the correct torque.", ru: "Все колёсные гайки затянуты с правильным моментом." },
  { no: "1.13", section: 1, en: "Fit a wheel-nut re-torque tag when required.", ru: "Установлена бирка о необходимости повторной протяжки (если требуется)." },
  { no: "1.14", section: 1, en: "Clean spilled oil from fill, drain and repair areas.", ru: "Удалите пролитое масло из зон заливки, слива или ремонта." },
  { no: "1.15", section: 1, en: "Confirm access ways and the cab are free of oil, grease and rags.", ru: "Убедитесь, что пути доступа и кабина очищены от масла, смазки и ветоши." },
  { no: "1.16", section: 1, en: "Confirm windows and handrails are free of oil, fluids and grease.", ru: "Убедитесь, что окна и поручни очищены от масла, жидкостей и смазки." },
  { no: "1.17", section: 1, en: "Leave the work area clean and in a satisfactory condition.", ru: "Рабочая зона должна быть убрана до удовлетворительного состояния." },
  { no: "1.18", section: 1, en: "Remove all isolation tags and securing ties from isolation points.", ru: "Снимите все бирки с точек изоляции, включая крепёжные шнуры." },
  { no: "1.19", section: 1, en: "Return specialist tools to the tool store.", ru: "Верните весь специализированный инструмент на склад инструментов." },
  { no: "2.1", section: 2, en: "Start and run the machine; check for fluid leaks.", ru: "Запустите и дайте машине поработать, проверьте наличие утечек жидкости." },
  { no: "2.2", section: 2, en: "Confirm the central lubrication system tank is full.", ru: "Убедитесь, что бак для ЦСС полон." },
  { no: "2.3", section: 2, en: "Function-test all equipment systems for 15 minutes. Confirm the area is clear before moving the machine.", ru: "Проверка работоспособности оборудования для обеспечения корректной работы всех функций (15 минут). Перед перемещением оборудования убедитесь, что площадка свободна." },
  { no: "2.4", section: 2, en: "Notify dispatch that the equipment is ready.", ru: "Уведомите диспетчера о готовности оборудования." }
];
window.RTW_SECTIONS = {
  1: { en: "Pre-release inspection", ru: "Контрольный осмотр перед возвратом в работу" },
  2: { en: "Service completion", ru: "Окончание обслуживания" }
};
/* S is a plain pre-use check with no repair behind it — not part of this
   app's own Return to Work flow (which is specifically post-repair), kept
   here because it's the form's own first legend entry and a future,
   non-repair "pre-use inspection" screen would read from the same table. */
window.RTW_RESULTS = {
  S: { en: "Safe to use", ru: "Безопасен в использовании" },
  R: { en: "Repaired and safe to use", ru: "Отремонтирован и безопасен в использовании" },
  N: { en: "Repair required, but safe to use", ru: "Требуется ремонт, но безопасен в использовании" },
  D: { en: "Faulty and unsafe to use", ru: "Неисправен и небезопасен в использовании" }
};
