/* Editing, voiding and deleting from the dashboard, through the real Apps Script
   logic, and the void reaching the phone. */
const { chromium } = require(require('./pw.cjs'));
const B='http://127.0.0.1:8093', OUT=__dirname+'/out';
require('fs').mkdirSync(OUT,{recursive:true});
const fails=[];
const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:''));if(!c)fails.push(n);};
const seed=()=>fetch(B+'/__seed').then(r=>r.text());
const files=()=>fetch(B+'/__files').then(r=>r.json());
const edMsg=p=>p.textContent('#edMsg').then(s=>s.trim());
/* The bundled demo history also contains a TK146, on another date — matching on
   the unit alone picks that one and every assertion reads the wrong record. */
const KEY='TK146|2026-03-09|MP';
const rec=(p,k=KEY)=>p.evaluate(x=>CMDash.allRecs()
  .find(r=>`${r.equip}|${r.date}|${r.type}`===x)||null, k);
const item0=async p=>(await rec(p)).items[0];
const edSettled=p=>p.waitForFunction(()=>{
  const s=document.getElementById('edMsg').textContent.trim();
  return s && !/^(Saving|Deleting)/.test(s);},null,{timeout:20000});

async function dash(b){
  const ctx=await b.newContext({viewport:{width:1440,height:1000}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
  p.on('console',m=>{ if(m.type()==='error'&&!/ERR_|Failed to load resource/.test(m.text())) fails.push('CONSOLE '+m.text()); });
  await p.goto(B+'/dashboard/index.html',{waitUntil:'load'});
  await p.evaluate(u=>{ openData();
    document.getElementById('drvUrl').value=u; document.getElementById('drvSec').value=''; }, B+'/exec');
  await p.click('#drvGo');
  await p.waitForFunction(()=>/^(✅|❌|No inspections)/.test(
    document.getElementById('drvMsg').textContent.trim()),null,{timeout:20000});
  await p.click('#dataClose');
  return {ctx,p};
}
const openHist = async (p,unit) => {
  await p.click('nav.tabs button[data-tab="equipment"]'); await p.waitForTimeout(200);
  await p.evaluate(u => cmbSet('equipSel', u), unit); await p.waitForTimeout(300);
};

(async()=>{
  const b=await chromium.launch();
  await seed();

  console.log('loading');
  let {ctx,p}=await dash(b);
  ok('3 inspections came from Drive',(await p.evaluate(()=>CMDash.driveCount()))===3,
     String(await p.evaluate(()=>CMDash.driveCount())));

  console.log('\ncorrecting severity and recommendation');
  await openHist(p,'TK146');
  await p.click('[data-edit="TK146|2026-03-09|MP"]'); await p.waitForTimeout(300);
  ok('the panel names the inspection',/TK146/.test(await p.textContent('#edTitle')), await p.textContent('#edTitle'));
  await p.click('#edSave'); await edSettled(p);
  ok('it insists on a name first',/name/i.test(await edMsg(p)), await edMsg(p));
  await p.fill('#edBy','R. Marrero');
  /* THE ENGINEER CHANGES THE FINDING, AND THE SEVERITY FOLLOWS IT.

     This used to raise severity to Critical while leaving the grade at C — a
     deliberate override with a written reason. Severity is now derived from
     grade by one mapping everywhere, so the two can no longer be saved in
     contradiction: the engineer who re-reads the plug under magnification and
     concludes it is worse than it was graded changes the GRADE, which is the
     finding, and Critical follows. There is no severity control to disagree
     with it and nothing left to justify. */
  ok('severity is neither chosen nor shown — the grade is the assessment',
     (await p.$('[data-f="sev"][data-k="4C"]'))===null && (await p.$('[data-sevout="4C"]'))===null,
     'no severity control or read-out on the correction form');
  await p.selectOption('[data-f="grade"][data-k="4C"]','5');
  await p.waitForTimeout(150);
  ok('raising the grade asks for no reason',
     await p.$eval('[data-gwhy="4C"]', e => e.classList.contains('hidden')));
  await p.selectOption('[data-f="action"][data-k="4C"]','RA-06');   // matrix code for "repair immediately"
  await p.fill('[data-f="wo"][data-k="4C"]','N-771');
  await p.fill('#edNote','plug re-read under magnification');
  await p.click('#edSave'); await edSettled(p);
  ok('the correction saves',/✅/.test(await edMsg(p)), await edMsg(p));

  const item=await item0(p);
  ok('severity is now Critical',item.sev==='CRI',item.sev);
  ok('the recommendation changed',item.action==='RA-06'&&/Repair immediately/.test(item.actionLabel||''),
     `${item.action} / ${item.actionLabel}`);
  ok('the WO is set',item.wo==='N-771',item.wo);
  ok('the grade the engineer set is on the record, as a number',item.grade===5,item.grade);
  ok('what was not touched is untouched',item.defect==='Ferrous debris — heavy',item.defect);
  /* The mapped value is written beside the effective one and they agree,
     because there is now only one of them. */
  ok('the mapped severity and the one in use are the same',
     item.mapSev==='CRI'&&item.sev==='CRI',`${item.mapSev} mapped / ${item.sev} in use`);
  ok('nothing is recorded as an override any more',
     item.sevOverride===0&&!item.sevReason,
     `override=${item.sevOverride} reason="${item.sevReason||''}"`);
  ok('and the change of finding carries who and when',
     !!item.gradeBy&&!!item.gradeAt,`${item.gradeBy} · ${item.gradeAt}`);

  console.log('\nit is stored beside the inspection, not inside it');
  let f=await files();
  ok('a separate correction file exists',
     f.files.includes('_meta/TK146_09.03.2026_MP.edit.json'), f.files.join(' | '));
  ok('the original sidecar is untouched',
     f.files.includes('MP/2026-03/TK146_09.03.2026_MP.json'));

  console.log('\nit survives the phone re-uploading that record');
  await p.evaluate(async u=>{
    // exactly what a phone re-sync does: same file name, fresh content
    await fetch(u,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({name:'TK146_09.03.2026_MP.json',folder:'MP/2026-03',
        contentType:'application/json',
        // btoa is Latin1-only and the defect text has an em dash
        file:btoa(unescape(encodeURIComponent(JSON.stringify({type:'cm-inspection-entries',version:2,records:[{
          equip:'TK146',date:'2026-03-09',type:'MP',by:'B. Ivanov',cls:'HT',
          items:[{key:'4C',label:'Left Rear Final Drive',grade:'X',defect:'Ferrous debris — heavy',
                  defectCode:'DT14-03',cause:'Gear wear',action:'MON',actionLabel:'Monitor',wo:''}]}]}))))}) });
  }, B+'/exec');
  await p.click('#edClose'); await p.waitForTimeout(200);   // the panel would cover the sheet
  await p.evaluate(()=>openData()); await p.click('#drvFull');
  await p.waitForFunction(()=>/^(✅|❌)/.test(document.getElementById('drvMsg').textContent.trim()),null,{timeout:20000});
  await p.click('#dataClose'); await p.waitForTimeout(300);
  const after=await item0(p);
  ok('the phone\'s new grade came through — a letter off an old phone, read as 5',after.grade===5,after.grade);
  ok('and the correction still applies',after.sev==='CRI'&&after.wo==='N-771',
     `${after.sev} / ${after.wo}`);

  console.log('\nvoid');
  await p.click('nav.tabs button[data-tab="overview"]'); await p.waitForTimeout(300);
  const kpiBefore=await p.textContent('#kpis');
  await openHist(p,'TK146');
  await p.click('[data-edit="TK146|2026-03-09|MP"]'); await p.waitForTimeout(300);
  await p.fill('#edBy','R. Marrero');
  /* Voiding and deleting live behind a deliberate opening now — they are not
     corrections and they were sitting in the flow of an ordinary edit. Open the
     danger zone the way a person has to. */
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.click('#edVoid'); await edSettled(p);
  ok('a reason is required',/reason/i.test(await edMsg(p)), await edMsg(p));
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.fill('#edReason','duplicate of the round on the 10th');
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.click('#edVoid'); await edSettled(p);
  ok('the void saves',/✅/.test(await edMsg(p)), await edMsg(p));
  await p.click('#edClose'); await p.waitForTimeout(300);

  ok('the record still exists — nothing destroyed', (await rec(p))!==null);
  ok('but it is out of the counts', (await rec(p))._void===true);
  /* The headline strip is on the Overview page, and since build 254 a page
     is painted when it is shown — so it is read there, the way a reader does. */
  await p.click('nav.tabs button[data-tab="overview"]'); await p.waitForTimeout(300);
  const kpiAfter=await p.textContent('#kpis');
  ok('the KPIs changed',kpiBefore!==kpiAfter);
  // the fleet table shows one row per unit (latest inspection), and the bundled
  // TK146 is newer — so assert on the count of rows the filter yields instead
  const nVis=()=>p.evaluate(()=>CMDash.allRecs().filter(r=>!r._void).length);
  ok('the voided round is excluded from what the dashboard counts',
     (await p.evaluate(()=>{const k='TK146|2026-03-09|MP';
       return CMDash.allRecs().filter(r=>`${r.equip}|${r.date}|${r.type}`===k && !r._void).length;}))===0);
  await p.check('#fVoid'); await p.waitForTimeout(300);
  ok('"Show voided" is honoured by the filter',
     (await p.evaluate(()=>document.getElementById('fVoid').checked))===true);
  await p.uncheck('#fVoid'); await p.waitForTimeout(200);

  await openHist(p,'TK146');
  ok('history marks it VOID with the reason',
     /VOID/.test(await p.textContent('#history')) && /duplicate/.test(await p.textContent('#history')),
     (await p.textContent('#history')).replace(/\s+/g,' ').slice(0,90));

  console.log('\nun-void');
  await p.click('[data-edit="TK146|2026-03-09|MP"]'); await p.waitForTimeout(300);
  await p.fill('#edBy','R. Marrero');
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.click('#edUnvoid'); await edSettled(p);
  ok('it counts again', !(await rec(p))._void);
  ok('and the WO correction survived the round trip',(await item0(p)).wo==='N-771');

  console.log('\ndeletion refuses without the right things');
  await p.fill('#edBy','R. Marrero');
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.click('#edDelete'); await edSettled(p);
  ok('no typed confirmation -> refused',/Type “TK146”/.test(await edMsg(p)), await edMsg(p));
  /* An empty password is NOT refused by the page any more. On the shipped
     script ADMIN_SECRET is unset and deletion is off entirely; refusing here
     with "the admin password is required" sent people hunting for a password
     that does not exist. The request goes, and the script answers — here with
     a secret set, that answer is "wrong password". */
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.fill('#edConfirm','TK146');
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.click('#edDelete'); await edSettled(p);
  ok('an empty password reaches the script rather than the page refusing it',
    !/admin password is required/i.test(await edMsg(p)), await edMsg(p));
  ok('and the script rejects it', /wrong admin password/i.test(await edMsg(p)), await edMsg(p));
  ok('nothing was deleted', (await p.evaluate(()=>RECS.length))>0);
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.fill('#edAdmin','letmein');
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.fill('#edConfirm','');
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.click('#edDelete'); await edSettled(p);
  ok('no typed confirmation, even with the password -> refused',
    /Type “TK146”/.test(await edMsg(p)), await edMsg(p));
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.fill('#edConfirm','TK999');
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.click('#edDelete'); await edSettled(p);
  ok('the wrong unit typed -> refused',/Type “TK146”/.test(await edMsg(p)), await edMsg(p));
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.fill('#edConfirm','TK146');
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.fill('#edAdmin','wrong-password');
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.click('#edDelete'); await edSettled(p);
  ok('a wrong admin password -> refused by the server',/Wrong admin password/.test(await edMsg(p)), await edMsg(p));
  ok('and nothing was removed',(await files()).files.includes('MP/2026-03/TK146_09.03.2026_MP.json'));

  console.log('\ndeleting for real');
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.fill('#edAdmin','letmein');
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.fill('#edReason','test data');
  await p.evaluate(() => { const d = document.getElementById('edDanger'); if (d) d.open = true; });
  await p.waitForTimeout(120);
  await p.click('#edDelete'); await edSettled(p);
  ok('it reports what went to the trash',/moved to Drive's trash/.test(await edMsg(p)), await edMsg(p));
  f=await files();
  ok('the sidecar is gone',!f.files.some(x=>/TK146_09\.03\.2026_MP\.json$/.test(x)));
  ok('its photo is gone',!f.files.some(x=>/TK146_4C_09\.03\.2026_MP\.jpg$/.test(x)));
  ok('its correction marker is gone',!f.files.some(x=>/TK146_09\.03\.2026_MP\.edit\.json$/.test(x)));
  ok('nothing was purged — it is all in the trash',f.trashed.length>=3,`${f.trashed.length} trashed`);
  ok('the deletion is logged',f.files.some(x=>/^_meta\/deletions\/.*\.deleted\.json$/.test(x)),
     f.files.filter(x=>/_meta/.test(x)).join(' | '));
  ok('other units are untouched',f.files.some(x=>/TK147_10\.03\.2026_MP\.json$/.test(x))
     && f.files.some(x=>/TK148_11\.03\.2026_FC\.json$/.test(x)));
  ok('it vanished from the dashboard immediately',(await rec(p))===null);
  await p.screenshot({path:OUT+'/edit-panel.png'});
  await ctx.close();

  /* ---------- the phone ---------- */
  console.log('\nthe void reaches the phone');
  await seed();
  {
    const c2=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
    const ph=await c2.newPage();
    ph.on('pageerror',e=>fails.push('PAGEERROR(app) '+e.message));
    await ph.addInitScript(u=>localStorage.setItem('up_dests',JSON.stringify(
      [{id:'gas',on:true,url:u,sec:'',folder:'{TYPE}/{YYYY-MM}'}])), B+'/exec');
    await ph.goto(B+'/mobile/index.html',{waitUntil:'load'});
    await ph.waitForTimeout(1200);
    ok('the phone sees the team rounds',(await ph.evaluate(()=>teamAll().length))===3,
       String(await ph.evaluate(()=>teamAll().length)));
    /* Asked through the app's own accessor, not by reading the shape out of
       storage. This line used to compare the stored value with a date string,
       and it went red the day the index started carrying the hour meter
       alongside the date — not because the phone had forgotten TK146 was
       inspected, but because it now remembers more about it. */
    ok('and TK146 counts as done',
       (await ph.evaluate(()=>histDate(histAll()['MP|TK146'])))==='2026-03-09',
       String(await ph.evaluate(()=>JSON.stringify(histAll()['MP|TK146']))));

    // the office voids it
    await fetch(B+'/exec',{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({op:'edit',key:'TK146|2026-03-09|MP',by:'R. Marrero',
                           void:true,reason:'duplicate'})});
    await ph.evaluate(() => showPane('paneSystem'));
    await ph.click('#teamRefresh');
    await ph.waitForFunction(()=>{const s=document.getElementById('teamMsg').textContent.trim();
      return s && !/^Checking/.test(s);},null,{timeout:20000});
    ok('the phone drops it from the team list',(await ph.evaluate(()=>teamAll().length))===2,
       `${await ph.evaluate(()=>teamAll().length)} — ${await ph.textContent('#teamMsg')}`);
    ok('and says the office withdrew it',/withdrawn/.test(await ph.textContent('#teamMsg')),
       (await ph.textContent('#teamMsg')).trim());
    ok('TK146 no longer counts as inspected',
       !(await ph.evaluate(()=>histDate(histAll()['MP|TK146']))),
       String(await ph.evaluate(()=>JSON.stringify(histAll()['MP|TK146']))));
    ok('the other units are unaffected',
       (await ph.evaluate(()=>histDate(histAll()['MP|TK147'])))==='2026-03-10',
       String(await ph.evaluate(()=>JSON.stringify(histAll()['MP|TK147']))));
    await ph.evaluate(()=>selectEquip('TK146')); await ph.waitForTimeout(300);
    ok('and the capture screen stops claiming it was just done',
       await ph.evaluate(()=>document.getElementById('lastDone').classList.contains('hidden')));
    await c2.close();
  }

  console.log(fails.length?'\nFAILURES:\n  '+[...new Set(fails)].join('\n  '):'\nall edit/void/delete checks passed');
  await b.close();
  process.exit(fails.length?1:0);
})();
