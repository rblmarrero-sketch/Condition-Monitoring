/* A reading is only worth the method behind it. Every measurement point in both
   rounds has to say what to bring, where exactly to measure, and what else to
   look at — in both languages, and with no limit figures duplicated into it. */
const { chromium } = require(require('./pw.cjs'));
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').join(__dirname, '..');
const fails=[];const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{const u=new URL(req.url,'http://x');const p=path.join(ROOT,u.pathname);
 if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end('x');}
 res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});res.end(fs.readFileSync(p));
}).listen(8089,async()=>{
 const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const p=await ctx.newPage();
 p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
 await p.addInitScript(()=>localStorage.setItem('up_dests','[]'));
 await p.goto('http://127.0.0.1:8089/mobile/index.html',{waitUntil:'load'});
 await p.waitForTimeout(1200);

 console.log('every point has a method');
 const cover=await p.evaluate(()=>{
   const miss=[];
   // the undercarriage points, from the same table the round measures against
   (WEAR.points||[]).forEach(pt=>{ if(!GUIDE.has(pt.code,'')) miss.push('UC '+pt.code); });
   // both GET tools, every position
   ['bucket','blade'].forEach(tool=>{
     (GET.tools[tool].pts||[]).forEach(r=>{ if(!GUIDE.has(r[1],tool)) miss.push(tool+' '+r[1]); });
   });
   return miss;
 });
 ok('no measurement point is left without one', !cover.length, cover.length?cover.join(', '):'9 undercarriage + 22 GET');

 const both=await p.evaluate(()=>{
   const bad=[];
   GUIDE.codes().forEach(k=>{
     const [scope,code]=k.includes('.')?k.split('.'):['',k];
     ['en','ru'].forEach(lg=>{
       const g=GUIDE.for(code,scope,lg);
       if(!g||!g.tool||!g.how||!g.check) bad.push(k+'/'+lg+' incomplete');
       else if(lg==='ru' && !/[Ѐ-ӿ]/.test(g.tool+g.how+g.check)) bad.push(k+' russian is not russian');
       else if(lg==='en' && /[Ѐ-ӿ]/.test(g.tool+g.how+g.check)) bad.push(k+' english has cyrillic');
     });
   });
   return bad;
 });
 ok('all three answers, in both languages', !both.length, both.length?both.slice(0,4).join(' | '):'31 points × 2');

 // CRACK means a different job on a bucket than on a blade
 const crack=await p.evaluate(()=>({
   bucket:GUIDE.for('CRACK','bucket','en').check, blade:GUIDE.for('CRACK','blade','en').check }));
 ok('a scoped code is not confused with its namesake', crack.bucket!==crack.blade,
    'bucket: '+crack.bucket.slice(0,28)+'… / blade: '+crack.blade.slice(0,28)+'…');

 // the limits belong to wear.js and get.js and must not be restated here
 const guideSrc=fs.readFileSync(ROOT+'/mobile/inspect-guide.js','utf8');
 const body=guideSrc.slice(guideSrc.indexOf('var E = {'));
 ok('no limit figures are duplicated into the method file',
    !/\b\d+(\.\d+)?\s*mm\b/i.test(body), (body.match(/\b\d+(\.\d+)?\s*mm\b/i)||[''])[0]||'none');

 console.log('\nthe drawing, on a GET round');
 await p.evaluate(()=>{const s=document.getElementById('typeSel');s.value='GET';s.dispatchEvent(new Event('change'));});
 await p.waitForTimeout(300);
 await p.evaluate(()=>selectEquip('EX001'));
 await p.waitForTimeout(800);
 await p.evaluate(()=>{const n=document.querySelector('#posnav .ucmap [data-ucg]'); if(n)n.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
 await p.waitForTimeout(400);
 /* The diagram preference is shared with the undercarriage round on purpose —
    "show me the drawing" is one habit, not one per round — and it now defaults
    CLOSED, because in the dock it is 340 px between the number and the way on.
    So open it before asking what is in it. */
 /* Reachable by a thumb, not just by .click(). The row was styled display:none
    until a container opted in and only the undercarriage dock ever did, so the
    GET round's copy was invisible for as long as the drawings have existed —
    and this suite, which drove it programmatically, never noticed. */
 const togSeen = s => p.evaluate(x=>{const e=document.querySelector(x);
   return !!e && getComputedStyle(e).display!=='none' && e.getClientRects().length>0;}, s);
 ok('the row is on screen, not just in the document', await togSeen('#getFigTog'));
 await p.evaluate(()=>{const t=document.getElementById('getFigTog');
   if(t && !/Hide/i.test(t.textContent)) t.click();});
 await p.waitForTimeout(350);
 const fig=await p.evaluate(()=>{const b=document.getElementById('getFig');
   return {svg:!!b.querySelector('svg'), texts:b.querySelectorAll('text').length,
           dim:!!b.querySelector('.dm'), ghost:!!b.querySelector('.gh'),
           tog:(document.getElementById('getFigTog').textContent||'').trim()};});
 ok('a GET position comes with a drawing', fig.svg && fig.texts>2, fig.texts+' labels');
 ok('with the dimension to record and the profile when new', fig.dim && fig.ghost);
 ok('and it can be folded away', /Hide the diagram/i.test(fig.tog), fig.tog);
 // the setting is shared with the undercarriage round, so folding one folds both
 await p.evaluate(()=>document.getElementById('getFigTog').click());
 await p.waitForTimeout(200);
 ok('folding it away actually removes it',
    await p.evaluate(()=>!document.getElementById('getFig').querySelector('svg')));
 await p.evaluate(()=>document.getElementById('getFigTog').click());
 await p.waitForTimeout(200);
 await p.evaluate(()=>document.querySelector('[data-lang="ru"]').click());
 await p.waitForTimeout(500);
 await p.evaluate(()=>{const n=document.querySelector('#posnav .ucmap [data-ucg]'); if(n)n.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
 await p.waitForTimeout(400);
 /* Only the <text> elements. textContent would sweep up the inline stylesheet
    and pass on a drawing whose labels were still English. */
 const ruFig=await p.evaluate(()=>[...document.querySelectorAll('#getFig svg text')]
   .map(t=>t.textContent).join(' | '));
 ok('and the drawing itself is in Russian on a Russian phone', /[\u0400-\u04ff]/.test(ruFig),
    ruFig.trim().slice(0,40).replace(/\s+/g,' ')+'…');
 await p.evaluate(()=>document.querySelector('[data-lang="en"]').click());
 await p.waitForTimeout(400);

 console.log('\non the screen, in the round');
 for(const [ty,unit,label] of [['UC','DZ001','undercarriage'],['GET','EX001','GET']]){
   await p.evaluate(t=>{const s=document.getElementById('typeSel');s.value=t;s.dispatchEvent(new Event('change'));},ty);
   await p.waitForTimeout(300);
   await p.evaluate(u=>selectEquip(u),unit);
   await p.waitForTimeout(800);
   // pick a point — the method belongs to a position, not to the round
   await p.evaluate(()=>{const n=document.querySelector('#posnav .ucmap [data-ucg]'); if(n)n.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
   await p.waitForTimeout(400);
   const id = ty==='UC' ? 'ucGuide' : 'getGuide';
   const st=await p.evaluate(x=>{const e=document.getElementById(x);
     return {tog:!!e.querySelector('.guide-t'), body:!!e.querySelector('.guide-b'), txt:(e.textContent||'').trim().slice(0,30)};},id);
   ok(label+': the method is one tap away', st.tog, st.txt);
   // The open/closed choice is one preference across both rounds and is
   // remembered, so normalise rather than assume: close it if the round before
   // left it open, then open it and look at what came up.
   if(st.body){ await p.evaluate(x=>document.getElementById(x).querySelector('.guide-t').click(), id); await p.waitForTimeout(200); }
   ok(label+': it is out of the way until it is asked for',
      !(await p.evaluate(x=>!!document.getElementById(x).querySelector('.guide-b'), id)));
   await p.evaluate(x=>document.getElementById(x).querySelector('.guide-t').click(), id);
   await p.waitForTimeout(200);
   const open=await p.evaluate(x=>{const e=document.getElementById(x);
     return {n:e.querySelectorAll('.guide-b div').length, len:(e.textContent||'').length,
             heads:[...e.querySelectorAll('.guide-b b')].map(b=>b.textContent)};},id);
   ok(label+': it opens onto bring / how / look at', open.n===3, open.heads.join(' · ')+'  '+open.len+' chars');

   // and it follows the language. Switch first, then pick the point: on an
   // undercarriage round the language buttons are outside the measurement
   // sheet, and tapping outside it dismisses it — correctly.
   await p.evaluate(()=>document.querySelector('[data-lang="ru"]').click());
   await p.waitForTimeout(400);
   await p.evaluate(()=>{const n=document.querySelector('#posnav .ucmap [data-ucg]'); if(n)n.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
   await p.waitForTimeout(400);
   const ru=await p.evaluate(x=>(document.getElementById(x).textContent||''),id);
   ok(label+': and it is in Russian on a Russian phone', /[\u0400-\u04ff]/.test(ru), ru.trim().slice(0,34).replace(/\s+/g,' ')+'…');
   ok(label+': and it stayed open across the switch', /guide-b/.test(await p.evaluate(x=>document.getElementById(x).innerHTML,id)));
   await p.evaluate(()=>document.querySelector('[data-lang="en"]').click());
   await p.waitForTimeout(400);
 }
 await b.close();
 console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
 process.exit(fails.length?1:0);
});
