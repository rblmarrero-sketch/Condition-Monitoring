/* SITE_STD_V1 (28.10.2026; v1.5 29.10 = standard filter bar: picker, chips, fseg, models, dims; v1.6 = one-line filter bar: an unset picker shows its label alone; v1.7 = sub-pages open from their menu button, no fixed second row) - one site standard for every PECHANKA page (Rickie "go" 28.10 15:42 site).
   SiteStd.init(cfg) draws the homepage's menu and a navy title band at the top of the page and a footer at the end, keeps ONE
   language for the whole site (localStorage "askpi_lang", the homepage's own key), turns notes into (i) tips and gives tables one
   behaviour: free text up to 3 lines, tap a row to open it, "Expand all", "Columns" (show / hide, row height, reset; this browser).
   Nothing here reads or changes data; a page that fails to load this file shows its own header as before.
   cfg = { page, title:{en,ru}, lang:{get()->"en"|"ru", set(l), el:'#own EN/RU group' (optional)} , chips:[(l)->html], actions:[{label:{en,ru}, click()|href}], keep:['#own button', ...],
           theme:{get()->"light"|"auto"|"dark", set(m)}, hide:[selector], tips:[{note, host, text?:{en,ru}}],
           foot:{en,ru}, tables:[{sel, id, free:[col], lock:[col], expand:bool, tools:selector|null, cols:bool}] } */
