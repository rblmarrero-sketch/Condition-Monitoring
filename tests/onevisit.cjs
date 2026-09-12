/* ONE VISIT, SEVERAL ROUNDS — the inspector answers the machine once.

   A service tier includes the tiers below it, so one work order can call for
   four rounds at one machine: TK156's 4,000 h order is Filter Cut, General
   Inspection, Magnetic Plug and Dump Body Liner. Every round requires its own
   overview photograph (machineSlots) and its own hour-meter reading, so that
   truck had somebody photographing the same machine four times and typing the
   same SMU four times, in a glove, at −40, to record one visit.

   The rounds stay four records — the folder, the due dates, the history and
   every report key on unit|date|type, and a merged record would be a fifth
   kind of thing all of them have to learn. What changes is what the INSPECTOR
   does twice.

   What this suite holds, and why each line is here rather than trusted:

   1. THE OFFER IS REAL AND IT IS THE RIGHT ONES. Not the round just saved,
      not one already walked today, not one the site has taken off this
      machine. A screen that offers work already done is how one visit
      becomes two records.
   2. THE CARRY IS REAL. Hours, date, inspector, supervisor and the fix
      arrive in the next round — asserted by reading the fields, not by
      trusting the call.
   3. THE PHOTOGRAPH IS CARRIED AND IS ITS OWN. Same bytes (so it is the
      same picture of the same machine) and a DIFFERENT attachment id (so
      two records are not claiming one photograph — the id lives in the
      blob's filename, and sharing one would leave whichever uploaded second
      reconciled against the first).
   4. AND IT ACTUALLY UNBLOCKS THE SAVE. photoGaps is what stops a round
      being saved without its overview; if the carried photograph does not
      satisfy it, every word above is decoration and the inspector still
      photographs the machine again.
   5. ONLY WHAT THE ROUND ASKS FOR. A dump-body photograph must not ride
      along into a plug round — that is an upload of a picture nothing on
      that round is about, on a link that cannot spare it.

   Run: node tests/onevisit.cjs   (starts its own server) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8461);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const today = new Date().toISOString().slice(0, 10);

/* TK156 is a haul truck and this is its real shape: one 4,000 h order that
   resolves to four rounds. KM001 stands in for a KAMAZ — held off three of
   the four — so the offer can be shown to respect that rather than listing
   whatever 1C planned. */
