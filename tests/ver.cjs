/* The version banner said v53 on a v54 build, because it was hand-typed while the
   bump only touched the ?v= tags and BUILD. Anyone checking whether a deploy
   landed reads that line, so it has to come from BUILD. */
const { chromium } = require(require('./pw.cjs'));
const fails=[]; const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); if(!c)fails.push(n);};
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
  const p=await ctx.newPage();
  p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
  await p.addInitScript(()=>localStorage.setItem('up_dests','[]'));
  await p.goto('http://127.0.0.1:8093/mobile/index.html',{waitUntil:'load'});
  await p.waitForTimeout(1700);
  const BUILD = await p.evaluate(()=>BUILD);
  const banner = (await p.textContent('.ver')||'').replace(/\s+/g,' ').trim();
  ok('the banner names a version', /build v\d+/.test(banner), banner);
  ok('and it is the build that is actually running',
     banner.includes('build v'+BUILD), `banner="${banner}" BUILD=${BUILD}`);
  ok('no hand-typed version is left in the markup',
     !/build v5[0-9]/.test(await p.evaluate(()=>document.getElementById('verLine').innerHTML
        .replace(/<span id="verNum">[^<]*<\/span>/,''))));
  const sw = await (await fetch('http://127.0.0.1:8093/mobile/sw.js')).text();
  const swb = (sw.match(/const BUILD *= *"([^"]+)"/)||[])[1];
  ok('the service worker is on the same build', swb===BUILD, `sw=${swb} page=${BUILD}`);
  const tags = await p.$$eval('script[src]', s=>s.map(x=>x.getAttribute('src')));
  const vs=[...new Set(tags.map(t=>(t.match(/[?&]v=([^&]+)/)||[])[1]).filter(Boolean))];
  ok('every asset tag is on that build too', vs.length===1&&vs[0]===BUILD, vs.join(','));
  ok('the new data files are among them',
     tags.some(t=>/^wear\.js/.test(t)) && tags.some(t=>/^wear-figs\.js/.test(t)));
  ok('and the service worker precaches them',
     /wear\.js\?v=/.test(sw) && /wear-figs\.js\?v=/.test(sw));
  ok('the update link is still there for a stale phone', await p.$('#forceUpdate')!==null);

  /* index.html and report-core.js are one program in two files. A browser
     holding a fresh page and a cached engine prints a report belonging to
     neither build, so the dashboard's tags have to move with the phone's. */
  const dash = await ctx.newPage();
  await dash.setViewportSize({width:1440,height:960});
  await dash.goto('http://127.0.0.1:8093/dashboard/index.html',{waitUntil:'load'});
  await dash.waitForTimeout(1200);
  const dtags = await dash.$$eval('script[src]', s=>s.map(x=>x.getAttribute('src')));
  const shared = dtags.filter(t=>/^\.\.\/mobile\/|^\.\.\/data\/|^drive\.js|^report\.js/.test(t));
  const unver = shared.filter(t=>!/[?&]v=/.test(t));
  ok('every file the dashboard shares with the phone is versioned',
     shared.length>0 && unver.length===0, unver.join(' '));
  const dvs=[...new Set(shared.map(t=>(t.match(/[?&]v=([^&]+)/)||[])[1]).filter(Boolean))];
  ok('and on the phone\'s build, so the two ends cannot drift',
     dvs.length===1 && dvs[0]===BUILD, `dashboard=${dvs.join(',')} phone=${BUILD}`);
  ok('the report engine is one of them',
     shared.some(t=>/report-core\.js\?v=/.test(t)), shared.join(' '));
  ok('the dashboard runs the same engine the phone does',
     await dash.evaluate(()=>!!(window.CMR&&CMR.sections)));
  await p.evaluate(()=>openSettings());   // the diagnostic line is written when settings open
  await p.waitForTimeout(400);
  const diag = await p.textContent('#setDiag').catch(()=>'');
  ok('the system page agrees', (diag||'').includes('build v'+BUILD), diag);
  await b.close();
  console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
  process.exit(fails.length?1:0);
})();
