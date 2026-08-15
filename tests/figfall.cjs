/* The photograph does not arrive — a cache miss on a phone with no signal, or a
   model nobody has shot yet. The numbers must still have something under them. */
const { chromium } = require(require('./pw.cjs'));
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').join(__dirname, '..');
const fails=[];const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{const u=new URL(req.url,'http://x');
 if(/\/machine\//.test(u.pathname)){res.writeHead(504);return res.end('');}   // every photograph gone
 const p=path.join(ROOT,u.pathname);
 if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end('x');}
 res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});res.end(fs.readFileSync(p));
}).listen(8087,async()=>{
 const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const p=await ctx.newPage();
 p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
 await p.addInitScript(()=>localStorage.setItem('up_dests','[]'));
 await p.goto('http://127.0.0.1:8087/mobile/index.html',{waitUntil:'load'});
 await p.waitForTimeout(1200);

 for (const [ty,unit] of [['UC','DZ001'],['GET','EX001']]) {
   await p.evaluate(t=>{const s=document.getElementById('typeSel');s.value=t;s.dispatchEvent(new Event('change'));},ty);
   await p.waitForTimeout(300);
   const has=await p.evaluate(u=>{try{selectEquip(u);return true;}catch(e){return false;}},unit);
   if(!has){ console.log('  skip '+ty+' '+unit); continue; }
   await p.waitForTimeout(900);
   const r=await p.evaluate(()=>{
     const svg=document.querySelector('#posnav .ucmap');
     if(!svg) return null;
     const img=svg.querySelector('.um-photo');
     const drawn=svg.querySelector('.um-drawn');
     return { img:!!img, drawn:!!drawn,
              drawnShown: !!drawn && drawn.getAttribute('style')!=='display:none',
              strokes: drawn?drawn.querySelectorAll('*').length:0,
              /* which drawing it is, not merely that there is one */
              track: drawn?drawn.querySelectorAll('.mf-roller,.mf-idler,.mf-sprocket,.mf-chain').length:0,
              nums: svg.querySelectorAll('[data-ucg]').length };
   });
   console.log('\n'+ty+' with every photograph 504');
   ok('the map is still drawn', !!r && r.nums>0, r?r.nums+' numbers':'no map');
   ok('the broken photograph is gone', r && !r.img);
   if(ty==='UC') ok('and the drawn frame took its place', r && r.drawn && r.drawnShown, r&&r.strokes+' elements');
   /* This used to assert that NOTHING was drawn under a bucket. That was right
      about the track frame and wrong about the conclusion: thirty of the
      seventy-one machines with a GET round have no photograph, so "draw
      nothing" meant eleven numbers over an empty box on nearly half the fleet.
      The rule is the correct part, not no part. */
   else {
     ok('the tool is drawn in the photograph\'s place', r && r.drawn && r.drawnShown,
        r && r.strokes+' elements');
     ok('and it is the tool, not an undercarriage', r && r.track===0, r && String(r.track));
   }
 }
 await b.close();
 console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
 process.exit(fails.length?1:0);
});
