/* A round has to survive a link that keeps dying. The question is not whether
   an upload is slow — it is whether it finishes at all, and an uploader with no
   memory of what already landed spends every attempt re-sending the start of
   the round and never reaches the end of it. */
const { chromium } = require(require('./pw.cjs'));
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').join(__dirname, '..');
const fails=[];const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const note=(n,d)=>console.log('   ·      '+n+'   '+d);
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
let got=[], dieAfter=null, b64=0, raw=0;
const srv=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://x'), cors={'Access-Control-Allow-Origin':'*'};
 if(u.pathname==='/exec'){
   if(req.method!=='POST'){res.writeHead(200,cors);return res.end('{"ok":true}');}
   let b='';req.on('data',c=>b+=c);
   return req.on('end',()=>{
     let j=null;try{j=JSON.parse(b);}catch(e){}
     if(dieAfter!==null && dieAfter<=0){ req.socket.destroy(); return; }
     if(dieAfter!==null) dieAfter--;
     if(j&&j.file){ b64+=j.file.length; raw+=Buffer.from(j.file,'base64').length; }
     got.push((j&&j.name)||'?');
     res.writeHead(200,Object.assign({'Content-Type':'application/json'},cors));res.end('{"ok":true}');
   });
 }
 const p=path.join(ROOT,u.pathname);
 if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404,cors);return res.end('x');}
 res.writeHead(200,Object.assign({'Content-Type':MIME[path.extname(p)]||'application/octet-stream'},cors));
 res.end(fs.readFileSync(p));
});
const B='http://127.0.0.1:8091';
srv.listen(8091,async()=>{
 const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const p=await ctx.newPage();
 p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
 await p.addInitScript(u=>localStorage.setItem('up_dests',JSON.stringify([
   {id:'gas',on:true,url:u,sec:'',folder:'{TYPE}/{UNIT}/{YYYY-MM-DD}'},
   {id:'pa',on:false,url:'https://off.invalid/',sec:'',folder:''},
   {id:'post',on:false,url:'https://off.invalid/',sec:'',folder:''}])), B+'/exec');
 await p.goto(B+'/mobile/index.html',{waitUntil:'load'});
 await p.waitForTimeout(1500);
 await p.evaluate(()=>{const s=document.getElementById('typeSel');s.value='MP';s.dispatchEvent(new Event('change'));});
 await p.waitForTimeout(300);
 await p.evaluate(()=>selectEquip('TK151'));
 await p.waitForTimeout(500);
 await p.fill('#inspector','R. Marrero');
 const N=6;
 await p.evaluate(async n=>{
   const pos=curP(); pos.photos||=[];
   for(let i=0;i<n;i++){
     const c=document.createElement('canvas');c.width=1200;c.height=900;
     const x=c.getContext('2d');let s=i*37+5;const rnd=()=>((s=(s*1103515245+12345)&0x7fffffff)/0x7fffffff);
     x.fillStyle='#4b4136';x.fillRect(0,0,1200,900);
     for(let k=0;k<300;k++){x.fillStyle='rgba('+(rnd()*255|0)+','+(rnd()*200|0)+',80,.8)';
       x.beginPath();x.arc(rnd()*1200,rnd()*900,4+rnd()*22,0,6.3);x.fill();}
     const id=x.getImageData(0,0,1200,900),d=id.data;
     for(let q=0;q<d.length;q+=4){const v=(rnd()-0.5)*40;d[q]+=v;d[q+1]+=v;d[q+2]+=v;}
     x.putImageData(id,0,0);
     pos.photos.push(await new Promise(r=>c.toBlob(r,'image/jpeg',0.78)));
   }
   pos.grade='B'; renderMedia(); renderChips();
 }, N);
 /* The link is already failing before the round is saved, so the automatic
    sync on save is itself the first doomed attempt — which is the real
    sequence in the pit, not a tidy one that starts from nothing. */
 dieAfter=2;
 await p.click('#saveBtn');
 await p.waitForTimeout(500);
 const TOTAL=N+1;                                   // the photographs plus the sidecar

 console.log('a link that keeps dying');
 // dies after two files, every single attempt — the pit at its worst
 let rounds=1;                                     // the sync on save counts
 await p.waitForTimeout(2500);
 note('the first attempt, on save', got.length+' of '+TOTAL+' files through');
 for(let i=0;i<14 && got.length<TOTAL;i++){
   dieAfter=2; rounds++;
   await p.evaluate(()=>syncNow(true)).catch(()=>{});
   await p.waitForTimeout(2500);
 }
 ok('the round gets through a link that never lasts more than two files',
    got.length>=TOTAL, got.length+' of '+TOTAL+' files after '+rounds+' attempts');
 const dupes={}; got.forEach(n=>dupes[n]=(dupes[n]||0)+1);
 const resent=Object.entries(dupes).filter(([,c])=>c>1);
 ok('and nothing is sent twice', !resent.length,
    resent.length?resent.map(([n,c])=>n.split('_').pop()+'×'+c).join(' '):'0 redundant of '+got.length);
 note('attempts needed', rounds+' — two files each, '+TOTAL+' files');

 // the record is only marked done when every file is really there
 const st=await p.evaluate(async()=>{const r=(await dbAll())[0];
   return {up:r.up, sent:r.sent?Object.keys(r.sent.gas||{}).length:null};});
 ok('and only then is the round marked sent', st.up===1, 'up='+st.up);
 ok('the resume list is dropped once it is no use', st.sent===null, 'sent='+st.sent);

 note('base64 tax', Math.round(b64/1024)+' KB on the wire for '+Math.round(raw/1024)
      +' KB of photograph ('+Math.round((b64/raw-1)*100)+'% more)');
 await b.close();
 console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
 process.exit(fails.length?1:0);
});
