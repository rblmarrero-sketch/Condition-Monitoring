/* WHAT A ROUND HAS TO CARRY BEFORE SAVE LETS IT GO — SUPPLIED THE WAY AN
   INSPECTOR WOULD.

   Since the 1–5 grading build:
     · every round needs a whole-machine overview photograph, an undercarriage
       round both sides, a tray round the tray, a GET round the assembly
       (mobile/index.html machineSlots);
     · a grade of 3 needs an action and a target date; 4 adds a comment and a
       close-up of the defect; 5 adds the defect code and the supervisor's
       notification (mobile/grade.js GRADE.requires).

   A suite that captures a round to test something else — upload, sync, the
   queue, a report, the trend — has to meet those rules or Save refuses and
   the suite is testing a refusal it did not mean to. Evaluate PLANT inside
   the phone page before pressing Save: it fills every REQUIRED machine
   photograph that is still empty with a tiny JPEG, categorised on the
   manifest through the same addPos() the camera uses, and completes the plan
   on every graded position that lacks one — nothing already set is touched.
   Returns how many things it supplied. */
const PLANT = `(function(){
  const PLAN = true;
  const bytes = new Uint8Array([0xff,0xd8,0xff,0xdb,1,2,3,4,5,6,7,8,9,0xff,0xd9]);
  const jpg = n => attWrap(new File([bytes], n + '.jpg', { type: 'image/jpeg' }));
  let n = 0;
  const g = (draft.positions[GEN_KEY] ||= {});
  for (const s of machineSlots(type)) {
    if (!s.req || genPhotos(draft, s.cat).length) continue;
    addPos(g, jpg(s.cat.toLowerCase()), s.cat); n++;
  }
  if (!(g.photos || []).length) delete draft.positions[GEN_KEY];
  for (const [k, p] of Object.entries(draft.positions)) {
    if (!PLAN || k === GEN_KEY || !p) continue;
    /* Since build 254 a position with a photograph or a finding needs a
       grade: a suite that planted photographs without one gets 1 – Normal,
       the honest grade for a fixture with nothing wrong in it. */
    if (!GRADE.num(p.grade) && gradeAppliesTo(k) && hasEvidence(p)) { p.grade = 1; n++; }
    const gr = GRADE.num(p.grade); if (!gr) continue;
    const req = GRADE.requires(gr);
    if (req.action && !p.action) { p.action = 'MON'; n++; }
    if (req.target && !p.target) { p.target = '2026-09-20'; n++; }
    if (req.comment && !p.comment) { p.comment = 'seen at the machine';
      if (k === curItem) { const c = document.getElementById('comment'); if (c) c.value = p.comment; } n++; }
    if (req.closeup && !hasCloseup(p)) { addPos(p, jpg('defect'), 'DEFECT'); n++; }
    if (req.defect && !p.defect) { p.defect = 'DT14-03'; n++; }
    if (req.notify && !p.notified) { p.notified = 1; n++; }
  }
  try { renderMachinePhotos(); } catch (e) {}
  return n;
})()`;
/* PHOTOS: the machine photographs only — for the suite that tests the plan
   gate itself and must find it standing. */
const PHOTOS = `(function(){
  const PLAN = false;
  const bytes = new Uint8Array([0xff,0xd8,0xff,0xdb,1,2,3,4,5,6,7,8,9,0xff,0xd9]);
  const jpg = n => attWrap(new File([bytes], n + '.jpg', { type: 'image/jpeg' }));
  let n = 0;
  const g = (draft.positions[GEN_KEY] ||= {});
  for (const s of machineSlots(type)) {
    if (!s.req || genPhotos(draft, s.cat).length) continue;
    addPos(g, jpg(s.cat.toLowerCase()), s.cat); n++;
  }
  if (!(g.photos || []).length) delete draft.positions[GEN_KEY];
  for (const [k, p] of Object.entries(draft.positions)) {
    if (!PLAN || k === GEN_KEY || !p) continue;
    /* Since build 254 a position with a photograph or a finding needs a
       grade: a suite that planted photographs without one gets 1 – Normal,
       the honest grade for a fixture with nothing wrong in it. */
    if (!GRADE.num(p.grade) && gradeAppliesTo(k) && hasEvidence(p)) { p.grade = 1; n++; }
    const gr = GRADE.num(p.grade); if (!gr) continue;
    const req = GRADE.requires(gr);
    if (req.action && !p.action) { p.action = 'MON'; n++; }
    if (req.target && !p.target) { p.target = '2026-09-20'; n++; }
    if (req.comment && !p.comment) { p.comment = 'seen at the machine';
      if (k === curItem) { const c = document.getElementById('comment'); if (c) c.value = p.comment; } n++; }
    if (req.closeup && !hasCloseup(p)) { addPos(p, jpg('defect'), 'DEFECT'); n++; }
    if (req.defect && !p.defect) { p.defect = 'DT14-03'; n++; }
    if (req.notify && !p.notified) { p.notified = 1; n++; }
  }
  try { renderMachinePhotos(); } catch (e) {}
  return n;
})()`;
module.exports = { PLANT, PHOTOS };
