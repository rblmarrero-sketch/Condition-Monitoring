/* The phone's half. It has to batch where the endpoint takes them, work out for
   itself where it does not, and never need anybody to be told which. */
const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');   // the machine photographs every round now carries
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').join(__dirname, '..');
const fails=[];const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const note=(n,d)=>console.log('   ·      '+n+'   '+d);
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
let reqs=[], files=[], modern=true;
const srv=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://x'), cors={'Access-Control-Allow-Origin':'*'};
 if(u.pathname==='/__reset'){ reqs=[]; files=[]; modern=u.searchParams.get('old')!=='1';
   res.writeHead(200,cors); return res.end('ok'); }
 if(u.pathname==='/__stat'){ res.writeHead(200,Object.assign({'Content-Type':'application/json'},cors));
   return res.end(JSON.stringify({reqs:reqs.map(r=>r.kind+(r.n?':'+r.n:'')), files})); }
 if(u.pathname==='/exec'){
   /* A read — the phone asking for the push key at boot — is not an upload
      and is not counted among them. */
   if(req.method==='GET'){ res.writeHead(200,Object.assign({'Content-Type':'application/json'},cors)); return res.end(JSON.stringify({ok:false,error:'Unknown action: '+(u.searchParams.get('action')||'')})); }
   let b=''; req.on('data',c=>b+=c);
   return req.on('end',()=>{
     let j=null; try{ j=JSON.parse(b); }catch(e){}
     const send=o=>{res.writeHead(200,Object.assign({'Content-Type':'application/json'},cors));res.end(JSON.stringify(o));};
     if(j&&j.op==='ping'){ reqs.push({kind:'ping'});
       return send(modern?{ok:true,write:true,batch:true}:{ok:true,write:true}); }
     if(j&&j.op==='batch'){
       // an old deployment has no batch branch: the body falls through to its
       // single-file path and trips on the missing name
       if(!modern){ reqs.push({kind:'batch-refused'}); return send({ok:false,error:'Missing file name'}); }
       reqs.push({kind:'batch',n:(j.files||[]).length});
       const saved=(j.files||[]).map(f=>{ files.push(f.name); return {ok:true,req:f.name,name:f.name}; });
       return send({ok:true,batch:true,saved,failed:[]});
     }
     reqs.push({kind:'one'}); if(j&&j.name) files.push(j.name);
     return send({ok:true,name:(j&&j.name)||''});
   });
 }
 const p=path.join(ROOT,u.pathname);
 if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404,cors);return res.end('x');}
 res.writeHead(200,Object.assign({'Content-Type':MIME[path.extname(p)]||'application/octet-stream'},cors));
 res.end(fs.readFileSync(p));
});
const B='http://127.0.0.1:8083';
srv.listen(8083,async()=>{
 const b=await chromium.launch();
 async function round(old){
   const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,serviceWorkers:'block'});
   const p=await ctx.newPage();
   p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
   await p.addInitScript(u=>{ localStorage.setItem('up_dests',JSON.stringify([
     {id:'gas',on:true,url:u,sec:'',folder:'{TYPE}/{UNIT}/{YYYY-MM-DD}'},
     {id:'pa',on:false,url:'https://off.invalid/',sec:'',folder:''},
     {id:'post',on:false,url:'https://off.invalid/',sec:'',folder:''}]));
     localStorage.removeItem('up_batch'); }, B+'/exec');
   await p.goto(B+'/mobile/index.html',{waitUntil:'load'});
   await p.waitForTimeout(1200);
   await p.evaluate(async u=>fetch(u+'/__reset?old='+(u.__old||'')), B);
   await p.evaluate(async ({u,old})=>fetch(u+'/__reset'+(old?'?old=1':'')), {u:B,old});
   await p.evaluate(()=>{const s=document.getElementById('typeSel');s.value='MP';s.dispatchEvent(new Event('change'));});
   await p.waitForTimeout(300);
   await p.evaluate(()=>selectEquip('TK151'));
   await p.waitForTimeout(500);
   await p.fill('#inspector','R. Marrero');
   await p.evaluate(async ()=>{
     const pos=curP(); pos.photos||=[];
     for(let i=0;i<10;i++){
       const c=document.createElement('canvas');c.width=600;c.height=450;
       const x=c.getContext('2d');x.fillStyle='#4b4136';x.fillRect(0,0,600,450);
       x.fillStyle='#fff';x.fillText('p'+i,20,20);
       pos.photos.push(await new Promise(r=>c.toBlob(r,'image/jpeg',0.7)));
     }
     pos.grade='B'; renderMedia(); renderChips();
   });
   await p.evaluate(PLANT);
   await p.click('#saveBtn');
   await p.waitForTimeout(6000);
   const st=await (await fetch(B+'/__stat')).json();
   const cap=await p.evaluate(()=>localStorage.getItem('up_batch'));
   await ctx.close();
   return {st,cap};
 }

 console.log('an endpoint that takes batches');
 let {st,cap}=await round(false);
 const batches=st.reqs.filter(r=>/^batch:/.test(r));
 const singles=st.reqs.filter(r=>r==='one');
 ok('all twelve files arrive (eleven plus the machine overview)', st.files.length===12, st.files.length+' files');
 ok('but nowhere near eleven requests', batches.length+singles.length<=5,
    st.reqs.join(' '));
 note('what went over the wire', st.reqs.join('  '));
 ok('the sidecar still goes first and alone', st.reqs.filter(r=>r==='one').length>=1 &&
    /\.json$/.test(st.files[0]||''), st.files[0]);
 ok('and the capability is remembered, so it is asked once', /"batch":true|true/.test(cap||''), cap);

 console.log('\nthe same phone against a deployment nobody has redeployed');
 ({st,cap}=await round(true));
 ok('every file still arrives', st.files.length===12, st.files.length+' files');
 ok('it works out for itself that batches are not on offer',
    st.reqs.filter(r=>r==='batch-refused').length<=1,
    st.reqs.filter(r=>r==='batch-refused').length+' refused batches');
 ok('and does not keep trying', /false/.test(cap||''), cap);
 note('what went over the wire', st.reqs.join('  '));
 ok('nothing was lost to the fallback', new Set(st.files).size===12, new Set(st.files).size+' distinct');

 await b.close();
 console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
 process.exit(fails.length?1:0);
});
