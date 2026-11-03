/* A REPORT IN ONE LANGUAGE SAYS ITS OWN WORDS IN THAT LANGUAGE.

   Read off the real reports of 27.10–03.11.2026 (every round in the folder,
   regenerated through the engine): a Russian-only sheet printed "4000 h
   Service", "P3 Planned", "Наработка 32017 h", "20 → 3 mm", the tray's zone
   as "Floor — tail" and the undercarriage key as "Front idler"; an English
   sheet printed the owner as "Мастер по обслуживанию", because the phone
   writes the default role in its own language and Save dropped the key
   (respRole) that says which role it is; and every card printed "WO
   WO-020895". The inspector's own words are data and stay as typed.

   Run: node tests/rptwords.cjs [port]   (needs tests/mock.cjs on the port) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8099);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('cm_drive_url', ''); localStorage.setItem('lang', 'en'); });
  await p.goto(`http://127.0.0.1:${PORT}/dashboard/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMR && window.CMReport && window.CMDash, { timeout: 20000 });
  await p.waitForTimeout(600);

  await p.evaluate(() => {
    const sched = { schedHours: 4000, schedDate: '2026-11-02', schedPriority: 'P3 Planned (PM)' };
    const recs = [
      Object.assign({ equip: 'DZ011', date: '2026-10-31', type: 'INSP', cls: 'DOZ', by: 'Kazhybekov Bekzhan', smu: '32017',
        items: [
          { key: 'DRS.COO', label: 'Cooling System', grade: 3, comment: 'Отсутствует ремень привода вентилятора',
            action: 'Create 1C notification - plan repair', wo: 'WO-020895', resp: 'Мастер по обслуживанию', target: '2026-11-02' },
          { key: 'HS.DL', label: 'Hydraulic Lines', grade: 4, comment: 'Течь масла', action: 'Plan repair', wo: 'WO-020895',
            resp: 'Начальник по обслуживанию', respRole: 'supt', target: '2026-11-03' },
          { key: 'OC.SE', label: 'Seat', grade: 3, comment: 'Износ сиденья', action: 'Plan repair', wo: '020896',
            resp: 'Ivanov I.', target: '2026-11-04' } ] }, sched),
      Object.assign({ equip: 'DZ017', date: '2026-10-29', type: 'FC', cls: 'DOZ', by: 'Zhomart Khasenov', smu: '5890',
        items: [ { key: 'ENG', label: 'Engine Oil Filter', grade: 3, comp: '500', oil: '500', comment: 'Частицы', action: 'Plan repair', wo: 'WO-019758' } ] }, sched),
    ];
    window.CMDash.importRecords(recs);
    const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
  });

  const text = (key, lang, bi) => p.evaluate(({ key, lang, bi }) => {
    const i = key.indexOf(':');
    const secs = CMReport.sectionsFor(key.slice(0, i), key.slice(i + 1), { lang, bi, photos: true });
    const d = document.createElement('div');
    d.innerHTML = secs.map(s => s.html).join('<br>');
    return d.textContent.replace(/\s+/g, ' ');
  }, { key, lang, bi });

  const insRu = await text('one:DZ011|2026-10-31|INSP', 'ru', false);
  const insEn = await text('one:DZ011|2026-10-31|INSP', 'en', false);
  const fcRu = await text('one:DZ017|2026-10-29|FC', 'ru', false);
  const fcEn = await text('one:DZ017|2026-10-29|FC', 'en', false);

  console.log('\nRussian sheet');
  ok('the PM service is said in Russian', /4000 ч/.test(insRu) && !/ТО 4000|h [Ss]ervice/.test(insRu), (insRu.match(/.{0,20}4000.{0,20}/) || [''])[0]);
  ok('the priority class word is Russian', /P3 Плановое/.test(insRu) && !/Planned/.test(insRu));
  ok('the hour meter is in hours, "ч"', /32017 ч/.test(insRu) && !/32017 h/.test(insRu));
  ok('a filter\'s hours and oil are Russian', /500 ч/.test(fcRu) && /масло 500 ч/.test(fcRu) && !/oil 500/.test(fcRu));
  ok('the default owner roles stay Russian', /Мастер по обслуживанию/.test(insRu) && /Начальник по обслуживанию/.test(insRu));

  console.log('\nEnglish sheet');
  ok('the default owner is said in English', /Maintenance Supervisor/.test(insEn) && !/Мастер по обслуживанию/.test(insEn));
  ok('a role carried by its key is said in English', /Maintenance Superintendent/.test(insEn) && !/Начальник по обслуживанию/.test(insEn));
  ok('a typed name is printed exactly as typed', /Ivanov I\./.test(insEn) && /Ivanov I\./.test(insRu));
  ok('the inspector\'s own words are not translated', /Отсутствует ремень привода вентилятора/.test(insEn));
  ok('English keeps its own words', /4000 h/.test(insEn) && !/h service/.test(insEn) && /32017 h/.test(insEn) && /oil 500 h/.test(fcEn));

  console.log('\nBoth');
  ok('a work order is not labelled twice', !/WO WO-/.test(insEn) && !/ЗН WO-/.test(insRu), (insEn.match(/.{0,12}WO-020895/) || [''])[0]);
  ok('a bare number still gets its label', /WO 020896/.test(insEn) && /ЗН 020896/.test(insRu));

  /* tray zones and the undercarriage key, from the engine's own helpers */
  const parts = await p.evaluate(() => ({ zones: !!(window.BODY && BODY.models && BODY.models.length), uc: !!window.WEAR }));
  ok('the tray model data is loaded, so its zones can be named', parts.zones);
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
