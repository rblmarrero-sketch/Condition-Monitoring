/* "Upload from all devices", taken literally: three destination kinds, a phone
   that batches and a phone that cannot, a link that dies, and a script nobody
   has redeployed. Every combination has to end with the round on the far side. */
const { chromium } = require(require('./pw.cjs'));
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').join(__dirname, '..');
const fails=[];const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const note=(n,d)=>console.log('   ·      '+n+'   '+d);
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
let got={gas:[],pa:[],post:[]}, reqs={gas:0,pa:0,post:0}, modern=true, dieAfter=null;
const srv=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://x'), cors={'Access-Control-Allow-Origin':'*',
   'Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS'};
 if(req.method==='OPTIONS'){res.writeHead(204,cors);return res.end();}
 if(u.pathname==='/__reset'){ got={gas:[],pa:[],post:[]}; reqs={gas:0,pa:0,post:0};
   modern=u.searchParams.get('old')!=='1'; dieAfter=u.searchParams.get('die')?Number(u.searchParams.get('die')):null;
   res.writeHead(200,cors); return res.end('ok'); }
 /* Heal the link WITHOUT clearing what has already arrived. Resetting both is
    how the recovery case came to report one file of six: the count started
    again at the moment the link came back. */
 if(u.pathname==='/__heal'){ dieAfter=null; res.writeHead(200,cors); return res.end('ok'); }
 if(u.pathname==='/__stat'){res.writeHead(200,Object.assign({'Content-Type':'application/json'},cors));
   return res.end(JSON.stringify({got,reqs}));}
 const send=o=>{res.writeHead(200,Object.assign({'Content-Type':'application/json'},cors));res.end(JSON.stringify(o));};
 /* the Apps Script destination */
 if(u.pathname==='/exec'){
   let b=''; req.on('data',c=>b+=c);
   return req.on('end',()=>{
     let j=null; try{ j=JSON.parse(b); }catch(e){}
     if(dieAfter!==null && got.gas.length>=dieAfter){ req.socket.destroy(); return; }
     reqs.gas++;
     if(j&&j.op==='ping') return send(modern?{ok:true,write:true,batch:true}:{ok:true,write:true});
     if(j&&j.op==='batch'){
       if(!modern) return send({ok:false,error:'Missing file name'});
       const saved=(j.files||[]).map(f=>{got.gas.push(f.name);return {ok:true,req:f.name,name:f.name};});
       return send({ok:true,batch:true,saved,failed:[]});
     }
     if(j&&j.name) got.gas.push(j.name);
     return send({ok:true,name:(j&&j.name)||''});
   });
 }
 /* Power Automate: JSON with a secret header */
 if(u.pathname==='/pa'){
   let b=''; req.on('data',c=>b+=c);
   return req.on('end',()=>{ reqs.pa++;
     let j=null; try{ j=JSON.parse(b); }catch(e){}
     if(j&&j.name) got.pa.push(j.name);
     return send({ok:true}); });
 }
 /* a plain server: multipart, the only one that takes the bytes as bytes */
 if(u.pathname==='/post'){
   let n=Buffer.alloc(0); req.on('data',c=>n=Buffer.concat([n,c]));
   return req.on('end',()=>{ reqs.post++;
     const m=/filename="([^"]+)"/.exec(n.toString('latin1'));
     if(m) got.post.push(m[1]);
     return send({ok:true}); });
 }
 const p=path.join(ROOT,u.pathname);
 if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404,cors);return res.end('x');}
 res.writeHead(200,Object.assign({'Content-Type':MIME[path.extname(p)]||'application/octet-stream'},cors));
 res.end(fs.readFileSync(p));
});
const B='http://127.0.0.1:8078';
srv.listen(8078,async()=>{
 const b=await chromium.launch();
 async function round(opts){
   const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,serviceWorkers:'block'});
   const p=await ctx.newPage();
   p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
   await p.addInitScript(u=>{ localStorage.setItem('up_dests',JSON.stringify([
     {id:'gas', on:true, url:u+'/exec', sec:'', folder:'{TYPE}/{UNIT}/{YYYY-MM-DD}'},
     {id:'pa',  on:true, url:u+'/pa',   sec:'x-api-key: k', folder:'{TYPE}/{UNIT}'},
     {id:'post',on:true, url:u+'/post', sec:'', folder:'{TYPE}'}]));
     localStorage.removeItem('up_batch'); }, B);
   await p.goto(B+'/mobile/index.html',{waitUntil:'load'});
   await p.waitForTimeout(1200);
   await p.evaluate(async ({u,q})=>fetch(u+'/__reset'+q), {u:B,q:opts.q||''});
   await p.evaluate(()=>{const s=document.getElementById('typeSel');s.value='MP';s.dispatchEvent(new Event('change'));});
   await p.waitForTimeout(300);
   await p.evaluate(()=>selectEquip('TK151'));
   await p.waitForTimeout(500);
   await p.fill('#inspector','R. Marrero');
   await p.evaluate(async n=>{
     const pos=curP(); pos.photos||=[];
     for(let i=0;i<n;i++){
       const c=document.createElement('canvas');c.width=500;c.height=380;
       const x=c.getContext('2d');x.fillStyle='#4b4136';x.fillRect(0,0,500,380);
       x.fillStyle='#fff';x.fillText('p'+i,10,20);
       pos.photos.push(await new Promise(r=>c.toBlob(r,'image/jpeg',0.7)));
     }
     pos.grade='B'; renderMedia(); renderChips();
   }, opts.photos||5);
   await p.click('#saveBtn');
   await p.waitForTimeout(opts.wait||9000);
   if(opts.recover){
     await p.evaluate(async u=>fetch(u+'/__heal'),B).catch(()=>{});
     for(let i=0;i<4;i++){ await p.evaluate(()=>syncNow(true)).catch(()=>{}); await p.waitForTimeout(3500); }
   }
   const st=await (await fetch(B+'/__stat')).json();
   const pend=await p.evaluate(async()=>(await dbAll()).filter(r=>!r.up).length);
   await ctx.close();
   return {st,pend};
 }

 const N=5, FILES=N+1;                       // the photographs plus the sidecar
 console.log('three destinations at once, from one phone');
 let {st,pend}=await round({photos:N});
 ok('Google Drive has the whole round', st.got.gas.length===FILES, st.got.gas.length+' of '+FILES);
 ok('SharePoint has the whole round',   st.got.pa.length===FILES,  st.got.pa.length+' of '+FILES);
 ok('the plain server has it too',      st.got.post.length===FILES,st.got.post.length+' of '+FILES);
 ok('and the round is marked sent only once all three have it', pend===0, pend+' still waiting');
 note('requests each', 'Drive '+st.reqs.gas+' · SharePoint '+st.reqs.pa+' · server '+st.reqs.post);
 ok('Drive took it in batches, the other two one at a time',
    st.reqs.gas < st.reqs.pa && st.reqs.pa===FILES && st.reqs.post===FILES,
    st.reqs.gas+' vs '+st.reqs.pa);

 console.log('\nthe same phone against a script nobody has redeployed');
 ({st,pend}=await round({photos:N, q:'?old=1'}));
 ok('every file still reaches Drive', st.got.gas.length===FILES, st.got.gas.length+' of '+FILES);
 ok('and the other two are untouched by that', st.got.pa.length===FILES && st.got.post.length===FILES);
 ok('nothing is left waiting', pend===0, pend+' still waiting');

 console.log('\nthe link dies part way and comes back');
 ({st,pend}=await round({photos:N, q:'?die=3', wait:7000, recover:true}));
 const dup=st.got.gas.filter((x,i)=>st.got.gas.indexOf(x)!==i);
 ok('the round completes', st.got.gas.length>=FILES, st.got.gas.length+' of '+FILES);
 ok('and nothing was sent twice', !dup.length, dup.length?[...new Set(dup)].join(' '):'no repeats');

 await b.close();
 console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
 process.exit(fails.length?1:0);
});
