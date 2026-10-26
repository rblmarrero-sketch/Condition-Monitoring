/* Temperature limits (°C) for the Temperature (TEMP) inspection type.
   Shared by the Field Capture app and the dashboard report builder, so a reading
   is judged the same way wherever it is shown.

   Each row is [pattern, warn, alarm]. The pattern is matched against the component
   code plus its English AND Russian names, so the result never depends on the UI
   language. First match wins — order matters, most specific first.

   ⚠️  These are sound general mobile-equipment values, NOT your OEM's. Confirm them
   against the machine manuals before using them to stop equipment, and edit here.  */
window.TEMP_LIMITS = [
  [/bearing|подшип/i,                70,  85, "bearing"],
  [/hub|wheel end|ступиц/i,          80,  95, "hub"],
  [/final drive|бортов/i,            85, 100, "fdrive"],
  [/gearbox|reducer|редуктор/i,      80,  95, "gearbox"],
  [/transmission|трансмис/i,         95, 110, "trans"],
  [/differential|дифференц/i,        90, 105, "diff"],
  [/hydraulic|гидро/i,               80,  95, "hyd"],
  [/coolant|radiator|охлажд/i,       95, 105, "cool"],
  [/engine|двигател/i,              100, 110, "engine"],
  [/exhaust|выхлоп/i,               450, 550, "exhaust"],
  [/brake|retard|тормоз/i,          150, 200, "brake"],
  [/motor|generator|alternator/i,    80,  95, "motor"],
  [/panel|cabinet|electric|электр/i, 60,  75, "elec"],
  [/compressor|компрессор/i,         90, 105, "comp"],
  [/conveyor|idler|roller|ролик/i,   60,  75, "conv"],
];
window.TEMP_LIMIT_DEFAULT = { warn: 80, alarm: 95, key: "*" };
/* What each row is, in words, for the office's limits panel. The key is the
   row's identity in the office's document; never renumber or rename one. */
window.TEMP_LIMIT_NAMES = {
  bearing:["Bearings","Подшипники"], hub:["Wheel hubs / wheel ends","Ступицы"],
  fdrive:["Final drives","Бортовые редукторы"], gearbox:["Gearboxes / reducers","Редукторы"],
  trans:["Transmissions","Трансмиссии"], diff:["Differentials","Дифференциалы"],
  hyd:["Hydraulics","Гидравлика"], cool:["Coolant / radiators","Охлаждение / радиаторы"],
  engine:["Engines","Двигатели"], exhaust:["Exhaust","Выхлоп"], brake:["Brakes / retarders","Тормоза / замедлители"],
  motor:["Motors / generators / alternators","Электродвигатели / генераторы"],
  elec:["Electrical panels / cabinets","Электрошкафы / панели"], comp:["Compressors","Компрессоры"],
  conv:["Conveyors / idlers / rollers","Конвейеры / ролики"], "*":["Anything else","Прочее"]
};

/* The office's limits (dashboard/wear-limits.js, kind "temp"): warn and alarm
   per row key, from a date. The latest change in force on the date replaces the
   row's figures; the pattern that picks the row is unchanged. No date = the
   latest change. */
window.TEMP_OFFICE = [];
function tempSetLimits(doc){
  window.TEMP_OFFICE = ((doc && doc.changes) || []).filter(x =>
    x && !x.void && x.kind === "temp" && x.point && isFinite(Number(x.warn)) &&
    isFinite(Number(x.alarm)) && Number(x.alarm) > Number(x.warn));
}
function tempOffice(key, at){
  const d = at || "9999-12-31"; let best = null;
  for (const l of window.TEMP_OFFICE) {
    const from = l.from || "0000-01-01";
    if (l.point !== key || from > d) continue;
    if (!best || from > (best.from || "0000-01-01") ||
        (from === (best.from || "0000-01-01") && String(l.at || "") > String(best.at || ""))) best = l;
  }
  return best;
}
/* The table's own row for a component (no office change), with its key. */
function tempBase(codeOrName){
  const t = String(codeOrName || "");
  for (const [re, w, a, k] of window.TEMP_LIMITS) if (re.test(t)) return { warn: w, alarm: a, key: k };
  return { ...window.TEMP_LIMIT_DEFAULT };
}
/* Limit for a component, matched on "<code> <english name> <russian name>". */
function tempLimit(codeOrName, at){
  const b = tempBase(codeOrName), o = tempOffice(b.key, at);
  return o ? { warn: Number(o.warn), alarm: Number(o.alarm), key: b.key, src: "limit", from: o.from } : b;
}
/* Reading -> suggested ISO 14224 severity. Within 10 °C of the warn limit is incipient. */
function tempSeverity(v, lim){
  if (v == null || v === "") return "";
  const n = parseFloat(v); if (isNaN(n)) return "";
  if (n >= lim.alarm) return "CRI";
  if (n >= lim.warn) return "DEG";
  if (n >= lim.warn - 10) return "INC";
  return "NOF";
}
window.tempLimit = tempLimit;
window.tempBase = tempBase;
window.tempSetLimits = tempSetLimits;
window.tempSeverity = tempSeverity;
