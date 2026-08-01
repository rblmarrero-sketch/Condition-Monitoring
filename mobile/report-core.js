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
              w:{mm,newMM,condemnMM,pct,band,refSrc,reason,reasonLabel,stood}|null }]
   }
   ========================================================================== */
(function (root) {
  "use strict";
  var CMR = {};

  CMR.CSS = `
#rptRoot{font:400 12px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  color:#12161a;width:760px;background:#fff;letter-spacing:0;}
#rptRoot *{box-sizing:border-box;margin:0;padding:0;}
#rptRoot .sec{width:760px;background:#fff;}
#rptRoot .eyebrow{font-size:9.5px;font-weight:700;letter-spacing:.16em;
  text-transform:uppercase;color:#5b6670;}
#rptRoot .h1{font-size:29px;font-weight:800;letter-spacing:-.02em;line-height:1.1;margin-top:7px;}
#rptRoot .h2{font-size:16px;font-weight:750;letter-spacing:-.01em;}
#rptRoot .lede{font-size:15px;line-height:1.45;font-weight:500;color:#12161a;}
#rptRoot .muted{color:#5b6670;}
#rptRoot .rule{height:2.5px;background:#12161a;}
#rptRoot .hair{height:1px;background:#dfe4e9;}
#rptRoot .num{font-variant-numeric:tabular-nums;}
#rptRoot .sechd{display:flex;align-items:baseline;gap:10px;
  border-bottom:2.5px solid #12161a;padding-bottom:6px;margin-bottom:13px;}
#rptRoot .sechd .n{font-size:9.5px;font-weight:800;letter-spacing:.16em;color:#1f5fa8;}

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
#rptRoot .sev{display:inline-block;font-size:8.5px;font-weight:700;letter-spacing:.07em;
  text-transform:uppercase;color:#fff;border-radius:3px;padding:2px 6px;line-height:1.25;}

/* the machine block */
#rptRoot .mach{border-top:2.5px solid #12161a;padding-top:9px;}
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
#rptRoot .meas > div{flex:1;}
#rptRoot .wb{display:block;height:5px;background:#eef1f4;border-radius:3px;
  position:relative;overflow:hidden;min-width:52px;}
#rptRoot .wb i{display:block;height:5px;border-radius:3px;}
#rptRoot .subhd{font-size:9px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;
  color:#5b6670;margin-bottom:5px;}

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
`;

  /* ---- the report's own vocabulary --------------------------------------
     Kept here rather than in each host's dictionary. One copy cannot drift
     from the other, and neither end can ship a page with a key showing. */
  var S = {
    en: {
      sub:"Field condition monitoring", generated:"Generated",
      mach:"Machines", ins:"Inspections", pts:"Points checked",
      findings:"Findings raised", now:"Act now", now_s:"before the next shift",
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
      footer:"Generated by the Condition Monitoring system",
    },
    ru: {
      sub:"Мониторинг состояния в поле", generated:"Сформировано",
      mach:"Машин", ins:"Осмотров", pts:"Точек проверено",
      findings:"Выявлено", now:"Срочно", now_s:"до следующей смены",
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
      meas_t:"Замеры ходовой части", photos:"Фотографии",
      by_who:"Осмотр выполнил", sup:"Проверил", nosign:"не подписано",
      gps:"Координаты", none_att:"Не отмечено.",
      legend:"Как читать этот отчёт",
      lg_grade:"Оценка состояния", lg_sev:"Категория (ИСО 14224)",
      lg_wear:"Измерение износа", lg_iso:"Кодирование",
      lg_wear_d:"Износ — это доля пути от нового размера до предельного, в процентах. 100% означает, что деталь достигла предела и подлежит замене. Свыше 80% работу следует включить в ближайший ремонт. Каждая цифра сравнивается с эталоном для модели машины или с её собственной базой, если она была снята на новой ходовой.",
      lg_iso_d:"Виды отказов, причины и категории кодируются по ИСО 14224:2016, чтобы замечания можно было считать и сравнивать по всему парку, а не читать по одному отчёту.",
      band_ok:"Годен", band_watch:"Наблюдать", band_act:"Достиг предела износа",
      g_A:"Норма — действий не требуется", g_B:"Наблюдение — проверить в следующий раз",
      g_C:"Внимание — запланировать работы", g_X:"Критично — действовать сразу",
      s_NOF:"Отказа нет — узел выполняет свою функцию",
      s_INC:"Зарождающийся — дефект начался, функция пока не затронута",
      s_DEG:"Сниженный — работает, но не по требованиям",
      s_CRI:"Критический — узел не выполняет функцию",
      noref:"нет эталона для этой модели",
      footer:"Сформировано системой мониторинга состояния",
    },
  };

  var GRADE_HEX = { A:"#0ca30c", B:"#fab219", C:"#ec835a", X:"#d03b3b" };
  var SEV_HEX   = { NOF:"#0ca30c", INC:"#fab219", DEG:"#ec835a", CRI:"#d03b3b" };
  CMR.GRADE_HEX = GRADE_HEX; CMR.SEV_HEX = SEV_HEX;

  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  CMR.esc = esc;

  /* ---- chips and bars, drawn one way ------------------------------------ */
  /* White on the amber is barely legible in print; the amber chips take dark ink. */
  function ink(hex){ return hex===GRADE_HEX.B ? "#3d2c00" : "#fff"; }
  function gradeChip(g){ if(!g) return "";
    var c=GRADE_HEX[g]||"#8a939b";
    return '<span class="g" style="background:'+c+';color:'+ink(c)+'">'+esc(g)+'</span>'; }
  function sevChip(ctx,s){ if(!s) return "";
    var c=SEV_HEX[s]||"#8a939b";
    return '<span class="sev" style="background:'+c+';color:'+ink(c)+'">'+esc(ctx.sevLabel(s))+'</span>'; }
  function wearBar(pct){
    var p=Math.max(0,Math.min(130,Number(pct)||0));
    var col = p>=100?GRADE_HEX.X : p>=80?GRADE_HEX.C : GRADE_HEX.A;
    return '<span class="wb"><i style="width:'+Math.round(p/130*100)+'%;background:'+col+'"></i></span>';
  }
  CMR.wearBar = wearBar;

  function nameCell(it){
    return esc(it.name||it.key)+(it.code?'<div class="code">'+esc(it.code)+'</div>':"");
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

  /* ======================================================================== */
  CMR.sections = function (ctx) {
    var D = S[ctx.lang] || S.en;
    function T(k, v){ var s=D[k]!=null?D[k]:(S.en[k]!=null?S.en[k]:k);
      if(v) Object.keys(v).forEach(function(x){ s=s.split("{"+x+"}").join(v[x]); });
      return s; }
    var recs = ctx.records.slice().sort(function(a,b){
      return String(a.date||"").localeCompare(String(b.date||""))
        || String(a.equip).localeCompare(String(b.equip)); });
    var X = scan(recs), secs = [];
    var st = ctx.stamp || new Date(), p2=function(n){return String(n).padStart(2,"0");};
    // 8/1/2026 means one thing in Anadyr and another in Denver. Write it once.
    var stampTxt = st.getFullYear()+"-"+p2(st.getMonth()+1)+"-"+p2(st.getDate())
                 +" "+p2(st.getHours())+":"+p2(st.getMinutes());
    var today = st.getFullYear()+"-"+p2(st.getMonth()+1)+"-"+p2(st.getDate());

    /* ---------- 1. the answer ---------- */
    var graded = X.grade.A+X.grade.B+X.grade.C+X.grade.X;
    var bar = ["A","B","C","X"].map(function(g){ var n=X.grade[g]; if(!n) return "";
      return '<span style="width:'+(n/graded*100).toFixed(2)+'%;background:'+GRADE_HEX[g]+'"></span>'; }).join("");
    var key = ["A","B","C","X"].map(function(g){ var n=X.grade[g]; if(!n) return "";
      return '<span class="i"><span class="sw" style="background:'+GRADE_HEX[g]+'"></span><b>'
        +n+'</b> '+esc(T("g_"+g))+'</span>'; }).join("");
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
        + '<td>'+esc(rec.typeLabel||rec.type)+'</td>'
        + '<td class="c n">'+esc(rec.date||"")+'</td>'
        + '<td class="c n">'+rec.items.length+'</td>'
        + '<td>'+words+'</td></tr>';
    }).join("");

    secs.push({nb:false, html:
      '<div class="sec">'
      + '<div class="eyebrow">'+esc(ctx.sub||T("sub"))+'</div>'
      + '<div class="h1">'+esc(ctx.title)+'</div>'
      + '<div class="rule" style="margin:13px 0 0"></div>'
      + '<div class="muted num" style="font-size:10.5px;padding:7px 0 22px;">'
        + esc(T("generated"))+' '+esc(stampTxt)+(typeLine?" · "+typeLine:"")+'</div>'
      + '<div class="lede" style="margin-bottom:20px;">'
        + esc(X.total ? T("head_some",{n:X.total,c:X.crit}) : T("head_none"))+'</div>'
      + '<div class="stats">'
        + '<div class="stat"><div class="k">'+esc(T("mach"))+'</div><div class="v">'+X.unitN+'</div>'
          + '<div class="s">'+esc(T("ins"))+': '+X.rounds+'</div></div>'
        + '<div class="stat"><div class="k">'+esc(T("pts"))+'</div><div class="v">'+X.pts+'</div>'
          + '<div class="s">'+esc(X.first||"—")+(X.last&&X.last!==X.first?" → "+esc(X.last):"")+'</div></div>'
        + '<div class="stat"><div class="k">'+esc(T("work"))+'</div>'
          + '<div class="v" style="color:'+(X.total?GRADE_HEX.C:GRADE_HEX.A)+'">'+X.total+'</div>'
          + '<div class="s">'+esc(T("findings"))+'</div></div>'
        + '<div class="stat"><div class="k">'+esc(T("now"))+'</div>'
          + '<div class="v" style="color:'+(X.crit?GRADE_HEX.X:GRADE_HEX.A)+'">'+X.crit+'</div>'
          + '<div class="s">'+esc(T("now_s"))+'</div></div>'
      + '</div>'
      + (graded ? '<div style="margin-top:24px;"><div class="eyebrow" style="margin-bottom:8px;">'
          + esc(T("cond"))+'</div><div class="bar">'+bar+'</div><div class="barkey">'+key+'</div></div>' : "")
      + '<div style="margin-top:26px;"><div class="eyebrow" style="margin-bottom:9px;">'+esc(T("glance"))+'</div>'
        + '<table><tr><th style="width:78px">'+esc(T("c_unit"))+'</th>'
        + '<th style="width:118px">'+esc(T("c_type"))+'</th>'
        + '<th class="c" style="width:60px">'+esc(T("c_date"))+'</th>'
        + '<th class="c" style="width:52px">'+esc(T("pts"))+'</th>'
        + '<th>'+esc(T("c_find"))+'</th></tr>'+glance+'</table></div>'
      + (wearN ? '<div style="margin-top:22px;"><div class="eyebrow" style="margin-bottom:8px;">'
          + esc(T("uc_cond"))+'</div><div class="barkey" style="margin-top:0;">'
          + '<span class="i"><span class="sw" style="background:'+GRADE_HEX.A+'"></span><b>'+X.wear.ok+'</b> '+esc(T("band_ok"))+'</span>'
          + '<span class="i"><span class="sw" style="background:'+GRADE_HEX.C+'"></span><b>'+X.wear.watch+'</b> '+esc(T("band_watch"))+'</span>'
          + '<span class="i"><span class="sw" style="background:'+GRADE_HEX.X+'"></span><b>'+X.wear.act+'</b> '+esc(T("band_act"))+'</span>'
          + '</div></div>' : "")
      + '</div>'});

    /* ---------- 2. the work ---------- */
    var wl = '<div class="sec"><div class="sechd"><span class="n">01</span>'
      + '<span class="h2">'+esc(T("work"))+'</span>'
      + '<span class="muted" style="font-size:10.5px;margin-left:auto;">'+esc(T("work_sub"))+'</span></div>';
    if(!X.act.length){
      wl += '<div class="verdict v-ok">'+esc(T("work_none"))+'</div>';
    } else {
      wl += '<table><tr>'
        + '<th style="width:74px">'+esc(T("c_unit"))+'</th>'
        + '<th style="width:150px">'+esc(T("c_comp"))+'</th>'
        + '<th style="width:180px">'+esc(T("c_find"))+'</th>'
        + '<th style="width:150px">'+esc(T("c_cause"))+'</th>'
        + '<th style="width:130px">'+esc(T("c_do"))+'</th>'
        + '<th class="c" style="width:52px">'+esc(T("c_date"))+'</th></tr>';
      X.act.forEach(function(f,i){
        var rec=f.rec, it=f.it||{}, col=SEV_HEX[f.sev]||GRADE_HEX[it.grade]||"#c9d0d6";
        var todo = it.action
          ? '<b>'+esc(it.action)+'</b>'+(it.wo?'<div class="code">'+esc(T("c_wo"))+' '+esc(it.wo)+'</div>':"")
          : '<span class="muted">'+esc(T("do_tbd"))+'</span>';
        var head = '<tr class="'+(i%2?"zebra":"")+'">'
          + '<td class="stripe" style="border-left-color:'+col+'"><span class="unit">'+esc(rec.equip)+'</span>'
          + '<div class="code">'+esc(rec.typeLabel||rec.type)+'</div></td>';
        var tail = '<td class="c n">'+esc(String(rec.date||"").slice(5))+'</td></tr>';
        if(f.roll){
          var worst=f.act.concat(f.watch).slice(0,3).map(function(x){
            return esc(x.it.name||x.it.key)+' <span class="n">'+x.pct+'%</span>'; }).join("<br>");
          wl += head
            + '<td><b>'+esc(T("uc_cond"))+'</b><div class="code">'
              + esc(T("flagged",{n:f.act.length+f.watch.length}))+'</div></td>'
            + '<td>'+(f.act.length?'<b>'+esc(T("uc_over",{n:f.act.length}))+'</b><br>':"")
              + (f.watch.length?esc(T("uc_watch",{n:f.watch.length}))+'<br>':"")
              + '<div style="margin-top:3px;">'+sevChip(ctx,f.sev)+'</div>'
              + '<div class="code" style="margin-top:4px;line-height:1.5;">'+worst+'</div></td>'
            + '<td><span class="muted">'+esc(T("uc_cause"))+'</span></td>'
            + '<td>'+todo+'</td>' + tail;
          return;
        }
        var find=[ it.defect?esc(it.defect):"",
                   (f.w&&f.w.pct!=null)?esc(f.w.pct)+"% "+esc(T("c_worn"))+" · "+esc(f.w.mm)+" mm":"",
                   (!it.defect&&it.comment)?esc(it.comment):"" ].filter(Boolean).join("<br>");
        wl += head
          + '<td>'+nameCell(it)+'</td>'
          + '<td>'+(find||"—")+'<div style="margin-top:3px;">'+gradeChip(it.grade)+' '+sevChip(ctx,f.sev)+'</div>'
            + (it.defectCode?'<div class="code">'+esc(it.defectCode)+(it.iso?' · ISO '+esc(it.iso):"")+'</div>':"")+'</td>'
          + '<td>'+(it.cause?esc(it.cause):'<span class="muted">'+esc(T("cause_tbd"))+'</span>')+'</td>'
          + '<td>'+todo+'</td>' + tail;
      });
      wl += '</table>';
    }
    secs.push({nb:true, html: wl+'</div>'});

    /* ---------- host sections (trends, Pareto) sit between work and detail ---- */
    (ctx.extra||[]).forEach(function(x){ secs.push(x); });

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
            + '<span class="n">02</span><span class="h2">'+esc(T("detail"))+'</span></div>' : "")
        + '<div class="machhd"><span class="u">'+esc(rec.equip)+'</span>'
          + '<span class="c">'+esc(rec.clsLabel||"")+'</span>'
          + '<span class="c" style="margin-left:auto;">'+esc(rec.typeLabel||rec.type)+'</span></div>'
        + '<div class="meta">'
          + '<span class="m"><i>'+esc(T("c_date"))+'</i><span class="num">'+esc(rec.date||"")+'</span></span>'
          + (rec.smu?'<span class="m"><i>SMU</i><span class="num">'+esc(rec.smu)+'</span></span>':"")
          + (rec.by?'<span class="m"><i>'+esc(T("by_who"))+'</i>'+esc(rec.by)+'</span>':"")
          + '<span class="m"><i>'+esc(T("pts"))+'</i><span class="num">'+rec.items.length+'</span></span>'
          + (rec.gps?'<span class="m"><i>'+esc(T("gps"))+'</i><span class="num">'
              + rec.gps.lat.toFixed(4)+', '+rec.gps.lon.toFixed(4)+'</span></span>':"")
        + '</div>'
        + '<div class="verdict v-'+((vc==="ok"&&unread)?"watch":vc)+'">'
          + ((vc==="ok"&&unread)
              ? esc(T("verdict_part",{m:rec.items.length-unread,of:rec.items.length,n:unread}))
              : esc(T("verdict_"+vc,{n:vn,of:rec.items.length}))
                + (unread?" "+esc(T("unread_n",{n:unread,of:rec.items.length})):""))
          + '</div>';
      first = false;

      if(notable.length){
        m += '<div class="subhd" style="margin-top:15px;">'+esc(T("notable"))+'</div><table><tr>'
          + '<th style="width:168px">'+esc(T("c_item"))+'</th>'
          + '<th class="c" style="width:34px">'+esc(T("c_grade"))+'</th>'
          + '<th style="width:74px">'+esc(T("c_sev"))+'</th>'
          + '<th style="width:158px">'+esc(T("c_defect"))+'</th>'
          + '<th style="width:130px">'+esc(T("c_cause"))+'</th>'
          + '<th>'+esc(T("c_do"))+' / '+esc(T("c_read"))+'</th></tr>';
        notable.forEach(function(it,i){
          var read = (it.readings||[]).slice();
          if(it.w && it.w.mm!=null) read.unshift(it.w.mm+" mm"+(it.w.pct!=null?" · "+it.w.pct+"%":""));
          if(it.w && it.w.reason) read.unshift(it.w.reasonLabel||it.w.reason);
          if(it.comment) read.push(it.comment);
          m += '<tr class="'+(i%2?"zebra":"")+'">'
            + '<td class="stripe" style="border-left-color:'+(SEV_HEX[it.sev]||GRADE_HEX[it.grade]||"transparent")+'">'
              + nameCell(it)+'</td>'
            + '<td class="c">'+gradeChip(it.grade)+'</td>'
            + '<td>'+sevChip(ctx,it.sev)+'</td>'
            + '<td>'+(it.defect?esc(it.defect):"")+(it.iso?'<div class="code">ISO '+esc(it.iso)+'</div>':"")+'</td>'
            + '<td>'+(it.cause?esc(it.cause):"")+'</td>'
            + '<td>'+(it.action?'<b>'+esc(it.action)+'</b>'+(it.wo?' <span class="code">['+esc(it.wo)+']</span>':"")
                + (read.length?"<br>":""):"")+esc(read.join(" · "))+'</td></tr>';
        });
        m += '</table>';
      }
      // the verdict already said "all N normal" — no need to say it twice
      if(quiet>0 && notable.length)
        m += '<div class="muted" style="font-size:10.5px;margin-top:8px;">'+esc(T("normal_n",{n:quiet}))+'</div>';

      /* A thirty-six point measurement grid plus four photographs is taller than
         a page. Anything that could overflow becomes its own section, headed
         with the machine it continues; a short round stays in one piece. */
      var extra=[];
      var cont = '<div class="sec"><div class="mach" style="border-top-width:1px;">'
        + '<div class="machhd"><span class="u" style="font-size:14px;">'+esc(rec.equip)+'</span>'
        + '<span class="c">'+esc(T("cont"))+'</span></div>';

      if(isWear){
        if(over.length) m += '<div class="verdict v-'+(overAct.length?"act":"watch")+'" style="margin-top:12px;">'
          + (overAct.length?esc(T("uc_over",{n:overAct.length}))+". ":"")
          + (over.length>overAct.length?esc(T("uc_watch",{n:over.length-overAct.length}))+". ":"")
          + '<span style="font-weight:500;">'+over.slice(0,6).map(function(it){
              return esc(it.name||it.key)+' <span class="num">'+esc(it.w.pct)+'%</span>'; }).join(" · ")
          + (over.length>6?" · +"+(over.length-6):"")+'</span></div>';
        var rows=rec.items.filter(function(it){ return it.w && (it.w.mm!=null||it.w.reason); });
        if(rows.length){
          var col=function(list){
            var x='<table><tr><th>'+esc(T("c_item"))+'</th>'
              + '<th class="r" style="width:52px">'+esc(T("c_meas"))+'</th>'
              + '<th class="r" style="width:44px">'+esc(T("c_worn"))+'</th>'
              + '<th style="width:60px"></th></tr>';
            list.forEach(function(it,i){ var w=it.w;
              x += '<tr class="'+(i%2?"zebra":"")+'"><td style="padding-left:0;">'+esc(it.name||it.key)
                + '<div class="code">'+esc(w.newMM!=null&&w.newMM!==""
                    ? w.newMM+" → "+w.condemnMM+" mm" : T("noref"))+'</div></td>'
                + '<td class="r n">'+(w.mm!=null?'<b>'+esc(w.mm)+'</b>'
                    :'<span class="muted" style="font-size:9px">'+esc(w.reasonLabel||w.reason||"—")+'</span>')+'</td>'
                + '<td class="r n">'+(w.pct!=null?esc(w.pct)+"%":"")+'</td>'
                + '<td>'+(w.pct!=null?wearBar(w.pct):"")+'</td></tr>'; });
            return x+'</table>'; };
          /* Two columns of twenty-two clears a page. Split into equal parts
             rather than fixed ones, so forty-four readings are 22+22 and not a
             full page followed by a stub. */
          var MAX=44, parts=Math.ceil(rows.length/MAX), PER=Math.ceil(rows.length/parts);
          for(var o=0;o<rows.length;o+=PER){
            var chunk=rows.slice(o,o+PER), hf=Math.ceil(chunk.length/2);
            extra.push(cont+'<div class="subhd" style="margin-top:11px;">'+esc(T("meas_t"))
              + (parts>1?' <span class="muted">'+(o+1)+"–"+Math.min(o+PER,rows.length)+" / "+rows.length+'</span>':"")
              + '</div><div class="meas"><div>'+col(chunk.slice(0,hf))+'</div><div>'
              + col(chunk.slice(hf))+'</div></div></div></div>');
          }
        }
      }

      var shots=[];
      rec.items.forEach(function(it){ (it.photos||[]).forEach(function(u){ shots.push({it:it,u:u}); }); });
      if(shots.length){
        var ph=cont+'<div class="subhd" style="margin-top:11px;">'+esc(T("photos"))+'</div><div class="shots">';
        shots.forEach(function(s){ ph+='<figure><img src="'+s.u+'"><figcaption>'
          + esc(s.it.name||s.it.key)+'</figcaption></figure>'; });
        extra.push(ph+'</div></div></div>');
      }

      var sign = '<div class="hair" style="margin:15px 0 11px;"></div><div class="sign">'
        + '<div><div class="rl">'+esc(T("by_who"))+'</div><div class="ln"></div>'
          + '<div class="nm">'+esc(rec.by||"—")+'</div></div>'
        + '<div><div class="rl">'+esc(T("sup"))+'</div>'
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
      return '<div class="lgrow">'+gradeChip(g)+'<div class="t">'+esc(T("g_"+g))+'</div></div>'; }).join("");
    var sl=["NOF","INC","DEG","CRI"].map(function(s){
      return '<div class="lgrow">'+sevChip(ctx,s)+'<div class="t">'+esc(T("s_"+s))+'</div></div>'; }).join("");
    secs.push({nb:true, html:'<div class="sec">'
      + '<div class="sechd"><span class="n">03</span><span class="h2">'+esc(T("legend"))+'</span></div>'
      + '<div class="legend"><div>'
        + '<div class="eyebrow" style="margin-bottom:9px;">'+esc(T("lg_grade"))+'</div>'+gl
        + '<div class="eyebrow" style="margin:16px 0 9px;">'+esc(T("lg_sev"))+'</div>'+sl
      + '</div><div>'
        + '<div class="eyebrow" style="margin-bottom:9px;">'+esc(T("lg_wear"))+'</div>'
        + '<div class="body">'+esc(T("lg_wear_d"))+'</div>'
        + [[45,"band_ok"],[88,"band_watch"],[112,"band_act"]].map(function(x){
            return '<div style="display:flex;gap:9px;align-items:center;margin-top:'
              +(x[0]===45?10:5)+'px;">'+wearBar(x[0])+'<span class="body">'+x[0]+'% — '
              +esc(T(x[1]))+'</span></div>'; }).join("")
        + '<div class="eyebrow" style="margin:16px 0 9px;">'+esc(T("lg_iso"))+'</div>'
        + '<div class="body">'+esc(T("lg_iso_d"))+'</div>'
      + '</div></div>'
      + '<div class="hair" style="margin:20px 0 8px;"></div>'
      + '<div class="muted" style="font-size:9.5px;">'+esc(T("footer"))+' · '+esc(today)+'</div>'
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
          doc.addImage(c2.toDataURL("image/jpeg",0.92),"JPEG",M,y,cw,sliceH*k);
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
