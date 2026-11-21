/* app.js — screen router and UI. Terminal aesthetic: square corners, 1px
 * borders, monospace, all-caps labels, blinking prompt. The globe is gone;
 * screens are plain text panels. Python-rendered MJPEG clips remain for the
 * journey transition and the destination pulse. */
const App = (() => {
  const NAVS = {
    explore: [
      ['map', 'Map'],
      ['universities', 'Universities'],
      ['shortlist', 'Shortlist'],
      ['profile', 'Profile'],
    ],
    journey: [
      ['today', 'Today'],
      ['calendar', 'Calendar'],
      ['timeline', 'Timeline'],
      ['docs', 'Documents'],
    ],
  };
  const NAV_ICONS = {
    map: 'map', universities: 'landmark', shortlist: 'bookmark', profile: 'user',
    today: 'sun', calendar: 'calendar-days', timeline: 'activity', docs: 'file-text',
  };
  const NAV_SCREENS = new Set([].concat(NAVS.explore, NAVS.journey).map(n => n[0]));
  const KNOWN = new Set([].concat(
    ['landing', 'auth', 'onboarding', 'docsSetup', 'uni', 'subjects', 'scanJ', 'admin'],
    [].concat(NAVS.explore, NAVS.journey).map(n => n[0])
  ));
  const STAGES = ['before', 'arrival', 'during', 'before-return', 'after-return'];
  const DOC_TYPES = ['ID card', 'Passport', 'Student ID', 'EHIC card', 'Grant contract', 'Learning Agreement', 'Other'];
  const DOC_ICONS = {
    'ID card': 'id-card', 'Passport': 'id-card', 'Student ID': 'id-card',
    'EHIC card': 'id-card', 'Other': 'file-text',
  };
  const PROJECT_TYPES = ['Semester exchange', 'Summer school', 'Research stay', 'Sports programme'];
  const DURATIONS = ['One semester (5-6 months)', 'Two semesters (10-12 months)', 'Summer (1-2 months)', 'Short stay (a few weeks)'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  const LANGS = [['en', 'English'], ['ro', 'Romana']];

  const history = [];
  let hashLock = false;

  const $app = document.getElementById('app');
  const $nav = document.getElementById('bottomNav');
  const $anim = document.getElementById('anim');
  const $top = document.getElementById('topBar');

  function h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function T(key) {
    return Store.t(key);
  }

  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = h('<div id="toast"></div>');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function setAccent() {
    const c = Store.state.mode === 'journey' ? 'var(--accent-j)' : 'var(--accent)';
    document.documentElement.style.setProperty('--accent-live', c);
  }

  function flagImg(code, cls) {
    if (!code) return '';
    return '<img class="flag ' + (cls || '') + '" src="/icons/flags/' + String(code).toLowerCase() + '.svg" alt="" loading="lazy"/>';
  }

  /* ---------- history / hash navigation ---------- */

  function syncHash(screen) {
    if (('#' + screen) === location.hash) return;
    hashLock = true;
    location.hash = screen;
    setTimeout(() => { hashLock = false; }, 0);
  }

  function go(screen, opts) {
    opts = opts || {};
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

  window.addEventListener('hashchange', () => {
    if (hashLock) return;
    const s = (location.hash || '').replace(/^#/, '') || 'landing';
    if (!KNOWN.has(s) || s === Store.state.screen) return;
    if (s === 'landing' && Store.state.seenLanding) return;
    Store.state.screen = s;
    Store.saveLocal();
    render();
  });

  /* ---------- chrome (top bar, nav) ---------- */

  function renderTopbar() {
    const show = history.length > 0 && Store.state.screen !== 'landing';
    if (!show) { $top.hidden = true; return; }
    $top.hidden = false;
    $top.innerHTML = '<button class="back-btn">' + icon('arrow-left', 'sm-ico') +
      '<span>' + esc(T('Back')) + '</span></button>' +
      '<span class="prompt">poligo<span class="cursor">_</span></span>';
    $top.querySelector('.back-btn').onclick = () => goBack();
  }

  function renderNav() {
    const { mode, screen } = Store.state;
    if (!NAV_SCREENS.has(screen)) { $nav.hidden = true; return; }
    $nav.hidden = false;
    $nav.innerHTML = '';
    for (const [id, label] of NAVS[mode]) {
      const b = h('<button class="' + (screen === id ? 'active' : '') + '"><span class="ico">' + icon(NAV_ICONS[id]) + '</span><span>' + esc(T(label)) + '</span></button>');
      b.onclick = () => go(id);
      $nav.appendChild(b);
    }
  }

  function render() {
    setAccent();
    renderTopbar();
    renderNav();
    try {
      const { screen } = Store.state;
      const views = {
        landing: viewLanding, auth: viewAuth, onboarding: viewOnboarding, docsSetup: viewDocsSetup,
        profile: viewProfile, subjects: viewSubjects,
        map: viewMap, universities: viewUniversities, uni: viewUniversity,
        shortlist: viewShortlist, today: viewToday,
        calendar: viewCalendar, timeline: viewTimeline,
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
    $nav.hidden = true;
    $top.hidden = true;
    $app.innerHTML = '';
    const wrap = h('<div class="screen panel" style="padding:60px 12px 0">' +
      '<div class="card fatal">' +
      '<p class="section-label">ERROR</p>' +
      '<h2>> screen failed to load</h2>' +
      '<pre>' + esc(err && err.stack ? err.stack : String(err || 'unknown error')) + '</pre>' +
      '<button class="ghost" id="fat-reload" style="width:100%">[ RELOAD ]</button>' +
      '<button class="link" id="fat-home">Back to the start</button>' +
      '</div></div>');
    wrap.querySelector('#fat-reload').onclick = () => window.location.reload();
    wrap.querySelector('#fat-home').onclick = () => go('landing', { replace: true });
    $app.appendChild(wrap);
  }

  window.addEventListener('error', e => showFatal(e.error || e.message));
  window.addEventListener('unhandledrejection', e => showFatal(e.reason));

  /* ---------- dates ---------- */

  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function parseYmd(s) {
    const p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  /* ---------- landing / auth ---------- */

  function viewLanding(root) {
    const wrap = h('<div class="landing">' +
      '<div class="brand">&gt; POLIGO<span class="cursor">_</span></div>' +
      '<div class="hero">' +
      '<h1>LEAVE ON ERASMUS.<br/>RETURN WITH EVERY CREDIT.</h1>' +
      '<p class="slogan">poligo plans the exchange from timisoara: match UPT subjects with partner universities, keep the paperwork on schedule, read any foreign document.</p>' +
      '</div>' +
      '<div class="features">' +
      '<div class="feat"><span class="feat-no">01</span><span><span class="f-title">FIND YOUR MATCHES</span><span class="f-sub">partner universities ranked by how much of your 30 ECTS they cover.</span></span></div>' +
      '<div class="feat"><span class="feat-no">02</span><span><span class="f-title">STAY ON SCHEDULE</span><span class="f-sub">a calendar and timeline built around your mobility dates and project deadlines.</span></span></div>' +
      '<div class="feat"><span class="feat-no">03</span><span><span class="f-title">READ ANY DOCUMENT</span><span class="f-sub">scan a rental contract or registration form and get plain answers.</span></span></div>' +
      '</div>' +
      '<button class="primary" id="signup-btn">[ ' + esc(T('Create account')) + ' ]</button>' +
      '<button class="ghost" id="login-btn" style="margin-top:10px">[ ' + esc(T('Log in')) + ' ]</button>' +
      '<button class="link" id="skip-btn">' + esc(T('Explore without an account')) + '</button>' +
      '<div class="updates">' +
      '<span class="f-title">' + esc(T('Get notified at launch')) + '</span>' +
      '<div class="updates-row">' +
      '<input id="u-email" type="email" placeholder="you@upt.ro" />' +
      '<button class="icon-btn" id="u-send" aria-label="Notify me">' + icon('arrow-right') + '</button>' +
      '</div></div>' +
      '</div>');
    wrap.querySelector('#signup-btn').onclick = () => go('auth');
    wrap.querySelector('#login-btn').onclick = () => go('auth');
    wrap.querySelector('#skip-btn').onclick = () => {
      Store.state.seenLanding = true;
      Store.saveLocal();
      go('profile', { replace: true });
    };
    wrap.querySelector('#u-send').onclick = async () => {
      const inp = wrap.querySelector('#u-email');
      if (!inp.value.trim()) { toast('Enter your email first'); return; }
      try { await Store.notify(inp.value.trim()); toast('You are on the list'); inp.value = ''; }
      catch (e) { toast('Could not save it - try again later'); }
    };
    root.appendChild(wrap);
  }

  function viewAuth(root) {
    let step = 1;
    let email = '';
    let devCode = '';
    const wrap = h('<div class="screen panel" style="padding:88px 12px 0">' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Sign in or create an account')) + '</p>' +
      '<div class="hint">UPT MAIL ONLY (upt.ro / e-upt.ro). no passwords - a 6-digit verification code is sent to the address.</div>' +
      '<div id="a-step1">' +
      '<div class="form-field"><label>' + esc(T('Email')) + '</label>' +
      '<input id="a-email" type="email" placeholder="you@upt.ro" autocomplete="email" /></div>' +
      '<button class="primary" id="a-go1">[ ' + esc(T('Send code')) + ' ]</button>' +
      '</div>' +
      '<div id="a-step2" hidden>' +
      '<div class="hint" id="a-sent"></div>' +
      '<div class="hint" id="a-devcode"></div>' +
      '<div class="form-field"><label>' + esc(T('Verification code')) + '</label>' +
      '<input id="a-code" class="num" inputmode="numeric" maxlength="6" placeholder="....../" /></div>' +
      '<button class="primary" id="a-go2">[ ' + esc(T('Verify')) + ' ]</button>' +
      '<button class="link" id="a-resend">' + esc(T('Send again')) + '</button>' +
      '</div>' +
      '<div id="auth-err"></div>' +
      '<button class="link" id="a-back">' + esc(T('Back')) + '</button>' +
      '</div></div>');
    const errEl = wrap.querySelector('#auth-err');
    const step1 = wrap.querySelector('#a-step1');
    const step2 = wrap.querySelector('#a-step2');
    const showErr = e => {
      errEl.textContent = (e && e.code ? String(e.code) + ': ' : '') + (e && e.message ? e.message : 'unknown failure - is the server online?');
      errEl.className = 'hint';
      errEl.style.color = 'var(--none)';
    };
    const showStep = s => { step = s; step1.hidden = s !== 1; step2.hidden = s !== 2; };
    wrap.querySelector('#a-back').onclick = () => goBack();
    wrap.querySelector('#a-resend').onclick = async () => {
      try {
        const out = (await Store.requestAuthCode(email));
        devCode = out.dev_code || '';
        wrap.querySelector('#a-devcode').textContent = devCode ? 'no MAIL SENDER CONFIGURED - DEV CODE: ' + devCode : ''; 
        errEl.textContent = '';
      } catch (e) { showErr(e); }
    };
    wrap.querySelector('#a-go1').onclick = async () => {
      email = wrap.querySelector('#a-email').value.trim().toLowerCase();
      if (!email || email.indexOf('@') < 1) { showErr({ code: 'ERR_INPUT', message: 'enter your email first' }); return; }
      errEl.textContent = '';
      try {
        const out = (await Store.requestAuthCode(email));
        devCode = out.dev_code || '';
        wrap.querySelector('#a-sent').textContent = out.code_sent ? 'CODE SENT TO ' + email.toUpperCase() : '';
        wrap.querySelector('#a-devcode').textContent = devCode ? 'no MAIL SENDER CONFIGURED - DEV CODE: ' + devCode : '';
        showStep(2);
        const codeInput = wrap.querySelector('#a-code');
        codeInput.focus();
      } catch (e) { showErr(e); }
    };
    wrap.querySelector('#a-go2').onclick = async () => {
      const code = wrap.querySelector('#a-code').value.trim();
      if (code.length < 4) { showErr({ code: 'ERR_INPUT', message: 'enter the 6-digit code' }); return; }
      try {
        await Store.verifyAuthCode(email, code);
        errEl.textContent = '';
        toast('Welcome back');
        go(afterAuth(), { replace: true });
      } catch (e) { showErr(e); }
    };
    wrap.querySelector('#a-code').onkeydown = ev => { if (ev.key === 'Enter') wrap.querySelector('#a-go2').click(); };
    wrap.querySelector('#a-email').onkeydown = ev => { if (ev.key === 'Enter') wrap.querySelector('#a-go1').click(); };
    root.appendChild(wrap);
  }

  /* ---------- onboarding questionnaire ---------- */

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
    const draft = Store.state.onbDraft || (Store.state.onbDraft = { theme: 'dark', projects: [], duration: DURATIONS[0], places: [] });
    let step = 0;
    const wrap = h('<div class="screen panel" style="padding:88px 12px 0">' +
      '<div class="card">' +
      '<p class="section-label" id="ob-step"></p>' +
      '<div id="ob-body"></div>' +
      '<button class="ghost" id="ob-back" style="width:100%;margin-top:4px">[ ' + esc(T('Back')) + ' ]</button>' +
      '<button class="primary" id="ob-next" style="width:100%;margin-top:10px">[ ' + esc(T('Continue')) + ' ]</button>' +
      '</div></div>');
    const stepEl = wrap.querySelector('#ob-step');
    const bodyEl = wrap.querySelector('#ob-body');
    const backBtn = wrap.querySelector('#ob-back');
    const nextBtn = wrap.querySelector('#ob-next');

    function optRow(value, label, iconName, multi, on) {
      return '<button class="opt ' + (on ? 'on' : '') + '" data-val="' + esc(value) + '" ' + (multi ? 'data-multi="1"' : '') + '>' +
        (iconName ? '<span class="opt-ico">' + icon(iconName) + '</span>' : '<span class="opt-ico opt-no"></span>') +
        '<span>' + esc(label) + '</span></button>';
    }

    const steps = [
      {
        label: 'SETUP 1/4 - LOOK',
        draw() {
          bodyEl.innerHTML = '<p class="hint">pick how the app should look. you can change it later in your profile.</p>' +
            '<div class="opt-list">' +
            optRow('dark', T('Dark'), 'moon', false, draft.theme === 'dark') +
            optRow('light', T('Light'), 'sun', false, draft.theme === 'light') +
            '</div>';
          wireOptions(bodyEl);
        },
        collect() {
          const on = bodyEl.querySelector('.opt.on');
          draft.theme = on ? on.dataset.val : 'dark';
        },
      },
      {
        label: 'SETUP 2/4 - PROJECTS',
        draw() {
          bodyEl.innerHTML = '<p class="hint">what kind of programme are you looking for? pick any.</p>' +
            '<div class="opt-list">' +
            PROJECT_TYPES.map(p => optRow(p, p, '', true, draft.projects.indexOf(p) !== -1)).join('') +
            '</div>';
          wireOptions(bodyEl);
        },
        collect() {
          draft.projects = [...bodyEl.querySelectorAll('.opt.on')].map(o => o.dataset.val);
        },
      },
      {
        label: 'SETUP 3/4 - LENGTH',
        draw() {
          bodyEl.innerHTML = '<p class="hint">how long do you want to go?</p>' +
            '<div class="opt-list">' +
            DURATIONS.map(d => optRow(d, d, '', false, draft.duration === d)).join('') +
            '</div>';
          wireOptions(bodyEl);
        },
        collect() {
          const on = bodyEl.querySelector('.opt.on');
          draft.duration = on ? on.dataset.val : DURATIONS[0];
        },
      },
      {
        label: 'SETUP 4/4 - PLACES',
        draw() {
          const countries = [...new Set(Store.state.universities.map(u => u.country))].sort();
          const list = countries.length ? countries : ['Portugal', 'Spain', 'Italy', 'Germany', 'France'];
          bodyEl.innerHTML = '<p class="hint">preferred destinations - used to rank deadlines and matches. leave empty for everything.</p>' +
            '<div class="opt-list">' +
            list.map(c => optRow(c, c, '', true, draft.places.indexOf(c) !== -1)).join('') +
            '</div>';
          wireOptions(bodyEl);
        },
        collect() {
          draft.places = [...bodyEl.querySelectorAll('.opt.on')].map(o => o.dataset.val);
        },
      },
    ];

    function drawStep() {
      stepEl.textContent = steps[step].label;
      backBtn.style.visibility = step === 0 ? 'hidden' : 'visible';
      nextBtn.textContent = step === steps.length - 1 ? '[ START ]' : '[ ' + esc(T('Continue')) + ' ]';
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
    Store.setTheme(draft.theme);
    await Store.saveProfile({ onboarding: JSON.stringify(draft) });
    Store.state.onbDraft = null;
    go('docsSetup', { replace: true });
  }

  function afterAuth() {
    const st = Store.state;
    if (st.mode === 'journey' && st.mobility) return 'today';
    if (st.sessionEmail && !(st.user && st.user.onboarding)) return 'onboarding';
    if (st.user && st.user.program) return 'map';
    return 'profile';
  }

  /* ---------- documents: shared row builder ---------- */

  function fmtSize(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function docMeta(d) {
    return [
      d.file_name || 'manual entry',
      d.size ? fmtSize(d.size) : '',
      d.doc_number ? 'no. ' + d.doc_number : '',
      d.expires_on ? 'exp ' + d.expires_on : '',
      d.issued_on ? 'issued ' + d.issued_on : '',
      d.notes,
    ].filter(Boolean).join(' - ');
  }

  function readDocFields(scope) {
    const out = {};
    scope.querySelectorAll('[data-f]').forEach(inp => { out[inp.dataset.f] = inp.value || null; });
    return out;
  }

  function docRow(d, onChange) {
    const row = h('<div class="doc-row" data-id="' + d.id + '">' +
      '<span class="doc-ico">' + icon(DOC_ICONS[d.doc_type] || 'file-text') + '</span>' +
      '<span style="flex:1;min-width:0"><span class="doc-name">' + esc(d.doc_type) + '</span><br/>' +
      '<span class="doc-meta">' + esc(docMeta(d)) + '</span></span>' +
      '<button class="icon-btn" data-view aria-label="Open the saved copy">' + icon('eye') + '</button>' +
      '<button class="icon-btn" data-del aria-label="' + esc(T('Remove document')) + '">' + icon('trash-2') + '</button>' +
      '</div>');
    const edit = h('<details class="doc-edit"><summary>Details / manual data</summary>' +
      '<div class="form-field"><label>Number</label><input data-f="doc_number" value="' + esc(d.doc_number || '') + '" placeholder="e.g. RX123456" /></div>' +
      '<div class="form-field"><label>Issued on</label><input data-f="issued_on" type="date" value="' + esc(d.issued_on || '') + '" /></div>' +
      '<div class="form-field"><label>Expires on</label><input data-f="expires_on" type="date" value="' + esc(d.expires_on || '') + '" /></div>' +
      '<div class="form-field"><label>Notes</label><input data-f="notes" value="' + esc(d.notes || '') + '" placeholder="Anything to remember" /></div>' +
      '<button class="ghost" data-save style="width:100%">[ SAVE DETAILS ]</button>' +
      '</details>');
    edit.querySelector('[data-save]').onclick = async ev => {
      ev.preventDefault();
      try {
        await Store.updateUserDoc(d.id, readDocFields(edit));
        toast('Details saved');
        if (onChange) onChange();
      } catch (e) { toast('Could not save details'); }
    };
    row.appendChild(edit);

    row.querySelector('[data-view]').onclick = async () => {
      const blob = await Store.getDocBlob(d.doc_type);
      if (!blob) { toast('No file on this device - keep the data as text in DETAILS'); return; }
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    };
    row.querySelector('[data-del]').onclick = async () => {
      await Store.deleteUserDoc(d.id);
      await Store.deleteDocBlob(d.doc_type);
      toast('Document removed');
      if (onChange) onChange();
    };
    return row;
  }

  /* ---------- document setup (account creation) ---------- */

  const TYPE_SELECT = '<div class="select-wrap"><select id="doc-type">' + DOC_TYPES.map(t => '<option>' + esc(t) + '</option>').join('') + '</select>' + icon('chevron-down', 'sel-ico') + '</div>';

  async function viewDocsSetup(root) {
    let docs = await Store.safeUserDocs();
    const wrap = h('<div class="screen panel" style="padding:88px 12px 0">' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Your documents')) + '</p>' +
      '<p class="hint">id, passport, student id, ehic... offices ask for them constantly. type the details here, or attach a photo - the file itself stays on this device either way.</p>' +
      '<div id="doc-list"></div>' +
      '</div>' +
      '<div class="card" style="margin-top:12px">' +
      '<p class="section-label">' + esc(T('Add manually')) + '</p>' +
      '<div class="form-field"><label>Document type</label>' + TYPE_SELECT + '</div>' +
      '<div class="form-field"><label>Number</label><input id="man-number" placeholder="e.g. RX123456" /></div>' +
      '<div class="form-field"><label>Issued on</label><input id="man-issued" type="date" /></div>' +
      '<div class="form-field"><label>Expires on</label><input id="man-expires" type="date" /></div>' +
      '<div class="form-field"><label>Notes</label><input id="man-notes" placeholder="Anything to remember" /></div>' +
      '<button class="ghost" id="man-save" style="width:100%">[ ' + esc(T('Add manually')) + ' ]</button>' +
      '</div>' +
      '<div class="card" style="margin-top:12px">' +
      '<p class="section-label">' + esc(T('Upload a copy')) + '</p>' +
      '<p class="hint">optional. the photo never leaves your device - it is parked in the browser cache.</p>' +
      '<button class="primary" id="pick-doc">' + icon('upload', 'inline-ico') + ' ' + esc(T('Upload a copy')) + '</button>' +
      '<input id="doc-file" type="file" hidden />' +
      '</div>' +
      '<button class="primary" id="docs-done" style="margin-top:12px">[ ' + esc(T('Continue')) + ' ]</button>' +
      '</div>');
    const sel = wrap.querySelector('#doc-type');
    const fileInput = wrap.querySelector('#doc-file');
    const listEl = wrap.querySelector('#doc-list');

    function drawList() {
      listEl.innerHTML = '';
      if (!docs.length) {
        listEl.innerHTML = '<p class="hint" style="margin:0 0 4px">nothing added yet.</p>';
        return;
      }
      for (const d of docs) listEl.appendChild(docRow(d, reload));
    }

    async function reload() {
      docs = await Store.safeUserDocs();
      drawList();
    }

    wrap.querySelector('#man-save').onclick = async () => {
      try {
        const rec = await Store.addUserDoc({
          doc_type: sel.value, file_name: '',
          doc_number: wrap.querySelector('#man-number').value || null,
          issued_on: wrap.querySelector('#man-issued').value || null,
          expires_on: wrap.querySelector('#man-expires').value || null,
          notes: wrap.querySelector('#man-notes').value || null,
        });
        docs = docs.filter(d => d.doc_type !== rec.doc_type);
        docs.push(rec);
        drawList();
        wrap.querySelector('#man-number').value = '';
        wrap.querySelector('#man-issued').value = '';
        wrap.querySelector('#man-expires').value = '';
        wrap.querySelector('#man-notes').value = '';
        toast(sel.value + ' saved');
      } catch (e) { toast('Could not save it - is the server online?'); }
    };

    wrap.querySelector('#pick-doc').onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      await Store.saveDocBlob(sel.value, f);
      try {
        const rec = await Store.addUserDoc({ doc_type: sel.value, file_name: f.name, size: f.size });
        docs = docs.filter(d => d.doc_type !== rec.doc_type);
        docs.push(rec);
      } catch (e) {
        docs.push({ id: -Date.now(), doc_type: sel.value, file_name: f.name, size: f.size });
      }
      drawList();
      toast(sel.value + ' saved on this device');
      fileInput.value = '';
    };

    wrap.querySelector('#docs-done').onclick = () => {
      const u = Store.state.user || {};
      go(u.program ? 'map' : 'profile', { replace: true });
    };

    drawList();
    root.appendChild(wrap);
  }

  /* ---------- deadlines + profile ---------- */

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
    if (onb.projects && onb.projects.length) bits.push(onb.projects.join(' / '));
    if (onb.duration) bits.push(onb.duration);
    if (onb.places && onb.places.length) bits.push(onb.places.join(', '));
    return bits.join(' - ');
  }

  function viewProfile(root) {
    const u = Store.state.user || {};
    const st = Store.state;
    const ob = onbLine(u);
    const wrap = h('<div class="screen panel" style="padding:88px 12px 0">' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Profile')).toUpperCase() + '</p>' +
      '<div class="form-field"><label>Faculty</label>' +
      '<div class="select-wrap"><select id="f-faculty">' +
      '<option ' + (u.faculty === 'AC' ? 'selected' : '') + '>AC - Computers and Information Technology</option>' +
      '<option ' + (u.faculty && u.faculty !== 'AC' ? 'selected' : '') + '>Other</option>' +
      '</select>' + icon('chevron-down', 'sel-ico') + '</div></div>' +
      '<div class="form-field"><label>Program</label>' +
      '<input id="f-program" list="programs" value="' + esc(u.program || 'Computer Science') + '" />' +
      '<datalist id="programs"><option>Computer Science</option><option>Information Technology</option><option>Automation</option></datalist></div>' +
      '<div class="form-field"><label>Year</label>' +
      '<div class="select-wrap"><select id="f-year">' + [1, 2, 3, 4].map(y => '<option ' + (u.year === y ? 'selected' : '') + '>' + y + '</option>').join('') + '</select>' + icon('chevron-down', 'sel-ico') + '</div></div>' +
      '<div class="form-field"><label>Semester abroad</label>' +
      '<div class="select-wrap"><select id="f-sem">' +
      '<option value="fall" ' + (u.semester_abroad === 'fall' ? 'selected' : '') + '>Fall</option>' +
      '<option value="spring" ' + (u.semester_abroad === 'spring' ? 'selected' : '') + '>Spring</option>' +
      '</select>' + icon('chevron-down', 'sel-ico') + '</div></div>' +
      '<button class="primary" id="save-profile">[ SAVE AND PICK SUBJECTS ]</button>' +
      '</div>' +
      '<div class="card" style="margin-top:12px">' +
      '<p class="section-label">' + esc(T('Documents')).toUpperCase() + '</p>' +
      '<div id="prof-docs"><p class="hint" style="margin:0 0 12px">add your id, passport, student id and ehic card once - they are asked for everywhere.</p></div>' +
      '<button class="ghost" id="manage-docs" style="width:100%">[ ' + esc(T('Your documents')).toUpperCase() + ' ]</button>' +
      '</div>' +
      '<div class="card" style="margin-top:12px">' +
      '<p class="section-label">SETTINGS</p>' +
      (ob ? '<p class="hint" style="margin-top:0">' + esc(ob) + '</p>' : '') +
      '<div class="form-field"><label>' + esc(T('Theme')) + '</label>' +
      '<div class="select-wrap"><select id="set-theme">' +
      '<option value="dark" ' + (st.theme !== 'light' ? 'selected' : '') + '>' + esc(T('Dark')) + '</option>' +
      '<option value="light" ' + (st.theme === 'light' ? 'selected' : '') + '>' + esc(T('Light')) + '</option>' +
      '</select>' + icon('chevron-down', 'sel-ico') + '</div></div>' +
      '<div class="form-field"><label>' + esc(T('Language')) + '</label>' +
      '<div class="select-wrap"><select id="set-lang">' +
      LANGS.map(l => '<option value="' + l[0] + '" ' + (st.language === l[0] ? 'selected' : '') + '>' + esc(l[1]) + '</option>').join('') +
      '</select>' + icon('chevron-down', 'sel-ico') + '</div></div>' +
      '<button class="ghost" id="redo-onb" style="width:100%">[ REDO SETUP ]</button>' +
      '</div>' +
      '<div class="card" style="margin-top:12px">' +
      '<p class="section-label">MESSAGES</p>' +
      '<div id="inbox-list"><p class="hint" style="margin:0 0 8px">loading messages...</p></div>' +
      '<div class="form-field"><textarea id="inbox-reply" rows="2" placeholder="reply to the admins..."></textarea></div>' +
      '<button class="ghost" id="inbox-send" style="width:100%">[ SEND ]</button>' +
      '</div>' +
      '<div class="card" style="margin-top:12px">' +
      '<p class="section-label">ACCOUNT</p>' +
      '<div class="doc-row">' +
      '<span class="doc-ico">' + icon('user') + '</span>' +
      '<span style="flex:1;min-width:0"><span class="doc-name">' + esc(Store.state.sessionEmail || 'Guest on this device') + '</span><br/>' +
      '<span class="doc-meta">' + (Store.state.sessionEmail ? 'Signed in' : 'Progress is stored only on this device') + '</span></span>' +
      '</div>' +
      (Store.state.sessionEmail ? '<button class="ghost" id="logout" style="width:100%;margin-top:4px">[ LOG OUT ]</button>' : '<button class="link" id="go-auth">Sign in to sync</button>') +
      '</div>' +
      '</div>');

    (async () => {
      const docs = await Store.safeUserDocs();
      const el = wrap.querySelector('#prof-docs');
      if (docs.length) {
        el.innerHTML = '';
        for (const d of docs) {
          el.appendChild(h('<div class="doc-row">' +
            '<span class="doc-ico">' + icon(DOC_ICONS[d.doc_type] || 'file-text') + '</span>' +
            '<span style="flex:1;min-width:0"><span class="doc-name">' + esc(d.doc_type) + '</span><br/>' +
            '<span class="doc-meta">' + esc(docMeta(d)) + '</span></span>' +
            '<span class="pill good">' + icon('check', 'sm-ico') + ' ON</span></div>'));
        }
      }
    })();

    (async () => {
      const box = wrap.querySelector('#inbox-list');
      const inbox = await Store.getInbox();
      if (!inbox.messages.length) {
        box.innerHTML = '<p class="hint" style="margin:0 0 8px">no messages yet. admin notices appear here.</p>';
        return;
      }
      box.innerHTML = inbox.messages.map(m =>
        '<div class="doc-row"><span class="doc-ico">' + icon('info') + '</span>' +
        '<span style="flex:1;min-width:0"><span class="doc-name">' + (m.from_admin ? 'ADMIN' : 'YOU') +
        (m.read || !m.from_admin ? '' : ' <span class="badge due">NEW</span>') + '</span>' +
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
    wrap.querySelector('#manage-docs').onclick = () => go('docsSetup');
    wrap.querySelector('#set-theme').onchange = e => { Store.setTheme(e.target.value); toast(T(e.target.value === 'light' ? 'Light' : 'Dark')); };
    wrap.querySelector('#set-lang').onchange = async e => {
      await Store.setLanguage(e.target.value);
      toast(e.target.value.toUpperCase());
      render();
    };
    wrap.querySelector('#redo-onb').onclick = () => go('onboarding');
    wrap.querySelector('#inbox-send').onclick = async () => {
      const ta = wrap.querySelector('#inbox-reply');
      const text = ta.value.trim();
      if (!text) { toast('nothing to send'); return; }
      try {
        await Store.replyInbox(text);
        ta.value = '';
        toast('sent to admins');
        render();
      } catch (e) { toast((e.code ? e.code + ': ' : '') + e.message); }
    };
    const logoutBtn = wrap.querySelector('#logout');
    if (logoutBtn) logoutBtn.onclick = async () => { await Store.logout(); history.length = 0; go('landing', { replace: true }); };
    const authBtn = wrap.querySelector('#go-auth');
    if (authBtn) authBtn.onclick = () => go('auth');
    root.appendChild(wrap);
  }

  /* ---------- subjects / explore ---------- */

  function viewSubjects(root) {
    const courses = Store.state.homeCourses;
    const selected = new Set(courses.map(c => c.id));
    const list = h('<div class="screen panel" style="padding:88px 12px 0">' +
      '<div class="card">' +
      '<p class="section-label">MY SUBJECTS - ' + esc((Store.state.user && Store.state.user.program) || 'Computer Science') + '</p>' +
      '<div id="course-list"></div>' +
      '<p class="hint" id="ects-line"></p>' +
      '<button class="primary" id="find-matches">[ FIND MY MATCHES ]</button>' +
      '</div></div>');
    const listEl = list.querySelector('#course-list');
    const ects = () => {
      const sum = courses.filter(c => selected.has(c.id)).reduce((s, c) => s + c.ects, 0);
      list.querySelector('#ects-line').textContent = sum + ' ECTS selected';
    };
    for (const c of courses) {
      const row = h('<label class="task-card">' +
        '<input type="checkbox" checked data-id="' + c.id + '" />' +
        '<span><span class="t-title">' + esc(c.name) + '</span>' +
        '<span class="t-meta">' + c.ects + ' ECTS - ' + esc((c.topics || []).slice(0, 3).join(', ')) + '</span></span>' +
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

  function uniCard(u) {
    const card = h('<div class="card uni-card" style="cursor:pointer">' +
      flagImg(u.country_code) +
      '<span><span class="name">' + esc(u.name) + '</span><br/>' +
      '<span class="meta">' + esc(u.city) + ', ' + esc(u.country) + ' - ' + esc((u.languages || []).join(', ')) + '</span></span>' +
      '<span class="badge"><span class="num">' + u.summary.matched + '/' + u.summary.total + '</span><br/><span class="lbl">match</span></span>' +
      '</div>');
    card.onclick = () => { Store.state.activeUniId = u.id; go('uni'); };
    return card;
  }

  function buildFilters(el, onChange) {
    const langs = [...new Set(Store.state.universities.flatMap(u => u.languages || []))];
    const countries = [...new Set(Store.state.universities.map(u => u.country))];
    el.innerHTML = '';
    const make = (label, kind, value) => {
      const { lang, country } = Store.state.filters;
      const on = kind === 'lang' ? lang === value : country === value;
      const chip = h('<button class="chip ' + (on ? 'on' : '') + '">' + esc(label) + '</button>');
      chip.onclick = () => {
        const f = Store.state.filters;
        if (kind === 'lang') f.lang = f.lang === value ? null : value;
        else f.country = f.country === value ? null : value;
        buildFilters(el, onChange);
        onChange();
      };
      el.appendChild(chip);
    };
    make('All languages', 'lang', null);
    for (const l of langs) make(l, 'lang', l);
    for (const c of countries) make(c, 'country', c);
  }

  function viewMap(root) {
    const wrap = h('<div class="screen panel" style="padding:88px 12px 0">' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Map')) + '</p>' +
      '<div class="chips" id="filters"></div>' +
      '<div id="uni-list"></div>' +
      '</div></div>');
    buildFilters(wrap.querySelector('#filters'), () => fillList(wrap));
    fillList(wrap);

    function fillList() {
      const el = wrap.querySelector('#uni-list');
      const { lang, country } = Store.state.filters;
      let unis = Store.sortedUnis();
      if (lang) unis = unis.filter(u => (u.languages || []).includes(lang));
      if (country) unis = unis.filter(u => u.country === country);
      el.innerHTML = '';
      if (!unis.length) { el.innerHTML = '<p class="hint">no universities match the filters.</p>'; return; }
      for (const u of unis) el.appendChild(uniCard(u));
    }
    root.appendChild(wrap);
  }

  function viewUniversities(root) {
    const wrap = h('<div class="screen panel" style="padding:88px 12px 0">' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Universities')) + '</p>' +
      '<div id="uni-list"></div>' +
      '</div></div>');
    const list = wrap.querySelector('#uni-list');
    for (const u of Store.sortedUnis()) list.appendChild(uniCard(u));
    root.appendChild(wrap);
  }

  async function viewUniversity(root) {
    const u = await Store.getUniversityDetail(Store.state.activeUniId);
    if (!u || !u.summary) { go('map', { replace: true }); return; }
    const s = u.summary;
    const pct = s.total ? s.matched / s.total : 0;
    const circ = 2 * Math.PI * 42;
    const wrap = h('<div class="screen panel" style="padding:88px 12px 0">' +
      '<div class="card">' +
      '<div style="display:flex;align-items:center;gap:16px">' +
      '<div class="match-ring">' +
      '<svg width="96" height="96">' +
      '<circle cx="48" cy="48" r="42" fill="none" stroke="var(--surface-2)" stroke-width="6"/>' +
      '<circle cx="48" cy="48" r="42" fill="none" stroke="var(--good)" stroke-width="6" stroke-dasharray="' + circ + '" stroke-dashoffset="' + circ * (1 - pct) + '"/>' +
      '</svg>' +
      '<div class="inside"><span class="num">' + s.matched + '/' + s.total + '</span><span class="lbl">subjects match</span></div>' +
      '</div>' +
      '<div>' +
      '<h2 style="font-size:18px">' + flagImg(u.country_code, 'inline-ico') + ' ' + esc(u.name) + '</h2>' +
      '<p class="hint" style="margin:4px 0 0">' + esc(u.city) + ', ' + esc(u.country) + '<br/>' + esc((u.languages || []).join(', ')) + '</p>' +
      '</div></div>' +
      '<p class="section-label" style="margin-top:16px">ECTS COVERED - ' + s.ects_covered + ' OF 30</p>' +
      '<div class="ects-bar"><div style="width:' + Math.min(100, s.ects_covered / 30 * 100) + '%"></div></div>' +
      '<div id="rows" style="margin-top:12px"></div>' +
      '<div style="display:flex;gap:12px;margin-top:16px">' +
      '<button class="ghost" style="flex:1" id="add-sl">[ ' + esc(T('Shortlist')) + ' + ]</button>' +
      '<button class="primary" style="flex:1" id="accepted">[ ALREADY ACCEPTED ]</button>' +
      '</div>' +
      '</div></div>');
    const rows = wrap.querySelector('#rows');
    const icons = { good: 'check', partial: 'arrow-right', none: 'x' };
    for (const m of u.matches) {
      const label = m.label[0].toUpperCase() + m.label.slice(1);
      const row = h('<div class="match-row">' +
        '<div class="line1"><span>' + esc(m.home_name) + '</span><span class="arrow">' + icon('arrow-right', 'sm-ico') + '</span>' +
        '<span>' + esc(m.partner_name || 'No partner course') + '</span></div>' +
        '<div class="line2"><span class="pill ' + m.label + '">' + icon(icons[m.label], 'sm-ico') + ' ' + label + '</span>' +
        '<span>' + (m.partner_ects ? m.partner_ects + ' ECTS' : '') + '</span></div>' +
        '<div class="explain" style="display:none">' + esc(m.explanation || '') + (m.missing_topics && m.missing_topics.length ? '<br/>Missing: ' + esc(m.missing_topics.join(', ')) : '') + '</div>' +
        '</div>');
      row.onclick = () => {
        const ex = row.querySelector('.explain');
        ex.style.display = ex.style.display === 'none' ? 'block' : 'none';
      };
      rows.appendChild(row);
    }
    wrap.querySelector('#add-sl').onclick = async () => {
      await Store.addToShortlist(u.id);
      toast('Added to shortlist');
    };
    wrap.querySelector('#accepted').onclick = () => openAcceptedSheet(u.id);
    root.appendChild(wrap);
  }

  function viewShortlist(root) {
    const sl = (Store.state.user && Store.state.user.shortlist) || [];
    const wrap = h('<div class="screen panel" style="padding:88px 12px 0">' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Shortlist')) + ' - MAX 3, IN PREFERENCE ORDER</p>' +
      '<div id="sl-list"></div>' +
      (sl.length === 0 ? '<p class="hint">nothing here yet. open a university and tap "SHORTLIST +".</p>' : '') +
      '</div></div>');
    const list = wrap.querySelector('#sl-list');
    sl.forEach((s, idx) => {
      const u = Store.uniById(s.id) || s;
      const card = h('<div class="card uni-card">' +
        '<span class="badge"><span class="num">' + (idx + 1) + '</span></span>' +
        '<span><span class="name">' + esc(u.name) + '</span><br/>' +
        '<span class="meta">' + esc(u.city || '') + (u.summary ? ' - ' + u.summary.matched + '/' + u.summary.total + ' match' : '') + '</span></span>' +
        '<span style="margin-left:auto;display:flex;gap:8px">' +
        '<button class="ghost accepted-btn">[ ACCEPTED ]</button>' +
        '<button class="icon-btn" data-remove aria-label="Remove">' + icon('trash-2') + '</button>' +
        '</span></div>');
      card.querySelector('[data-remove]').onclick = async () => { await Store.removeFromShortlist(s.id); render(); };
      card.querySelector('.accepted-btn').onclick = () => openAcceptedSheet(s.id);
      list.appendChild(card);
    });
    root.appendChild(wrap);
  }

  /* ---------- the transition ---------- */

  function openAcceptedSheet(preId) {
    const sl = (Store.state.user && Store.state.user.shortlist) || [];
    const u0 = preId || (sl[0] && sl[0].id) || ((Store.sortedUnis()[0] || {}).id);
    const sheet = h('<div class="sheet">' +
      '<div class="sheet-grab"></div>' +
      '<h2>> I GOT ACCEPTED</h2>' +
      '<div class="form-field"><label>' + esc(T('Universities')) + '</label>' +
      '<div class="select-wrap"><select id="a-uni">' + Store.state.universities.map(u => '<option value="' + u.id + '" ' + (u.id === u0 ? 'selected' : '') + '>' + esc(u.name) + '</option>').join('') + '</select>' + icon('chevron-down', 'sel-ico') + '</div></div>' +
      '<div class="form-field"><label>Start date</label><input id="a-start" type="date" /></div>' +
      '<div class="form-field"><label>Arrival date (optional)</label><input id="a-arrival" type="date" /></div>' +
      '<div class="form-field"><label>End date</label><input id="a-end" type="date" /></div>' +
      '<button class="primary" id="acc-go">[ START MY JOURNEY ]</button>' +
      '<button class="link" id="acc-cancel">Not now</button>' +
      '</div>');
    const startInp = sheet.querySelector('#a-start');
    const arrivalInp = sheet.querySelector('#a-arrival');
    const endInp = sheet.querySelector('#a-end');
    const defaultStart = new Date(Date.now() + 47 * 86400000).toISOString().slice(0, 10);
    const defaultEnd = new Date(Date.now() + 197 * 86400000).toISOString().slice(0, 10);
    startInp.value = defaultStart;
    endInp.value = defaultEnd;
    arrivalInp.value = new Date(new Date(defaultStart) - 3 * 86400000).toISOString().slice(0, 10);
    startInp.onchange = () => {
      arrivalInp.value = new Date(new Date(startInp.value) - 3 * 86400000).toISOString().slice(0, 10);
    };
    sheet.querySelector('#acc-go').onclick = async () => {
      const out = await Store.accept({ university_id: sheet.querySelector('#a-uni').value, start_date: startInp.value, arrival_date: arrivalInp.value, end_date: endInp.value });
      sheet.remove();
      await playTransition(out.mobility.university_id);
    };
    sheet.querySelector('#acc-cancel').onclick = () => sheet.remove();
    document.body.appendChild(sheet);
  }

  async function playTransition(universityId) {
    const uni = Store.uniById(universityId);
    $anim.hidden = false;
    try {
      const clip = await Anim.playOnce('/anim/transition/' + universityId + '.mjpg?loop=0', $anim, {
        loops: 1,
        onDone: () => setTimeout(() => {
          $anim.hidden = true;
          setAccent();
          go('today', { replace: true });
          toast((uni ? uni.greeting + ' ' : '') + 'Your journey starts now');
        }, 150),
      });
      if (!clip.bitmaps.length) { $anim.hidden = true; go('today', { replace: true }); }
    } catch (e) {
      $anim.hidden = true;
      go('today', { replace: true });
      toast((uni ? uni.greeting + ' ' : '') + 'Your journey starts now');
    }
  }

  /* ---------- journey screens ---------- */

  function dueChip(due) {
    if (!due) return '<span class="due soon">no date</span>';
    const days = Math.round((parseYmd(due) - new Date()) / 86400000);
    if (days < 0) return '<span class="due overdue">overdue ' + (-days) + 'd</span>';
    if (days === 0) return '<span class="due today">today</span>';
    return '<span class="due soon">in ' + days + ' days</span>';
  }

  function stageLabel(st) {
    return { before: 'Before departure', arrival: 'Arrival (first 2 weeks)', during: 'During', 'before-return': 'Before return', 'after-return': 'After return' }[st] || st;
  }

  function viewToday(root) {
    const mob = Store.state.mobility;
    if (!mob) { openAcceptedSheet(); return; }
    const uni = Store.uniById(mob.university_id);
    const now = new Date();
    const start = parseYmd(mob.start_date), end = parseYmd(mob.end_date), arrival = parseYmd(mob.arrival_date || mob.start_date);
    const totalDays = Math.max(1, Math.round((end - start) / 86400000));
    let countNum, countText;
    if (now < arrival) {
      countNum = Math.ceil((arrival - now) / 86400000);
      countText = T('days to departure');
    } else if (now <= end) {
      countNum = Math.max(1, Math.ceil((now - arrival) / 86400000));
      countText = T('day of') + ' ' + totalDays;
    } else {
      countNum = '\u221E';
      countText = 'Welcome back';
    }
    const next = Store.state.tasks.filter(t => !t.done).slice(0, 3);
    const pct = stage => {
      const ts = Store.state.tasks.filter(t => t.stage === stage);
      return ts.length ? Math.round(100 * ts.filter(t => t.done).length / ts.length) : 0;
    };
    const wrap = h('<div class="screen panel" style="padding:88px 12px 0">' +
      '<div class="card" style="display:flex;gap:16px;align-items:center;position:relative">' +
      '<div class="ring">' +
      '<svg width="120" height="120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-2)" stroke-width="6"/>' +
      '<circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent-live)" stroke-width="6" stroke-dasharray="' + 2 * Math.PI * 52 + '" stroke-dashoffset="' + 2 * Math.PI * 52 * (1 - Math.min(1, Math.max(0, (now - arrival) / ((end - arrival) || 1)))) + '"/></svg>' +
      '<div class="inside"><span class="big-num">' + esc(countNum) + '</span><span class="unit">' + esc(countText) + '</span></div>' +
      '</div>' +
      '<div>' +
      '<p class="section-label">' + esc(uni ? uni.name : 'Your mobility') + '</p>' +
      '<p class="hint" style="margin:4px 0 0">' + esc(mob.start_date) + ' \u2192 ' + esc(mob.end_date) + '<br/>' + esc(uni ? uni.city + ', ' + uni.country : '') + '</p>' +
      '</div>' +
      '<div id="pulse-slot" style="position:absolute;right:-4px;top:-4px;width:96px;height:96px"></div>' +
      '</div>' +
      '<div class="card" style="margin-top:12px">' +
      '<p class="section-label">NEXT UP</p>' +
      (next.map(t => '<div class="task-card"><span><span class="t-title">' + esc(t.title) + '</span><span class="t-meta">' + dueChip(t.due_date) + '</span></span></div>').join('') || '<p class="hint" style="margin:0">all clear.</p>') +
      '</div>' +
      '<div class="card" style="margin-top:12px">' +
      '<p class="section-label">STAGE PROGRESS</p>' +
      STAGES.map(stg => '<p class="hint" style="margin:8px 0 4px">' + esc(stageLabel(stg)) + '</p><div class="stage-progress"><div style="width:' + pct(stg) + '%"></div></div>').join('') +
      '</div>' +
      '<button class="primary" style="margin-top:12px" id="scan-btn">' + icon('scan-line', 'inline-ico') + ' SCAN A DOCUMENT</button>' +
      '</div>');
    wrap.querySelector('#scan-btn').onclick = () => go('scanJ');
    root.appendChild(wrap);
    if (uni) {
      const c = h('<canvas id="pulse" hidden></canvas>');
      wrap.querySelector('#pulse-slot').appendChild(c);
      Anim.loop('/anim/pulse.mjpg?loop=1', c).then(() => { c.hidden = false; }).catch(() => { c.remove(); });
    }
  }

  /* ---------- calendar: away days + availability + deadlines ---------- */

  function viewCalendar(root) {
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
        const ds = ymd(new Date(a.getFullYear(), a.getMonth(), a.getDate() + i));
        if (ds > mob.end_date) break;
        awaySet.add(ds);
      }
    }
    const dlSet = new Set();
    for (const d of projectDeadlines()) if (d.date) dlSet.add(ymd(d.date));
    const taskSet = new Set(st.tasks.filter(t => t.due_date).map(t => t.due_date));
    const today = ymd(new Date());

    const wrap = h('<div class="screen panel" style="padding:88px 12px 0">' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Calendar')).toUpperCase() + '</p>' +
      '<div class="cal-head">' +
      '<button class="ghost cal-nav" data-m="-1">[ &lt; ]</button>' +
      '<span class="cal-title" id="cal-title"></span>' +
      '<button class="ghost cal-nav" data-m="1">[ &gt; ]</button>' +
      '</div>' +
      '<div class="cal-grid" id="cal-grid"></div>' +
      '<p class="hint cal-legend">* = deadline&nbsp; + = task&nbsp; box = ' + esc(T('Available')) + '&nbsp; shade = ' + esc(T('Away')) + '</p>' +
      '<p class="hint">tap a day to mark when you are free. the away block follows your accepted mobility.</p>' +
      '</div>' +
      '<div class="card" style="margin-top:12px">' +
      '<p class="section-label">' + esc(T('Deadlines')).toUpperCase() + '</p>' +
      '<div id="dl-list"></div>' +
      '</div></div>');

    const titleEl = wrap.querySelector('#cal-title');
    const gridEl = wrap.querySelector('#cal-grid');
    const monthPrefix = () => st.calView.y + '-' + String(st.calView.m + 1).padStart(2, '0');

    function draw() {
      const { y, m } = st.calView;
      const freeCount = st.availability.filter(a => String(a).indexOf(monthPrefix()) === 0).length;
      titleEl.textContent = MONTHS[m].toUpperCase() + ' ' + y + ' - ' + freeCount + ' FREE';
      gridEl.innerHTML = '';
      for (const w of WDAYS) gridEl.appendChild(h('<span class="cal-wd">' + w + '</span>'));
      const lead = (new Date(y, m, 1).getDay() + 6) % 7;
      for (let i = 0; i < lead; i++) gridEl.appendChild(h('<span class="cal-cell empty"></span>'));
      const days = new Date(y, m + 1, 0).getDate();
      for (let dnum = 1; dnum <= days; dnum++) {
        const ds = ymd(new Date(y, m, dnum));
        const cls = ['cal-cell'];
        if (ds === today) cls.push('today');
        if (awaySet.has(ds)) cls.push('away');
        if (Store.isAvailable(ds)) cls.push('avail');
        if (dlSet.has(ds)) cls.push('has-dl');
        if (taskSet.has(ds)) cls.push('has-task');
        const mark = dlSet.has(ds) ? '*' : (taskSet.has(ds) ? '+' : '');
        const cell = h('<button class="' + cls.join(' ') + '"><span class="cal-date">' + dnum + '</span><span class="cal-mark">' + mark + '</span></button>');
        cell.onclick = () => {
          const on = Store.toggleAvailability(ds);
          cell.classList.toggle('avail', on);
          toast(ds + ' ' + (on ? '[ available ]' : '[ cleared ]'));
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
      dlList.innerHTML = '<p class="hint" style="margin:0">no deadlines for the selected project types.</p>';
    } else {
      for (const d of dls) {
        dlList.appendChild(h('<div class="task-card">' +
          '<span style="flex:1;min-width:0"><span class="t-title">' + esc(d.title) + '</span>' +
          '<span class="t-meta">' + esc(d.type) + (d.note ? ' - ' + esc(d.note) : '') + '</span></span>' +
          '<span class="cal-date dl-when">' + (d.date ? esc(ymd(d.date)) : d.months_before + ' MO') + '</span>' +
          '</div>'));
      }
    }

    draw();
    root.appendChild(wrap);
  }

  /* ---------- timeline / scan / docs ---------- */

  function viewTimeline(root) {
    const tasks = Store.state.tasks.slice().sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
    const taskCard = t => {
      const src = { template: 'Template', scan: 'From scan', user: 'Added by you' }[t.source] || t.source;
      return '<label class="task-card ' + (t.done ? 'done' : '') + '">' +
        '<input type="checkbox" data-id="' + t.id + '" ' + (t.done ? 'checked' : '') + ' />' +
        '<span><span class="t-title">' + esc(t.title) + '</span>' +
        '<span class="t-meta">' + dueChip(t.due_date) + ' <span>' + esc(src) + '</span></span></span>' +
        '</label>';
    };
    const wrap = h('<div class="screen panel" style="padding:88px 12px 0">' +
      '<div class="card">' +
      '<p class="section-label">' + esc(T('Timeline')).toUpperCase() + '</p>' +
      STAGES.map(st => {
        const list = tasks.filter(t => t.stage === st);
        if (!list.length) return '';
        return '<p class="section-label" style="margin-top:16px">' + esc(stageLabel(st)).toUpperCase() + '</p>' + list.map(taskCard).join('');
      }).join('') +
      '<div class="form-field" style="margin-top:16px"><label>Add your own task</label>' +
      '<input id="new-task" placeholder="e.g. Pick up keys from landlord" /></div>' +
      '<button class="ghost" id="add-task" style="width:100%">[ ADD TASK ]</button>' +
      '</div></div>');
    wrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.onchange = () => Store.toggleTask(parseInt(cb.dataset.id, 10), cb.checked);
    });
    wrap.querySelector('#add-task').onclick = async () => {
      const inp = wrap.querySelector('#new-task');
      if (!inp.value.trim()) return;
      await Store.addTask(Store.state.mobility ? Store.state.mobility.id : null, inp.value.trim(), 'during', null);
      render();
    };
    root.appendChild(wrap);
  }

  async function viewScan(root) {
    const wrap = h('<div class="screen panel" style="padding:88px 12px 0">' +
      '<div class="card">' +
      '<p class="section-label">SCAN A DOCUMENT</p>' +
      '<p class="hint">photograph or upload a document you received in your destination city - a rental contract, a registration form, a bill.</p>' +
      '<div class="form-field"><input id="scan-file" type="file" accept="image/*" capture="environment" /></div>' +
      '<button class="primary" id="do-scan">[ SCAN DOCUMENT ]</button>' +
      '<p class="disclaimer">AI explanation, not legal advice. Confirm with the office.</p>' +
      '</div>' +
      '<div class="scan-cards" id="scan-result" style="margin-top:12px"></div>' +
      '</div>');
    wrap.querySelector('#do-scan').onclick = async () => {
      const res = wrap.querySelector('#scan-result');
      res.innerHTML = '<div class="card"><p class="hint" style="margin:0">reading your document...</p></div>';
      await new Promise(r => setTimeout(r, 1800));
      const doc = await Store.scan();
      if (!doc) { res.innerHTML = '<div class="card"><p class="hint" style="margin:0">scanner unavailable. try again later.</p></div>'; return; }
      const r = typeof doc.result_json === 'string' ? JSON.parse(doc.result_json) : doc.result_json;
      res.innerHTML = scanResultHtml(r);
      wireDeadlines(res, r);
    };
    root.appendChild(wrap);

    function scanResultHtml(r) {
      const dl = r.deadlines[0];
      return '<div class="card"><p class="section-label">WHAT THIS IS</p><p style="margin:4px 0 0">' + esc(r.what) + '</p></div>' +
        '<div class="card"><p class="section-label">WHAT YOU NEED TO DO</p><ol>' + r.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol></div>' +
        '<div class="card"><p class="section-label">DEADLINES</p><div class="task-card"><span class="t-title">' + esc(dl.text) + '</span>' +
        '<button class="ghost" data-dl="' + esc(dl.title) + '" style="height:32px;padding:0 10px;font-size:12px;flex-shrink:0">[ ADD ]</button></div></div>' +
        '<div class="card"><p class="section-label">BRING WITH YOU</p><ul>' + r.bring.map(b => '<li>' + esc(b) + '</li>').join('') + '</ul></div>' +
        '<div class="card"><p class="section-label">WATCH OUT</p><p style="margin:4px 0 0;display:flex;gap:6px;align-items:flex-start">' + icon('triangle-alert', 'sm-ico warn') + '<span>' + esc(r.watch_out) + '</span></p></div>' +
        '<div class="card"><p class="section-label">KEY WORDS</p><p style="margin:4px 0 0">' + r.keywords.map(k => '<span class="pill" style="color:var(--accent-live);margin:2px">' + esc(k[0]) + ' \u2192 ' + esc(k[1]) + '</span>').join(' ') + '</p></div>';
    }

    function wireDeadlines(res, r) {
      res.querySelectorAll('[data-dl]').forEach(b => {
        b.onclick = async () => {
          const due = new Date(Date.now() + ((r.deadlines[0].offset_days || 7) * 86400000)).toISOString().slice(0, 10);
          await Store.addTask(Store.state.mobility ? Store.state.mobility.id : null, b.dataset.dl, 'during', due);
          b.textContent = '[ ADDED ]';
          b.disabled = true;
          toast('Added to timeline');
        };
      });
    }
  }

  async function viewDocs(root) {
    const staticDocs = [
      ['Learning Agreement - before mobility', 'signed'],
      ['Grant contract', 'signed'],
      ['EHIC card', 'active'],
      ['Certificate of arrival', 'pending'],
      ['Certificate of attendance', 'pending'],
      ['Transcript of Records (partner)', 'at the end'],
    ];
    const scans = await Store.getScans();
    const wrap = h('<div class="screen panel" style="padding:88px 12px 0">' +
      '<div class="card">' +
      '<p class="section-label">ERASMUS DOCUMENTS</p>' +
      staticDocs.map(d => {
        const color = d[1] === 'signed' || d[1] === 'active' ? 'good' : 'none';
        const ico = color === 'good' ? 'check' : 'x';
        return '<div class="task-card"><span><span class="t-title">' + esc(d[0]) + '</span>' +
          '<span class="t-meta"><span class="pill ' + color + '">' + icon(ico, 'sm-ico') + ' ' + esc(d[1]) + '</span></span></span></div>';
      }).join('') +
      '</div>' +
      '<div class="card" style="margin-top:12px">' +
      '<p class="section-label">' + esc(T('Your documents')).toUpperCase() + '</p>' +
      '<div id="my-docs"></div>' +
      '<button class="ghost" id="manage-docs" style="width:100%;margin-top:4px">[ ' + esc(T('Documents')).toUpperCase() + ' ]</button>' +
      '</div>' +
      (scans.length ? '<div class="card" style="margin-top:12px"><p class="section-label">SCANNED DOCUMENTS</p>' +
        scans.map(s => '<div class="task-card"><span><span class="t-title">' + esc(s.document_type) + '</span><span class="t-meta">' + esc(s.summary || '') + '</span></span></div>').join('') +
        '</div>' : '') +
      '<button class="link" id="back-explore" style="margin-top:12px">Back to explore (archives this journey)</button>' +
      '</div>');

    (async () => {
      const docs = await Store.safeUserDocs();
      const el = wrap.querySelector('#my-docs');
      if (!docs.length) {
        el.innerHTML = '<p class="hint" style="margin:0 0 8px">no documents recorded yet.</p>';
        return;
      }
      el.innerHTML = '';
      for (const d of docs) {
        el.appendChild(h('<div class="doc-row">' +
          '<span class="doc-ico">' + icon(DOC_ICONS[d.doc_type] || 'file-text') + '</span>' +
          '<span style="flex:1;min-width:0"><span class="doc-name">' + esc(d.doc_type) + '</span><br/>' +
          '<span class="doc-meta">' + esc(docMeta(d)) + '</span></span>' +
          '</div>'));
      }
    })();

    wrap.querySelector('#manage-docs').onclick = () => go('docsSetup');
    wrap.querySelector('#back-explore').onclick = async () => {
      await Store.saveProfile({}, 'explore');
      Store.state.mobility = null;
      Store.saveLocal();
      go('map', { replace: true });
    };
    root.appendChild(wrap);
  }


  /* ---------- admin (bare-minimum: logs, sessions, uptime, errors, messages) ---------- */

  function viewAdmin(root) {
    let token = Store.getAdminToken();
    let tab = 'summary';
    const wrap = h('<div class="screen panel" style="padding:88px 12px 0">' +
      '<div class="card">' +
      '<p class="section-label">ADMIN</p>' +
      '<div class="form-field" id="ad-token-row"><label>Admin token</label>' +
      '<input id="ad-token" type="password" placeholder="content of data/admin_token.txt inside the container" /></div>' +
      '<div class="scan-cards">' +
      '<button class="ghost" data-tab="summary">[ SUMMARY ]</button>' +
      '<button class="ghost" data-tab="logs">[ LOGS ]</button>' +
      '<button class="ghost" data-tab="messages">[ MESSAGES ]</button>' +
      '</div>' +
      '<div id="ad-body"></div>' +
      '<button class="link" id="ad-back">Back</button>' +
      '</div></div>');
    const body = wrap.querySelector('#ad-body');
    const tokenRow = wrap.querySelector('#ad-token-row');
    const tokenInput = wrap.querySelector('#ad-token');
    tokenInput.value = token;

    const getTok = () => tokenInput.value.trim();

    async function load() {
      const tok = getTok();
      if (!tok) { body.innerHTML = '<p class="hint">enter the admin token - run: docker compose exec poligo cat /app/data/admin_token.txt</p>'; return; }
      Store.setAdminToken(tok);
      body.innerHTML = '<p class="hint">loading...</p>';
      try {
        if (tab === 'summary') {
          const out = await Store.adminApi('/api/admin/summary', {}, tok);
          const c = out.counts || {};
          body.innerHTML =
            '<p class="meta">UPTIME: ' + esc(out.uptime) + '</p>' +
            '<p class="meta">USERS: ' + c.users + ' / SESSIONS: ' + c.sessions + ' / DOCS: ' + c.user_docs + ' / MOBILITIES: ' + c.mobilities + '</p>' +
            '<p class="meta">ERRORS 24H: ' + c.errors_24h + ' / WARN 24H: ' + c.warn_24h + '</p>' +
            '<p class="meta">LAST ERASMUS SCAN: ' + (out.last_scan ? esc(out.last_scan.run_at) + ' - ' + out.last_scan.count + ' OPPORTUNITIES' : 'none') + '</p>' +
            (out.last_scan && out.last_scan.opportunities ? out.last_scan.opportunities.slice(0, 8).map(o =>
              '<div class="doc-row"><span style="flex:1;min-width:0"><span class="doc-name">' + esc(o.title) +
              (o.is_new ? ' <span class="badge due">NEW</span>' : '') + '</span><br/>' +
              '<span class="doc-meta">ECTS match ' + Math.round(o.score * 100) + '% (' + o.ects_matched + '/' + o.courses + ' courses)</span></span></div>').join('') : '') +
            '<p class="section-label" style="margin-top:10px">RECENT SIGN-INS</p>' +
            ((out.recent_signins || []).map(r => '<p class="meta">' + esc(r.ts) + ' - ' + esc(String(r.user_id).slice(0, 8)) + ' - ' + esc(r.event) + '</p>').join('') || '<p class="meta">none</p>');
        } else if (tab === 'logs') {
          const out = await Store.adminApi('/api/admin/logs?limit=200', {}, tok);
          body.innerHTML = (out.logs || []).map(l =>
            '<p class="meta log-' + esc(l.level.toLowerCase()) + '">' + esc(l.ts) + ' [' + esc(l.level) + ' ' + esc(l.category) + '] ' +
            esc(l.event) + (l.detail ? ' - ' + l.detail.slice(0, 300) : '') + '</p>'
          ).join('') || '<p class="meta">no log lines</p>';
        } else {
          const out = await Store.adminApi('/api/admin/messages', {}, tok);
          body.innerHTML =
            '<div class="form-field"><textarea id="ad-msg" rows="2" placeholder="message text..."></textarea></div>' +
            '<div class="form-field"><input id="ad-to" placeholder="to user id (empty = broadcast to all)" /></div>' +
            '<button class="ghost" id="ad-send" style="width:100%">[ SEND ]</button>' +
            '<p class="section-label" style="margin-top:10px">HISTORY</p>' +
            ((out.messages || []).map(m =>
              '<p class="meta">' + esc(m.ts) + (m.from_admin ? ' [ADMIN] to ' + esc(m.to_email || m.to_user || 'ALL') : ' [USER ' + esc(String(m.from_user).slice(0, 8)) + ']') + ': ' + esc(m.text) + '</p>'
            ).join('') || '<p class="meta">no messages</p>');
          body.querySelector('#ad-send').onclick = async () => {
            try {
              await Store.adminApi('/api/admin/messages', {
                method: 'POST',
                body: JSON.stringify({ text: body.querySelector('#ad-msg').value, to_user: body.querySelector('#ad-to').value.trim() || null }),
              }, getTok());
              toast('message sent');
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
    else body.innerHTML = '<p class="hint">enter the admin token - run: docker compose exec poligo cat /app/data/admin_token.txt</p>';
    root.appendChild(wrap);
  }

  /* ---------- start ---------- */

  async function start() {
    await Store.boot();
    const st = Store.state;
    const screen = (st.sessionEmail || st.seenLanding) ? afterAuth() : 'landing';
    go(screen, { replace: true });
  }

  return { start, go, goBack, render, toast, showFatal };
})();

App.start();
