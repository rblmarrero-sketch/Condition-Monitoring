/* Where the paper ends.

   The PDF is not laid out by the browser: a section is rasterised whole by
   html2canvas and the bitmap is cut at whatever pixel row the page runs out on.
   Every `page-break-inside` rule in the report stylesheet is therefore inert,
   and a reader of CM_DZ004_UC_20260809.pdf found out the hard way — "Sprocket
   — Right / Звёздочка — Справа" printed its name at the foot of page 2 and its
   number at the head of page 3.

   So this suite drives the real CMR.paginate with a stub renderer that records
   exactly where every cut landed, measures the real rows in the real DOM, and
   asserts no cut fell through one. It also asserts the shape the sheet is now
   meant to have: the drawing owns page one at full width, the readings begin
   overleaf. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const SEED = `(async()=>{
  const mk=(id,type,equip,date,positions,smu)=>({id,type,equip,date,
    by:'S. Volkov', sup:'A. Sokolov', smu,
    cls:(ASSET_BY[equip]||{}).cls||'', gps:{lat:68.04,lon:167.33,acc:6},
    dev:'PH-01', sign:null, positions, created:date+'T06:00:00.000Z', up:0, upTo:{}, rev:1});
  type='UC'; selectEquip('DZ004');
  const o={}, ks=items().map(x=>x.k);
  ks.forEach((k,i)=>{ const [pt,pos]=ucSplit(k);
    const ref=WEAR.refFor('DZ004',(ASSET_BY['DZ004']||{}).m,pt,pos,'2026-08-09');
    if(!ref||ref.x){ o[k]={mm:null,reason:'',stood:0,photos:[],video:null}; return; }
    const f=Math.min(1.2,0.55+((i%7)-3)*0.05);
    o[k]={mm:Math.round((ref.n+(ref.c-ref.n)*f)*10)/10,stood:0,reason:'',photos:[],video:null};
  });
  await dbPut(mk('rp','UC','DZ004','2026-08-09',o,'7410'));
  /* Four more rounds, so the fleet document exists too: its work list, its
     history table puts every measured point of every earlier round on one row,
     which is the longest table this report produces and the one most certain to
     run past the foot of a page. */
  for(const [id,u,date,frac] of [['h1','DZ004','2026-05-04',0.30],['h2','DZ004','2026-06-08',0.41],
                                 ['h3','DZ004','2026-07-07',0.48]]){
    type='UC'; selectEquip(u);
    const q={}; items().map(x=>x.k).forEach((k,i)=>{ const [pt,pos]=ucSplit(k);
      const rf=WEAR.refFor(u,(ASSET_BY[u]||{}).m,pt,pos,date);
      if(!rf||rf.x){ q[k]={mm:null,reason:'',stood:0,photos:[],video:null}; return; }
      const f=Math.min(1.25, frac+((i%7)-3)*0.04);
      q[k]={mm:Math.round((rf.n+(rf.c-rf.n)*f)*10)/10,stood:0,reason:'',photos:[],video:null}; });
    await dbPut(mk(id,'UC',u,date,q,'7410'));
  }
  return Object.values(o).filter(x=>x.mm!=null).length;
})()`;

/* CMR.paginate wants an html2canvas and a jsPDF. It gets a pair that answer
   truthfully about size and record everything they are asked to draw. */
const HARNESS = `(async (sections) => {
  const cap=[];
  const h2c = async (el, o) => {
    const er = el.getBoundingClientRect();
    const rows = [...el.querySelectorAll('tr,.lgrow,.pkey > div,.ckey > div')]
      .map(t => { const r = t.getBoundingClientRect();
        return { t:r.top-er.top, b:r.bottom-er.top,
                 x:(t.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40) }; })
      .filter(b => b.b - b.t > 1);
    cap.push({ w:er.width, h:er.height, rows, slices:[],
               maps: !!el.querySelector('.ucmaps'),
               mapw: el.querySelector('.ucmaps') ? el.querySelector('.ucmaps').getBoundingClientRect().width : 0,
               meas: !!el.querySelector('.meas') });
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(er.width * (o.scale||2)));
    cv.height = Math.max(1, Math.round(er.height * (o.scale||2)));
    const cx = cv.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,cv.width,cv.height);
    return cv;
  };
  let page = 1;
  const jsPDF = function(){
    this.addPage = () => { page++; };
    this.addImage = (d,f,x,y,w,h) => {
      cap[cap.length-1].slices.push({ page, y, h });
    };
    this.getNumberOfPages = () => page;
    this.setPage = () => {}; this.setDrawColor = () => {}; this.setLineWidth = () => {};
    this.line = () => {}; this.setFontSize = () => {}; this.setTextColor = () => {};
    this.text = () => {};
  };
  await CMR.paginate({ sections, jsPDF, html2canvas: h2c, scale: 2, docId: 'T' });
  return { cap, pages: page };
})`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  const measured = await p.evaluate(SEED);

  const secs  = await p.evaluate(async () => (await buildReportSections('rp')).map(s => ({ nb: s.nb, html: s.html })));
  const fleet = await p.evaluate(async () => (await buildReportSections()).map(s => ({ nb: s.nb, html: s.html })));   // all four rounds, with history
  const out   = await p.evaluate(async ([h, s]) => (0, eval)(h)(s), [HARNESS, secs]);
  const outF  = await p.evaluate(async ([h, s]) => (0, eval)(h)(s), [HARNESS, fleet]);

  console.log('\n  the sheet is shaped the way it is read');
  ok('the round produced readings to print', measured > 20, measured + ' measured');
  const iMap = out.cap.findIndex(c => c.maps);
  const iMeas = out.cap.findIndex(c => c.meas);
  ok('the drawing and the readings are separate sections',
    iMap >= 0 && iMeas >= 0 && iMap < iMeas, 'map ' + iMap + ', meas ' + iMeas);
  ok('the readings are told to start a new page', secs[iMeas] && secs[iMeas].nb === true,
    'nb=' + (secs[iMeas] || {}).nb);
  ok('and they do — nothing of the drawing page carries over',
    out.cap[iMap].slices.length && out.cap[iMeas].slices.length &&
    out.cap[iMeas].slices[0].page > out.cap[iMap].slices[out.cap[iMap].slices.length - 1].page,
    'drawing ends p' + out.cap[iMap].slices.slice(-1)[0].page
      + ', readings begin p' + out.cap[iMeas].slices[0].page);

  console.log('\n  the drawing gets the page, not a column of it');
  ok('the frames run the full width of the paper',
    out.cap[iMap].mapw > out.cap[iMap].w * 0.95,
    Math.round(out.cap[iMap].mapw) + ' of ' + Math.round(out.cap[iMap].w) + 'px');
  ok('and the drawing page is one page, key and all',
    out.cap[iMap].slices.length === 1, out.cap[iMap].slices.length + ' slices');

  console.log('\n  no cut falls through a row');
  /* Each element is drawn as one or more slices. Walk the cuts back into the
     element's own coordinate space and check none of them lands inside a row.
     A row taller than a page has nowhere to go and is not counted against the
     paginator — nothing here is. */
  let cuts = 0, bad = [];
  [['sheet', out], ['history', outF]].forEach(([who, o]) => o.cap.forEach((c, i) => {
    if (c.slices.length < 2) return;
    const kpt = c.slices[0].h && c.h ? null : null;   // derived below per slice
    let acc = 0;
    for (let j = 0; j < c.slices.length - 1; j++) {
      /* the image is placed at the same scale the whole element was placed at:
         pt height / element css height === pt width / element css width */
      const scale = (595 - 76) / c.w;                 // cw / element width
      acc += c.slices[j].h / scale;                   // back to css px
      cuts++;
      const hit = c.rows.find(r => acc > r.t + 0.5 && acc < r.b - 0.5 && (r.b - r.t) < 520);
      if (process.env.CUTDBG) {
        const near = c.rows.filter(r => Math.abs(r.t - acc) < 60 || Math.abs(r.b - acc) < 60)
          .map(r => Math.round(r.t) + '-' + Math.round(r.b) + ' ' + r.x).slice(0, 4);
        console.log('    [dbg] ' + who + ' sec ' + i + ' h=' + Math.round(c.h)
          + ' cut@' + Math.round(acc) + ' rows=' + c.rows.length + ' | ' + near.join(' ; '));
      }
      if (hit) bad.push(who + ' sec ' + i + ' cut at ' + Math.round(acc) + 'px through "' + hit.x + '"');
    }
  }));
  ok('the two documents give the cut plenty of chances', cuts >= 3, cuts + ' cuts');
  ok('and every one of them fell between rows, not through one',
    bad.length === 0, bad.slice(0, 4).join(' | ') || 'clean');

  console.log('\n  and the readings are all still there');
  const doc = secs.map(s => s.html).join('\n');
  const shown = await p.evaluate(async () => {
    const rec = (await dbAll()).find(r => r.type === 'UC');
    const html = (await buildReportSections()).map(s => s.html).join('\n');
    const grids = html.split('<div class="meas">').slice(1).join(' ');
    let hit = 0, want = 0;
    for (const pp of Object.values(rec.positions)) {
      if (pp.mm == null) continue; want++;
      if (grids.indexOf('>' + pp.mm + '<') >= 0) hit++;
    }
    return { hit, want };
  });
  ok('every reading is in the grid exactly as captured', shown.hit === shown.want,
    shown.hit + ' of ' + shown.want);
  ok('nothing rendered as undefined', !/undefined|NaN/.test(doc.replace(/<[^>]*>/g, ' ')));

  await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED' : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
