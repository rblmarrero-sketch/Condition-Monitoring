/* The screen has one job: name which of the three things is wrong, because the
   three have opposite fixes. Put it in front of each of them and check it says
   the right one. */
const { chromium } = require(require('./pw.cjs'));
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').join(__dirname, '..');
const fails=[];const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* overhead = ms before the reply starts; bps = bytes/sec the body is drained at;
   originMs = what the app's own host costs. */
let cfg={overhead:40,bps:5e6,originMs:20,dead:false,status:0,hang:false};
http.createServer(async (req,res)=>{
 const u=new URL(req.url,'http://x'), cors={'Access-Control-Allow-Origin':'*'};
 if(u.pathname==='/__cfg'){ Object.assign(cfg,JSON.parse(u.searchParams.get('c')));
   res.writeHead(200,cors); return res.end('ok'); }
 if(u.pathname==='/exec'){
   let b=''; req.on('data',c=>b+=c);
   return req.on('end',async ()=>{
     if(cfg.dead){ req.socket.destroy(); return; }
     if(cfg.hang){ return; }                                  // swallowed, never answered
     if(cfg.status){ res.writeHead(cfg.status,cors); return res.end('no'); }
     await sleep(cfg.overhead + (b.length/cfg.bps)*1000);   // per-request cost, then the bytes
     res.writeHead(200,Object.assign({'Content-Type':'application/json'},cors));
     res.end('{"ok":true,"write":true}');
   });
 }
 const p=path.join(ROOT,u.pathname);
 if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404,cors);return res.end('x');}
 if(/icon-192/.test(u.pathname)) await sleep(cfg.originMs);   // the non-Google control
 res.writeHead(200,Object.assign({'Content-Type':MIME[path.extname(p)]||'application/octet-stream'},cors));
 res.end(fs.readFileSync(p));
}).listen(8082,async()=>{
 const B='http://127.0.0.1:8082';
 const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const p=await ctx.newPage();
 p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
 await p.addInitScript(u=>{ localStorage.setItem('up_dests',JSON.stringify([
   {id:'gas',on:true,url:u,sec:'',folder:'{TYPE}/{UNIT}/{YYYY-MM-DD}'},
   {id:'pa',on:true,url:'https://off.invalid/',sec:'',folder:''},
   {id:'post',on:false,url:'https://off.invalid/',sec:'',folder:''}]));
     /* This phone's inspector has deliberately turned SharePoint on, so mark the
        one-time gas-only correction as already applied. Without this the app
        does what it is supposed to do on first load — switch off everything but
        Google — and the suite reports the correction as three broken uploads. */
   localStorage.setItem('up_gas_only_v1','1'); }, B+'/exec');
 await p.goto(B+'/mobile/index.html',{waitUntil:'load'});
 await p.waitForTimeout(1200);

 const set=async c=>{ await p.evaluate(async ({u,c})=>fetch(u+'/__cfg?c='+encodeURIComponent(JSON.stringify(c))),{u:B,c}); };
 const run=async ()=>{
   await p.evaluate(()=>{ document.getElementById('speedOut').innerHTML=''; runSpeedCheck(); });
   await p.waitForFunction(()=>!document.getElementById('speedBtn').disabled,null,{timeout:120000});
   return p.evaluate(()=>{const o=document.getElementById('speedOut');
     return { verdict:(o.querySelector('.sp-v b')||{}).textContent||'',
              detail:(o.querySelector('.sp-v span')||{}).textContent||'',
              rows:[...o.querySelectorAll('.sp-r')].map(r=>r.querySelector('span').textContent+' = '+r.querySelector('b').textContent),
              copy:!!o.querySelector('#spCopy') };});
 };

 console.log('a destination with no no-op is not called broken');
 await set({overhead:60,bps:5e6,originMs:25,dead:false,status:0,hang:false});
 let r0=await run();
 ok('SharePoint is skipped, not condemned',
    /not measured/i.test(r0.rows.join(' ')) && !/SharePoint.*(cannot be reached|Failed)/i.test(r0.rows.join(' ')),
    r0.rows.filter(x=>/SharePoint/.test(x)).join('  |  '));
 ok('and it says why, so nobody chases a fault that is not there',
    /uploading a real file/i.test(r0.rows.join(' ')));
 ok('the measurable one still gets a verdict', !!r0.verdict, r0.verdict);

 console.log('\nthe endpoint is the slow part — high cost per request, link fine');
 await set({overhead:5000,bps:5e6,originMs:30,dead:false});
 let r=await run();
 ok('it blames the destination, not the signal', /destination is the slow part/i.test(r.verdict), r.verdict);
 ok('and says smaller photographs are not the lever', /barely help/i.test(r.detail));
 ok('it shows the per-request cost separately from the speed',
    r.rows.some(x=>/cost per request/.test(x)) && r.rows.some(x=>/speed once it starts/.test(x)),
    r.rows.filter(x=>/cost|speed/.test(x)).join('  |  '));

 console.log('\nthe link itself is slow — even a non-Google host crawls');
 await set({overhead:1500,bps:5e6,originMs:2000,dead:false});
 r=await run();
 ok('it blames the link, the VPN or where the phone is standing', /connection itself is slow/i.test(r.verdict), r.verdict);
 ok('and names the non-Google host as the evidence', /not Google/i.test(r.detail));

 console.log('\nrequests are cheap but the pipe is narrow');
 await set({overhead:120,bps:30*1024,originMs:30,dead:false});
 r=await run();
 ok('it blames the bytes', /not much of it|bandwidth/i.test(r.verdict), r.verdict);
 ok('and points at base64 and photo size', /base64/i.test(r.detail));

 console.log('\nnothing is wrong');
 await set({overhead:60,bps:5e6,originMs:25,dead:false});
 r=await run();
 ok('it says so plainly instead of inventing a problem', /healthy/i.test(r.verdict), r.verdict);
 ok('and predicts a round so it can be checked against reality',
    /ten photographs/i.test(r.rows.join(' ')), r.rows.filter(x=>/photograph/.test(x)).join('  |  '));
 ok('there is something to send to IT', r.copy);

 console.log('\nthe route refuses to carry it — link fine, destination blocked');
 await set({overhead:60,bps:5e6,originMs:25,dead:true,status:0,hang:false});
 r=await run();
 ok('it still reaches a verdict instead of leaving red rows and silence',
    !!r.verdict, r.verdict||'(nothing said)');
 ok('and calls it a block, not slowness', /refusing to carry/i.test(r.verdict), r.verdict);
 ok('with the reason the browser gave, not a shrug',
    /failed to fetch|network|load failed/i.test(r.rows.join(' ')), r.rows.join('  |  '));
 ok('and something to send on', r.copy);

 console.log('\nthe destination answers, and says no');
 await set({overhead:60,bps:5e6,originMs:25,dead:false,status:403,hang:false});
 r=await run();
 ok('a reply is told apart from silence', /answered, and said no/i.test(r.verdict), r.verdict);
 ok('and the status is on the screen', /403/.test(r.rows.join(' ')), r.rows.join('  |  '));
 ok('it points at the setup, not the link', /URL|secret|deployment/i.test(r.detail));

 console.log('\nthe requests go out and nothing comes back');
 await set({overhead:60,bps:5e6,originMs:25,dead:false,status:0,hang:true});
 r=await run();
 ok('swallowed traffic is its own verdict', /nothing comes back/i.test(r.verdict), r.verdict);
 ok('and it says smaller photographs will not help', /will not improve|not improve/i.test(r.detail));
 await set({overhead:60,bps:5e6,originMs:25,dead:false,status:0,hang:false});

 /* The reading that came back from the mine on 3 Aug: 842 ms to the app's own
    host, 3806 ms of overhead, 118 KB/s. The old chain of absolute cutoffs called
    that "healthy" because 3806 was under its 4000 — seven seconds a photograph,
    and the screen told the reader nothing was wrong. */
 console.log('\nthe reading that came back from the mine');
 await set({overhead:3806,bps:118*1024,originMs:842,dead:false,status:0,hang:false});
 r=await run();
 ok('it does NOT call seven seconds a photograph healthy', !/healthy/i.test(r.verdict), r.verdict);
 ok('it blames the waiting, which is most of it', /destination is the slow part/i.test(r.verdict), r.verdict);
 ok('and says so as a share, not an adjective', /%/.test(r.detail),
    (r.detail.match(/[^.]*%[^.]*\./)||[''])[0].trim());
 ok('the split is on the screen, waiting against sending',
    /waiting/.test(r.rows.join(' ')) && /sending/.test(r.rows.join(' ')),
    r.rows.filter(x=>/of which/.test(x)).join(''));
 ok('and it points at fewer requests, not smaller photographs',
    /fewer requests/i.test(r.detail) && /barely help/i.test(r.detail));

 console.log('\nwith no signal at all');
 await p.context().setOffline(true);
 r=await run();
 /* t() falls back to the key when a phrase is missing, so a missing key does
    not crash — it puts "sp_link" on the screen in front of an inspector. */
 ok('it says there is no signal, in words', /no signal/i.test(r.rows.join(' ')), r.rows.join(' | '));
 ok('and no row is showing a phrase key instead of a phrase',
    !/\bsp_[a-z_]+\b/.test(r.rows.join(' ')+r.verdict+r.detail), r.rows.join(' | '));
 await p.context().setOffline(false);

 console.log('\nand it is bilingual');
 await set({overhead:60,bps:5e6,originMs:25,dead:false});
 await p.evaluate(()=>document.querySelector('[data-lang="ru"]').click());
 await p.waitForTimeout(300);
 r=await run();
 ok('the verdict is in Russian on a Russian phone', /[Ѐ-ӿ]/.test(r.verdict), r.verdict);

 await b.close();
 console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
 process.exit(fails.length?1:0);
});
