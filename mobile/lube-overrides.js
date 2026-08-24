/* ============================================================================
   ONE MACHINE THAT IS NOT LIKE THE OTHERS

   The lubrication reference is keyed by MODEL, and that is right: a capacity is
   a property of the design, not of the individual machine. Two hundred haul
   trucks of one model share one plan and should.

   Until a transmission is rebuilt with a larger sump. Or a hydraulic tank is
   changed at overhaul. Or one excavator arrives with the cold-climate package
   and the others did not. The model is still correct for every other machine,
   so editing the model is wrong — it would quietly change the figures for
   twenty units to fix one.

   This file is for that machine, and only that machine. It is keyed by UNIT.

   ── Nothing here is a guess ────────────────────────────────────────────────
   A capacity in this file overrides the manual. Put a figure in only when
   somebody has measured or read it for THAT machine, and say where it came
   from in `why` — the note is shown to the fitter, so an unexplained override
   is one nobody can act on and nobody can check.

   ── Shape ──────────────────────────────────────────────────────────────────
     "TK149": {
       why:  "transmission rebuilt 03-2026, sump 8 L larger — WO 44182",
       set:  { "4": { cap: 68.0, iv: 1000 } },   // change a compartment
       add:  [ { k:"12", en:"Aux gearbox", ru:"Доп. редуктор",
                 cap: 5.0, iv: 500, t:"gear" } ],// one this machine has and the model does not
       drop: [ "7" ]                             // one it does not have
     }

   `t` is the lubricant type, which decides the product: engine, gear,
   hydraulic, coolant, grease. Get it wrong and the fitter is offered the wrong
   oil with total confidence, so leave it out rather than guess and the
   compartment simply offers no product.
============================================================================ */
window.LUBE_OVERRIDES = {

  /* No overrides yet. The fleet's exceptions are recorded here as they are
     found, one machine at a time, each with the work order or manual page that
     established the figure. */

};
