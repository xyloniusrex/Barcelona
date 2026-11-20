/* store.js — device state + thin API client. Core reusable data is cached by
 * the service worker; user records live in the server DB and mirror to
 * localStorage so the app still opens offline. Document files never leave the
 * device — they live in IndexedDB; the server only keeps the metadata. */
const Store = (() => {
  const LS_KEY = 'poligo-state';
  const state = {
    userId: null,
    sessionEmail: null,
    seenLanding: false,
    mode: 'explore',
    user: null,
    universities: [],
    homeCourses: [],
    mobility: null,
    tasks: [],
    screen: 'welcome',
    activeUniId: null,
    filters: { lang: null, country: null },
  };

  function newId() {
    return (crypto.randomUUID && crypto.randomUUID()) || 'u-' + Math.random().toString(36).slice(2);
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) Object.assign(state, JSON.parse(raw));
    } catch (e) { /* fresh device */ }
    if (!state.userId) {
      state.userId = newId();
      saveLocal();
    }
  }

  function saveLocal() {
    const { userId, sessionEmail, seenLanding, mode, user, mobility, tasks } = state;
    localStorage.setItem(LS_KEY, JSON.stringify({ userId, sessionEmail, seenLanding, mode, user, mobility, tasks }));
    if (state.universities.length) {
      localStorage.setItem(LS_KEY + '-seed', JSON.stringify({ universities: state.universities, homeCourses: state.homeCourses }));
    }
  }

  async function api(path, opts) {
    const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
    if (!res.ok) throw new Error(path + ' -> ' + res.status);
    return res.status === 204 ? null : res.json();
  }

  function registerDeviceUser() {
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: state.userId, email: state.sessionEmail || null }),
    }).catch(() => {});
  }

  async function refreshUserState() {
    const me = await api('/api/users/' + state.userId);
    state.user = me;
    state.mode = me.mode || 'explore';
    state.mobility = me.mobility || null;
    state.tasks = [];
    if (me.mobility) {
      try { state.tasks = (await api('/api/mobilities/' + me.mobility.id)).tasks; } catch (e) {}
    }
  }

  async function boot() {
    loadLocal();
    if (!state.sessionEmail) registerDeviceUser();

    // seed data (universities + home courses) — cached on device after first load
    try {
      const [unis, courses] = await Promise.all([api('/api/universities'), api('/api/home-courses')]);
      state.universities = unis.universities;
      state.homeCourses = courses.courses;
    } catch (e) {
      try {
        const cached = JSON.parse(localStorage.getItem(LS_KEY + '-seed'));
        state.universities = cached.universities;
        state.homeCourses = cached.homeCourses;
      } catch (e2) { /* first run offline: empty until online */ }
    }

    // user-specific state
    try {
      await refreshUserState();
    } catch (e) { /* server unreachable — stay in local state */ }
    saveLocal();
    return state;
  }

  async function saveProfile(fields, mode) {
    state.user = Object.assign({}, state.user, fields, mode ? { mode } : {});
    if (mode) state.mode = mode;
    saveLocal();
    const body = Object.assign({}, fields, mode ? { mode } : {});
    try {
      await fetch('/api/users/' + state.userId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) { /* local-first; sync retried next boot */ }
  }

  async function login(email) {
    const me = await api('/api/users/by-email/' + encodeURIComponent(email));
    state.userId = me.id;
    state.sessionEmail = me.email || email;
    await refreshUserState();
    saveLocal();
    return me;
  }

  async function signup(email) {
    if (!state.userId) state.userId = newId();
    await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ id: state.userId, email }),
    });
    state.sessionEmail = email;
    try {
      const me = await api('/api/users/' + state.userId);
      state.user = me;
      state.mode = me.mode || 'explore';
      state.mobility = me.mobility || null;
    } catch (e) { /* keep local state */ }
    saveLocal();
    return state;
  }

  async function logout() {
    state.sessionEmail = null;
    state.user = null;
    state.mobility = null;
    state.tasks = [];
    state.mode = 'explore';
    state.userId = newId();
    state.screen = 'landing';
    saveLocal();
    registerDeviceUser();
  }

  async function notify(email) {
    await api('/api/signups', { method: 'POST', body: JSON.stringify({ email }) });
  }

  const uniById = id => state.universities.find(u => u.id === id);
  const score = u => (u.summary ? u.summary.matched / Math.max(1, u.summary.total) : 0);
  const sortedUnis = () => state.universities.slice().sort((a, b) => score(b) - score(a));

  async function addToShortlist(universityId) {
    try { await api('/api/shortlist?user_id=' + state.userId + '&university_id=' + universityId, { method: 'POST', body: 'null' }); }
    catch (e) { /* keep local */ }
    try { state.user = await api('/api/users/' + state.userId); } catch (e) {}
    saveLocal();
  }

  async function removeFromShortlist(universityId) {
    try { await api('/api/shortlist/' + state.userId + '/' + universityId, { method: 'DELETE' }); } catch (e) {}
    try { state.user = await api('/api/users/' + state.userId); } catch (e) {}
    saveLocal();
  }

  async function accept(payload) {
    const out = await api('/api/accepted', { method: 'POST', body: JSON.stringify(Object.assign({ user_id: state.userId }, payload)) });
    state.mobility = out.mobility;
    state.tasks = out.tasks;
    state.mode = 'journey';
    state.user = state.user || {};
    state.user.mode = 'journey';
    saveLocal();
    return out;
  }

  async function toggleTask(taskId, done) {
    const t = state.tasks.find(t => t.id === taskId);
    if (t) t.done = done ? 1 : 0;
    saveLocal();
    try { await api('/api/tasks/' + taskId + '?done=' + (done ? 'true' : 'false'), { method: 'PATCH', body: 'null' }); } catch (e) {}
  }

  async function addTask(mobilityId, title, stage, dueDate) {
    try {
      const t = await api('/api/tasks', { method: 'POST', body: JSON.stringify({ mobility_id: mobilityId, title, stage, due_date: dueDate }) });
      state.tasks.push(t);
    } catch (e) {
      state.tasks.push({ id: -Date.now(), title, stage, due_date: dueDate, source: 'user', done: 0, mobility_id: mobilityId });
    }
    saveLocal();
  }

  async function scan() {
    if (!state.mobility) return null;
    try { return await api('/api/scan', { method: 'POST', body: JSON.stringify({ mobility_id: state.mobility.id }) }); }
    catch (e) { return null; }
  }

  async function getScans() {
    if (!state.mobility) return [];
    try { return (await api('/api/scans/' + state.mobility.id)).scans; } catch (e) { return []; }
  }

  async function getUniversityDetail(id) {
    try { return await api('/api/universities/' + id); }
    catch (e) { return uniById(id); }
  }

  /* ---------- user documents: metadata on server, files on device ---------- */

  async function safeUserDocs() {
    try { return (await api('/api/user-docs?user_id=' + state.userId)).docs; }
    catch (e) { return []; }
  }

  async function addUserDoc(doc) {
    return api('/api/user-docs', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ user_id: state.userId }, doc)),
    });
  }

  async function deleteUserDoc(docId) {
    await api('/api/user-docs/' + docId + '?user_id=' + state.userId, { method: 'DELETE' });
  }

  function docsDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('no indexeddb')); return; }
      const rq = indexedDB.open('poligo-docs', 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore('docs'); };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error || new Error('indexeddb open failed'));
    });
  }

  function idbTx(db, mode, fn) {
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction('docs', mode).objectStore('docs'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const docKey = docType => state.userId + ':' + docType;

  async function saveDocBlob(docType, blob) {
    try { const db = await docsDb(); await idbTx(db, 'readwrite', s => s.put(blob, docKey(docType))); } catch (e) {}
  }

  async function getDocBlob(docType) {
    try { const db = await docsDb(); return await idbTx(db, 'readonly', s => s.get(docKey(docType))); }
    catch (e) { return null; }
  }

  async function deleteDocBlob(docType) {
    try { const db = await docsDb(); await idbTx(db, 'readwrite', s => s.delete(docKey(docType))); } catch (e) {}
  }

  return {
    state, boot, saveProfile, saveLocal, uniById, score, sortedUnis,
    addToShortlist, removeFromShortlist, accept, toggleTask, addTask, scan, getScans, getUniversityDetail,
    login, signup, logout, notify,
    safeUserDocs, addUserDoc, deleteUserDoc, saveDocBlob, getDocBlob, deleteDocBlob,
  };
})();
