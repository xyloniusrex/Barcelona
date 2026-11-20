/* store.js — device state + thin API client. Core reusable data is cached by
 * the service worker; user data lives in the server DB and mirrors to
 * localStorage so the app still opens offline. */
const Store = (() => {
  const LS_KEY = 'poligo-state';
  const state = {
    userId: null,
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

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) Object.assign(state, JSON.parse(raw));
    } catch (e) { /* fresh device */ }
    if (!state.userId) {
      state.userId = (crypto.randomUUID && crypto.randomUUID()) || 'u-' + Math.random().toString(36).slice(2);
      saveLocal();
    }
  }

  function saveLocal() {
    const { userId, mode, user, mobility, tasks } = state;
    localStorage.setItem(LS_KEY, JSON.stringify({ userId, mode, user, mobility, tasks }));
    if (state.universities.length) {
      localStorage.setItem(LS_KEY + '-seed', JSON.stringify({ universities: state.universities, homeCourses: state.homeCourses }));
    }
  }

  async function api(path, opts) {
    const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
    if (!res.ok) throw new Error(path + ' -> ' + res.status);
    return res.status === 204 ? null : res.json();
  }

  async function boot() {
    loadLocal();
    // register the device user once
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: state.userId }),
    }).catch(() => {});

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
      const me = await api('/api/users/' + state.userId);
      state.user = me;
      state.mode = me.mode || 'explore';
      state.mobility = me.mobility;
      if (me.mobility) state.tasks = (await api('/api/mobilities/' + me.mobility.id)).tasks;
    } catch (e) { /* server unreachable — stay in local state */ }
    saveLocal();
    return state;
  }

  async function saveProfile(fields, mode) {
    state.user = Object.assign({}, state.user, fields, mode ? { mode } : {});
    if (mode) state.mode = mode;
    saveLocal();
    const body = Object.assign({ id: undefined }, fields, mode ? { mode } : {});
    try {
      await fetch('/api/users/' + state.userId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) { /* local-first; sync retried next boot */ }
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

  return {
    state, boot, saveProfile, saveLocal, uniById, score, sortedUnis,
    addToShortlist, removeFromShortlist, accept, toggleTask, addTask, scan, getScans, getUniversityDetail,
  };
})();
