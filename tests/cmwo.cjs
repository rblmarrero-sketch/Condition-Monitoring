/* DEFECTS RAISED BY THE CONDITION MONITORING TEAM — the office's panel.

   Two sides of one story live in WO.xlsx. The "N Hours service Planned" rows
   are the inspections being ASKED FOR; after walking one the team writes up a
   DEFECT. The office asked how many they have written since the kick-off on
   1 July, so the two must not be added together — a request for work is not a
   finding about a machine.

   What this suite guards, and why each line is here:

   1. THE COUNT IS DEFECTS, NEVER DEFECTS PLUS SERVICES. That is the whole
      question the panel exists to answer, and it is one addition away from
      being wrong.
   2. THE COLUMNS ARE 1C'S OWN VALUES. This app decides WHICH rows, and
      nothing else. A panel that quietly reformatted 1C's status or priority
      would be a second source of truth for a field 1C owns.
   3. A COLUMN THE INGESTER COULD NOT FIND IS SAID OUT LOUD. An empty cell
      reads as "1C left it blank"; it must never be able to mean "the
      ingester looked for a header that is not there". This is the project's
      signature defect and the only defence against it is that the panel
      SAYS which columns failed to resolve.
   4. AND AN ABSENT COLLECTION IS NOT AN EMPTY ONE. Before the hourly job
      runs the new ingest there are no rows at all, and "0 defects" would be
      a lie told confidently. It says the file has not been rebuilt yet.

   Run: node tests/cmwo.cjs   (starts its own server) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8463);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* Shaped exactly as ingest/ingest_work_orders.py writes it — and that shape
   is proven against a real workbook by the ingester's own run, not asserted
   twice here. */
