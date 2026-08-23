/* ============================================================================
   Condition Monitoring — the report, once.
   ----------------------------------------------------------------------------
   The phone and the dashboard print the same document. Not a similar one — the
   same stylesheet, the same four sections in the same order, the same wording,
   the same wear bar. Two implementations drift the moment one of them is
   touched, and a superintendent holding a page from the pit next to a page from
   the office should not have to work out which one is current.

   Each end feeds it the same normalised shape and gets back a list of sections
   to lay out. Nothing in here knows about IndexedDB, Drive, blobs or the
   register — that is the host's job.

     CMR.CSS                 the stylesheet, scoped under #rptRoot
     CMR.sections(ctx)       -> [{nb:boolean, html:string}]
     CMR.paginate(opts)      rasterise section by section into a jsPDF doc

   ctx = {
     lang    "en" | "ru"
     title   document title
     sub     eyebrow above it
     stamp   Date
     sevLabel(code)          "Critical" / "Критический"
     records [ normalised, see below ]
     extra   [ {nb,html} ]   optional sections placed before the legend
   }

   record = {
     equip, clsLabel, type, typeLabel, date, by, sup, smu,
     gps:{lat,lon}|null, signUrl:""|dataURI, wear:bool, temp:bool,
     items:[{ key, name, code, grade, sev, defect, defectCode, iso,
              cause, action, wo, comment, readings:[str], photos:[url],
              w:{mm,newMM,condemnMM,pct,band,refSrc,reason,reasonLabel,stood}|null,
              lube:{product, evid:{en,ru}, samp:bool, want, off:bool}|null }]
   }
   ========================================================================== */
