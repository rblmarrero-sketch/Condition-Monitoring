/* THE EIGHT SINGLE-INSPECTION TYPE BODIES, to the v2 templates
   (CM_Actual_Report_Templates_v2.pdf pages 1–12).

   Each type must carry the template's own named subheading and its own table
   or card grid, read from the one normalised item shape both surfaces build,
   with honest empty states — "Not recorded", "Not measured", "No finding" —
   where a field the template prints was not captured. Common to every sheet:
   the CONDITION RATING / LEVEL / DECISION strip, the MODEL/SMU/INSPECTED BY/
   LOCATION metadata, the Maintenance action strip, the DATA/EVIDENCE/REVIEW/
   APPROVAL status strip and the three-role approval table.

   Run: node tests/rpttypes.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (c, n, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : ""));
                          if (!c) fails.push(n); };

/* One raw folder-shape round per type, the shape importRecords normalises.
   MP/FC carry particle + component/oil hours; INSP a defect + detection +
   operating status; TEMP a reading with method and one reading with NOTHING
   else (the honest-limitation case); UC/TB measurements; GET grade-only and
   graded-with-mm points; LUBE a compliant compartment and an off-standard one. */
const SEED = `(function(){
  const recs = [
   { equip:"TK900", date:"2026-08-10", type:"MP", cls:"HT", by:"Ivanov", smu:9100, sup:"Petrov",
     gps:{lat:63.12,lon:169.24,acc:6},
     items:[
       { key:"1", label:"Engine", grade:3, particle:"18", comp:"5200", oil:"480",
         defect:"Ferrous flakes", cause:"Bearing wear", action:"Plan corrective work",
         resp:"A. Ivanov", wo:"WO-1", target:"2026-12-01", photos:[{name:"a.jpg"}] },
       { key:"4", label:"Differential", grade:2, particle:"6", comp:"5200", oil:"480", photos:[] },
       { key:"4E", label:"Left Rear Final Drive", grade:1, particle:"", comp:"", oil:"", photos:[] } ] },
   /* An old-scheme round: the two rear final drives each captured under two
      position codes (4C+4E, 4D+4F). The report must fold each pair into one
      position with both angles' photographs and the worse grade. */
   { equip:"TK905", date:"2026-08-19", type:"MP", cls:"HT", by:"Ivanov", smu:9400,
     gps:{lat:63.12,lon:169.24,acc:6},
     items:[
       { key:"4C", label:"Left Rear Final Drive", grade:1, photos:["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="] },
       { key:"4D", label:"Right Rear Final Drive", grade:1, photos:["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="] },
       { key:"4E", label:"Left Rear Final Drive", grade:3, defect:"Ferrous flakes on plug",
         action:"Plan corrective work", photos:["data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"] },
       { key:"4F", label:"Right Rear Final Drive", grade:1, photos:["data:image/bmp;base64,Qk1G"] } ] },
   { equip:"TK901", date:"2026-08-11", type:"FC", cls:"HT", by:"Ivanov", smu:9200,
     items:[
       { key:"ENG", label:"Engine filter", grade:2, particle:"7", comp:"500", oil:"500",
         defect:"Light media debris", cause:"Normal service", action:"Next planned",
         photos:[{name:"f.jpg"}] } ] },
   { equip:"EX900", date:"2026-08-12", type:"INSP", cls:"EXC", by:"Hasenov", smu:7300,
     items:[
       { key:"HYD", label:"Hydraulics", grade:3, defect:"Weep at cylinder", defectCode:"FM-HYD-02",
         detection:"DM-02", detectionLabel:"Visual inspection", action:"Monitor",
         opstat:"Operating", photos:[{name:"i.jpg"}] } ] },
   { equip:"EX901", date:"2026-08-13", type:"TEMP", cls:"EXC", by:"Hasenov", smu:7400,
     items:[
       { key:"BRG", label:"Slew bearing", grade:2, tempC:78, ambC:22, tempMethod:"IR",
         opstat:"Under load", defect:"Warmer than paired unit", action:"Recheck",
         detection:"DM-11", detectionLabel:"Thermography", photos:[{name:"t.jpg"}] },
       { key:"MOT", label:"Drive motor", grade:"", tempC:96, ambC:"", tempMethod:"", photos:[] } ] },
   { equip:"DZ900", date:"2026-08-14", type:"UC", cls:"DOZ", by:"Hasenov", smu:6100,
     items:[
       { key:"L.LINK", label:"Track link L", grade:4, mm:52, newMM:78, condemnMM:50, wearPct:93, band:"act",
         defect:"Near condemn", action:"Plan intervention", photos:[{name:"u.jpg"}] },
       { key:"R.LINK", label:"Track link R", grade:1, mm:70, newMM:78, condemnMM:50, wearPct:29, band:"done" },
       { key:"L.SHOE", label:"Track shoe L", grade:"", mm:null, reason:"RE-01" } ] },
   { equip:"LD900", date:"2026-08-15", type:"GET", cls:"LDR", by:"Hasenov", smu:5200,
     items:[
       { key:"TOOTH", label:"Tooth", grade:3, defect:"Worn tip", action:"Replace soon", photos:[{name:"g.jpg"}] },
       { key:"ADAPTER", label:"Adapter", grade:2, defect:"Light wear", action:"" },
       { key:"PIN", label:"Pin", grade:"", defect:"", action:"" } ] },
   /* A registered tray machine (TK101 → body model HM400) with real floor
      stations that carry limits (20 → 3 mm), so a percentage is defensible and
      the Controlling readings section computes — the way it does on a live TB
      round. The office recomputes % from the model reference; the mm is what is
      seeded. */
   { equip:"TK101", date:"2026-08-16", type:"TB", cls:"AT", by:"Hasenov", smu:9300,
     gps:{lat:63.12,lon:169.24,acc:6},
     items:[
       { key:"F31", label:"Floor front", grade:3, mm:11,
         zone:"FLOOR", zoneLabel:"Floor", defect:"Half worn", action:"Monitor", photos:[{name:"b.jpg"}] },
       { key:"F32", label:"Floor rear", grade:1, mm:18, zone:"FLOOR", zoneLabel:"Floor" } ] },
   { equip:"EX902", date:"2026-08-17", type:"LUBE", cls:"EXC", by:"Hasenov", smu:7500,
     items:[
       { key:"ENG", label:"Engine oil", grade:1, lubeProduct:"Shell Rimula R4", lubeEvidence:"label", lubeSampled:1 },
       { key:"HYD", label:"Hydraulic", grade:1, lubeProduct:"Generic HYD 46", lubeEvidence:"operator", lubeSampled:0,
         defect:"Off standard", action:"Correct at next service" } ] },
  ];
  window.CMDash.importRecords(recs);
  return {};
})()`;

