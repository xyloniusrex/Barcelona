/* app.js - screen router and UI.
 *
 * Every screen is built as an HTML string and re-rendered on navigation. All
 * user-visible text goes through T() (Store.t): English keys, translated by the
 * server table in server/i18n.py. The planet scenes live in js/stage.js.
 *
 * Shape of the app:
 *   top bar   PoliGo logo (-> Home) . language . theme . Home . Profile
 *   Home      globe with Romania + your destination, live countdown
 *   menu      centred in the top bar on every screen after login (two rows on a phone)
 *   screens   universities (list / map / favorite in one screen) . my subjects (explore),
 *             today / plan (calendar + steps) / documents (journey)
 *   pending   "I got accepted" waits for an admin to approve it before the journey opens
 *   intro     full-screen start window after you are accepted (and on every launch)
 */
const App = (() => {
  const NAVS = {
    explore: [
      ['map', 'Universities'],
      ['shortlist', 'Favorite'],
      ['subjects', 'My subjects'],
    ],
    journey: [
      ['today', 'Today'],
      ['plan', 'Plan'],
      ['docs', 'Documents'],
      ['scanJ', 'Scan'],
    ],
  };
  const NAV_ICONS = {
    map: 'landmark', shortlist: 'bookmark', subjects: 'check',
    today: 'sun', plan: 'calendar-days', docs: 'file-text', scanJ: 'scan-line',
  };
  // the menu sits in the top bar on every screen after login, except these
  const NO_NAV = new Set(['landing', 'auth', 'onboarding', 'admin']);
  const KNOWN = new Set(['landing', 'auth', 'onboarding', 'uni', 'subjects', 'scanJ', 'admin', 'home', 'profile', 'map',
    'universities', 'shortlist', 'today', 'plan', 'docs']);
  // old screen names (links, saved state, the terminal) -> where they live now
  // "map" is the one Universities screen; Store.state.mapTab picks list / map / favorite.
  const ALIAS = { calendar: 'plan', timeline: 'plan', docsSetup: 'docs', shortlist: 'map', universities: 'map' };
  // which sub-tab an old screen name opens
  const ALIAS_TAB = { shortlist: 'favorite', universities: 'list' };
  const STAGES = ['before', 'arrival', 'during', 'before-return', 'after-return'];
  const STAGE_LABELS = {
    before: 'Before departure', arrival: 'Arrival (first 2 weeks)', during: 'During',
    'before-return': 'Before return', 'after-return': 'After return',
  };
  const DOC_TYPES = ['ID card', 'Passport', 'Student ID', 'EHIC card', 'Grant contract', 'Learning Agreement', 'Other'];
  const DOC_ICONS = {
    'ID card': 'id-card', 'Passport': 'id-card', 'Student ID': 'id-card',
    'EHIC card': 'id-card', 'Other': 'file-text',
  };
  const PROJECT_TYPES = ['Semester exchange', 'Summer school', 'Research stay', 'Sports programme'];
  const DURATIONS = ['One semester (5-6 months)', 'Two semesters (10-12 months)', 'Summer (1-2 months)', 'Short stay (a few weeks)'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const STUDENT_DOMAIN = '@student.upt.ro';
  const KNOWN_LANGUAGES = ['English', 'Romanian', 'French', 'German', 'Spanish', 'Portuguese', 'Italian', 'Dutch', 'Finnish', 'Hungarian', 'Latvian', 'Polish'];
  // country -> macro-region: groups destinations in setup and feeds the map's region filter
  const REGIONS = {
    'United Kingdom': 'Northern Europe', 'Ireland': 'Northern Europe', 'Denmark': 'Northern Europe',
    'Sweden': 'Northern Europe', 'Norway': 'Northern Europe', 'Finland': 'Northern Europe',
    'Iceland': 'Northern Europe', 'Estonia': 'Northern Europe', 'Latvia': 'Northern Europe', 'Lithuania': 'Northern Europe',
    'Belgium': 'Western Europe', 'France': 'Western Europe', 'Germany': 'Western Europe',
    'Netherlands': 'Western Europe', 'Luxembourg': 'Western Europe', 'Switzerland': 'Western Europe',
    'Portugal': 'Southern Europe', 'Spain': 'Southern Europe', 'Italy': 'Southern Europe',
    'Greece': 'Southern Europe', 'Malta': 'Southern Europe', 'Cyprus': 'Southern Europe',
    'Austria': 'Central Europe', 'Poland': 'Central Europe', 'Czechia': 'Central Europe',
    'Czech Republic': 'Central Europe', 'Slovakia': 'Central Europe', 'Hungary': 'Central Europe', 'Slovenia': 'Central Europe',
    'Romania': 'Eastern Europe', 'Bulgaria': 'Eastern Europe', 'Moldova': 'Eastern Europe',
    'Ukraine': 'Eastern Europe', 'Belarus': 'Eastern Europe',
    'Croatia': 'Southeastern Europe', 'Serbia': 'Southeastern Europe', 'Albania': 'Southeastern Europe',
    'North Macedonia': 'Southeastern Europe', 'Montenegro': 'Southeastern Europe',
    'Bosnia and Herzegovina': 'Southeastern Europe', 'Kosovo': 'Southeastern Europe',
  };
  const regionOf = country => REGIONS[country] || 'Other';

  const history = [];
  const timers = [];
  let hashLock = false;
  let tlOpen = null;                 // timeline: which stages are expanded

  const $app = document.getElementById('app');
  const $top = document.getElementById('topBar');

  /* ------------------------------------------------------------------ helpers */

  function h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const T = (key, vars) => Store.t(key, vars);
  const isRo = () => Store.state.language === 'ro';
  const isLight = () => Store.state.theme === 'light';
  const pad2 = n => String(n).padStart(2, '0');

  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = h('<div id="toast" role="status"></div>');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // Server errors come as { code, message } in English; show the translation of the code when we have one.
  function errText(e) {
    if (!e) return T('Something went wrong. Is the server online?');
    const key = 'err:' + (e.code || '');
    const tr = T(key);
    if (tr !== key) {
      const m = /(\d+) tries left/.exec(e.message || '');
      return m ? tr.replace('{n}', m[1]) : tr;
    }
    return e.message || T('Something went wrong. Is the server online?');
  }

  function setAccent() {
    const c = Store.state.mode === 'journey' ? 'var(--accent-j)' : 'var(--accent)';
    document.documentElement.style.setProperty('--accent-live', c);
  }

  function flagImg(code, cls) {
    if (!code) return '';
    return '<img class="flag ' + (cls || '') + '" src="/icons/flags/' + String(code).toLowerCase() + '.svg" alt="" loading="lazy"/>';
  }

  // PWA install: Chrome/Edge/Android fire beforeinstallprompt; Safari never does (manual "Add to Home Screen").
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); installPrompt = ev; });
  window.addEventListener('appinstalled', () => { installPrompt = null; });
  const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  function startTimer(fn, ms) { timers.push(setInterval(fn, ms)); }
  function clearTimers() { while (timers.length) clearInterval(timers.pop()); }

  /* -------------------------------------------------------------------- logo */

  let logoSeq = 0;
  // Same artwork as logoIcon() in the PoliGo repo (js/ui.js).
  function logoIcon(size) {
    const id = 'lg' + (++logoSeq);
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 64 64" aria-hidden="true" style="display:block;flex:none">' +
      '<defs><linearGradient id="' + id + '" x1="18" y1="46" x2="54" y2="12" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#38BDF8"/><stop offset="1" stop-color="#FBBF24"/></linearGradient></defs>' +
      '<circle cx="29" cy="35" r="20" fill="none" stroke="#38BDF8" stroke-width="3.2"/>' +
      '<ellipse cx="29" cy="35" rx="8.5" ry="20" fill="none" stroke="#38BDF8" stroke-width="2" stroke-opacity=".5"/>' +
      '<path d="M9.5 35h39" stroke="#38BDF8" stroke-width="2" stroke-opacity=".5"/>' +
      '<path d="M19 45 C 22 24, 37 12, 52 13" fill="none" stroke="url(#' + id + ')" stroke-width="3.6" stroke-linecap="round"/>' +
      '<circle cx="19" cy="45" r="3.6" fill="#38BDF8"/><circle cx="52.5" cy="13" r="5" fill="#FBBF24"/></svg>';
  }

  // "Poli" follows --text (white on dark, ink on light); "Go" is the gold.
  const lockup = size => '<span class="lockup">' + logoIcon(size) +
    '<span class="wordmark" style="font-size:' + Math.round(size * 0.72) + 'px">Poli<span>Go</span></span></span>';

  /* ------------------------------------------------------------------- dates */

  function ymd(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseYmd(s) {
    const p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  // 2026-11-21 -> 21.11.2026 (day.month.year everywhere in the UI)
  function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? m[3] + '.' + m[2] + '.' + m[1] : '';
  }

  function daysWord(n) {
    if (isRo()) return n === 1 ? 'zi' : ((n % 100 === 0 || n % 100 >= 20) ? 'de zile' : 'zile');
    return n === 1 ? 'day' : 'days';
  }

  const nDays = n => n + ' ' + daysWord(n);

  /* A day / month / year picker: three selects that write an ISO date into a hidden
   * input (so `input.value` and 'change' events work like a normal date field).
   * Markup: <div class="dmy" data-id|data-name data-value data-from data-to data-optional>. */
  function wireDmy(scope) {
    scope.querySelectorAll('.dmy:not([data-ready])').forEach(box => {
      box.dataset.ready = '1';
      let y0 = parseInt(box.dataset.from, 10), y1 = parseInt(box.dataset.to, 10);
      const opt = (v, t) => '<option value="' + v + '">' + esc(t) + '</option>';
      const mk = (cls, aria) => {
        const wrap = document.createElement('div');
        wrap.className = 'select-wrap ' + cls;
        const sel = document.createElement('select');
        sel.setAttribute('aria-label', T(aria));
        wrap.appendChild(sel);
        wrap.insertAdjacentHTML('beforeend', icon('chevron-down', 'sel-ico'));
        box.appendChild(wrap);
        return sel;
      };
      const sd = mk('dmy-d', 'Day'), sm = mk('dmy-m', 'Month'), sy = mk('dmy-y', 'Year');
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      if (box.dataset.id) hidden.id = box.dataset.id;
      if (box.dataset.name) hidden.dataset.f = box.dataset.name;
      box.appendChild(hidden);

      sm.innerHTML = opt('', T('Month')) + MONTHS.map((m, i) => opt(i + 1, T(m))).join('');
      const fillYears = () => {
        let out = opt('', T('Year'));
        for (let y = y0; y <= y1; y++) out += opt(y, y);
        const keep = sy.value;
        sy.innerHTML = out;
        sy.value = keep;
      };
      const fillDays = () => {
        const n = +sm.value ? new Date(+sy.value || 2024, +sm.value, 0).getDate() : 31;
        const cur = +sd.value;
        let out = opt('', T('Day'));
        for (let d = 1; d <= n; d++) out += opt(d, d);
        sd.innerHTML = out;
        sd.value = cur && cur <= n ? String(cur) : '';
      };
      const commit = () => {
        const d = +sd.value, m = +sm.value, y = +sy.value;
        const v = d && m && y ? y + '-' + pad2(m) + '-' + pad2(d) : '';
        if (hidden.value !== v) {
          hidden.value = v;
          hidden.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      sm.onchange = sy.onchange = () => { fillDays(); commit(); };
      sd.onchange = commit;
      hidden.setIso = iso => {
        const p = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
        if (p) {
          if (+p[1] < y0) y0 = +p[1];
          if (+p[1] > y1) y1 = +p[1];
          fillYears();
          sy.value = String(+p[1]);
          sm.value = String(+p[2]);
          fillDays();
          sd.value = String(+p[3]);
          hidden.value = p[1] + '-' + p[2] + '-' + p[3];
        } else {
          fillYears();
          sy.value = sm.value = '';
          fillDays();
          hidden.value = '';
        }
      };
      hidden.setIso(box.dataset.value || '');
    });
  }

  const dmyField = (label, o) =>
    '<div class="form-field"><label>' + esc(T(label)) + '</label>' +
    '<div class="dmy" ' + (o.id ? 'data-id="' + o.id + '" ' : '') + (o.name ? 'data-name="' + o.name + '" ' : '') +
    'data-value="' + esc(o.value || '') + '" data-from="' + o.from + '" data-to="' + o.to + '"></div></div>';

  /* ---------------------------------------------------------------- countdown */

  // What are we counting down to? Departure first, then the return, then nothing.
  function journeyClock() {
    const mob = Store.state.mobility;
    if (!mob || !mob.start_date) return null;
    const now = new Date();
    const arrival = parseYmd(mob.arrival_date || mob.start_date);
    const end = addDays(parseYmd(mob.end_date), 1);
    if (now < arrival) return { kind: 'departure', ms: arrival - now };
    if (now < end) return { kind: 'return', ms: end - now };
    return { kind: 'done', ms: 0 };
  }

  function clockParts(ms) {
    const mins = Math.max(0, Math.floor(ms / 60000));
    return { d: Math.floor(mins / 1440), h: Math.floor((mins % 1440) / 60), m: mins % 60 };
  }

  function countdownHtml() {
    return '<div class="cd-wrap">' +
      '<p class="cd-label" data-cd-label></p>' +
      '<div class="cd" data-cd role="timer">' +
      '<div><b data-u="d">0</b><span>' + esc(T('days')) + '</span></div>' +
      '<div><b data-u="h">00</b><span>' + esc(T('hours')) + '</span></div>' +
      '<div><b data-u="m">00</b><span>' + esc(T('minutes')) + '</span></div>' +
      '</div></div>';
  }

  function tickCountdown(scope) {
    const clock = journeyClock();
    if (!clock) return;
    const label = { departure: 'Until departure', return: 'Until you come back', done: 'Welcome back!' }[clock.kind];
    const p = clockParts(clock.ms);
    scope.querySelectorAll('[data-cd-label]').forEach(el => { el.textContent = T(label); });
    scope.querySelectorAll('[data-cd]').forEach(el => {
      el.hidden = clock.kind === 'done';
      const set = (u, v) => { const b = el.querySelector('[data-u="' + u + '"]'); if (b && b.textContent !== v) b.textContent = v; };
      set('d', String(p.d)); set('h', pad2(p.h)); set('m', pad2(p.m));
    });
  }

  function startCountdown(scope) {
    tickCountdown(scope);
    startTimer(() => tickCountdown(scope), 10000);
  }

  // "47d 3h" for the badge on the Today button
  function navCountdownText() {
    const clock = journeyClock();
    if (!clock || clock.kind === 'done') return '';
    const p = clockParts(clock.ms);
    return p.d > 0 ? p.d + T('d') + ' ' + p.h + T('h') : p.h + T('h') + ' ' + p.m + T('m');
  }

  /* --------------------------------------------------------- history / hashes */

  function syncHash(screen) {
    if (('#' + screen) === location.hash) return;
    hashLock = true;
    location.hash = screen;
    setTimeout(() => { hashLock = false; }, 0);
  }

  function go(screen, opts) {
    opts = opts || {};
    if (ALIAS_TAB[screen]) {
      Store.state.mapTab = ALIAS_TAB[screen];
      if (Store.state.screen === 'map') { Store.saveLocal(); render(); syncHash('map'); return; }
    }
    screen = ALIAS[screen] || screen;
    const cur = Store.state.screen;
    if (screen === cur && !opts.force) { syncHash(screen); return; }
    if (opts.replace) history.length = 0;
    else if (cur) history.push(cur);
    Store.state.screen = screen;
    Store.saveLocal();
    syncHash(screen);
    render();
  }

  function goBack() {
    const prev = history.pop() || afterAuth();
    Store.state.screen = prev;
    Store.saveLocal();
    syncHash(prev);
    render();
  }

  // Home is the root of the logged-in app; the logo takes logged-out visitors to the landing page.
  function goHome() {
    const s = Store.state.screen;
    if (s === 'landing' || s === 'auth') go('landing', { replace: true, force: s === 'auth' });
    else go('home', { replace: true });
  }

  window.addEventListener('hashchange', () => {
    if (hashLock) return;
    const raw = (location.hash || '').replace(/^#/, '') || 'landing';
    if (ALIAS_TAB[raw]) Store.state.mapTab = ALIAS_TAB[raw];
    const s = ALIAS[raw] || raw;
    if (!KNOWN.has(s) || s === Store.state.screen) return;
    if (s === 'landing' && Store.state.seenLanding) return;
    Store.state.screen = s;
    Store.saveLocal();
    render();
  });

  /* -------------------------------------------------------- chrome (bars, nav) */

  function syncChrome() {
    document.body.dataset.screen = Store.state.screen || '';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = isLight() ? '#F4F6FB' : '#070B14';
  }

  function setTheme(theme) {
    Store.setTheme(theme);
    render();        // globes on Home / Map are rebuilt in the new palette
  }

  function renderTopbar() {
    const s = Store.state.screen;
    const out = s === 'landing' || s === 'auth';
    const hasHome = !out && s !== 'onboarding';
    $top.hidden = false;
    const withNav = !NO_NAV.has(s);
    document.body.classList.toggle('with-nav', withNav);
    $top.innerHTML =
      '<div class="top-left">' +
      (history.length > 0 && s !== 'landing'
        ? '<button class="back-btn" id="tb-back" aria-label="' + esc(T('Back')) + '">' + icon('arrow-left', 'sm-ico') + '<span>' + esc(T('Back')) + '</span></button>'
        : '') +
      '<a class="top-brand" id="tb-brand" href="#' + (out ? 'landing' : 'home') + '" aria-label="PoliGo - ' + esc(T('Home')) + '">' + lockup(28) + '</a>' +
      '</div>' +
      (withNav ? '<nav class="top-nav" id="topNav" aria-label="' + esc(T('Menu')) + '"></nav>' : '') +
      '<div class="top-actions">' +
      '<button class="icon-btn top-btn top-lang" id="tb-lang" aria-label="' + esc(T('Language')) + '">' + (isRo() ? 'EN' : 'RO') + '</button>' +
      '<button class="icon-btn top-btn" id="tb-theme" aria-label="' + esc(T(isLight() ? 'Switch to dark theme' : 'Switch to light theme')) + '">' + icon(isLight() ? 'moon' : 'sun') + '</button>' +
      (hasHome && !['home', 'map', 'subjects'].includes(s) ? '<button class="icon-btn top-btn" id="tb-home" aria-label="' + esc(T('Back to menu')) + '">' + icon('house') + '</button>' : '') +
      (hasHome ? '<button class="icon-btn top-btn' + (s === 'profile' ? ' on' : '') + '" id="tb-profile" aria-label="' + esc(T('Profile')) + '">' + icon('user') + '</button>' : '') +
      '</div>';
    const on = (id, fn) => { const el = $top.querySelector(id); if (el) el.onclick = fn; };
    on('#tb-back', () => goBack());
    on('#tb-brand', ev => { ev.preventDefault(); goHome(); });
    on('#tb-home', () => goHome());
    on('#tb-profile', () => go('profile'));
    on('#tb-theme', () => setTheme(isLight() ? 'dark' : 'light'));
    on('#tb-lang', async () => {
      await Store.setLanguage(isRo() ? 'en' : 'ro');
      render();
    });
  }

  // Even while on a journey, you can still be on an explore screen (browsing
  // other opportunities) - the nav should match the screen you are actually
  // on, not just the account-level mode.
  function navGroupFor(screen, mode) {
    if (NAVS.explore.some(n => n[0] === screen)) return 'explore';
    if (NAVS.journey.some(n => n[0] === screen)) return 'journey';
    return mode;
  }

  function renderNav() {
    const { mode, screen } = Store.state;
    const $nav = document.getElementById('topNav');
    if (!$nav) return;
    $nav.innerHTML = '';
    const group = navGroupFor(screen, mode);
    const cd = group === 'journey' ? navCountdownText() : '';
    const tab = mapTabNow();
    const isActive = id => id === 'map' ? screen === 'map' && tab !== 'favorite'
      : id === 'shortlist' ? screen === 'map' && tab === 'favorite'
      : screen === id;
    for (const [id, label] of NAVS[group]) {
      const badge = id === 'today' && cd ? '<span class="nav-cd" data-nav-cd>' + esc(cd) + '</span>' : '';
      const dot = id === 'plan' && hasOverdueTasks() ? '<span class="nav-dot"></span>' : '';
      const b = h('<button class="' + (isActive(id) ? 'active' : '') + '"' + (isActive(id) ? ' aria-current="page"' : '') + '><span class="ico">' + icon(NAV_ICONS[id]) + badge + dot + '</span><span>' + esc(T(label)) + '</span></button>');
      b.onclick = () => {
        // "Universities" from Favorite goes back to the last list / map view
        if (id === 'map' && tab === 'favorite') Store.state.mapTab = Store.state.mapView || 'list';
        if (id === 'map' && screen === 'map') { Store.saveLocal(); render(); return; }
        go(id);
      };
      $nav.appendChild(b);
    }
    if (cd) {
      startTimer(() => {
        const el = $nav.querySelector('[data-nav-cd]');
        const txt = navCountdownText();
        if (el && txt) el.textContent = txt;
      }, 20000);
    }
  }

  // The background planet follows the chosen / accepted university.
  function syncStage() {
    const st = Store.state;
    const id = st.mode === 'journey' && st.mobility ? st.mobility.university_id
      : st.pending ? st.pending.university_id : st.activeUniId;
    Stage.setDestination(id ? Store.uniById(id) : null);
  }

  function render() {
    clearTimers();
    setAccent();
    syncChrome();
    renderTopbar();
    renderNav();
    try { syncStage(); } catch (err) { console.warn('[stage]', err); }
    try {
      const { screen } = Store.state;
      const views = {
        landing: viewLanding, auth: viewAuth, onboarding: viewOnboarding,
        home: viewHome, profile: viewProfile, subjects: viewSubjects,
        map: viewMap, uni: viewUniversity,
        today: viewToday, plan: viewPlan,
        scanJ: viewScan, docs: viewDocs, admin: viewAdmin,
      };
      $app.innerHTML = '';
      (views[screen] || viewLanding)($app);
      window.scrollTo(0, 0);
    } catch (err) {
      showFatal(err);
    }
  }

  function showFatal(err) {
    clearTimers();
    $app.innerHTML = '';
    const wrap = h('<div class="screen panel">' +
      '<div class="card fatal">' +
      '<p class="section-label">' + esc(T('Error')) + '</p>' +
      '<h2>' + esc(T('This screen failed to load')) + '</h2>' +
      '<pre>' + esc(err && err.stack ? err.stack : String(err || 'unknown error')) + '</pre>' +
      '<button class="ghost" id="fat-reload">' + esc(T('Reload')) + '</button>' +
      '<button class="link" id="fat-home">' + esc(T('Back to the start')) + '</button>' +
      '</div></div>');
    wrap.querySelector('#fat-reload').onclick = () => window.location.reload();
    wrap.querySelector('#fat-home').onclick = () => go('landing', { replace: true, force: true });
    $app.appendChild(wrap);
  }

  window.addEventListener('error', e => showFatal(e.error || e.message));
  window.addEventListener('unhandledrejection', e => showFatal(e.reason));

  /* ----------------------------------------------------------- landing / auth */

  function viewLanding(root) {
    const wrap = h('<div class="landing">' +
      '<div class="hero">' +
      '<h1>' + esc(T('Leave on Erasmus.')) + '<br/><em>' + esc(T('Return with every credit.')) + '</em></h1>' +
      '<p class="slogan">' + esc(T('PoliGo plans your exchange from Timișoara: match UPT subjects with partner universities, keep the paperwork on schedule, read any foreign document.')) + '</p>' +
      '</div>' +
      '<div class="login-core">' +
      '<button class="primary login-cta" id="login-btn">' + icon('log-in', 'inline-ico') + ' ' + esc(T('Log in with your student email')) + '</button>' +
      '<p class="hint login-note">' + esc(T('Students of UPT only: name@student.upt.ro')) + '</p>' +
      '<button class="link" id="skip-btn">' + esc(T('Explore without an account')) + '</button>' +
      '</div>' +
      '<div class="features">' +
      '<div class="feat feat-1"><span><span class="f-title">' + esc(T('Find your matches')) + '</span><span class="f-sub">' + esc(T('Partner universities ranked by how much of your 30 ECTS they cover.')) + '</span></span></div>' +
      '<div class="feat feat-2"><span><span class="f-title">' + esc(T('Stay on schedule')) + '</span><span class="f-sub">' + esc(T('A calendar and timeline built around your mobility dates and project deadlines.')) + '</span></span></div>' +
      '<div class="feat feat-3"><span><span class="f-title">' + esc(T('Read any document')) + '</span><span class="f-sub">' + esc(T('Scan a rental contract or registration form and get plain answers.')) + '</span></span></div>' +
      '</div>' +
      '<div class="updates">' +
      '<span class="f-title">' + esc(T('Get notified at launch')) + '</span>' +
      '<div class="updates-row">' +
      '<input id="u-email" type="email" placeholder="name@student.upt.ro" aria-label="' + esc(T('Email')) + '" />' +
      '<button class="icon-btn" id="u-send" aria-label="' + esc(T('Notify me')) + '">' + icon('arrow-right') + '</button>' +
      '</div></div>' +
      '</div>');
    wrap.querySelector('#login-btn').onclick = () => go('auth');
    wrap.querySelector('#skip-btn').onclick = () => {
      Store.state.seenLanding = true;
      Store.saveLocal();
      go('home', { replace: true });
    };
    wrap.querySelector('#u-send').onclick = async () => {
      const inp = wrap.querySelector('#u-email');
      if (!inp.value.trim()) { toast(T('Enter your email first')); return; }
      try { await Store.notify(inp.value.trim()); toast(T('You are on the list')); inp.value = ''; }
      catch (e) { toast(T('Could not save it - try again later')); }
    };
    root.appendChild(wrap);
  }

  function viewAuth(root) {
    let email = '';
    const wrap = h('<div class="screen panel">' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Log in')) + '</p>' +
      '<div class="hint">' + esc(T('Use your student email (name@student.upt.ro). No password: we send you a 6-digit code.')) + '</div>' +
      '<div id="a-step1">' +
      '<div class="form-field"><label for="a-email">' + esc(T('Student email')) + '</label>' +
      '<input id="a-email" type="email" placeholder="name.surname@student.upt.ro" autocomplete="email" inputmode="email" autocapitalize="off" /></div>' +
      '<button class="primary" id="a-go1">' + esc(T('Send code')) + '</button>' +
      '</div>' +
      '<div id="a-step2" hidden>' +
      '<div class="hint" id="a-sent"></div>' +
      '<div class="hint" id="a-devcode"></div>' +
      '<div class="form-field"><label for="a-code">' + esc(T('Verification code')) + '</label>' +
      '<input id="a-code" class="num" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code" /></div>' +
      '<button class="primary" id="a-go2">' + esc(T('Verify')) + '</button>' +
      '<button class="link" id="a-resend">' + esc(T('Send again')) + '</button>' +
      '</div>' +
      '<div id="auth-err" role="alert"></div>' +
      '<button class="link" id="a-back">' + esc(T('Back')) + '</button>' +
      '</div></div>');
    const errEl = wrap.querySelector('#auth-err');
    const step1 = wrap.querySelector('#a-step1');
    const step2 = wrap.querySelector('#a-step2');
    const showErr = msg => { errEl.textContent = msg; };
    const showStep = s => { step1.hidden = s !== 1; step2.hidden = s !== 2; };

    async function sendCode() {
      const out = await Store.requestAuthCode(email);
      wrap.querySelector('#a-sent').textContent = out.code_sent ? T('Code sent to {email}', { email }) : '';
      const dev = wrap.querySelector('#a-devcode');
      dev.textContent = '';
      if (out.dev_code) {
        dev.appendChild(document.createTextNode(T('No mail sender is configured. Dev code:')));
        const b = document.createElement('b');
        b.className = 'dev-code';
        b.textContent = out.dev_code;
        dev.appendChild(b);
      }
      errEl.textContent = '';
    }

    wrap.querySelector('#a-back').onclick = () => goBack();
    wrap.querySelector('#a-resend').onclick = async () => {
      try { await sendCode(); } catch (e) { showErr(errText(e)); }
    };
    wrap.querySelector('#a-go1').onclick = async () => {
      email = wrap.querySelector('#a-email').value.trim().toLowerCase();
      if (!email) { showErr(T('Enter your email first')); return; }
      if (!email.endsWith(STUDENT_DOMAIN) || email.length <= STUDENT_DOMAIN.length) {
        showErr(T('Only @student.upt.ro addresses can log in.'));
        return;
      }
      errEl.textContent = '';
      try {
        await sendCode();
        showStep(2);
        wrap.querySelector('#a-code').focus();
      } catch (e) { showErr(errText(e)); }
    };
    wrap.querySelector('#a-go2').onclick = async () => {
      const code = wrap.querySelector('#a-code').value.trim();
      if (code.length < 4) { showErr(T('Enter the 6-digit code.')); return; }
      try {
        await Store.verifyAuthCode(email, code);
        errEl.textContent = '';
        toast(T('Welcome!'));
        go(afterAuth(), { replace: true });
        maybeIntro();
      } catch (e) { showErr(errText(e)); }
    };
    wrap.querySelector('#a-code').onkeydown = ev => { if (ev.key === 'Enter') wrap.querySelector('#a-go2').click(); };
    wrap.querySelector('#a-email').onkeydown = ev => { if (ev.key === 'Enter') wrap.querySelector('#a-go1').click(); };
    root.appendChild(wrap);
  }

  /* --------------------------------------------------------------- onboarding */

  function wireOptions(scope) {
    scope.querySelectorAll('.opt').forEach(el => {
      el.onclick = () => {
        if (el.dataset.multi === '1') { el.classList.toggle('on'); }
        else {
          scope.querySelectorAll('.opt').forEach(o => o.classList.remove('on'));
          el.classList.add('on');
        }
      };
    });
  }

  function viewOnboarding(root) {
    const draft = Store.state.onbDraft || (Store.state.onbDraft = { projects: [], knownLanguages: [], duration: DURATIONS[0], places: [] });
    if (!Array.isArray(draft.knownLanguages)) draft.knownLanguages = [];
    let step = 0;
    const wrap = h('<div class="screen panel">' +
      '<div class="card">' +
      '<div class="steps" id="ob-bar"><i></i><i></i><i></i><i></i></div>' +
      '<p class="section-label" id="ob-step"></p>' +
      '<div id="ob-body"></div>' +
      '<button class="ghost" id="ob-back">' + esc(T('Back')) + '</button>' +
      '<button class="primary" id="ob-next">' + esc(T('Continue')) + '</button>' +
      '</div></div>');
    const stepEl = wrap.querySelector('#ob-step');
    const bodyEl = wrap.querySelector('#ob-body');
    const backBtn = wrap.querySelector('#ob-back');
    const nextBtn = wrap.querySelector('#ob-next');
    const bar = wrap.querySelector('#ob-bar');

    function optRow(value, label, multi, on) {
      return '<button class="opt ' + (on ? 'on' : '') + '" data-val="' + esc(value) + '" ' + (multi ? 'data-multi="1"' : '') + '>' +
        '<span class="opt-ico opt-no"></span><span>' + esc(label) + '</span></button>';
    }

    const steps = [
      {
        label: 'Projects',
        draw() {
          bodyEl.innerHTML = '<p class="hint">' + esc(T('What kind of programme are you looking for? Pick any.')) + '</p>' +
            '<div class="opt-list">' + PROJECT_TYPES.map(p => optRow(p, T(p), true, draft.projects.indexOf(p) !== -1)).join('') + '</div>';
          wireOptions(bodyEl);
        },
        collect() { draft.projects = [...bodyEl.querySelectorAll('.opt.on')].map(o => o.dataset.val); },
      },
      {
        label: 'Known languages',
        draw() {
          bodyEl.innerHTML = '<p class="hint">' + esc(T('Which languages do you already know? Add as many as you like.')) + '</p>' +
            '<div class="form-field"><div class="select-wrap"><select id="lang-pick">' +
            KNOWN_LANGUAGES.map(l => '<option value="' + esc(l) + '">' + esc(T(l)) + '</option>').join('') +
            '</select>' + icon('chevron-down', 'sel-ico') + '</div></div>' +
            '<button class="ghost" id="lang-add">' + esc(T('Add')) + '</button>' +
            '<div class="chips" id="lang-chips" style="margin-top:12px"></div>';
          const chipsEl = bodyEl.querySelector('#lang-chips');
          const drawChips = () => {
            chipsEl.innerHTML = draft.knownLanguages.map(l =>
              '<button class="chip on" data-lang="' + esc(l) + '">' + esc(T(l)) + ' ' + icon('x', 'sm-ico') + '</button>').join('');
            chipsEl.querySelectorAll('[data-lang]').forEach(c => {
              c.onclick = () => { draft.knownLanguages = draft.knownLanguages.filter(x => x !== c.dataset.lang); drawChips(); };
            });
          };
          bodyEl.querySelector('#lang-add').onclick = () => {
            const v = bodyEl.querySelector('#lang-pick').value;
            if (v && draft.knownLanguages.indexOf(v) === -1) draft.knownLanguages.push(v);
            drawChips();
          };
          drawChips();
        },
        collect() {},
      },
      {
        label: 'Length',
        draw() {
          bodyEl.innerHTML = '<p class="hint">' + esc(T('How long do you want to go?')) + '</p>' +
            '<div class="opt-list">' + DURATIONS.map(d => optRow(d, T(d), false, draft.duration === d)).join('') + '</div>';
          wireOptions(bodyEl);
        },
        collect() {
          const on = bodyEl.querySelector('.opt.on');
          draft.duration = on ? on.dataset.val : DURATIONS[0];
        },
      },
      {
        label: 'Places',
        draw() {
          const countries = [...new Set(Store.state.universities.map(u => u.country))].sort();
          const list = countries.length ? countries : ['Portugal', 'Spain', 'Italy', 'Germany', 'France'];
          const groups = {};
          for (const c of list) (groups[regionOf(c)] = groups[regionOf(c)] || []).push(c);
          bodyEl.innerHTML = '<p class="hint">' + esc(T('Preferred destinations, used to rank deadlines and matches. Leave empty for everything.')) + '</p>' +
            Object.keys(groups).sort().map(region =>
              '<p class="section-label" style="margin-top:14px">' + esc(T(region)) + '</p>' +
              '<div class="opt-list">' + groups[region].map(c => optRow(c, T(c), true, draft.places.indexOf(c) !== -1)).join('') + '</div>'
            ).join('');
          wireOptions(bodyEl);
        },
        collect() { draft.places = [...bodyEl.querySelectorAll('.opt.on')].map(o => o.dataset.val); },
      },
    ];

    function drawStep() {
      stepEl.textContent = T('Step {n} of {total}', { n: step + 1, total: steps.length }) + ' - ' + T(steps[step].label);
      [...bar.children].forEach((seg, i) => seg.classList.toggle('on', i <= step));
      backBtn.style.visibility = step === 0 ? 'hidden' : 'visible';
      nextBtn.textContent = step === steps.length - 1 ? T('Start') : T('Continue');
      steps[step].draw();
      window.scrollTo(0, 0);
    }

    backBtn.onclick = () => { steps[step].collect(); step = Math.max(0, step - 1); drawStep(); };
    nextBtn.onclick = () => {
      steps[step].collect();
      if (step < steps.length - 1) { step += 1; drawStep(); return; }
      finishOnboarding(draft);
    };

    drawStep();
    root.appendChild(wrap);
  }

  async function finishOnboarding(draft) {
    await Store.saveProfile({ onboarding: JSON.stringify(draft) });
    Store.state.onbDraft = null;
    go('home', { replace: true });
  }

  function afterAuth() {
    const st = Store.state;
    if (st.mode === 'journey' && st.mobility) return 'home';
    if (st.sessionEmail && !(st.user && st.user.onboarding)) return 'onboarding';
    return 'home';
  }

  /* ----------------------------------------------------------------- home */

  function viewHome(root) {
    const st = Store.state;
    const mob = st.mode === 'journey' ? st.mobility : null;
    const pend = !mob && st.pending ? st.pending : null;
    const uni = mob ? Store.uniById(mob.university_id)
      : pend ? Store.uniById(pend.university_id)
      : (st.activeUniId ? Store.uniById(st.activeUniId) : null);

    let info;
    if (pend && uni) {
      info = '<div class="card home-info">' +
        '<div class="route">' +
        '<span class="route-city">' + flagImg('RO') + '<b>Timișoara</b></span>' +
        '<span class="route-arrow">' + icon('arrow-right') + '</span>' +
        '<span class="route-city">' + flagImg(uni.country_code) + '<b>' + esc(uni.city) + '</b></span>' +
        '</div>' +
        '<p class="hint route-sub">' + esc(uni.name) + ' - ' + esc(T(uni.country)) +
        '<br/>' + esc(fmtDate(pend.start_date)) + ' - ' + esc(fmtDate(pend.end_date)) + '</p>' +
        '<p class="pending-pill"><span class="pill partial">' + icon('clock', 'sm-ico') + ' ' + esc(T('Waiting for approval')) + '</span></p>' +
        '<p class="hint">' + esc(T('The Erasmus office has to confirm your acceptance. Your journey (steps, countdown, documents) opens as soon as it is approved.')) + '</p>' +
        '<div class="home-actions"><button class="primary" id="h-check">' + esc(T('Check again')) + '</button>' +
        '<button class="ghost" id="h-change">' + esc(T('Choose another')) + '</button></div>' +
        '</div>';
    } else if (uni) {
      info = '<div class="card home-info">' +
        '<div class="route">' +
        '<span class="route-city">' + flagImg('RO') + '<b>Timișoara</b></span>' +
        '<span class="route-arrow">' + icon('arrow-right') + '</span>' +
        '<span class="route-city">' + flagImg(uni.country_code) + '<b>' + esc(uni.city) + '</b></span>' +
        '</div>' +
        '<p class="hint route-sub">' + esc(uni.name) + ' - ' + esc(T(uni.country)) +
        (mob ? '<br/>' + esc(fmtDate(mob.start_date)) + ' - ' + esc(fmtDate(mob.end_date)) : '') + '</p>' +
        (mob
          ? countdownHtml() + '<button class="link" id="h-browse">' + esc(T('Browse other universities')) + '</button>'
          : '<div class="home-actions"><button class="primary" id="h-open">' + esc(T('Open this university')) + '</button>' +
            '<button class="ghost" id="h-change">' + esc(T('Choose another')) + '</button></div>') +
        '</div>';
    } else {
      info = '<div class="card home-info">' +
        '<p class="section-label">' + esc(T('Your Erasmus')) + '</p>' +
        '<h2>' + esc(T('Where do you want to go?')) + '</h2>' +
        '<p class="hint">' + esc(T('Tap a dot on the globe or open the map to see how many of your subjects each partner university covers.')) + '</p>' +
        '<button class="primary" id="h-map">' + icon('map', 'inline-ico') + ' ' + esc(T('Explore the map')) + '</button>' +
        '</div>';
    }

    const wrap = h('<div class="screen panel home">' +
      '<div class="home-globe globe-box" id="home-globe"></div>' +
      '<div class="home-side">' + info + '</div></div>');

    const bind = (id, fn) => { const el = wrap.querySelector(id); if (el) el.onclick = fn; };
    bind('#h-map', () => go('map'));
    bind('#h-open', () => go('uni'));
    bind('#h-change', () => go('map'));
    bind('#h-browse', () => go('map'));
    bind('#h-check', () => checkApproval(false));
    if (mob) startCountdown(wrap);
    if (pend) startTimer(() => checkApproval(true), 30000);   // approval shows up on its own

    Stage.homeGlobe(wrap.querySelector('#home-globe'), uni, id => { st.activeUniId = id; go('uni'); });
    root.appendChild(wrap);
  }

  // Has an admin approved the pending mobility? quiet = background poll (no toast).
  let checking = false;
  async function checkApproval(quiet) {
    if (checking) return;
    checking = true;
    try {
      await Store.refresh();
      const st = Store.state;
      if (st.mode === 'journey' && st.mobility && !st.pending) {
        tlOpen = null;
        go('home', { replace: true, force: true });
        await showIntro();
      } else if (!st.pending) {
        render();
        if (!quiet) toast(T('Your request was not approved. Check your messages in Profile.'));
      } else if (!quiet) {
        toast(T('Still waiting for approval'));
      }
    } catch (e) {
      if (!quiet) toast(errText(e));
    } finally {
      checking = false;
    }
  }

  /* ----------------------------------------------------------------- intro */

  // The start window after you are accepted (and on every launch while you are): the
  // globe flies from Timisoara to the partner city, the arc is drawn, the countdown starts.
  function showIntro() {
    const mob = Store.state.mobility;
    const uni = mob && Store.uniById(mob.university_id);
    if (!uni || document.getElementById('intro')) return Promise.resolve();
    return new Promise(resolve => {
      const ov = h('<div id="intro" data-theme="dark" role="dialog" aria-modal="true" aria-label="' + esc(T('Your Erasmus journey')) + '">' +
        '<div class="intro-globe" id="intro-globe"></div>' +
        '<div class="intro-copy">' +
        '<p class="intro-cap" id="in-cap"></p>' +
        '<div class="intro-final">' +
        '<h1 class="intro-greet">' + esc(uni.greeting || '') + '</h1>' +
        '<p class="intro-line">' + esc(T('Congratulations! You are going to {city}, {country}.', { city: uni.city, country: T(uni.country) })) + '</p>' +
        countdownHtml() +
        '<button class="primary" id="in-go">' + esc(T('Start my journey')) + '</button>' +
        '</div>' +
        '<button class="link intro-skip" id="in-skip">' + esc(T('Skip')) + '</button>' +
        '</div></div>');
      document.body.appendChild(ov);
      document.body.classList.add('no-scroll');
      const cap = ov.querySelector('#in-cap');
      tickCountdown(ov);
      const tick = setInterval(() => tickCountdown(ov), 10000);
      let scene = null;
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(tick);
        document.removeEventListener('keydown', onKey);
        document.body.classList.remove('no-scroll');
        ov.classList.add('leaving');
        setTimeout(() => ov.remove(), 260);
        resolve();
      };
      const onKey = ev => { if (ev.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);

      const showFinal = () => {
        cap.textContent = '';
        ov.classList.add('done');
        const goBtn = ov.querySelector('#in-go');
        if (goBtn) goBtn.focus({ preventScroll: true });
      };
      ov.querySelector('#in-go').onclick = close;
      ov.querySelector('#in-skip').onclick = () => (ov.classList.contains('done') ? close() : (scene && scene.finish(), showFinal()));

      try { scene = Stage.introGlobe(ov.querySelector('#intro-globe'), uni); } catch (err) { console.warn('[intro]', err); }
      if (!scene) { showFinal(); return; }
      scene.play(step => {
        if (closed || ov.classList.contains('done')) return;
        if (step === 1) cap.textContent = T('You are here: Timișoara');
        else if (step === 2) cap.textContent = T('Your destination: {city}, {country}', { city: uni.city, country: T(uni.country) });
        else showFinal();
      }).catch(() => showFinal());
    });
  }

  function maybeIntro() {
    const st = Store.state;
    if (st.mode === 'journey' && st.mobility) return showIntro();
    return Promise.resolve();
  }

  /* ------------------------------------------- documents: shared row builder */

  function fmtSize(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function docMeta(d) {
    return [
      d.file_name || T('Manual entry'),
      d.size ? fmtSize(d.size) : '',
      d.doc_number ? T('No.') + ' ' + d.doc_number : '',
      d.expires_on ? T('Expires') + ' ' + fmtDate(d.expires_on) : '',
      d.issued_on ? T('Issued') + ' ' + fmtDate(d.issued_on) : '',
      d.notes,
    ].filter(Boolean).join(' - ');
  }

  function readDocFields(scope) {
    const out = {};
    scope.querySelectorAll('[data-f]').forEach(inp => { out[inp.dataset.f] = inp.value || null; });
    return out;
  }

  const yearNow = new Date().getFullYear();

  function docRow(d, onChange) {
    const row = h('<div class="doc-row" data-id="' + d.id + '">' +
      '<span class="doc-ico">' + icon(DOC_ICONS[d.doc_type] || 'file-text') + '</span>' +
      '<span style="flex:1;min-width:0"><span class="doc-name">' + esc(T(d.doc_type)) + '</span><br/>' +
      '<span class="doc-meta">' + esc(docMeta(d)) + '</span></span>' +
      '<button class="icon-btn" data-view aria-label="' + esc(T('Open the saved copy')) + '">' + icon('eye') + '</button>' +
      '<button class="icon-btn" data-del aria-label="' + esc(T('Remove document')) + '">' + icon('trash-2') + '</button>' +
      '</div>');
    const edit = h('<details class="doc-edit"><summary>' + esc(T('Details and manual data')) + '</summary>' +
      '<div class="form-field"><label>' + esc(T('Number')) + '</label><input data-f="doc_number" value="' + esc(d.doc_number || '') + '" placeholder="' + esc(T('e.g. RX123456')) + '" /></div>' +
      dmyField('Issued on', { name: 'issued_on', value: d.issued_on, from: yearNow - 25, to: yearNow }) +
      dmyField('Expires on', { name: 'expires_on', value: d.expires_on, from: yearNow - 1, to: yearNow + 20 }) +
      '<div class="form-field"><label>' + esc(T('Notes')) + '</label><input data-f="notes" value="' + esc(d.notes || '') + '" placeholder="' + esc(T('Anything to remember')) + '" /></div>' +
      '<button class="ghost" data-save>' + esc(T('Save details')) + '</button>' +
      '</details>');
    wireDmy(edit);
    edit.querySelector('[data-save]').onclick = async ev => {
      ev.preventDefault();
      try {
        await Store.updateUserDoc(d.id, readDocFields(edit));
        toast(T('Details saved'));
        if (onChange) onChange();
      } catch (e) { toast(T('Could not save details')); }
    };
    row.appendChild(edit);

    row.querySelector('[data-view]').onclick = async () => {
      const blob = await Store.getDocBlob(d.doc_type);
      if (!blob) { toast(T('No file on this device. Keep the data as text in the details.')); return; }
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    };
    row.querySelector('[data-del]').onclick = async () => {
      await Store.deleteUserDoc(d.id);
      await Store.deleteDocBlob(d.doc_type);
      toast(T('Document removed'));
      if (onChange) onChange();
    };
    return row;
  }

  const typeSelect = () => '<div class="select-wrap"><select id="doc-type">' +
    DOC_TYPES.map(t => '<option value="' + esc(t) + '">' + esc(T(t)) + '</option>').join('') + '</select>' + icon('chevron-down', 'sel-ico') + '</div>';

  /* ------------------------------------------------------ deadlines + profile */

  function projectDeadlines() {
    const st = Store.state;
    let types = [];
    try {
      const onb = JSON.parse((st.user && st.user.onboarding) || 'null');
      if (onb && Array.isArray(onb.projects) && onb.projects.length) types = onb.projects;
    } catch (e) { /* fall back to all */ }
    if (!types.length) types = PROJECT_TYPES;
    const mob = st.mobility;
    const out = [];
    for (const d of (st.deadlines || [])) {
      if (types.indexOf(d.type) === -1) continue;
      let when = null;
      if (mob && mob.start_date) {
        const s = parseYmd(mob.start_date);
        when = new Date(s.getFullYear(), s.getMonth() - d.months_before, s.getDate());
      }
      out.push({ type: d.type, title: d.title, note: d.note, months_before: d.months_before, date: when });
    }
    return out;
  }

  function onbLine(user) {
    if (!user || !user.onboarding) return '';
    let onb = null;
    try { onb = JSON.parse(user.onboarding); } catch (e) { return ''; }
    if (!onb) return '';
    const bits = [];
    if (onb.projects && onb.projects.length) bits.push(onb.projects.map(T).join(' / '));
    if (onb.duration) bits.push(T(onb.duration));
    if (onb.knownLanguages && onb.knownLanguages.length) bits.push(onb.knownLanguages.map(T).join(', '));
    if (onb.places && onb.places.length) bits.push(onb.places.map(T).join(', '));
    return bits.join(' - ');
  }

  function viewProfile(root) {
    const u = Store.state.user || {};
    const st = Store.state;
    const ob = onbLine(u);
    const sel = (cond) => (cond ? 'selected' : '');
    const wrap = h('<div class="screen panel">' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Profile')) + '</p>' +
      '<div class="form-field"><label>' + esc(T('Faculty')) + '</label>' +
      '<div class="select-wrap"><select id="f-faculty">' +
      '<option value="AC" ' + sel(u.faculty === 'AC' || !u.faculty) + '>' + esc(T('AC - Computers and Information Technology')) + '</option>' +
      '<option value="Other" ' + sel(u.faculty && u.faculty !== 'AC') + '>' + esc(T('Other')) + '</option>' +
      '</select>' + icon('chevron-down', 'sel-ico') + '</div></div>' +
      '<div class="form-field"><label>' + esc(T('Program')) + '</label>' +
      '<input id="f-program" list="programs" value="' + esc(u.program || 'Computer Science') + '" />' +
      '<datalist id="programs"><option>Computer Science</option><option>Information Technology</option><option>Automation</option></datalist></div>' +
      '<div class="form-field"><label>' + esc(T('Year')) + '</label>' +
      '<div class="select-wrap"><select id="f-year">' + [1, 2, 3, 4].map(y => '<option ' + sel(u.year === y) + '>' + y + '</option>').join('') + '</select>' + icon('chevron-down', 'sel-ico') + '</div></div>' +
      '<div class="form-field"><label>' + esc(T('Semester abroad')) + '</label>' +
      '<div class="select-wrap"><select id="f-sem">' +
      '<option value="fall" ' + sel(u.semester_abroad === 'fall') + '>' + esc(T('Fall')) + '</option>' +
      '<option value="spring" ' + sel(u.semester_abroad === 'spring') + '>' + esc(T('Spring')) + '</option>' +
      '</select>' + icon('chevron-down', 'sel-ico') + '</div></div>' +
      '<button class="primary" id="save-profile">' + esc(T('Save and pick subjects')) + '</button>' +
      '</div>' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Settings')) + '</p>' +
      (ob ? '<p class="hint" style="margin-top:0">' + esc(ob) + '</p>' : '') +
      '<button class="ghost" id="redo-onb">' + esc(T('Redo setup')) + '</button>' +
      '</div>' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('App on your phone')) + '</p>' +
      (isStandalone()
        ? '<p class="hint" style="margin:0">' + esc(T('You are using the installed app.')) + '</p>'
        : '<p class="hint" style="margin-top:0">' + esc(T('Open this site on your phone, then: Android (Chrome) - menu, "Install app"; iPhone (Safari) - Share, "Add to Home Screen". PoliGo then opens full screen, like a normal app.')) + '</p>' +
          (installPrompt ? '<button class="primary" id="install-app">' + icon('arrow-right', 'inline-ico') + ' ' + esc(T('Install the app')) + '</button>' : '')) +
      '</div>' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Messages')) + '</p>' +
      '<div id="inbox-list"><p class="hint" style="margin:0 0 8px">' + esc(T('Loading messages...')) + '</p></div>' +
      '<div class="form-field"><textarea id="inbox-reply" rows="2" placeholder="' + esc(T('Reply to the admins...')) + '" aria-label="' + esc(T('Reply to the admins...')) + '"></textarea></div>' +
      '<button class="ghost" id="inbox-send">' + esc(T('Send')) + '</button>' +
      '</div>' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Account')) + '</p>' +
      '<div class="doc-row">' +
      '<span class="doc-ico">' + icon('user') + '</span>' +
      '<span style="flex:1;min-width:0"><span class="doc-name">' + esc(st.sessionEmail || T('Guest on this device')) + '</span><br/>' +
      '<span class="doc-meta">' + esc(st.sessionEmail ? T('Signed in') : T('Progress is stored only on this device')) + '</span></span>' +
      '</div>' +
      (st.sessionEmail
        ? '<button class="ghost" id="logout">' + icon('log-out', 'inline-ico') + ' ' + esc(T('Log out')) + '</button>'
        : '<button class="primary" id="go-auth">' + icon('log-in', 'inline-ico') + ' ' + esc(T('Log in with your student email')) + '</button>') +
      '</div>' +
      '</div>');

    (async () => {
      const box = wrap.querySelector('#inbox-list');
      const inbox = await Store.getInbox();
      if (!inbox.messages.length) {
        box.innerHTML = '<p class="hint" style="margin:0 0 8px">' + esc(T('No messages yet. Admin notices appear here.')) + '</p>';
        return;
      }
      box.innerHTML = inbox.messages.map(m =>
        '<div class="doc-row"><span class="doc-ico">' + icon('info') + '</span>' +
        '<span style="flex:1;min-width:0"><span class="doc-name">' + esc(m.from_admin ? T('Admin') : T('You')) +
        (m.read || !m.from_admin ? '' : ' <span class="badge due">' + esc(T('New')) + '</span>') + '</span>' +
        '<span class="doc-meta">' + esc(m.ts) + '</span><br/>' + esc(m.text) + '</span></div>'
      ).join('');
    })();
    Store.markInboxRead();

    wrap.querySelector('#save-profile').onclick = async () => {
      await Store.saveProfile({
        faculty: wrap.querySelector('#f-faculty').value,
        program: wrap.querySelector('#f-program').value,
        year: parseInt(wrap.querySelector('#f-year').value, 10),
        semester_abroad: wrap.querySelector('#f-sem').value,
      });
      go('subjects');
    };
    wrap.querySelector('#redo-onb').onclick = () => go('onboarding');
    const installBtn = wrap.querySelector('#install-app');
    if (installBtn) {
      installBtn.onclick = async () => {
        const p = installPrompt;
        installPrompt = null;
        if (!p) return;
        p.prompt();
        try { await p.userChoice; } catch (e) { /* dismissed */ }
        render();
      };
    }
    wrap.querySelector('#inbox-send').onclick = async () => {
      const ta = wrap.querySelector('#inbox-reply');
      const text = ta.value.trim();
      if (!text) { toast(T('Nothing to send')); return; }
      try {
        await Store.replyInbox(text);
        ta.value = '';
        toast(T('Sent to the admins'));
        render();
      } catch (e) { toast(errText(e)); }
    };
    const logoutBtn = wrap.querySelector('#logout');
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        await Store.logout();
        history.length = 0;
        go('landing', { replace: true, force: true });
      };
    }
    const authBtn = wrap.querySelector('#go-auth');
    if (authBtn) authBtn.onclick = () => go('auth');
    root.appendChild(wrap);
  }

  /* ------------------------------------------------------ subjects / explore */

  function viewSubjects(root) {
    const courses = Store.state.homeCourses;
    const selected = new Set(courses.map(c => c.id));
    const list = h('<div class="screen panel">' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('My subjects')) + ' - ' + esc((Store.state.user && Store.state.user.program) || 'Computer Science') + '</p>' +
      '<div id="course-list"></div>' +
      '<p class="hint" id="ects-line"></p>' +
      '<button class="primary" id="find-matches">' + esc(T('Find my matches')) + '</button>' +
      '</div></div>');
    const listEl = list.querySelector('#course-list');
    const ects = () => {
      const sum = courses.filter(c => selected.has(c.id)).reduce((s, c) => s + c.ects, 0);
      list.querySelector('#ects-line').textContent = T('{n} ECTS selected', { n: sum });
    };
    for (const c of courses) {
      const row = h('<label class="task-card">' +
        '<input type="checkbox" checked data-id="' + c.id + '" />' +
        '<span><span class="t-title">' + esc(T(c.name)) + '</span>' +
        '<span class="t-meta">' + c.ects + ' ECTS - ' + esc((c.topics || []).slice(0, 3).map(T).join(', ')) + '</span></span>' +
        '</label>');
      row.querySelector('input').onchange = e => {
        e.target.checked ? selected.add(c.id) : selected.delete(c.id);
        ects();
      };
      listEl.appendChild(row);
    }
    ects();
    list.querySelector('#find-matches').onclick = () => go('map');
    root.appendChild(list);
  }

  const siteHost = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

  // "fhstp.ac.at" with an external-link icon, opens the university's own site
  function siteLink(u, cls) {
    if (!u || !u.website) return '';
    return '<a class="uni-link ' + (cls || '') + '" href="' + esc(u.website) + '" target="_blank" rel="noopener noreferrer">' +
      icon('external-link', 'sm-ico') + '<span>' + esc(siteHost(u.website)) + '</span></a>';
  }

  const metaLine = u => esc(u.city) + ', ' + esc(T(u.country)) + ' - ' + esc((u.languages || []).map(T).join(', '));

  function uniCard(u) {
    const card = h('<div class="card uni-card" role="link" tabindex="0">' +
      flagImg(u.country_code) +
      '<span><span class="name">' + esc(u.name) + '</span><br/>' +
      '<span class="meta">' + metaLine(u) + '</span><br/>' + siteLink(u) + '</span>' +
      '<span class="badge"><span class="num">' + u.summary.matched + '/' + u.summary.total + '</span><br/><span class="lbl">' + esc(T('match')) + '</span></span>' +
      '</div>');
    const open = () => { Store.state.activeUniId = u.id; go('uni'); };
    card.onclick = ev => { if (!ev.target.closest('a')) open(); };
    card.onkeydown = ev => { if (ev.key === 'Enter' && ev.target === card) open(); };
    return card;
  }

  function tierOf(u) {
    const s = u.summary || {};
    const f = s.total ? s.matched / s.total : 0;
    return f >= 0.6 ? 'good' : f >= 0.3 ? 'partial' : 'weak';
  }

  // Two dropdowns: language and country.
  function buildFilters(el, onChange) {
    const langs = [...new Set(Store.state.universities.flatMap(u => u.languages || []))].sort();
    const countries = [...new Set(Store.state.universities.map(u => u.country))].sort();
    const f = Store.state.filters;
    f.region = null; f.quality = null;   // no longer offered - drop any value saved from before
    const selectOf = (kind, allLabel, options) =>
      '<div class="select-wrap"><select data-filter="' + kind + '">' +
      '<option value="">' + esc(allLabel) + '</option>' +
      options.map(([value, label]) => '<option value="' + esc(value) + '" ' + (f[kind] === value ? 'selected' : '') + '>' + esc(label) + '</option>').join('') +
      '</select>' + icon('chevron-down', 'sel-ico') + '</div>';
    el.innerHTML = '<div class="filter-grid">' +
      selectOf('lang', T('All languages'), langs.map(l => [l, T(l)])) +
      selectOf('country', T('All countries'), countries.map(c => [c, T(c)])) +
      '</div>';
    el.querySelectorAll('select[data-filter]').forEach(sel => {
      sel.onchange = () => { f[sel.dataset.filter] = sel.value || null; onChange(); };
    });
  }

  // Universities: one screen, three views. On a phone the tab row switches
  // List / Map / Favorite; on a wide screen the globe and the list sit side by
  // side (app.css), so the row shows only All universities / Favorite.
  function mapTabNow() {
    const t = Store.state.mapTab;
    return t === 'map' || t === 'favorite' ? t : 'list';   // 'all' (old saved state) -> list
  }

  function viewMap(root) {
    const tab = mapTabNow();
    // #filters / #uni-list / #sl-list stay DIRECT children of .card - the
    // ":has(> ...)" rules in app.css (flat-list styling, the wide-screen
    // globe grid) key off that, so the tab row must not add a wrapper div.
    const bodyHtml = tab === 'favorite'
      ? '<p class="hint">' + esc(T('Save as many as you like, in order of preference.')) + '</p>' +
        '<p class="hint" id="fav-empty" hidden>' + esc(T('Nothing here yet. Open a university and tap "Favorite".')) + '</p>' +
        '<div id="sl-list"></div>'
      : '<div id="filters"></div><p class="hint" id="uni-count"></p><div id="uni-list"></div>';
    const favN = ((Store.state.user && Store.state.user.shortlist) || []).length;
    // on a wide screen "List" reads "All universities" and also stands for the map view
    const cls = id => tab === id ? 'active' : (id === 'list' && tab === 'map' ? 'active-wide' : '');
    const tabBtn = (id, inner) => '<button class="' + cls(id) + '" data-maptab="' + id + '" role="tab" aria-selected="' + (tab === id) + '">' + inner + '</button>';
    const wrap = h('<div class="screen panel">' +
      '<div class="card uni-screen view-' + tab + '">' +
      '<p class="section-label">' + esc(T('Universities')) + '</p>' +
      '<div class="tab-row" role="tablist">' +
      tabBtn('list', '<span class="tab-narrow">' + esc(T('List')) + '</span><span class="tab-wide">' + esc(T('All universities')) + '</span>') +
      tabBtn('map', icon('map', 'sm-ico') + ' ' + esc(T('Map'))) +
      tabBtn('favorite', icon('bookmark', 'sm-ico') + ' ' + esc(T('Favorite')) + (favN ? ' <span class="tab-count">' + favN + '</span>' : '')) +
      '</div>' +
      bodyHtml +
      '</div></div>');
    const card = wrap.querySelector('.card');
    wrap.querySelectorAll('[data-maptab]').forEach(b => {
      b.onclick = () => {
        const t = b.dataset.maptab;
        Store.state.mapTab = t;
        if (t !== 'favorite') Store.state.mapView = t;
        Store.saveLocal();
        render();
      };
    });

    if (tab === 'favorite') {
      favoritesInto(card);
    } else {
      let globeBox = null;
      try {
        // inserted before #uni-count, i.e. under the filters (the wide layout places it by grid-area)
        globeBox = Stage.mapGlobe(card.querySelector('#uni-count'), id => { Store.state.activeUniId = id; go('uni'); });
      } catch (err) { console.warn('[map globe]', err); }

      const fillList = () => {
        const el = card.querySelector('#uni-list');
        const { lang, country, region, quality } = Store.state.filters;
        let unis = Store.sortedUnis();
        if (lang) unis = unis.filter(u => (u.languages || []).includes(lang));
        if (country) unis = unis.filter(u => u.country === country);
        if (region) unis = unis.filter(u => regionOf(u.country) === region);
        if (quality) unis = unis.filter(u => tierOf(u) === quality);
        el.innerHTML = '';
        if (!unis.length) { el.innerHTML = '<p class="hint">' + esc(T('No universities match the filters.')) + '</p>'; }
        for (const u of unis) el.appendChild(uniCard(u));
        card.querySelector('#uni-count').textContent = T('{n} universities, best match first', { n: unis.length });
        Stage.syncMap(globeBox);
      };
      buildFilters(card.querySelector('#filters'), fillList);
      fillList();
    }
    root.appendChild(wrap);
  }

  async function viewUniversity(root) {
    const u = await Store.getUniversityDetail(Store.state.activeUniId);
    if (!u || !u.summary) { go('map', { replace: true }); return; }
    const s = u.summary;
    const pct = s.total ? s.matched / s.total : 0;
    const circ = 2 * Math.PI * 42;
    const wrap = h('<div class="screen panel">' +
      '<div class="card">' +
      '<div class="uni-head">' +
      '<div class="match-ring">' +
      '<svg width="96" height="96">' +
      '<circle cx="48" cy="48" r="42" fill="none" stroke="var(--surface-2)" stroke-width="6"/>' +
      '<circle cx="48" cy="48" r="42" fill="none" stroke="var(--good)" stroke-width="6" stroke-dasharray="' + circ + '" stroke-dashoffset="' + circ * (1 - pct) + '"/>' +
      '</svg>' +
      '<div class="inside"><span class="num">' + s.matched + '/' + s.total + '</span><span class="lbl">' + esc(T('subjects match')) + '</span></div>' +
      '</div>' +
      '<div style="min-width:0">' +
      '<h2 style="font-size:18px">' + flagImg(u.country_code, 'inline-ico') + ' ' + esc(u.name) + '</h2>' +
      '<p class="hint" style="margin:4px 0 0">' + metaLine(u) + '</p>' +
      siteLink(u, 'uni-link-lg') +
      '</div></div>' +
      '<p class="section-label" style="margin-top:16px">' + esc(T('ECTS covered: {n} of 30', { n: s.ects_covered })) + '</p>' +
      '<div class="ects-bar"><div style="width:' + Math.min(100, s.ects_covered / 30 * 100) + '%"></div></div>' +
      '<div id="rows" style="margin-top:12px"></div>' +
      '<div class="two-btns">' +
      '<button class="ghost" id="add-sl">' + icon('plus', 'inline-ico') + ' ' + esc(T('Favorite')) + '</button>' +
      '<button class="primary" id="accepted">' + esc(T('I got accepted')) + '</button>' +
      '</div>' +
      '</div></div>');
    const rows = wrap.querySelector('#rows');
    const icons = { good: 'check', partial: 'arrow-right', none: 'x' };
    const labels = { good: 'Good match', partial: 'Partial match', none: 'No match' };
    for (const m of u.matches) {
      const row = h('<div class="match-row" tabindex="0">' +
        '<div class="line1"><span>' + esc(T(m.home_name)) + '</span><span class="arrow">' + icon('arrow-right', 'sm-ico') + '</span>' +
        '<span>' + esc(m.partner_name ? T(m.partner_name) : T('No partner course')) + '</span></div>' +
        '<div class="line2"><span class="pill ' + m.label + '">' + icon(icons[m.label], 'sm-ico') + ' ' + esc(T(labels[m.label] || m.label)) + '</span>' +
        '<span>' + (m.partner_ects ? m.partner_ects + ' ECTS' : '') + '</span></div>' +
        '<div class="explain" hidden>' + esc(T(m.explanation || '')) +
        (m.missing_topics && m.missing_topics.length ? '<br/>' + esc(T('Missing:')) + ' ' + esc(m.missing_topics.map(T).join(', ')) : '') + '</div>' +
        '</div>');
      const toggle = () => { const ex = row.querySelector('.explain'); ex.hidden = !ex.hidden; };
      row.onclick = toggle;
      row.onkeydown = ev => { if (ev.key === 'Enter') toggle(); };
      rows.appendChild(row);
    }
    wrap.querySelector('#add-sl').onclick = async () => {
      await Store.addToShortlist(u.id);
      toast(T('Added to favorites'));
    };
    wrap.querySelector('#accepted').onclick = () => openAcceptedSheet(u.id);
    root.appendChild(wrap);
  }

  // Favorite: a sub-tab on the Map screen (not its own nav item any more).
  // Fills #sl-list in place so it stays a direct child of .card, same as the
  // old standalone screen - the "flat list" card styling keys off that.
  function favoritesInto(mapCard) {
    const sl = (Store.state.user && Store.state.user.shortlist) || [];
    const emptyEl = mapCard.querySelector('#fav-empty');
    if (emptyEl) emptyEl.hidden = sl.length !== 0;
    const list = mapCard.querySelector('#sl-list');
    list.innerHTML = '';
    sl.forEach((s, idx) => {
      const u = Store.uniById(s.id) || s;
      const row = h('<div class="card uni-card">' +
        '<span class="badge"><span class="num">' + (idx + 1) + '</span></span>' +
        '<span><span class="name">' + esc(u.name) + '</span><br/>' +
        '<span class="meta">' + esc(u.city || '') + (u.summary ? ' - ' + u.summary.matched + '/' + u.summary.total + ' ' + esc(T('match')) : '') + '</span>' +
        (u.website ? '<br/>' + siteLink(u) : '') + '</span>' +
        '<span style="margin-left:auto;display:flex;gap:8px">' +
        '<button class="ghost accepted-btn">' + esc(T('Accepted')) + '</button>' +
        '<button class="icon-btn" data-remove aria-label="' + esc(T('Remove')) + '">' + icon('trash-2') + '</button>' +
        '</span></div>');
      row.querySelector('[data-remove]').onclick = async () => { await Store.removeFromShortlist(s.id); render(); };
      row.querySelector('.accepted-btn').onclick = () => openAcceptedSheet(s.id);
      list.appendChild(row);
    });
  }

  /* ------------------------------------------------------ the "I got accepted" step */

  const OVERLAP_WARN_DAYS = 14; // flag a gap shorter than this between two mobilities

  // Warns when a new request overlaps the student's current active mobility,
  // or leaves too little time between the two to realistically arrange.
  function dateConflictMessage(newStart, newEnd) {
    const mob = Store.state.mobility;
    if (!mob || !mob.start_date || !mob.end_date || !newStart || !newEnd) return null;
    const ns = parseYmd(newStart), ne = parseYmd(newEnd);
    const os = parseYmd(mob.start_date), oe = parseYmd(mob.end_date);
    if (ns <= oe && ne >= os) return T('This overlaps with the dates of your current mobility.');
    const gapDays = ns > oe ? Math.round((ns - oe) / 86400000) : Math.round((os - ne) / 86400000);
    if (gapDays < OVERLAP_WARN_DAYS) return T('Only {n} day(s) between this and your current mobility - tight to arrange.', { n: gapDays });
    return null;
  }

  function openAcceptedSheet(preId) {
    const sl = (Store.state.user && Store.state.user.shortlist) || [];
    const u0 = preId || (sl[0] && sl[0].id) || ((Store.sortedUnis()[0] || {}).id);
    const now = new Date();
    const defStart = addDays(now, 47);
    const sheet = h('<div class="sheet" role="dialog" aria-modal="true">' +
      '<div class="sheet-grab"></div>' +
      '<h2>' + esc(T('I got accepted')) + '</h2>' +
      '<div class="form-field"><label>' + esc(T('University')) + '</label>' +
      '<div class="select-wrap"><select id="a-uni">' + Store.state.universities.map(u => '<option value="' + u.id + '" ' + (u.id === u0 ? 'selected' : '') + '>' + esc(u.name) + '</option>').join('') + '</select>' + icon('chevron-down', 'sel-ico') + '</div></div>' +
      dmyField('Start date', { id: 'a-start', value: ymd(defStart), from: now.getFullYear(), to: now.getFullYear() + 4 }) +
      dmyField('Arrival date (optional)', { id: 'a-arrival', value: ymd(addDays(defStart, -3)), from: now.getFullYear(), to: now.getFullYear() + 4 }) +
      dmyField('End date', { id: 'a-end', value: ymd(addDays(now, 197)), from: now.getFullYear(), to: now.getFullYear() + 5 }) +
      '<div class="notice" id="acc-warn" hidden></div>' +
      '<p class="hint">' + esc(T('An admin from the Erasmus office confirms it before your journey starts.')) + '</p>' +
      '<button class="primary" id="acc-go">' + esc(T('Send for approval')) + '</button>' +
      '<button class="link" id="acc-cancel">' + esc(T('Not now')) + '</button>' +
      '</div>');
    wireDmy(sheet);
    const startInp = sheet.querySelector('#a-start');
    const arrivalInp = sheet.querySelector('#a-arrival');
    const endInp = sheet.querySelector('#a-end');
    const warnEl = sheet.querySelector('#acc-warn');
    const refreshWarn = () => {
      const msg = dateConflictMessage(startInp.value, endInp.value);
      warnEl.hidden = !msg;
      if (msg) warnEl.innerHTML = icon('triangle-alert', 'sm-ico') + '<span>' + esc(msg) + '</span>';
    };
    startInp.addEventListener('change', () => {
      if (startInp.value) arrivalInp.setIso(ymd(addDays(parseYmd(startInp.value), -3)));
      refreshWarn();
    });
    endInp.addEventListener('change', refreshWarn);
    refreshWarn();
    sheet.querySelector('#acc-go').onclick = async () => {
      if (!startInp.value || !endInp.value) { toast(T('Pick the start and the end date.')); return; }
      if (endInp.value <= startInp.value) { toast(T('The end date must be after the start date.')); return; }
      try {
        const out = await Store.accept({
          university_id: sheet.querySelector('#a-uni').value,
          start_date: startInp.value,
          arrival_date: arrivalInp.value || null,
          end_date: endInp.value,
        });
        sheet.remove();
        Store.state.activeUniId = out.mobility.university_id;
        go('home', { replace: true, force: true });
        toast(T('Sent for approval. Your journey opens once the Erasmus office confirms it.'));
      } catch (e) { toast(errText(e)); }
    };
    sheet.querySelector('#acc-cancel').onclick = () => sheet.remove();
    document.body.appendChild(sheet);
  }

  /* --------------------------------------------------------- journey screens */

  function dueChip(due) {
    if (!due) return '<span class="due soon">' + esc(T('No date')) + '</span>';
    const t0 = new Date();
    const days = Math.round((parseYmd(due) - new Date(t0.getFullYear(), t0.getMonth(), t0.getDate())) / 86400000);
    if (days < 0) return '<span class="due overdue">' + esc(T('Overdue by {days}', { days: nDays(-days) })) + '</span>';
    if (days === 0) return '<span class="due today">' + esc(T('Due today')) + '</span>';
    if (days === 1) return '<span class="due soon">' + esc(T('Tomorrow')) + '</span>';
    return '<span class="due soon">' + esc(T('In {days}', { days: nDays(days) })) + '</span>';
  }

  const stageLabel = st => T(STAGE_LABELS[st] || st);

  function taskWarnings() {
    const today = ymd(new Date());
    const soonCutoff = ymd(addDays(new Date(), 3));
    const open = (Store.state.tasks || []).filter(t => !t.done);
    const overdue = open.filter(t => t.due_date && t.due_date < today).length;
    const dueSoon = open.filter(t => t.due_date && t.due_date >= today && t.due_date <= soonCutoff).length;
    return { total: open.length, overdue, dueSoon };
  }

  function hasOverdueTasks() {
    const today = ymd(new Date());
    return (Store.state.tasks || []).some(t => !t.done && t.due_date && t.due_date < today);
  }

  function viewToday(root) {
    const mob = Store.state.mobility;
    const wrap0 = h('<div class="screen panel"></div>');
    root.appendChild(wrap0);
    if (!mob) {
      wrap0.innerHTML = '<div class="card"><p class="hint" style="margin:0">' + esc(T('Pick a university and tell us you were accepted to start your journey.')) + '</p></div>';
      openAcceptedSheet();
      return;
    }
    const uni = Store.uniById(mob.university_id);
    const now = new Date();
    const start = parseYmd(mob.start_date), end = parseYmd(mob.end_date), arrival = parseYmd(mob.arrival_date || mob.start_date);
    const totalDays = Math.max(1, Math.round((end - start) / 86400000));
    let countNum, countText;
    if (now < arrival) {
      countNum = clockParts(arrival - now).d;     // same number as the countdown below
      countText = T('days to departure');
    } else if (now <= end) {
      countNum = Math.max(1, Math.ceil((now - arrival) / 86400000));
      countText = T('day of') + ' ' + totalDays;
    } else {
      countNum = '∞';
      countText = T('Welcome back!');
    }
    const next = Store.state.tasks.filter(t => !t.done).slice(0, 3);
    const pct = stage => {
      const ts = Store.state.tasks.filter(t => t.stage === stage);
      return ts.length ? Math.round(100 * ts.filter(t => t.done).length / ts.length) : 0;
    };
    const circ = 2 * Math.PI * 52;
    const frac = Math.min(1, Math.max(0, (now - arrival) / ((end - arrival) || 1)));
    const warn = taskWarnings();
    const warnHtml = warn.total ? '<div class="notice' + (warn.overdue ? ' bad' : '') + '">' + icon('triangle-alert', 'sm-ico') +
      '<span>' + esc(warn.overdue ? T('You have {n} overdue task(s)', { n: warn.overdue }) : T('You have {n} uncompleted task(s)', { n: warn.total })) +
      (warn.dueSoon ? ' - ' + esc(T('{n} due within 3 days', { n: warn.dueSoon })) : '') + '</span></div>' : '';
    wrap0.innerHTML =
      '<div class="card today-head">' +
      '<div class="ring">' +
      '<svg width="120" height="120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-2)" stroke-width="6"/>' +
      '<circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent-live)" stroke-width="6" stroke-dasharray="' + circ + '" stroke-dashoffset="' + circ * (1 - frac) + '"/></svg>' +
      '<div class="inside"><span class="big-num">' + esc(countNum) + '</span><span class="unit">' + esc(countText) + '</span></div>' +
      '</div>' +
      '<div style="min-width:0">' +
      '<p class="section-label">' + esc(uni ? uni.name : T('Your mobility')) + '</p>' +
      '<p class="hint" style="margin:4px 0 0">' + esc(fmtDate(mob.start_date)) + ' → ' + esc(fmtDate(mob.end_date)) + '<br/>' + esc(uni ? uni.city + ', ' + T(uni.country) : '') + '</p>' +
      '</div></div>' +
      '<div class="card">' + countdownHtml() + '</div>' +
      warnHtml +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Next up')) + '</p>' +
      (next.map(t => '<div class="task-card"><span><span class="t-title">' + esc(T(t.title)) + '</span><span class="t-meta">' + dueChip(t.due_date) + '</span></span></div>').join('') || '<p class="hint" style="margin:0">' + esc(T('All clear.')) + '</p>') +
      '</div>' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Stage progress')) + '</p>' +
      STAGES.map(stg => '<p class="hint" style="margin:8px 0 4px">' + esc(stageLabel(stg)) + '</p><div class="stage-progress"><div style="width:' + pct(stg) + '%"></div></div>').join('') +
      '</div>' +
      '<button class="primary" id="scan-btn">' + icon('scan-line', 'inline-ico') + ' ' + esc(T('Scan a document')) + '</button>';
    wrap0.querySelector('#scan-btn').onclick = () => go('scanJ');
    startCountdown(wrap0);
  }

  /* ------------------------------------------------- plan = steps + calendar */

  // One screen instead of two: the steps to do (what used to be Timeline) on top,
  // the month calendar with the same steps and deadlines marked below it.
  function viewPlan(root) {
    const panel = h('<div class="screen panel"></div>');
    if (!Store.state.mobility) {
      panel.innerHTML = '<div class="card"><p class="hint" style="margin:0">' + esc(T('Your plan appears once your mobility is approved.')) + '</p></div>';
      root.appendChild(panel);
      return;
    }
    stepsInto(panel);
    calendarInto(panel);
    root.appendChild(panel);
  }

  /* ----------------------------------------------------------------- calendar */

  function calendarInto(root) {
    const st = Store.state;
    if (!st.calView) {
      const n = new Date();
      st.calView = { y: n.getFullYear(), m: n.getMonth() };
    }
    const mob = st.mobility;
    const awaySet = new Set();
    if (mob && mob.start_date) {
      const a = parseYmd(mob.arrival_date || mob.start_date);
      for (let i = 0; i < 366 * 3; i++) {
        const ds = ymd(addDays(a, i));
        if (ds > mob.end_date) break;
        awaySet.add(ds);
      }
    }
    const dlSet = new Set();
    for (const d of projectDeadlines()) if (d.date) dlSet.add(ymd(d.date));
    const taskSet = new Set(st.tasks.filter(t => t.due_date).map(t => t.due_date));
    const today = ymd(new Date());

    const wrap = h('<div class="plan-part">' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Calendar')) + '</p>' +
      '<div class="cal-head">' +
      '<button class="ghost cal-nav" data-m="-1" aria-label="' + esc(T('Previous month')) + '">' + icon('arrow-left') + '</button>' +
      '<span class="cal-title" id="cal-title"></span>' +
      '<button class="ghost cal-nav" data-m="1" aria-label="' + esc(T('Next month')) + '">' + icon('arrow-right') + '</button>' +
      '</div>' +
      '<div class="cal-grid" id="cal-grid"></div>' +
      '<p class="hint cal-legend">' +
      '<span class="lg"><i class="sw dl"></i>' + esc(T('Deadline')) + '</span>' +
      '<span class="lg"><i class="sw task"></i>' + esc(T('Step')) + '</span>' +
      '<span class="lg"><i class="sw free"></i>' + esc(T('Free')) + '</span>' +
      '<span class="lg"><i class="sw busy"></i>' + esc(T('Busy')) + '</span>' +
      '<span class="lg"><i class="sw away"></i>' + esc(T('Away')) + '</span></p>' +
      '<p class="hint">' + esc(T('Any day you have not marked away is free by default. Tap a free day to mark it busy if you cannot use it.')) + '</p>' +
      '</div>' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Deadlines')) + '</p>' +
      '<div id="dl-list"></div>' +
      '</div>' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Sync your calendar')) + '</p>' +
      '<p class="hint">' + esc(T('Export your mobility dates, steps and deadlines to Google Calendar, Outlook or Apple Calendar.')) + '</p>' +
      '<div class="two-btns">' +
      '<a class="ghost" id="gcal-link" target="_blank" rel="noopener">' + icon('calendar-days', 'inline-ico') + ' ' + esc(T('Add to Google Calendar')) + '</a>' +
      '<a class="ghost" id="ics-link" download="poligo.ics">' + icon('link', 'inline-ico') + ' ' + esc(T('Download .ics (subscribe)')) + '</a>' +
      '</div>' +
      '</div></div>');

    const titleEl = wrap.querySelector('#cal-title');
    const gridEl = wrap.querySelector('#cal-grid');

    const gcalA = wrap.querySelector('#gcal-link');
    const icsA = wrap.querySelector('#ics-link');
    if (mob && mob.start_date && mob.end_date) {
      const startFmt = mob.start_date.replace(/-/g, '');
      const endFmt = ymd(addDays(parseYmd(mob.end_date), 1)).replace(/-/g, '');
      const uni = Store.uniById(mob.university_id);
      const title = encodeURIComponent('Erasmus at ' + (uni ? uni.name : ''));
      gcalA.href = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + title + '&dates=' + startFmt + '/' + endFmt;
    } else {
      gcalA.href = '#';
      gcalA.onclick = e => { e.preventDefault(); toast(T('Accept a mobility first to export its dates')); };
    }
    icsA.href = '/api/calendar/' + Store.state.userId + '.ics';

    function draw() {
      const { y, m } = st.calView;
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      let freeCount = 0;
      for (let dnum = 1; dnum <= daysInMonth; dnum++) {
        const ds = ymd(new Date(y, m, dnum));
        if (!awaySet.has(ds) && !Store.isBusy(ds)) freeCount++;
      }
      titleEl.textContent = T(MONTHS[m]) + ' ' + y + ' - ' + T('{n} days free', { n: freeCount });
      gridEl.innerHTML = '';
      for (const w of WDAYS) gridEl.appendChild(h('<span class="cal-wd">' + esc(T(w)) + '</span>'));
      const lead = (new Date(y, m, 1).getDay() + 6) % 7;
      for (let i = 0; i < lead; i++) gridEl.appendChild(h('<span class="cal-cell empty"></span>'));
      for (let dnum = 1; dnum <= daysInMonth; dnum++) {
        const ds = ymd(new Date(y, m, dnum));
        const away = awaySet.has(ds);
        const busy = !away && Store.isBusy(ds);
        const cls = ['cal-cell'];
        if (ds === today) cls.push('today');
        if (away) cls.push('away');
        else cls.push(busy ? 'busy' : 'free');
        if (dlSet.has(ds)) cls.push('has-dl');
        if (taskSet.has(ds)) cls.push('has-task');
        const cell = h('<button class="' + cls.join(' ') + '" aria-label="' + esc(fmtDate(ds)) + '"><span class="cal-date">' + dnum + '</span><span class="cal-mark"></span></button>');
        cell.onclick = () => {
          if (away) { toast(T('Already away for your mobility')); return; }
          const nowBusy = Store.toggleBusy(ds);
          cell.classList.toggle('busy', nowBusy);
          cell.classList.toggle('free', !nowBusy);
          toast(fmtDate(ds) + ' - ' + T(nowBusy ? 'Marked busy' : 'Free'));
          titleEl.textContent = T(MONTHS[m]) + ' ' + y + ' - ' + T('{n} days free', { n: freeCount + (nowBusy ? -1 : 1) });
        };
        gridEl.appendChild(cell);
      }
    }

    wrap.querySelector('.cal-head').addEventListener('click', e => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      let { y, m } = st.calView;
      m += parseInt(b.dataset.m, 10);
      if (m < 0) { m = 11; y -= 1; }
      if (m > 11) { m = 0; y += 1; }
      st.calView = { y: y, m: m };
      draw();
    });

    const dlList = wrap.querySelector('#dl-list');
    const dls = projectDeadlines();
    if (!dls.length) {
      dlList.innerHTML = '<p class="hint" style="margin:0">' + esc(T('No deadlines for the selected project types.')) + '</p>';
    } else {
      for (const d of dls) {
        dlList.appendChild(h('<div class="task-card">' +
          '<span style="flex:1;min-width:0"><span class="t-title">' + esc(T(d.title)) + '</span>' +
          '<span class="t-meta">' + esc(T(d.type)) + (d.note ? ' - ' + esc(T(d.note)) : '') + '</span></span>' +
          '<span class="cal-date dl-when">' + (d.date ? esc(fmtDate(ymd(d.date))) : d.months_before + ' ' + esc(T('mo'))) + '</span>' +
          '</div>'));
      }
    }

    draw();
    root.appendChild(wrap);
  }

  /* --------------------------------------------------------- steps / scan / docs */

  function stepsInto(root) {
    const tasks = Store.state.tasks.slice().sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
    if (!tlOpen) {
      // open the stages that still have something to do (at most two)
      tlOpen = new Set(STAGES.filter(s => tasks.some(t => t.stage === s && !t.done)).slice(0, 2));
    }
    const card = h('<div class="card" id="tl"></div>');

    const taskCard = t => {
      const src = { template: 'Template', scan: 'From scan', user: 'Added by you' }[t.source] || t.source;
      return '<label class="task-card ' + (t.done ? 'done' : '') + '">' +
        '<input type="checkbox" data-id="' + t.id + '" data-stage="' + esc(t.stage) + '" ' + (t.done ? 'checked' : '') + ' />' +
        '<span><span class="t-title">' + esc(T(t.title)) + '</span>' +
        '<span class="t-meta">' + dueChip(t.due_date) + ' <span>' + esc(T(src)) + '</span></span></span>' +
        '</label>';
    };

    function draw() {
      card.innerHTML = '<p class="section-label">' + esc(T('Your steps')) + '</p>' +
        STAGES.map(st => {
          const list = tasks.filter(t => t.stage === st);
          if (!list.length) return '';
          const open = tlOpen.has(st);
          return '<section class="stage" data-stage="' + st + '">' +
            '<button class="stage-h' + (open ? ' open' : '') + '" data-toggle="' + st + '" aria-expanded="' + open + '">' +
            '<span class="sh-l">' + icon('chevron-down', 'sm-ico') + esc(stageLabel(st)) + '</span>' +
            '<span class="sh-n" data-count>' + list.filter(t => t.done).length + ' / ' + list.length + '</span></button>' +
            (open ? list.map(taskCard).join('') : '') + '</section>';
        }).join('') +
        '<div class="form-field" style="margin-top:16px"><label for="new-task">' + esc(T('Add your own task')) + '</label>' +
        '<input id="new-task" placeholder="' + esc(T('e.g. Pick up keys from landlord')) + '" /></div>' +
        '<button class="ghost" id="add-task">' + esc(T('Add task')) + '</button>';
      card.querySelectorAll('[data-toggle]').forEach(b => {
        b.onclick = () => {
          const s = b.dataset.toggle;
          tlOpen.has(s) ? tlOpen.delete(s) : tlOpen.add(s);
          draw();
        };
      });
      card.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.onchange = () => {
          const id = parseInt(cb.dataset.id, 10);
          Store.toggleTask(id, cb.checked);
          const t = tasks.find(x => x.id === id);
          if (t) t.done = cb.checked ? 1 : 0;
          cb.closest('.task-card').classList.toggle('done', cb.checked);
          const sec = cb.closest('.stage');
          const list = tasks.filter(x => x.stage === cb.dataset.stage);
          sec.querySelector('[data-count]').textContent = list.filter(x => x.done).length + ' / ' + list.length;
        };
      });
      card.querySelector('#add-task').onclick = async () => {
        const inp = card.querySelector('#new-task');
        if (!inp.value.trim()) return;
        await Store.addTask(Store.state.mobility ? Store.state.mobility.id : null, inp.value.trim(), 'during', null);
        tlOpen.add('during');
        render();
      };
    }
    draw();
    root.appendChild(card);
  }

  // result_json is either the explanation itself or (older rows) the whole demo document
  function parseScan(doc) {
    let r = typeof doc.result_json === 'string' ? JSON.parse(doc.result_json) : doc.result_json;
    if (r && r.result && !r.what) r = r.result;
    r = r || {};
    return {
      what: r.what || '', steps: r.steps || [], deadlines: r.deadlines || [], bring: r.bring || [],
      watch_out: r.watch_out || '', keywords: r.keywords || [],
    };
  }

  async function viewScan(root) {
    const wrap = h('<div class="screen panel">' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Scan a document')) + '</p>' +
      '<p class="hint">' + esc(T('Photograph or upload a document you received in your destination city: a rental contract, a registration form, a bill.')) + '</p>' +
      '<div class="form-field"><input id="scan-file" type="file" accept="image/*" capture="environment" aria-label="' + esc(T('Choose a photo')) + '" /></div>' +
      '<button class="primary" id="do-scan">' + icon('scan-line', 'inline-ico') + ' ' + esc(T('Scan document')) + '</button>' +
      '<p class="disclaimer">' + esc(T('AI explanation, not legal advice. Confirm with the office. In this prototype the result is a sample document.')) + '</p>' +
      '</div>' +
      '<div class="scan-cards" id="scan-result"></div>' +
      '</div>');
    wrap.querySelector('#do-scan').onclick = async () => {
      const res = wrap.querySelector('#scan-result');
      res.innerHTML = '<div class="card"><p class="hint" style="margin:0">' + esc(T('Reading your document...')) + '</p></div>';
      try {
        await new Promise(r => setTimeout(r, 1500));
        const doc = await Store.scan();
        if (!doc) { res.innerHTML = '<div class="card"><p class="hint" style="margin:0">' + esc(T('Accept an offer first to use the scanner.')) + '</p></div>'; return; }
        const r = parseScan(doc);
        res.innerHTML = scanResultHtml(r);
        wireDeadlines(res, r);
      } catch (e) {
        res.innerHTML = '<div class="card"><p class="section-label">' + esc(T('Error')) + '</p><p style="margin:4px 0 0">' + esc(T('The scanner could not read the document.')) + ' ' + esc(errText(e)) + '</p></div>';
      }
    };
    root.appendChild(wrap);

    function scanResultHtml(r) {
      return '<div class="card"><p class="section-label">' + esc(T('What this is')) + '</p><p style="margin:4px 0 0">' + esc(T(r.what)) + '</p></div>' +
        (r.steps.length ? '<div class="card"><p class="section-label">' + esc(T('What you need to do')) + '</p><ol>' + r.steps.map(s => '<li>' + esc(T(s)) + '</li>').join('') + '</ol></div>' : '') +
        (r.deadlines.length ? '<div class="card"><p class="section-label">' + esc(T('Deadlines')) + '</p>' + r.deadlines.map((dl, i) =>
          '<div class="task-card"><span class="t-title">' + esc(T(dl.text)) + '</span>' +
          '<button class="ghost" data-dl="' + i + '">' + esc(T('Add')) + '</button></div>').join('') + '</div>' : '') +
        (r.bring.length ? '<div class="card"><p class="section-label">' + esc(T('Bring with you')) + '</p><ul>' + r.bring.map(b => '<li>' + esc(T(b)) + '</li>').join('') + '</ul></div>' : '') +
        (r.watch_out ? '<div class="card"><p class="section-label">' + esc(T('Watch out')) + '</p><p style="margin:4px 0 0;display:flex;gap:6px;align-items:flex-start">' + icon('triangle-alert', 'sm-ico warn') + '<span>' + esc(T(r.watch_out)) + '</span></p></div>' : '') +
        (r.keywords.length ? '<div class="card"><p class="section-label">' + esc(T('Key words')) + '</p><p style="margin:4px 0 0">' + r.keywords.map(k => '<span class="pill kw">' + esc(k[0]) + ' → ' + esc(T(k[1])) + '</span>').join(' ') + '</p></div>' : '');
    }

    function wireDeadlines(res, r) {
      res.querySelectorAll('[data-dl]').forEach(b => {
        b.onclick = async () => {
          const dl = r.deadlines[parseInt(b.dataset.dl, 10)];
          const due = ymd(addDays(new Date(), dl.offset_days || 7));
          await Store.addTask(Store.state.mobility ? Store.state.mobility.id : null, dl.title || dl.text, 'during', due);
          b.textContent = T('Added');
          b.disabled = true;
          toast(T('Added to your plan'));
        };
      });
    }
  }

  // One Documents screen: the Erasmus papers checklist, your own ID documents
  // (edited in place, with one "add" form) and what you scanned.
  async function viewDocs(root) {
    const staticDocs = [
      ['Learning Agreement - before mobility', 'signed'],
      ['Grant contract', 'signed'],
      ['EHIC card', 'active'],
      ['Certificate of arrival', 'pending'],
      ['Certificate of attendance', 'pending'],
      ['Transcript of Records (partner)', 'at the end'],
    ];
    const [scans, docs0] = await Promise.all([Store.getScans(), Store.safeUserDocs()]);
    let docs = docs0;
    const wrap = h('<div class="screen panel">' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Erasmus papers')) + '</p>' +
      '<p class="hint" style="margin-top:0">' + esc(T('What the Erasmus office expects from you, and where each paper stands.')) + '</p>' +
      staticDocs.map(d => {
        const color = d[1] === 'signed' || d[1] === 'active' ? 'good' : 'none';
        const ico = color === 'good' ? 'check' : 'clock';
        return '<div class="task-card"><span><span class="t-title">' + esc(T(d[0])) + '</span>' +
          '<span class="t-meta"><span class="pill ' + color + '">' + icon(ico, 'sm-ico') + ' ' + esc(T(d[1])) + '</span></span></span></div>';
      }).join('') +
      '</div>' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('ID and personal documents')) + '</p>' +
      '<p class="hint" style="margin-top:0">' + esc(T('ID, passport, student ID, EHIC: offices abroad ask for them constantly. Fill them in once, here. A photo, if you add one, stays on this device.')) + '</p>' +
      '<div id="doc-list"></div>' +
      '<details class="doc-add"' + (docs.length ? '' : ' open') + '><summary>' + icon('plus', 'sm-ico') + ' ' + esc(T('Add a document')) + '</summary>' +
      '<div class="form-field"><label>' + esc(T('Document type')) + '</label>' + typeSelect() + '</div>' +
      '<div class="form-field"><label>' + esc(T('Number')) + '</label><input id="man-number" placeholder="' + esc(T('e.g. RX123456')) + '" /></div>' +
      dmyField('Issued on', { id: 'man-issued', from: yearNow - 25, to: yearNow }) +
      dmyField('Expires on', { id: 'man-expires', from: yearNow - 1, to: yearNow + 20 }) +
      '<div class="form-field"><label>' + esc(T('Notes')) + '</label><input id="man-notes" placeholder="' + esc(T('Anything to remember')) + '" /></div>' +
      '<div class="form-field"><label>' + esc(T('Photo (optional)')) + '</label>' +
      '<button class="ghost" id="pick-doc" type="button">' + icon('upload', 'inline-ico') + ' <span id="pick-name">' + esc(T('Attach a photo')) + '</span></button>' +
      '<input id="doc-file" type="file" accept="image/*,application/pdf" hidden /></div>' +
      '<button class="primary" id="man-save">' + esc(T('Save document')) + '</button>' +
      '</details>' +
      '</div>' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Scanned documents')) + '</p>' +
      (scans.length
        ? scans.map(s => '<div class="task-card"><span><span class="t-title">' + esc(T(s.document_type)) + '</span><span class="t-meta">' + esc(T(s.summary || '')) + '</span></span></div>').join('')
        : '<p class="hint" style="margin-top:0">' + esc(T('Got a paper in another language? Scan it and get plain answers.')) + '</p>') +
      '<button class="ghost" id="go-scan">' + icon('scan-line', 'inline-ico') + ' ' + esc(T('Scan a document')) + '</button>' +
      '</div>' +
      '<button class="link" id="back-explore">' + esc(T('Back to explore (archives this journey)')) + '</button>' +
      '</div>');
    wireDmy(wrap);
    const sel = wrap.querySelector('#doc-type');
    const fileInput = wrap.querySelector('#doc-file');
    const listEl = wrap.querySelector('#doc-list');
    let pickedFile = null;

    function drawList() {
      listEl.innerHTML = '';
      if (!docs.length) {
        listEl.innerHTML = '<p class="hint" style="margin:0 0 4px">' + esc(T('Nothing added yet.')) + '</p>';
        return;
      }
      for (const d of docs) listEl.appendChild(docRow(d, reload));
    }

    async function reload() {
      docs = await Store.safeUserDocs();
      drawList();
    }

    wrap.querySelector('#pick-doc').onclick = () => fileInput.click();
    fileInput.onchange = () => {
      pickedFile = (fileInput.files && fileInput.files[0]) || null;
      wrap.querySelector('#pick-name').textContent = pickedFile ? pickedFile.name : T('Attach a photo');
    };

    wrap.querySelector('#man-save').onclick = async () => {
      const type = sel.value;
      try {
        if (pickedFile) await Store.saveDocBlob(type, pickedFile);
        const rec = await Store.addUserDoc({
          doc_type: type,
          file_name: pickedFile ? pickedFile.name : '',
          size: pickedFile ? pickedFile.size : 0,
          doc_number: wrap.querySelector('#man-number').value || null,
          issued_on: wrap.querySelector('#man-issued').value || null,
          expires_on: wrap.querySelector('#man-expires').value || null,
          notes: wrap.querySelector('#man-notes').value || null,
        });
        docs = docs.filter(d => d.doc_type !== rec.doc_type);
        docs.push(rec);
        drawList();
        wrap.querySelector('#man-number').value = '';
        wrap.querySelector('#man-issued').setIso('');
        wrap.querySelector('#man-expires').setIso('');
        wrap.querySelector('#man-notes').value = '';
        pickedFile = null;
        fileInput.value = '';
        wrap.querySelector('#pick-name').textContent = T('Attach a photo');
        wrap.querySelector('.doc-add').open = false;
        toast(T('{doc} saved', { doc: T(type) }));
      } catch (e) { toast(T('Could not save it. Is the server online?')); }
    };

    wrap.querySelector('#go-scan').onclick = () => go('scanJ');
    wrap.querySelector('#back-explore').onclick = async () => {
      await Store.saveProfile({}, 'explore');
      Store.state.mobility = null;
      Store.saveLocal();
      go('home', { replace: true, force: true });
    };
    drawList();
    root.appendChild(wrap);
  }

  /* ----------------------------------------------------- admin (staff tool, English) */

  function viewAdmin(root) {
    let token = Store.getAdminToken();
    let tab = 'approvals';
    let logLevel = '';
    let logLimit = '200';
    const wrap = h('<div class="screen panel">' +
      '<div class="card">' +
      '<p class="section-label">Admin</p>' +
      '<div class="form-field" id="ad-token-row"><label>Admin token</label>' +
      '<input id="ad-token" type="password" placeholder="content of data/admin_token.txt inside the container" /></div>' +
      '<div class="scan-cards">' +
      '<button class="ghost" data-tab="approvals">Approvals</button>' +
      '<button class="ghost" data-tab="summary">Summary</button>' +
      '<button class="ghost" data-tab="sources">Sources</button>' +
      '<button class="ghost" data-tab="logs">Logs</button>' +
      '<button class="ghost" data-tab="messages">Messages</button>' +
      '</div>' +
      '<div id="ad-body"></div>' +
      '<button class="link" id="ad-back">Back</button>' +
      '</div></div>');
    const body = wrap.querySelector('#ad-body');
    const tokenRow = wrap.querySelector('#ad-token-row');
    const tokenInput = wrap.querySelector('#ad-token');
    tokenInput.value = token;

    const getTok = () => tokenInput.value.replace(/[^\x20-\x7E]/g, '').trim();

    async function load() {
      const tok = getTok();
      if (!tok) { body.innerHTML = '<p class="hint">Enter the admin token - run: docker compose exec poligo cat /app/data/admin_token.txt</p>'; return; }
      Store.setAdminToken(tok);
      body.innerHTML = '<p class="hint">Loading...</p>';
      try {
        if (tab === 'approvals') {
          const out = await Store.adminApi('/api/admin/approvals', {}, tok);
          const list = out.pending || [];
          body.innerHTML = '<p class="section-label" style="margin-top:10px">Waiting for approval (' + list.length + ')</p>' +
            (list.map(m =>
              '<div class="doc-row" data-mid="' + esc(m.id) + '"><span style="flex:1;min-width:0">' +
              '<span class="doc-name">' + esc(m.email || String(m.user_id).slice(0, 8)) + '</span><br/>' +
              '<span class="doc-meta">' + esc(m.university_name || m.university_id) + (m.city ? ', ' + esc(m.city) : '') +
              ' - ' + esc(fmtDate(m.start_date)) + ' to ' + esc(fmtDate(m.end_date)) + ' - sent ' + esc(m.created_at) + '</span></span>' +
              '<button class="ghost" data-approve="1">Approve</button>' +
              '<button class="ghost" data-approve="0">Reject</button></div>'
            ).join('') || '<p class="meta">Nothing to approve.</p>');
          body.querySelectorAll('[data-approve]').forEach(b => {
            b.onclick = async () => {
              const mid = b.closest('[data-mid]').dataset.mid;
              const approve = b.dataset.approve === '1';
              try {
                await Store.adminApi('/api/admin/approvals/' + encodeURIComponent(mid), {
                  method: 'POST', body: JSON.stringify({ approve }),
                }, getTok());
                toast(approve ? 'Approved' : 'Rejected');
                load();
              } catch (e) { body.insertAdjacentHTML('afterbegin', '<p class="meta log-error">' + esc((e.code || 'ERR') + ': ' + e.message) + '</p>'); }
            };
          });
        } else if (tab === 'summary') {
          const out = await Store.adminApi('/api/admin/summary', {}, tok);
          const c = out.counts || {};
          body.innerHTML =
            '<p class="meta">Uptime: ' + esc(out.uptime) + '</p>' +
            '<p class="meta">Users: ' + c.users + ' / Sessions: ' + c.sessions + ' / Docs: ' + c.user_docs + ' / Mobilities: ' + c.mobilities + ' / Pending approval: ' + c.pending + '</p>' +
            '<p class="meta">Errors 24h: ' + c.errors_24h + ' / Warnings 24h: ' + c.warn_24h + '</p>' +
            '<p class="meta">Last Erasmus scan: ' + (out.last_scan ? esc(out.last_scan.run_at) + ' - ' + out.last_scan.count + ' opportunities' : 'none') + '</p>' +
            (out.last_scan && out.last_scan.opportunities ? out.last_scan.opportunities.slice(0, 8).map(o =>
              '<div class="doc-row"><span style="flex:1;min-width:0"><span class="doc-name">' + esc(o.title) +
              (o.is_new ? ' <span class="badge due">New</span>' : '') + '</span><br/>' +
              '<span class="doc-meta">ECTS match ' + Math.round(o.score * 100) + '% (' + o.ects_matched + '/' + o.courses + ' courses)</span></span></div>').join('') : '') +
            '<p class="section-label" style="margin-top:10px">Recent sign-ins</p>' +
            ((out.recent_signins || []).map(r => '<p class="meta">' + esc(r.ts) + ' - ' + esc(String(r.user_id).slice(0, 8)) + ' - ' + esc(r.event) + '</p>').join('') || '<p class="meta">none</p>') +
            '<p class="section-label" style="margin-top:10px">Maintenance</p>' +
            '<p class="hint" style="margin:0 0 8px">Deletes expired identity documents (ID/passport/EHIC past their expiry date) right now, instead of waiting for the scheduled run. Login codes are not affected.</p>' +
            '<button class="ghost" id="ad-cleanup">Delete expired documents now</button>';
          body.querySelector('#ad-cleanup').onclick = async () => {
            try {
              const res = await Store.adminApi('/api/admin/cleanup', { method: 'POST', body: 'null' }, getTok());
              toast(res.deleted ? 'Deleted ' + res.deleted + ' expired document(s)' : 'Nothing expired to delete');
              load();
            } catch (e) { body.insertAdjacentHTML('afterbegin', '<p class="meta log-error">' + esc((e.code || 'ERR') + ': ' + e.message) + '</p>'); }
          };
        } else if (tab === 'sources') {
          const out = await Store.adminApi('/api/admin/erasmus-sources', {}, tok);
          const list = out.sources || [];
          body.innerHTML =
            '<p class="hint" style="margin:0 0 10px">Checks each partner country\'s official Erasmus+ site for changes - it cannot reliably parse call/deadline details out of eight different languages and layouts, so "changed" just means the page text is different since the last check (sometimes a rotating banner, not real news). Follow the link to see for yourself.</p>' +
            '<button class="ghost" id="ad-rescan">Scan sites now</button>' +
            '<div id="src-list" style="margin-top:12px"></div>';
          const srcList = body.querySelector('#src-list');
          const drawSources = rows => {
            srcList.innerHTML = rows.length ? rows.map(s =>
              '<div class="doc-row"><span style="flex:1;min-width:0">' +
              '<span class="doc-name">' + esc(s.country) + (s.changed ? ' <span class="badge due">Changed</span>' : '') +
              (!s.ok ? ' <span class="badge due" style="background:var(--none-soft);color:var(--none)">Error</span>' : '') + '</span><br/>' +
              '<span class="doc-meta">' + esc(s.agency) + ' - ' + esc(s.ts) + '</span><br/>' +
              (s.ok
                ? '<span class="doc-meta">' + esc((s.snippet || '').slice(0, 160)) + '…</span>'
                : '<span class="doc-meta" style="color:var(--none)">' + esc(s.error || 'unreachable') + '</span>') +
              '</span>' +
              '<a class="icon-btn" href="' + esc(s.url) + '" target="_blank" rel="noopener" aria-label="Open the official site">' + icon('external-link') + '</a>' +
              '</div>'
            ).join('') : '<p class="meta">No checks yet - tap "Scan sites now".</p>';
          };
          drawSources(list);
          body.querySelector('#ad-rescan').onclick = async () => {
            body.querySelector('#ad-rescan').disabled = true;
            try {
              const res = await Store.adminApi('/api/admin/erasmus-sources/scan', { method: 'POST', body: 'null' }, getTok());
              drawSources(res.sources || []);
              toast('Sites checked');
            } catch (e) { body.insertAdjacentHTML('afterbegin', '<p class="meta log-error">' + esc((e.code || 'ERR') + ': ' + e.message) + '</p>'); }
            body.querySelector('#ad-rescan').disabled = false;
          };
        } else if (tab === 'logs') {
          const out = await Store.adminApi('/api/admin/logs?limit=' + encodeURIComponent(logLimit) + (logLevel ? '&level=' + encodeURIComponent(logLevel) : ''), {}, tok);
          const logs = out.logs || [];
          body.innerHTML =
            '<div class="log-toolbar">' +
            '<div class="select-wrap"><select id="log-level">' +
            ['', 'INFO', 'WARN', 'ERROR'].map(v => '<option value="' + v + '" ' + (v === logLevel ? 'selected' : '') + '>' + (v || 'All levels') + '</option>').join('') +
            '</select>' + icon('chevron-down', 'sel-ico') + '</div>' +
            '<div class="select-wrap"><select id="log-limit">' +
            ['50', '100', '200', '500'].map(v => '<option ' + (v === logLimit ? 'selected' : '') + '>' + v + '</option>').join('') +
            '</select>' + icon('chevron-down', 'sel-ico') + '</div>' +
            '<input id="log-q" placeholder="Search logs..." />' +
            '</div>' +
            '<p class="meta">' + logs.length + ' lines shown</p>' +
            '<div class="log-box">' +
            (logs.map(l =>
              '<p class="meta log-' + esc(l.level.toLowerCase()) + '" title="' + esc(l.ts) + '">' + esc(l.ts.slice(5, 16)) + ' [' + esc(l.level) + ' ' + esc(l.category) + '] ' +
              esc(l.event) + (l.detail ? ' - ' + esc(l.detail.slice(0, 200)) : '') + '</p>'
            ).join('') || '<p class="meta">No log lines</p>') +
            '</div>';
          body.querySelector('#log-level').onchange = e => { logLevel = e.target.value; load(); };
          body.querySelector('#log-limit').onchange = e => { logLimit = e.target.value; load(); };
          body.querySelector('#log-q').oninput = e => {
            const qq = e.target.value.toLowerCase();
            body.querySelectorAll('.log-box p').forEach(p => { p.hidden = !!qq && p.textContent.toLowerCase().indexOf(qq) === -1; });
          };
        } else {
          const out = await Store.adminApi('/api/admin/messages', {}, tok);
          body.innerHTML =
            '<div class="form-field"><textarea id="ad-msg" rows="2" placeholder="Message text..."></textarea></div>' +
            '<div class="form-field"><input id="ad-to" placeholder="To user id (empty = broadcast to all)" /></div>' +
            '<button class="ghost" id="ad-send">Send</button>' +
            '<p class="section-label" style="margin-top:10px">History</p>' +
            ((out.messages || []).map(m =>
              '<p class="meta">' + esc(m.ts) + (m.from_admin ? ' [Admin] to ' + esc(m.to_email || m.to_user || 'all') : ' [User ' + esc(String(m.from_user).slice(0, 8)) + ']') + ': ' + esc(m.text) + '</p>'
            ).join('') || '<p class="meta">No messages</p>');
          body.querySelector('#ad-send').onclick = async () => {
            try {
              await Store.adminApi('/api/admin/messages', {
                method: 'POST',
                body: JSON.stringify({ text: body.querySelector('#ad-msg').value, to_user: body.querySelector('#ad-to').value.trim() || null }),
              }, getTok());
              toast('Message sent');
              load();
            } catch (e) { body.insertAdjacentHTML('afterbegin', '<p class="meta log-error">' + esc((e.code || 'ERR') + ': ' + e.message) + '</p>'); }
          };
        }
      } catch (e) {
        body.innerHTML = '<p class="meta log-error">' + esc((e.code || 'ERR') + ': ' + e.message) + '</p>';
      }
    }

    tokenRow.addEventListener('change', load);
    wrap.querySelectorAll('[data-tab]').forEach(b => {
      b.onclick = () => { tab = b.dataset.tab; load(); };
    });
    wrap.querySelector('#ad-back').onclick = () => goBack();
    if (token) load();
    else body.innerHTML = '<p class="hint">Enter the admin token - run: docker compose exec poligo cat /app/data/admin_token.txt</p>';
    root.appendChild(wrap);
  }

  /* -------------------------------------------------------------------- start */

  async function start() {
    await Store.boot();
    Stage.init();
    const st = Store.state;
    const screen = (st.sessionEmail || st.seenLanding) ? afterAuth() : 'landing';
    go(screen, { replace: true, force: true });
    if (screen !== 'landing') maybeIntro();
  }

  return { start, go, goBack, goHome, render, toast, showFatal, showIntro };
})();

App.start();
