/* ONE PLACE TO LOOK SOMETHING UP.

   Every screen had its own filter box and none answered the question somebody
   arrives with: what do we know about TK149, who owns the cracked bushing,
   which round carries work order 4471. Finding that meant knowing which tab
   keeps it first — knowledge about the software rather than about the machines.

   Checked at FLEET SIZE, because a search box is exactly the control that is
   fine on sixty-five records and freezes the page on a thousand. The scan is
   over loaded records, so the cost is real and the cap is what makes it safe.

   Run: node tests/gsearch.cjs        (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const note = (n, d) => console.log('  ....  ' + n + (d !== undefined ? '   ' + d : ''));
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());

(async () => {
  await reset('n=0');
  await reset('scale=600,600');

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem('cm_drive_url', u);
    localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0');
    localStorage.setItem('cm_swap_off', '1');
  }, BASE + '/exec');
  await p.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 500,
                          null, { timeout: 180000 });
  await p.waitForTimeout(3000);

  console.log('\n1. THE BOX IS THERE AND IT IS A SEARCH CONTROL');
  const shell = await p.evaluate(() => {
    const i = document.getElementById('gq');
    return i ? { type: i.type, role: i.getAttribute('role'),
                 controls: i.getAttribute('aria-controls'),
                 expanded: i.getAttribute('aria-expanded'),
                 ph: !!i.placeholder } : null;
  });
  console.log('   ' + JSON.stringify(shell));
  ok('the header carries a search field', !!shell);
  ok('  announced as a combobox', shell && shell.role === 'combobox', shell && shell.role);
  ok('  pointing at its result list', shell && shell.controls === 'gres', shell && shell.controls);
  ok('  and closed until it has something to say',
     shell && shell.expanded === 'false', shell && shell.expanded);

  console.log('\n2. IT FINDS A MACHINE, AND SAYS WHAT KIND OF THING IT FOUND');
  const unit = await p.evaluate(() => RECS[0].equip);
  const t0 = Date.now();
  await p.fill('#gq', unit);
  await p.waitForTimeout(700);
  const ms = Date.now() - t0;
  const res = await p.evaluate(() => {
    const box = document.getElementById('gres');
    return { open: !box.classList.contains('hidden'),
             groups: [...box.querySelectorAll('.gh')].map(h => h.textContent.split(' ·')[0].trim()),
             rows: box.querySelectorAll('button[data-g]').length,
             kinds: [...new Set([...box.querySelectorAll('button[data-g]')].map(b => b.dataset.g))] };
  });
  console.log('   ' + JSON.stringify(res) + '  in ' + ms + ' ms');
  ok('typing a unit opens the results', res.open);
  ok('  grouped by what was found', res.groups.length >= 2, res.groups.join(' / '));
  ok('  including the machine itself', res.kinds.indexOf('unit') >= 0, res.kinds.join(','));
  ok('  and the rounds on it', res.kinds.indexOf('insp') >= 0, res.kinds.join(','));
  ok('  answered quickly', ms < 3000, ms + ' ms');

  console.log('\n3. IT IS BOUNDED — A COMMON WORD DOES NOT PAINT THE FLEET');
  await p.fill('#gq', '');
  await p.waitForTimeout(300);
  const t1 = Date.now();
  await p.fill('#gq', 'COMPONENT');          // appears on every finding in the fixture
  await p.waitForTimeout(900);
  const wide = await p.evaluate(() => ({
    rows: document.querySelectorAll('#gres button[data-g]').length,
    findings: RECS.reduce((t, r) => t + (r.items || []).length, 0) }));
  console.log('   ' + JSON.stringify(wide) + '  in ' + (Date.now() - t1) + ' ms');
  ok('a word on every finding does not render every finding',
     wide.rows <= 40, wide.rows + ' rows for ' + wide.findings + ' findings');
  ok('  and the page did not freeze', (Date.now() - t1) < 5000, (Date.now() - t1) + ' ms');

  console.log('\n4. TWO CHARACTERS IS THE FLOOR');
  /* One letter matches most of the fleet and is never what somebody meant. */
  await p.fill('#gq', 'T');
  await p.waitForTimeout(500);
  const one = await p.evaluate(() =>
    document.getElementById('gres').classList.contains('hidden'));
  ok('a single character opens nothing', one === true, 'hidden: ' + one);

  console.log('\n5. SELECTING A RESULT GOES SOMEWHERE');
  await p.fill('#gq', unit);
  await p.waitForTimeout(700);
  await p.evaluate(() => {
    const b = document.querySelector('#gres button[data-g="unit"]');
    if (b) b.click();
  });
  await p.waitForTimeout(1200);
  const landed = await p.evaluate(() => ({
    tab: (document.querySelector('nav.tabs button.active') || {}).dataset
      ? document.querySelector('nav.tabs button.active').dataset.tab : '',
    unit: (document.getElementById('equipSel') || {}).value,
    closed: document.getElementById('gres').classList.contains('hidden') }));
  console.log('   ' + JSON.stringify(landed));
  ok('choosing a machine opens its history', landed.tab === 'equipment', landed.tab);
  ok('  on that machine, not another one', landed.unit === unit,
     landed.unit + ' vs ' + unit);
  ok('  and the results close behind it', landed.closed);

  console.log('\n6. THE KEYBOARD WORKS');
  await p.fill('#gq', unit);
  await p.waitForTimeout(700);
  await p.press('#gq', 'ArrowDown');
  const sel1 = await p.evaluate(() => !!document.querySelector('#gres button.on'));
  ok('arrow keys move through the results', sel1);
  await p.press('#gq', 'Escape');
  await p.waitForTimeout(200);
  const esc = await p.evaluate(() =>
    document.getElementById('gres').classList.contains('hidden'));
  ok('  and Escape closes them', esc === true, 'hidden: ' + esc);

  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
