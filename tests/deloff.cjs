/* The shipped Apps Script has ADMIN_SECRET = '' — deletion is switched off, and
   the script says so plainly. The dashboard used to refuse first, with "the
   admin password is required", which sent people hunting for a password that
   does not exist. It has to let the request go and show the real answer. */
const { chromium } = require(require('./pw.cjs'));
const B='http://127.0.0.1:8092';
const fails=[]; const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};

async function open(p, unit){
  await p.evaluate(()=>showTab('equipment'));
  await p.waitForTimeout(300);
  await p.evaluate(u=>{ const s=document.getElementById('equipSel'); s.value=u;
    s.dispatchEvent(new Event('change')); }, unit);
  await p.waitForTimeout(500);
  await p.evaluate(()=>{ const b=document.querySelector('#history [data-edit]'); if(b) b.click(); });
  await p.waitForTimeout(600);
}

(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:1440,height:1000}});
  const app=await ctx.newPage();
  await app.addInitScript(()=>localStorage.setItem('up_dests','[]'));
  await app.goto(B+'/mobile/index.html',{waitUntil:'load'});
  await app.waitForFunction(()=>(document.getElementById('verNum')||{}).textContent!=='?',null,{timeout:20000});
  await app.waitForTimeout(400);
  const payload=await app.evaluate(async()=>{
    type='MP'; selectEquip('TK146'); const ks=items().map(x=>x.k).slice(0,3), o={};
    ks.forEach(k=>o[k]={grade:'A',sev:'NOF',photos:[],video:null});
    await dbPut({id:'d1',type:'MP',equip:'TK146',date:'2026-07-29',by:'I. Petrov',sup:'A. Sokolov',
      smu:'100',cls:'',gps:null,dev:'PH-01',sign:null,positions:o,created:'2026-07-29',up:0,upTo:{},rev:1});
    return (await dbAll()).map(recToExport);
  });

  const p=await ctx.newPage();
  p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
  await p.goto(B+'/dashboard/index.html',{waitUntil:'load'});
  await p.waitForTimeout(1800);
  await p.evaluate(x=>window.CMDash.importRecords(x), payload);
  // point the dashboard at the mock /exec, which has no admin secret set
  await p.evaluate(B=>{ localStorage.setItem('cm_drive_url', B+'/exec');
    localStorage.setItem('cm_drive_sec',''); }, B);
  await p.reload({waitUntil:'load'});
  await p.waitForTimeout(1800);
  await p.evaluate(x=>window.CMDash.importRecords(x), payload);
  await p.waitForTimeout(600);

  /* Test connection is what teaches the dashboard whether deletion is on. */
  await p.evaluate(()=>openData());
  await p.waitForTimeout(400);
  await p.evaluate(()=>document.getElementById('drvTest').click());
  await p.waitForTimeout(1500);
  await p.evaluate(()=>{ const x=document.getElementById('dataClose'); if(x) x.click(); });
  await p.waitForTimeout(300);
  ok('the script reports that deletion is off',
    await p.evaluate(()=>localStorage.getItem('cm_dash_candelete')==='0'),
    await p.evaluate(()=>localStorage.getItem('cm_dash_candelete')));

  await open(p,'TK146');
  ok('the edit panel opens', await p.evaluate(()=>!document.getElementById('editOv').classList.contains('hidden')));
  ok('the panel says deletion is off before anything is typed',
    /switched off/i.test(await p.evaluate(()=>(document.getElementById('edDelOff')||{}).textContent||'')),
    await p.evaluate(()=>((document.getElementById('edDelOff')||{}).textContent||'').slice(0,50)));

  await p.evaluate(()=>{ document.getElementById('edBy').value='R. Marrero';
    document.getElementById('edConfirm').value='TK146'; });
  /* Voiding and deleting live behind a deliberate opening now — they are not
     corrections and they were sitting in the flow of an ordinary edit. Open the
     danger zone the way a person has to. */
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.click('#edDelete');
  await p.waitForTimeout(1500);
  const msg = await p.evaluate(()=>document.getElementById('edMsg').textContent||'');
  console.log('  message: ' + msg.slice(0,110));
  ok('an empty password is not refused by the page itself',
    !/admin password is required/i.test(msg), msg.slice(0,60));
  ok('the script\'s own answer is what the user sees',
    /switched off/i.test(msg) || /ADMIN_SECRET/i.test(msg), msg.slice(0,80));
  ok('and nothing was deleted', (await p.evaluate(()=>RECS.length))>0);

  console.log('\n  the unit-number confirmation still guards a mis-click');
  await p.evaluate(()=>{ document.getElementById('edConfirm').value='WRONG'; });
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.click('#edDelete');
  await p.waitForTimeout(600);
  ok('a wrong unit number stops it before the request',
    /confirm/i.test(await p.evaluate(()=>document.getElementById('edMsg').textContent||'')),
    (await p.evaluate(()=>document.getElementById('edMsg').textContent||'')).slice(0,60));

  console.log('\n  and the panel changes its tune once a password is set');
  /* The other mock /exec has ADMIN_SECRET set — the same dashboard, pointed at a
     script where deletion IS on, must stop telling people it is off. */
  await p.evaluate(()=>{ localStorage.setItem('cm_drive_url','http://127.0.0.1:8093/exec');
                         localStorage.setItem('cm_drive_sec',''); });
  await p.reload({waitUntil:'load'});
  await p.waitForTimeout(1600);
  await p.evaluate(()=>openData());
  await p.waitForTimeout(400);
  await p.evaluate(()=>document.getElementById('drvTest').click());
  await p.waitForTimeout(1500);
  await p.evaluate(()=>{ const x=document.getElementById('dataClose'); if(x) x.click(); });
  await p.waitForTimeout(300);
  ok('a script with a password reports deletion is on',
    await p.evaluate(()=>localStorage.getItem('cm_dash_candelete')==='1'),
    await p.evaluate(()=>localStorage.getItem('cm_dash_candelete')));
  await p.evaluate(x=>window.CMDash.importRecords(x), payload);
  await p.waitForTimeout(500);
  await open(p,'TK146');
  const onNote = await p.evaluate(()=>((document.getElementById('edDelOff')||{}).textContent||''));
  ok('and the panel no longer says it is switched off', !/switched off/i.test(onNote), onNote.slice(0,60));
  ok('it says the password is the one in the Apps Script', /Apps Script/i.test(onNote), onNote.slice(0,60));

  console.log(fails.length?'\nFAILED: '+fails.length+'\n'+fails.join('\n'):'\nall green');
  await b.close(); process.exit(fails.length?1:0);
})().catch(e=>{console.log('FAIL harness: '+e.message);process.exit(1);});