const FIXTURE = {
  generated: new Date().toISOString(),
  byUnit: {
    TK156: [{ wo: 'WO-015691', hours: 4000, types: ['FC', 'INSP', 'MP', 'TB'], plan: today, priority: 'P3 Planned (PM)' }],
    TK001: [{ wo: 'WO-020101', hours: 250, types: ['MP'], plan: today, priority: 'P3 Planned (PM)' }],
  },
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/data/schedule_slim.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(FIXTURE));
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    localStorage.setItem('up_dests', '[]');
    /* The schedule is fetched only when something needs it — the agenda or
       the List toggle. Opening the Due pane is not enough on its own, and a
       suite that just waits would time out against working code. */
    localStorage.setItem('cm_due_view', 'week');
  });
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  /* The agenda fetches the schedule for itself; wait for it rather than
     racing it, or every assertion below tests an empty plan. */
  await p.evaluate(() => showPane('paneDue'));
  /* NOT window.SCHED — it is a top-level const/let, not a property of
     window, and reading it that way is undefined for ever. The same trap
     cost an hour on ASSET_BY in the Plan vs Actual work; it is written down
     here so the third time is cheaper. */
  await p.waitForFunction(() => typeof SCHED !== 'undefined' && SCHED && SCHED.byUnit && SCHED.byUnit.TK156,
    null, { timeout: 25000 });

  /* A saved round, built the way the app builds one: a machine photograph on
     the general pseudo-position, carrying a real attachment id and a
     category, because the carry reads both. */
  /* BUILT AND KEPT IN THE PAGE. A File does not survive evaluate()'s
     serialisation, so a record round-tripped through Node arrives with its
     photographs replaced by empty objects — and every assertion about
     carrying a photograph then measures the harness rather than the app.
     The first run of this suite did exactly that and reported five
     failures against working code. The record is therefore built in the
     page, kept on window, and only ever described across the boundary. */
  const mk = async (unit, type, extra) => p.evaluate(async ([unit, type, today, extra]) => {
    const shot = async cat => {
      const c = document.createElement('canvas'); c.width = c.height = 8;
      const g = c.getContext('2d'); g.fillStyle = cat === 'BODY' ? '#123456' : '#abcdef';
      g.fillRect(0, 0, 8, 8);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.7));
      return new File([blob], attNew() + '.jpg', { type: 'image/jpeg' });
    };
    const pos = { photos: [], att: {} };
    for (const cat of ['OVERVIEW'].concat(extra || [])) {
      const f = await shot(cat);
      pos.photos.push(f);
      setAttCat(pos, f, cat);
    }
    const rec = {
      equip: unit, type, date: today, cls: (ASSET_BY[unit] || {}).cls || 'HT',
      smu: '18450', by: 'R. Marrero', sup: 'S. Volkov',
      gps: { lat: 67.1, lon: 164.2, acc: 12 },
      positions: { __general: pos },
    };
    (window.__recs = window.__recs || {})[unit + '|' + type + '|' + (extra || []).join('')] = rec;
    return unit + '|' + type + '|' + (extra || []).join('');
  }, [unit, type, today, extra]);

  console.log('\n1. THE OFFER — what else this visit is for');
  const recKey = await mk('TK156', 'INSP');
  await p.evaluate(k => { window.__rec = window.__recs[k]; showSaved(window.__rec); }, recKey);
  const offer = await p.evaluate(() => ({
    shown: !document.getElementById('savedAlso').hidden,
    note: document.getElementById('savedAlso').textContent,
    buttons: [...document.querySelectorAll('#savedAlsoRow [data-also]')].map(b => b.dataset.also).sort(),
    labels: [...document.querySelectorAll('#savedAlsoRow [data-also]')].map(b => b.textContent.trim()),
  }));
  ok('the saved card offers the rest of the visit', offer.shown === true, offer.note);
  ok('  and it is the other three rounds, not the one just saved',
     JSON.stringify(offer.buttons) === '["FC","MP","TB"]', JSON.stringify(offer.buttons));
  ok('  each named as a round, not as a code',
     offer.labels.every(l => l && !/^\s*(FC|MP|TB)\s*$/.test(l)), offer.labels.join(' | '));
  ok('  and the note says the machine and how many are left',
     /TK156/.test(offer.note) && /\b3\b/.test(offer.note), offer.note);

  /* A round already walked today must not be offered, or one visit becomes
     two records for the same round. */
  const afterDone = await p.evaluate(() => {
    const h = {}; h['MP|TK156'] = { d: window.__rec.date, h: 18450 };
    localStorage.setItem('cm_hist', JSON.stringify(h));
    histCache = null;                 // drop the memo so histAll re-reads
    return visitRemaining(window.__rec).sort();
  }).catch(() => null);
  if (afterDone) {
    ok('a round already walked today is not offered again',
       !afterDone.includes('MP'), JSON.stringify(afterDone));
  }
  await p.evaluate(() => { localStorage.removeItem('cm_hist'); histCache = null; });

  console.log('\n2. AND THE ROUNDS THE SITE HAS TAKEN OFF THIS MACHINE ARE NOT OFFERED');
  const km = await p.evaluate(() => {
    const a = ASSETS.find(x => /KAMAZ/i.test(String(x.m || '') + ' ' + String(x.mk || '')) && x.cls === 'HT');
    if (!a) return null;
    SCHED.byUnit[a.n] = [{ wo: 'WO-9', hours: 4000, types: ['FC', 'INSP', 'MP', 'TB'],
                           plan: DUE.today(), priority: 'P3 Planned (PM)' }];
    return { unit: a.n, offered: [...visitRounds(a.n)].sort() };
  });
  ok('a KAMAZ is offered only the round it is still on',
     km && JSON.stringify(km.offered) === '["FC"]', km && km.unit + ' -> ' + JSON.stringify(km.offered));

  console.log('\n3. THE CARRY — what the inspector does not answer twice');
  const carried = await p.evaluate(() => {
    const before = (window.__rec.positions.__general.photos[0].name || '');
    const n = startNextRound(window.__rec, 'MP');
    const gen = (draft.positions || {}).__general || {};
    const got = (gen.photos || [])[0];
    return {
      copied: n,
      type: (document.getElementById('typeSel') || {}).value,
      unit: curEquip,
      smu: (document.getElementById('smu') || {}).value,
      date: (document.getElementById('date') || {}).value,
      by: (document.getElementById('inspector') || {}).value,
      sup: (document.getElementById('supName') || {}).value,
      gps: !!gps,
      pane: !document.getElementById('paneCapture').classList.contains('hidden'),
      cardHidden: document.getElementById('savedCard').classList.contains('hidden'),
      srcName: before,
      newName: (got && got.name) || '',
      cat: got ? attCat(gen, got) : '',
      size: got ? got.size : 0,
      srcSize: window.__rec.positions.__general.photos[0].size,
      gaps: photoGaps(draft, 'MP'),
    };
  });
  ok('the next round opens on the same machine, on the round chosen',
     carried.type === 'MP' && carried.unit === 'TK156', carried.unit + ' / ' + carried.type);
  ok('  the hours carry over', carried.smu === '18450', carried.smu);
  ok('  the date carries over', carried.date === today, carried.date);
  ok('  the inspector and supervisor carry over',
     carried.by === 'R. Marrero' && carried.sup === 'S. Volkov', carried.by + ' / ' + carried.sup);
  ok('  the position fix carries over', carried.gps === true, String(carried.gps));
  ok('  and the capture screen is open with the saved card gone',
     carried.pane === true && carried.cardHidden === true);

  console.log('\n4. THE PHOTOGRAPH — carried, and its own');
  ok('the machine photograph came with it', carried.copied === 1 && !!carried.newName,
     carried.copied + ' copied');
  ok('  it is the same picture', carried.size === carried.srcSize && carried.size > 0,
     carried.size + ' bytes vs ' + carried.srcSize);
  ok('  under a DIFFERENT attachment id — two records never claim one photograph',
     carried.newName !== carried.srcName && !!carried.newName,
     carried.srcName + '  ->  ' + carried.newName);
  ok('  and it is still an overview, not an unlabelled file', carried.cat === 'OVERVIEW', carried.cat);
  /* THE LINE THAT MAKES THE WHOLE THING WORTH ANYTHING. */
  ok('  so Save is no longer blocked for want of a machine photograph',
     Array.isArray(carried.gaps) && carried.gaps.length === 0, JSON.stringify(carried.gaps));

  console.log('\n5. ONLY WHAT THE ROUND ASKS FOR');
  const tbKey = await mk('TK156', 'INSP', ['BODY']);
  const tb = await p.evaluate(k => {
    /* A visit whose first round photographed the body as well. */
    const rec2 = window.__recs[k];
    startNextRound(rec2, 'MP');
    const mp = ((draft.positions || {}).__general || {}).photos || [];
    const mpCats = mp.map(f => attCat(draft.positions.__general, f)).sort();
    startNextRound(rec2, 'TB');
    const g = (draft.positions || {}).__general || {};
    const tbCats = (g.photos || []).map(f => attCat(g, f)).sort();
    return { mpCats, tbCats, tbGaps: photoGaps(draft, 'TB') };
  }, tbKey);
  ok('the plug round does not carry a dump-body photograph it has no use for',
     JSON.stringify(tb.mpCats) === '["OVERVIEW"]', JSON.stringify(tb.mpCats));
  ok('  while the body round carries both', JSON.stringify(tb.tbCats) === '["BODY","OVERVIEW"]',
     JSON.stringify(tb.tbCats));
  ok('  and the body round is not blocked either', tb.tbGaps.length === 0, JSON.stringify(tb.tbGaps));

  console.log('\n6. A MACHINE WITH NOTHING ELSE DUE IS NOT NAGGED');
  const alone = await p.evaluate(async () => {
    const r = { equip: 'TK001', type: 'MP', date: DUE.today(), cls: 'HT', smu: '1', positions: {} };
    showSaved(r);
    return { hidden: document.getElementById('savedAlso').hidden,
             rowHidden: document.getElementById('savedAlsoRow').hidden,
             left: visitRemaining(r) };
  });
  ok('a machine whose only planned round is the one just saved offers nothing',
     alone.hidden === true && alone.rowHidden === true && alone.left.length === 0,
     JSON.stringify(alone.left));

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close(); server.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); process.exit(1); });