const textOf = (p, key, lang) => p.evaluate(({ key, lang }) => {
  const secs = CMReport.sectionsFor("one", key, { lang });
  const div = document.createElement("div"); div.innerHTML = secs.map(s => s.html || "").join("\n");
  return div.innerText.replace(/\s+/g, " ").trim();
}, { key, lang });

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1600);
  await p.evaluate(BUNDLED + "()");
  await p.waitForTimeout(300);
  await p.evaluate(() => { CMDrive.saveEdit = () => Promise.resolve({ ok: true }); });
  await p.evaluate(SEED);
  const k = (e, d, t) => `${e}|${d}|${t}`;

  console.log("\n0. EVERY SINGLE SHEET CARRIES THE COMMON FURNITURE");
  const mp = await textOf(p, k("TK900", "2026-08-10", "MP"), "en");
  ok(/Condition scale:/.test(mp), "the rating strip and scale");
  ok(/Model/.test(mp) && /Inspected by/.test(mp) && /Location/.test(mp), "the metadata strip");
  ok(/Maintenance action/.test(mp), "the maintenance-action strip");
  ok(/DATA[\s\S]*EVIDENCE[\s\S]*REVIEW[\s\S]*APPROVAL/.test(mp), "the DATA/EVIDENCE/REVIEW/APPROVAL status strip");
  ok(/CM Technician/.test(mp) && /Reliability Engineer/.test(mp) && /Maintenance Supervisor/.test(mp),
     "the three-role approval table");
  ok(/Reliability Engineer[\s\S]*Pending/.test(mp) || /Pending/.test(mp),
     "  review and approval left as open/pending, never printed approved");

  console.log("\n1. MAGNETIC PLUG — equipment and component evidence, every plug a card");
  ok(/Equipment and component evidence/.test(mp), "the template subheading");
  ok(/Ferrous flakes/.test(mp), "  the particle finding is printed");
  ok(/5200/.test(mp) && /480/.test(mp), "  component and oil hours are printed");
  ok(/4E/.test(mp), "  the clean plug still earns its card (the reading is the record)");

  console.log("\n1b. THE RETIRED 4C/4D ANGLES FOLD INTO 4E/4F");
  const fold = await textOf(p, k("TK905", "2026-08-19", "MP"), "en");
  ok(!/>?4C\b/.test(fold) && !/>?4D\b/.test(fold), "4C and 4D are gone from the sheet",
     (fold.match(/4[CDEF]/g) || []).join(" "));
  ok(/4E/.test(fold) && /4F/.test(fold), "  the two drives show under 4E and 4F");
  ok(/Ferrous flakes on plug/.test(fold), "  the worse angle's finding is kept");
  const foldImgs = await p.evaluate((key) => {
    const secs = CMReport.sectionsFor("one", key, { lang: "en", photos: true });
    return secs.map(s => (s.html || "").match(/<img[^>]+src="data:/g) || []).reduce((a, b) => a + b.length, 0);
  }, k("TK905", "2026-08-19", "MP"));
  ok(foldImgs >= 4, "  both angles' photographs are carried, not one", foldImgs + " images");

  console.log("\n2. FILTER CUT — the filter findings table");
  const fc = await textOf(p, k("TK901", "2026-08-11", "FC"), "en");
  ok(/Filter findings/.test(fc), "the template subheading");
  ok(/Service hours/.test(fc) && /Debris \/ defect/.test(fc), "  the template columns");
  ok(/Light media debris/.test(fc) && /Next planned/.test(fc), "  debris and action printed");

  console.log("\n3. GENERAL INSPECTION — findings by component or system");
  const insp = await textOf(p, k("EX900", "2026-08-12", "INSP"), "en");
  ok(/Findings by component or system/.test(insp), "the template subheading");
  ok(/Detection/.test(insp) && /Visual inspection/.test(insp), "  the detection method column");
  ok(/Operating/.test(insp), "  the operating status");
  ok(/Weep at cylinder/.test(insp), "  the defect");

  console.log("\n4. TEMPERATURE — results table and the honest limitation");
  const temp = await textOf(p, k("EX901", "2026-08-13", "TEMP"), "en");
  ok(/Temperature results/.test(temp), "the template subheading");
  ok(/Measured/.test(temp) && /Ambient/.test(temp) && /Method/.test(temp), "  measured / ambient / method columns");
  ok(/IR gun/.test(temp), "  the method is named from the code");
  ok(/78/.test(temp) && /96/.test(temp), "  both readings print");
  ok(/Technical limitation/.test(temp),
     "  the reading with no ambient/method/comparison raises the limitation, not a defect conclusion");

  console.log("\n5. UNDERCARRIAGE — condition summary and the measurement register");
  const uc = await textOf(p, k("DZ900", "2026-08-14", "UC"), "en");
  ok(/Condition summary/.test(uc), "the condition-summary strip");
  ok(/At \/ past limit/.test(uc) && /Above 80%/.test(uc) && /Not measured/.test(uc), "  its cells");
  ok(/93%/.test(uc), "  the controlling point's percent");
  ok(/52/.test(uc) && /70/.test(uc), "  the register keeps every reading");
  ok(!/L\.SHOE[\s\S]{0,30}1 – Normal/.test(uc), "  an unmeasured point is not called Normal");

  console.log("\n6. GET — the eleven-point register, grade required, mm optional");
  const get = await textOf(p, k("LD900", "2026-08-15", "GET"), "en");
  ok(/Point register/.test(get), "the template subheading");
  ok(/Worn tip/.test(get) && /Light wear/.test(get), "  the graded points print");
  ok(/Not measured/.test(get), "  a point with no millimetre says Not measured, not zero wear");

  console.log("\n7. DUMP BODY — controlling readings then the complete register");
  const tb = await textOf(p, k("TK101", "2026-08-16", "TB"), "en");
  ok(/Controlling readings/.test(tb), "the controlling-readings subheading");
  ok(/Condition summary/.test(tb), "  and the condition summary");
  ok(/11/.test(tb) && /18/.test(tb), "  every station reading is retained");

  console.log("\n8. LUBRICATION — the compartment audit, off-standard stated");
  const lube = await textOf(p, k("EX902", "2026-08-17", "LUBE"), "en");
  ok(/Shell Rimula R4/.test(lube) && /Generic HYD 46/.test(lube), "the product found in each compartment");
  ok(/off|Off standard|Correct at next service/i.test(lube),
     "  the off-standard compartment is stated, not hidden by its grade");

  console.log("\n9. IN RUSSIAN, THE SAME STRUCTURE TRANSLATES");
  const mpru = await textOf(p, k("TK900", "2026-08-10", "MP"), "ru");
  ok(/Данные и фото по компонентам/.test(mpru), "MP subheading translates");
  const tempru = await textOf(p, k("EX901", "2026-08-13", "TEMP"), "ru");
  ok(/Результаты по температуре/.test(tempru), "TEMP subheading translates");
  ok(/Техническое ограничение/.test(tempru), "  the limitation translates");
  const ucru = await textOf(p, k("DZ900", "2026-08-14", "UC"), "ru");
  ok(/Сводка состояния/.test(ucru), "UC condition summary translates");

  ok(errs.length === 0, "no page errors", errs.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
