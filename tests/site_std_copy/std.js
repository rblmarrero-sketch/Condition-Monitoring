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
    show: ['Show columns', 'Показать столбцы'], rows: ['Row height', 'Высота строки'],
    dc: ['Compact', 'Компактно'], ds: ['Standard', 'Стандарт'], df: ['Full', 'Полностью'],
    reset: ['Reset', 'Сбросить'], done: ['Done', 'Готово'], info: ['More information', 'Подробнее'],
    tsite: ['Site time', 'Время площадки'], src: ['Source', 'Источник'], cnt: ['Failure counting', 'Подсчёт отказов'],
    tbl: ['Table settings are kept in this browser only.', 'Настройки таблицы хранятся только в этом браузере.'],
    nav: ['Main navigation', 'Главное меню']
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
  var SUB = { dwm: [
    ['wom', 'Work Order Manager', 'Менеджер нарядов', '/wo_manager.html', function (l) { return /wo_manager\.html$/.test(l.pathname) && !/^#dq/.test(l.hash); }],
    ['dql', 'Data quality (live)', 'Качество данных (онлайн)', '/wo_manager.html#dq?scope=All', function (l) { return /wo_manager\.html$/.test(l.pathname) && /^#dq/.test(l.hash); }],
    ['dqr', 'Data quality report', 'Отчёт о качестве данных', '/dq_latest.html', function (l) { return /(dq_latest|DQ_email_report)[^/]*\.html$/.test(l.pathname); }]] };
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
    repaintFb(); if (lc) try { document.dispatchEvent(new CustomEvent('std:lang', { detail: L })); } catch (e) {}
  }
  function pageLang() { try { var l = cfg.lang && cfg.lang.get && cfg.lang.get(); if (l) return String(l).toLowerCase() === 'ru' ? 'ru' : 'en'; } catch (e) {} return L; }
  function setLang(l) { l = l === 'ru' ? 'ru' : 'en'; store(l); if (cfg.lang && cfg.lang.set) { try { cfg.lang.set(l); } catch (e) {} } L = l; paintBand(); }
  function sync() { var l = pageLang(); if (l !== L) { L = l; store(l); paintBand(); } else if (cfg.repaint) paintBand(); }

  /* ---------- tables ---------- */
  function tkey(t) { return 'std_tbl_' + cfg.page + '_' + t.id; }
  function tdef(t) { return { h: (t.def && t.def.h || []).slice(), d: t.def && t.def.d || 's' }; }
  function tget(t) { var s = null; try { s = JSON.parse(localStorage.getItem(tkey(t)) || 'null'); } catch (e) {} return s || tdef(t); }
  function tput(t, s) { try { var d = tdef(t); if (!s || (JSON.stringify((s.h || []).slice().sort()) === JSON.stringify(d.h.slice().sort()) && (s.d || 's') === d.d)) localStorage.removeItem(tkey(t)); else localStorage.setItem(tkey(t), JSON.stringify(s)); } catch (e) {} }
  function tableEl(t) { return document.querySelector(t.sel); }
  function heads(tb) { var r = tb.tHead && tb.tHead.rows[tb.tHead.rows.length - 1]; return r ? [].map.call(r.cells, function (c) { return c.textContent.replace(/[▲▼↕]/g, '').trim(); }) : []; }
  /* v1.2: column headers stay in view under the menu. A table in a sideways scroller cannot use position:sticky against the page
     (the scroller is its sticky container), so its header row is moved down while the table passes under the menu. */
  var heldTables = [];
  function frame(tb) {
    var w = tb.parentElement; if (!w || w === document.body || tb._stdHold) return;
    var cs = getComputedStyle(w); if (!/^(auto|scroll|hidden|clip)$/.test(cs.overflowX) || cs.maxHeight !== 'none') return;
    tb._stdHold = true; ca(tb, 'std-hold'); heldTables.push(tb); hold();
  }
  function hold() {
    var top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--std-top')) || 0;
    heldTables.forEach(function (tb) { var th = tb.tHead; if (!th) return; var r = tb.getBoundingClientRect(), h = th.getBoundingClientRect().height;
      var d = Math.max(0, Math.min(top - r.top, r.height - h - 2)); var v = d > 0 ? 'translateY(' + Math.round(d) + 'px)' : '';
      [].forEach.call(th.rows, function (row) { [].forEach.call(row.cells, function (c) { if (c.style.transform !== v) c.style.transform = v; }); });
      if (tb.classList.contains('std-held') !== d > 0) tb.classList.toggle('std-held', d > 0); });
  }
  window.addEventListener('scroll', function () { if (heldTables.length) hold(); }, { passive: true });
  window.addEventListener('resize', function () { if (heldTables.length) hold(); });
  function applyTable(t) {
    var tb = tableEl(t); if (!tb) return; frame(tb);
    var s = tget(t), hid = s.h || [];
    ca(tb, 'std-tbl'); if (t.expand) ca(tb, 'std-x');
    sa(tb, 'data-std-d', s.d || 's'); sa(tb, 'data-std-id', t.id);
    var css = hid.map(function (i) { var n = i + 1; return t.sel + ' tr>*:nth-child(' + n + '){display:none}' + t.sel + ' col:nth-child(' + n + '){visibility:collapse}'; }).join('\n');
    var st = document.getElementById('stdCols_' + t.id); if (!st) { st = el('style'); st.id = 'stdCols_' + t.id; document.head.appendChild(st); } if (st.textContent !== css) st.textContent = css;
    [].forEach.call(tb.tBodies, function (body) {
      [].forEach.call(body.rows, function (tr) {
        [].forEach.call(tr.cells, function (td, i) {
          if (t.lock && t.lock.indexOf(i) >= 0) ca(td, 'std-lock');
          if (t.free && t.free.indexOf(i) >= 0 && !td.querySelector(':scope > .std-cl')) {
            var inner = td.querySelector(':scope > .cl'); if (inner) { ca(inner, 'std-cl'); return; }
            var d = el('div', 'std-cl'); while (td.firstChild) d.appendChild(td.firstChild); td.appendChild(d);
          }
        });
      });
    });
    if (tb.tHead) [].forEach.call(tb.tHead.rows, function (r) { [].forEach.call(r.cells, function (th, i) { if (t.lock && t.lock.indexOf(i) >= 0) ca(th, 'std-lock'); }); });
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
  function closeCols() { if (colPop) { colPop.remove(); colPop = null; } }
  function openCols(t, btn) {
    closeCols(); var tb = tableEl(t); if (!tb) return; var s = tget(t), hid = s.h || [], H = heads(tb);
    colPop = el('div', 'std-colpop'); colPop.setAttribute('role', 'dialog'); colPop.setAttribute('aria-label', w('cols'));
    var html = '<h4>' + esc(w('show')) + '</h4>' + H.map(function (h, i) { if (!h || (t.lock && t.lock.indexOf(i) === 0 && i === 0)) return ''; return '<label><input type="checkbox" data-c="' + i + '"' + (hid.indexOf(i) < 0 ? ' checked' : '') + '>' + esc(h) + '</label>'; }).join('');
    html += '<h4 style="margin-top:12px">' + esc(w('rows')) + '</h4><div class="std-seg2">' + [['c', w('dc')], ['s', w('ds')], ['f', w('df')]].map(function (o) { return '<button type="button" class="std-btn" data-d="' + o[0] + '" aria-pressed="' + ((s.d || 's') === o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>';
    html += '<div class="std-foot"><button type="button" class="std-btn" data-x="reset">↺ ' + esc(w('reset')) + '</button><button type="button" class="std-btn" data-x="done" aria-pressed="true">' + esc(w('done')) + '</button></div><p style="margin:8px 0 0;color:var(--std-mut,#5b6670);font-size:12px">' + esc(w('tbl')) + '</p>';
    colPop.innerHTML = html; document.body.appendChild(colPop);
    var r = btn.getBoundingClientRect(); colPop.style.top = Math.min(r.bottom + 6, innerHeight - colPop.offsetHeight - 8) + 'px'; colPop.style.left = Math.max(12, Math.min(r.right - colPop.offsetWidth, innerWidth - colPop.offsetWidth - 12)) + 'px';
    colPop.addEventListener('change', function (e) { var i = +e.target.dataset.c; var h = (tget(t).h || []).filter(function (x) { return x !== i; }); if (!e.target.checked) h.push(i); var st = tget(t); st.h = h; tput(t, st); applyTable(t); });
    colPop.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.d) { var st = tget(t); st.d = b.dataset.d; tput(t, st); applyTable(t); [].forEach.call(colPop.querySelectorAll('[data-d]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); }); }
      if (b.dataset.x === 'reset') { tput(t, null); applyTable(t); openCols(t, btn); }
      if (b.dataset.x === 'done') closeCols();
    });
    var f = colPop.querySelector('input,button'); if (f) f.focus();
  }
  document.addEventListener('mousedown', function (e) { if (colPop && !colPop.contains(e.target) && !(e.target.closest && e.target.closest('.std-tools'))) closeCols(); });
  function wireTable(t) {
    var tb = tableEl(t); if (!tb || tb._stdWired) { if (tb) applyTable(t); return; }
    tb._stdWired = true; applyTable(t);
    var box = t.tools ? document.querySelector(t.tools) : null;
    if (!box) { box = el('div', 'std-tools'); var wrap = tb.closest('.tw,.tblwrap,.scroll') || tb; wrap.parentNode.insertBefore(box, wrap); }
    else ca(box, 'std-tools');
    box.setAttribute('data-std-tools', t.id); box._stdT = t; paintTools(box);
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
    pkSet(p, c.value || [], false); pickers.push(p);
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
  function repaintFb() { pickers.forEach(function (p) { if (document.body.contains(p.el)) pkPaint(p); }); if (pkPop) pkClose(); }

  /* ---------- start ---------- */
  function init(c) { try { init0(c); } finally { document.documentElement.setAttribute('data-std', 'SITE_STD_V1'); } }
  function init0(c) {
    cfg = c || {}; L = stored();
    var pl = pageLang();
    if (cfg.lang && cfg.lang.set && pl !== L && !cfg.lang.urlWins) { try { cfg.lang.set(L); } catch (e) {} }
    else if (pl !== L) { L = pl; store(L); }
    var dk = document.documentElement;
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
    lang: function () { return L; }, t: w, sync: sync, refresh: function () { paintBand(); runTips(); (cfg && cfg.tables || []).forEach(wireTable); }, table: wireTable, picker: picker, chips: chips, fseg: fseg, models: models, dims: dims, ft: fw, version: 'SITE_STD_V1', rev: '1.7' };
})();
