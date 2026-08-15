/* The picture and the list under it are one control. Whichever you tap, both
   have to agree about what is selected — and on a GET round they did not: the
   chip lit up and the number on the photograph stayed where it was. */
const { chromium } = require(require('./pw.cjs'));
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').join(__dirname, '..');
const fails=[];const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{const u=new URL(req.url,'http://x');const p=path.join(ROOT,u.pathname);
 if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end('x');}
 res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});res.end(fs.readFileSync(p));
}).listen(8088,async()=>{
 const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const p=await ctx.newPage();
 p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
 await p.addInitScript(()=>localStorage.setItem('up_dests','[]'));
 await p.goto('http://127.0.0.1:8088/mobile/index.html',{waitUntil:'load'});
 await p.waitForTimeout(1200);

 // what the screen says is selected, from both halves of the control
 const sel=()=>p.evaluate(()=>{
   const nav=document.getElementById('posnav');
   const num=[...nav.querySelectorAll('.ucmap [data-ucg]')].filter(g=>/\bsel\b/.test(g.getAttribute('class')||'')).map(g=>+g.dataset.ucg);
   const chip=[...nav.querySelectorAll('.ucgroups button')].filter(b=>/\bon\b/.test(b.className)).map(b=>b.dataset.ucg?+b.dataset.ucg:b.dataset.pos);
   return { num, chip, cur:window.curItem };
 });

 for(const [ty,unit,label] of [['GET','EX001','GET'],['UC','DZ001','undercarriage']]){
   await p.evaluate(t=>{const s=document.getElementById('typeSel');s.value=t;s.dispatchEvent(new Event('change'));},ty);
   await p.waitForTimeout(300);
   await p.evaluate(u=>selectEquip(u),unit);
   await p.waitForTimeout(900);
   console.log('\n'+label+' — tapping the name, not the number');
   const chips=await p.evaluate(()=>[...document.querySelectorAll('#posnav .ucgroups button')].length);
   ok('the map and the named list are both there', chips>1, chips+' chips');

   // tap several names in turn; after each, the map must point at that one
   let bad=[];
   for(const i of [chips-1, 4, 0, 2]){
     if(i<0||i>=chips) continue;
     await p.evaluate(n=>document.querySelectorAll('#posnav .ucgroups button')[n].click(), i);
     await p.waitForTimeout(220);
     const s=await sel();
     const want=await p.evaluate(n=>{const b=document.querySelectorAll('#posnav .ucgroups button')[n];
       return b.dataset.ucg?+b.dataset.ucg:(b.querySelector('i')?+b.querySelector('i').textContent:0);},i);
     if(s.num.length!==1 || s.num[0]!==want) bad.push('chip#'+i+' wants '+want+' map says ['+s.num+']');
   }
   ok('the number on the picture follows the name', !bad.length, bad.length?bad.join(' | '):'4 taps, all matched');

   // and the other way round
   const nums=await p.evaluate(()=>[...document.querySelectorAll('#posnav .ucmap [data-ucg]')].map(g=>+g.dataset.ucg));
   let bad2=[];
   for(const n of [nums[nums.length-1], nums[3], nums[0]]){
     if(n===undefined) continue;
     await p.evaluate(x=>document.querySelector('#posnav .ucmap [data-ucg="'+x+'"]').dispatchEvent(new MouseEvent('click',{bubbles:true})), n);
     await p.waitForTimeout(220);
     const s=await sel();
     if(s.num[0]!==n || s.chip.length!==1) bad2.push('num '+n+' -> map['+s.num+'] chip['+s.chip+']');
   }
   ok('and the name follows the number', !bad2.length, bad2.length?bad2.join(' | '):'3 taps, all matched');

   // typing a measurement must not throw the selection away or rebuild the map
   const before=await p.evaluate(()=>{const s=document.querySelector('#posnav .ucmap');return s?s.outerHTML.length:0;});
   await p.evaluate(()=>{const m=document.getElementById('ucMm'); if(m){m.value='21'; m.dispatchEvent(new Event('input',{bubbles:true}));}});
   await p.waitForTimeout(220);
   const s2=await sel();
   ok('typing a reading leaves the selection alone', s2.num.length===1, 'map ['+s2.num+']');
 }
 await b.close();
 console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
 process.exit(fails.length?1:0);
});
