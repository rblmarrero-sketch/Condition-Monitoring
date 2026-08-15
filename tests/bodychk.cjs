const REPO = require('path').join(__dirname, '..');
/* Every station has to land inside the region that claims it, and inside no
   other. A map where a front-wall reading sits in the floor lies about where the
   metal is thin, which is the one thing it exists to say.

   And no station code may appear twice. That is not a cosmetic rule: the code is
   the key, so a duplicate means two readings write to one slot and one is lost
   with nothing on screen to say so. Both source forms shipped with duplicates. */
const { chromium } = require(require('./pw.cjs'));
const fails=[];const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const note=(n,d)=>console.log('   ·      '+n+'   '+d);
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage();
 await p.setContent('<div id="w"></div>');
 await p.addScriptTag({path:REPO + '/mobile/body-points.js'});
 await p.addScriptTag({path:REPO + '/mobile/body-map.js'});
 const models=await p.evaluate(()=>BODY.models);
 ok('both trays are in', models.length===2 && models.includes('HM400') && models.includes('TR60'), models.join(' '));
 for(const id of models){
   const r=await p.evaluate(m=>{
     const inside=(pt,pg)=>{ let c=false;
       for(let i=0,j=pg.length-1;i<pg.length;j=i++){ const [xi,yi]=pg[i],[xj,yj]=pg[j];
         if(((yi>pt[1])!==(yj>pt[1])) && (pt[0] < (xj-xi)*(pt[1]-yi)/(yj-yi)+xi)) c=!c; }
       return c; };
     const P=BODY.points(m), Z=BODY.zones(m).map(z=>z.k);
     const codes=P.map(x=>x.k);
     const dup=codes.filter((x,i)=>codes.indexOf(x)!==i);
     const out=[],wrong=[];
     P.forEach(q=>{ const pg=BODY.region(m,q.z);
       if(!pg){ out.push(q.k+' has no region'); return; }
       if(!inside([q.x,q.y],pg)) out.push(q.k+' outside '+q.z);
       Z.forEach(z=>{ if(z===q.z) return; const o=BODY.region(m,z);
         if(o&&inside([q.x,q.y],o)) wrong.push(q.k+' also in '+z); });
     });
     const route=BODY.route(m);
     const svg=bodyMap({model:m,lang:'en',sel:route[0]});
     return {n:P.length,dup,out,wrong,route:route.length,
             routeSet:new Set(route).size,
             dots:(svg.match(/data-pt=/g)||[]).length,
             /* Seven bands are DRAWN; five surfaces are TAPPABLE. The floor's
                three bands are ~27 px wide on a phone, so one hit area covers
                the whole floor and the chip row picks the band at 44 px. Both
                counts are checked — a drawing that loses a band and a map that
                loses a control are different bugs. */
             bands:(svg.match(/data-band=/g)||[]).length,
             zones:(svg.match(/data-zone=/g)||[]).length,
             tag:(svg.match(/class="bm-tag"/g)||[]).length,
             model:BODY.of(m).model};
   }, id);
   console.log('\n'+r.model+' — '+r.n+' stations');
   ok(id+': no station code appears twice', !r.dup.length, r.dup.length?[...new Set(r.dup)].join(' '):r.n+' unique');
   ok(id+': every station lands in the zone that claims it', !r.out.length,
      r.out.length?r.out.slice(0,5).join(' | '):'all contained');
   ok(id+': and in no other', !r.wrong.length, r.wrong.length?r.wrong.slice(0,5).join(' | '):'no overlap');
   ok(id+': the walking route visits each one exactly once',
      r.route===r.n && r.routeSet===r.n, r.route+' steps, '+r.routeSet+' distinct');
   ok(id+': the map draws them all', r.dots===r.n && r.bands===7,
      r.dots+' dots, '+r.bands+' bands');
   ok(id+': and every surface is a control a thumb can hit', r.zones===5,
      r.zones+' tappable surfaces');
   ok(id+': and names the one you are on', r.tag===1, r.tag+' label');
 }
 const fix=await p.evaluate(()=>BODY.corrections);
 note('codes corrected from the source forms', fix.length);
 fix.forEach(f=>console.log('          '+f.model.padEnd(6)+f.was.padEnd(26)+'→ '+f.now));
 ok('every correction carries its reason', fix.every(f=>f.why&&f.why.length>20));
 await b.close();
 console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
 process.exit(fails.length?1:0);
})();