(function () {
  'use strict';
  if (window.SiteStd) return;
  var KEY = 'askpi_lang';
  var T = {
    eye: ['Baimskaya Copper Project · HME Reliability', 'Баимский медный проект · надёжность техники'],
    asof: ['Data as of', 'Данные на'], site: ['site', 'площадка'], built: ['Built', 'Построен'],
    light: ['Light', 'Светлая'], auto: ['Auto', 'Авто'], dark: ['Dark', 'Тёмная'], lang: ['Language', 'Язык'], theme: ['Theme', 'Тема'],
    exp: ['Expand all', 'Развернуть всё'], col: ['Collapse all', 'Свернуть всё'], cols: ['Columns', 'Столбцы'],
    show: ['Show columns', 'Показать столбцы'], ord: ['order', 'порядок'], fzUp: ['Freeze columns up to', 'Закрепить столбцы до'], fzNone: ['None', 'Нет'], fzT: ['Freeze the columns up to this one (click again to release)', 'Закрепить столбцы до этого (ещё раз — снять)'], hsT: ['Slide the table sideways', 'Прокрутить таблицу вбок'], up: ['Move up', 'Выше'], dn: ['Move down', 'Ниже'], rows: ['Row height', 'Высота строки'],
    dc: ['Compact', 'Компактно'], ds: ['Standard', 'Стандарт'], df: ['Full', 'Полностью'],
    reset: ['Reset', 'Сбросить'], done: ['Done', 'Готово'], info: ['More information', 'Подробнее'],
    tsite: ['Site time', 'Время площадки'], src: ['Source', 'Источник'], cnt: ['Failure counting', 'Подсчёт отказов'],
    tbl: ['Table settings are kept in this browser only.', 'Настройки таблицы хранятся только в этом браузере.'],
    nav: ['Main navigation', 'Главное меню'],
    doc: ['Baimskaya HME Reliability', 'Баимская · надёжность техники']
  };
  var NAV = [
    ['home', '/', '#2B4C7E', 'Overview', 'Обзор', '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'],
    ['acd', '/acd_next.html', '#C2531F', 'Assets Down', 'В простое', '<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v5"/>'],
    ['rep', '/reports/reports.html', '#2B4C7E', 'Reports', 'Отчёты', '<path d="M7 3h8l4 4v14H7z"/><path d="M10 12h6M10 16h6"/>'],
    ['asd', '/asset_state_next.html', '#2B4C7E', 'Asset history', 'История', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
    ['cm', '/cm/dashboard-next/', '#2D7A3E', 'Condition monitoring', 'Мониторинг состояния', '<path d="M3 12h4l3-8 4 16 3-8h4"/>'],
    ['app', 'https://relconditionmonitoring.web.app/mobile/', '#2D7A3E', 'Mobile app', 'Приложение', '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'],
    ['trk', '/tracker/', '#6D28D9', 'Action Tracker', 'Трекер', '<path d="M9 11l2 2 4-4"/><rect x="4" y="4" width="16" height="16" rx="2"/>'],
    ['dwm', '/wo_manager.html', '#C2531F', 'Defect & Work Orders', 'Наряды', '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M8.5 10h7M8.5 14h7M8.5 18h4"/>'],
    ['lube', '/lube/', '#B07A00', 'Lubrication', 'Смазка', '<path d="M12 3c3.5 4.6 6 8.1 6 11a6 6 0 0 1-12 0c0-2.9 2.5-6.4 6-11z"/><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"/>']
  ];
  /* v1.2: pages that belong to one menu button get a second row (sub-tabs) under the menu; the current one is marked.
     [id, EN, RU, link, is this the page?] - cfg.sub names the current one when the address cannot tell */
  var SUB = { rep: [   /* v1.8: the two report pages under Reports (the Weekly report had no way in from the menu) */
    ['fr', 'Fleet reports', 'Отчёты по паркам', '/reports/reports.html', function (l) { return /^\/reports\//.test(l.pathname); }],
    ['wr', 'Weekly report', 'Недельный отчёт', '/weekly_report.html', function (l) { return /weekly_report\.html$/.test(l.pathname); }],
    ['fir', 'Failure investigation (FIR)', 'Расследование отказов (FIR)', '/rca/', function (l) { return /^\/rca\//.test(l.pathname); }],   /* FIR_RCA_V1 (11.11): the FIR page under Reports */
    ['tr', 'Phrase library (EN/RU)', 'Библиотека фраз (EN/RU)', '/tr/phrases.html', function (l) { return /^\/tr\/phrases\.html$/.test(l.pathname); }]],   /* TR_PHRASE_NAV_V1 (12.11): the approved EN/RU note phrases under Reports */
    dwm: [
    ['wom', 'Work Order Manager', 'Менеджер нарядов', '/wo_manager.html', function (l) { return /wo_manager\.html$/.test(l.pathname) && !/^#dq/.test(l.hash); }],
    ['dql', 'Data quality (live)', 'Качество данных (онлайн)', '/wo_manager.html#dq?scope=All', function (l) { return /wo_manager\.html$/.test(l.pathname) && /^#dq/.test(l.hash); }],
    ['dqr', 'Data quality report', 'Отчёт о качестве данных', '/dq_latest.html', function (l) { return /(dq_latest|DQ_email_report)[^/]*\.html$/.test(l.pathname); }],
    ['parts', 'Urgent parts', 'Срочные запчасти', '/parts/', function (l) { return /^\/parts\//.test(l.pathname); }],   /* PARTS_V1 (12.11): the Urgent parts tracker under Defect & Work Orders */
    ['ncr', 'NCR register', 'Реестр NCR', '/ncr/', function (l) { return /^\/ncr\//.test(l.pathname); }]] };   /* NCR_V1 (13.11): non-conformance reports under Defect & Work Orders */
  var cfg = null, L = 'en', pop = null, popFor = null, colPop = null, segL = null, segT = null, kept = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function w(k) { var v = T[k]; return v ? v[L === 'ru' ? 1 : 0] : k; }
  function pick(o) { return o == null ? '' : typeof o === 'function' ? o() : typeof o === 'string' ? o : (L === 'ru' && o.ru) ? o.ru : (o.en || ''); }
  function stored() { try { return localStorage.getItem(KEY) === 'ru' ? 'ru' : 'en'; } catch (e) { return 'en'; } }
  function store(l) { try { localStorage.setItem(KEY, l); } catch (e) {} }
  function rgba(h, a) { return 'rgba(' + parseInt(h.substr(1, 2), 16) + ',' + parseInt(h.substr(3, 2), 16) + ',' + parseInt(h.substr(5, 2), 16) + ',' + a + ')'; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* ---------- (i) tips ---------- */
  function tipBtn(text) {
    var b = el('button', 'std-ii'); b.type = 'button'; b.setAttribute('aria-expanded', 'false');
    b._stdText = text; b.setAttribute('aria-label', w('info'));
    return b;
  }
  function showPop(b) {
    if (!pop) { pop = el('div', 'std-pop'); pop.setAttribute('role', 'tooltip'); pop.id = 'stdPop'; pop.hidden = true; document.body.appendChild(pop); }
    if (popFor && popFor !== b) popFor.setAttribute('aria-expanded', 'false');
    pop.textContent = pick(b._stdText); pop.hidden = false; popFor = b; b.setAttribute('aria-expanded', 'true'); b.setAttribute('aria-describedby', 'stdPop');
    var r = b.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, vw = innerWidth, vh = innerHeight;
    var x = Math.min(Math.max(12, r.left + r.width / 2 - pw / 2), vw - pw - 12), y = r.bottom + 6;
    if (y + ph > vh - 8 && r.top - ph - 6 > 8) y = r.top - ph - 6;
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  function hidePop() { if (pop) pop.hidden = true; if (popFor) { popFor.setAttribute('aria-expanded', 'false'); popFor.removeAttribute('aria-describedby'); } popFor = null; }
  document.addEventListener('mouseover', function (e) { var b = e.target.closest && e.target.closest('.std-ii'); if (b) showPop(b); else if (popFor && !popFor._stdSticky) hidePop(); });
  document.addEventListener('focusin', function (e) { var b = e.target.closest && e.target.closest('.std-ii'); if (b) showPop(b); });
  document.addEventListener('focusout', function (e) { if (e.target.closest && e.target.closest('.std-ii')) hidePop(); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.std-ii');
    if (b) { e.preventDefault(); e.stopPropagation(); if (popFor === b && b._stdSticky) { b._stdSticky = false; hidePop(); } else { showPop(b); b._stdSticky = true; } return; }
    if (popFor) { popFor._stdSticky = false; hidePop(); }
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { hidePop(); closeCols(); if (subPop) closeSub(true); } });
  addEventListener('scroll', function () { if (popFor && !popFor._stdSticky) hidePop(); }, true);
  /* a note element -> a tip on its host; the note is hidden, its text read when the tip opens (so a note the page rewrites stays current) */
  function tipFromNote(note, host, text) {
    if (!note || !host) return;
    var b = host.querySelector(':scope > .std-ii[data-std-note]');
    if (!b) { b = tipBtn(text || null); b.setAttribute('data-std-note', '1'); host.appendChild(b); }
    if (!text) { b._stdNote = note; b._stdText = function () { return (b._stdNote && b._stdNote.textContent || '').trim(); }; }
    if (!note.hidden) note.hidden = true; sa(note, 'data-std-hidden', '1');
  }
  /* a page can also mark a tip in its own markup: <i class="std-tipsrc" hidden data-en=".." data-ru=".."></i> becomes an (i) in place */
  function autoTips() { [].forEach.call(document.querySelectorAll('i.std-tipsrc'), function (i) { var b = tipBtn({ en: i.getAttribute('data-en') || '', ru: i.getAttribute('data-ru') || i.getAttribute('data-en') || '' }); b.setAttribute('aria-label', w('info')); i.parentNode.replaceChild(b, i); }); }
  function runTips() { autoTips(); (cfg.tips || []).forEach(function (t) { [].forEach.call(document.querySelectorAll(t.note), function (n) { var h = typeof t.host === 'function' ? t.host(n) : document.querySelector(t.host); tipFromNote(n, h, t.text); }); }); }

  /* v1.8 (rule 12.1): anything cut short ("…" or clipped to its lines) shows its whole text when pointed at or focused.
     Only an element that is really cut and has no title of its own gets one; it is taken again each time, so a redrawn cell stays right. */
  function cutOf(e) { for (var i = 0; e && i < 4 && e !== document.body; i++, e = e.parentElement) { if (e.nodeType !== 1) continue;
      var c = getComputedStyle(e); if (c.overflow === 'visible' && c.overflowX === 'visible') continue;
      if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2) return e; } return null; }
  function cutTitle(t) { if (!t || !t.closest || t.closest('#stdNav,#stdBand,.std-pop,.std-colpop,.std-pkpop,svg,canvas,input,select,textarea,button[title],a[title]')) return;
    var e = cutOf(t); if (!e || (e.hasAttribute('title') && !e.hasAttribute('data-std-cut'))) return;
    if (/^(TABLE|TBODY|THEAD|TR|UL|OL|MAIN|SECTION|ARTICLE|FORM|NAV|HEADER|FOOTER)$/.test(e.tagName) || e.children.length > 6) return;
    var tx = (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim(); if (!tx || tx.length > 600) return;
    if (e.getAttribute('title') !== tx) { e.setAttribute('title', tx); e.setAttribute('data-std-cut', '1'); } }
  document.addEventListener('mouseover', function (e) { try { cutTitle(e.target); } catch (x) {} }, true);
  document.addEventListener('focusin', function (e) { try { cutTitle(e.target); } catch (x) {} }, true);

  /* ---------- header, band, footer ---------- */
  function navHtml() {
    return '<div class="std-in">' + NAV.map(function (n) {
      var sub = SUB[n[0]] ? ' data-std-sub="' + n[0] + '" aria-haspopup="menu" aria-expanded="false"' : '';   /* v1.7: a button with pages under it opens them as a list */
      return '<a class="std-t' + (n[0] === cfg.page ? ' on' : '') + (sub ? ' std-thas' : '') + '" href="' + n[1] + '"' + (n[0] === cfg.page ? ' aria-current="page"' : '') + sub + ' style="--c:' + n[2] + ';--s:' + rgba(n[2], .14) + '"><i aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + n[5] + '</svg></i>' + esc(L === 'ru' ? n[4] : n[3]) + (sub ? '<b class="std-car" aria-hidden="true">▾</b>' : '') + '</a>';
    }).join('') + '</div>';
  }
  /* v1.7 (Rickie 29.10 02:43: "the sub tab will come out when they click the main tab. it should not be fixed"): the pages under a menu
     button are a list that opens from that button (click, Enter, Space or the down arrow), never a fixed second row; the current page is
     ticked. The link still goes to the first page when this script cannot run. */
  var subPop = null, subFor = null;
  function subCur(id) { var list = SUB[id]; if (!list) return null; return id === cfg.page ? ((typeof cfg.sub === 'string' && cfg.sub) || (list.filter(function (x) { return x[4](location); })[0] || [])[0]) : null; }
  function closeSub(back) { if (subPop) { subPop.remove(); subPop = null; } if (subFor) { subFor.setAttribute('aria-expanded', 'false'); if (back) subFor.focus(); } subFor = null; }
  function openSub(a) {
    var id = a.getAttribute('data-std-sub'), list = SUB[id]; if (!list) return;
    if (subFor === a) { closeSub(true); return; } closeSub(); hidePop(); closeCols();
    var cur = subCur(id);
    subPop = el('div', 'std-subpop'); subPop.setAttribute('role', 'menu'); subPop.id = 'stdSubPop'; subPop.setAttribute('aria-label', a.textContent.replace('▾', '').trim());
    subPop.innerHTML = list.map(function (x) { return '<a role="menuitem" href="' + x[3] + '"' + (x[0] === cur ? ' aria-current="page" class="on"' : '') + '><i aria-hidden="true">' + (x[0] === cur ? '✓' : '') + '</i>' + esc(L === 'ru' ? x[2] : x[1]) + '</a>'; }).join('');
    document.body.appendChild(subPop); subFor = a; a.setAttribute('aria-expanded', 'true');
    var r = a.getBoundingClientRect(); subPop.style.top = Math.round(r.bottom + 6) + 'px'; subPop.style.left = Math.round(Math.max(8, Math.min(r.left, innerWidth - subPop.offsetWidth - 8))) + 'px';
    subPop.addEventListener('keydown', function (e) { var xs = [].slice.call(subPop.querySelectorAll('a')), k = xs.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); closeSub(true); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); xs[(k + (e.key === 'ArrowDown' ? 1 : xs.length - 1)) % xs.length].focus(); }
      else if (e.key === 'Tab') closeSub(); });
    return subPop;
  }
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('#stdNav a[data-std-sub]');
    if (a) { e.preventDefault(); var p = openSub(a); if (p && e.detail === 0) { var f = p.querySelector('a.on') || p.querySelector('a'); if (f) f.focus(); } return; }
    if (subPop && !subPop.contains(e.target)) closeSub(); }, true);
  document.addEventListener('keydown', function (e) { var a = e.target.closest && e.target.closest('#stdNav a[data-std-sub]');
    if (a && (e.key === ' ' || e.key === 'ArrowDown')) { e.preventDefault(); if (subFor !== a) openSub(a); var f = subPop && (subPop.querySelector('a.on') || subPop.querySelector('a')); if (f) f.focus(); } });
  addEventListener('resize', function () { if (subPop) closeSub(); }); addEventListener('scroll', function () { if (subPop) closeSub(); }, { passive: true });
  function subHtml() { return ''; }   /* v1.7: no fixed second row - the sub-pages open from their menu button (openSub); #stdSub stays, empty and hidden */
  function seg(label, opts, cur, fn) {
    var s = el('span', 'std-seg'); s.setAttribute('role', 'group'); s.setAttribute('aria-label', label);
    opts.forEach(function (o) { var b = el('button', null, o[1]); b.type = 'button'; if (o[2]) b.setAttribute('aria-label', o[2]); b.setAttribute('aria-pressed', String(o[0] === cur)); b.onclick = function () { fn(o[0]); }; s.appendChild(b); });
    return s;
  }
  /* lang.el: the page's own EN/RU group is moved into the band and kept (its ids, its handlers, older kits' tests still find it) */
  function bl(b) { return /^ru/i.test(((b.dataset && b.dataset.l) || b.textContent || '').trim()) ? 'ru' : 'en'; }
  function adopt() {
    var x = cfg.lang && cfg.lang.el && document.querySelector(cfg.lang.el); if (!x) return null;
    ca(x, 'std-seg'); sa(x, 'role', 'group');
    [].forEach.call(x.children, function (b) { b.addEventListener('click', function () { var l = bl(b); store(l); L = l; setTimeout(paintBand, 0); }); });
    return x;
  }
  /* SITE_STD v1.2: no repaint loop - nodes inside the standard's own chrome never trigger the page watch */
  function ours(n) { for (; n && n.nodeType; n = n.parentNode) { if (n.id === 'stdNav' || n.id === 'stdSub' || n.id === 'stdBand' || n.id === 'stdFoot' || n.id === 'stdPop' || (n.classList && (n.classList.contains('std-colpop') || n.classList.contains('std-pkpop') || n.classList.contains('std-subpop')))) return true; } return false; }
  function ca(e, c) { if (!e.classList.contains(c)) e.classList.add(c); }
  function sa(e, k, v) { if (e.getAttribute(k) !== v) e.setAttribute(k, v); }
  function paintBand() {
    var nav = document.getElementById('stdNav'), band = document.getElementById('stdBand'), foot = document.getElementById('stdFoot');
    var sub = document.getElementById('stdSub');
    [[nav, navHtml(), w('nav')], [sub, subHtml(), L === 'ru' ? 'Разделы' : 'Sections']].forEach(function (x) { var e = x[0]; if (!e) return; sa(e, 'aria-label', x[2]);
      if (e._stdH !== x[1]) { e.innerHTML = x[1]; e._stdH = x[1]; e.hidden = !x[1]; [].forEach.call(e.querySelectorAll('.std-in > .on'), function (a) { var r = a.parentNode; if (a.offsetLeft + a.offsetWidth > r.clientWidth) r.scrollLeft = a.offsetLeft - 16; }); } });
    var side = el('div', 'std-side');
    (cfg.chips || []).forEach(function (f) { var h = ''; try { h = f(L); } catch (e) {} if (h) { var c = el('span', 'std-chip', h); side.appendChild(c); } });
    (cfg.actions || []).forEach(function (a) {
      var c = a.href ? el('a', 'std-chip') : el('button', 'std-chip'); if (a.href) { c.href = a.href; if (a.blank) { c.target = '_blank'; c.rel = 'noopener'; } } else c.type = 'button';
      c.innerHTML = esc(pick(a.label)) + (a.href && a.blank ? ' ↗' : ''); if (a.click) c.onclick = function (e) { e.preventDefault(); a.click(c); }; side.appendChild(c);
    });
    /* keep: the page's own buttons (selectors) moved into the band and kept - ids, handlers and wording stay the page's */
    if (!kept) { kept = []; (cfg.keep || []).forEach(function (q) { var x = document.querySelector(q); if (x) { x.classList.add('std-chip'); kept.push(x); } }); }
    kept.forEach(function (x) { side.appendChild(x); });
    /* the two switches are made once and kept (a page script or a test holding a button keeps a live button) */
    if (!segL) segL = adopt() || seg(w('lang'), [['en', 'EN'], ['ru', 'RU']], L, setLang);
    sa(segL, 'aria-label', w('lang')); [].forEach.call(segL.children, function (b) { sa(b, 'aria-pressed', String(bl(b) === L)); });
    side.appendChild(segL);
    if (cfg.theme) { var m = 'auto'; try { m = cfg.theme.get(); } catch (e) {}
      if (!segT) segT = seg(w('theme'), [['light', '☀', w('light')], ['auto', esc(w('auto'))], ['dark', '☾', w('dark')]], m, function (v) { cfg.theme.set(v); paintBand(); });
      sa(segT, 'aria-label', w('theme')); var mm = ['light', 'auto', 'dark'];
      [].forEach.call(segT.children, function (b, i) { sa(b, 'aria-pressed', String(mm[i] === m)); if (i === 1 && b.textContent !== w('auto')) b.textContent = w('auto'); if (i !== 1) sa(b, 'aria-label', w(mm[i])); });
      side.appendChild(segT); }
    band.innerHTML = '<div class="std-in"><div class="std-tt"><div class="std-eye">' + esc(w('eye')) + '</div><h1 class="std-h1">' + esc(pick(cfg.title)) + '</h1></div></div>';
    band.firstChild.appendChild(side);
    foot.innerHTML = '<span><b>' + esc(w('tsite')) + '</b> UTC+12</span><span aria-hidden="true">·</span><span>' + esc(w('src')) + ' <b>1C TOIR</b></span><span aria-hidden="true">·</span><span>' + esc(w('cnt')) + ' <b>ISO 14224</b></span>';
    if (cfg.foot) foot.appendChild(tipBtn(cfg.foot));
    document.querySelectorAll('.std-ii').forEach(function (b) { sa(b, 'aria-label', w('info')); });
    document.querySelectorAll('[data-std-tools]').forEach(paintTools);
    var lc = document.documentElement.getAttribute('data-std-lang') !== L; if (lc) document.documentElement.setAttribute('data-std-lang', L);
    if (cfg.docTitle !== false) { var dt = pick(cfg.title); if (dt) { dt += ' · ' + w('doc'); if (document.title !== dt) document.title = dt; } }   /* v1.8: one tab title on every page */
    repaintFb(); if (lc) try { document.dispatchEvent(new CustomEvent('std:lang', { detail: L })); } catch (e) {}
  }
  function pageLang() { try { var l = cfg.lang && cfg.lang.get && cfg.lang.get(); if (l) return String(l).toLowerCase() === 'ru' ? 'ru' : 'en'; } catch (e) {} return L; }
  function setLang(l) { l = l === 'ru' ? 'ru' : 'en'; store(l); if (cfg.lang && cfg.lang.set) { try { cfg.lang.set(l); } catch (e) {} } L = l; paintBand(); }
  function sync() { var l = pageLang(); if (l !== L) { L = l; store(l); paintBand(); } else if (cfg.repaint) paintBand(); }

  /* ---------- tables ---------- */
  function tkey(t) { return 'std_tbl_' + cfg.page + '_' + t.id; }
  function tdef(t) { return { h: (t.def && t.def.h || []).slice(), d: t.def && t.def.d || 's', o: (t.def && t.def.o || []).slice() }; }   /* v2.11: s.fz (frozen up to, page column number; -1 none) is kept only when a person changed it */   /* v2.9 COL_ORDER_V1: def.o = the site's default column order (original column numbers) */
  function tget(t) { var s = null; try { s = JSON.parse(localStorage.getItem(tkey(t)) || 'null'); } catch (e) {} return s || tdef(t); }
  function tput(t, s) { try { var d = tdef(t); if (!s || (JSON.stringify((s.h || []).slice().sort()) === JSON.stringify(d.h.slice().sort()) && (s.d || 's') === d.d && JSON.stringify(s.o || []) === JSON.stringify(d.o) && s.fz == null)) localStorage.removeItem(tkey(t)); else localStorage.setItem(tkey(t), JSON.stringify(s)); } catch (e) {} }
  function tableEl(t) { return document.querySelector(t.sel); }
  function heads(tb) { var r = tb.tHead && sfHead(tb);   /* v2.0 SITE_TBL_V1: the filter row is not a heading row */ return r ? [].map.call(r.cells, function (c) { return c.textContent.replace(/[▲▼↕]/g, '').trim(); }) : []; }
  /* v1.2: column headers stay in view under the menu. A table in a sideways scroller cannot use position:sticky against the page
     (the scroller is its sticky container), so its header row is moved down while the table passes under the menu. */
  var heldTables = [];
  function frame(tb) {
    var w = tb.parentElement; if (!w || w === document.body || tb._stdHold) return;
    var cs = getComputedStyle(w); if (!/^(auto|scroll|hidden|clip)$/.test(cs.overflowX) || cs.maxHeight !== 'none') return;
    tb._stdHold = true; ca(tb, 'std-hold'); if (holdRO) holdRO.observe(tb); heldTables = heldTables.filter(function (x) { return x.isConnected; }); heldTables.push(tb); hold();   /* v2.5: a table the page has replaced is let go (it held the page's old data) */
  }
  /* v2.7: a held header stops under whatever is pinned at the top of the window NOW - the site menu, and also a page's own pinned bar
     (Assets Down's filter bar); --std-top alone named only the menu, so the header slid under the page's bar or stopped too low. */
  function isPin(e) { for (var n = 0; e && e !== document.body && e !== document.documentElement && n < 12; e = e.parentElement, n++) { if (/^(TD|TH|TR|THEAD|TBODY|TABLE)$/.test(e.tagName)) return null;
      var p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return e; } return null; }
  /* v2.7.4: the bars pinned at the top are found the way the held-heading check finds them - every fixed / sticky element outside a
     table, wide (over 30 % of the window), not tall (under half), lying from the top of the window down, chained. v2.7 asked only what
     lies under the middle of the window, one element at a time, and stopped at the first one that did not fit: on the Work Order
     Manager's Execution tab it found no bar and held the heading at 0, under the 81 px bar (checks 13.11 17:09, 18:29). The list of
     such elements is kept for 2 s, not searched on every scroll. */
  var pinList = null, pinAt = 0;
  /* v2.7.5: a bar that BECOMES pinned by a class (Work Order Manager's Execution bar, live audit 13.11 21:14: heading held at 0 for
     ~1 s after the scroll, right at 1.5 s) is seen at once too - a class or hidden change outside a table empties the list and holds
     again; a tab change by the address (#execution) does the same */
  var holdRaf = 0; function holdSoon() { if (!holdRaf) holdRaf = requestAnimationFrame(function () { holdRaf = 0; if (heldTables.length) hold(); }); }
  if (window.MutationObserver) new MutationObserver(function (recs) { for (var i = 0; i < recs.length; i++) { var t = recs[i].target;
      if (recs[i].type === 'childList' || !(t.closest && t.closest('table'))) { pinAt = 0; if (recs[i].type !== 'childList') holdSoon(); return; } } })
    .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });   /* a bar added, removed or newly pinned is seen at once */
  window.addEventListener('hashchange', function () { pinAt = 0; holdSoon(); });
  function pinEls() { var now = Date.now(); if (pinList && now - pinAt < 2000) return pinList; pinAt = now; pinList = [];
    var tw = document.createTreeWalker(document.body, 1, { acceptNode: function (e) { return /^(TABLE|SCRIPT|STYLE|SVG|svg)$/.test(e.tagName) || (e.classList && (e.classList.contains('std-sfpop') || e.classList.contains('std-pkpop') || e.classList.contains('std-tip'))) ? 2 : 1; } });
    for (var e = tw.nextNode(); e; e = tw.nextNode()) { var p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') pinList.push(e); }
    return pinList; }
  function pinBottom() { var rs = [];
    pinEls().forEach(function (e) { if (!e.isConnected) return; var r = e.getBoundingClientRect(); if (r.height > 0 && r.width > innerWidth * 0.3 && r.height < innerHeight * 0.5 && r.top < innerHeight * 0.5 && getComputedStyle(e).visibility !== 'hidden') rs.push(r); });
    rs.sort(function (a, b) { return a.top - b.top; }); var y = 0; rs.forEach(function (r) { if (r.top <= y + 2) y = Math.max(y, r.bottom); });
    return y; }
  function hold() {
    var top = Math.max(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--std-top')) || 0, pinBottom());
    if (heldTables.some(function (x) { return !x.isConnected; })) heldTables = heldTables.filter(function (x) { return x.isConnected; });   /* v2.5 */
    heldTables.forEach(function (tb) { var th = tb.tHead; if (!th) return; var r = tb.getBoundingClientRect(), h = th.getBoundingClientRect().height;
      var d = Math.max(0, Math.min(top - r.top, r.height - h - 2));
      /* v2.7.3: a page that zooms (Assets Down: html{zoom:1.05} from 2200 px wide) measures in zoomed pixels but moves in its own; the
         move is divided by the zoom, or the heading drifts 5 % of the distance below the bar (Rickie 13.11 17:58: 197 px after 3,940) */
      var z = tb.currentCSSZoom || (tb.offsetHeight ? r.height / tb.offsetHeight : 1) || 1; if (Math.abs(z - 1) < 0.001) z = 1;
      var v = d > 0 ? 'translateY(' + Math.round(d / z) + 'px)' : '';
      [].forEach.call(th.rows, function (row) { [].forEach.call(row.cells, function (c) { if (c.style.transform !== v) c.style.transform = v; }); });
      if (tb.classList.contains('std-held') !== d > 0) tb.classList.toggle('std-held', d > 0); });
  }
  window.addEventListener('scroll', function () { if (heldTables.length) hold(); }, { passive: true });
  window.addEventListener('resize', function () { pinAt = 0; if (heldTables.length) hold(); });
  /* v2.7.2: a held heading follows the table when the page moves it WITHOUT a scroll (Rickie 13.11 16:12 "its floating", Assets Down:
     something above the register grew after the last scroll, the table moved down and its heading kept the old offset, floating in the
     rows). The page's size and each held table's size are watched, and a once-a-second look catches a move that changes no size. */
  var holdRO = window.ResizeObserver ? new ResizeObserver(function () { if (heldTables.length) hold(); }) : null;
  if (holdRO) holdRO.observe(document.documentElement);
  setInterval(function () { if (heldTables.length && !document.hidden) hold(); }, 1000);
  function applyTable(t) {
    var tb = tableEl(t); if (!tb) return; frame(tb);
    var s = tget(t), hid = s.h || [];
    ca(tb, 'std-tbl'); if (t.expand) ca(tb, 'std-x');
    sa(tb, 'data-std-d', s.d || 's'); sa(tb, 'data-std-id', t.id);
    if (t.ord) coReorder(t, tb, s.o || []);   /* v2.9 COL_ORDER_V1 */
    var css = hid.map(function (i) { if (t.ord) return t.sel + ' tr>[data-std-c="' + i + '"]{display:none}' + t.sel + ' col[data-std-c="' + i + '"]{visibility:collapse}'; var n = i + 1; return t.sel + ' tr>*:nth-child(' + n + '){display:none}' + t.sel + ' col:nth-child(' + n + '){visibility:collapse}'; }).join('\n');
    var st = document.getElementById('stdCols_' + t.id); if (!st) { st = el('style'); st.id = 'stdCols_' + t.id; document.head.appendChild(st); } if (st.textContent !== css) st.textContent = css;
    [].forEach.call(tb.tBodies, function (body) {
      [].forEach.call(body.rows, function (tr) {
        [].forEach.call(tr.cells, function (td, i) { if (t.ord && td.hasAttribute('data-std-c')) i = +td.getAttribute('data-std-c');
          if (t.lock && t.lock.indexOf(i) >= 0) ca(td, 'std-lock');
          if (t.free && t.free.indexOf(i) >= 0 && !td.querySelector(':scope > .std-cl')) {
            var inner = td.querySelector(':scope > .cl'); if (inner) { ca(inner, 'std-cl'); return; }
            var d = el('div', 'std-cl'); while (td.firstChild) d.appendChild(td.firstChild); td.appendChild(d);
          }
        });
      });
    });
    if (tb.tHead) [].forEach.call(tb.tHead.rows, function (r) { [].forEach.call(r.cells, function (th, i) { if (t.ord && th.hasAttribute('data-std-c')) i = +th.getAttribute('data-std-c'); if (t.lock && t.lock.indexOf(i) >= 0) ca(th, 'std-lock'); }); });
    if (t.sf) sfApply(t, tb);   /* v2.0 SITE_TBL_V1 */
    if (rzOn(t)) rzApply(t, tb);   /* v2.4: drag a heading edge to change a column's width */
    if (t.status) stApply(t, tb);   /* v2.11 TBL_WIDE_V1: status colour on the row */
    if (t.freeze != null || t.slider) wdApply(t, tb);   /* v2.11 TBL_WIDE_V1: frozen columns, slider in reach */
  }
  function paintTools(box) {
    var t = box._stdT; if (!t) return; var tb = tableEl(t); if (!tb) return;
    var open = tb.getAttribute('data-std-all') === '1';
    box.innerHTML = '';
    if (t.expand !== false) { var a = el('button', 'std-btn'); a.type = 'button'; a.setAttribute('aria-pressed', String(open)); a.textContent = open ? w('col') : w('exp');
      a.onclick = function () { var on = tb.getAttribute('data-std-all') !== '1'; tb.setAttribute('data-std-all', on ? '1' : '0'); [].forEach.call(tb.querySelectorAll('tbody tr'), function (tr) { tr.classList.toggle('std-open', on); }); paintTools(box); };
      box.appendChild(a); }
    if (t.cols !== false) { var c = el('button', 'std-btn'); c.type = 'button'; c.setAttribute('aria-haspopup', 'dialog'); c.innerHTML = '⚙ ' + esc(w('cols')); c.onclick = function () { openCols(t, c); }; box.appendChild(c); }
  }
  /* ---------- v2.9 COL_ORDER_V1: the columns can be arranged (Rickie 14.11 08:33 "in customization to arrange as well", 09:25 "go") ----------
     Switched on per table: tables:[{..., ord:true, def:{h:[hidden], o:[order]}}]. Every cell remembers the column it was drawn in
     (data-std-c = its first position, the page's own column number); the order a person chose (or the site default def.o) moves the
     cells of every row that has a cell per column, and the <col>s. Hiding, lock, free, filters and widths then go by that number, never
     by position. The page's own rows are drawn as before; the template moves them after each redraw. Kept per browser like the rest of
     the Columns menu; Reset = the site default. Changing the order clears the table's sort / filters and its own widths (both counted by
     position). A table without ord is untouched. */
  function coIdx(c, i) { return c && c.hasAttribute('data-std-c') ? +c.getAttribute('data-std-c') : i; }
  function coRows(tb) { var r = []; [tb.tHead].concat([].slice.call(tb.tBodies), [tb.tFoot]).forEach(function (s) { if (s) [].forEach.call(s.rows, function (x) { r.push(x); }); }); [].forEach.call(tb.querySelectorAll(':scope > colgroup'), function (g) { r.push(g); }); return r; }
  function coReorder(t, tb, o) { var hr = tb.tHead && sfHead(tb), nh = hr ? hr.cells.length : 0; if (!nh) return;
    coRows(tb).forEach(function (row) { var cells = [].slice.call(row.children); if (cells.length !== nh) return;
      cells.forEach(function (c, i) { if (!c.hasAttribute('data-std-c')) c.setAttribute('data-std-c', String(i)); });
      var rank = {}; o.forEach(function (c, k) { rank[c] = k; });
      var want = cells.slice().sort(function (a, b) { var x = +a.getAttribute('data-std-c'), y = +b.getAttribute('data-std-c'); return (x in rank ? rank[x] : 1e4 + x) - (y in rank ? rank[y] : 1e4 + y); });
      if (want.some(function (c, k) { return c !== cells[k]; })) want.forEach(function (c) { row.appendChild(c); }); }); }
  function coPin(t) { return (t.pin || []).slice(); }   /* v2.10: the columns that keep their place when arranging. Not lock: lock only keeps a column on one line */
  function coOrder(t, tb) { var s = tget(t); if (s.o && s.o.length) return s.o.slice(); var hr = tb.tHead && sfHead(tb); return hr ? [].map.call(hr.cells, coIdx) : []; }
  function coSet(t, tb, o) { var st = tget(t); st.o = o; tput(t, st); t._sf = null; var fr = tb.tHead && tb.tHead.querySelector('tr.std-flt'); if (fr) fr.remove(); if (rzGet(t)) rzReset(t, tb); applyTable(t); }
  function closeCols() { if (colPop) { colPop.remove(); colPop = null; } }
  function openCols(t, btn) {
    closeCols(); var tb = tableEl(t); if (!tb) return; var s = tget(t), hid = s.h || [], H = heads(tb);
    colPop = el('div', 'std-colpop'); colPop.setAttribute('role', 'dialog'); colPop.setAttribute('aria-label', w('cols'));
    var html; if (t.ord) { var O = coOrder(t, tb), hr0 = tb.tHead && sfHead(tb), HT = {}; if (hr0) [].forEach.call(hr0.cells, function (c, i) { HT[coIdx(c, i)] = c.textContent.replace(/[▲▼↕]/g, '').trim(); });
      html = '<h4>' + esc(w('show')) + ' · ' + esc(w('ord')) + '</h4><ol class="std-co">' + O.map(function (i, k) { var h = HT[i]; if (!h) return ''; var lk = coPin(t).indexOf(i) >= 0;
        return '<li data-c="' + i + '"' + (lk ? '' : ' draggable="true"') + '><span class="std-grip" aria-hidden="true">' + (lk ? '🔒' : '⠿') + '</span><label><input type="checkbox" data-c="' + i + '"' + (hid.indexOf(i) < 0 ? ' checked' : '') + (lk && k === 0 ? ' disabled' : '') + '>' + esc(h) + '</label>'
          + (lk ? '' : '<button type="button" class="std-btn std-mv" data-mv="-1" data-i="' + i + '" aria-label="' + esc(w('up') + ': ' + h) + '">↑</button><button type="button" class="std-btn std-mv" data-mv="1" data-i="' + i + '" aria-label="' + esc(w('dn') + ': ' + h) + '">↓</button>') + '</li>'; }).join('') + '</ol>'; }
    else html = '<h4>' + esc(w('show')) + '</h4>' + H.map(function (h, i) { if (!h || (t.lock && t.lock.indexOf(i) === 0 && i === 0)) return ''; return '<label><input type="checkbox" data-c="' + i + '"' + (hid.indexOf(i) < 0 ? ' checked' : '') + '>' + esc(h) + '</label>'; }).join('');
    if (t.freeze != null) { var hrF = tb.tHead && sfHead(tb), fzc = fzCol(t); html += '<h4 style="margin-top:12px">' + esc(w('fzUp')) + '</h4><select class="std-fzs" data-fz="1" aria-label="' + esc(w('fzUp')) + '"><option value="-1">' + esc(w('fzNone')) + '</option>'
      + (hrF ? [].map.call(hrF.cells, function (c, i) { if (getComputedStyle(c).display === 'none') return ''; var k = coIdx(c, i); return '<option value="' + k + '"' + (k === fzc ? ' selected' : '') + '>' + esc(c.textContent.replace(/[▲▼↕📌]/g, '').trim()) + '</option>'; }).join('') : '') + '</select>'; }   /* v2.11 */
    html += '<h4 style="margin-top:12px">' + esc(w('rows')) + '</h4><div class="std-seg2">' + [['c', w('dc')], ['s', w('ds')], ['f', w('df')]].map(function (o) { return '<button type="button" class="std-btn" data-d="' + o[0] + '" aria-pressed="' + ((s.d || 's') === o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>';
    html += '<div class="std-foot"><button type="button" class="std-btn" data-x="reset">↺ ' + esc(w('reset')) + '</button><button type="button" class="std-btn" data-x="done" aria-pressed="true">' + esc(w('done')) + '</button></div><p style="margin:8px 0 0;color:var(--std-mut,#5b6670);font-size:12px">' + esc(w('tbl')) + '</p>';
    colPop.innerHTML = html; document.body.appendChild(colPop);
    var r = btn.getBoundingClientRect(); colPop.style.top = Math.min(r.bottom + 6, innerHeight - colPop.offsetHeight - 8) + 'px'; colPop.style.left = Math.max(12, Math.min(r.right - colPop.offsetWidth, innerWidth - colPop.offsetWidth - 12)) + 'px';
    colPop.addEventListener('change', function (e) { if (e.target.dataset.fz) { fzSet(t, +e.target.value); return; } var i = +e.target.dataset.c; var h = (tget(t).h || []).filter(function (x) { return x !== i; }); if (!e.target.checked) h.push(i); var st = tget(t); st.h = h; tput(t, st); applyTable(t); });
    colPop.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.d) { var st = tget(t); st.d = b.dataset.d; tput(t, st); applyTable(t); [].forEach.call(colPop.querySelectorAll('[data-d]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); }); }
      if (b.dataset.mv) { var O2 = coOrder(t, tb), i2 = +b.dataset.i, k2 = O2.indexOf(i2), j2 = k2 + (+b.dataset.mv);   /* a pinned column (pin:[col]) is never passed: pinned columns stay where they are */
        if (j2 >= 0 && j2 < O2.length && coPin(t).indexOf(O2[j2]) < 0) { O2.splice(k2, 1); O2.splice(j2, 0, i2); coSet(t, tb, O2); openCols(t, btn); var nb = colPop.querySelector('[data-i="' + i2 + '"][data-mv="' + b.dataset.mv + '"]'); if (nb) nb.focus(); } return; }
      if (b.dataset.x === 'reset') { if (t.freeze != null) { tb._fzK = ''; }   /* v2.11: Reset also gives the page's own frozen columns back */
        if (t.ord) { t._sf = null; var fr0 = tb.tHead && tb.tHead.querySelector('tr.std-flt'); if (fr0) fr0.remove(); } tput(t, null); applyTable(t); openCols(t, btn); }
      if (b.dataset.x === 'done') closeCols();
    });
    if (t.ord) { var dragC = null;
      colPop.addEventListener('dragstart', function (e) { var li = e.target.closest && e.target.closest('li[draggable]'); if (!li) return; dragC = +li.dataset.c; li.classList.add('std-drag'); try { e.dataTransfer.setData('text/plain', String(dragC)); e.dataTransfer.effectAllowed = 'move'; } catch (x) {} });
      colPop.addEventListener('dragend', function () { dragC = null; [].forEach.call(colPop.querySelectorAll('.std-drag,.std-over'), function (x) { x.classList.remove('std-drag', 'std-over'); }); });
      colPop.addEventListener('dragover', function (e) { var li = e.target.closest && e.target.closest('li[draggable]'); if (dragC === null || !li) return; e.preventDefault(); [].forEach.call(colPop.querySelectorAll('.std-over'), function (x) { if (x !== li) x.classList.remove('std-over'); }); li.classList.add('std-over'); });
      colPop.addEventListener('drop', function (e) { var li = e.target.closest && e.target.closest('li[draggable]'); if (dragC === null || !li) return; e.preventDefault(); var O3 = coOrder(t, tb), to = O3.indexOf(+li.dataset.c); if (to < 0 || +li.dataset.c === dragC) return; var fr = O3.indexOf(dragC), pz = coPin(t); if (O3.slice(Math.min(fr, to), Math.max(fr, to) + 1).some(function (x) { return pz.indexOf(x) >= 0; })) return;
        O3.splice(O3.indexOf(dragC), 1); O3.splice(to, 0, dragC); dragC = null; coSet(t, tb, O3); openCols(t, btn); }); }
    var f = colPop.querySelector('input,button'); if (f) f.focus();
  }
  document.addEventListener('mousedown', function (e) { if (colPop && !colPop.contains(e.target) && !(e.target.closest && e.target.closest('.std-tools'))) closeCols(); });
  /* ---------- v2.0 SITE_TBL_V1 (v2.1: dates written "03 Oct 26" / "03 окт 26" sort as dates; v2.2: "1,234" / "1 234" are thousands; v2.3: sf:{sort:false} keeps the page's own sort; v2.4: column widths by dragging a heading edge; v2.5: no leak - tables and pickers a page replaces are let go; v2.6: SiteStd.tick - the same tick list for a page's own filter row; v2.7: a held header stops under the page's own pinned bar too): sort by a heading + a filter row under the headings (KB UI_STANDARD §22, Rickie 12.11 20:12 / 20:20) ----------
     Switched on per table: tables:[{sel, id, sf:true | {list:[col], text:[col], none:[col], navy:false}}]. Works on the rows the page drew:
     a click on a heading sorts (▲ · ▼ · the page's own order), dates and numbers as dates and numbers (a cell's data-v wins), empty last;
     the filter row: a column with a short fixed list = tick list (more than one value, "(empty)" too), the others a text box ("contains");
     "N of M lines" + Clear filters in the table's tool row. A row with fewer cells than the headings (a detail row) travels with the row
     above it. Rows are only re-ordered and hidden, never changed; KPI cards and counts the page works out itself are not touched. */
  var SFW = { en: { of: '{n} of {m} lines', clr: '✕ Clear filters', fil: 'Filter', all: 'All', empty: '(empty)', none: 'No lines match the filters', srt: 'Sort', clrcol: 'Clear' },
    ru: { of: '{n} из {m} строк', clr: '✕ Сбросить фильтры', fil: 'Фильтр', all: 'Все', empty: '(пусто)', none: 'Нет строк по этим фильтрам', srt: 'Сортировка', clrcol: 'Сбросить' } };
  function sw(k, v) { var s = SFW[L === 'ru' ? 'ru' : 'en'][k] || k; if (v) for (var x in v) s = s.split('{' + x + '}').join(v[x]); return s; }
  var sfTabs = [], sfPop = null;
  function sfHead(tb) { if (!tb.tHead) return null; var rs = [].filter.call(tb.tHead.rows, function (r) { return !r.classList.contains('std-flt'); }); return rs[rs.length - 1] || null; }
  function sfTxt(c) { if (!c) return ''; var v = c.getAttribute('data-v'); if (v != null) return v; var f = c.querySelector('input:not([type=checkbox]):not([type=radio]),select,textarea');
    if (f && f.tagName === 'SELECT') { var o = f.options[f.selectedIndex]; return o ? o.text.trim() : ''; } if (f && !c.textContent.trim()) return String(f.value || '').trim(); return c.textContent.replace(/\s+/g, ' ').trim(); }
  var SFMON = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    'янв': '01', 'фев': '02', 'мар': '03', 'апр': '04', 'мая': '05', 'май': '05', 'июн': '06', 'июл': '07', 'авг': '08', 'сен': '09', 'окт': '10', 'ноя': '11', 'дек': '12' };
  function sfKey(s) { if (!s) return null; var m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?:[ ,T]+(\d{1,2}):(\d{2}))?$/.exec(s);
    if (m) { var y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) + ' ' + ('0' + (m[4] || '0')).slice(-2) + ':' + (m[5] || '00'); }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
    var mm = /^(\d{1,2})[ .\-]([A-Za-zА-Яа-яЁё]{3,9})\.?[ .\-]?(\d{2}|\d{4})?(?:[ ,]+(\d{1,2}):(\d{2}))?$/.exec(s);   /* v2.1: "03 Oct 26", "3 окт 2026", "03 Oct" (this year) */
    if (mm) { var mo = SFMON[mm[2].toLowerCase().slice(0, 3)]; if (mo) { var yy = mm[3] ? (mm[3].length === 2 ? '20' + mm[3] : mm[3]) : String(new Date().getFullYear());
      return yy + '-' + mo + '-' + ('0' + mm[1]).slice(-2) + ' ' + ('0' + (mm[4] || '0')).slice(-2) + ':' + (mm[5] || '00'); } }
    var g = s.replace(/[\u00a0\u202f]/g, ' ');   /* v2.2: thousands separators - "1,234" / "12,345.6" (en-US) and "1 234" / "1 234,5" (ru) are numbers, not decimals */
    if (/^[-+−]?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?:\s*\S{1,4})?$/.test(g)) s = g.replace(/,(?=\d{3}\b)/g, ''); else if (/^[-+−]?\d{1,3}(?: \d{3})+(?:,\d+)?(?:\s*\S{1,4})?$/.test(g)) s = g.replace(/ (?=\d{3}\b)/g, '');
    var n = /^([-+−]?\d[\d\s ]*(?:[.,]\d+)?)\s*(%|h|ч|d|дн\.?|д|L|л|km|км|kg|кг|m|м|t|т|мин|min)?$/.exec(s); if (n) return parseFloat(n[1].replace(/[\s ]/g, '').replace(',', '.').replace('−', '-'));
    return s.toLowerCase(); }
  function sfGroups(tb, nh) { var gs = [];
    [].forEach.call(tb.tBodies, function (body) { [].forEach.call(body.rows, function (tr) { if (tr.classList.contains('std-sfe')) return;
      var span = 0; [].forEach.call(tr.cells, function (c) { span += c.colSpan || 1; });
      if (gs.length && tr.cells.length === 1 && span >= nh && gs[gs.length - 1].body === body) gs[gs.length - 1].rows.push(tr);   /* a detail row under its line */
      else gs.push({ body: body, rows: [tr], main: tr, full: tr.cells.length >= nh }); }); });
    return gs; }
  function sfKind(t, i, vals) { var o = t.sf === true ? {} : t.sf || {};
    if ((o.none || []).indexOf(i) >= 0) return ''; if ((o.list || []).indexOf(i) >= 0) return 'l'; if ((o.text || []).indexOf(i) >= 0) return 't';
    var d = {}, n = 0, lng = 0, any = 0; vals.forEach(function (v) { if (v) { any++; if (!d[v]) { d[v] = 1; n++; } lng = Math.max(lng, v.length); } });
    if (!any) return ''; return n <= 20 && lng <= 40 && (n <= 6 || n * 2 <= any) ? 'l' : 't'; }
  function sfOn(st) { var n = 0; for (var k in st.f) { var f = st.f[k]; if (Array.isArray(f) ? f.length : String(f || '').trim()) n++; } return n; }
  function sfApply(t, tb) {
    var st = t._sf || (t._sf = { k: -1, d: 1, f: {}, seq: 0 }), hr = sfHead(tb); if (!hr) return; var nh = hr.cells.length;
    var own = (t.sf || {}).sort === false;   /* v2.3: sf:{sort:false} - the page sorts its own headings; the template gives the look, the filter row and the count only */
    ca(tb, 'std-sf'); if ((t.sf || {}).navy !== false) ca(tb, 'std-sfnv');
    if (sfTabs.indexOf(t) < 0) sfTabs.push(t);
    var gs = sfGroups(tb, nh), full = gs.filter(function (g) { return g.full; });
    full.forEach(function (g) { if (g.main._stdO == null) g.main._stdO = ++st.seq; });
    var cols = []; for (var i = 0; i < nh; i++) cols.push(full.map(function (g) { return sfTxt(g.main.cells[i]); }));
    /* headings: sortable, the arrow on the sorted one */
    if (!own) [].forEach.call(hr.cells, function (th, i) { if (!cols[i].some(Boolean) && !th.textContent.trim()) return; sa(th, 'data-std-sk', String(i)); ca(th, 'std-sk');
      var a = i === st.k ? (st.d > 0 ? '▲' : '▼') : '', so = th.querySelector(':scope > .std-so');
      if (a) { if (!so) { so = el('span', 'std-so'); so.setAttribute('aria-hidden', 'true'); th.appendChild(so); } if (so.textContent !== a) so.textContent = a; sa(th, 'aria-sort', st.d > 0 ? 'ascending' : 'descending'); }
      else { if (so) so.remove(); if (th.hasAttribute('aria-sort')) th.removeAttribute('aria-sort'); } });
    /* the filter row */
    var fr = tb.tHead.querySelector('tr.std-flt'), kinds = cols.map(function (v, i) { return sfKind(t, t.ord ? coIdx(hr.cells[i], i) : i, v); });
    if (fr && (fr.cells.length !== nh || fr.getAttribute('data-std-k') !== kinds.join(',') || fr.getAttribute('data-std-l') !== L || fr !== hr.nextElementSibling)) { fr.remove(); fr = null; }
    if (!fr) { fr = el('tr', 'std-flt'); sa(fr, 'data-std-k', kinds.join(',')); sa(fr, 'data-std-l', L);
      fr.innerHTML = kinds.map(function (k, i) { var hd = hr.cells[i], lab = hd ? hd.textContent.replace(/[▲▼]/g, '').trim() : '', cl = hd && hd.className ? ' class="' + esc(hd.className.replace(/\bstd-sk\b/g, '')) + '"' : '';
        var dc = t.ord && hd && hd.hasAttribute('data-std-c') ? ' data-std-c="' + hd.getAttribute('data-std-c') + '"' : '';   /* v2.9: the filter cell carries its column's number */
        cl += dc; if (k === 'l') return '<th' + cl + '><button type="button" class="std-sfb" data-std-fb="' + i + '" aria-haspopup="dialog" aria-label="' + esc(sw('fil') + ': ' + lab) + '"></button></th>';
        if (k === 't') return '<th' + cl + '><input type="search" class="std-sfx" data-std-fx="' + i + '" autocomplete="off" spellcheck="false" placeholder="' + esc(sw('fil')) + '" aria-label="' + esc(sw('fil') + ': ' + lab) + '"></th>';
        return '<th' + cl + '></th>'; }).join('');
      if (hr.nextSibling) hr.parentNode.insertBefore(fr, hr.nextSibling); else hr.parentNode.appendChild(fr);
      if (st.fk != null) { var fe = fr.querySelector('[data-std-fx="' + st.fk + '"]'); if (fe) { fe.focus(); try { fe.setSelectionRange(st.fc, st.fc); } catch (e) {} } } }
    [].forEach.call(fr.querySelectorAll('[data-std-fx]'), function (x) { var v = st.f[x.getAttribute('data-std-fx')] || ''; if (x.value !== v && document.activeElement !== x) x.value = v; x.classList.toggle('on', !!String(v).trim()); });
    [].forEach.call(fr.querySelectorAll('[data-std-fb]'), function (b) { var v = st.f[b.getAttribute('data-std-fb')] || [], lb = !v.length ? sw('all') : v.map(function (x) { return x === '' ? sw('empty') : x; }).join(', ');
      var h = '<span>' + esc(lb) + '</span><i aria-hidden="true">▾</i>'; if (b._h !== h) { b.innerHTML = h; b._h = h; } sa(b, 'title', lb); b.classList.toggle('on', !!v.length); });
    /* filter, then order */
    var shown = 0; gs.forEach(function (g) { var ok = !g.full || Object.keys(st.f).every(function (k) { var f = st.f[k], v = sfTxt(g.main.cells[+k]);
        if (Array.isArray(f)) return !f.length || f.indexOf(v) >= 0; var q = String(f || '').trim().toLowerCase(); return !q || v.toLowerCase().indexOf(q) >= 0; });
      if (ok && g.full) shown++; g.rows.forEach(function (r) { r.classList.toggle('std-sfh', !ok); }); });
    var byBody = new Map(); gs.forEach(function (g) { if (!byBody.has(g.body)) byBody.set(g.body, []); byBody.get(g.body).push(g); });
    if (!own) byBody.forEach(function (list, body) { var lead = [], mov = [], tail = [];
      list.forEach(function (g) { (g.full ? mov : (mov.length ? tail : lead)).push(g); });   /* rows that are not lines (a heading at the top, a total at the end) stay where they are */
      var want = mov.slice().sort(function (a, b) { if (st.k < 0) return a.main._stdO - b.main._stdO;
        var x = sfKey(sfTxt(a.main.cells[st.k])), y = sfKey(sfTxt(b.main.cells[st.k]));
        if (x == null && y == null) return a.main._stdO - b.main._stdO; if (x == null) return 1; if (y == null) return -1;
        var c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), L === 'ru' ? 'ru' : 'en', { numeric: true, sensitivity: 'base' });
        return c ? c * st.d : a.main._stdO - b.main._stdO; });
      var now = mov.map(function (g) { return g.main; }), same = want.every(function (g, i) { return g.main === now[i]; });
      if (!same) { var anchor = tail.length ? tail[0].rows[0] : null; want.forEach(function (g) { g.rows.forEach(function (r) { body.insertBefore(r, anchor); }); }); } });
    /* the count line in the table's tool row */
    var box = document.querySelector('[data-std-tools="' + t.id + '"]'), on = sfOn(st) || (!own && st.k >= 0);
    if (box) { var n = box.querySelector('.std-sfn'); if (!n) { n = el('span', 'std-sfn'); n.setAttribute('aria-live', 'polite'); box.insertBefore(n, box.firstChild); }
      var h = on ? '<b>' + esc(sw('of', { n: shown, m: full.length })) + '</b>' + (shown ? '' : ' · ' + esc(sw('none'))) + ' <button type="button" class="std-btn" data-std-clr="' + esc(t.id) + '">' + esc(sw('clr')) + '</button>' : '';
      if (n._h !== h) { n.innerHTML = h; n._h = h; } }
    sfSticky(tb); }
  function sfSticky(tb) { if (tb._stdHold || !tb.tHead) return; var top = 0, base = 'var(--std-top,0px)';
    [].forEach.call(tb.tHead.rows, function (r) { var v = 'calc(' + base + ' + ' + top + 'px)'; [].forEach.call(r.cells, function (c) { if (c.style.top !== v) c.style.top = v; }); top += Math.round(r.getBoundingClientRect().height); }); }
  function sfFind(node) { var tb = node.closest && node.closest('table.std-sf'); if (!tb) return null; for (var i = 0; i < sfTabs.length; i++) if (tableEl(sfTabs[i]) === tb) return sfTabs[i]; return null; }
  function sfClosePop() { if (sfPop) { if (sfPop._k && sfPop._k.indexOf('tk:') === 0) [].forEach.call(document.querySelectorAll('[data-std-tk][aria-expanded="true"]'), function (b) { b.setAttribute('aria-expanded', 'false'); }); sfPop.remove(); sfPop = null; } }
  function sfOpen(t, b) { var i = b.getAttribute('data-std-fb'); if (sfPop && sfPop._k === t.id + ':' + i) { sfClosePop(); return; } sfClosePop(); closeCols();
    var tb = tableEl(t), hr = sfHead(tb), st = t._sf, cur = st.f[i] || [], vals = {}, n = 0, emp = 0;
    sfGroups(tb, hr.cells.length).forEach(function (g) { if (!g.full) return; var v = sfTxt(g.main.cells[+i]); if (v) { if (!vals[v]) { vals[v] = 0; n++; } vals[v]++; } else emp++; });
    var its = Object.keys(vals).sort(function (a, b) { var x = sfKey(a), y = sfKey(b); return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), L === 'ru' ? 'ru' : 'en', { numeric: true }); });
    if (emp) its.push('');
    var lab = hr.cells[+i].textContent.replace(/[▲▼]/g, '').trim();
    sfPop = el('div', 'std-pkpop std-sfpop'); sfPop._k = t.id + ':' + i; sfPop.setAttribute('role', 'dialog'); sfPop.setAttribute('aria-label', lab);
    sfPop.innerHTML = '<div class="std-pkh">' + esc(lab) + '</div>' + (its.length > 12 ? '<input type="search" class="std-pkq" placeholder="' + esc(fw('find')) + '" aria-label="' + esc(lab + ' - ' + fw('find')) + '">' : '')
      + '<div class="std-pkls">' + its.map(function (v) { var on = cur.indexOf(v) >= 0; return '<label class="std-pki' + (on ? ' on' : '') + '"><input type="checkbox" value="' + esc(v) + '"' + (on ? ' checked' : '') + '><span>' + esc(v === '' ? sw('empty') : v) + '</span><em>' + (v === '' ? emp : vals[v]) + '</em></label>'; }).join('') + '</div>'
      + '<div class="std-foot"><button type="button" class="std-btn" data-x="clear">' + esc(sw('clrcol')) + '</button><button type="button" class="std-btn" data-x="done" aria-pressed="true">' + esc(w('done')) + '</button></div>';
    document.body.appendChild(sfPop); var r = b.getBoundingClientRect(), ph = sfPop.offsetHeight, y = r.bottom + 4; if (y + ph > innerHeight - 8 && r.top - ph - 4 > 8) y = r.top - ph - 4;
    sfPop.style.top = Math.max(8, y) + 'px'; sfPop.style.left = Math.max(12, Math.min(r.left, innerWidth - sfPop.offsetWidth - 12)) + 'px';
    sfPop.addEventListener('change', function () { st.f[i] = [].map.call(sfPop.querySelectorAll('.std-pkls input:checked'), function (x) { return x.value; });
      [].forEach.call(sfPop.querySelectorAll('.std-pki'), function (l) { l.classList.toggle('on', l.querySelector('input').checked); }); sfApply(t, tb); });
    sfPop.addEventListener('input', function (e) { if (!e.target.classList.contains('std-pkq')) return; var q = e.target.value.trim().toLowerCase();
      [].forEach.call(sfPop.querySelectorAll('.std-pki'), function (l) { l.style.display = !q || l.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none'; }); });
    sfPop.addEventListener('click', function (e) { var x = e.target.closest('button'); if (!x) return; if (x.dataset.x === 'clear') { st.f[i] = []; sfClosePop(); sfApply(t, tb); b.focus(); } else if (x.dataset.x === 'done') { sfClosePop(); b.focus(); } });
    var f = sfPop.querySelector('.std-pkq,input'); if (f) f.focus(); }
  /* v2.6 SITE_TBL_V1: SiteStd.tick({anchor, label, items:[{v, l, n}] | [v], value:[], onChange(vals)}) - the standard tick list (Rickie 13.11
     11:07 "multi select when needed ... include it") for a page that keeps its own filter row (Work Order Manager, others): the same
     window, search box over 12 values, "(empty)", Clear and Done as the template's own tables. The page keeps its own filtering. */
  function tick(o) { var b = o.anchor; if (!b) return; var k = 'tk:' + (b._stdTk || (b._stdTk = String(Math.random()).slice(2)));
    if (sfPop && sfPop._k === k) { sfClosePop(); return; } sfClosePop(); closeCols(); sa(b, 'data-std-tk', '1'); b.setAttribute('aria-expanded', 'true');
    var its = (typeof o.items === 'function' ? o.items() : o.items || []).map(function (x) { return x && typeof x === 'object' ? x : { v: x }; }), cur = (o.value || []).map(String), lab = pick(o.label) || '';
    var pop = sfPop = el('div', 'std-pkpop std-sfpop'); pop._k = k; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', lab);
    pop.innerHTML = (lab ? '<div class="std-pkh">' + esc(lab) + '</div>' : '') + (its.length > 12 ? '<input type="search" class="std-pkq" placeholder="' + esc(fw('find')) + '" aria-label="' + esc(lab + ' - ' + fw('find')) + '">' : '')
      + '<div class="std-pkls">' + its.map(function (x) { var v = String(x.v == null ? '' : x.v), on = cur.indexOf(v) >= 0, t = x.l != null ? pick(x.l) : v;
        return '<label class="std-pki' + (on ? ' on' : '') + '"><input type="checkbox" value="' + esc(v) + '"' + (on ? ' checked' : '') + '><span>' + esc(v === '' && x.l == null ? sw('empty') : t) + '</span>' + (x.n != null ? '<em>' + esc(x.n) + '</em>' : '') + '</label>'; }).join('') + '</div>'
      + '<div class="std-foot"><button type="button" class="std-btn" data-x="clear">' + esc(sw('clrcol')) + '</button><button type="button" class="std-btn" data-x="done" aria-pressed="true">' + esc(w('done')) + '</button></div>';
    document.body.appendChild(pop); var r = b.getBoundingClientRect(), ph = pop.offsetHeight, y = r.bottom + 4; if (y + ph > innerHeight - 8 && r.top - ph - 4 > 8) y = r.top - ph - 4;
    pop.style.top = Math.max(8, y) + 'px'; pop.style.left = Math.max(12, Math.min(r.left, innerWidth - pop.offsetWidth - 12)) + 'px';
    var fire = function (v) { try { if (o.onChange) o.onChange(v); } catch (e) { if (window.console) console.error('SiteStd.tick', e); } };
    pop.addEventListener('change', function () { var v = [].map.call(pop.querySelectorAll('.std-pkls input:checked'), function (x) { return x.value; });
      [].forEach.call(pop.querySelectorAll('.std-pki'), function (l) { l.classList.toggle('on', l.querySelector('input').checked); }); fire(v); });
    pop.addEventListener('input', function (e) { if (!e.target.classList.contains('std-pkq')) return; var q = e.target.value.trim().toLowerCase();
      [].forEach.call(pop.querySelectorAll('.std-pki'), function (l) { l.style.display = !q || l.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none'; }); });
    pop.addEventListener('click', function (e) { var x = e.target.closest('button'); if (!x) return; if (x.dataset.x === 'clear') { sfClosePop(); fire([]); } else if (x.dataset.x === 'done') sfClosePop(); if (b.isConnected) b.focus(); });
    var f = pop.querySelector('.std-pkq,input'); if (f) f.focus(); }
  document.addEventListener('click', function (e) { var x = e.target; if (!x.closest) return;
    if (sfPop && !sfPop.contains(x) && !x.closest('[data-std-fb],[data-std-tk]')) sfClosePop();
    var c = x.closest('[data-std-clr]'); if (c) { sfTabs.forEach(function (t) { if (t.id === c.getAttribute('data-std-clr')) { t._sf.f = {}; t._sf.k = -1; t._sf.d = 1; var tb = tableEl(t); if (tb) { var fr = tb.querySelector('tr.std-flt'); if (fr) [].forEach.call(fr.querySelectorAll('input'), function (i) { i.value = ''; }); sfApply(t, tb); } } }); return; }
    var t = sfFind(x); if (!t) return; var tb = tableEl(t), st = t._sf;
    var fb = x.closest('[data-std-fb]'); if (fb) { sfOpen(t, fb); return; }
    var th = x.closest('th.std-sk'); if (!th || th.parentNode.classList.contains('std-flt') || x.closest('a,button,input,select,textarea,label,.rz,[data-rz]') || Date.now() - (sfFind._rz || 0) < 400) return;
    var k = +th.getAttribute('data-std-sk'); if (st.k !== k) { st.k = k; st.d = 1; } else if (st.d > 0) st.d = -1; else { st.k = -1; st.d = 1; } sfApply(t, tb); });
  document.addEventListener('mousedown', function (e) { if (e.target.closest && e.target.closest('.rz,[data-rz],.std-rz')) sfFind._rz = Date.now(); }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sfPop) { sfClosePop(); return; }
    var th = e.target.closest && e.target.closest('th.std-sk'); if (th && (e.key === 'Enter' || e.key === ' ') && e.target === th) { e.preventDefault(); th.click(); } });
  document.addEventListener('input', function (e) { var x = e.target; if (!x.getAttribute || x.getAttribute('data-std-fx') == null) return; var t = sfFind(x); if (!t) return;
    var st = t._sf, k = x.getAttribute('data-std-fx'); st.f[k] = x.value; st.fk = k; st.fc = x.selectionStart; sfApply(t, tableEl(t)); });
  document.addEventListener('focusout', function (e) { if (e.target.getAttribute && e.target.getAttribute('data-std-fx') != null) { var t = sfFind(e.target); if (t) t._sf.fk = null; } });
  document.addEventListener('std:lang', function () { sfClosePop(); sfTabs.forEach(function (t) { var tb = tableEl(t); if (tb) sfApply(t, tb); }); });
  window.addEventListener('resize', function () { sfTabs.forEach(function (t) { var tb = tableEl(t); if (tb) sfSticky(tb); }); });
  window.addEventListener('scroll', function () { if (sfPop && !sfPop.contains(document.activeElement)) sfClosePop(); }, { passive: true });


  /* ---------- v2.4 SITE_TBL_V1: every column's width can be changed (Rickie 13.11 08:19 "the columns ... cannot be adjusted (the width) for some, lets enforce as a standard") ----------
     On by default for a standard table (sf), or tables:[{..., rz:true}]; off with rz:false. Drag the right edge of a heading: the column
     takes its room from the columns on its right (the next first, each down to 44 px), so the table keeps its width and the page never scrolls sideways. Double-click an edge
     or "Reset widths" in the table's tool row = the page's own widths. Kept per browser and page (std_w_<path>_<id>) as shares of the table
     width, so a column keeps its share on any screen. Phone (the table shown as cards): no edges. */
  var RZW = { en: { rst: '↺ Reset widths', tip: 'Drag to change the width · double-click: the page\'s own width' }, ru: { rst: '↺ Сбросить ширину', tip: 'Потяните, чтобы изменить ширину · двойной щелчок: исходная ширина' } };
  function rw(k) { return RZW[L === 'ru' ? 'ru' : 'en'][k]; }
  function rzOn(t) { return t.rz === true || (t.rz !== false && !!t.sf && (t.sf === true || t.sf.resize !== false)); }
  function rzKey(t) { return 'std_w_' + location.pathname + '_' + t.id; }
  function rzGet(t) { try { var v = JSON.parse(localStorage.getItem(rzKey(t)) || 'null'); return Array.isArray(v) ? v : null; } catch (e) { return null; } }
  function rzPut(t, v) { try { if (v) localStorage.setItem(rzKey(t), JSON.stringify(v)); else localStorage.removeItem(rzKey(t)); } catch (e) {} }
  function rzHead(tb) { return tb.tHead ? (sfHead(tb) || tb.tHead.rows[0]) : null; }
  function rzVis(hr) { return [].filter.call(hr.cells, function (c) { return c.offsetWidth > 0; }); }
  function rzTarget(tb, th) {   /* the element that sets the width: the <col> of a table that has one per heading, else the heading cell */
    var cols = tb.querySelectorAll(':scope > colgroup > col'), hr = rzHead(tb), i = [].indexOf.call(hr.cells, th);
    return cols.length === hr.cells.length && cols[i] ? cols[i] : th; }
  function rzFix(t, tb, fr) {   /* fr = share of the table width per visible heading */
    var hr = rzHead(tb); if (!hr) return; var vs = rzVis(hr); if (vs.length !== fr.length) return false;
    if (!tb._rzO) tb._rzO = { tl: tb.style.tableLayout, w: tb.style.width, el: [] };
    tb.style.tableLayout = 'fixed'; if (!tb.style.width) tb.style.width = '100%'; ca(tb, 'std-rzf');
    vs.forEach(function (th, i) { var e = rzTarget(tb, th); if (!e._rzW) { e._rzW = e.style.width; tb._rzO.el.push(e); } var v = (fr[i] * 100).toFixed(3) + '%'; if (e.style.width !== v) e.style.width = v; });
    return true; }
  function rzReset(t, tb) { rzPut(t, null); var o = tb._rzO; if (o) { o.el.forEach(function (e) { e.style.width = e._rzW || ''; e._rzW = null; }); tb.style.tableLayout = o.tl; tb.style.width = o.w; tb._rzO = null; }
    tb.classList.remove('std-rzf'); rzTools(t); }
  function rzTools(t) { var box = document.querySelector('[data-std-tools="' + t.id + '"]'); if (!box) return; var b = box.querySelector('.std-rzr'), on = !!rzGet(t);
    if (on && !b) { b = el('button', 'std-btn std-rzr'); b.type = 'button'; b.setAttribute('data-std-rzr', t.id); box.appendChild(b); }
    if (b) { if (!on) b.remove(); else if (b.textContent !== rw('rst')) b.textContent = rw('rst'); } }
  function rzApply(t, tb) { var hr = rzHead(tb); if (!hr) return; ca(tb, 'std-rzt');
    var vs = rzVis(hr); vs.forEach(function (th, i) { var g = th.querySelector(':scope > .std-rz');
      if (i === vs.length - 1) { if (g) g.remove(); return; }
      if (!g) { g = el('span', 'std-rz'); g.setAttribute('aria-hidden', 'true'); th.appendChild(g); }
      sa(g, 'data-std-rz', String(i)); sa(g, 'title', rw('tip'));
      if (getComputedStyle(th).position === 'static') th.style.position = 'relative'; });
    var fr = rzGet(t); if (fr && !tb._rzDrag) rzFix(t, tb, fr); rzTools(t); }
  var rzLast = 0, rzDown = {};
  function rzFind(g) { var tb = g.closest('table'); for (var i = 0; i < sfTabs.length; i++) if (tableEl(sfTabs[i]) === tb) return sfTabs[i]; for (var j = 0; j < rzTabs.length; j++) if (tableEl(rzTabs[j]) === tb) return rzTabs[j]; return null; }
  var rzTabs = [];
  document.addEventListener('pointerdown', function (e) { var g = e.target.closest && e.target.closest('.std-rz'); if (!g || e.button > 0) return; var t = rzFind(g); if (!t) return;
    e.preventDefault(); e.stopPropagation(); var tb = tableEl(t), hr = rzHead(tb), vs = rzVis(hr), i = +g.getAttribute('data-std-rz');
    if (rzDown.g === g && Date.now() - rzDown.at < 450) { rzDown = {}; rzLast = Date.now(); rzReset(t, tb); return; }   /* a double press on an edge = the page's own widths */
    rzDown = { g: g, at: Date.now() };
    var px = vs.map(function (c) { return c.getBoundingClientRect().width; }), W = tb.getBoundingClientRect().width, x0 = e.clientX, a0 = px[i], b0 = px[i + 1], MIN = 44;
    if (!vs[i + 1] || !W) return;
    tb._rzDrag = true; rzFix(t, tb, px.map(function (w) { return w / W; })); ca(document.documentElement, 'std-rzing');
    var p0 = px.slice();
    function mv(ev) { var d = Math.max(MIN - a0, ev.clientX - x0), room = 0, j;   /* wider: the columns on the right give room in turn, each down to 44 px; narrower: the next column takes it */
      for (j = i + 1; j < p0.length; j++) room += Math.max(0, p0[j] - MIN); d = Math.min(d, room); px = p0.slice(); px[i] = a0 + d;
      if (d < 0) px[i + 1] = b0 - d; else { var left = d; for (j = i + 1; j < px.length && left > 0; j++) { var take = Math.min(left, Math.max(0, px[j] - MIN)); px[j] -= take; left -= take; } }
      rzFix(t, tb, px.map(function (w) { return w / W; })); }
    function up() { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      tb._rzDrag = false; rzLast = Date.now(); document.documentElement.classList.remove('std-rzing'); rzPut(t, px.map(function (w) { return +(w / W).toFixed(5); })); rzTools(t); sfSticky(tb); }
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up); }, true);
  document.addEventListener('click', function (e) { var x = e.target; if (!x.closest) return;   /* an edge (or the end of a drag) never sorts - also on a page with its own sort */
    if (x.closest('.std-rz') || Date.now() - rzLast < 350) { if (x.closest('thead')) { e.stopPropagation(); e.preventDefault(); } return; }
    var r = x.closest('[data-std-rzr]'); if (r) { var t = null; sfTabs.concat(rzTabs).forEach(function (y) { if (y.id === r.getAttribute('data-std-rzr')) t = y; }); if (t) rzReset(t, tableEl(t)); } }, true);
  document.addEventListener('dblclick', function (e) { var g = e.target.closest && e.target.closest('.std-rz'); if (!g) return; var t = rzFind(g); if (t) { e.stopPropagation(); rzReset(t, tableEl(t)); } }, true);
  document.addEventListener('std:lang', function () { sfTabs.concat(rzTabs).forEach(function (t) { var tb = tableEl(t); if (tb && rzOn(t)) rzApply(t, tb); }); });

  /* ---------- v2.11 TBL_WIDE_V1: wide tables (KB UI_STANDARD §23, Rickie 14.11 09:40 / 10:00 / 10:08, reference page /ncr/) ----------
     Opt in per table:  freeze: <page column number> (frozen up to and including it; -1 none), slider: true,
     status: {col: <page column number>, map: {'Closed': 'done', ...}, re: [[/regexp/, kind], ...], fill: false}.
     Kinds: done (green) · open (amber, row stays white) · void (grey, text grey) · draft (blue) · late (red).
     - Frozen columns stay while the rest slides; a pin on each heading (click = freeze up to here, again = release) and Columns > Freeze
       columns up to; kept per browser. They never take more than 55 % of the table's box (one column on a phone). Only while the table
       is wider than its box; nothing is frozen on a table that fits.
     - Slider in reach: while the box's own sideways bar is below the window, a slider (◀ track ▶) is held at the bottom of the window,
       as wide as the box; it goes when the box's bottom is in view or the table fits.
     - Status: the row gets std-st-<kind> (tint), its first cell the status colour (a bar, or filled with fill:true) and the status as
       its tooltip; the status cell keeps its words. Priority and grade colours are the page's own and are not touched. */
  function wdBox(tb) { for (var e = tb.parentElement, n = 0; e && e !== document.body && n < 6; e = e.parentElement, n++) { var o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll') return e; } return null; }
  function fzCol(t) { var s = tget(t); return s.fz != null ? s.fz : t.freeze; }
  function fzSet(t, k) { var s = tget(t); s.fz = k === t.freeze ? undefined : k; if (s.fz === undefined) delete s.fz; tput(t, s); var tb = tableEl(t); if (tb) { tb._fzK = ''; wdApply(t, tb); } }
  function wdWide(tb, box) { return !!box && box.scrollWidth > box.clientWidth + 1; }
  function fzClear(tb) { [].forEach.call(tb.querySelectorAll('.std-fz'), function (c) { c.classList.remove('std-fz', 'std-fzl'); c.style.left = ''; if (c.hasAttribute('data-std-fzbg')) { c.style.backgroundColor = ''; c.removeAttribute('data-std-fzbg'); } });
    [].forEach.call(tb.querySelectorAll('.std-pin'), function (b) { b.remove(); }); tb.classList.remove('std-fzon'); }
  function solid(c) { var e = c; for (var n = 0; e && n < 8; e = e.parentElement, n++) { var b = getComputedStyle(e).backgroundColor; if (b && b !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(b)) return b; } return '#fff'; }
  function wdApply(t, tb) {
    var box = wdBox(tb), wide = wdWide(tb, box), hr = tb.tHead && sfHead(tb);
    if (tb.getAttribute('data-std-wide') !== '1') tb.setAttribute('data-std-wide', '1');   /* the site gate lets a standard wide table slide (§23) */
    if (!tb._wdRO && window.ResizeObserver) { tb._wdRO = new ResizeObserver(function () { clearTimeout(tb._wdT2); tb._wdT2 = setTimeout(function () { tb._fzK = ''; wdApply(t, tb); }, 40); }); tb._wdRO.observe(tb); if (box) tb._wdRO.observe(box); }
    if (box && !box._wdS) { box._wdS = true; box.addEventListener('scroll', function () { hsPaint(); }, { passive: true }); }
    if (t.slider && wdTabs.indexOf(t) < 0) wdTabs.push(t);
    if (t.freeze != null) {
      if (!wide || !hr) { if (tb.classList.contains('std-fzon')) fzClear(tb); tb._fzK = ''; }
      else {
        var V = [].filter.call(hr.cells, function (c) { return getComputedStyle(c).display !== 'none'; }), k = fzCol(t), n = 0, x = 0, lim = box.clientWidth * 0.55, tl = tb.getBoundingClientRect().left;
        V.forEach(function (c, i) { if (coIdx(c, [].indexOf.call(hr.cells, c)) === k) n = i + 1; });
        if (innerWidth <= 700) n = Math.min(n, 1);
        for (var i = 0; i < n; i++) { x += V[i].getBoundingClientRect().width; if (x > lim) { n = i; break; } }
        var lefts = V.slice(0, n).map(function (c) { return Math.round(c.getBoundingClientRect().left - tl); });
        var key = n + '|' + lefts.join(',') + '|' + tb.rows.length; if (tb._fzK !== key) { tb._fzK = key; fzClear(tb); tb.classList.add('std-fzon');
          [].forEach.call(tb.rows, function (r) { var cells = [].filter.call(r.cells, function (c) { return getComputedStyle(c).display !== 'none'; }), col = 0;
            if (cells.length < 2) return;   /* a detail row spanning the table slides as one */
            for (var j = 0; j < cells.length && col < n; j++) { var c = cells[j], sp = c.colSpan || 1; if (col + sp > n) break;
              c.classList.add('std-fz'); c.style.left = lefts[col] + 'px'; if (col + sp === n) c.classList.add('std-fzl');
              var bg = getComputedStyle(c).backgroundColor; if (!bg || bg === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(bg)) { c.style.backgroundColor = solid(c.parentElement); c.setAttribute('data-std-fzbg', '1'); }
              col += sp; } });
          if (innerWidth > 700) V.forEach(function (c, i) { var b = el('button', 'std-pin'); b.type = 'button'; b.textContent = '📌'; b.title = w('fzT'); b.setAttribute('aria-label', w('fzT') + ': ' + c.textContent.replace(/[▲▼↕]/g, '').trim());
            var ck = coIdx(c, [].indexOf.call(hr.cells, c)); if (i === n - 1) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); } else b.setAttribute('aria-pressed', 'false');
            b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); fzSet(t, i === n - 1 ? -1 : ck); });
            ['mousedown', 'pointerdown'].forEach(function (ev) { b.addEventListener(ev, function (e) { e.stopPropagation(); }); }); c.appendChild(b); });
          tb.setAttribute('data-std-fz', n); }
      }
    }
    hsPaint();
  }
  var wdTabs = [], wdBoxes = [], hsEl = null, hsFor = null;
  /* v2.12: SiteStd.slider(box) - the held slider for a page's own sideways box (an editing grid the page draws itself, e.g. Urgent parts) */
  function sliderFor(b) { if (!b || wdBoxes.indexOf(b) >= 0) return; wdBoxes.push(b); hsPaint(); }
  function hsMake() { hsEl = el('div', 'std-hs'); hsEl.setAttribute('role', 'scrollbar'); hsEl.setAttribute('aria-orientation', 'horizontal'); hsEl.setAttribute('aria-label', w('hsT'));
    hsEl.innerHTML = '<button type="button" data-d="-1">◀</button><div class="std-hstr"><div class="std-hstb"></div></div><button type="button" data-d="1">▶</button>'; hsEl.hidden = true; document.body.appendChild(hsEl);
    var tr = hsEl.querySelector('.std-hstr'), tbb = hsEl.querySelector('.std-hstb'), mx = function () { return hsFor ? hsFor.scrollWidth - hsFor.clientWidth : 0; };
    [].forEach.call(hsEl.querySelectorAll('button'), function (b) { b.title = w('hsT'); b.setAttribute('aria-label', w('hsT') + ' ' + (b.dataset.d < 0 ? '◀' : '▶')); });
    hsEl.addEventListener('click', function (e) { if (!hsFor) return; var b = e.target.closest('button'); if (b) { hsFor.scrollBy({ left: +b.dataset.d * Math.round(hsFor.clientWidth * 0.6), behavior: 'smooth' }); return; }
      if (e.target === tr) { var r = tr.getBoundingClientRect(); hsFor.scrollLeft = (e.clientX - r.left - tbb.offsetWidth / 2) / Math.max(1, r.width - tbb.offsetWidth) * mx(); } });
    tbb.addEventListener('pointerdown', function (e) { if (!hsFor) return; e.preventDefault(); var x0 = e.clientX, s0 = hsFor.scrollLeft, kk = mx() / Math.max(1, tr.clientWidth - tbb.offsetWidth); hsEl.classList.add('std-drag'); try { tbb.setPointerCapture(e.pointerId); } catch (x) {}
      var mv = function (ev) { hsFor.scrollLeft = s0 + (ev.clientX - x0) * kk; }, up = function () { hsEl.classList.remove('std-drag'); tbb.removeEventListener('pointermove', mv); tbb.removeEventListener('pointerup', up); tbb.removeEventListener('pointercancel', up); };
      tbb.addEventListener('pointermove', mv); tbb.addEventListener('pointerup', up); tbb.addEventListener('pointercancel', up); }); }
  function hsPaint() {
    if (!wdTabs.length && !wdBoxes.length) return; var pick2 = null;
    wdTabs = wdTabs.filter(function (t) { var tb = tableEl(t); if (!tb) return true; var box = wdBox(tb); if (!pick2 && wdWide(tb, box)) { var r = box.getBoundingClientRect(); if (r.bottom > innerHeight - 2 && r.top < innerHeight - 120 && r.width > 0) pick2 = box; } return true; });
    wdBoxes.forEach(function (b) { var e = typeof b === 'string' ? document.querySelector(b) : b; if (!e || !e.isConnected) return; if (!e._wdS) { e._wdS = true; e.addEventListener('scroll', function () { hsPaint(); }, { passive: true }); }
      var gt = e.querySelector(':scope > table'); if (gt && gt.getAttribute('data-std-wide') !== '1') gt.setAttribute('data-std-wide', '1');   /* the site gate lets it slide (§23) */
      if (pick2 || e.scrollWidth <= e.clientWidth + 1) return; var r = e.getBoundingClientRect(); if (r.bottom > innerHeight - 2 && r.top < innerHeight - 120 && r.width > 0) pick2 = e; });
    if (!pick2) { if (hsEl) hsEl.hidden = true; hsFor = null; return; }
    if (!hsEl) hsMake(); hsFor = pick2; hsEl.hidden = false; var r = pick2.getBoundingClientRect(); hsEl.style.left = Math.round(r.left) + 'px'; hsEl.style.width = Math.round(r.width) + 'px';
    var tr = hsEl.querySelector('.std-hstr'), tbb = hsEl.querySelector('.std-hstb'), W = tr.clientWidth, tw = Math.max(36, Math.round(W * pick2.clientWidth / pick2.scrollWidth)), m = pick2.scrollWidth - pick2.clientWidth;
    tbb.style.width = tw + 'px'; tbb.style.left = Math.round((W - tw) * (m ? pick2.scrollLeft / m : 0)) + 'px'; hsEl.setAttribute('aria-valuenow', String(Math.round(m ? 100 * pick2.scrollLeft / m : 0))); }
  window.addEventListener('scroll', function () { if (wdTabs.length || wdBoxes.length) hsPaint(); }, { passive: true });
  window.addEventListener('resize', function () { if (wdTabs.length || wdBoxes.length) hsPaint(); });
  setInterval(function () { if (wdBoxes.length && !document.hidden) hsPaint(); }, 1000);   /* v2.12: a box the page fills or resizes later */
  var ST_K = { done: 1, open: 1, void: 1, draft: 1, late: 1 };
  function stKind(t, txt) { var st = t.status, m = st.map || {}; if (m[txt] && ST_K[m[txt]]) return m[txt]; var low = txt.toLowerCase();
    for (var k in m) if (k.toLowerCase() === low && ST_K[m[k]]) return m[k];
    var re = st.re || []; for (var i = 0; i < re.length; i++) if (re[i][0].test(txt) && ST_K[re[i][1]]) return re[i][1]; return ''; }
  function stApply(t, tb) { var col = t.status.col; ca(tb, 'std-stt'); if (t.status.fill) ca(tb, 'std-stfill');
    [].forEach.call(tb.tBodies, function (body) { [].forEach.call(body.rows, function (tr) { if (tr.cells.length < 2) return;
      var c = null; if (t.ord) c = tr.querySelector(':scope>[data-std-c="' + col + '"]'); if (!c) c = tr.cells[col]; if (!c) return;
      var txt = (c.getAttribute('data-v') || c.textContent || '').replace(/\s+/g, ' ').trim(), k = stKind(t, txt), want = k ? 'std-st-' + k : '';
      ['done', 'open', 'void', 'draft', 'late'].forEach(function (x) { if ('std-st-' + x !== want && tr.classList.contains('std-st-' + x)) tr.classList.remove('std-st-' + x); });
      if (want && !tr.classList.contains(want)) tr.classList.add(want);
      var f = tr.cells[0]; if (f && k && f.getAttribute('data-std-st') !== txt) { f.setAttribute('data-std-st', txt); if (!f.title) f.title = txt; } }); }); }

  var stdTabs = {};   /* v2.14: the tables by id, for SiteStd.order */
  function orderApi(id, o) { var t = stdTabs[id], tb = t && tableEl(t); if (!t || !tb || !t.ord) return null;
    if (o === undefined) return coOrder(t, tb);
    if (o === null) { var st = tget(t); st.o = tdef(t).o; tput(t, st); t._sf = null; var fr = tb.tHead && tb.tHead.querySelector('tr.std-flt'); if (fr) fr.remove(); if (rzGet(t)) rzReset(t, tb); applyTable(t); return coOrder(t, tb); }
    var pz = coPin(t), cur = coOrder(t, tb); if (pz.some(function (c) { return o.indexOf(c) !== cur.indexOf(c); })) return cur;   /* pinned columns keep their place */
    coSet(t, tb, o.slice()); return coOrder(t, tb); }
  function wireTable(t) {
    if (t && t.id) stdTabs[t.id] = t;
    var tb = tableEl(t); if (!tb || tb._stdWired) { if (tb) applyTable(t); return; }
    if (rzOn(t) && !t.sf && rzTabs.indexOf(t) < 0) rzTabs.push(t);
    tb._stdWired = true; applyTable(t);
    var box = t.tools ? document.querySelector(t.tools) : null;
    if (!box) { box = el('div', 'std-tools'); var wrap = tb.closest('.tw,.tblwrap,.scroll') || tb; wrap.parentNode.insertBefore(box, wrap); }
    else ca(box, 'std-tools');
    box.setAttribute('data-std-tools', t.id); box._stdT = t; paintTools(box);
    if (rzOn(t)) rzTools(t);   /* v2.11: a table whose tool row is made here (no tools: in its config) offers Reset widths at once after a reload - it waited for the next change in the table */
    if (t.sf) sfApply(t, tb);   /* v2.7: a table the page redrew while a filter was on gets its "N of M lines" at once (the tool row did not exist yet) */
    if (t.expand) tb.addEventListener('click', function (e) {
      if (e.target.closest('a,button,input,select,textarea,label,summary,[contenteditable]')) return;
      if (String(window.getSelection && window.getSelection())) return;
      var tr = e.target.closest('tbody tr'); if (tr && tr.parentNode.parentNode === tb) tr.classList.toggle('std-open');
    });
    var mo = new MutationObserver(function () { clearTimeout(tb._stdT); tb._stdT = setTimeout(function () { applyTable(t); }, 30); });
    mo.observe(tb, { childList: true, subtree: true });
  }

  /* ---------- v1.5: the standard filter bar (KB UI_STANDARD §9.2, Rickie 28.10 "Approve") ----------
     Row 1 scope (Primary · Support · Auxiliary · All) + period, count on the right; row 2 Group · Asset range · Manufacturer · Model
     pickers, the page's "More", search, Copy link / Save view on the right; row 3 the active filters as chips + Clear filters.
     A page keeps its own state and handlers: these are building blocks (picker, chips, seg) and the look (.std-fb CSS). */
  var FT = {
    all: ['All', 'Все'], any: ['Any', 'Любые'], find: ['Search…', 'Поиск…'], clear: ['Clear', 'Сбросить'], clearAll: ['Clear filters', 'Сбросить фильтры'],
    none: ['Nothing matches', 'Ничего не найдено'], rm: ['Remove filter', 'Убрать фильтр'], sel: ['selected', 'выбрано'],
    grp: ['Group', 'Группа'], rng: ['Asset range', 'Вид техники'], mk: ['Manufacturer', 'Производитель'], md: ['Model', 'Модель'],
    Primary: ['Primary', 'Основной'], Support: ['Support', 'Вспомогательный'], Auxiliary: ['Auxiliary', 'Дополнительный'], All: ['All', 'Весь парк'], scope: ['Scope', 'Охват']
  };
  function fw(k) { var v = FT[k]; return v ? v[L === 'ru' ? 1 : 0] : k; }
  var pickers = [], pkPop = null, pkFor = null;
  function itemLabel(it) { return it.l == null ? String(it.v) : pick(it.l); }
  function pkItems(p) { var x = p.cfg.items; try { return (typeof x === 'function' ? x() : x) || []; } catch (e) { return []; } }
  function pkPaint(p) {
    var v = p.val, its = pkItems(p), lab = pick(p.cfg.label) || '', txt;
    if (!v.length) txt = pick(p.cfg.all) || fw('all');
    else { var f = its.filter(function (i) { return String(i.v) === String(v[0]); })[0]; txt = f ? itemLabel(f) : String(v[0]); if (v.length > 1) txt += ' +' + (v.length - 1); }
    /* v1.6: nothing chosen = the label alone ("Group ▾"); a choice = "Group: Haul ▾" in navy. The value stays in the markup (screen
       readers, tests) and is only not drawn while it says "All" - one filter bar line fits in Russian as well as English */
    var h = '<span class="std-pkl">' + esc(lab) + '</span><span class="std-pkv">: <b>' + esc(txt) + '</b></span><i aria-hidden="true">▾</i>';
    if (p.el._stdH !== h) { p.el.innerHTML = h; p.el._stdH = h; }
    sa(p.el, 'aria-label', lab + ': ' + txt); if (v.length) sa(p.el, 'data-on', '1'); else if (p.el.hasAttribute('data-on')) p.el.removeAttribute('data-on');
    sa(p.el, 'title', lab + ': ' + txt);   /* never disabled: a list that is still loading opens as "Nothing matches" and fills in, never a dead button */
  }
  function pkClose(back) { if (pkPop) { pkPop.remove(); pkPop = null; } if (pkFor) { pkFor.el.setAttribute('aria-expanded', 'false'); if (back) pkFor.el.focus(); } pkFor = null; }
  function pkSet(p, v, fire) { p.val = (v || []).map(String).filter(function (x, i, a) { return a.indexOf(x) === i; }); if (!p.cfg.multi && p.val.length > 1) p.val = p.val.slice(-1); pkPaint(p); if (fire && p.cfg.onChange) try { p.cfg.onChange(p.val.slice()); } catch (e) {} }
  function pkList(p, q) {
    var its = pkItems(p), qq = (q || '').trim().toLowerCase();
    var vis = its.filter(function (i) { return !qq || itemLabel(i).toLowerCase().indexOf(qq) >= 0 || String(i.v).toLowerCase().indexOf(qq) >= 0; });
    if (!vis.length) return '<div class="std-pkno">' + esc(fw('none')) + '</div>';
    return vis.map(function (i) { var on = p.val.indexOf(String(i.v)) >= 0;
      return '<label class="std-pki' + (on ? ' on' : '') + '"><input type="' + (p.cfg.multi ? 'checkbox' : 'radio') + '" name="stdpk" value="' + esc(i.v) + '"' + (on ? ' checked' : '') + '><span>' + esc(itemLabel(i)) + '</span>' + (i.n != null ? '<em>' + esc(i.n) + '</em>' : '') + '</label>'; }).join('');
  }
  function pkOpen(p) {
    if (pkFor === p) { pkClose(true); return; } pkClose(); hidePop(); closeCols();
    var its = pkItems(p), lab = pick(p.cfg.label);
    pkPop = el('div', 'std-pkpop'); pkPop.setAttribute('role', 'dialog'); pkPop.setAttribute('aria-label', lab); pkPop.id = 'stdPk';
    pkPop.innerHTML = '<div class="std-pkh">' + esc(lab) + (p.val.length ? ' · ' + p.val.length + ' ' + esc(fw('sel')) : '') + '</div>' +
      (its.length > 12 ? '<input type="search" class="std-pkq" placeholder="' + esc(fw('find')) + '" aria-label="' + esc(lab + ' - ' + fw('find')) + '">' : '') +
      '<div class="std-pkls" role="group" aria-label="' + esc(lab) + '">' + pkList(p, '') + '</div>' +
      '<div class="std-foot"><button type="button" class="std-btn" data-x="clear">' + esc(fw('clear')) + '</button><button type="button" class="std-btn" data-x="done" aria-pressed="true">' + esc(w('done')) + '</button></div>';
    document.body.appendChild(pkPop); pkFor = p; p.el.setAttribute('aria-expanded', 'true');
    var r = p.el.getBoundingClientRect(), pw = pkPop.offsetWidth, ph = pkPop.offsetHeight;
    var y = r.bottom + 6; if (y + ph > innerHeight - 8 && r.top - ph - 6 > 8) y = r.top - ph - 6;
    pkPop.style.top = Math.max(8, y) + 'px'; pkPop.style.left = Math.max(12, Math.min(r.left, innerWidth - pw - 12)) + 'px';
    var q = pkPop.querySelector('.std-pkq'), ls = pkPop.querySelector('.std-pkls');
    if (q) q.addEventListener('input', function () { ls.innerHTML = pkList(p, q.value); });
    pkPop.addEventListener('change', function (e) { var i = e.target; if (!i.name) return; var v = i.value, cur = p.val.slice();
      if (p.cfg.multi) { if (i.checked) cur.push(v); else cur = cur.filter(function (x) { return x !== v; }); } else cur = [v];
      pkSet(p, cur, true); i.closest('label').classList.toggle('on', i.checked); if (!p.cfg.multi) pkClose(true);
      var hh = pkPop && pkPop.querySelector('.std-pkh'); if (hh) hh.textContent = lab + (p.val.length ? ' · ' + p.val.length + ' ' + fw('sel') : ''); });
    pkPop.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.x === 'clear') { pkSet(p, [], true); ls.innerHTML = pkList(p, q ? q.value : ''); var hh = pkPop.querySelector('.std-pkh'); hh.textContent = lab; }
      if (b.dataset.x === 'done') pkClose(true); });
    pkPop.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); pkClose(true); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { var xs = [].slice.call(pkPop.querySelectorAll('.std-pkq,.std-pkls input')), k = xs.indexOf(document.activeElement);
        if (xs.length) { e.preventDefault(); xs[Math.max(0, Math.min(xs.length - 1, k + (e.key === 'ArrowDown' ? 1 : -1)))].focus(); } }
      if (e.key === 'Enter' && e.target.type === 'checkbox') { e.preventDefault(); e.target.click(); } });
    (q || pkPop.querySelector('.std-pkls input') || pkPop.querySelector('button')).focus();
  }
  document.addEventListener('mousedown', function (e) { if (pkPop && !pkPop.contains(e.target) && !(pkFor && pkFor.el.contains(e.target))) pkClose(); });
  addEventListener('resize', function () { if (pkPop) pkClose(); });
  /* SiteStd.picker({label:{en,ru}, items:[{v, l:{en,ru}|text, n}] | ()=>[...], value:[], multi:true, all:{en,ru}, onChange(vals), el?:button})
     -> {el, get(), set(vals), refresh()}. Items come from the page each time it opens, so a picker never shows a stale list. */
  function picker(c) {
    var b = c.el || el('button', 'std-pk'); b.type = 'button'; ca(b, 'std-pk'); b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false');
    var p = { el: b, cfg: c, val: [] }; if (c.multi == null) c.multi = true;
    b.addEventListener('click', function () { pkOpen(p); });
    pkSet(p, c.value || [], false); pickers = pickers.filter(function (q) { return q.el.isConnected || !q.el._stdOn; }); pickers.push(p);   /* v2.5: pickers the page has thrown away are let go */
    return { el: b, get: function () { return p.val.slice(); }, set: function (v) { pkSet(p, v, false); }, refresh: function () { pkPaint(p); },
      open: function () { pkOpen(p); }, close: function () { pkClose(); } };
  }
  /* SiteStd.chips(box, [{label:{en,ru}|text, value:text, remove()}], clear()) - the active filters, each with ✕, then Clear filters */
  function chips(box, list, clear) {
    if (!box) return; ca(box, 'std-fchips'); list = list || [];
    box.innerHTML = list.map(function (x, i) { var lab = pick(x.label); return '<span class="std-fc"><span>' + (lab ? esc(lab) + ': ' : '') + '<b>' + esc(pick(x.value)) + '</b></span><button type="button" data-i="' + i + '" aria-label="' + esc(fw('rm') + ' ' + lab + ' ' + pick(x.value)) + '">✕</button></span>'; }).join('') +
      (list.length && clear ? '<button type="button" class="std-fclr">' + esc(fw('clearAll')) + '</button>' : '');
    box.hidden = !list.length;
    box.onclick = function (e) { var b = e.target.closest('button'); if (!b) return; if (b.classList.contains('std-fclr')) { if (clear) clear(); return; } var x = list[+b.dataset.i]; if (x && x.remove) x.remove(); };
  }
  /* SiteStd.fseg(box, [[value, {en,ru}|text]], current, onPick) - a light segmented control for scope / period in a filter bar */
  function fseg(box, opts, cur, fn) {
    ca(box, 'std-fseg'); sa(box, 'role', 'group');
    var h = opts.map(function (o) { return '<button type="button" data-v="' + esc(o[0]) + '" aria-pressed="' + (String(o[0]) === String(cur)) + '">' + esc(pick(o[1])) + '</button>'; }).join('');
    if (box._stdH !== h) { box.innerHTML = h; box._stdH = h; }
    box.onclick = function (e) { var b = e.target.closest('button'); if (b && fn) fn(b.dataset.v); };
  }
  /* SiteStd.models() -> Promise<Map unit -> "Manufacturer Model">, from the CM register this site publishes (/cm/mobile/assets.js),
     the rule Assets Down already uses (ACD_RANGEX_V1). makes = Map unit -> 1C manufacturer (to strip a doubled make). {} on failure. */
  var modelsP = null;
  function models(makes) {
    if (!modelsP) modelsP = new Promise(function (res) {
      if (window.ASSETS) return res(window.ASSETS);
      var s = document.createElement('script'), t = setTimeout(function () { res([]); }, 10000);
      s.src = '/cm/mobile/assets.js'; s.async = true; s.onload = function () { clearTimeout(t); res(window.ASSETS || []); }; s.onerror = function () { clearTimeout(t); res([]); };
      document.head.appendChild(s); });
    return modelsP.then(function (list) { var M = new Map();
      try { (list || []).forEach(function (x) { var n = String(x.n || '').toUpperCase(); if (!n) return;
        var md = x.mk && String(x.mk).indexOf('|') >= 0 ? String(x.mk).split('|')[1] : (x.m || ''); md = String(md).trim();
        var mf = makes && makes.get ? (makes.get(n) || '').trim() : ''; if (mf && md.toUpperCase().indexOf(mf.toUpperCase() + ' ') === 0) md = md.slice(mf.length + 1).trim();
        if (md) M.set(n, (mf ? mf + ' ' : '') + md); }); } catch (e) {}
      return M; });
  }
  /* SiteStd.dims(units, modelMap) - one asset register for every page's filters. units = [{a, ap, g:[..], r, m}] (Assets Down's acd.json
     shape). Returns {scope:{Primary:n,..}, group, range, make, model} as picker items with counts, and match(unit, sel) where
     sel = {scope, group:[], range:[], make:[], model:[]} (empty = any). */
  function dims(units, M) {
    units = units || []; M = M || new Map();
    var cnt = function (f) { var m = {}; units.forEach(function (u) { [].concat(f(u) || []).forEach(function (v) { if (v) m[v] = (m[v] || 0) + 1; }); });
      return Object.keys(m).sort(function (a, b) { return a.localeCompare(b); }).map(function (v) { return { v: v, n: m[v] }; }); };
    var sc = { Primary: 0, Support: 0, Auxiliary: 0, All: units.length }; units.forEach(function (u) { if (sc[u.ap] != null) sc[u.ap]++; });
    var md = function (u) { return M.get(String(u.a || '').toUpperCase()) || ''; };
    var F = { group: function (u) { return u.g; }, range: function (u) { return u.r; }, make: function (u) { return u.m; }, model: md };
    var has = function (sel, v) { return !sel || !sel.length || [].concat(v || []).some(function (x) { return sel.indexOf(String(x)) >= 0; }); };
    var match = function (u, s, skip) { s = s || {}; if (s.scope && s.scope !== 'All' && s.scope !== 'Total' && u.ap !== s.scope) return false;
      for (var k in F) if (k !== skip && !has(s[k], F[k](u))) return false; return true; };
    return { scope: sc, group: cnt(F.group), range: cnt(F.range), make: cnt(F.make), model: cnt(md), modelOf: md, match: function (u, s) { return match(u, s); },
      /* facet(key, sel): the picker list for one key, counted inside every OTHER active filter (scope included), so a list never offers
         a choice that gives nothing; a value already chosen stays in the list (count 0) so it can be taken off */
      facet: function (k, s) { s = s || {}; var keep = units; units = units.filter(function (u) { return match(u, s, k); }); var r = cnt(F[k]); units = keep;
        (s[k] || []).forEach(function (v) { if (!r.some(function (i) { return i.v === v; })) r.push({ v: v, n: 0 }); }); return r; } };
  }
  function repaintFb() { pickers.forEach(function (p) { if (document.body.contains(p.el)) { p.el._stdOn = 1; pkPaint(p); } }); if (pkPop) pkClose(); }

  /* ---------- start ---------- */
  function init(c) { try { init0(c); } finally { document.documentElement.setAttribute('data-std', 'SITE_STD_V1'); } }
  function init0(c) {
    cfg = c || {}; L = stored();
    var pl = pageLang();
    if (cfg.lang && cfg.lang.set && pl !== L && !cfg.lang.urlWins) { try { cfg.lang.set(L); } catch (e) {} }
    else if (pl !== L) { L = pl; store(L); }
    var dk = document.documentElement;
    if (cfg.page) dk.setAttribute('data-std-page', cfg.page); if (cfg.sub) dk.setAttribute('data-std-sub', cfg.sub); else dk.removeAttribute('data-std-sub');   /* v1.9: the page column (std.css) can follow the page */
    var nav = el('nav', 'std-nav std-dk'); nav.id = 'stdNav'; var subn = el('nav', 'std-sub std-dk'); subn.id = 'stdSub'; subn.hidden = true;
    var band = el('header', 'std-band'); band.id = 'stdBand';
    var foot = el('footer', 'std-foot-site std-dk'); foot.id = 'stdFoot';
    document.body.insertBefore(band, document.body.firstChild); document.body.insertBefore(nav, band); document.body.insertBefore(subn, band); document.body.appendChild(foot);
    (cfg.hide || []).forEach(function (s) { [].forEach.call(document.querySelectorAll(s), function (e) { e.setAttribute('data-std-hidden', '1'); e.hidden = true; e.style.setProperty('display', 'none', 'important'); }); });
    paintBand();
    runTips();
    (cfg.tables || []).forEach(wireTable);
    if (cfg.watch) { var mo = new MutationObserver(function (recs) { if (recs.every(function (r) { return ours(r.target); })) return; clearTimeout(init._t); init._t = setTimeout(function () { sync(); runTips(); (cfg.tables || []).forEach(wireTable); if (cfg.after) try { cfg.after(L); } catch (e) {} }, 60); }); cfg.watch.forEach(function (s) { var e = document.querySelector(s); if (e) mo.observe(e, { attributes: true, childList: true, subtree: true, characterData: true }); }); }
    if (cfg.after) try { cfg.after(L); } catch (e) {}
    /* v1.2: the menu stays at the top while scrolling (as on the homepage) - unless the page pins its own bar at the top
       (Assets Down / Asset history filter bars): that bar keeps the top, and the menu scrolls away with the page */
    var own = [].some.call(document.body.querySelectorAll('*'), function (e) { if (ours(e) || /^(TH|TD|TR|THEAD|CAPTION)$/.test(e.tagName)) return false; var c = getComputedStyle(e); return c.position === 'sticky' && parseFloat(c.top) <= 0; });
    if (own) ca(nav, 'std-nav-free');
    if (own) ca(subn, 'std-nav-free');
    var setTop = function () { var n = own ? 0 : (nav.offsetHeight || 0), h = own ? 0 : n + (subn.hidden ? 0 : subn.offsetHeight); if (dk.style.getPropertyValue('--std-navh') !== n + 'px') dk.style.setProperty('--std-navh', n + 'px'); if (dk.style.getPropertyValue('--std-top') !== h + 'px') dk.style.setProperty('--std-top', h + 'px'); };
    setTop(); window.addEventListener('resize', setTop);
  }
  window.SiteStd = { init: init, tip: function (host, text) { var b = tipBtn(text); host.appendChild(b); return b; }, tipFromNote: tipFromNote,
    lang: function () { return L; }, t: w, sync: sync, refresh: function () { paintBand(); runTips(); (cfg && cfg.tables || []).forEach(wireTable); }, table: wireTable, slider: sliderFor, order: orderApi, sfKey: sfKey, _held: function () { return heldTables.length; }, _pickers: function () { return pickers.length; }, picker: picker, tick: tick, chips: chips, fseg: fseg, models: models, dims: dims, ft: fw, version: 'SITE_STD_V1', rev: '2.14' };
})();
