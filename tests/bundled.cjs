/* THE RECORDS THE DASHBOARD USED TO HAND OUT FOR FREE.

   data/magnetic_plug.js holds sixteen magnetic-plug rounds of 29 July 2026,
   imported once from the original spreadsheets. The dashboard used to merge
   them into RECS on every load, so any suite that opened the page found
   sixteen inspections and four hundred photographs already there and never had
   to say so.

   That merge is gone. The sixteen rounds were written into the folder on
   29 August 2026, where the phones can read them too, and reading the file
   back in as well would make it a parallel source — the same round from two
   places, agreeing today and free to disagree the moment somebody corrects
   one of them.

   So the fixture moves here, which is where a test's fixture belongs. This is
   byte-for-byte the shape the old fromBundled() produced, including
   src:"bundled" and the literal `photo:` file names, so a suite about bundled
   evidence still has bundled evidence to be about — it just has to ask.

   Use:
     const BUNDLED = require("./bundled.cjs");
     await p.evaluate(BUNDLED + "()");        // after the page has loaded
*/
module.exports = `(function(){
  var d = window.CM_DATA;
  if (!d || !d.inspections || !window.CMDash) return 0;
  var recs = d.inspections.map(function(r){
    return { equip:r.equipment, date:r.date, type:"MP", cls:"HT", by:"", smu:r.motorHours||"",
      src:"bundled",
      items:(r.positions||[]).map(function(p){
        return { key:p.key, label:p.label||"", grade:p.grade||"",
          sev:(window.GRADE_SEV&&window.GRADE_SEV[p.grade])||"",
          action:"", actionLabel:"", wo:"", defectCode:"", defect:"", iso:"", isoMode:"",
          causeCode:"", cause:"",
          particle:p.particleCount||"", comp:p.componentHours||"", oil:p.oilHours||"",
          comment:p.comment||"",
          lubeProduct:p.lubeProduct||"", lubeUnlisted:p.lubeUnlisted||0,
          lubeEvidence:p.lubeEvidence||"", lubeSampled:p.lubeSampled||0,
          photo:p.photo||"", photos:p.photo?1:0, video:0 };
      }) };
  });
  window.CMDash.importRecords(recs);
  return recs.length;
})`;