(function (root) {
  "use strict";
  var CMR = {};

  CMR.CSS = `
#rptRoot{font:400 12px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  color:#16242c;width:760px;background:#fff;letter-spacing:0;}
#rptRoot *{box-sizing:border-box;margin:0;padding:0;}
#rptRoot .sec{width:760px;background:#fff;}
#rptRoot .eyebrow{font-size:9.5px;font-weight:700;letter-spacing:.16em;
  text-transform:uppercase;color:#5b6670;}
#rptRoot .h1{font-size:29px;font-weight:800;letter-spacing:-.02em;line-height:1.1;margin-top:7px;}
#rptRoot .h2{font-size:16px;font-weight:750;letter-spacing:-.01em;}
#rptRoot .lede{font-size:15px;line-height:1.45;font-weight:500;color:#12161a;}
#rptRoot .muted{color:#5b6670;}
#rptRoot .rule{height:2.5px;background:#16242c;}
#rptRoot .hair{height:1px;background:#dfe4e9;}
#rptRoot .num{font-variant-numeric:tabular-nums;}
#rptRoot .sechd{display:flex;align-items:baseline;gap:10px;
  border-bottom:2.5px solid #16242c;padding-bottom:6px;margin-bottom:13px;}
/* Copper — the one identity colour on a printed page that otherwise stays
   black on white so the data is never tinted by a brand. */
#rptRoot .sechd .n{font-size:9.5px;font-weight:800;letter-spacing:.16em;color:#8a4526;}

/* the four numbers on the cover */
#rptRoot .stats{display:flex;gap:0;border-top:1px solid #dfe4e9;border-bottom:1px solid #dfe4e9;}
#rptRoot .stat{flex:1;padding:13px 16px 14px;border-right:1px solid #dfe4e9;}
#rptRoot .stat:last-child{border-right:0;}
#rptRoot .stat .k{font-size:9px;font-weight:700;letter-spacing:.13em;
  text-transform:uppercase;color:#5b6670;}
#rptRoot .stat .v{font-size:27px;font-weight:800;line-height:1.1;margin-top:5px;
  font-variant-numeric:tabular-nums;letter-spacing:-.02em;}
#rptRoot .stat .s{font-size:10.5px;color:#5b6670;margin-top:1px;}

/* condition of everything inspected, as one bar */
#rptRoot .bar{display:flex;height:22px;border-radius:3px;overflow:hidden;background:#eef1f4;}
#rptRoot .bar span{display:block;height:22px;}
#rptRoot .barkey{display:flex;flex-wrap:wrap;gap:6px 20px;margin-top:9px;}
#rptRoot .barkey .i{display:flex;align-items:center;gap:6px;font-size:10.5px;}
#rptRoot .barkey .sw{width:9px;height:9px;border-radius:2px;display:block;}
#rptRoot .barkey b{font-variant-numeric:tabular-nums;}

/* tables: hairlines across, never down */
#rptRoot table{width:100%;border-collapse:collapse;}
#rptRoot th{font-size:8.5px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;
  color:#5b6670;text-align:left;padding:0 8px 5px;border-bottom:1px solid #12161a;
  vertical-align:bottom;}
#rptRoot td{font-size:11px;line-height:1.4;padding:6px 8px;border-bottom:1px solid #eaeef1;
  vertical-align:top;}
#rptRoot tr.zebra td{background:#fafbfc;}
#rptRoot td.c,#rptRoot th.c{text-align:center;}
#rptRoot td.r,#rptRoot th.r{text-align:right;}
#rptRoot td.n{font-variant-numeric:tabular-nums;white-space:nowrap;}
#rptRoot td.stripe{border-left:3px solid transparent;padding-left:8px;}
#rptRoot .unit{font-weight:750;letter-spacing:-.01em;white-space:nowrap;}
#rptRoot .code{font-size:9px;color:#7b858e;font-variant-numeric:tabular-nums;
  letter-spacing:.02em;white-space:nowrap;}

/* chips */
#rptRoot .g{display:inline-block;min-width:17px;text-align:center;color:#fff;
  font-size:10px;font-weight:800;border-radius:3px;padding:1px 5px;line-height:1.4;}
/* Outlined, never filled. A solid chip beside a solid severity chip reads as a
   second opinion on how bad the part is; the priority is not that — it is how
   the job gets scheduled. The outline keeps the urgency colour and says so. */
#rptRoot .prio{display:inline-block;font-size:8px;font-weight:800;letter-spacing:.06em;
  background:#fff;border:1px solid currentColor;border-radius:2.5px;
  padding:1px 4.5px;vertical-align:1px;}
#rptRoot .sev{display:inline-block;font-size:8.5px;font-weight:700;letter-spacing:.07em;
  text-transform:uppercase;color:#fff;border-radius:3px;padding:2px 6px;line-height:1.25;}

/* the machine block */
#rptRoot .mach{border-top:2.5px solid #16242c;padding-top:9px;}
#rptRoot .machhd{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;}
#rptRoot .machhd .u{font-size:19px;font-weight:800;letter-spacing:-.02em;}
#rptRoot .machhd .c{font-size:11.5px;color:#5b6670;}
#rptRoot .meta{display:flex;flex-wrap:wrap;gap:3px 22px;margin-top:6px;}
#rptRoot .meta .m{font-size:10px;}
#rptRoot .meta .m i{font-style:normal;color:#7b858e;letter-spacing:.06em;
  text-transform:uppercase;font-size:8.5px;font-weight:700;margin-right:5px;}
#rptRoot .verdict{font-size:12.5px;font-weight:650;padding:7px 11px;border-radius:4px;
  margin-top:10px;}
#rptRoot .v-ok{background:#eef6ef;color:#146b2c;}
#rptRoot .v-watch{background:#fdf5e3;color:#8a6100;}
#rptRoot .v-act{background:#fcecea;color:#98201a;}

/* undercarriage measurement grid — two columns of readings, not one long list */
#rptRoot .meas{display:flex;gap:20px;}
/* flex:1 alone leaves min-width:auto, so a half can never shrink below its own
   min-content — and its min-content is set by a .code line that is nowrap and
   now says "no reference for this model / нет эталона для этой модели". Two of
   those and the grid came out 780px on a 760px page, with the wear bars off
   the right edge of the paper and no error anywhere. */
#rptRoot .meas > div{flex:1 1 0;min-width:0;}
/* Fixed layout does not clip what will not fit, it overlaps it — MEASURED ran
   straight over WORN. The numeric columns are sized for their own headings
   and the padding is trimmed to buy them the room. */
#rptRoot .meas table{table-layout:fixed;}
#rptRoot .meas th{padding:0 4px 5px;}
#rptRoot .meas td{padding:6px 4px;}
#rptRoot .meas .code{white-space:normal;}
#rptRoot .meas .wb{min-width:0;}
#rptRoot .meas td{overflow-wrap:anywhere;}
#rptRoot .wb{display:block;height:5px;background:#eef1f4;border-radius:3px;
  position:relative;overflow:hidden;min-width:52px;}
#rptRoot .wb i{display:block;height:5px;border-radius:3px;}
#rptRoot .subhd{font-size:9px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;
  color:#5b6670;margin-bottom:5px;}

/* The machine, printed. On screen the frame is a picker; on paper it is the one
   picture that says where the wear is without reading a single number — a red
   puck at roller 6 is a place you can walk to. Colours are literal here rather
   than themed: this renders on white paper, not in a theme. */
/* The app's own screen rules use these class names and let the frames run 32 px
   past the column so they can be scrolled under a thumb. On paper there is
   nothing to scroll, so the width is reclaimed here explicitly — without this
   the last roller and the grouser row fell off the right edge of the page. */
#rptRoot .ucmaps{display:flex;flex-direction:column;gap:7px;margin:9px 0 4px;
  width:100%;max-width:470px;flex:0 0 auto;}
/* The frames at the size a puck stays readable, and everything that explains
   them in the column of paper that was left over beside them. */
#rptRoot .mapblock{display:flex;gap:18px;align-items:flex-start;}
#rptRoot .mapblock .ucmaps{margin:9px 0 4px;flex:0 0 470px;}
#rptRoot .mapside{flex:1 1 0;min-width:0;padding-top:11px;}
#rptRoot .mapside .mapkey{flex-direction:column;gap:5px;margin-top:0;}
#rptRoot .mapside .pkey{flex-direction:column;gap:4px;margin-top:9px;max-width:none;}
#rptRoot .mapside .ckey{grid-template-columns:1fr;gap:4px;max-width:none;}
#rptRoot .ucmapwrap{background:#f6f8f9;border:1px solid #dfe4e9;border-radius:8px;padding:3px 2px;
  width:100%;margin:0;flex:0 0 auto;overflow:visible;}
#rptRoot .ucmapwrap::after{content:none;}
/* The tray, at the size the numbers inside it can be read ------------------
   A track frame is a diagram with eleven pucks on it and reads fine in half a
   column. A dump body is sixty-three stations with a millimetre printed inside
   each one, and at 470px the digits came out under 5px tall — present, and
   useless. So the tray gets the whole width and the key goes underneath it.
   The zone table follows the key rather than the drawing, because the key is
   what makes the drawing readable and the table is what you check afterwards. */
#rptRoot .mapblock.wide{display:block;}
#rptRoot .mapblock.wide .ucmaps{flex:none;width:100%;max-width:none;margin:6px 0 2px;}
#rptRoot .mapblock.wide .ucmapwrap{padding:2px;}
#rptRoot .mapblock.wide .bodymap{max-height:none;}
#rptRoot .mapblock.wide .mapfoot{display:flex;gap:20px;align-items:flex-start;}
#rptRoot .mapblock.wide .mapside{flex:0 0 208px;padding-top:1px;}
#rptRoot .mapblock.wide .mapzone{flex:1 1 0;min-width:0;}
#rptRoot .mapblock.wide .mapzone .tbzone{margin:0;}
/* ---- the tray, printed ---------------------------------------------------
   Often on a grey office printer, so the state is carried by the fill AND by
   the outline weight — a body at the condemn limit has to read as different
   from a serviceable one on a page with no colour in it at all. */
#rptRoot .bodymap{display:block;width:100%;height:auto;max-height:300px;margin:0 auto;}
#rptRoot .bm-z{stroke:#c8d0d6;stroke-width:1;pointer-events:none;}
/* The surface tint rises with height off the floor, the same as on screen —
   and on a grey office printer these four steps still separate. */
#rptRoot .bm-z.s0{fill:#f7f9fa;} #rptRoot .bm-z.s1{fill:#eef2f5;}
#rptRoot .bm-z.s2{fill:#e4eaf0;} #rptRoot .bm-z.s3{fill:#dbe3ec;}
#rptRoot .bm-z.done{fill:#e8f4ea;}
#rptRoot .bm-z.watch{fill:#fdf1d6;}
#rptRoot .bm-z.act{fill:#fbe3e1;}
#rptRoot .bm-fold{fill:none;stroke:#8b939b;stroke-width:1.4;stroke-dasharray:6 4;}
#rptRoot .bm-div{fill:none;stroke:#c8d0d6;stroke-width:.9;}
#rptRoot .bm-lip{fill:none;stroke:#8a6300;stroke-width:4;stroke-linecap:round;}
#rptRoot .bm-face{fill:#5b6670;font:700 11px/1 inherit;letter-spacing:.12em;
  paint-order:stroke fill;stroke:#fff;stroke-width:3px;stroke-linejoin:round;}
#rptRoot .bm-way{fill:#8b939b;font:700 10px/1 inherit;letter-spacing:.1em;}
#rptRoot .bm-hit{fill:none;}
/* Printed, often in grey, so state is carried by the fill AND the outline
   weight — a station at the limit has to read as different on a page with no
   colour in it at all. */
#rptRoot .bm-dot{fill:#fff;stroke:#8b939b;stroke-width:1.2;}
#rptRoot .bm-p.done .bm-dot{fill:#0ca30c;stroke:#0ca30c;}
#rptRoot .bm-p.watch .bm-dot{fill:#fab219;stroke:#8a6300;stroke-width:1.6;}
#rptRoot .bm-p.act .bm-dot{fill:#d03b3b;stroke:#8c1f1f;stroke-width:2;}
#rptRoot .bm-p.na .bm-dot{fill:#fff;stroke:#8b939b;stroke-dasharray:2 2;}
/* The millimetres, inside the station they belong to. White on the filled
   states and dark on the hollow one — a number is only useful if it can be
   read on the colour underneath it, and three of the four states are filled. */
#rptRoot .bm-val{font:700 11px/1 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  fill:#fff;letter-spacing:-.02em;}
#rptRoot .bm-p.na .bm-val,#rptRoot .bm-p .bm-val{fill:#fff;}
#rptRoot .bm-p:not(.done):not(.watch):not(.act) .bm-val{fill:#16242c;}
#rptRoot .bm-p.watch .bm-val{fill:#3a2a00;}
#rptRoot .bm-tag{display:none;}
/* The drawing says where; this says how bad. Named by the THINNEST station in
   each zone, never the mean — an average is the number that lets a body pass. */
#rptRoot .tbzone{width:100%;max-width:470px;border-collapse:collapse;margin:8px 0 4px;
  font-size:11px;font-variant-numeric:tabular-nums;}
#rptRoot .tbzone th{text-align:left;font-weight:700;color:#5b6670;border-bottom:1px solid #c8d0d6;
  padding:3px 6px 3px 0;}
#rptRoot .tbzone td{padding:3px 6px 3px 0;border-bottom:1px solid #eef1f4;}
#rptRoot .tbzone .num{text-align:right;padding-right:12px;}
#rptRoot .ucmap{display:block;width:100%;height:auto;}
/* ---- the photographed walk, printed ------------------------------------
   The same picture the inspector tapped: the machine's own photograph with
   the catalogue's numbers on the parts they name. The pucks are smaller than
   on glass because nothing here has to survive a gloved thumb, and the
   numbers read at 470px on paper at any size a finger needed. */
#rptRoot .ucmap.photo .um-photo{opacity:1;}
/* State is carried by the FILL and by the RING, never by the fill alone.

   Measured, not assumed: serviceable green against watch orange is dE 5.6
   under protanopia and green against red is dE 4.1 under deuteranopia — the
   same colour to roughly one man in twelve. The number on a puck is its
   POSITION, not its state, so nothing else on the drawing disambiguates it,
   and the drawing exists precisely so nobody has to read the table.

   A darker ring, thickening with severity, fixes it for colour-blind readers
   and for the grey office printer at the same time. The tray map has done it
   this way since it shipped; this is the same treatment, not a new idea. */
#rptRoot .um-num .um-puck{fill:#fff;stroke:#16242c;stroke-width:1.6;}
#rptRoot .um-num .um-n{font:700 12px/1 inherit;fill:#16242c;}
#rptRoot .um-num.done .um-puck{fill:#0ca30c;stroke:#0a6b0a;stroke-width:1.2;}
#rptRoot .um-num.watch .um-puck{fill:#ec835a;stroke:#8a3d16;stroke-width:2.4;}
#rptRoot .um-num.act .um-puck{fill:#d03b3b;stroke:#5e1010;stroke-width:3.4;}
#rptRoot .um-num.na .um-puck{fill:#eef1f4;stroke:#8a979e;stroke-width:1.4;stroke-dasharray:3 2;}
#rptRoot .um-num.done .um-n,#rptRoot .um-num.watch .um-n,
#rptRoot .um-num.act .um-n{fill:#fff;}
#rptRoot .um-num .um-hit{display:none;}
#rptRoot .umside{font-size:9px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;
  color:#5b6670;text-align:center;padding:1px 0 3px;}
#rptRoot .um-side{font:700 17px/1 inherit;fill:#8b939b;letter-spacing:.04em;}
#rptRoot .ucmap .mf-body{fill:#e6eaee;stroke:#5b6670;stroke-width:1.3;stroke-linejoin:round;}
#rptRoot .ucmap .mf-part{fill:#f2f5f7;stroke:#5b6670;stroke-width:1.2;stroke-linejoin:round;}
#rptRoot .ucmap .mf-rail{fill:none;stroke:#5b6670;stroke-width:1.3;}
#rptRoot .ucmap .mf-pin{fill:#fff;stroke:#5b6670;stroke-width:1;}
#rptRoot .ucmap .mf-line{fill:none;stroke:#5b6670;stroke-width:1.1;stroke-linejoin:round;stroke-linecap:round;}
#rptRoot .ucmap .mf-hair{fill:none;stroke:#a9b2ba;stroke-width:.7;stroke-linecap:round;}
#rptRoot .ucmap .mf-ground{fill:none;stroke:#a9b2ba;stroke-width:1.1;}
#rptRoot .ucmap .mf-lead{fill:none;stroke:#a9b2ba;stroke-width:.9;stroke-dasharray:3 3;opacity:.7;}
#rptRoot .um-spot .um-puck{fill:#fff;stroke:#5b6670;stroke-width:2.4;}
#rptRoot .um-spot .um-n{font:700 16px/1 inherit;fill:#5b6670;}
#rptRoot .um-spot .um-n.um-chain{font-size:14px;letter-spacing:.02em;}
#rptRoot .um-spot.done .um-puck{fill:#0ca30c;stroke:#0ca30c;}
#rptRoot .um-spot.watch .um-puck{fill:#ec835a;stroke:#ec835a;}
#rptRoot .um-spot.act .um-puck{fill:#d03b3b;stroke:#d03b3b;}
#rptRoot .um-spot.done .um-n,#rptRoot .um-spot.act .um-n,
#rptRoot .um-spot.watch .um-n{fill:#fff;}
#rptRoot .um-spot.na .um-puck{fill:#e6eaee;stroke:#a9b2ba;stroke-dasharray:4 3;}
#rptRoot .mapkey{display:flex;flex-wrap:wrap;gap:5px 16px;margin-top:6px;font-size:9.5px;color:#5b6670;}
#rptRoot .mapkey .i{display:inline-flex;align-items:center;gap:5px;}
#rptRoot .mapkey .d{width:10px;height:10px;border-radius:50%;display:block;border:1.5px solid #5b6670;}

/* ---- one machine, one sheet -------------------------------------------------
   A fleet export needs a cover and a work list because twenty machines have to
   be triaged before anything else makes sense. One machine does not: the reader
   already knows which machine, already knows why they opened it, and every line
   that repeats the unit number is a line spent telling them something they
   brought with them. So a single-machine report drops the cover, the work list
   and the legend, and prints the round the way the workbook does — the positions
   across, the photograph at the top of each, and what was found underneath. */
#rptRoot .mast{border-bottom:2.5px solid #16242c;padding-bottom:9px;margin-bottom:13px;}
#rptRoot .mast .m1{font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.1;}
#rptRoot .mast .m2{display:flex;flex-wrap:wrap;gap:3px 18px;margin-top:7px;}
#rptRoot .mast .m2 .f{font-size:10.5px;}
#rptRoot .mast .m2 .f i{font-style:normal;color:#7b858e;letter-spacing:.09em;
  text-transform:uppercase;font-size:8.5px;font-weight:700;margin-right:5px;}
#rptRoot .mast .m2 .f b{font-weight:700;font-variant-numeric:tabular-nums;}
#rptRoot .mast .unum{font-size:15px;font-weight:800;letter-spacing:-.01em;}

/* When every position says the same thing, the sheet says it once. Four columns
   repeating one defect, one cause and one action is four times the ink for the
   same sentence, and it buries the thing that does differ — the photograph. */
#rptRoot .common{border:1px solid #dfe4e9;border-left:3px solid #12161a;border-radius:0 5px 5px 0;
  padding:9px 12px;margin-top:12px;background:#fafbfc;}
#rptRoot .common .k{font-size:7.5px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;
  color:#8b939b;}
#rptRoot .common dl{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin-top:5px;}
#rptRoot .common dt{font-size:7.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  color:#8b939b;padding-top:2px;}
#rptRoot .common dd{font-size:11px;line-height:1.35;}
#rptRoot .common dd b{font-weight:700;}
#rptRoot .board{display:grid;gap:12px 11px;margin-top:12px;}
#rptRoot .cel{border:1px solid #dfe4e9;border-radius:6px;overflow:hidden;background:#fff;
  page-break-inside:avoid;}
#rptRoot .cel .ph{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#f2f5f7;}
/* The rest of the position's photographs, in a strip under the first. Stacked
   at full width they would be most of a page for one plug; this shows them in
   about the height of two, and the reader still gets the establishing shot big.

   Wrapping, not a single row. A position may hold ten, and ten across is ten
   stamps nobody can read — three to a row keeps every one of them big enough to
   see the crack in. */
#rptRoot .cel .phx{display:grid;grid-template-columns:repeat(3,1fr);
  gap:1px;background:#dfe4e9;border-top:1px solid #dfe4e9;position:relative;}
#rptRoot .cel .phx img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#f2f5f7;}
#rptRoot .cel .bd{padding:7px 9px 9px;}
#rptRoot .cel .pk{font-size:11px;font-weight:750;letter-spacing:-.01em;line-height:1.25;}
#rptRoot .cel .pn{font-size:9px;color:#7b858e;line-height:1.35;margin-top:1px;}
#rptRoot .cel .chips{display:flex;gap:4px;align-items:center;margin-top:5px;flex-wrap:wrap;}
#rptRoot .cel dl{margin-top:6px;display:grid;grid-template-columns:auto 1fr;gap:2px 7px;}
#rptRoot .cel dt{font-size:7.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  color:#8b939b;padding-top:1px;}
#rptRoot .cel dd{font-size:9.5px;line-height:1.35;}
#rptRoot .cel dd b{font-weight:700;}
#rptRoot .cel .cm{font-size:9px;line-height:1.4;color:#2b333a;margin-top:6px;
  border-top:1px solid #eaeef1;padding-top:5px;}
#rptRoot .cel .num{font-variant-numeric:tabular-nums;}
#rptRoot .b4{grid-template-columns:repeat(4,1fr);}
#rptRoot .b3{grid-template-columns:repeat(3,1fr);}
#rptRoot .b2{grid-template-columns:repeat(2,1fr);}
#rptRoot .b1{grid-template-columns:1fr;max-width:340px;}
/* The photographs sheet. Same board, but the cells hold pictures rather than a
   paragraph, so they take the width of the paper — and the frames inside them
   are one size, in rows, rather than one big and a strip of stamps. */
#rptRoot .board.gal{gap:14px 12px;}
#rptRoot .board.gal.b1{max-width:none;}
#rptRoot .cel .phg{display:grid;gap:2px;background:#dfe4e9;}
#rptRoot .cel .phg img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;
  background:#f2f5f7;}
#rptRoot .allok{background:#eef6ef;color:#146b2c;font-size:12px;font-weight:650;
  padding:8px 12px;border-radius:4px;margin-top:12px;}
#rptRoot .quiet{font-size:10px;color:#5b6670;margin-top:10px;line-height:1.5;}
#rptRoot .quiet b{color:#12161a;font-weight:700;}
#rptRoot .shsign{display:flex;gap:34px;align-items:flex-end;margin-top:16px;
  border-top:1px solid #dfe4e9;padding-top:11px;}
#rptRoot .shots{display:flex;flex-wrap:wrap;gap:7px;}
#rptRoot .shots figure{width:150px;}
#rptRoot .shots img{width:150px;height:112px;object-fit:cover;border-radius:3px;
  border:1px solid #dfe4e9;display:block;}
#rptRoot .shots figcaption{font-size:8.5px;color:#5b6670;margin-top:3px;line-height:1.3;}

#rptRoot .sign{display:flex;gap:34px;align-items:flex-end;}
#rptRoot .sign > div{min-width:210px;}
#rptRoot .sign .ln{border-bottom:1px solid #9aa4ad;height:46px;display:flex;align-items:flex-end;}
#rptRoot .sign img{height:44px;display:block;}
#rptRoot .sign .nm{font-size:11.5px;font-weight:700;margin-top:4px;}
#rptRoot .sign .rl{font-size:8.5px;letter-spacing:.11em;text-transform:uppercase;
  color:#7b858e;font-weight:700;}

#rptRoot .legend{display:flex;gap:26px;}
#rptRoot .legend > div{flex:1;}
#rptRoot .lgrow{display:flex;gap:9px;align-items:flex-start;margin-bottom:7px;}
#rptRoot .lgrow .t{font-size:11px;line-height:1.4;}
#rptRoot .body{font-size:11px;line-height:1.55;color:#2b333a;}

/* ---- the same document in two languages ---------------------------------
   Half the people who sign this page read Russian and half read English, and
   until now each of them got a report they could only half read. Both go on
   every label rather than two PDFs going in two directions, because the
   inspector and the reliability engineer argue over the same sheet of paper.

   A label is short, so its translation sits underneath in micro-type and
   costs nothing — a column head is two lines tall in either language. A
   sentence gets a second line at the same size but quieter, so a reader's eye
   skips the half that is not theirs instead of wading through it. */
#rptRoot .alt{display:block;font-weight:400;font-size:.84em;line-height:1.2;
  letter-spacing:.02em;text-transform:none;color:#8b939b;}
#rptRoot .altl{display:block;font-weight:inherit;font-size:.93em;line-height:1.35;
  color:inherit;opacity:.62;margin-top:2px;}
#rptRoot .verdict .altl,#rptRoot .allok .altl{opacity:.75;}
/* Inline pairing, for the places a second line would break the row: the value
   is one thing said twice, not two things. */
#rptRoot .alti{color:#8b939b;font-weight:400;}
/* Inside a coloured chip the translation cannot go grey — it borrows the
   chip's own ink and steps back with weight and size instead. */
#rptRoot .alt2{display:block;font-size:.85em;font-weight:600;letter-spacing:.04em;
  opacity:.82;line-height:1.2;}

/* ---- what the numbers on the chain row mean -----------------------------
   The drawing used to letter that row HGT · BUSH · P×4 · P×1 · GRSR — five
   abbreviations that appear nowhere else in the document, are in neither
   language it is written in, and read as buttons on a printed page. They are
   numbered now, and the numbers are spelled out here, in both. */
#rptRoot .ckey{display:grid;grid-template-columns:repeat(3,1fr);gap:3px 14px;
  margin:7px 0 2px;max-width:470px;}
#rptRoot .ckey .i{display:flex;gap:6px;align-items:baseline;font-size:9.5px;line-height:1.25;}
#rptRoot .ckey .n{flex:0 0 auto;min-width:13px;height:13px;border-radius:7px;background:#12161a;
  color:#fff;font-size:8px;font-weight:800;text-align:center;line-height:13px;
  font-variant-numeric:tabular-nums;}
#rptRoot .ckey .t{color:#2b333a;}
#rptRoot .ckey .t span{display:block;color:#8b939b;}
/* The wheel pucks — O, I, S and 1–8 — on one line, because each is two words
   and the drawing is right above it. */
#rptRoot .pkey{display:flex;flex-wrap:wrap;gap:3px 16px;margin:6px 0 0;max-width:470px;
  font-size:9.5px;line-height:1.3;color:#2b333a;}
#rptRoot .pkey .i{display:inline-flex;gap:5px;align-items:baseline;}
#rptRoot .pkey b{font-weight:800;color:#12161a;min-width:11px;}

/* ---- the same machine, earlier -------------------------------------------
   A unit report used to print one full sheet per round: the same masthead,
   the same two frames and the same signature block, four times over, and the
   one thing the reader came for — whether it is getting worse — was nowhere
   on any of them. The rounds before the latest collapse into this. */
#rptRoot .hist td.d{white-space:nowrap;font-variant-numeric:tabular-nums;}
/* Hours over rate, in one column. The hours are the number a planner acts on
   and the rate is what makes them believable, so they travel together or the
   hours read like a promise. */
#rptRoot td.life b{display:block;font-size:11px;white-space:nowrap;}
#rptRoot td.life i{display:block;font-style:normal;font-size:8.5px;color:#5b6670;
  white-space:nowrap;}
/* One column per round plus a name, a limit, a change and a bar is eight
   columns of a 760px page, and every heading now carries a second language.
   Left to size itself the table came out 939px wide and the last two columns
   printed off the edge of the paper — silently, because an overflowing table
   is not an error, it is just a column nobody sees. Fixed layout, declared
   widths, and headings that wrap instead of pushing. */
#rptRoot table.mh{table-layout:fixed;}
/* break-word, not anywhere: "anywhere" splits a heading mid-word — MEASURED
   OVER came out as "MEASURE D OVER" — where break-word only breaks a single
   word that genuinely cannot fit, and wraps between words first. */
#rptRoot table.mh th{padding:0 4px 5px;overflow-wrap:break-word;}
/* td.n is nowrap so a measurement never breaks across two lines. In a fixed
   table that turns "no reference for this model" into a sentence printed
   straight through the four columns to its right — legible, wrong, and not an
   error anywhere. Numbers here are short enough to wrap safely. */
#rptRoot table.mh td{padding:5px 4px;overflow-wrap:anywhere;}
#rptRoot table.mh td.n{white-space:normal;}
#rptRoot table.mh .wb{min-width:0;}
#rptRoot .dlt{font-variant-numeric:tabular-nums;font-weight:700;font-size:10px;}
#rptRoot .dlt.up{color:#98201a;} #rptRoot .dlt.dn{color:#146b2c;} #rptRoot .dlt.fl{color:#8b939b;}
#rptRoot .vdot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;
  vertical-align:0;}
`;

  /* ---- the report's own vocabulary --------------------------------------
     Kept here rather than in each host's dictionary. One copy cannot drift
     from the other, and neither end can ship a page with a key showing. */
  var S = {
    en: {
      sub:"Field condition monitoring", generated:"Generated",
      method_MP:"Magnetic Plug Inspection", method_FC:"Filter Cut Inspection",
      method_INSP:"General Inspection", method_TEMP:"Thermography",
      method_UC:"Undercarriage Measurement",
      /* Missing until now, and the miss was invisible: T() falls back to the
         key, and the key is a truthy string, so the masthead of every tray and
         GET report printed the literal words "method_TB" / "method_GET" in
         22px bold at the top of a signed PDF. */
      method_TB:"Dump Body Thickness", method_GET:"Ground Engaging Tools",
      /* The measurement table used to be headed "Undercarriage measurements"
         whatever had been measured — including a truck body, which has no
         undercarriage in it at all. */
      meas_UC:"Undercarriage measurements", meas_TB:"Dump body thickness",
      meas_GET:"Ground engaging tools", meas_LUBE:"Lubricant found in each compartment",
      map_TB:"Where the wear is", zone_t:"By zone",
      c_zone:"Zone", c_taken:"Read", c_thin:"Thinnest", c_at:"At",
      f_date:"Date", f_cat:"Equipment", f_model:"Model", f_unit:"Unit",
      f_smu:"SMU", f_pts:"Points", f_by:"Inspected by", f_sup:"Verified by",
      allok:"All {n} points normal. Nothing to do on this machine.",
      rest_n:"Also checked, nothing to report —",
      c_action:"Action", c_reading:"Reading",
      c_life:"Life left", c_permm:"mm/1000h", c_h:"h",
      c_lube_prod:"In service", c_lube_evid:"Evidence", c_lube_samp:"Oil sample",
      c_lube_want:"Site standard", c_lube_off:"OFF STANDARD",
      lube_off_n:"{n} compartment(s) hold something other than the site standard.",
      c_taken:"taken", c_nottaken:"not taken",
      common_n:"Same on all {n} points",
      mach:"Machines", ins:"Inspections", pts:"Points checked",
      findings:"Findings", now:"Act now", now_s:"before the next shift",
      head_none:"Nothing outstanding. Every point inspected is inside its limit.",
      head_some:"{n} findings need attention, {c} of them before the next shift.",
      cond:"Condition of everything graded", uc_cond:"Undercarriage wear",
      glance:"Machine by machine",
      work:"What needs doing", work_sub:"worst first",
      work_none:"No action outstanding on any machine in this report.",
      c_unit:"Machine", c_comp:"Component", c_find:"Finding", c_cause:"Direct cause",
      c_do:"What to do", c_wo:"WO", c_meas:"Measured", c_worn:"worn",
      c_item:"Item", c_grade:"Grade", c_sev:"Severity", c_defect:"Defect",
      c_read:"Readings / comment", c_date:"Date", c_type:"Type",
      cause_tbd:"cause not yet set", do_tbd:"not yet decided",
      detail:"Inspection detail", notable:"Worth reading", cont:"continued",
      normal_n:"{n} further points inspected, all normal.",
      verdict_ok:"All {of} points normal. Nothing to do on this machine.",
      verdict_watch:"{n} of {of} points worth watching. Plan the work, do not wait for failure.",
      verdict_act:"{n} of {of} points need action. Do not run this machine on the next shift without addressing them.",
      verdict_part:"{m} of {of} points measured and all inside limits. {n} could not be reached — see below.",
      unread_n:"{n} of {of} points could not be measured — see the table below.",
      unread_s:"{n} not measured", flagged:"{n} points flagged",
      uc_over:"{n} points at or past condemn", uc_watch:"{n} more above 80%",
      uc_cause:"normal service wear unless noted",
      map_t:"Where the wear is", map_na:"Not measured",
      meas_t:"Undercarriage measurements", photos:"Photographs",
      by_who:"Inspected by", sup:"Verified by", nosign:"not signed off",
      gps:"Location", none_att:"None flagged.",
      legend:"How to read this report",
      lg_grade:"Condition grade", lg_sev:"Severity (ISO 14224)",
      lg_wear:"Wear measurement", lg_iso:"Coding",
      lg_wear_d:"Wear is how far a part has travelled from its new dimension towards the condemn limit, as a percentage. 100% means the part is at the limit and should come off. Above 80% it should be planned into the next shutdown. Each figure is judged against the reference for that machine’s model, or against the machine’s own baseline where one was taken while the undercarriage was new.",
      lg_iso_d:"Failure modes, causes and severity are coded to ISO 14224:2016, so findings can be counted, trended and compared across the fleet rather than read one report at a time.",
      band_ok:"Serviceable", band_watch:"Watch", band_act:"At or past condemn",
      g_A:"Normal — no action", g_B:"Monitor — look again next round",
      g_C:"Attention — plan the work", g_X:"Critical — act now",
      s_NOF:"No failure — the item is doing its job",
      s_INC:"Incipient — a fault is starting, function is not affected yet",
      s_DEG:"Degraded — still working, but not to specification",
      s_CRI:"Critical — the item cannot do its job",
      noref:"no reference for this model",
      /* The same fact, for a column two words wide. The long form stays where
         there is room for it; four lines of it under every unreferenced point
         was most of a table saying one thing. */
      noref_s:"no reference",
      noref_all:"No condemn limits are loaded for this model yet, so no wear percentage can be given. The measurements below are the record.",
      /* Half a dump body has a liner thickness to condemn against and half of
         it is bare plate that does not. Saying so under all twenty-nine bare
         stations is twenty-nine lines of one fact; the reference column shows a
         dash and this says what the dash means, once. */
      noref_some:"A dash in the reference column means no condemn limit is set for that station. Those {n} readings are recorded and compared with last time, but carry no wear percentage.",
      footer:"Generated by the Condition Monitoring system",
      /* the rounds before the latest one, and how the machine moved between them */
      hist:"Earlier rounds", hist_sub:"newest first",
      trend_t:"Measurement history", trend_sub:"one row per point, oldest reading on the left",
      c_state:"Result", c_worst:"Worst point", c_chg:"Change", c_now:"Latest", c_limit:"New → condemn",
      v_ok:"Normal", v_watch:"Watch", v_act:"Act now",
      rounds_n:"{n} earlier rounds are summarised below rather than reprinted in full.",
      walk_key:"The numbers on the machine",
      lang_note:"Every heading in this report is given in English and Russian.",
    },
    ru: {
      sub:"Мониторинг состояния в поле", generated:"Сформировано",
      method_MP:"\u041e\u0441\u043c\u043e\u0442\u0440 \u043c\u0430\u0433\u043d\u0438\u0442\u043d\u043e\u0439 \u043f\u0440\u043e\u0431\u043a\u0438", method_FC:"\u0420\u0430\u0437\u0440\u0435\u0437 \u0444\u0438\u043b\u044c\u0442\u0440\u0430",
      method_INSP:"\u041e\u0431\u0449\u0438\u0439 \u043e\u0441\u043c\u043e\u0442\u0440", method_TEMP:"\u0422\u0435\u0440\u043c\u043e\u0433\u0440\u0430\u0444\u0438\u044f",
      method_UC:"\u0417\u0430\u043c\u0435\u0440\u044b \u0445\u043e\u0434\u043e\u0432\u043e\u0439 \u0447\u0430\u0441\u0442\u0438",
      method_TB:"\u0417\u0430\u043c\u0435\u0440\u044b \u0442\u043e\u043b\u0449\u0438\u043d\u044b \u043a\u0443\u0437\u043e\u0432\u0430", method_GET:"\u0420\u0430\u0431\u043e\u0447\u0438\u0435 \u043e\u0440\u0433\u0430\u043d\u044b",
      meas_UC:"\u0417\u0430\u043c\u0435\u0440\u044b \u0445\u043e\u0434\u043e\u0432\u043e\u0439 \u0447\u0430\u0441\u0442\u0438", meas_TB:"\u0417\u0430\u043c\u0435\u0440\u044b \u0442\u043e\u043b\u0449\u0438\u043d\u044b \u043a\u0443\u0437\u043e\u0432\u0430",
      meas_LUBE:"\u041c\u0430\u0441\u043b\u043e, \u043d\u0430\u0439\u0434\u0435\u043d\u043d\u043e\u0435 \u0432 \u0443\u0437\u043b\u0430\u0445",
      meas_GET:"\u0417\u0430\u043c\u0435\u0440\u044b \u0440\u0430\u0431\u043e\u0447\u0438\u0445 \u043e\u0440\u0433\u0430\u043d\u043e\u0432",
      map_TB:"\u0413\u0434\u0435 \u0438\u0437\u043d\u043e\u0441", zone_t:"\u041f\u043e \u0437\u043e\u043d\u0430\u043c",
      c_zone:"\u0417\u043e\u043d\u0430", c_taken:"\u0417\u0430\u043c\u0435\u0440\u0435\u043d\u043e", c_thin:"\u041c\u0438\u043d\u0438\u043c\u0443\u043c", c_at:"\u0422\u043e\u0447\u043a\u0430",
      f_date:"\u0414\u0430\u0442\u0430", f_cat:"\u0422\u0435\u0445\u043d\u0438\u043a\u0430", f_model:"\u041c\u043e\u0434\u0435\u043b\u044c", f_unit:"\u0415\u0434\u0438\u043d\u0438\u0446\u0430",
      f_smu:"\u041d\u0430\u0440\u0430\u0431\u043e\u0442\u043a\u0430", f_pts:"\u0422\u043e\u0447\u0435\u043a", f_by:"\u041e\u0441\u043c\u043e\u0442\u0440 \u0432\u044b\u043f\u043e\u043b\u043d\u0438\u043b", f_sup:"\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u043b",
      allok:"\u0412\u0441\u0435 {n} \u0442\u043e\u0447\u0435\u043a \u0432 \u043d\u043e\u0440\u043c\u0435. \u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u043d\u0435 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f.",
      rest_n:"\u0422\u0430\u043a\u0436\u0435 \u043f\u0440\u043e\u0432\u0435\u0440\u0435\u043d\u043e, \u0431\u0435\u0437 \u0437\u0430\u043c\u0435\u0447\u0430\u043d\u0438\u0439 \u2014",
      c_action:"\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435", c_reading:"\u041f\u043e\u043a\u0430\u0437\u0430\u043d\u0438\u044f",
      c_life:"\u041e\u0441\u0442\u0430\u0442\u043e\u043a", c_permm:"\u043c\u043c/1000\u0447", c_h:"\u0447",
      c_lube_prod:"\u0417\u0430\u043b\u0438\u0442\u043e", c_lube_evid:"\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435", c_lube_samp:"\u041f\u0440\u043e\u0431\u0430 \u043c\u0430\u0441\u043b\u0430",
      c_lube_want:"\u0421\u0442\u0430\u043d\u0434\u0430\u0440\u0442 \u043f\u0440\u0435\u0434\u043f\u0440\u0438\u044f\u0442\u0438\u044f", c_lube_off:"\u041d\u0415 \u041f\u041e \u0421\u0422\u0410\u041d\u0414\u0410\u0420\u0422\u0423",
      lube_off_n:"\u0412 {n} \u0443\u0437\u043b. \u0437\u0430\u043b\u0438\u0442\u043e \u043d\u0435 \u0442\u043e, \u0447\u0442\u043e \u043f\u0440\u0435\u0434\u0443\u0441\u043c\u043e\u0442\u0440\u0435\u043d\u043e \u0441\u0442\u0430\u043d\u0434\u0430\u0440\u0442\u043e\u043c.",
      c_taken:"\u043e\u0442\u043e\u0431\u0440\u0430\u043d\u0430", c_nottaken:"\u043d\u0435 \u043e\u0442\u043e\u0431\u0440\u0430\u043d\u0430",
      common_n:"\u041e\u0434\u0438\u043d\u0430\u043a\u043e\u0432\u043e \u043d\u0430 \u0432\u0441\u0435\u0445 {n} \u0442\u043e\u0447\u043a\u0430\u0445",
      mach:"Машин", ins:"Осмотров", pts:"Точек проверено",
      findings:"Находок", now:"Срочно", now_s:"до следующей смены",
      head_none:"Нет открытых замечаний. Все проверенные точки в пределах нормы.",
      head_some:"{n} замечаний требуют внимания, из них {c} — до следующей смены.",
      cond:"Состояние по оценкам", uc_cond:"Износ ходовой",
      glance:"По машинам",
      work:"Что нужно сделать", work_sub:"сначала самое срочное",
      work_none:"Ни по одной машине в отчёте действий не требуется.",
      c_unit:"Машина", c_comp:"Узел", c_find:"Замечание", c_cause:"Прямая причина",
      c_do:"Что делать", c_wo:"ЗН", c_meas:"Замер", c_worn:"износ",
      c_item:"Узел", c_grade:"Степень", c_sev:"Категория", c_defect:"Дефект",
      c_read:"Показания / комментарий", c_date:"Дата", c_type:"Тип",
      cause_tbd:"причина не указана", do_tbd:"не определено",
      detail:"Детали осмотров", notable:"Стоит прочитать", cont:"продолжение",
      normal_n:"Ещё {n} точек проверено, все в норме.",
      verdict_ok:"Все {of} точек в норме. По этой машине действий не требуется.",
      verdict_watch:"{n} из {of} точек требуют наблюдения. Запланируйте работы, не ждите отказа.",
      verdict_act:"{n} из {of} точек требуют действий. Не выпускайте машину в смену без их устранения.",
      verdict_part:"Измерено {m} из {of} точек, все в пределах. К {n} не удалось подобраться — см. ниже.",
      unread_n:"{n} из {of} точек измерить не удалось — см. таблицу ниже.",
      unread_s:"{n} не измерено", flagged:"{n} точек отмечено",
      uc_over:"{n} точек на пределе или за ним", uc_watch:"ещё {n} выше 80%",
      uc_cause:"обычный эксплуатационный износ, если не указано иное",
      map_t:"Где износ", map_na:"Не измерено",
      meas_t:"Замеры ходовой части", photos:"Фотографии",
      by_who:"Осмотр выполнил", sup:"Проверил", nosign:"не подписано",
      gps:"Координаты", none_att:"Не отмечено.",
      legend:"Как читать этот отчёт",
      lg_grade:"Оценка состояния", lg_sev:"Категория (ИСО 14224)",
      lg_wear:"Измерение износа", lg_iso:"Кодирование",
      lg_wear_d:"Износ — это доля пути от нового размера до предельного, в процентах. 100% означает, что деталь достигла предела и подлежит замене. Свыше 80% работу следует включить в ближайший ремонт. Каждая цифра сравнивается с эталоном для модели машины или с её собственной базой, если она была снята на новой ходовой.",
      lg_iso_d:"Виды отказов, причины и категории кодируются по ИСО 14224:2016, чтобы замечания можно было считать и сравнивать по всему парку, а не читать по одному отчёту.",
      /* Word for word what the Wear & life screen calls this band. It read
         "Достиг предела износа" here and "На пределе или за ним" there — one
         band, two names, and a fitter comparing the page to the screen had to
         work out they meant the same thing. */
      band_ok:"Годен", band_watch:"Наблюдать", band_act:"На пределе или за ним",
      g_A:"Норма — действий не требуется", g_B:"Наблюдение — проверить в следующий раз",
      g_C:"Внимание — запланировать работы", g_X:"Критично — действовать сразу",
      s_NOF:"Без отказа — узел выполняет свою функцию",
      s_INC:"Зарождающийся — дефект начался, функция пока не затронута",
      s_DEG:"Частичный — работает, но не по требованиям",
      s_CRI:"Критический — узел не выполняет функцию",
      noref:"нет эталона для этой модели",
      noref_s:"нет эталона",
      noref_all:"Для этой модели ещё не заданы предельные величины, поэтому процент износа не рассчитывается. Ниже — сами замеры.",
      noref_some:"Прочерк в столбце эталона означает, что для точки не задан предел. Эти замеры ({n}) записываются и сравниваются с прошлым разом, но процент износа для них не рассчитывается.",
      footer:"Сформировано системой мониторинга состояния",
      hist:"Предыдущие обходы", hist_sub:"сначала новые",
      trend_t:"История замеров", trend_sub:"строка на точку, слева — самый ранний замер",
      c_state:"Итог", c_worst:"Худшая точка", c_chg:"Изменение", c_now:"Текущий",
      c_limit:"Новый → предел",
      v_ok:"Норма", v_watch:"Наблюдать", v_act:"Срочно",
      rounds_n:"Ещё {n} обходов приведены сводкой ниже, а не полными листами.",
      walk_key:"Номера на машине",
      lang_note:"Все заголовки отчёта приведены на английском и русском языках.",
    },
  };

  var GRADE_HEX = { A:"#0ca30c", B:"#fab219", C:"#ec835a", X:"#d03b3b" };
  var SEV_HEX   = { NOF:"#0ca30c", INC:"#fab219", DEG:"#ec835a", CRI:"#d03b3b" };
  CMR.GRADE_HEX = GRADE_HEX; CMR.SEV_HEX = SEV_HEX;

  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  CMR.esc = esc;

  /* ---- the report speaks both languages at once ---------------------------
     One document, not two. The inspector who wrote it reads Russian, the
     reliability engineer who acts on it reads English, and the supervisor
     signs the bottom of the same sheet — so the sheet has to be readable by
     all three without anybody choosing a version first.

     T("k")   the plain string, primary language — for anywhere a bare value
              is needed (a title attribute, a joined sentence fragment).
     T.L("k") a LABEL in both: primary, translation underneath in micro-type.
     T.S("k") a SENTENCE in both: primary, translation on a quieter line.
     T.I("k") an INLINE pair, for a row that cannot grow a second line.
     Each returns escaped HTML — call sites must not wrap them in esc(). */
  function makeT(lang, bi) {
    var D = S[lang] || S.en, D2 = (lang === "ru") ? S.en : S.ru;
    function pick(dict, k, v) {
      var s = dict[k] != null ? dict[k] : (S.en[k] != null ? S.en[k] : k);
      if (v) Object.keys(v).forEach(function (x) { s = s.split("{" + x + "}").join(v[x]); });
      return s;
    }
    var T = function (k, v) { return pick(D, k, v); };
    T.bi = !!bi; T.lang = (S[lang] ? lang : "en");
    T.alt = function (k, v) { return pick(D2, k, v); };
    function pair(k, v, cls, sep) {
      var a = pick(D, k, v), b = pick(D2, k, v);
      /* Identical in both — a model number, an ISO code — is said once. Saying
         it twice is the kind of padding this pass exists to remove. */
      if (!bi || !b || b === a) return esc(a);
      return sep ? esc(a) + ' <span class="alti">/ ' + esc(b) + '</span>'
                 : esc(a) + '<span class="' + cls + '">' + esc(b) + '</span>';
    }
    /* The key, if the dictionary actually holds it — otherwise the fallback.
       Without this a missing key prints as its own name, which is how
       "method_TB" ended up as the title of a report. */
    T.key = function (k, fb) { return (S.en[k] != null || D[k] != null) ? k : fb; };
    T.L = function (k, v) { return pair(k, v, "alt", false); };
    T.S = function (k, v) { return pair(k, v, "altl", false); };
    T.I = function (k, v) { return pair(k, v, "alti", true); };
    /* The same treatment for a string that is not in the dictionary — a
       component name the host translated, a reason code. The host hands over
       the PRIMARY rendering first, because it already knows which language the
       screen is in. */
    T.both = function (a, b, cls) {
      if (!bi || !b || b === a) return esc(a);
      return esc(a) + '<span class="' + (cls || "alt") + '">' + esc(b) + '</span>';
    };
    /* A pair the host supplies as a fixed en/ru couple rather than as
       primary-and-other — a walk-key name, a body zone. T.both would print
       them in the order given, which puts English first in a Russian report
       while every other line on the page leads in Russian. */
    /* NOT T.name — every function already owns a read-only `name`, and
       assigning to it throws under "use strict" rather than being ignored. */
    T.pair = function (en, ru, cls) {
      return T.lang === "ru" ? T.both(ru, en, cls) : T.both(en, ru, cls);
    };
    /* For a pair the caller holds as English-and-Russian rather than
       primary-and-other — the undercarriage reference, for one, which stores
       them under fixed .en and .ru keys. Reading a Russian report and finding
       its drawing key led in English was the whole reason this exists. */
    T.enru = function (en, ru, cls) {
      return lang === "ru" ? T.both(ru, en, cls) : T.both(en, ru, cls);
    };
    T.enruI = function (en, ru) {
      var a = lang === "ru" ? ru : en, b = lang === "ru" ? en : ru;
      if (!bi || !b || b === a) return esc(a);
      return esc(a) + ' <span class="alti">/ ' + esc(b) + '</span>';
    };
    return T;
  }
  CMR.makeT = makeT;

  /* ---- artwork that survives the PDF --------------------------------------
     html2canvas renders an inline <svg> by serialising it and drawing it as an
     image. Inside that serialised copy every relative reference is dead — so
     <image href="machine/d375a.jpg"> comes out blank, and the machine the
     inspector photographed is simply absent from the page. It has to already
     be the bytes.

     Cached per URL: one report prints the same machine on several sheets, and
     re-encoding a 200 KB photograph for each of them is the difference between
     a report that takes two seconds and one that takes ten. */
  var PHOTO = {};
  CMR.inlinePhoto = function (url) {
    if (!url) return Promise.resolve("");
    if (PHOTO[url]) return PHOTO[url];
    PHOTO[url] = new Promise(function (res) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () {
        try {
          /* Downscaled on the way in. The page prints it about 470 px wide;
             carrying a 2000 px original into a base64 string costs four times
             the bytes in the PDF for detail no paper can hold. */
          var w = Math.min(img.naturalWidth || 900, 900);
          var h = Math.round(w * (img.naturalHeight || 1) / (img.naturalWidth || 1));
          var c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          res(c.toDataURL("image/jpeg", 0.82));
        } catch (e) { res(""); }        // tainted or unreadable — draw the frame
      };
      /* A model whose picture has not been shot yet, or a phone with no
         signal and a cold cache. mapPhoto draws the frame underneath instead,
         which is the same fallback the capture screen uses. */
      img.onerror = function () { res(""); };
      img.src = url;
    });
    return PHOTO[url];
  };
  /* Both dictionaries, so a guard can ask whether every string the report can
     print exists in both halves. A key missing from the Russian side falls
     back to the English one and prints as a finished label — the only way to
     see it is to compare the two lists. */
  CMR.dict = S;

  /* The chain row was lettered A–E over the old abstract frame, with one key
     naming those five measurements and another naming the O / I / S pucks
     beside them. Both are gone with the frame: the report draws the
     photographed walk the capture screen draws, and its eleven numbers name
     themselves through the key the host hands over. Two renderers for one
     picture is how the two of them disagree. */

  /* The drawing and everything that explains it, in one block.

     The frames are drawn 470px wide because that is the size a roller puck is
     still a thing you can read; the page is 760. That left a 290px column of
     white paper down the right of every undercarriage round, with the colour
     key and the drawing key stacked underneath eating vertical space instead.
     They go in the gap. Same information, most of a page shorter over a
     multi-round report, and nothing had to get smaller. */
  /* The zones of a truck body, worst first. The drawing says where; this says
     how bad. Every zone is named by its THINNEST station, never its mean — on
     the survey this was built from one tail zone averages 6.24 mm and its worst
     station reads 3.50, and the average is the number that lets a body pass. */
  /* The words printed ON the body drawing, in the other language.

     They are single words on purpose — the captions sit in narrow lanes the
     stations keep clear, and "ПРАВЫЙ БОРТ" runs past the first column where
     "RIGHT SIDE" just clears it (see NAME in body-map.js). So the translation
     cannot go in the drawing; it goes next to it, and only for the captions
     the drawing actually used. */
  function bodyFaceKey(T, mapHTML) {
    var NAME = root.bodyFaces;
    if (!NAME || !T.bi) return "";
    var used = Object.keys(NAME).filter(function (z) {
      var n = NAME[z];
      return mapHTML.indexOf('>' + n.en + '<') >= 0 || mapHTML.indexOf('>' + n.ru + '<') >= 0;
    });
    if (!used.length) return "";
    return '<div class="pkey" style="margin-top:9px;">'
      + used.map(function (z) {
          var n = NAME[z], a = T.lang === "ru" ? n.ru : n.en, b = T.lang === "ru" ? n.en : n.ru;
          return '<span class="i"><b>' + esc(a) + '</b><span class="alti">' + esc(b) + '</span></span>';
        }).join("") + '</div>';
  }

  function zoneTable(T, zones) {
    if (!zones || !zones.length) return "";
    return '<div class="subhd" style="margin-top:9px;">' + T.L("zone_t") + '</div>'
      + '<table class="tbzone"><tr>'
      + '<th>' + T.L("c_zone") + '</th>'
      + '<th class="num">' + T.L("c_taken") + '</th>'
      + '<th class="num">' + T.L("c_thin") + '</th>'
      + '<th>' + T.L("c_at") + '</th></tr>'
      + zones.map(function (z) {
          return '<tr><td>' + T.pair(z.name, z.nameAlt) + '</td>'
            + '<td class="num">' + z.got + '/' + z.of + '</td>'
            + '<td class="num">' + (z.thin == null ? "—" : esc(z.thin)) + '</td>'
            + '<td>' + esc(z.at || "—") + '</td></tr>';
        }).join("") + '</table>';
  }

  /* The numbers on the machine, named — the chip row that sits under the
     drawing on the capture screen, printed. The host hands over the walk it
     drew, so the key cannot name a number the picture does not carry. */
  function walkKey(T, key) {
    if (!key || !key.length) return "";
    return '<div class="subhd" style="margin-top:9px;">' + T.L("walk_key") + '</div>'
      + '<div class="ckey">' + key.map(function (p) {
          return '<span class="i"><span class="n">' + esc(p.n) + '</span>'
            + '<span class="t">' + (T.bi ? T.pair(p.en, p.ru, "") : esc(p.en)) + '</span></span>';
        }).join("") + '</div>';
  }

  CMR.mapBlock = function (T, mapHTML, topMargin, zones, key) {
    if (!mapHTML) return "";
    /* Two different machines are drawn here. A track frame carries a chain row
       and pucks lettered O, I and S; a truck body carries neither, and hanging
       an undercarriage key off a drawing of a dump body is worse than no key.
       The drawing says which it is — matched on the SVG's own class and
       anchored, because BOTH drawings sit inside a .ucmapwrap and a loose test
       for "ucmap" is true of a dump body too. */
    var isUC = /class="ucmap[\s"]/.test(mapHTML);
    /* A numbered walk names itself through the key the host passed. */
    var side = mapKey(T)
      + (key ? walkKey(T, key) : isUC ? "" : bodyFaceKey(T, mapHTML))
      + zoneTable(T, zones);
    var hd = '<div class="subhd" style="margin-top:' + (topMargin || 11) + 'px;">' + T.I("map_t") + '</div>';
    /* The tray is the one drawing that carries its readings inside itself, so
       it is the one drawing that cannot be shrunk into a side-by-side column.
       Its host appends a zone table to the drawing it hands over; that table is
       lifted out here so the key can sit directly under the picture it explains
       rather than below a table nobody reads first. */
    if (!isUC && !key) {
      var cut  = mapHTML.indexOf('<table class="tbzone"');
      var draw = cut < 0 ? mapHTML : mapHTML.slice(0, cut);
      var tail = cut < 0 ? "" : mapHTML.slice(cut);
      /* Under the drawing, not beside it, and the key and the zone table share
         that strip rather than stacking. A full-width tray plus a machine
         header is already most of an A4 page; stacking them put the fold
         through a table row, and the paginator cuts on pixels, not on rows. */
      return hd + '<div class="mapblock wide"><div class="ucmaps">' + draw + '</div>'
        + '<div class="mapfoot"><div class="mapside">'
        + mapKey(T) + bodyFaceKey(T, mapHTML) + '</div>'
        + '<div class="mapzone">' + tail + zoneTable(T, zones) + '</div></div></div>';
    }
    return hd
      + '<div class="mapblock"><div class="ucmaps">' + mapHTML + '</div>'
      + '<div class="mapside">' + side + '</div></div>';
  };

  /* ---- chips and bars, drawn one way ------------------------------------ */
  /* White on the amber is barely legible in print; the amber chips take dark ink. */
  function ink(hex){ return hex===GRADE_HEX.B ? "#3d2c00" : "#fff"; }
  function gradeChip(g){ if(!g) return "";
    var c=GRADE_HEX[g]||"#8a939b";
    return '<span class="g" style="background:'+c+';color:'+ink(c)+'">'+esc(g)+'</span>'; }
  /* The severity word is a technical term and gets both languages like every
     other one — inside the chip, on a second line, rather than beside it: a
     chip that says one thing in two words has to stay one chip. */
  function sevChip(ctx,s){ if(!s) return "";
    var c=SEV_HEX[s]||"#8a939b", a=ctx.sevLabel(s);
    var b=ctx.sevLabelAlt ? ctx.sevLabelAlt(s) : "";
    return '<span class="sev" style="background:'+c+';color:'+ink(c)+'">'+esc(a)
      + (b && b!==a ? '<span class="alt2">'+esc(b)+'</span>' : "") + '</span>'; }
  function wearBar(pct){
    var p=Math.max(0,Math.min(130,Number(pct)||0));
    var col = p>=100?GRADE_HEX.X : p>=80?GRADE_HEX.C : GRADE_HEX.A;
    return '<span class="wb"><i style="width:'+Math.round(p/130*100)+'%;background:'+col+'"></i></span>';
  }
  CMR.wearBar = wearBar;

  /* The drawing is laid out a few units outside its own viewBox — harmless on a
     screen that scrolls it, a shaved idler on paper. Both hosts pass their map
     through here so the printed copy has room on both sides. */
  CMR.fitMap = function (html) {
    return String(html||"").replace(/viewBox="0 0 460 286"/g, 'viewBox="-8 2 476 284"');
  };

  /* The 1C work-request priority, if the inspector set one. It rides with the
     action because that is the moment it means something — a job to be queued,
     not a judgement about the part. */
  function prioTag(it) {
    if (!it || !it.prio) return "";
    var hot = it.prio === "P1" ? SEV_HEX.CRI : it.prio === "P2" ? SEV_HEX.DEG : "#5b6670";
    return ' <span class="prio" style="color:' + hot + '">' + esc(it.prio) + '</span>';
  }
  /* A component name is a technical term, so it gets the same treatment as a
     heading: the host hands over both renderings and both are printed. */
  function nameCell(T, it){
    return T.both(it.name||it.key, it.nameAlt)
      + (it.code?'<div class="code">'+esc(it.code)+'</div>':"");
  }

  /* ---- what the whole export adds up to ---------------------------------- */
  function scan(recs){
    var s={ rounds:recs.length, units:{}, unitN:0, types:{}, typeLabel:{},
            grade:{A:0,B:0,C:0,X:0}, pts:0, act:[], crit:0, total:0,
            first:"", last:"", wear:{ok:0,watch:0,act:0} };
    recs.forEach(function(rec){
      if(!s.units[rec.equip]){ s.units[rec.equip]=1; s.unitN++; }
      s.types[rec.type]=(s.types[rec.type]||0)+1; s.typeLabel[rec.type]=rec.typeLabel;
      if(rec.date){ if(!s.first||rec.date<s.first) s.first=rec.date;
                    if(!s.last ||rec.date>s.last ) s.last =rec.date; }
      rec.items.forEach(function(it){
        s.pts++;
        if(it.grade && s.grade[it.grade]!=null) s.grade[it.grade]++;
        if(it.w && it.w.band) s.wear[it.w.band]++;
        var bad = it.grade==="C"||it.grade==="X"||it.sev==="DEG"||it.sev==="CRI"
                  ||(it.w&&(it.w.band==="act"||it.w.band==="watch"));
        if(bad||it.action||it.defect) s.act.push({rec:rec, it:it, w:it.w, sev:it.sev});
        if(it.grade==="X"||it.sev==="CRI"||(it.w&&it.w.band==="act")) s.crit++;
      });
    });
    /* Thirty-one rows saying "DZ002 undercarriage past condemn" is not a work
       list, it is the same instruction thirty-one times. A worn undercarriage is
       one job: roll a machine's wear findings into a single line that still
       names the worst points and counts the rest. */
    s.total=s.act.length;                       // findings, before any roll-up
    var byUC={}, order=[];
    s.act=s.act.filter(function(f){
      if(!f.w || (f.w.band!=="act" && f.w.band!=="watch")) return true;
      if(f.it.defect||f.it.action) return true;          // called out by hand: keep it
      var id=f.rec.equip+"|"+f.rec.date+"|"+f.rec.type;
      if(!byUC[id]){ byUC[id]={rec:f.rec, roll:true, act:[], watch:[], worst:0,
                               sev:"", it:{}, k:""}; order.push(id); }
      var g=byUC[id];
      (f.w.band==="act"?g.act:g.watch).push({it:f.it, pct:Number(f.w.pct)||0, mm:f.w.mm});
      if((Number(f.w.pct)||0)>g.worst){ g.worst=Number(f.w.pct)||0; g.k=f.it.key; }
      return false;
    });
    order.forEach(function(id){ var g=byUC[id];
      g.act.sort(function(a,b){return b.pct-a.pct;});
      g.watch.sort(function(a,b){return b.pct-a.pct;});
      g.sev = g.act.length ? "CRI" : "DEG"; s.act.push(g); });
    var rank={X:0,C:1,B:2,A:3}, srank={CRI:0,DEG:1,INC:2,NOF:3};
    s.act.sort(function(a,b){
      return (srank[a.sev]==null?4:srank[a.sev])-(srank[b.sev]==null?4:srank[b.sev])
        || (rank[a.it.grade]==null?4:rank[a.it.grade])-(rank[b.it.grade]==null?4:rank[b.it.grade])
        || ((b.w&&b.w.pct)||0)-((a.w&&a.w.pct)||0)
        || String(a.rec.equip).localeCompare(String(b.rec.equip)); });
    return s;
  }
  CMR.scan = scan;

  /* The one line a machine gets in its own header — what this round concluded. */
  function verdict(rec){
    return rec.items.reduce(function(a,it){
      if(it.grade==="X"||it.sev==="CRI"||(it.w&&it.w.band==="act")) return "act";
      if(a==="act") return a;
      if(it.grade==="C"||it.grade==="B"||it.sev==="DEG"||it.sev==="INC"
         ||(it.w&&it.w.band==="watch")) return "watch";
      return a; }, "ok");
  }



  /* The measurement grid and the "worth reading" table are wanted by both the
     fleet detail and the single-machine sheet, so they live out here rather
     than being written twice and drifting. */
  /* A lubrication round has nothing to measure, so measSections returns
     nothing for it and the whole round used to reach the paper as a heading and
     a grade — the product, the evidence and the sample all recorded on the
     phone and none of them printed. The audit IS the table below: one row per
     compartment, whether or not anything was wrong with it, because coverage
     and conformance are the questions being asked and neither can be answered
     from a list of exceptions. */
  function lubeSections(ctx, T, rec, tailHTML) {
    var out = [];
    var rows = rec.items.filter(function (it) { return it.lube; });
    if (!rows.length) return out;
    var anyWant = rows.some(function (it) { return !!it.lube.want; });
    var cont = '<div class="sec"><div class="mach" style="border-top-width:1px;">'
      + '<div class="machhd"><span class="u" style="font-size:14px;">' + esc(rec.equip) + '</span>'
      + '<span class="c">' + T.I("cont") + '</span></div>';
    var tbl = function (list) {
      var x = '<table><tr><th>' + T.L("c_comp") + '</th>'
        + '<th>' + T.L("c_lube_prod") + '</th>'
        + '<th style="width:96px">' + T.L("c_lube_evid") + '</th>'
        + '<th class="c" style="width:40px">' + T.L("c_lube_samp") + '</th></tr>';
      list.forEach(function (it, i) {
        var L = it.lube;
        x += '<tr class="' + (i % 2 ? "zebra" : "") + '">'
          + '<td style="padding-left:0;"><b>' + esc(it.code || it.key) + '</b>'
            + (it.name && it.name !== (it.code || it.key)
                ? ' ' + T.both(it.name, it.nameAlt) : "") + '</td>'
          /* Off standard is the finding this round exists to produce, so it is
             stated on the row next to what should have been there - not left to
             be worked out by comparing this table with the poster on the wall. */
          + '<td>' + (L.product ? esc(L.product) : '<span class="muted">—</span>')
            + (L.off && L.want
                ? '<div class="code">' + esc(T("c_lube_off")) + ': ' + esc(L.want) + '</div>'
                : "") + '</td>'
          + '<td>' + (L.evid ? T.both(L.evid.en, L.evid.ru, "") : '<span class="muted">—</span>') + '</td>'
          + '<td class="c">' + (L.samp ? "\u25CF" : "\u25CB") + '</td>'
          + '</tr>'; });
      return x + '</table>'; };
    var off = rows.filter(function (it) { return it.lube.off; });
    var MAX = 34, parts = Math.ceil(rows.length / MAX), PER = Math.ceil(rows.length / parts);
    for (var o = 0; o < rows.length; o += PER) {
      var chunk = rows.slice(o, o + PER);
      out.push({ nb: false, html: cont
        + '<div class="subhd" style="margin-top:11px;">' + T.I("meas_LUBE")
        + (parts > 1 ? ' <span class="muted">' + (o + 1) + "\u2013"
            + Math.min(o + PER, rows.length) + " / " + rows.length + '</span>' : "")
        + '</div>'
        + (o === 0 && anyWant && off.length
            ? '<div class="verdict v-act" style="margin:5px 0 0;">'
              + T.I("lube_off_n", { n: off.length }) + '</div>' : "")
        + tbl(chunk) + '</div></div>' });
    }
    if (tailHTML) {
      var last = out.pop();
      out.push({ nb: false, html: last.html.replace(/<\/div><\/div>$/, tailHTML + '</div></div>') });
    }
    return out;
  }

  function measSections(ctx, T, rec, tailHTML) {
    var out = [];
    var rows = rec.items.filter(function (it) { return it.w && (it.w.mm != null || it.w.reason); });
    /* The signature has to land somewhere. On a lubrication round the grid
       below produces nothing, so it rides on the lube table instead of being
       dropped with it. */
    if (!rows.length) return lubeSections(ctx, T, rec, tailHTML);
    var cont = '<div class="sec"><div class="mach" style="border-top-width:1px;">'
      + '<div class="machhd"><span class="u" style="font-size:14px;">' + esc(rec.equip) + '</span>'
      + '<span class="c">' + T.I("cont") + '</span></div>';
    /* If NOTHING on this round has a limit loaded, say so once above the table
       instead of on all sixty-three rows. A dump body has no condemn
       thicknesses in the reference yet, so every row was carrying the same
       four words and a wholly empty "worn" column — three lines of paper per
       station to report the absence of one fact. */
    var anyRef = rows.some(function (it) {
      return it.w.newMM != null && it.w.newMM !== ""; });
    var col = function (list) {
      var x = '<table><tr><th>' + T.L("c_item") + '</th>'
        + '<th class="r" style="width:64px">' + T.L("c_meas") + '</th>'
        + (anyRef ? '<th class="r" style="width:44px">' + T.L("c_worn") + '</th>'
                  + '<th style="width:48px"></th>' : "") + '</tr>';
      list.forEach(function (it, i) { var w = it.w;
        var ref = w.newMM != null && w.newMM !== "";
        x += '<tr class="' + (i % 2 ? "zebra" : "") + '"><td style="padding-left:0;">'
          + T.both(it.name || it.key, it.nameAlt)
          + (anyRef ? '<div class="code">' + (ref
              ? esc(w.newMM + " → " + w.condemnMM + " mm") : "—") + '</div>' : "")
          + '</td>'
          + '<td class="r n">' + (w.mm != null ? '<b>' + esc(w.mm) + '</b>'
              : '<span class="muted" style="font-size:9px">' + esc(w.reasonLabel || w.reason || "—") + '</span>') + '</td>'
          + (anyRef ? '<td class="r n">' + (w.pct != null ? esc(w.pct) + "%" : "") + '</td>'
              + '<td>' + (w.pct != null ? wearBar(w.pct) : "") + '</td>' : "") + '</tr>'; });
      return x + '</table>'; };
    var bare = rows.filter(function (it) {
      return !(it.w.newMM != null && it.w.newMM !== ""); }).length;
    var noRefNote = !anyRef
      ? '<div class="quiet" style="margin:5px 0 0;">' + T.S("noref_all") + '</div>'
      : bare ? '<div class="quiet" style="margin:5px 0 0;">'
               + T.S("noref_some", { n: bare }) + '</div>'
      : "";
    var MAX = 44, parts = Math.ceil(rows.length / MAX), PER = Math.ceil(rows.length / parts);
    for (var o = 0; o < rows.length; o += PER) {
      var chunk = rows.slice(o, o + PER), hf = Math.ceil(chunk.length / 2);
      out.push({ nb: false, html: cont
        + '<div class="subhd" style="margin-top:11px;">' + T.I(T.key("meas_" + rec.type, "meas_t"))
        + (parts > 1 ? ' <span class="muted">' + (o + 1) + "–" + Math.min(o + PER, rows.length)
            + " / " + rows.length + '</span>' : "")
        + '</div>' + (o === 0 ? noRefNote : "")
        + '<div class="meas"><div>' + col(chunk.slice(0, hf)) + '</div><div>'
        + col(chunk.slice(hf)) + '</div></div></div></div>' });
    }
    if (tailHTML) {
      var last = out.pop();
      out.push({ nb: false, html: last.html.replace(/<\/div><\/div>$/, tailHTML + '</div></div>') });
    }
    return out;
  }

  function notableTable(ctx, T, list) {
    var h = '<div class="subhd" style="margin-top:13px;">' + T.I("notable") + '</div><table><tr>'
      + '<th style="width:168px">' + T.L("c_item") + '</th>'
      + '<th class="c" style="width:34px">' + T.L("c_grade") + '</th>'
      + '<th style="width:74px">' + T.L("c_sev") + '</th>'
      + '<th style="width:158px">' + T.L("c_defect") + '</th>'
      + '<th style="width:130px">' + T.L("c_cause") + '</th>'
      + '<th>' + T.L("c_do") + '</th></tr>';
    list.forEach(function (it, i) {
      var read = (it.readings || []).slice();
      if (it.w && it.w.mm != null) read.unshift(it.w.mm + " mm" + (it.w.pct != null ? " · " + it.w.pct + "%" : ""));
      if (it.w && it.w.reason) read.unshift(it.w.reasonLabel || it.w.reason);
      /* The product belongs on the summary row too. A superintendent scanning
         the table for "what is actually in these machines" must not have to
         open every detail cell to find out. */
      if (it.lube && it.lube.product) read.unshift(it.lube.product);
      if (it.comment) read.push(it.comment);
      h += '<tr class="' + (i % 2 ? "zebra" : "") + '">'
        + '<td class="stripe" style="border-left-color:' + (SEV_HEX[it.sev] || GRADE_HEX[it.grade] || "transparent") + '">'
          + nameCell(T, it) + '</td>'
        + '<td class="c">' + gradeChip(it.grade) + '</td>'
        + '<td>' + sevChip(ctx, it.sev) + '</td>'
        + '<td>' + (it.defect ? esc(it.defect) : "") + (it.iso ? '<div class="code">ISO ' + esc(it.iso) + '</div>' : "") + '</td>'
        + '<td>' + (it.cause ? esc(it.cause) : "") + '</td>'
        + '<td>' + (it.action ? '<b>' + esc(it.action) + '</b>' + prioTag(it)
            + (it.wo ? ' <span class="code">[' + esc(it.wo) + ']</span>' : "") + (read.length ? "<br>" : "") : "")
          + esc(read.join(" · ")) + '</td></tr>';
    });
    return h + '</table>';
  }
  /* ======================================================================
     One machine: a sheet per round, laid out the way the workbook is —
     the positions across, the photograph at the top of each, what was found
     underneath. No cover, no work list, no legend: the reader already knows
     which machine and why they opened it. */
  function unitSheets(ctx, T, recs) {
    var secs = [];
    /* One full sheet per inspection TYPE, not per round.
       A machine with four undercarriage rounds on it used to print four
       mastheads, four pairs of track frames and four signature blocks — the
       same 50 KB drawing rasterised four times for a document whose reader
       already knows what the machine looks like. Worse, the one question they
       opened it to answer, "is it getting worse?", appeared on none of the
       four pages, because each page only knows about itself.

       So: the latest round of each type is printed in full, and everything
       before it becomes a history table that answers that question directly.
       Nothing is dropped — every reading from every round is still in the
       document, in the form that makes it comparable. */
    var byType = {}, typeOrder = [];
    recs.forEach(function (r) {
      if (!byType[r.type]) { byType[r.type] = []; typeOrder.push(r.type); }
      byType[r.type].push(r);
    });
    var older = [];
    var latest = typeOrder.map(function (ty) {
      var list = byType[ty];              // already newest-first
      older = older.concat(list.slice(1));
      return list[0];
    });
    older.sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });

    latest.forEach(function (rec, n) {
      var isWear = !!rec.wear;
      var mine = byType[rec.type] || [rec];
      function fld(k, v) {
        return '<span class="f"><i>' + k + '</i>' + v + '</span>';
      }
      var head =
        '<div class="mast">'
        + '<div class="eyebrow">' + T.I("sub") + '</div>'
        /* A type the dictionary has never heard of falls back to the label the
           host resolved, not to the name of the key. */
        + '<div class="m1">' + (T.key("method_" + rec.type, "")
            ? T.S("method_" + rec.type)
            : T.both(rec.typeLabel || rec.type, rec.typeAlt)) + '</div>'
        + '<div class="m2">'
          + fld(T.I("f_unit"), '<span class="unum">' + esc(rec.equip) + '</span>')
          + fld(T.I("f_cat"), esc(rec.clsLabel || ""))
          + (rec.model ? fld(T.I("f_model"), esc(rec.model)) : "")
          + fld(T.I("f_date"), '<b>' + esc(rec.date || "") + '</b>')
          + (rec.smu ? fld(T.I("f_smu"), '<b>' + esc(rec.smu) + '</b>') : "")
          + fld(T.I("f_pts"), '<b>' + rec.items.length + '</b>')
        + '</div>'
        + (mine.length > 1
            ? '<div class="quiet" style="margin-top:7px;">'
              + T.S("rounds_n", { n: mine.length - 1 }) + '</div>' : "")
        /* Something the host knows about this sheet that the readings cannot
           say. It exists for one case and the case matters: a round pulled from
           the folder prints its photographs by fetching them, and a phone with
           no signal cannot. Without a line here that sheet is indistinguishable
           from a round where nobody took a picture — a real value rendered as
           nothing, which is the failure this project keeps having to fix. Both
           renderings come from the host, already translated. */
        + (rec.note ? '<div class="quiet" style="margin-top:7px;">'
              + T.both(rec.note, rec.noteAlt, "altl") + '</div>' : "")
        + '</div>';

      /* A cell is earned by having something to show or something to say. A
         position with nothing but the machine's hours on it is not a finding,
         and giving it a photo-sized box says it is. Those go on one line under
         the board, which is where they belong and where they cost nothing.
         On a wear round the grid and the drawing are the record, so nothing
         goes on the board at all. */
      var told = rec.items.filter(function (it) {
        return it.grade === "B" || it.grade === "C" || it.grade === "X" || it.defect
          || it.action || it.comment || it.sev === "DEG" || it.sev === "CRI"
          || (it.photos && it.photos.length);
      });
      var rest = rec.items.filter(function (it) { return told.indexOf(it) < 0; });
      var board = isWear ? [] : told;
      var vc = verdict(rec);

      /* "All points normal" cannot be printed above "5 compartments hold
         something other than the site standard" - and it was, because normal is
         computed from grades and severities, and off-standard is neither. A
         compartment holding the wrong oil is graded A by a fitter who correctly
         recorded what he found; the finding is the comparison, not the grade. */
      var offStd = rec.items.filter(function (it) { return it.lube && it.lube.off; });
      var body = "";
      if (!isWear && !board.length && !offStd.length) {
        body = '<div class="allok">' + T.S("allok", { n: rec.items.length }) + '</div>'
             + restLine(T, rest, true);
      } else if (!isWear && !board.length) {
        /* Everything the fitter graded is fine; what is wrong is what is IN
           them, and the table below says which. */
        body = restLine(T, rest, true);
      } else if (board.length && board.length <= 12) {
        var cols = board.length >= 4 ? 4 : board.length === 3 ? 3 : board.length === 2 ? 2 : 1;
        var sh = shared(board);
        body = commonBand(T, sh, board.length)
          + '<div class="board b' + cols + '">'
          + board.map(function (it) { return cell(ctx, T, it, sh); }).join("") + '</div>'
          + restLine(T, rest, false);
      } else if (board.length) {
        body = notableTable(ctx, T, board) + restLine(T, rest, false);
      }

      var sign = '<div class="shsign">'
        + '<div><div class="rl">' + T.L("f_by") + '</div><div class="ln"></div>'
          + '<div class="nm">' + esc(rec.by || "—") + '</div></div>'
        + '<div><div class="rl">' + T.L("f_sup") + '</div>'
          + '<div class="ln">' + (rec.signUrl ? '<img src="' + rec.signUrl + '">' : "") + '</div>'
          + '<div class="nm">' + esc(rec.sup || T("nosign")) + '</div></div></div>';

      /* A lubrication round has nothing to MEASURE and is still not one page.
         The audit is the compartment table - what is actually in each one, how
         the fitter knows, whether a sample went with it - and every clean round
         was collapsing to "all points normal" and throwing that away. Which is
         most of them: a compartment holding the right oil is the ordinary case
         and still the thing being reported on. */
      var isLube = rec.items.some(function (it) { return it.lube; });
      if (!isWear && isLube) {
        secs.push({ nb: n > 0, html: '<div class="sec">' + head + body + '</div>' });
        lubeSections(ctx, T, rec, sign).forEach(function (x) { secs.push(x); });
        return;
      }
      /* A round with nothing to measure is one page: masthead, board, names. */
      if (!isWear) {
        secs.push({ nb: n > 0, html: '<div class="sec">' + head + body + sign + '</div>' });
        return;
      }

      /* An undercarriage round earns its extra pages — the drawing and the
         readings are the whole point of it. */
      var over = rec.items.filter(function (it) {
        return it.w && (it.w.band === "act" || it.w.band === "watch"); })
        .sort(function (a, b) { return (Number(b.w.pct) || 0) - (Number(a.w.pct) || 0); });
      var overAct = over.filter(function (it) { return it.w.band === "act"; });
      var unread = rec.items.filter(function (it) { return it.w && it.w.mm == null; }).length;
      var verd = (vc === "ok" && unread)
        ? T.S("verdict_part", { m: rec.items.length - unread, of: rec.items.length, n: unread })
        : T.S("verdict_" + vc, { n: over.length, of: rec.items.length })
          + (unread ? T.S("unread_n", { n: unread, of: rec.items.length }) : "");
      var maps = CMR.mapBlock(T, rec.mapHTML, 8, rec.zones, rec.mapKey);
      var top = '<div class="sec">' + head
        + '<div class="verdict v-' + ((vc === "ok" && unread) ? "watch" : vc) + '">' + verd + '</div>'
        + (over.length ? '<div class="verdict v-' + (overAct.length ? "act" : "watch") + '" style="margin-top:9px;">'
            + (overAct.length ? T.I("uc_over", { n: overAct.length }) + ". " : "")
            + (over.length > overAct.length ? T.I("uc_watch", { n: over.length - overAct.length }) + ". " : "")
            + '<span style="font-weight:500;">' + over.slice(0, 6).map(function (it) {
                return esc(it.name || it.key) + ' <span class="num">' + esc(it.w.pct) + '%</span>'; }).join(" · ")
            + (over.length > 6 ? " · +" + (over.length - 6) : "") + '</span></div>' : "")
        + maps + '</div>';
      secs.push({ nb: n > 0, html: top });
      measSections(ctx, T, rec, sign).forEach(function (x) { secs.push(x); });
      /* A round that has BOTH gets both. Only the wear-less case is folded into
         measSections above, so this must not double-render it. */
      if (rec.items.some(function (it) { return it.w && it.w.mm != null; }))
        lubeSections(ctx, T, rec, "").forEach(function (x) { secs.push(x); });
      if (told.filter(function (it) { return it.photos && it.photos.length; }).length) {
        var ph = told.filter(function (it) { return it.photos && it.photos.length; });
        /* One position with photographs is not one narrow card in the corner
           of an empty page. The findings board caps a single cell at 340px so a
           card of text does not stretch across A4 — right there, wrong here,
           where the cell holds the pictures and the page is theirs. */
        secs.push({ nb: false, html: '<div class="sec">'
          + '<div class="subhd">' + T.I("photos") + '</div>'
          + '<div class="board gal b' + (ph.length >= 2 ? 2 : 1) + '">'
          + ph.map(function (it) { return cell(ctx, T, it, null, true); }).join("") + '</div></div>' });
      }
    });

    if (older.length) historySections(ctx, T, latest, older).forEach(function (x) { secs.push(x); });
    return secs;
  }

  /* ---- everything before the latest round ----------------------------------
     Two tables instead of N sheets. The first says what each earlier round
     concluded; the second puts every measured point on one row with its
     readings in date order, so a part that is walking towards its limit shows
     as a line of numbers going one way. That is the thing a reliability
     engineer opens a unit report to see, and printing four snapshots of the
     same machine never showed it once. */
  function historySections(ctx, T, latest, older) {
    var VC = { ok: ["v_ok", GRADE_HEX.A], watch: ["v_watch", GRADE_HEX.C], act: ["v_act", GRADE_HEX.X] };
    var rows = older.map(function (rec, i) {
      var vc = verdict(rec), v = VC[vc] || VC.ok;
      var worst = rec.items.filter(function (it) { return it.w && it.w.pct != null; })
        .sort(function (a, b) { return (Number(b.w.pct) || 0) - (Number(a.w.pct) || 0); })[0];
      var said = rec.items.filter(function (it) { return it.defect; })
        .map(function (it) { return it.defect; });
      var note = worst ? esc(worst.name || worst.key) + ' <span class="num">' + esc(worst.w.pct) + '%</span>'
        : said.length ? esc(said.slice(0, 2).join(" · ")) + (said.length > 2 ? ' <span class="muted">+' + (said.length - 2) + '</span>' : "")
        : '<span class="muted">' + T.I("none_att") + '</span>';
      return '<tr class="' + (i % 2 ? "zebra" : "") + '">'
        + '<td class="d"><b>' + esc(rec.date || "") + '</b></td>'
        + '<td>' + esc(rec.typeLabel || rec.type) + '</td>'
        + '<td class="r n">' + esc(rec.smu || "—") + '</td>'
        + '<td class="c n">' + rec.items.length + '</td>'
        + '<td><span class="vdot" style="background:' + v[1] + '"></span>' + T.I(v[0]) + '</td>'
        + '<td>' + note + '</td></tr>';
    }).join("");

    var out = [{ nb: true, html: '<div class="sec"><div class="sechd">'
      + '<span class="h2">' + T.I("hist") + '</span>'
      + '<span class="muted" style="font-size:10.5px;margin-left:auto;">' + T.I("hist_sub") + '</span></div>'
      + '<table class="hist"><tr>'
      + '<th style="width:72px">' + T.L("c_date") + '</th>'
      + '<th style="width:120px">' + T.L("c_type") + '</th>'
      + '<th class="r" style="width:58px">' + T.L("f_smu") + '</th>'
      + '<th class="c" style="width:46px">' + T.L("pts") + '</th>'
      + '<th style="width:96px">' + T.L("c_state") + '</th>'
      + '<th>' + T.L("c_worst") + '</th></tr>' + rows + '</table></div>' }];

    /* The measurement history, one row per point. Only for machines that were
       measured — a plug round has nothing to line up in columns. */
    /* Gated on the DATA, not on the round's flag. A dump body round is
       deliberately not marked `wear` - it has no machine drawing and no
       walk-the-frames layout - so this table skipped it, and the one question a
       liner is measured to answer is "how fast is it going". Any round whose
       items carry millimetres has a history worth lining up in columns. */
    var wearRuns = latest.filter(function (r) {
      return r.items.some(function (it) { return it.w && it.w.mm != null; });
    });
    var MAXCOL = 6;
    wearRuns.forEach(function (cur) {
      var all = [cur].concat(older.filter(function (r) { return r.type === cur.type; }))
        .sort(function (a, b) { return String(a.date || "").localeCompare(String(b.date || "")); });
      if (all.length < 2) return;
      /* A machine measured monthly for two years is twenty-four columns, and
         twenty-four columns do not fit on A4 in any type size worth reading.
         The most recent six, and the table above still lists every round. */
      var runs = all.slice(-MAXCOL), dropped = all.length - runs.length;
      var keys = [], seen = {};
      runs.forEach(function (r) { r.items.forEach(function (it) {
        if (it.w && !seen[it.key]) { seen[it.key] = it; keys.push(it.key); } }); });
      var read = runs.map(function (r) { var m = {};
        r.items.forEach(function (it) { if (it.w) m[it.key] = it.w; }); return m; });
      if (!keys.length) return;

      var body = keys.map(function (k, i) {
        var last = null, lastI = -1, firstV = null;
        read.forEach(function (m, j) { var w = m[k];
          if (w && w.mm != null) { if (firstV == null) firstV = Number(w.mm); last = w; lastI = j; } });
        var cells = read.map(function (m, j) { var w = m[k];
          if (!w) return '<td class="r n muted">—</td>';
          if (w.mm == null) return '<td class="r n"><span class="muted" style="font-size:9px">'
            + esc(w.reasonLabel || w.reason || "—") + '</span></td>';
          return '<td class="r n"' + (j === lastI ? ' style="font-weight:700"' : "") + '>' + esc(w.mm) + '</td>';
        }).join("");
        /* The change over the whole series, signed. Which direction is BAD
           depends on the part — an idler grows towards its limit and a roller
           shrinks towards one — so the colour comes from the limits, never
           from the sign. */
        /* How fast, and how long left.

           The arithmetic is NOT done here. It lives in one place - the same
           function the phone shows at the point of capture - and the host hands
           it in, so the report and the screen can never quote different numbers
           for the same part. report-core stays ignorant of it, the way it stays
           ignorant of the register and of IndexedDB.

           The series is the readings this table is already showing, with each
           round's date and hour meter beside them. */
        var f = null;
        if (typeof ctx.forecast === "function" && last
            && last.newMM != null && last.condemnMM != null) {
          var series = [];
          read.forEach(function (m, j) { var w = m[k];
            if (w && w.mm != null) series.push({ mm: Number(w.mm),
              at: runs[j].date, smu: runs[j].smu }); });
          if (series.length >= 2) {
            try { f = ctx.forecast({ n: Number(last.newMM), c: Number(last.condemnMM) },
                                   series); } catch (e) { f = null; }
          }
        }
        var d = (last && firstV != null) ? Number(last.mm) - firstV : null;
        var grow = last && last.condemnMM != null && last.newMM != null
          && Number(last.condemnMM) > Number(last.newMM);
        var worse = d != null && d !== 0 && ((d > 0) === !!grow);
        var dcls = d == null || Math.abs(d) < 0.05 ? "fl" : worse ? "up" : "dn";
        var ref = seen[k];
        return '<tr class="' + (i % 2 ? "zebra" : "") + '">'
          + '<td style="padding-left:0">' + T.both(ref.name || k, ref.nameAlt) + '</td>'
          + '<td class="n muted" style="font-size:9px">' + (last && last.newMM != null && last.newMM !== ""
              ? esc(last.newMM + " → " + last.condemnMM) : T.I("noref_s")) + '</td>'
          + cells
          + '<td class="r"><span class="dlt ' + dcls + '">'
            + (d == null ? "—" : (d > 0 ? "+" : "") + (Math.round(d * 10) / 10)) + '</span></td>'
          + '<td class="r n">' + (last && last.pct != null ? '<b>' + esc(last.pct) + '%</b>' : "") + '</td>'
          /* One column, two lines: the hours are what a planner acts on, the
             rate is what makes the hours believable. A forecast that cannot be
             made prints nothing rather than a dash that reads as zero. */
          + '<td class="r n life">' + (f && f.hours != null
              ? '<b>' + esc(Math.round(f.hours / 100) * 100) + ' ' + esc(T("c_h")) + '</b>'
                + (f.rate != null ? '<i>' + esc(Math.round(f.rate * 10) / 10)
                    + ' ' + esc(T("c_permm")) + '</i>' : "")
              : "") + '</td>'
          + '<td style="width:56px">' + (last && last.pct != null ? wearBar(last.pct) : "") + '</td></tr>';
      }).join("");

      out.push({ nb: false, html: '<div class="sec" style="margin-top:14px;">'
        + '<div class="subhd">' + T.I("trend_t") + ' <span class="muted" style="font-weight:400;">'
        + T.I("trend_sub") + (dropped ? ' · +' + dropped : "") + '</span></div>'
        + '<table class="mh"><tr><th style="width:' + (200 - Math.max(0, runs.length - 4) * 22) + 'px">'
        + T.L("c_item") + '</th>'
        + '<th class="n" style="width:72px">' + T.L("c_limit") + '</th>'
        + runs.map(function (r) { return '<th class="r n" style="width:46px">'
            + esc(String(r.date || "").slice(5)) + '</th>'; }).join("")
        + '<th class="r" style="width:58px">' + T.L("c_chg") + '</th>'
        + '<th class="r" style="width:50px">' + T.L("c_worn") + '</th>'
        + '<th class="r" style="width:64px">' + T.L("c_life") + '</th>'
        + '<th style="width:54px"></th></tr>' + body + '</table></div>' });
    });
    return out;
  }

  /* The positions that were checked and had nothing to report. Named, so nobody
     wonders whether they were skipped, and their readings printed once when they
     all read the same — which on a plug round they do, because component and oil
     hours belong to the machine, not to the plug. */
  function restLine(T, rest, alreadySaid) {
    if (!rest.length) return "";
    var codes = rest.map(function (it) { return it.code || it.key; }).join(", ");
    var first = (rest[0].readings || []).join(" · ");
    var same = first && rest.every(function (it) { return (it.readings || []).join(" · ") === first; });
    var reads = same ? first
      : rest.map(function (it) { return (it.readings || []).join(" · "); }).filter(Boolean).join(" · ");
    return '<div class="quiet">'
      + (alreadySaid ? "" : T.I("rest_n", { n: rest.length }) + " ")
      + '<b>' + esc(codes) + '</b>'
      + (reads ? ' <span class="num">· ' + esc(reads) + '</span>' : "")
      + '</div>';
  }

  /* A field every position agrees on, or nothing. Two positions are not a
     pattern worth lifting; three or more saying the same thing are. */
  function shared(list) {
    var out = {};
    if (list.length < 3) return out;
    ["defect", "cause", "action", "iso", "prio"].forEach(function (f) {
      var v = list[0][f];
      if (v && list.every(function (it) { return it[f] === v; })) out[f] = v;
    });
    return out;
  }
  function commonBand(T, sh, n) {
    if (!sh.defect && !sh.cause && !sh.action) return "";
    var rows = "";
    if (sh.defect) rows += '<dt>' + T.L("c_defect") + '</dt><dd>' + esc(sh.defect)
      + (sh.iso ? ' <span class="code">ISO ' + esc(sh.iso) + '</span>' : "") + '</dd>';
    if (sh.cause) rows += '<dt>' + T.L("c_cause") + '</dt><dd>' + esc(sh.cause) + '</dd>';
    if (sh.action) rows += '<dt>' + T.L("c_action") + '</dt><dd><b>' + esc(sh.action) + '</b>'
      + (sh.prio ? prioTag({ prio: sh.prio }) : "") + '</dd>';
    return '<div class="common"><div class="k">' + T.I("common_n", { n: n }) + '</div>'
      + '<dl>' + rows + '</dl></div>';
  }

  /* One position: what it looked like, then what it was. Rows appear only when
     there is something in them — an empty "Cause —" line is a line of nothing,
     and anything the band above already said is not said again here. */
  /* How many across, so the last row is not one photograph and a hole.

     Eight in a 3-wide strip is two rows and two orphans; the same eight at four
     across is two full rows. Try the widths that stay legible on A4 and take
     the one that wastes least, preferring the wider — which is also the one
     that keeps each frame biggest. */
  function gridCols(n) {
    if (n <= 3) return n;
    var best = 4, waste = 99;
    [4, 3, 2].forEach(function (c) {
      var w = (c - (n % c)) % c;
      if (w < waste || (w === waste && c > best)) { waste = w; best = c; }
    });
    return best;
  }
  function cell(ctx, T, it, sh, gallery) {
    sh = sh || {};
    /* EVERY photograph the inspector took. Somebody walked to the machine for
       each one, and a report that quietly prints half is a report that loses
       evidence — which is the whole reason the strip below wraps instead of
       ending in a "+6" badge. The badge was the failure mode: it appeared
       exactly on the positions with the most photographs, which are the
       positions where something is wrong.

       No placeholder box either — a grey rectangle saying "no photograph" is
       the same area as a photograph and carries none of the information. */
    var ph = it.photos || [];
    var top = "";
    if (ph.length) {
      /* On the PHOTOGRAPHS sheet every frame is the same size, in rows across
         the page. The establishing-shot-plus-strip below is right on a findings
         board, where the card is a narrow column beside three others and the
         first picture has to carry it — but on a page that is nothing but
         photographs it made one frame four times the size of the rest for no
         reason, and left the right half of the sheet empty. */
      if (gallery) {
        top = '<div class="phg" style="grid-template-columns:repeat('
          + gridCols(ph.length) + ',1fr)">'
          + ph.map(function (u) { return '<img src="' + u + '">'; }).join("")
          + '</div>';
      } else {
        top = '<img class="ph" src="' + ph[0] + '">';
        var rest = ph.slice(1);
        if (rest.length) {
          top += '<div class="phx">'
            + rest.map(function (u) { return '<img src="' + u + '">'; }).join("")
            + '</div>';
        }
      }
    }
    var rows = "";
    function row(k, v) { rows += '<dt>' + k + '</dt><dd>' + v + '</dd>'; }
    if (it.defect && !sh.defect) row(T.L("c_defect"), esc(it.defect)
      + (it.iso ? ' <span class="code">ISO ' + esc(it.iso) + '</span>' : ""));
    if (it.cause && !sh.cause) row(T.L("c_cause"), esc(it.cause));
    if (it.action && !sh.action) row(T.L("c_action"), '<b>' + esc(it.action) + '</b>'
      + prioTag(it) + (it.wo ? ' <span class="code">' + esc(T("c_wo")) + ' ' + esc(it.wo) + '</span>' : ""));
    else if (it.wo || (it.prio && !sh.prio)) row(T.L("c_wo"),
      (it.prio && !sh.prio ? prioTag(it) + " " : "") + '<span class="num">' + esc(it.wo || "") + '</span>');
    /* The lubrication round's whole answer. It is NOT a reading: a reading is
       a figure and gets tabular numerals, while this is a product name, how the
       fitter knows it, and whether a sample went with it. Folding it into the
       reading line was how it came out as nothing at all.

       The host passes both languages for anything translatable, because this
       module is deliberately ignorant of LUBE and of the register — and because
       a label baked in one language at the host is exactly what left this
       report bilingual only for undercarriage rounds. */
    if (it.lube) {
      var Lb = it.lube;
      if (Lb.product) row(T.L("c_lube_prod"), '<b>' + esc(Lb.product) + '</b>');
      if (Lb.evid) row(T.L("c_lube_evid"), T.both(Lb.evid.en, Lb.evid.ru, ""));
      if (Lb.samp != null) row(T.L("c_lube_samp"),
        T.I(Lb.samp ? "c_taken" : "c_nottaken"));
      /* The finding. Right specification, wrong drum is the thing this round
         exists to catch, so it is stated rather than left to be worked out by
         comparing two lines. */
      if (Lb.want && Lb.off)
        row(T.L("c_lube_want"), '<b>' + esc(Lb.want) + '</b> '
          + '<span class="code">' + esc(T("c_lube_off")) + '</span>');
    }
    var read = (it.readings || []).slice();
    if (it.w && it.w.mm != null) read.unshift(it.w.mm + " mm" + (it.w.pct != null ? " · " + it.w.pct + "%" : ""));
    if (read.length) row(T.L("c_reading"), '<span class="num">' + esc(read.join(" · ")) + '</span>');
    return '<div class="cel">' + top + '<div class="bd">'
      /* The code first: it is what is stamped on the machine and what a fitter
         navigates by. The name underneath says which one that is — in both
         languages, because the fitter and the engineer read different ones. */
      + '<div class="pk">' + esc(it.code || it.key) + '</div>'
      + (it.code && it.name && it.name !== it.code
          ? '<div class="pn">' + T.both(it.name, it.nameAlt, "") + '</div>' : "")
      + ((it.grade || it.sev) ? '<div class="chips">' + gradeChip(it.grade) + sevChip(ctx, it.sev) + '</div>' : "")
      + (rows ? '<dl>' + rows + '</dl>' : "")
      + (it.comment ? '<div class="cm">' + esc(it.comment) + '</div>' : "")
      + '</div></div>';
  }

  function mapKey(T) {
    /* .mapkey .i is inline-flex, so each pair is wrapped: a loose translation
       span would sit beside its label as a sibling flex item, not with it. */
    var i = function (bg, dash, k) {
      return '<span class="i"><span class="d" style="background:' + bg
        + (dash ? ';border-style:dashed' : ';border-color:' + bg) + '"></span>'
        + '<span>' + T.I(k) + '</span></span>';
    };
    return '<div class="mapkey">'
      + i(GRADE_HEX.A, false, "band_ok") + i(GRADE_HEX.C, false, "band_watch")
      + i(GRADE_HEX.X, false, "band_act") + i("#e6eaee", true, "map_na")
      + '</div>';
  }

  /* ======================================================================== */
  CMR.sections = function (ctx) {
    var T = makeT(ctx.lang, ctx.bi !== false);
    var recs = ctx.records.slice().sort(function(a,b){
      return String(a.date||"").localeCompare(String(b.date||""))
        || String(a.equip).localeCompare(String(b.equip)); });
    var X = scan(recs), secs = [];
    var st = ctx.stamp || new Date(), p2=function(n){return String(n).padStart(2,"0");};
    /* The document's shape follows what is in it. One machine does not need a
       fleet cover, a triage list or a legend page — it needs the round. */
    var oneMachine = X.unitN === 1;
    var mode = ctx.mode || (oneMachine ? "unit" : "fleet");
    if (mode === "unit") {
      var byNew = recs.slice().reverse();          // newest round first
      var sheets = unitSheets(ctx, T, byNew);
      /* A host section numbers itself by position — it cannot know what came
         before it, so it writes __N__ and the caller fills it in. The fleet
         path did; this one never did, and shipped a literal "__N__" as the
         section number of every trend page in every single-machine PDF. */
      var un = 0;
      (ctx.extra || []).forEach(function (x) {
        un++;
        sheets.push({ nb: x.nb, html: String(x.html).split("__N__").join(p2(un)) });
      });
      return sheets;
    }
    // 8/1/2026 means one thing in Anadyr and another in Denver. Write it once.
    var stampTxt = st.getFullYear()+"-"+p2(st.getMonth()+1)+"-"+p2(st.getDate())
                 +" "+p2(st.getHours())+":"+p2(st.getMinutes());
    var today = st.getFullYear()+"-"+p2(st.getMonth()+1)+"-"+p2(st.getDate());

    /* ---------- 1. the answer ---------- */
    var graded = X.grade.A+X.grade.B+X.grade.C+X.grade.X;
    var bar = ["A","B","C","X"].map(function(g){ var n=X.grade[g]; if(!n) return "";
      return '<span style="width:'+(n/graded*100).toFixed(2)+'%;background:'+GRADE_HEX[g]+'"></span>'; }).join("");
    /* Wrapped, not bare. .barkey .i is a flex row, so a loose translation span
       would land BESIDE the label as its own flex item rather than under it. */
    var key = ["A","B","C","X"].map(function(g){ var n=X.grade[g]; if(!n) return "";
      return '<span class="i"><span class="sw" style="background:'+GRADE_HEX[g]+'"></span><b>'
        +n+'</b> <span>'+T.L("g_"+g)+'</span></span>'; }).join("");
    var typeLine = Object.keys(X.types).map(function(k){
      return X.types[k]+" "+esc(X.typeLabel[k]||k); }).join(" · ");
    var wearN = X.wear.ok+X.wear.watch+X.wear.act;

    var glance = recs.map(function(rec,i){
      var v=verdict(rec);
      var unread = rec.wear ? rec.items.filter(function(it){ return it.w && it.w.mm==null; }).length : 0;
      var v2 = (v==="ok"&&unread) ? "watch" : v;
      var col = v2==="act"?GRADE_HEX.X : v2==="watch"?GRADE_HEX.C : GRADE_HEX.A;
      var mine = X.act.filter(function(f){ return f.rec===rec; });
      var seen=[];
      mine.forEach(function(f){
        var w = f.roll ? T("uc_over",{n:f.act.length})
                       : (f.it.defect || f.it.name || f.it.key);
        if(seen.indexOf(w)<0) seen.push(w); });
      if(unread) seen.push(T("unread_s",{n:unread}));
      var words = seen.length
        ? seen.slice(0,2).map(esc).join(" · ")
          + (seen.length>2 ? ' <span class="muted">+'+(seen.length-2)+'</span>' : "")
        : '<span class="muted">'+esc(T("none_att"))+'</span>';
      return '<tr class="'+(i%2?"zebra":"")+'">'
        + '<td class="stripe" style="border-left-color:'+col+'"><span class="unit">'+esc(rec.equip)+'</span></td>'
        + '<td>'+T.both(rec.typeLabel||rec.type, rec.typeAlt)+'</td>'
        + '<td class="c n">'+esc(rec.date||"")+'</td>'
        + '<td class="c n">'+rec.items.length+'</td>'
        + '<td>'+words+'</td></tr>';
    }).join("");

    secs.push({nb:false, html:
      '<div class="sec">'
      + '<div class="eyebrow">'+(ctx.sub?T.both(ctx.sub,ctx.subAlt,"alti"):T.I("sub"))+'</div>'
      + '<div class="h1">'+T.both(ctx.title,ctx.titleAlt)+'</div>'
      + '<div class="rule" style="margin:13px 0 0"></div>'
      + '<div class="muted num" style="font-size:10.5px;padding:7px 0 20px;">'
        + T.I("generated")+' '+esc(stampTxt)+(typeLine?" · "+typeLine:"")+'</div>'
      + '<div class="lede" style="margin-bottom:18px;">'
        + (X.total ? T.S("head_some",{n:X.total,c:X.crit}) : T.S("head_none"))+'</div>'
      + '<div class="stats">'
        + '<div class="stat"><div class="k">'+T.L("mach")+'</div><div class="v">'+X.unitN+'</div>'
          + '<div class="s">'+T.I("ins")+': '+X.rounds+'</div></div>'
        + '<div class="stat"><div class="k">'+T.L("pts")+'</div><div class="v">'+X.pts+'</div>'
          + '<div class="s">'+esc(X.first||"—")+(X.last&&X.last!==X.first?" → "+esc(X.last):"")+'</div></div>'
        + '<div class="stat"><div class="k">'+T.L("work")+'</div>'
          + '<div class="v" style="color:'+(X.total?GRADE_HEX.C:GRADE_HEX.A)+'">'+X.total+'</div>'
          + '<div class="s">'+T.I("findings")+'</div></div>'
        + '<div class="stat"><div class="k">'+T.L("now")+'</div>'
          + '<div class="v" style="color:'+(X.crit?GRADE_HEX.X:GRADE_HEX.A)+'">'+X.crit+'</div>'
          + '<div class="s">'+T.I("now_s")+'</div></div>'
      + '</div>'
      + (graded ? '<div style="margin-top:20px;"><div class="eyebrow" style="margin-bottom:8px;">'
          + T.I("cond")+'</div><div class="bar">'+bar+'</div><div class="barkey">'+key+'</div></div>' : "")
      + '<div style="margin-top:22px;"><div class="eyebrow" style="margin-bottom:9px;">'+T.I("glance")+'</div>'
        + '<table><tr><th style="width:78px">'+T.L("c_unit")+'</th>'
        + '<th style="width:118px">'+T.L("c_type")+'</th>'
        + '<th class="c" style="width:62px">'+T.L("c_date")+'</th>'
        + '<th class="c" style="width:54px">'+T.L("pts")+'</th>'
        + '<th>'+T.L("c_find")+'</th></tr>'+glance+'</table></div>'
      + (wearN ? '<div style="margin-top:20px;"><div class="eyebrow" style="margin-bottom:8px;">'
          + T.I("uc_cond")+'</div><div class="barkey" style="margin-top:0;">'
          + '<span class="i"><span class="sw" style="background:'+GRADE_HEX.A+'"></span><b>'+X.wear.ok+'</b> '+T.I("band_ok")+'</span>'
          + '<span class="i"><span class="sw" style="background:'+GRADE_HEX.C+'"></span><b>'+X.wear.watch+'</b> '+T.I("band_watch")+'</span>'
          + '<span class="i"><span class="sw" style="background:'+GRADE_HEX.X+'"></span><b>'+X.wear.act+'</b> '+T.I("band_act")+'</span>'
          + '</div></div>' : "")
      + '</div>'});

    /* ---------- 2. the work ---------- */
    var wl = '<div class="sec"><div class="sechd"><span class="n">01</span>'
      + '<span class="h2">'+T.I("work")+'</span>'
      + '<span class="muted" style="font-size:10.5px;margin-left:auto;">'+T.I("work_sub")+'</span></div>';
    if(!X.act.length){
      wl += '<div class="verdict v-ok">'+T.S("work_none")+'</div>';
    } else {
      wl += '<table><tr>'
        + '<th style="width:74px">'+T.L("c_unit")+'</th>'
        + '<th style="width:150px">'+T.L("c_comp")+'</th>'
        + '<th style="width:180px">'+T.L("c_find")+'</th>'
        + '<th style="width:150px">'+T.L("c_cause")+'</th>'
        + '<th style="width:130px">'+T.L("c_do")+'</th>'
        + '<th class="c" style="width:54px">'+T.L("c_date")+'</th></tr>';
      X.act.forEach(function(f,i){
        var rec=f.rec, it=f.it||{}, col=SEV_HEX[f.sev]||GRADE_HEX[it.grade]||"#c9d0d6";
        var todo = it.action
          ? '<b>'+esc(it.action)+'</b>'+prioTag(it)
            +(it.wo?'<div class="code">'+esc(T("c_wo"))+' '+esc(it.wo)+'</div>':"")
          : '<span class="muted">'+T.I("do_tbd")+'</span>';
        var head = '<tr class="'+(i%2?"zebra":"")+'">'
          + '<td class="stripe" style="border-left-color:'+col+'"><span class="unit">'+esc(rec.equip)+'</span>'
          + '<div class="code">'+esc(rec.typeLabel||rec.type)+'</div></td>';
        var tail = '<td class="c n">'+esc(String(rec.date||"").slice(5))+'</td></tr>';
        if(f.roll){
          var worst=f.act.concat(f.watch).slice(0,3).map(function(x){
            return esc(x.it.name||x.it.key)+' <span class="n">'+x.pct+'%</span>'; }).join("<br>");
          wl += head
            + '<td><b>'+T.I("uc_cond")+'</b><div class="code">'
              + T.I("flagged",{n:f.act.length+f.watch.length})+'</div></td>'
            + '<td>'+(f.act.length?'<b>'+T.S("uc_over",{n:f.act.length})+'</b>':"")
              + (f.watch.length?T.S("uc_watch",{n:f.watch.length}):"")
              + '<div style="margin-top:3px;">'+sevChip(ctx,f.sev)+'</div>'
              + '<div class="code" style="margin-top:4px;line-height:1.5;">'+worst+'</div></td>'
            + '<td><span class="muted">'+T.S("uc_cause")+'</span></td>'
            + '<td>'+todo+'</td>' + tail;
          return;
        }
        var find=[ it.defect?esc(it.defect):"",
                   (f.w&&f.w.pct!=null)?esc(f.w.pct)+"% "+T.I("c_worn")+" · "+esc(f.w.mm)+" mm":"",
                   (!it.defect&&it.comment)?esc(it.comment):"" ].filter(Boolean).join("<br>");
        wl += head
          + '<td>'+nameCell(T,it)+'</td>'
          + '<td>'+(find||"—")+'<div style="margin-top:3px;">'+gradeChip(it.grade)+' '+sevChip(ctx,f.sev)+'</div>'
            + (it.defectCode?'<div class="code">'+esc(it.defectCode)+(it.iso?' · ISO '+esc(it.iso):"")+'</div>':"")+'</td>'
          + '<td>'+(it.cause?esc(it.cause):'<span class="muted">'+T.I("cause_tbd")+'</span>')+'</td>'
          + '<td>'+todo+'</td>' + tail;
      });
      wl += '</table>';
    }
    secs.push({nb:true, html: wl+'</div>'});

    /* ---------- host sections (trends, Pareto) sit between work and detail ----
       They are numbered by position, not by hand: a host that adds a section
       should not have to know what number the detail section will then be, and
       two sections both labelled 02 is how a reader loses their place. */
    var secN = 1;                                   // 01 was the work list
    (ctx.extra||[]).forEach(function(x){
      secN++;
      secs.push({nb:x.nb, html:String(x.html).split("__N__").join(p2(secN))});
    });

    /* ---------- 3. the evidence, one machine at a time ---------- */
    var first = true;
    recs.forEach(function(rec){
      var isWear=!!rec.wear, isTemp=!!rec.temp;
      /* On a wear round the measurement grid IS the detail. Listing the same
         thirty-four points again above it, in a table whose grade, severity and
         defect columns are all empty, was two pages saying one thing. */
      var notable = rec.items.filter(function(it){
        var said = it.grade==="B"||it.grade==="C"||it.grade==="X"||it.defect||it.action
          ||it.comment||it.sev==="DEG"||it.sev==="CRI";
        return isWear ? said : (said || (it.w&&(it.w.band==="act"||it.w.band==="watch"))); });
      var quiet = rec.items.length - notable.length;
      var vc = verdict(rec);
      var unread = isWear ? rec.items.filter(function(it){ return it.w && it.w.mm==null; }).length : 0;
      var over = isWear ? rec.items.filter(function(it){ return it.w && (it.w.band==="act"||it.w.band==="watch"); })
        .sort(function(a,b){ return (Number(b.w.pct)||0)-(Number(a.w.pct)||0); }) : [];
      var overAct = over.filter(function(it){ return it.w.band==="act"; });
      var vn = isWear ? over.length : notable.length;

      var m = '<div class="sec"><div class="mach">'
        + (first ? '<div class="sechd" style="border:0;padding:0;margin:0 0 11px;">'
            + '<span class="n">'+p2(secN+1)+'</span><span class="h2">'+T.I("detail")+'</span></div>' : "")
        + '<div class="machhd"><span class="u">'+esc(rec.equip)+'</span>'
          + '<span class="c">'+esc(rec.clsLabel||"")+'</span>'
          + '<span class="c" style="margin-left:auto;">'+esc(rec.typeLabel||rec.type)+'</span></div>'
        + '<div class="meta">'
          + '<span class="m"><i>'+T.I("c_date")+'</i><span class="num">'+esc(rec.date||"")+'</span></span>'
          + (rec.smu?'<span class="m"><i>SMU</i><span class="num">'+esc(rec.smu)+'</span></span>':"")
          + (rec.by?'<span class="m"><i>'+T.I("by_who")+'</i>'+esc(rec.by)+'</span>':"")
          + '<span class="m"><i>'+T.I("pts")+'</i><span class="num">'+rec.items.length+'</span></span>'
          + (rec.gps?'<span class="m"><i>'+T.I("gps")+'</i><span class="num">'
              + rec.gps.lat.toFixed(4)+', '+rec.gps.lon.toFixed(4)+'</span></span>':"")
        + '</div>'
        + '<div class="verdict v-'+((vc==="ok"&&unread)?"watch":vc)+'">'
          + ((vc==="ok"&&unread)
              ? T.S("verdict_part",{m:rec.items.length-unread,of:rec.items.length,n:unread})
              : T.S("verdict_"+vc,{n:vn,of:rec.items.length})
                + (unread?T.S("unread_n",{n:unread,of:rec.items.length}):""))
          + '</div>';
      first = false;

      if(notable.length) m += notableTable(ctx,T,notable);
      // the verdict already said "all N normal" — no need to say it twice
      if(quiet>0 && notable.length)
        m += '<div class="muted" style="font-size:10.5px;margin-top:8px;">'+T.S("normal_n",{n:quiet})+'</div>';

      /* A thirty-six point measurement grid plus four photographs is taller than
         a page. Anything that could overflow becomes its own section, headed
         with the machine it continues; a short round stays in one piece. */
      var extra=[];
      var cont = '<div class="sec"><div class="mach" style="border-top-width:1px;">'
        + '<div class="machhd"><span class="u" style="font-size:14px;">'+esc(rec.equip)+'</span>'
        + '<span class="c">'+T.I("cont")+'</span></div>';

      if(isWear){
        /* The frames are their own section — one picture of the machine per
           round, and a page break lands between the drawing and the readings
           rather than through the middle of a track frame. */
        if(rec.mapHTML) extra.push(cont + CMR.mapBlock(T, rec.mapHTML, 11, rec.zones, rec.mapKey) + "</div></div>");
        if(over.length) m += '<div class="verdict v-'+(overAct.length?"act":"watch")+'" style="margin-top:12px;">'
          + (overAct.length?T.I("uc_over",{n:overAct.length})+". ":"")
          + (over.length>overAct.length?T.I("uc_watch",{n:over.length-overAct.length})+". ":"")
          + '<span style="font-weight:500;">'+over.slice(0,6).map(function(it){
              return esc(it.name||it.key)+' <span class="num">'+esc(it.w.pct)+'%</span>'; }).join(" · ")
          + (over.length>6?" · +"+(over.length-6):"")+'</span></div>';
        measSections(ctx,T,rec,"").forEach(function(x){ extra.push(x.html); });
        if (rec.items.some(function (it) { return it.w && it.w.mm != null; }))
          lubeSections(ctx,T,rec,"").forEach(function(x){ extra.push(x.html); });
      }

      var shots=[];
      rec.items.forEach(function(it){ (it.photos||[]).forEach(function(u){ shots.push({it:it,u:u}); }); });
      if(shots.length){
        var ph=cont+'<div class="subhd" style="margin-top:11px;">'+T.I("photos")+'</div><div class="shots">';
        shots.forEach(function(s){ ph+='<figure><img src="'+s.u+'"><figcaption>'
          + esc(s.it.name||s.it.key)+'</figcaption></figure>'; });
        extra.push(ph+'</div></div></div>');
      }

      var sign = '<div class="hair" style="margin:15px 0 11px;"></div><div class="sign">'
        + '<div><div class="rl">'+T.L("by_who")+'</div><div class="ln"></div>'
          + '<div class="nm">'+esc(rec.by||"—")+'</div></div>'
        + '<div><div class="rl">'+T.L("sup")+'</div>'
          + '<div class="ln">'+(rec.signUrl?'<img src="'+rec.signUrl+'">':"")+'</div>'
          + '<div class="nm">'+esc(rec.sup||T("nosign"))+'</div></div></div>';
      if(!extra.length){
        secs.push({nb:false, html:m+sign+'</div></div>'});   // a short round stays whole
      } else {
        secs.push({nb:false, html:m+'</div></div>'});
        extra.forEach(function(x){ secs.push({nb:false, html:x}); });
        // the names go with the last part, never alone on a page of their own
        var last=secs.pop();
        secs.push({nb:false, html:last.html.replace(/<\/div><\/div>$/, sign+'</div></div>')});
      }
    });

    /* ---------- 4. how to read any of it ---------- */
    var gl=["A","B","C","X"].map(function(g){
      return '<div class="lgrow">'+gradeChip(g)+'<div class="t">'+T.S("g_"+g)+'</div></div>'; }).join("");
    var sl=["NOF","INC","DEG","CRI"].map(function(s){
      return '<div class="lgrow">'+sevChip(ctx,s)+'<div class="t">'+T.S("s_"+s)+'</div></div>'; }).join("");
    secs.push({nb:true, html:'<div class="sec">'
      + '<div class="sechd"><span class="n">'+p2(secN+2)+'</span><span class="h2">'+T.I("legend")+'</span></div>'
      + '<div class="legend"><div>'
        + '<div class="eyebrow" style="margin-bottom:9px;">'+T.I("lg_grade")+'</div>'+gl
        + '<div class="eyebrow" style="margin:16px 0 9px;">'+T.I("lg_sev")+'</div>'+sl
      + '</div><div>'
        + '<div class="eyebrow" style="margin-bottom:9px;">'+T.I("lg_wear")+'</div>'
        + '<div class="body">'+T.S("lg_wear_d")+'</div>'
        + [[45,"band_ok"],[88,"band_watch"],[112,"band_act"]].map(function(x){
            return '<div style="display:flex;gap:9px;align-items:center;margin-top:'
              +(x[0]===45?10:5)+'px;">'+wearBar(x[0])+'<span class="body">'+x[0]+'% — '
              +T.I(x[1])+'</span></div>'; }).join("")
        + '<div class="eyebrow" style="margin:16px 0 9px;">'+T.I("lg_iso")+'</div>'
        + '<div class="body">'+T.S("lg_iso_d")+'</div>'
      + '</div></div>'
      + '<div class="hair" style="margin:20px 0 8px;"></div>'
      + '<div class="muted" style="font-size:9.5px;">'+T.I("footer")+' · '+esc(today)+'</div>'
      + '</div>'});

    return secs;
  };

  /* ---- laying it onto A4 --------------------------------------------------
     Section by section rather than one canvas sliced at fixed intervals: that
     cut tables through the middle of a row and split a machine's header from
     its findings. A section that will not fit the room left on a page starts
     the next one. */
  CMR.paginate = async function (opts) {
    var holder = document.createElement("div");
    holder.id = "rptRoot";
    holder.style.cssText = "position:fixed;left:-99999px;top:0;width:760px;background:#fff;z-index:-1;";
    var st = document.createElement("style"); st.textContent = CMR.CSS;
    document.head.appendChild(st);
    holder.innerHTML = opts.sections.map(function(s){ return '<div class="secwrap">'+s.html+'</div>'; }).join("");
    document.body.appendChild(holder);
    await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
    try{
      var doc = new opts.jsPDF({unit:"pt",format:"a4"});
      var PW=595, PH=842, M=38, FOOT=22, cw=PW-2*M, top=M, bottom=PH-M-FOOT;
      var els = Array.prototype.slice.call(holder.children);
      var y=top, drew=false;
      for(var i=0;i<els.length;i++){
        if(opts.onProgress) opts.onProgress(i+1, els.length);
        var h2c = Object.assign({scale:opts.scale||2, backgroundColor:"#ffffff", logging:false},
                                opts.h2c||{});
        var c = await opts.html2canvas(els[i], h2c);
        if(!c.width||!c.height) continue;
        var k = cw/c.width, hh = c.height*k;
        if(opts.sections[i].nb && drew){ doc.addPage(); y=top; }
        else if(drew && hh<=bottom-top && y+hh>bottom){ doc.addPage(); y=top; }
        var sY=0;
        while(sY<c.height){
          var roomPt=bottom-y;
          if(roomPt<46){ doc.addPage(); y=top; continue; }
          var sliceH=Math.min(Math.floor(roomPt/k), c.height-sY);
          var c2=document.createElement("canvas"); c2.width=c.width; c2.height=sliceH;
          var cx=c2.getContext("2d");
          cx.fillStyle="#ffffff"; cx.fillRect(0,0,c2.width,c2.height);
          cx.drawImage(c,0,sY,c.width,sliceH,0,0,c.width,sliceH);
          /* The single biggest lever on the file size, and it was a literal.
             A page of this report is type, rules and flat fills — the things
             JPEG encodes cheaply — plus one photograph, which is the only part
             that suffers. A phone sending a PDF off a Chukotka satellite link
             wants a different point on that curve from an office printing it. */
          doc.addImage(c2.toDataURL("image/jpeg",opts.jpeg||0.92),"JPEG",M,y,cw,sliceH*k);
          y+=sliceH*k; sY+=sliceH; drew=true;
          if(sY<c.height){ doc.addPage(); y=top; }
        }
        y+=14;
      }
      // Page numbers are drawn as text, not raster — crisp, and digits need no font.
      var n=doc.getNumberOfPages();
      for(var pg=1;pg<=n;pg++){
        doc.setPage(pg);
        doc.setDrawColor(223,228,233); doc.setLineWidth(0.5);
        doc.line(M,PH-M-10,PW-M,PH-M-10);
        doc.setFontSize(7.5); doc.setTextColor(123,133,142);
        doc.text(opts.docId||"CM", M, PH-M+2);
        doc.text(pg+" / "+n, PW-M, PH-M+2, {align:"right"});
      }
      return doc;
    } finally { st.remove(); holder.remove(); }
  };

  root.CMR = CMR;
})(window);