const CM = {
  cmSince: '2026-07-01',
  cmPeople: ['Nurbol', 'Slam', 'Irek', 'Zhomart', 'Bekzhan'],
  /* 1C's real header spellings, corrected by the office — including
     "Equipmen type", which is missing its t in the workbook itself and which
     a normaliser cannot reach from "Equipment type". */
  cmColumns: { date: 'Date', asset: 'Asset', request: 'Work request number',
               eqType: 'Equipmen type', sysComp: 'System component',
               priority: 'Priority', defType: 'Defect Type',
               cause: 'WODefect cause', desc: 'Defect description',
               status: 'CMMSWork order status',
               person: 'Responsible person', wo: 'Work order number' },
  cmWorkOrders: [
    { date: '2026-09-05', asset: 'GR013', defect: null, requestNo: 'verbal request from pit supervisor',
      eqType: 'GRADER', system: 'WE.BKT', priority: 'P2', defectType: 'Vibration', descr: 'Cab vibration under load', cause: 'Unknown',
      status: 'Open', by: 'Irek', woNumber: 'WO-070004', maintType: 'Defect elimination', planned: false },
    { date: '2026-08-15', asset: 'EX021', defect: 'DD-000456', requestNo: 'DD-000456',
      eqType: 'EXCAVATOR, BUCKET', system: 'HS.PMP', priority: 'P3 Planned',
      defectType: 'Oil leak', descr: 'Oil weeping at pump seal', cause: 'Seal failure',
      status: 'Closed', by: 'Zhomart', woNumber: 'WO-070002', maintType: 'Defect elimination', planned: false },
    { date: '2026-07-01', asset: 'TK156', defect: 'DD-000123', requestNo: 'Request DD-000123 raised on plug round',
      eqType: 'TRUCK, DUMP', system: 'DRS.FDR', priority: 'P2 Urgent',
      defectType: 'Ferrous debris', descr: 'Metal particles on plug, 3mm', cause: 'Bearing wear',
      status: 'In progress', by: 'Nurbol', woNumber: 'WO-070001', maintType: 'Defect elimination', planned: false },
    /* A planned service one of the five is responsible for. NOT a defect. */
    { date: '2026-09-10', asset: 'TK156', defect: null, requestNo: null,
      eqType: 'TRUCK, DUMP', system: null, priority: 'P3 Planned (PM)',
      defectType: null, descr: null, cause: null,
      status: 'Open', by: 'Bekzhan', woNumber: 'WO-070005',
      maintType: '250 Hours service Planned', planned: true },
  ],
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.end(fs.readFileSync(p));
});
const cells = p => p.$$eval('#cwList tbody tr', rs => rs.map(r =>
  [...r.querySelectorAll('td')].map(c => c.textContent.replace(/\s+/g, ' ').trim())));

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/dashboard/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof renderCmWoTab === 'function', null, { timeout: 25000 });
  await p.evaluate(() => { try { document.getElementById('dataOv').classList.add('hidden'); } catch (e) {} });
  /* Opened FIRST, and everything below drives it as a person would. The
     panel rendered into a hidden section looks identical to a working one
     from the outside, and typing into an invisible input is not a test of
     the control an inspector actually touches. */
  await p.click('[data-tab="cmwo"]');
  await p.waitForTimeout(300);

  console.log('\n1. AN ABSENT COLLECTION IS NOT AN EMPTY ONE');
  const before = await p.evaluate(() => {
    delete window.CM_WO_DATA.cmWorkOrders;
    renderCmWoTab();
    return { text: document.getElementById('cwList').textContent.trim(),
             kpis: document.querySelectorAll('#cwKpis .kpi').length };
  });
  ok('with no collection in the file the panel says so rather than showing zero',
     /rebuilt hourly|next pull/i.test(before.text), before.text.slice(0, 90));
  ok('  and shows no count at all — "0 defects" would be a confident lie',
     before.kpis === 0, before.kpis + ' tiles');

  console.log('\n2. THE COUNT IS DEFECTS, NOT DEFECTS PLUS SERVICES');
  await p.evaluate(d => { Object.assign(window.CM_WO_DATA, d); renderCmWoTab(); }, CM);
  const kpi = await p.evaluate(() => [...document.querySelectorAll('#cwKpis .kpi')].map(k => ({
    k: (k.querySelector('.k') || {}).textContent, v: (k.querySelector('.v') || {}).textContent })));
  const total = kpi[0] || {};
  ok('the headline counts the three defects', total.v === '3',
     total.k + ' = ' + total.v);
  ok('  the planned service one of them is responsible for is NOT in it',
     total.v !== '4', 'four would mean a service had been counted as a finding');
  const per = Object.fromEntries(kpi.slice(1).map(x => [x.k, x.v]));
  ok('  and it is broken down by person, all five named even at zero',
     JSON.stringify(per) === '{"Nurbol":"1","Slam":"0","Irek":"1","Zhomart":"1","Bekzhan":"0"}',
     JSON.stringify(per));

  console.log('\n3. THE ROWS ARE 1C\'S OWN VALUES');
  let rows = await cells(p);
  ok('three rows, newest first', rows.length === 3 && rows[0][0] === '2026-09-05',
     rows.map(r => r[0]).join(' '));
  const tk = rows.find(r => r[1] === 'TK156') || [];
  ok('  the defect number is the code out of the work request reference',
     tk[2] === 'DD-000123', tk[2]);
  ok('  and every other column is 1C\'s value, unaltered',
     tk[3] === 'TRUCK, DUMP' && tk[4] === 'DRS.FDR' && tk[5] === 'P2 Urgent'
     && tk[6] === 'Ferrous debris' && tk[7] === 'Metal particles on plug, 3mm'
     && tk[8] === 'Bearing wear' && tk[9] === 'In progress' && tk[10] === 'Nurbol',
     tk.join(' | '));
  ok('  including the description the inspector typed',
     tk[7] === 'Metal particles on plug, 3mm', tk[7]);
  /* A HEADING OVER EVERY COLUMN, AND THE RIGHT ONE. The description column
     shipped in 342 with its cells and without its <th>, so every heading
     from "Cause of defect" on sat one column to the left of its data —
     "Status" over the cause, "Raised by" over the status, and the person's
     name under nothing. Reported from the office with the table circled.
     Read by what the cells ARE: the heading count must equal the cell
     count, and the heading over the description cell must SAY description. */
  /* Since the sort/filter header (§7b below) the label row is the FIRST of
     two <tr>s in <thead> — the second carries one bare filter <input> per
     column, no text of its own — so the label count is read off that first
     row alone, and its own arrow glyph (▲/▼/↕) is stripped before comparing
     text, the same reason fleetTbl's own tests read `.dataset.sort` rather
     than trusting textContent verbatim. */
  const hdr = await p.evaluate(() => ({
    ths: [...document.querySelectorAll('#cwList thead tr:first-child th')].map(x => x.textContent.replace(/[▲▼↕]$/,'').trim()),
    tds: document.querySelector('#cwList tbody tr') ? document.querySelector('#cwList tbody tr').querySelectorAll('td').length : 0,
    want: t('cw_c_descr'), cause: t('cw_c_cause'), by: t('cw_c_by') }));
  ok('  every column has a heading — as many headings as cells', hdr.ths.length === hdr.tds && hdr.tds > 0,
     hdr.ths.length + ' headings over ' + hdr.tds + ' cells');
  ok('  and the heading over the description is "' + hdr.want + '", the cause\'s is the cause\'s, the last is Raised by',
     hdr.ths[7] === hdr.want && hdr.ths[8] === hdr.cause && hdr.ths[10] === hdr.by, hdr.ths.join(' | '));
  ok('  including the system component the office asked to see',
     tk[4] === 'DRS.FDR', tk[4]);
  /* A reference with no code keeps its row and shows what IS there. */
  const gr = rows.find(r => r[1] === 'GR013') || [];
  ok('a reference with no code still gets a row, showing the text 1C holds',
     /verbal request/i.test(gr[2] || ''), gr[2]);

  console.log('\n4. THE FILTERS, AND THE PLANNED SERVICES BEHIND A SWITCH');
  await p.evaluate(() => { document.getElementById('cwPlanned').checked = true; renderCmWoTab(); });
  rows = await cells(p);
  ok('showing planned services adds the fourth row', rows.length === 4, rows.length + ' rows');
  const kpiAfter = await p.evaluate(() =>
    (document.querySelector('#cwKpis .kpi .v') || {}).textContent);
  ok('  but the headline still counts three — the count is of defects',
     kpiAfter === '3', kpiAfter);
  ok('  and the service row says what it is rather than showing a blank type',
     (rows.find(r => r[10] === 'Bekzhan') || [])[6] === 'planned service',
     JSON.stringify(rows.find(r => r[10] === 'Bekzhan')));
  await p.evaluate(() => { document.getElementById('cwPlanned').checked = false; renderCmWoTab(); });

  await p.evaluate(() => { document.querySelector('#cwKpis [data-cwwho="Irek"]').click(); });
  rows = await cells(p);
  ok('tapping a person narrows to theirs', rows.length === 1 && rows[0][10] === 'Irek',
     rows.map(r => r[10]).join(' '));
  await p.evaluate(() => { document.querySelector('#cwKpis [data-cwwho="Irek"]').click(); });

  await p.fill('#cwQ', 'DD-000456');
  await p.waitForTimeout(200);
  rows = await cells(p);
  ok('search finds a defect by its number', rows.length === 1 && rows[0][1] === 'EX021',
     rows.map(r => r[1]).join(' '));
  await p.fill('#cwQ', 'HS.PMP');
  await p.waitForTimeout(200);
  rows = await cells(p);
  ok('  and by its system component', rows.length === 1 && rows[0][1] === 'EX021',
     rows.map(r => r[1]).join(' '));
  await p.fill('#cwQ', 'particles on plug');
  await p.waitForTimeout(200);
  rows = await cells(p);
  ok('  and by words in the description', rows.length === 1 && rows[0][1] === 'TK156',
     rows.map(r => r[1]).join(' '));
  await p.fill('#cwQ', 'bearing');
  await p.waitForTimeout(200);
  rows = await cells(p);
  ok('  and by its cause', rows.length === 1 && rows[0][1] === 'TK156', rows.map(r => r[1]).join(' '));
  await p.fill('#cwQ', '');
  await p.waitForTimeout(200);

  /* THE STATUS LIST COMES FROM THE DATA. 1C's vocabulary changes without
     telling anybody, and an option typed here that no longer matches would
     filter everything away in silence. */
  const opts = await p.evaluate(() =>
    [...document.querySelectorAll('#cwStatus option')].map(o => o.value));
  ok('the status filter is built from the statuses actually present',
     JSON.stringify(opts) === '["","Closed","In progress","Open"]', JSON.stringify(opts));

  console.log('\n5. A COLUMN THE INGESTER COULD NOT FIND IS SAID OUT LOUD');
  const warn = await p.evaluate(() => {
    window.CM_WO_DATA.cmColumns = Object.assign({}, window.CM_WO_DATA.cmColumns,
      { cause: null, defType: null });
    renderCmWoTab();
    return document.getElementById('cwWarn').textContent.trim();
  });
  ok('the panel names the fields whose column was not found',
     /cause/.test(warn) && /defType/.test(warn), warn.slice(0, 120));
  ok('  and says a blank cell means the column is missing, not that 1C left it empty',
     /not because|not found/i.test(warn), warn.slice(0, 140));
  const clean = await p.evaluate(d => {
    window.CM_WO_DATA.cmColumns = d.cmColumns; renderCmWoTab();
    return document.getElementById('cwWarn').textContent.trim();
  }, CM);
  ok('  and says nothing at all when every column resolved', clean === '', clean);

  console.log('\n6. THE TAB IS REACHABLE AND THE EXPORT IS WHAT IS ON SCREEN');
  ok('the tab opens', await p.evaluate(() =>
    !document.getElementById('tab-cmwo').classList.contains('hidden')));
  ok('  and its heading is in words, not a key',
     !/^cw_/.test((await p.textContent('#tab-cmwo h1')).trim()),
     (await p.textContent('#tab-cmwo h1')).trim());
  ok('  the subtitle names the five people and the kick-off date',
     /Nurbol/.test(await p.textContent('#cwSub')) && /2026-07-01/.test(await p.textContent('#cwSub')),
     (await p.textContent('#cwSub')).slice(0, 110));
  ok('the export follows the filters rather than dumping the collection',
     await p.evaluate(() => { document.getElementById('cwQ').value = 'EX021'; renderCmWoTab();
                              return cwRows().length; }) === 1);

  console.log('\n7. THE GLOBAL FILTER BAR DOES NOT SIT ABOVE A TABLE IT DOES NOT TOUCH');
  /* Reported from the field as "filters and search are not working": the
     Type/Class/Grade/Period/Status/Search bar at the top of every page reads
     RECS, and this tab reads 1C's own work-order export instead — so the bar
     stayed visible showing "N of M inspections" and an active search chip
     that touched nothing on the table below. showTab()'s own `own` list
     already puts that bar away for Due/Lube/Sync/Reports/Plan vs Actual;
     cmwo was left off it. */
  let barState = await p.evaluate(() => ({
    bar: document.querySelector('main > .controls:not(.more)').classList.contains('hidden'),
    chips: document.getElementById('chips').classList.contains('hidden') }));
  ok('the global bar is put away on Defects raised, the same as Due/Lube/Sync',
     barState.bar === true, JSON.stringify(barState));
  ok('  and so are its filter chips', barState.chips === true, JSON.stringify(barState));
  await p.click('[data-tab="overview"]');
  await p.waitForTimeout(150);
  barState = await p.evaluate(() => ({
    bar: document.querySelector('main > .controls:not(.more)').classList.contains('hidden') }));
  ok('  and it comes back on a tab the bar actually narrows',
     barState.bar === false, JSON.stringify(barState));
  await p.click('[data-tab="cmwo"]');
  await p.waitForTimeout(150);

  console.log('\n8. A SHORT QUERY MATCHES A WORD, NOT THE MIDDLE OF ONE');
  /* "DR" for the DR-prefixed drills also pulled in machines with nothing to
     do with drills, because "DR" sits inside "Hydraulic Pumps" and inside
     "EX004.DRS.ENG" is a legitimate word-start match (a real system code)
     while the same two letters landing mid-"Hydraulic" is not. */
  const WORDMATCH = {
    cmSince: '2026-07-01', cmPeople: ['Nurbol', 'Slam', 'Irek', 'Zhomart', 'Bekzhan'],
    cmColumns: CM.cmColumns,
    cmWorkOrders: [
      { date: '2026-09-23', asset: 'DR007', defect: 'DD-00012847', requestNo: 'DD-00012847',
        eqType: 'DRILL, BLASTING', system: 'DR007.CH (Structure & Chassis)', priority: 'P2 Urgent',
        defectType: 'Excessive play', descr: 'Play in the mast frame joint', cause: 'Fatigue crack',
        status: 'Registered', by: 'Irek', woNumber: null, maintType: null, planned: false },
      { date: '2026-09-23', asset: 'EX019', defect: 'DD-00013195', requestNo: 'DD-00013195',
        eqType: 'EXCAVATOR, BUCKET', system: 'EX019.HS.MP (Hydraulic Pumps)', priority: 'P4 Planned (Repair)',
        defectType: 'Leakage', descr: 'Leak under the pump', cause: 'Seal damaged',
        status: 'Registered', by: 'Irek', woNumber: null, maintType: null, planned: false },
      { date: '2026-09-23', asset: 'EX004', defect: 'DD-00013198', requestNo: 'DD-00013198',
        eqType: 'EXCAVATOR, BUCKET', system: 'EX004.DRS.ENG (Engine)', priority: 'P4 Planned (Repair)',
        defectType: 'Crack', descr: 'Cracks in the alternator belts', cause: 'Fatigue crack',
        status: 'Registered', by: 'Irek', woNumber: null, maintType: null, planned: false },
    ],
  };
  await p.evaluate(d => { Object.assign(window.CM_WO_DATA, d); cwWho = ''; renderCmWoTab(); }, WORDMATCH);
  await p.fill('#cwQ', 'DR');
  await p.waitForTimeout(200);
  rows = await cells(p);
  ok('a drill named DR007 matches', rows.some(r => r[1] === 'DR007'), rows.map(r => r[1]).join(' '));
  ok('  a system code that genuinely starts with DR (EX004.DRS.ENG) matches too',
     rows.some(r => r[1] === 'EX004'), rows.map(r => r[1]).join(' '));
  ok('  but "Hydraulic Pumps" does not — DR sits mid-word, not at its start',
     !rows.some(r => r[1] === 'EX019'), rows.map(r => r[1]).join(' '));
  ok('  exactly the two real matches, nothing else', rows.length === 2, rows.length + ' rows');
  await p.fill('#cwQ', '');
  await p.waitForTimeout(150);

  console.log('\n9. SORT AND A FILTER PER COLUMN, IN THE HEADER ITSELF');
  /* "we need filter and sor as well why cant we just put a searh/filer on
     top of the header" — cwQ (§8) searches nine fields at once and cannot
     ask for the Asset column alone; a filter typed into the Asset header
     reads ONLY the Asset column, so "DR" there finds DR007 without also
     pulling in EX004's unrelated "DRS.ENG" system code. Still using
     WORDMATCH's three rows (DR007, EX019, EX004). */
  await p.evaluate(() => { document.querySelector('.cwcf[data-k="asset"]').value = 'DR'; document.querySelector('.cwcf[data-k="asset"]').dispatchEvent(new Event('input')); });
  await p.waitForTimeout(150);
  rows = await cells(p);
  ok('an Asset-column filter of "DR" finds only the asset actually named DR007',
     rows.length === 1 && rows[0][1] === 'DR007', rows.map(r => r[1]).join(' '));
  ok('  EX004\'s own DRS.ENG system code does not leak into a different column\'s filter',
     !rows.some(r => r[1] === 'EX004'), rows.map(r => r[1]).join(' '));
  await p.evaluate(() => { document.querySelector('.cwcf[data-k="asset"]').value = ''; document.querySelector('.cwcf[data-k="asset"]').dispatchEvent(new Event('input')); });
  await p.waitForTimeout(150);

  console.log('\n  clicking a column header sorts by it, reusing the fleet table\'s own sortable-column pattern');
  await p.click('#cwList th[data-sort="asset"]');
  await p.waitForTimeout(150);
  rows = await cells(p);
  ok('ascending by Asset', rows.map(r => r[1]).join(',') === 'DR007,EX004,EX019', rows.map(r => r[1]).join(' '));
  await p.click('#cwList th[data-sort="asset"]');
  await p.waitForTimeout(150);
  rows = await cells(p);
  ok('  clicking again reverses it', rows.map(r => r[1]).join(',') === 'EX019,EX004,DR007', rows.map(r => r[1]).join(' '));
  await p.click('#cwList th[data-sort="date"]');
  await p.waitForTimeout(150);

  console.log('\n  a filter input survives its own rebuild — typing a second character does not land on thin air');
  /* This table is rebuilt wholesale (innerHTML) on every keystroke, the same
     way it always has been for cwQ — the one new risk a filter INSIDE that
     rebuilt table adds is losing focus after the first character, which
     would read to an inspector as a box that accepts one letter and then
     stops responding. page.type() dispatches one real keystroke at a time,
     the only way to catch that class of bug. */
  await p.click('.cwcf[data-k="system"]');
  await p.type('.cwcf[data-k="system"]', 'DRS', { delay: 60 });
  await p.waitForTimeout(150);
  const typed = await p.evaluate(() => {
    const el = document.querySelector('.cwcf[data-k="system"]');
    return { value: el ? el.value : null, focused: document.activeElement === el };
  });
  ok('all three keystrokes landed in the input, not just the first',
     typed.value === 'DRS', JSON.stringify(typed));
  ok('  and the input still holds focus after rebuilding around it',
     typed.focused === true, JSON.stringify(typed));
  rows = await cells(p);
  ok('  and it actually filtered — EX004\'s own DRS.ENG system code, not the other two',
     rows.length === 1 && rows[0][1] === 'EX004', rows.map(r => r[1]).join(' '));
  await p.evaluate(() => { document.querySelector('.cwcf[data-k="system"]').value = ''; document.querySelector('.cwcf[data-k="system"]').dispatchEvent(new Event('input')); });
  await p.waitForTimeout(150);

  await p.evaluate(() => { cwColQ = {}; cwSort = { k: 'date', dir: -1 }; });
  await p.evaluate(d => { Object.assign(window.CM_WO_DATA, d); cwWho = ''; renderCmWoTab(); }, CM);

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close(); server.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); process.exit(1); });
