/* app.js — screen router and UI. Mobile-first dark theme; the globe is a
 * fixed background layer and screens render as panels/sheets above it. */
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
      ['timeline', 'Timeline'],
      ['scanJ', 'Scan'],
      ['docs', 'Docs'],
    ],
  };
  const NAV_ICONS = {
    map: 'globe', universities: 'landmark', shortlist: 'bookmark', profile: 'user',
    today: 'sun', timeline: 'calendar-days', scanJ: 'scan-line', docs: 'file-text',
  };
  const NAV_SCREENS = new Set([].concat(NAVS.explore, NAVS.journey).map(n => n[0]));
  const STAGES = ['before', 'arrival', 'during', 'before-return', 'after-return'];
  const DOC_TYPES = ['ID card', 'Passport', 'Student ID', 'EHIC card', 'Grant contract', 'Learning Agreement', 'Other'];
  const DOC_ICONS = {
    'ID card': 'id-card', 'Passport': 'id-card', 'Student ID': 'id-card',
    'EHIC card': 'id-card', 'Other': 'file-text',
  };

  let dotsStop = null;

  const $app = document.getElementById('app');
  const $nav = document.getElementById('bottomNav');
  const $anim = document.getElementById('anim');

  function h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
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
    const c = Store.state.mode === 'journey' ? 'var(--journey)' : 'var(--explore)';
    document.documentElement.style.setProperty('--accent', c);
  }

  function renderNav() {
    const { mode, screen } = Store.state;
    if (!NAV_SCREENS.has(screen)) { $nav.hidden = true; return; }
    $nav.hidden = false;
    $nav.innerHTML = '';
    for (const [id, label] of NAVS[mode]) {
      const b = h(`<button class="${screen === id ? 'active' : ''}"><span class="ico">${icon(NAV_ICONS[id])}</span><span>${label}</span></button>`);
      b.onclick = () => go(id);
      $nav.appendChild(b);
    }
  }

  function go(screen) {
    Store.state.screen = screen;
    Store.saveLocal();
    render();
  }

  function render() {
    setAccent();
    renderNav();
    if (dotsStop) { dotsStop(); dotsStop = null; }
    try {
      const { screen, mode } = Store.state;
      const views = {
        landing: viewLanding, auth: viewAuth, docsSetup: viewDocsSetup,
        profile: viewProfile, subjects: viewSubjects,
        map: viewMap, universities: viewUniversities, uni: viewUniversity,
        shortlist: viewShortlist, today: viewToday, timeline: viewTimeline,
        scanJ: viewScan, docs: viewDocs,
      };
      if (mode === 'explore') configureExploreGlobe(screen);
      else configureJourneyGlobe(screen);
      $app.innerHTML = '';
      (views[screen] || viewLanding)($app);
      window.scrollTo(0, 0);
    } catch (err) {
      showFatal(err);
    }
  }

  /* ---------- error boundary ---------- */

  function showFatal(err) {
    $nav.hidden = true;
    $app.innerHTML = '';
    const wrap = h(`<div class="screen panel" style="padding:88px 12px 0">
      <div class="card fatal">
        <p class="section-label">Something broke on this screen</p>
        <h2>That view failed to load</h2>
        <pre>${esc(err && err.stack ? err.stack : String(err || 'unknown error'))}</pre>
        <button class="primary">Reload the app</button>
        <button class="link">Back to the start</button>
      </div>
    </div>`);
    wrap.querySelector('.primary').onclick = () => window.location.reload();
    wrap.querySelector('.link').onclick = () => {
      Store.state.screen = 'landing';
      Store.saveLocal();
      render();
    };
    $app.appendChild(wrap);
  }

  window.addEventListener('error', e => showFatal(e.error || e.message));
  window.addEventListener('unhandledrejection', e => showFatal(e.reason));

  /* ---------- globe scenes ---------- */

  function configureExploreGlobe(screen) {
    Globe.setAutoRotate(screen === 'landing' || screen === 'auth');
    Globe.setDestination(null);
    Globe.setArcs([]);
    Globe.setPulses([]);
    if (screen === 'map' || screen === 'universities' || screen === 'subjects') {
      Globe.setPoints(Store.sortedUnis().map(u => {
        const sc = u.summary.matched / Math.max(1, u.summary.total);
        return { id: u.id, lat: u.lat, lng: u.lng, name: u.name, radius: sc, color: sc >= 0.7 ? 'good' : (sc >= 0.5 ? 'partial' : 'none') };
      }));
    } else if (screen === 'shortlist') {
      Globe.setPoints((Store.state.user?.shortlist || []).map(s => {
        const u = Store.uniById(s.id) || s;
        const sc = u.summary ? Store.score(u) : 1;
        return { id: s.id, lat: u.lat, lng: u.lng, name: u.name || s.name, radius: sc, color: 'good' };
      }));
    } else {
      Globe.setPoints([]);
    }
  }

  function configureJourneyGlobe() {
    Globe.setAutoRotate(false);
    const mob = Store.state.mobility;
    if (!mob) { Globe.setPoints([]); Globe.setArcs([]); return; }
    const uni = Store.uniById(mob.university_id);
    if (!uni) return;
    Globe.setDestination(uni.country);
    Globe.setArcs([{ from: { lat: 45.75, lng: 21.23 }, to: { lat: uni.lat, lng: uni.lng } }]);
    Globe.setPulses([{ lat: uni.lat, lng: uni.lng }]);
    Globe.setPoints([]);
    Globe.focusTo((45.75 + uni.lat) / 2, (21.23 + uni.lng) / 2);
  }

  /* ---------- landing / auth / documents ---------- */

  function viewLanding(root) {
    const wrap = h(`<div class="landing">
      <div class="brand">${icon('globe')}PoliGo</div>
      <div class="hero">
        <h1>Leave on Erasmus.<br/>Come back with every credit.</h1>
        <p class="slogan">PoliGo plans your exchange from Timisoara: match your UPT subjects with partner universities, keep the paperwork on schedule, and understand every foreign document.</p>
      </div>
      <div class="features">
        <div class="feat">${icon('globe')}<span><span class="f-title">Find your matches</span><span class="f-sub">Partner universities ranked by how much of your 30 ECTS they cover.</span></span></div>
        <div class="feat">${icon('calendar-days')}<span><span class="f-title">Stay on schedule</span><span class="f-sub">A journey timeline built around your accepted mobility dates.</span></span></div>
        <div class="feat">${icon('scan-line')}<span><span class="f-title">Read any document</span><span class="f-sub">Scan rental contracts or registration forms and get plain answers.</span></span></div>
      </div>
      <button class="primary" id="signup-btn">Create account</button>
      <button class="ghost" id="login-btn" style="margin-top:10px">Log in</button>
      <button class="link" id="skip-btn">Explore without an account</button>
      <div class="updates">
        <span class="f-title">Get notified at launch</span>
        <div class="updates-row">
          <input id="u-email" type="email" placeholder="you@upt.ro" />
          <button class="icon-btn" id="u-send" aria-label="Notify me">${icon('arrow-right')}</button>
        </div>
      </div>
    </div>`);
    wrap.querySelector('#signup-btn').onclick = () => go('auth');
    wrap.querySelector('#login-btn').onclick = () => go('auth');
    wrap.querySelector('#skip-btn').onclick = () => {
      Store.state.seenLanding = true;
      Store.saveLocal();
      go('profile');
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
    const wrap = h(`<div class="screen panel" style="padding:88px 12px 0">
      <div class="card">
        <p class="section-label">Sign in or create an account</p>
        <h2 style="margin:0 0 4px">Your Erasmus, synced</h2>
        <p class="hint">One email, no passwords. Existing account logs in, new email creates an account.</p>
        <div class="form-field"><label>Email</label>
          <input id="a-email" type="email" placeholder="you@upt.ro" autocomplete="email" /></div>
        <button class="primary">Continue</button>
        <button class="link">Back</button>
      </div>
    </div>`);
    wrap.querySelector('.link').onclick = () => go('landing');
    wrap.querySelector('.primary').onclick = async () => {
      const inp = wrap.querySelector('#a-email');
      const email = inp.value.trim().toLowerCase();
      if (!email || email.indexOf('@') < 1) { toast('Enter a valid email'); return; }
      try {
        await Store.login(email);
        toast('Welcome back');
        go(afterAuthScreen());
      } catch (e) {
        if (String(e.message).indexOf('404') !== -1) {
          await Store.signup(email);
          toast('Account created');
          go('docsSetup');
        } else {
          toast('Could not sign in. Is the server online?');
        }
      }
    };
    root.appendChild(wrap);
  }

  function fmtSize(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  async function viewDocsSetup(root) {
    let docs = await Store.safeUserDocs();
    const wrap = h(`<div class="screen panel" style="padding:88px 12px 0">
      <div class="card">
        <p class="section-label">Documents you will need often</p>
        <p class="hint">Your ID, passport, student ID, EHIC card... offices ask for them again and again. The file itself stays on this device - the app only records the type, name and size.</p>
        <div class="form-field"><label>Document type</label>
          <div class="select-wrap">
            <select id="doc-type">${DOC_TYPES.map(t => `<option>${t}</option>`).join('')}</select>
            ${icon('chevron-down', 'sel-ico')}
          </div>
        </div>
        <button class="primary" id="pick-doc">${icon('upload', 'inline-ico')} Upload a copy</button>
        <input id="doc-file" type="file" hidden />
        <div id="doc-list" style="margin-top:16px"></div>
        <button class="primary" id="docs-done" style="margin-top:12px">Continue to profile</button>
      </div>
    </div>`);
    const sel = wrap.querySelector('#doc-type');
    const fileInput = wrap.querySelector('#doc-file');
    const listEl = wrap.querySelector('#doc-list');

    function drawList() {
      listEl.innerHTML = '';
      if (!docs.length) {
        listEl.innerHTML = '<p class="hint">No documents yet. You can also add them later from your profile.</p>';
        return;
      }
      for (const d of docs) {
        const row = h(`<div class="doc-row" data-id="${d.id}">
          <span class="doc-ico">${icon(DOC_ICONS[d.doc_type] || 'file-text')}</span>
          <span style="flex:1;min-width:0"><span class="doc-name">${esc(d.doc_type)}</span><br/>
          <span class="doc-meta">${esc(d.file_name)}${d.size ? ' - ' + fmtSize(d.size) : ''}</span></span>
          <span class="pill good">${icon('check', 'sm-ico')} Saved</span>
          <button class="icon-btn" data-del aria-label="Remove document">${icon('trash-2', 'sm-ico')}</button>
        </div>`);
        row.querySelector('[data-del]').onclick = async () => {
          await Store.deleteUserDoc(d.id);
          await Store.deleteDocBlob(d.doc_type);
          docs = docs.filter(x => x.id !== d.id);
          drawList();
          toast('Document removed');
        };
        listEl.appendChild(row);
      }
    }

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
    wrap.querySelector('#docs-done').onclick = () => go('profile');

    drawList();
    root.appendChild(wrap);
  }

  function afterAuthScreen() {
    const { mode, user } = Store.state;
    if (mode === 'journey' && Store.state.mobility) return 'today';
    if (user && user.program) return 'map';
    return 'profile';
  }

  /* ---------- explore screens ---------- */

  function viewProfile(root) {
    const u = Store.state.user || {};
    const wrap = h(`<div class="screen panel" style="padding:88px 12px 0">
      <div class="card">
        <p class="section-label">Your profile</p>
        <div class="form-field"><label>Faculty</label>
          <div class="select-wrap"><select id="f-faculty">
            <option ${u.faculty === 'AC' ? 'selected' : ''}>AC - Computers and Information Technology</option>
            <option ${u.faculty && u.faculty !== 'AC' ? 'selected' : ''}>Other</option>
          </select>${icon('chevron-down', 'sel-ico')}</div></div>
        <div class="form-field"><label>Program</label>
          <input id="f-program" list="programs" value="${esc(u.program || 'Computer Science')}" />
          <datalist id="programs"><option>Computer Science</option><option>Information Technology</option><option>Automation</option></datalist></div>
        <div class="form-field"><label>Year</label>
          <div class="select-wrap"><select id="f-year">${[1, 2, 3, 4].map(y => `<option ${u.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select>${icon('chevron-down', 'sel-ico')}</div></div>
        <div class="form-field"><label>Semester abroad</label>
          <div class="select-wrap"><select id="f-sem">
            <option value="fall" ${u.semester_abroad === 'fall' ? 'selected' : ''}>Fall</option>
            <option value="spring" ${u.semester_abroad === 'spring' ? 'selected' : ''}>Spring</option>
          </select>${icon('chevron-down', 'sel-ico')}</div></div>
        <button class="primary">Save and pick subjects</button>
      </div>
      <div class="card" style="margin-top:12px">
        <p class="section-label">Documents</p>
        <div id="prof-docs"><p class="hint" style="margin:0 0 12px">Add your ID, passport, student ID and EHIC card once - they are asked for everywhere.</p></div>
        <button class="ghost" id="manage-docs" style="width:100%">Manage documents</button>
      </div>
      <div class="card" style="margin-top:12px">
        <p class="section-label">Account</p>
        <div class="doc-row">
          <span class="doc-ico">${icon('user')}</span>
          <span style="flex:1;min-width:0"><span class="doc-name">${esc(Store.state.sessionEmail || 'Guest on this device')}</span><br/>
          <span class="doc-meta">${Store.state.sessionEmail ? 'Signed in' : 'Progress is stored only on this device'}</span></span>
        </div>
        ${Store.state.sessionEmail ? '<button class="ghost" id="logout" style="width:100%;margin-top:4px">Log out</button>' : '<button class="link" id="go-auth" style="padding-left:0">Sign in to sync</button>'}
      </div>
    </div>`);

    (async () => {
      const docs = await Store.safeUserDocs();
      const el = wrap.querySelector('#prof-docs');
      if (docs.length) {
        el.innerHTML = docs.map(d => `<div class="doc-row"><span class="doc-ico">${icon(DOC_ICONS[d.doc_type] || 'file-text')}</span>
          <span style="flex:1;min-width:0"><span class="doc-name">${esc(d.doc_type)}</span><br/>
          <span class="doc-meta">${esc(d.file_name)}</span></span>
          <span class="pill good">${icon('check', 'sm-ico')} Saved</span></div>`).join('');
      }
    })();

    wrap.querySelector('.primary').onclick = async () => {
      await Store.saveProfile({
        faculty: wrap.querySelector('#f-faculty').value,
        program: wrap.querySelector('#f-program').value,
        year: parseInt(wrap.querySelector('#f-year').value, 10),
        semester_abroad: wrap.querySelector('#f-sem').value,
      });
      go('subjects');
    };
    wrap.querySelector('#manage-docs').onclick = () => go('docsSetup');
    const logoutBtn = wrap.querySelector('#logout');
    if (logoutBtn) logoutBtn.onclick = async () => { await Store.logout(); go('landing'); };
    const authBtn = wrap.querySelector('#go-auth');
    if (authBtn) authBtn.onclick = () => go('auth');
    root.appendChild(wrap);
  }

  function viewSubjects(root) {
    const courses = Store.state.homeCourses;
    const selected = new Set(courses.map(c => c.id));
    const list = h(`<div class="screen panel" style="padding:88px 12px 0">
      <div class="card">
        <p class="section-label">My subjects - ${esc(Store.state.user?.program || 'Computer Science')}</p>
        <div id="course-list"></div>
        <p style="color:var(--text-2);font-size:13px" id="ects-line"></p>
        <button class="primary" style="margin-top:12px">Find my matches</button>
      </div>
    </div>`);
    const listEl = list.querySelector('#course-list');
    const ects = () => {
      const sum = courses.filter(c => selected.has(c.id)).reduce((s, c) => s + c.ects, 0);
      list.querySelector('#ects-line').textContent = `${sum} ECTS selected`;
    };
    for (const c of courses) {
      const row = h(`<label class="task-card" style="margin-bottom:6px">
        <input type="checkbox" checked data-id="${c.id}" />
        <span><span class="t-title">${esc(c.name)}</span>
        <span class="t-meta">${c.ects} ECTS - ${esc((c.topics || []).slice(0, 3).join(', '))}</span></span>
      </label>`);
      row.querySelector('input').onchange = e => {
        e.target.checked ? selected.add(c.id) : selected.delete(c.id);
        ects();
      };
      listEl.appendChild(row);
    }
    ects();
    list.querySelector('.primary').onclick = () => go('map');
    root.appendChild(list);
  }

  function viewMap(root) {
    const sheet = h(`<div class="sheet">
      <div class="sheet-grab"></div>
      <h2>Your matches</h2>
      <div class="chips" id="filters"></div>
      <div id="uni-list"></div>
    </div>`);
    buildFilters(sheet.querySelector('#filters'), () => fillList(sheet));
    fillList(sheet);

    function fillList() {
      const el = sheet.querySelector('#uni-list');
      const { lang, country } = Store.state.filters;
      let unis = Store.sortedUnis();
      if (lang) unis = unis.filter(u => (u.languages || []).includes(lang));
      if (country) unis = unis.filter(u => u.country === country);
      el.innerHTML = '';
      for (const u of unis) {
        const card = h(`<div class="card uni-card" style="cursor:pointer">
          ${flagImg(u.country_code)}
          <span><span class="name">${esc(u.name)}</span><br/>
          <span class="meta">${esc(u.city)}, ${esc(u.country)} - ${esc((u.languages || []).join(', '))}</span></span>
          <span class="badge"><span class="num">${u.summary.matched}/${u.summary.total}</span><br/><span class="lbl">match</span></span>
        </div>`);
        card.onclick = () => { Store.state.activeUniId = u.id; go('uni'); };
        el.appendChild(card);
      }
    }
    root.appendChild(sheet);

    // Partner points light up with the python-rendered dots clip (cached on
    // device after first run). The layer stays hidden until the clip is
    // actually playing, and is removed on failure - never a black box.
    const c = h('<canvas class="dots-layer" hidden></canvas>');
    document.body.appendChild(c);
    Anim.loop('/anim/dots.mjpg?loop=1', c).then(stop => {
      c.hidden = false;
      dotsStop = () => { stop(); c.remove(); };
    }).catch(() => { c.remove(); });
  }

  function buildFilters(el, onChange) {
    const langs = [...new Set(Store.state.universities.flatMap(u => u.languages || []))];
    const countries = [...new Set(Store.state.universities.map(u => u.country))];
    el.innerHTML = '';
    const make = (label, kind, value) => {
      const { lang, country } = Store.state.filters;
      const on = kind === 'lang' ? lang === value : country === value;
      const chip = h(`<button class="chip ${on ? 'on' : ''}">${esc(label)}</button>`);
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

  function viewUniversities(root) {
    const wrap = h(`<div class="screen panel" style="padding:88px 12px 0">
      <div class="card">
        <p class="section-label">Partner universities</p>
        <div id="uni-list"></div>
      </div>
    </div>`);
    const list = wrap.querySelector('#uni-list');
    for (const u of Store.sortedUnis()) {
      const card = h(`<div class="uni-card" style="cursor:pointer">
        ${flagImg(u.country_code)}
        <span><span class="name">${esc(u.name)}</span><br/>
        <span class="meta">${esc(u.city)}, ${esc(u.country)} - ${esc((u.languages || []).join(', '))}</span></span>
        <span class="badge"><span class="num">${u.summary.matched}/${u.summary.total}</span><br/><span class="lbl">match</span></span>
      </div>`);
      card.onclick = () => { Store.state.activeUniId = u.id; go('uni'); };
      list.appendChild(card);
    }
    root.appendChild(wrap);
  }

  async function viewUniversity(root) {
    const u = await Store.getUniversityDetail(Store.state.activeUniId);
    if (!u || !u.summary) { go('map'); return; }
    const s = u.summary;
    const pct = s.total ? s.matched / s.total : 0;
    const circ = 2 * Math.PI * 42;
    const wrap = h(`<div class="screen panel" style="padding:60px 12px 0">
      <div class="card">
        <div style="display:flex;align-items:center;gap:16px">
          <div class="match-ring">
            <svg width="96" height="96">
              <circle cx="48" cy="48" r="42" fill="none" stroke="var(--surface-2)" stroke-width="6"/>
              <circle cx="48" cy="48" r="42" fill="none" stroke="var(--good)" stroke-width="6"
                stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct)}" stroke-linecap="round"/>
            </svg>
            <div class="inside"><span class="num">${s.matched}/${s.total}</span><span class="lbl">subjects match</span></div>
          </div>
          <div>
            <h2 style="font-size:20px">${flagImg(u.country_code, 'inline-ico')} ${esc(u.name)}</h2>
            <p style="color:var(--text-2);margin:4px 0 0">${esc(u.city)}, ${esc(u.country)}<br/>${esc((u.languages || []).join(', '))}</p>
          </div>
        </div>
        <p class="section-label" style="margin-top:16px">ECTS covered - ${s.ects_covered} of 30</p>
        <div class="ects-bar"><div style="width:${Math.min(100, s.ects_covered / 30 * 100)}%"></div></div>
        <div id="rows" style="margin-top:12px"></div>
        <div style="display:flex;gap:12px;margin-top:16px">
          <button class="ghost" style="flex:1" id="add-sl">Add to shortlist</button>
          <button class="primary" style="flex:1" id="accepted">I got accepted</button>
        </div>
      </div>
    </div>`);
    const rows = wrap.querySelector('#rows');
    const icons = { good: 'check', partial: 'arrow-right', none: 'x' };
    for (const m of u.matches) {
      const label = m.label[0].toUpperCase() + m.label.slice(1);
      const row = h(`<div class="match-row">
        <div class="line1"><span>${esc(m.home_name)}</span><span class="arrow">${icon('arrow-right', 'sm-ico')}</span>
          <span>${esc(m.partner_name || 'No partner course')}</span></div>
        <div class="line2"><span class="pill ${m.label}">${icon(icons[m.label], 'sm-ico')} ${label}</span>
          <span>${m.partner_ects ? m.partner_ects + ' ECTS' : ''}</span></div>
        <div class="explain" style="display:none">${esc(m.explanation || '')}${m.missing_topics && m.missing_topics.length ? '<br/>Missing: ' + esc(m.missing_topics.join(', ')) : ''}</div>
      </div>`);
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
    const sl = Store.state.user?.shortlist || [];
    const wrap = h(`<div class="screen panel" style="padding:88px 12px 0">
      <div class="card">
        <p class="section-label">Shortlist - max 3, in preference order</p>
        <div id="sl-list"></div>
        ${sl.length === 0 ? '<p style="color:var(--text-2)">Nothing here yet. Open a university and tap "Add to shortlist".</p>' : ''}
      </div>
    </div>`);
    const list = wrap.querySelector('#sl-list');
    sl.forEach((s, idx) => {
      const u = Store.uniById(s.id) || s;
      const card = h(`<div class="card uni-card">
        <span class="badge"><span class="num">${idx + 1}</span></span>
        <span><span class="name">${esc(u.name)}</span><br/>
        <span class="meta">${esc(u.city || '')} ${u.summary ? '- ' + u.summary.matched + '/' + u.summary.total + ' match' : ''}</span></span>
        <span style="margin-left:auto;display:flex;gap:8px">
          <button class="ghost" style="height:36px;padding:0 12px">Accepted</button>
          <button class="icon-btn" data-remove aria-label="Remove from shortlist">${icon('trash-2', 'sm-ico')}</button>
        </span>
      </div>`);
      card.querySelector('[data-remove]').onclick = async () => { await Store.removeFromShortlist(s.id); render(); };
      card.querySelector('button:not([data-remove])').onclick = () => openAcceptedSheet(s.id);
      list.appendChild(card);
    });
    root.appendChild(wrap);
  }

  /* ---------- the transition ---------- */

  function openAcceptedSheet(preId) {
    const sl = Store.state.user?.shortlist || [];
    const u0 = preId || (sl[0] && sl[0].id) || (Store.sortedUnis()[0] || {}).id;
    const sheet = h(`<div class="sheet" style="z-index:8">
      <div class="sheet-grab"></div>
      <h2>I got accepted</h2>
      <div class="form-field"><label>University</label>
        <div class="select-wrap"><select id="a-uni">${Store.state.universities.map(u => `<option value="${u.id}" ${u.id === u0 ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>${icon('chevron-down', 'sel-ico')}</div></div>
      <div class="form-field"><label>Start date</label><input id="a-start" type="date" /></div>
      <div class="form-field"><label>Arrival date (optional)</label><input id="a-arrival" type="date" /></div>
      <div class="form-field"><label>End date</label><input id="a-end" type="date" /></div>
      <button class="primary">Start my journey</button>
    </div>`);
    const start = sheet.querySelector('#a-start');
    const arrival = sheet.querySelector('#a-arrival');
    const end = sheet.querySelector('#a-end');
    const defaultStart = new Date(Date.now() + 47 * 86400000).toISOString().slice(0, 10);
    const defaultEnd = new Date(Date.now() + 197 * 86400000).toISOString().slice(0, 10);
    start.value = defaultStart;
    end.value = defaultEnd;
    arrival.value = new Date(new Date(defaultStart) - 3 * 86400000).toISOString().slice(0, 10);
    start.onchange = () => {
      arrival.value = new Date(new Date(start.value) - 3 * 86400000).toISOString().slice(0, 10);
    };
    sheet.querySelector('.primary').onclick = async () => {
      const out = await Store.accept({ university_id: sheet.querySelector('#a-uni').value, start_date: start.value, arrival_date: arrival.value, end_date: end.value });
      sheet.remove();
      await playTransition(out.mobility.university_id);
    };
    document.body.appendChild(sheet);
  }

  async function playTransition(universityId) {
    const uni = Store.uniById(universityId);
    $anim.hidden = false;
    try {
      const clip = await Anim.playOnce(`/anim/transition/${universityId}.mjpg?loop=0`, $anim, {
        loops: 1,
        onDone: () => setTimeout(() => {
          $anim.hidden = true;
          setAccent();
          go('today');
          toast(`${uni ? uni.greeting + ' ' : ''}Your journey${uni ? ' to ' + uni.city : ''} starts now`);
        }, 150),
      });
      if (!clip.bitmaps.length) { $anim.hidden = true; go('today'); }
    } catch (e) {
      $anim.hidden = true;
      go('today');
      toast(`${uni ? uni.greeting + ' ' : ''}Your journey starts now`);
    }
  }

  /* ---------- journey screens ---------- */

  function dueChip(due) {
    if (!due) return '<span class="due soon">no date</span>';
    const days = Math.round((new Date(due) - new Date()) / 86400000);
    if (days < 0) return `<span class="due overdue">overdue ${-days}d</span>`;
    if (days === 0) return '<span class="due today">today</span>';
    return `<span class="due soon">in ${days} days</span>`;
  }

  function stageLabel(st) {
    return { before: 'Before departure', arrival: 'Arrival (first 2 weeks)', during: 'During', 'before-return': 'Before return', 'after-return': 'After return' }[st] || st;
  }

  function viewToday(root) {
    const mob = Store.state.mobility;
    if (!mob) { openAcceptedSheet(); return; }
    const uni = Store.uniById(mob.university_id);
    const now = new Date();
    const start = new Date(mob.start_date), end = new Date(mob.end_date), arrival = new Date(mob.arrival_date);
    const totalDays = Math.max(1, Math.round((end - start) / 86400000));
    let countNum, countText;
    if (now < arrival) {
      countNum = Math.ceil((arrival - now) / 86400000);
      countText = 'days to departure';
    } else if (now <= end) {
      countNum = Math.max(1, Math.ceil((now - arrival) / 86400000));
      countText = `day of ${totalDays}`;
    } else {
      countNum = '\u221E';
      countText = 'Welcome back';
    }
    const next = Store.state.tasks.filter(t => !t.done).slice(0, 3);
    const pct = stage => {
      const ts = Store.state.tasks.filter(t => t.stage === stage);
      return ts.length ? Math.round(100 * ts.filter(t => t.done).length / ts.length) : 0;
    };
    const wrap = h(`<div class="screen panel" style="padding:60px 12px 0">
      <div class="card" style="display:flex;gap:16px;align-items:center;position:relative">
        <div class="ring">
          <svg width="120" height="120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-2)" stroke-width="6"/>
          <circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent)" stroke-width="6" stroke-linecap="round"
            stroke-dasharray="${2 * Math.PI * 52}" stroke-dashoffset="${2 * Math.PI * 52 * (1 - Math.min(1, (now - arrival) / ((end - arrival) || 1)))}"/></svg>
          <div class="inside"><span class="big-num">${countNum}</span><span class="unit">${esc(countText)}</span></div>
        </div>
        <div>
          <p class="section-label">${esc(uni ? uni.name : 'Your mobility')}</p>
          <p style="color:var(--text-2);margin:4px 0 0;font-size:13px">${esc(mob.start_date)} \u2192 ${esc(mob.end_date)}<br/>${esc(uni ? uni.city + ', ' + uni.country : '')}</p>
        </div>
      </div>
      <div class="card" style="margin-top:12px">
        <p class="section-label">Next up</p>
        ${next.map(t => `<div class="task-card"><span><span class="t-title">${esc(t.title)}</span><span class="t-meta">${dueChip(t.due_date)}</span></span></div>`).join('') || '<p style="color:var(--text-2)">All clear.</p>'}
      </div>
      <div class="card" style="margin-top:12px">
        <p class="section-label">Stage progress</p>
        ${STAGES.map(st => `<p style="font-size:12px;color:var(--text-2);margin:8px 0 4px">${esc(stageLabel(st))}</p><div class="stage-progress"><div style="width:${pct(st)}%"></div></div>`).join('')}
      </div>
      <button class="primary" style="margin-top:16px" id="scan-btn">${icon('scan-line', 'inline-ico')} Scan a document</button>
    </div>`);
    wrap.querySelector('#scan-btn').onclick = () => go('scanJ');
    root.appendChild(wrap);

    // Destination pulse ring, rendered by the python clip, cached on device
    const c = h('<canvas style="position:absolute;right:-4px;top:-4px;width:96px;height:96px;pointer-events:none"></canvas>');
    wrap.firstElementChild.appendChild(c);
    Anim.loop('/anim/pulse.mjpg?loop=1', c);
  }

  function viewTimeline(root) {
    const tasks = Store.state.tasks.slice().sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
    const taskCard = t => {
      const src = { template: 'Template', scan: 'From scan', user: 'Added by you' }[t.source] || t.source;
      return `<label class="task-card ${t.done ? 'done' : ''}">
        <input type="checkbox" data-id="${t.id}" ${t.done ? 'checked' : ''} />
        <span><span class="t-title">${esc(t.title)}</span>
        <span class="t-meta">${dueChip(t.due_date)} <span>${esc(src)}</span></span></span>
      </label>`;
    };
    const wrap = h(`<div class="screen panel" style="padding:88px 12px 0">
      <div class="card">
        <p class="section-label">Timeline</p>
        ${STAGES.map(st => {
          const list = tasks.filter(t => t.stage === st);
          if (!list.length) return '';
          return `<p class="section-label" style="margin-top:16px">${esc(stageLabel(st))}</p>` + list.map(taskCard).join('');
        }).join('')}
        <div class="form-field" style="margin-top:16px"><label>Add your own task</label>
          <input id="new-task" placeholder="e.g. Pick up keys from landlord" /></div>
        <button class="ghost" id="add-task" style="width:100%">Add task</button>
      </div>
    </div>`);
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
    const wrap = h(`<div class="screen panel" style="padding:88px 12px 0">
      <div class="card">
        <p class="section-label">Scan a document</p>
        <p style="color:var(--text-2)">Photograph or upload a document you received in your destination city - a rental contract, a registration form, a bill.</p>
        <div class="form-field"><input id="scan-file" type="file" accept="image/*" capture="environment" /></div>
        <button class="primary" id="do-scan">Scan document</button>
        <p class="disclaimer">AI explanation, not legal advice. Confirm with the office.</p>
      </div>
      <div class="scan-cards" id="scan-result" style="margin-top:12px"></div>
    </div>`);
    wrap.querySelector('#do-scan').onclick = async () => {
      const res = wrap.querySelector('#scan-result');
      res.innerHTML = '<div class="card"><p style="color:var(--text-2);margin:0">Reading your document...</p></div>';
      await new Promise(r => setTimeout(r, 1800));
      const doc = await Store.scan();
      if (!doc) { res.innerHTML = '<div class="card"><p style="color:var(--none);margin:0">Scanner unavailable. Try again later.</p></div>'; return; }
      const r = typeof doc.result_json === 'string' ? JSON.parse(doc.result_json) : doc.result_json;
      res.innerHTML = scanResultHtml(r);
      wireDeadlines(res, r);
    };
    root.appendChild(wrap);

    function scanResultHtml(r) {
      const dl = r.deadlines[0];
      return `<div class="card"><p class="section-label">What this is</p><p style="margin:4px 0 0">${esc(r.what)}</p></div>
      <div class="card"><p class="section-label">What you need to do</p><ol>${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>
      <div class="card"><p class="section-label">Deadlines</p><div class="task-card"><span class="t-title">${esc(dl.text)}</span>
        <button class="ghost" data-dl="${esc(dl.title)}" style="height:32px;padding:0 10px;font-size:12px;flex-shrink:0">Add to timeline</button></div></div>
      <div class="card"><p class="section-label">Bring with you</p><ul>${r.bring.map(b => `<li>${esc(b)}</li>`).join('')}</ul></div>
      <div class="card"><p class="section-label">Watch out</p><p style="margin:4px 0 0;display:flex;gap:6px;align-items:flex-start">${icon('triangle-alert', 'sm-ico warn')}<span>${esc(r.watch_out)}</span></p></div>
      <div class="card"><p class="section-label">Key words</p><p style="margin:4px 0 0">${r.keywords.map(k => `<span class="pill" style="color:var(--accent);margin:2px">${esc(k[0])} \u2192 ${esc(k[1])}</span>`).join(' ')}</p></div>`;
    }

    function wireDeadlines(res, r) {
      res.querySelectorAll('[data-dl]').forEach(b => {
        b.onclick = async () => {
          const due = new Date(Date.now() + ((r.deadlines[0].offset_days || 7) * 86400000)).toISOString().slice(0, 10);
          await Store.addTask(Store.state.mobility ? Store.state.mobility.id : null, b.dataset.dl, 'during', due);
          b.textContent = 'Added';
          b.disabled = true;
          toast('Added to timeline');
        };
      });
    }
  }

  async function viewDocs(root) {
    const docs = [
      ['Learning Agreement - before mobility', 'signed'],
      ['Grant contract', 'signed'],
      ['EHIC card', 'active'],
      ['Certificate of arrival', 'pending'],
      ['Certificate of attendance', 'pending'],
      ['Transcript of Records (partner)', 'at the end'],
    ];
    const scans = await Store.getScans();
    const wrap = h(`<div class="screen panel" style="padding:88px 12px 0">
      <div class="card">
        <p class="section-label">Erasmus documents</p>
        ${docs.map(d => {
          const color = d[1] === 'signed' || d[1] === 'active' ? 'good' : 'none';
          const ico = color === 'good' ? 'check' : 'x';
          return `<div class="task-card"><span><span class="t-title">${esc(d[0])}</span>
            <span class="t-meta"><span class="pill ${color}">${icon(ico, 'sm-ico')} ${esc(d[1])}</span></span></span></div>`;
        }).join('')}
      </div>
      ${scans.length ? `<div class="card" style="margin-top:12px"><p class="section-label">Scanned documents</p>
        ${scans.map(s => `<div class="task-card"><span><span class="t-title">${esc(s.document_type)}</span><span class="t-meta">${esc(s.summary || '')}</span></span></div>`).join('')}
      </div>` : ''}
      <button class="link" id="back-explore" style="margin-top:12px">Back to explore (archives this journey)</button>
    </div>`);
    wrap.querySelector('#back-explore').onclick = async () => {
      await Store.saveProfile({}, 'explore');
      Store.state.mobility = null;
      Store.saveLocal();
      go('map');
    };
    root.appendChild(wrap);
  }

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function start() {
    await Store.boot();
    Globe.init('globe', p => { if (p && p.id) { Store.state.activeUniId = p.id; go('uni'); } });
    await Globe.preload();
    const { sessionEmail, seenLanding, mobility, mode } = Store.state;
    const screen = sessionEmail
      ? afterAuthScreen()
      : (mobility && mode === 'journey' ? 'today' : (seenLanding ? 'profile' : 'landing'));
    Store.state.screen = screen;
    go(screen);
  }

  return { start, go, render, toast, showFatal };
})();

App.start();
