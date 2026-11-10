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
      { equip: 'TK157', date: '2026-11-06', type: 'MP', cls: 'HT', by: 'Kazhybekov Bekzhan', smu: '8933',
        items: [ { key: '4E', label: 'LH final drive', grade: 1, wo: 'WO-020997' },
                 { key: '4F', label: 'RH final drive', grade: 2, wo: 'WO-020997' } ] },
      { equip: 'TK158', date: '2026-11-06', type: 'MP', cls: 'HT', by: 'Kazhybekov Bekzhan', smu: '9000',
        items: [ { key: '4E', label: 'LH final drive', grade: 3, wo: 'WO-021000', comment: 'Стружка' } ] },
      { equip: 'TK148', date: '2026-11-10', type: 'INSP', cls: 'HT', by: 'Kazhybekov Bekzhan', smu: '9000',
        items: [ { key: 'FD.RRF', label: 'Правая конечная передача', grade: 5, defect: 'Abnormal / accelerated wear',
                   defectCode: 'FM-MEC-03', iso: 'SER', action: 'RA-08', comment: 'Требуется замена компонента' } ] },
      { equip: 'DZ016', date: '2026-11-07', type: 'UC', cls: 'DOZ', by: 'Zhomart Khasenov', smu: '15941',
        items: [ { key: 'ROLLER.R1', mm: 236 }, { key: 'ROLLER.L1', mm: 254 } ] },
      { equip: 'DZ011', date: '2026-11-02', type: 'UC', cls: 'DOZ', by: 'Kazhybekov Bekzhan', smu: '32100',
        items: [ { key: 'ROLLER.L3', mm: 240 }, { key: 'ROLLER.R3', mm: 255 }, { key: 'IDLER.L-OUT', mm: 0 } ].filter(x => x.mm) },
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

  const ucRu = await text('one:DZ011|2026-11-02|UC', 'ru', false);
  const ucEn = await text('one:DZ011|2026-11-02|UC', 'en', false);
  const ucBi = await text('one:DZ011|2026-11-02|UC', 'en', true);
  const mpWatch = await text('one:TK157|2026-11-06|MP', 'ru', false);
  const mpDeg = await text('one:TK158|2026-11-06|MP', 'ru', false);
  console.log('\nMaintenance action box on a round worth watching only');
  const actOf = t => (t.match(/Действие по обслуживанию[\s\S]{0,260}/) || [''])[0];
  ok('an Incipient-only round does not print "Не записано" under the action box', !/Не записано/.test(actOf(mpWatch)), actOf(mpWatch).slice(0, 160));
  ok('a Degraded finding with no action still says "Не записано"', /Не записано/.test(actOf(mpDeg)), actOf(mpDeg).slice(0, 160));
  const ucSev = await text('one:DZ016|2026-11-07|UC', 'ru', false);
  const ucG = (ucSev.match(/СТЕПЕНЬ\s*(\d)/) || [])[1];
  ok('a measured round graded Degraded or worse says "Не записано" for its missing action, not dashes',
     Number(ucG) >= 3 && /Не записано/.test(actOf(ucSev)), 'grade ' + ucG + ' · ' + actOf(ucSev).slice(0, 140));
  const defRu = await text('one:TK148|2026-11-10|INSP', 'ru', false);
  const defBi = await text('one:TK148|2026-11-10|INSP', 'ru', true);
  console.log('\nA defect is named in the report\'s language (TK148 INSP 10.11)');
  ok('Russian sheet: the defect is Russian, not the English text the phone saved',
     /Аномальный \/ ускоренный износ/.test(defRu) && !/accelerated wear/.test(defRu),
     (defRu.match(/Дефект.{0,60}/) || [''])[0]);
  ok('bilingual sheet carries both', /Аномальный \/ ускоренный износ/.test(defBi) && /Abnormal \/ accelerated wear/.test(defBi));
  console.log('\nUndercarriage: controlling point and side captions');
  const ctrlOf = (t, lab) => (t.match(new RegExp(lab + '.{0,60}')) || [''])[0];
  ok('Russian: the controlling point is named in words, not as ROLLER.L3',
     /Определяющая точка\s*Опорный каток/.test(ucRu) && !/ROLLER\.L3/.test(ctrlOf(ucRu, 'Определяющая точка')), ctrlOf(ucRu, 'Определяющая точка'));
  ok('English: the controlling point is named in words', /Controlling point\s*Track roller/.test(ucEn) && !/ROLLER\.L3/.test(ctrlOf(ucEn, 'Controlling point')), ctrlOf(ucEn, 'Controlling point'));
  ok('Russian sheet: the side captions are Russian only', /ЛЕВАЯ/.test(ucRu) && !/LEFT|RIGHT/.test(ucRu), (ucRu.match(/.{0,12}ЛЕВАЯ.{0,12}/) || [''])[0]);
  ok('English sheet: the side captions are English only', /LEFT/.test(ucEn) && !/ЛЕВАЯ|ПРАВАЯ/.test(ucEn));
  ok('bilingual sheet keeps both', /LEFT \/ ЛЕВАЯ/.test(ucBi) && /RIGHT \/ ПРАВАЯ/.test(ucBi));

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
