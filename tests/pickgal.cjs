/* An inspector who already photographed the cracked lip — before opening the
   app, or on the walk back — should not be told to photograph it again. */
const { chromium } = require(require('./pw.cjs'));
const http=require('http'),fs=require('fs'),path=require('path'),zlib=require('zlib');
const ROOT=require('path').join(__dirname, '..');
const fails=[];const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{const u=new URL(req.url,'http://x');const p=path.join(ROOT,u.pathname);
 if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end('x');}
 res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});res.end(fs.readFileSync(p));
}).listen(8090,async()=>{
 const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const p=await ctx.newPage();
 p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
 await p.addInitScript(()=>localStorage.setItem('up_dests','[]'));
 await p.goto('http://127.0.0.1:8090/mobile/index.html',{waitUntil:'load'});
 await p.waitForTimeout(1200);
 await p.evaluate(()=>{const s=document.getElementById('typeSel');s.value='MP';s.dispatchEvent(new Event('change'));});
 await p.waitForTimeout(300);
 await p.evaluate(()=>selectEquip('DT001'));
 await p.waitForTimeout(600);
 const started=await p.evaluate(()=>!!window.curItem || !!document.querySelector('#posnav button[data-pos]'));
 if(!started) await p.evaluate(()=>{const b=document.querySelector('#posnav button[data-pos]'); if(b)b.click();});
 await p.waitForTimeout(400);

 console.log('the control itself');
 const el=await p.evaluate(()=>{
   const g=document.getElementById('gallery'), c=document.getElementById('camera'), v=document.getElementById('video');
   return { exists:!!g, capture:g?g.hasAttribute('capture'):null,
            camCapture:c.getAttribute('capture'), vidCapture:v.getAttribute('capture') };
 });
 ok('the gallery input does NOT force the camera', el.exists && el.capture===false, 'capture attribute present: '+el.capture);
 ok('while the live inputs still go straight to it',
    el.camCapture==='environment' && el.vidCapture==='environment');

 // Add photo has to ASK, every time — not go straight to the lens
 const askPhoto=await p.evaluate(async ()=>{
   document.getElementById('takeBtn').click();
   await new Promise(r=>setTimeout(r,250));
   const d=document.getElementById('srcDlg');
   return { open:d.open, title:document.getElementById('srcTitle').textContent,
            live:document.getElementById('srcLive').textContent,
            gal:document.getElementById('srcGal').textContent,
            cancel:document.getElementById('srcCancel').textContent };
 });
 ok('Add photo asks where it comes from', askPhoto.open, askPhoto.title);
 ok('and offers taking one now', /Take one now/.test(askPhoto.live), askPhoto.live);
 ok('and one already on the phone, as an equal', /gallery/i.test(askPhoto.gal), askPhoto.gal);
 ok('with a way to back out', !!askPhoto.cancel, askPhoto.cancel);
 // backing out must add nothing
 await p.evaluate(()=>document.getElementById('srcCancel').click());
 await p.waitForTimeout(250);
 ok('backing out leaves the position untouched',
    await p.evaluate(()=>!(draft.positions[curItem]||{}).photos));

 const askVid=await p.evaluate(async ()=>{
   document.getElementById('videoBtn').click();
   await new Promise(r=>setTimeout(r,250));
   const d=document.getElementById('srcDlg');
   const o={ open:d.open, live:document.getElementById('srcLive').textContent,
             gal:document.getElementById('srcGal').textContent };
   document.getElementById('srcCancel').click();
   return o;
 });
 ok('Video asks the same question', askVid.open && /Record one now/.test(askVid.live), askVid.live);
 ok('and offers the gallery too', /gallery/i.test(askVid.gal), askVid.gal);
 await p.waitForTimeout(250);

 // the picker is narrowed to what was asked for
 const filt=await p.evaluate(async ()=>{
   const g=document.getElementById('gallery');
   let seen=[]; const real=g.click.bind(g); g.click=()=>seen.push({a:g.accept,m:g.multiple});
   document.getElementById('takeBtn').click(); await new Promise(r=>setTimeout(r,200));
   document.getElementById('srcGal').click(); await new Promise(r=>setTimeout(r,200));
   document.getElementById('videoBtn').click(); await new Promise(r=>setTimeout(r,200));
   document.getElementById('srcGal').click(); await new Promise(r=>setTimeout(r,200));
   g.click=real; return seen;
 });
 ok('asking for a photograph opens a library of photographs',
    filt[0] && filt[0].a==='image/*' && filt[0].m===true, JSON.stringify(filt[0]));
 ok('asking for a clip opens one clip',
    filt[1] && filt[1].a==='video/*' && filt[1].m===false, JSON.stringify(filt[1]));

 // hand files to the input the way the OS picker does
 const give = (files) => p.evaluate(async (specs)=>{
   const dt=new DataTransfer();
   for(const s of specs){
     let blob;
     if(s.kind==='img'){
       const c=document.createElement('canvas'); c.width=s.w||2400; c.height=s.h||1800;
       const x=c.getContext('2d'); x.fillStyle='#5a4a3a'; x.fillRect(0,0,c.width,c.height);
       let seed=s.seed||1; const rnd=()=>((seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff);
       for(let i=0;i<400;i++){ x.fillStyle='rgba('+(rnd()*255|0)+','+(rnd()*200|0)+',70,.8)';
         x.beginPath(); x.arc(rnd()*c.width,rnd()*c.height,4+rnd()*28,0,6.3); x.fill(); }
       const id=x.getImageData(0,0,c.width,c.height), d=id.data;
       for(let i=0;i<d.length;i+=4){ const n=(rnd()-0.5)*40; d[i]+=n; d[i+1]+=n; d[i+2]+=n; }
       x.putImageData(id,0,0);
       blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.92));
     } else {
       blob=new Blob([new Uint8Array(2048)],{type:'video/mp4'});
     }
     dt.items.add(new File([blob], s.name, {type:blob.type}));
   }
   const g=document.getElementById('gallery');
   g.files=dt.files;
   g.dispatchEvent(new Event('change',{bubbles:true}));
 }, files);
 const state=()=>p.evaluate(()=>{const q=draft.positions[curItem]||{};
   return { photos:(q.photos||[]).length, video:!!q.video,
            bytes:(q.photos||[]).reduce((a,x)=>a+x.size,0),
            tiles:document.querySelectorAll('#mediastrip .mtile').length }; });

 console.log('\npicking what the phone already has');
 await give([{kind:'img',name:'IMG_1.jpg',seed:3},{kind:'img',name:'IMG_2.jpg',seed:9}]);
 await p.waitForTimeout(1400);
 let s=await state();
 ok('two photographs off the gallery land in the round', s.photos===2, s.photos+' photos, '+s.tiles+' tiles');
 ok('and they are shrunk on the way in like any other',
    s.bytes>0 && s.bytes/2 < 500*1024, Math.round(s.bytes/2/1024)+' KB each');

 await give([{kind:'vid',name:'clip.mp4'}]);
 await p.waitForTimeout(900);
 s=await state();
 ok('a clip off the gallery lands too', s.video, s.tiles+' tiles');

 console.log('\nwhat will not fit is said, not silently dropped');
 await p.evaluate(()=>{const d=document.getElementById('dlg'); if(d.open)d.close();});
 const many=[]; for(let i=0;i<10;i++) many.push({kind:'img',name:'f'+i+'.jpg',seed:i+11,w:900,h:700});
 many.push({kind:'vid',name:'second.mp4'});
 await give(many);
 await p.waitForTimeout(6000);
 s=await state();
 const said=await p.evaluate(()=>{const d=document.getElementById('dlg');
   return d.open?{t:document.getElementById('dlgTitle').textContent,m:document.getElementById('dlgMsg').textContent}:null;});
 ok('the position fills to its limit and no further', s.photos===10 && s.video, s.photos+' photos + '+(s.video?'1':'0')+' video');
 ok('and the inspector is told how many were left out', !!said && /\b3\b/.test(said.m||''), said?said.m:'nothing said');
 await p.evaluate(()=>{const d=document.getElementById('dlg'); if(d.open)d.close();});
 await p.waitForTimeout(200);
 s=await state();
 ok('and with the strip full, Add photo stops offering',
    await p.evaluate(()=>document.getElementById('takeBtn').disabled));

 console.log('\nthe limit is per component, not per machine');
 const per=await p.evaluate(async ()=>{
   const first=curItem, was=(draft.positions[first]||{}).photos.length;
   const others=[...document.querySelectorAll('#posnav button[data-pos]')].map(b=>b.dataset.pos).filter(k=>k!==first);
   if(!others.length) return null;
   pickComponent(others[0]);
   await new Promise(r=>setTimeout(r,300));
   return { was, next:((draft.positions[curItem]||{}).photos||[]).length,
            disabled:document.getElementById('takeBtn').disabled };
 });
 ok('a full position does not use up the next one', per && per.next===0 && per.disabled===false,
    per?('first held '+per.was+', next holds '+per.next):'only one position here');

 console.log('\nand it speaks Russian');
 await p.evaluate(()=>document.querySelector('[data-lang="ru"]').click());
 await p.waitForTimeout(400);
 const ru=await p.evaluate(async ()=>{
   document.getElementById('videoBtn').click(); await new Promise(r=>setTimeout(r,250));
   const o=document.getElementById('srcGal').textContent+' / '+document.getElementById('srcTitle').textContent;
   document.getElementById('srcCancel').click(); return o; });
 ok('the choice follows the language', /[Ѐ-ӿ]/.test(ru), ru.trim());

 await b.close();
 console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
 process.exit(fails.length?1:0);
});
