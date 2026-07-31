/* Temperature limits (°C) for the Temperature (TEMP) inspection type.
   Shared by the Field Capture app and the dashboard report builder, so a reading
   is judged the same way wherever it is shown.

   Each row is [pattern, warn, alarm]. The pattern is matched against the component
   code plus its English AND Russian names, so the result never depends on the UI
   language. First match wins — order matters, most specific first.

   ⚠️  These are sound general mobile-equipment values, NOT your OEM's. Confirm them
   against the machine manuals before using them to stop equipment, and edit here.  */
window.TEMP_LIMITS = [
  [/bearing|подшип/i,                70,  85],
  [/hub|wheel end|ступиц/i,          80,  95],
  [/final drive|бортов/i,            85, 100],
  [/gearbox|reducer|редуктор/i,      80,  95],
  [/transmission|трансмис/i,         95, 110],
  [/differential|дифференц/i,        90, 105],
  [/hydraulic|гидро/i,               80,  95],
  [/coolant|radiator|охлажд/i,       95, 105],
  [/engine|двигател/i,              100, 110],
  [/exhaust|выхлоп/i,               450, 550],
  [/brake|retard|тормоз/i,          150, 200],
  [/motor|generator|alternator/i,    80,  95],
  [/panel|cabinet|electric|электр/i, 60,  75],
  [/compressor|компрессор/i,         90, 105],
  [/conveyor|idler|roller|ролик/i,   60,  75],
];
window.TEMP_LIMIT_DEFAULT = { warn: 80, alarm: 95 };

/* Limit for a component, matched on "<code> <english name> <russian name>". */
function tempLimit(codeOrName){
  const t = String(codeOrName || "");
  for (const [re, w, a] of window.TEMP_LIMITS) if (re.test(t)) return { warn: w, alarm: a };
  return { ...window.TEMP_LIMIT_DEFAULT };
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
window.tempSeverity = tempSeverity;
