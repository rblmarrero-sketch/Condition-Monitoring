const REPO = require('path').join(__dirname, '..');
/* "Not overlapping text" is a thing a browser can be asked, so ask it rather
   than looking at twenty-two drawings and hoping. Every label in every drawing,
   in both languages, laid out for real and measured: nothing may sit on top of
   anything else, and nothing may hang off the edge of the frame.

   Both languages matter and this is why: the Russian strings are longer, so a
   layout that fits in English is exactly the layout that fails in Russian, and
   it fails on the phones of the people who need it most.

   Both sets, GET and undercarriage, because they are one system and a rule that
   only holds on half of it is not a rule. */
const { chromium } = require(require('./pw.cjs'));
const fails=[];const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const note=(n,d)=>console.log('   ·      '+n+'   '+d);
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:412,height:915}});
 await p.setContent(`<style>
   :root{--ink:#11171a;--ink-2:#41505a;--muted:#616f76;--surface:#fff;--surface-2:#f3f6f7;
     --surface-3:#e4e9ec;--accent:#1f6fc4;--accent-soft:#e8f1fb;--critical:#c02f2f;--good:#0c8a3e;}
   body{margin:0;background:#fff;font-family:ui-sans-serif,system-ui,sans-serif}
   /* the width the drawing gets inside the app's panel */
   #box{width:360px} #box svg{width:100%;height:auto;display:block}
 </style><div id="box"></div>`);
 await p.addScriptTag({path:REPO + '/mobile/get-figs.js'});
 await p.addScriptTag({path:REPO + '/mobile/wear-figs.js'});
 /* One list, both sets, so every check below runs over all thirty-one. */
 await p.evaluate(()=>{ window.SETS = []
   .concat(GET_FIG.codes().map(c=>({set:'GET', code:c})))
   .concat(WEAR_FIG.codes().map(c=>({set:'UC', code:c})));
   window.figFor=(e,lang)=>{ if(e.set==='UC') return WEAR_FIG.for(e.code,lang);
     const [scope,c]=e.code.includes('.')?e.code.split('.'):['',e.code];
     return GET_FIG.for(c,scope,lang); }; });
 const codes=await p.evaluate(()=>SETS.map(e=>e.set+':'+e.code));
 ok('there is a drawing for every position in both rounds', codes.length===31,
    codes.length+' drawings — 22 GET, 9 undercarriage');

 let worstPairs=[], outside=[], tiny=[], overLine=[];
 for(const lang of ['en','ru']){
   for(const code of codes){
     const r=await p.evaluate(({code,lang})=>{
       const e=SETS.find(x=>x.set+':'+x.code===code);
       document.getElementById('box').innerHTML = figFor(e,lang);
       const svg=document.querySelector('#box svg');
       /* Screen-space rectangles, not getBBox. getBBox reports coordinates in
          the element's OWN user space, so a label inside a translated group and
          one outside it are measured in different frames and compared as if
          they were the same — which reported a header sitting on artwork sixty
          units below it. getBoundingClientRect resolves every transform first,
          which is the only way to ask "do these two overlap on the screen". */
       const R=e=>e.getBoundingClientRect();
       const frame=R(svg);
       const txt=[...svg.querySelectorAll('text')];
       const boxes=txt.map(t=>{ const r=R(t);
         return {s:t.textContent, x:r.left, y:r.top, w:r.width, h:r.height}; });
       const hits=[];
       for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++){
         const a=boxes[i], z=boxes[j];
         const ox=Math.min(a.x+a.w,z.x+z.w)-Math.max(a.x,z.x)-1.5;
         const oy=Math.min(a.y+a.h,z.y+z.h)-Math.max(a.y,z.y)-1.5;
         if(ox>0&&oy>0) hits.push(a.s+' / '+z.s+' by '+Math.round(Math.min(ox,oy))+'px');
       }
       /* Text over a drawn line reads as badly as text over text. Ticks,
          centrelines and the verdict glyphs are the ones that bit. */
       const onLine=[];
       [...svg.querySelectorAll('line,path')].forEach(ln=>{
         const c=ln.getAttribute('class')||'';
         if(!/\bln1\b|\bct\b|\bok\b|\bxx\b/.test(c)) return;
         const lb=R(ln);
         boxes.forEach(bx=>{
           const ox=Math.min(bx.x+bx.w,lb.right)-Math.max(bx.x,lb.left)-1.5;
           const oy=Math.min(bx.y+bx.h,lb.bottom)-Math.max(bx.y,lb.top)-1.5;
           if(ox>0&&oy>0) onLine.push(bx.s);
         });
       });
       const off=boxes.filter(bx=>bx.x<frame.left-1.5||bx.y<frame.top-1.5||
                                  bx.x+bx.w>frame.right+1.5||bx.y+bx.h>frame.bottom+1.5)
                      .map(bx=>bx.s);
       const px=Math.min(...txt.map(t=>parseFloat(getComputedStyle(t).fontSize)))
                * (frame.width/svg.viewBox.baseVal.width);
       return {n:boxes.length, hits, off, onLine:[...new Set(onLine)], px:Math.round(px*10)/10};
     },{code,lang});
     if(r.hits.length) worstPairs.push(lang+' '+code+': '+r.hits.join(' | '));
     if(r.off.length) outside.push(lang+' '+code+': '+r.off.join(', '));
     if(r.px<9) tiny.push(lang+' '+code+' '+r.px+'px');
     if(r.onLine.length) overLine.push(lang+' '+code+': '+r.onLine.join(', '));
   }
 }
 ok('no label sits on top of another, in either language', !worstPairs.length,
    worstPairs.length?worstPairs.slice(0,3).join('   ||   '):(codes.length*2)+' layouts checked');
 ok('and no label is struck through by a tick or a centreline', !overLine.length,
    overLine.length?overLine.slice(0,3).join('   ||   '):'nothing struck through');
 ok('and none of them hangs off the frame', !outside.length,
    outside.length?outside.slice(0,3).join('   ||   '):'nothing clipped');
 ok('every label is big enough to read on a phone', !tiny.length,
    tiny.length?tiny.slice(0,4).join(' '):'smallest is over 9px at panel width');

 /* An undefined var() is not a slightly wrong colour — the whole declaration is
    thrown away, silently. This is the check that would have caught the invisible
    green tick and the missing crack end-marks. */
 const unknown=await p.evaluate(()=>{
   const known=new Set(['--ink','--ink-2','--muted','--surface','--surface-2','--surface-3',
     '--accent','--accent-soft','--accent-ink','--critical','--good','--warning','--serious',
     '--line','--border','--page','--none']);
   const bad=new Set();
   SETS.forEach(e=>{ ['en','ru'].forEach(lg=>{
     [...figFor(e,lg).matchAll(/var\((--[a-z0-9-]+)\)/g)]
       .forEach(m=>{ if(!known.has(m[1])) bad.add(e.set+':'+e.code+' '+m[1]); }); }); });
   return [...bad];
 });
 const notRu=await p.evaluate(()=>SETS.filter(e=>{
   const t=[...new DOMParser().parseFromString(figFor(e,'ru'),'image/svg+xml')
     .querySelectorAll('text')].map(x=>x.textContent).join(' ');
   return !/[\u0400-\u04ff]/.test(t);
 }).map(e=>e.set+':'+e.code));
 ok('the Russian set is actually in Russian', !notRu.length,
    notRu.length?notRu.join(' '):'all 31 carry Cyrillic labels');

 ok('every colour it asks for is one the app defines', !unknown.length,
    unknown.length?unknown.join(' '):'all resolve');

 /* The grammar has to be the same everywhere or it teaches nothing. */
 const gram=await p.evaluate(()=>{
   const miss=[];
   SETS.forEach(e=>{
     const s=figFor(e,'en');
     const noGhost=/PIN|BOLT|CRACK|PITCH|SPROCKET/.test(e.code);   // a length has no profile
     if(!/class="gh"/.test(s) && !noGhost) miss.push(e.code+' has no new-profile ghost');
     if(!/class="dm"/.test(s)) miss.push(e.code+' has no dimension');
     if(!/class="tt"/.test(s)) miss.push(e.code+' does not say what tool');
   });
   return miss;
 });
 ok('every drawing says the same three things', !gram.length,
    gram.length?gram.slice(0,4).join(' | '):'ghost, dimension and tool on all of them');

 // and the ids cannot collide once two of them are on one page
 const dup=await p.evaluate(()=>{
   const a=GET_FIG.for('TOOTH','bucket','en'), z=WEAR_FIG.for('IDLER','en');
   const ids=s=>[...s.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
   const A=ids(a), Z=ids(z);
   return A.filter(x=>Z.includes(x));
 });
 ok('two drawings on one page cannot share an arrowhead id', !dup.length,
    dup.length?dup.join(' '):'no shared ids');

 await b.close();
 console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
 process.exit(fails.length?1:0);
})();
