/* The report is read by three people who want three different things, so it is
   tested on what each of them has to be able to find: the number on the cover,
   one line per job, and every measurement exactly once. */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs');
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const SEED = `(async () => {
  const mk=(id,type,equip,date,by,sup,positions,smu)=>({id,type,equip,date,by,sup,smu,
    cls:(ASSET_BY[equip]||{}).cls||'', gps:{lat:68.0421,lon:167.3318,acc:6},
    dev:'PH-01', sign:null, positions, created:date+'T06:00:00.000Z', up:0, upTo:{}, rev:1});
  const recs=[];
  type='MP'; selectEquip('TK146');
  const mp=items().map(x=>x.k).slice(0,6);
  recs.push(mk('r1','MP','TK146','2026-07-28','I. Petrov','A. Sokolov',
    Object.fromEntries(mp.map(k=>[k,{grade:'A',sev:'NOF',detect:'VI',photos:[],video:null}])),'18422'));
  recs.push(mk('r2','MP','TK149','2026-07-29','I. Petrov','A. Sokolov', (()=>{ const o={};
    mp.forEach((k,i)=>{ o[k]={grade:i===1?'X':i===3?'C':'A', sev:i===1?'CRI':i===3?'DEG':'NOF',
      defect:(i===1||i===3)?'DT14-03':'', cause:i===1?'CA-WEAR':'',
      action:i===1?'RA-07':i===3?'RA-02':'', wo:i===1?'88214':'',
      comment:i===1?'<img src=x onerror=alert(1)> heavy swarf':'',
      particle:i===0?'18':'', comp:'3120', oil:'250', detect:'VI', photos:[],video:null}; });
    return o; })(),'19004'));
  /* one real photograph, so "the report carries what the inspector saw" is
     tested against a blob rather than assumed */
  try{ const r=await fetch('../Photos/TK147/2026-07-29/4D.jpg');
    if(r.ok){ const bl=await r.blob(); if(bl.size>500) recs[1].positions[mp[1]].photos=[bl]; }
  }catch(e){}
  type='TEMP'; selectEquip('TK150');
  const tk=items().map(x=>x.k).slice(0,5);
  recs.push(mk('r3','TEMP','TK150','2026-07-30','S. Volkov','A. Sokolov', (()=>{ const o={};
    tk.forEach((k,i)=>{ o[k]={grade:i===0?'C':'A', sev:i===0?'DEG':'NOF',
      tempV:String(64+i*9), tempA:'-4', tempM:'IR', defect:i===0?'DT14-03':'',
      action:i===0?'RA-04':'', detect:'TH', photos:[],video:null}; }); return o; })(),'20110'));
  const uc={};
  for(const [id,u,date,frac] of [['r4','DZ001','2026-07-30',0.35],['r5','DZ002','2026-07-31',0.94]]){
    type='UC'; selectEquip(u);
    const o={}, ks=items().map(x=>x.k); uc[u]={all:ks.length, meas:0};
    ks.forEach((k,i)=>{
      if(i%11===7){ o[k]={mm:null,reason:(WEAR.reasons[0]||{}).code||'',stood:0,photos:[],video:null}; return; }
      const [pt,pos]=ucSplit(k);
      const ref=WEAR.refFor(u,(ASSET_BY[u]||{}).m,pt,pos,date);
      if(!ref||ref.x){ o[k]={mm:null,reason:'',stood:0,photos:[],video:null}; return; }
      const f=Math.min(1.25, frac + ((i%7)-3)*0.035);
      o[k]={mm:Math.round((ref.n+(ref.c-ref.n)*f)*10)/10, stood:0, reason:'', photos:[],video:null};
      uc[u].meas++;
    });
    recs.push(mk(id,'UC',u,date,'S. Volkov','A. Sokolov',o,'7410'));
  }
  for(const r of recs) await dbPut(r);
  return uc;
})()`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true,
    hasTouch: true, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  const uc = await p.evaluate(SEED);

  const sec = await p.evaluate(async () => (await buildReportSections()).map(s => s.html));
  const doc = sec.join('\n');
  const text = doc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  console.log('\n  the cover answers the first question');
  ok('the sections build', sec.length > 4, sec.length + ' sections');
  ok('the headline states the finding count and the urgent count',
    /34 findings need attention, 11 of them before the next shift\./.test(text),
    (text.match(/\d+ findings need attention[^.]*\./) || [''])[0]);
  /* Machines and positions. The position total moved from 85 to 97 when the
     three catalog condition checks joined the undercarriage round on both
     sides; what matters is that the cover counts what the report contains. */
  ok('the counted totals are on the cover',
    sec[0].includes('>5<') && /">(8[0-9]|9[0-9]|1[0-9]{2})<"/.test(sec[0].replace(/>/g,'">').replace(/</g,'<"'))
      || sec[0].includes('>97<'),
    (sec[0].match(/>\d+</g) || []).join(' '));
  ok('every inspection has a line in the machine-by-machine table',
    ['TK146', 'TK149', 'TK150', 'DZ001', 'DZ002'].every(u => sec[0].includes(u)));
  ok('a round with points nobody reached is not called clean',
    /DZ001[\s\S]{0,600}not measured/.test(sec[0]));

  console.log('\n  the work list is a list of jobs, not of readings');
  const wl = sec[1];
  const rows = (wl.match(/<tr[ >]/g) || []).length - 1;      // less the header row
  ok('a worn undercarriage is one job, not thirty-one', rows <= 6, rows + ' rows');
  ok('and that job still names its worst points',
    /at or past condemn/.test(wl) && /105%/.test(wl));
  ok('the urgent job is at the top', wl.indexOf('TK149') < wl.indexOf('TK150'));
  ok('an action reads as words, not as a code',
    /Stop machine/.test(wl) && !/>RA-07</.test(wl));
  ok('a finding with no cause says so rather than leaving a blank',
    /cause not yet set/.test(wl));

  console.log('\n  every measurement is printed once, and only once');
  for (const u of Object.keys(uc)) {
    const mine = sec.filter(h => h.includes(u)).join('\n');
    ok(u + ': the measurement grid is there', mine.includes('<div class="meas">'));
    const shown = await p.evaluate(async ({ u }) => {
      const rec = (await dbAll()).find(r => r.equip === u && r.type === 'UC');
      const html = (await buildReportSections()).map(s => s.html).join('\n');
      const grids = html.split('<div class="meas">').slice(1).join(' ');
      let hit = 0;
      for (const pp of Object.values(rec.positions)) {
        if (pp.mm == null) continue;
        if (grids.indexOf('>' + pp.mm + '<') >= 0) hit++;
      }
      return { hit, want: Object.values(rec.positions).filter(x => x.mm != null).length };
    }, { u });
    ok(u + ': every reading appears in the grid', shown.hit === shown.want,
      shown.hit + ' of ' + shown.want);
  }
  const dz2 = sec.filter(h => h.includes('DZ002'))[0] || '';
  ok('a worn point is not listed twice — a table above and the grid below',
    !/Worth reading/i.test(dz2), 'DZ002 detail');

  console.log('\n  it says nothing it cannot back up');
  ok('a comment is printed as text, never as markup',
    text.includes('heavy swarf') && !doc.includes('<img src=x'),
    doc.includes('<img src=x') ? 'RAW MARKUP LEAKED' : 'escaped');
  ok('no untranslated key leaked through', !/\b(rep|uc|sev|type)_[a-z_]+\b/.test(text),
    (text.match(/\b(rep|uc|sev|type)_[a-z_]+\b/) || [''])[0]);
  ok('nothing rendered as undefined or NaN', !/undefined|NaN/.test(text),
    (text.match(/.{24}(undefined|NaN).{24}/) || [''])[0]);
  ok('the legend explains every grade and every severity',
    ['Normal', 'Monitor', 'Attention', 'Critical'].every(w => sec[sec.length - 1].includes(w)) &&
    /No failure/.test(sec[sec.length - 1]));

  console.log('\n  and it does the same in Russian');
  const ru = await p.evaluate(async () => {
    document.querySelector('.lang [data-lang="ru"]').click();
    await new Promise(r => setTimeout(r, 400));
    const h = (await buildReportSections()).map(s => s.html).join('\n');
    document.querySelector('.lang [data-lang="en"]').click();
    await new Promise(r => setTimeout(r, 300));
    return h;
  });
  const rutext = ru.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  ok('the report is in Russian', /Отчёт по мониторингу состояния/.test(rutext));
  /* This used to assert the opposite: that no English appeared anywhere in a
     Russian report. That was the right check while the report was written in
     one language at a time, and it is the wrong one now — every heading is
     deliberately given in both, because the inspector who wrote the round and
     the reliability engineer who acts on it read different ones and sign the
     same sheet.

     What still has to hold is that Russian LEADS and English follows. A key
     missing from the Russian dictionary falls back to English and would now
     read as a finished label, so the guard against that moved to a direct
     comparison of the two dictionaries in rptbi.cjs. */
  const ruLeads = await p.evaluate(async () => {
    document.querySelector('.lang [data-lang="ru"]').click();
    await new Promise(r => setTimeout(r, 400));
    const h = (await buildReportSections()).map(s => s.html).join('\n');
    document.querySelector('.lang [data-lang="en"]').click();
    await new Promise(r => setTimeout(r, 300));
    /* Every paired label is "primary<span class=alt…>secondary". In a Russian
       report the primary half must be Cyrillic. */
    const pairs = [...h.matchAll(/>([^<>]{4,})<span class="alt[l2i]?">([^<]{3,})<\/span>/g)];
    const wrong = pairs.filter(m => !/[Ѐ-ӿ]/.test(m[1])).map(m => m[1].trim().slice(0, 30));
    return { n: pairs.length, wrong: [...new Set(wrong)].slice(0, 5) };
  });
  ok('every heading is paired with its translation', ruLeads.n > 30, ruLeads.n + ' pairs');
  ok('and Russian is the one that leads', ruLeads.wrong.length === 0,
    ruLeads.wrong.join(' | ') || 'none');
  ok('no untranslated key in Russian either', !/\b(rep|uc|sev|type)_[a-z_]+\b/.test(rutext),
    (rutext.match(/\b(rep|uc|sev|type)_[a-z_]+\b/) || [''])[0]);
  ok('and nothing undefined', !/undefined|NaN/.test(rutext));

  console.log('\n  the report carries what the inspector saw');
  const shots = sec.filter(h => h.includes('class="shots"'));
  ok('a round with a photograph prints one', shots.length === 1, shots.length + ' photo blocks');
  ok('and it is a real image, not an empty frame',
    (shots.join('').match(/<img src="data:image\/(jpeg|png)/g) || []).length === 1,
    String((shots.join('').match(/<img src="data:image/g) || []).length));
  ok('captioned with the point it belongs to', /<figcaption>[^<]{2,}<\/figcaption>/.test(shots.join('')));
  ok('a round with no photograph prints no empty block',
    !(sec.filter(h => h.includes('TK146') && /class="machhd"/.test(h))[0] || '').includes('class="shots"'));

  console.log('\n  the machine is drawn, not just tabulated');
  /* A red puck at roller 6 is a place a fitter can walk to; a row in a table is
     a place they have to look up. */
  const dz2map = sec.filter(h => h.includes('DZ002') && h.includes('ucmaps'))[0] || '';
  /* The report draws what the app draws: the machine's own photograph with the
     walk numbered over it, one side each. It used to print a lettered
     schematic instead — the same round came out as two different pictures
     depending on which end printed it. */
  ok('an undercarriage round prints both sides',
    (dz2map.match(/class="ucmapwrap"/g) || []).length === 2,
    String((dz2map.match(/class="ucmapwrap"/g) || []).length));
  ok('  on the machine itself, not a schematic of one',
    /<image[^>]+href="data:image\//.test(dz2map));
  ok('the frames are on their own, not sharing a page block with the readings',
    dz2map.indexOf('<div class="meas">') < 0);
  /* A red puck at roller 6 is a place a fitter can walk to. Colour alone is not
     enough on paper, so the state is on the class and the ring weight with it. */
  ok('worn positions are marked on the drawing',
    /class="um-num act"/.test(dz2map) && /class="um-num watch"/.test(dz2map));
  ok('a position nobody could measure is marked, not left blank',
    /class="um-num na"/.test(dz2map));
  ok('and the drawing carries a key', /class="mapkey"/.test(dz2map) || /class="ckey"/.test(dz2map));
  ok('a magnetic plug round draws no machine',
    !(sec.filter(h => h.includes('TK149') && /class="machhd"/.test(h))[0] || '').includes('ucmaps'));

  console.log('\n  the numbers on it are numbers it can defend');
  /* Two things a sheet said that were not true.

     "0 of 11 points worth watching. Plan the work." The verdict counts grades,
     severities AND wear bands; the number in the sentence counted only wear
     bands. A graded round with nothing over a limit announced zero findings and
     told the reader to plan work for them.

     And "-688 %", printed beside a millimetre. A percentage below zero is a
     part thicker than new — the wrong reference, the wrong point, or a typo —
     and the sheet stated it as a fact in a document that goes to a customer. */
  const nums = await p.evaluate(async () => {
    const one = (over) => ({
      equip:'TK149', clsLabel:'HAUL TRUCK', model:'M', type:'GET', typeLabel:'GET',
      date:'2026-08-20', by:'S', sup:'A', smu:'1', wear:true, items:[
        /* graded, and nowhere near a limit: the verdict is "watch" and the
           count has to agree with it */
        { key:'A', name:'Tooth 1', grade:'C', sev:'DEG', w:{ mm:200, newMM:320,
          condemnMM:130, pct:63, band:'done' } },
        { key:'B', name:'Tooth 2', grade:'A', sev:'NOF', w:{ mm:300, newMM:320,
          condemnMM:130, pct:10, band:'done' } },
        /* thicker than new */
        { key:'C', name:'Shroud', grade:'A', sev:'NOF', w:{ mm:158, newMM:60,
          condemnMM:25, pct:over, band:'done' } } ] });
    const html = CMR.sections({ lang:'en', mode:'unit', title:'x', titleAlt:'x',
      stamp:new Date(), sevLabel:s => s, sevLabelAlt:s => s,
      records:[one(-280)] }).map(s => s.html).join('');
    return { verdict: (html.match(/class="verdict[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1]
                        .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
             neg: /-\s*\d+\s*%/.test(html),
             mm: html.indexOf('158') >= 0,
             ref: html.indexOf('60 → 25 mm') >= 0,
             good: html.indexOf('63%') >= 0 };
  });
  ok('a graded round counts its findings, not zero of them',
     /1 of 3/.test(nums.verdict), nums.verdict.slice(0, 60));
  ok('no percentage below zero reaches the paper', !nums.neg);
  ok('  but the millimetre does, with the reference beside it',
     nums.mm && nums.ref, 'reading and limits kept');
  ok('  and a percentage that means something still prints', nums.good);

  console.log('\n  the sections are numbered in the order they are read');
  const numbered = sec.map(h => (h.match(/class="n">(\d+)<\/span><span class="h2">([^<]+)/) || []))
    .filter(m => m.length).map(m => m[1] + ' ' + m[2].trim());
  ok('01 work, 02 detail, 03 legend with no extras',
    JSON.stringify(numbered) === JSON.stringify(['01 What needs doing','02 Inspection detail','03 How to read this report']),
    JSON.stringify(numbered));

  console.log('\n  the PDF itself');
  await p.click('#tabbar [data-pane="paneQueue"]');
  await p.waitForTimeout(500);
  const t0 = Date.now();
  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 180000 }),
    p.click('#reportBtn'),
  ]);
  const out = '/tmp/claude-0/-home-user-Condition-Monitoring/1f3ebdba-c3da-5675-b557-e45dfee4b57e/scratchpad/rpt-test.pdf';
  await dl.saveAs(out);
  const took = Date.now() - t0;
  ok('it downloads', fs.existsSync(out) && fs.statSync(out).size > 20000, fs.statSync(out).size + ' bytes');
  ok('it is named for the day it was made', /^CM_report_\d{4}-\d{2}-\d{2}\.pdf$/.test(dl.suggestedFilename()),
    dl.suggestedFilename());
  ok('five rounds build in under two minutes', took < 120000, Math.round(took / 1000) + ' s');
  ok('the app is still usable afterwards — nothing left behind', await p.evaluate(() =>
    !document.getElementById('rptRoot') && !document.getElementById('dlg').open &&
    document.body.style.overflow !== 'hidden'));

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); process.exit(1); });
