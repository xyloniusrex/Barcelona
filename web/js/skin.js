/* skin.js - runtime skin for the PoliGo design. Loaded after app.js.
 *
 * app.js builds every screen as HTML strings and re-renders on each navigation.
 * Instead of touching it, a MutationObserver watches #app, #topBar and <body>
 * and re-applies a few idempotent touches after every render:
 *   - the PoliGo logo replaces .brand and the "poligo_" prompt in the top bar;
 *   - terminal leftovers are cleaned: "[ label ]" buttons, "> " headings and
 *     all-caps labels (sentence case), plus calendar arrows and legend;
 *   - the map screen gets an interactive globe (js/globe.js) above #filters.
 *
 * Rules of the road: never throw (app.js turns any uncaught error into its
 * fatal screen), never write a node unless its content really changes, and
 * mark the elements we rebuild with data-skin so a pass is a no-op the second
 * time around. Store and App are globals from the classic scripts.
 */
(() => {
  'use strict';

  const GLOBE_ID = 'skin-globe';
  const HOME = { name: 'Timișoara', lat: 45.75, lon: 21.21, iso3: 'ROU' };
  const THEME_COLOR = { dark: '#070B14', light: '#F4F6FB' };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------------------------------------------------------- logo */

  let uid = 0;
  // Same artwork as logoIcon() in the PoliGo repo (js/ui.js).
  function logoIcon(size) {
    const id = 'skin-lg' + (++uid);
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

  function skinBrand() {
    document.querySelectorAll('.brand:not([data-skin]), #topBar .prompt:not([data-skin])').forEach(el => {
      el.dataset.skin = '1';
      el.innerHTML = lockup(el.matches('.brand') ? 38 : 26);
    });
  }

  /* ----------------------------------------------------------- text clean-up */

  const KEEP = { UPT: 1, ECTS: 1, EHIC: 1, ID: 1, AI: 1, OS: 1, PDF: 1, SMS: 1 };
  const PROPER = { ERASMUS: 'Erasmus', TIMISOARA: 'Timisoara' };

  // ALL CAPS text -> sentence case. Anything that already has lowercase is left alone.
  function sentenceCase(s) {
    if (!/\p{Lu}{2}/u.test(s) || /\p{Ll}/u.test(s)) return s;
    const low = s.toLowerCase().replace(/\p{L}+/gu, w => { const u = w.toUpperCase(); return KEEP[u] ? u : (PROPER[u] || w); });
    return low.replace(/(^\s*|[.!?]\s+)(\p{Ll})/gu, (m, pre, c) => pre + c.toUpperCase());
  }

  function textNodes(el) {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
    return out;
  }

  const setData = (node, next) => { if (node.data !== next) node.data = next; };

  function caseNodes(el) {
    textNodes(el).forEach(n => setData(n, sentenceCase(n.data)));
  }

  // First letter up, but only on short status words (signed, pending, in 3 days...).
  function capFirst(el) {
    const n = textNodes(el).find(t => /\S/.test(t.data));
    if (n) setData(n, n.data.replace(/^(\s*)(\p{Ll})/u, (m, sp, c) => sp + c.toUpperCase()));
  }

  // "[ label ]" -> "label"
  function stripBrackets(el) {
    const nodes = textNodes(el).filter(t => /\S/.test(t.data));
    if (!nodes.length) return;
    setData(nodes[0], nodes[0].data.replace(/^(\s*)\[\s+/, '$1'));
    const last = nodes[nodes.length - 1];
    setData(last, last.data.replace(/\s+\](\s*)$/, '$1'));
  }

  // "> title" -> "title"
  function stripPrompt(el) {
    const n = textNodes(el).find(t => /\S/.test(t.data));
    if (n) setData(n, n.data.replace(/^(\s*)>\s+/, '$1'));
  }

  // "Shortlist +" -> [+] Shortlist
  function plusToIcon(btn) {
    if (typeof icon !== 'function') return;
    const nodes = textNodes(btn).filter(t => /\S/.test(t.data));
    const last = nodes[nodes.length - 1];
    if (last && /\s\+\s*$/.test(last.data)) {
      setData(last, last.data.replace(/\s*\+\s*$/, ''));
      btn.insertAdjacentHTML('afterbegin', icon('plus', 'inline-ico'));
    }
  }

  function skinCalNav(btn) {
    if (btn.dataset.skin || typeof icon !== 'function') return;
    btn.dataset.skin = '1';
    const next = btn.dataset.m === '1';
    btn.innerHTML = icon(next ? 'arrow-right' : 'arrow-left');
    btn.setAttribute('aria-label', next ? 'Next month' : 'Previous month');
  }

  function cleanText() {
    document.querySelectorAll('button').forEach(b => {
      if (b.classList.contains('cal-nav')) { skinCalNav(b); return; }
      stripBrackets(b);
      if (b.classList.contains('primary') || b.classList.contains('ghost')) { caseNodes(b); plusToIcon(b); }
    });
    document.querySelectorAll('h1, h2, h3').forEach(h => { stripPrompt(h); caseNodes(h); });
    document.querySelectorAll('.f-title, .cal-title').forEach(caseNodes);
    document.querySelectorAll('.pill.good, .pill.partial, .pill.none, .due').forEach(capFirst);

    const toast = document.getElementById('toast');
    if (toast) textNodes(toast).forEach(n => setData(n, n.data.replace(/\[\s*([^\]]*?)\s*\]/g, '$1').replace(/^\s*>\s+/, '')));

    // hero: second line of the headline in gold, like the PoliGo landing
    const h1 = document.querySelector('.hero h1');
    if (h1 && !h1.querySelector('em')) {
      const nodes = textNodes(h1).filter(t => /\S/.test(t.data));
      const last = nodes.length > 1 && nodes[nodes.length - 1];
      if (last) {
        const em = document.createElement('em');
        last.parentNode.replaceChild(em, last);
        em.appendChild(last);
      }
    }
  }

  /* ------------------------------------------ calendar legend / dev code / steps */

  // "* = deadline  + = task  box = Available  shade = Away" -> swatches
  function skinLegend() {
    document.querySelectorAll('.cal-legend:not([data-skin])').forEach(el => {
      const parts = [];
      el.textContent.replace(/(\*|\+|box|shade)\s*=\s*(.+?)(?=\s+(?:\*|\+|box|shade)\s*=|\s*$)/g, (m, key, label) => {
        parts.push([{ '*': 'dl', '+': 'task', box: 'avail', shade: 'away' }[key], label.trim()]);
        return m;
      });
      el.dataset.skin = '1';
      if (parts.length < 2) return;
      el.textContent = '';
      parts.forEach(([kind, label]) => {
        const item = document.createElement('span');
        item.className = 'lg';
        const sw = document.createElement('i');
        sw.className = 'sw ' + kind;
        item.append(sw, label);
        el.appendChild(item);
      });
    });
  }

  // "... DEV CODE: 123456" -> label + big code
  function skinDevCode() {
    const el = document.getElementById('a-devcode');
    if (!el || el.querySelector('.dev-code')) return;
    const m = /^([\s\S]*?DEV CODE:?)\s*(\d{4,8})\s*$/i.exec(el.textContent);
    if (!m) return;
    const code = document.createElement('b');
    code.className = 'dev-code';
    code.textContent = m[2];
    el.textContent = m[1];
    el.appendChild(code);
  }

  // "SETUP 2/4 - PROJECTS" -> segmented progress bar above the label
  function skinSteps() {
    const label = document.getElementById('ob-step');
    if (!label) return;
    const m = /(\d+)\s*\/\s*(\d+)/.exec(label.textContent);
    if (!m) return;
    const cur = +m[1], total = +m[2];
    let bar = label.previousElementSibling;
    if (!bar || !bar.classList.contains('skin-steps')) {
      bar = document.createElement('div');
      bar.className = 'skin-steps';
      label.parentNode.insertBefore(bar, label);
    }
    if (bar.children.length !== total) {
      bar.textContent = '';
      for (let i = 0; i < total; i++) bar.appendChild(document.createElement('i'));
    }
    Array.prototype.forEach.call(bar.children, (seg, i) => seg.classList.toggle('on', i < cur));
  }

  /* ------------------------------------------------------------------ globe */

  // Label offsets so the city names do not collide around Austria / Belgium.
  const LABEL_POS = {
    stpolten: { anchor: 'end', dx: -10, dy: 16 },
    leuven: { anchor: 'end', dx: -10, dy: -2 },
    vidzeme: { anchor: 'end', dx: -10, dy: 4 },
  };

  function tier(u) {
    const s = u.summary || {};
    const f = s.total ? s.matched / s.total : 0;
    return f >= 0.6 ? 'good' : f >= 0.3 ? 'partial' : 'weak';
  }

  function visibleUnis() {
    const { lang, country } = Store.state.filters || {};
    return Store.sortedUnis().filter(u =>
      typeof u.lat === 'number' && typeof u.lng === 'number' &&
      (!lang || (u.languages || []).includes(lang)) &&
      (!country || u.country === country));
  }

  function buildPoints(colors) {
    const unis = visibleUnis();
    const points = unis.map((u, i) => Object.assign({
      id: u.id, lon: u.lng, lat: u.lat, color: colors[tier(u)],
      label: u.city, showLabel: i < 4, clickable: true,
    }, LABEL_POS[u.id] || {}));
    points.push({ id: null, lon: HOME.lon, lat: HOME.lat, color: colors.cyan, r: 4, pulse: true, label: HOME.name, showLabel: true, dx: 6, dy: 18, clickable: false });
    return { unis, points };
  }

  function showTip(box, tip, globe, p) {
    if (!p || !p.id) { tip.hidden = true; return; }
    const u = Store.uniById(p.id);
    if (!u) { tip.hidden = true; return; }
    const s = u.summary || { matched: 0, total: 0, ects_covered: 0 };
    tip.innerHTML = '<b>' + esc(u.name) + '</b><span>' + esc(u.city) + ', ' + esc(u.country) + '</span>' +
      '<em>' + s.matched + '/' + s.total + ' · ' + (s.ects_covered || 0) + ' ECTS</em>';
    const xy = globe.proj([p.lon, p.lat]) || [0, 0];
    const x = Math.max(95, Math.min(box.clientWidth - 95, xy[0]));
    tip.style.left = x + 'px';
    tip.style.top = xy[1] + 'px';
    tip.classList.toggle('below', xy[1] < 120);
    tip.hidden = false;
  }

  function createGlobe(anchor) {
    const { Globe, COLORS } = window.PoliGlobe;
    const box = document.createElement('div');
    box.className = 'globe-box';
    box.id = GLOBE_ID;
    box.innerHTML = '<div class="legend" aria-hidden="true">' +
      '<span><i style="background:' + COLORS.good + '"></i>≥60%</span>' +
      '<span><i style="background:' + COLORS.partial + '"></i>≥30%</span>' +
      '<span><i style="background:' + COLORS.weak + '"></i>&lt;30%</span></div>' +
      '<div class="tooltip" hidden></div>';
    anchor.parentNode.insertBefore(box, anchor);
    const tip = box.querySelector('.tooltip');
    const globe = new Globe(box, {
      center: [12, 49],
      radius: (w, h) => Math.max(w, h) * 0.95,
      touchAction: 'pan-y',          // vertical swipes still scroll the page
      label: 'Globe with partner universities',
      onClick: p => { if (p && p.id) { Store.state.activeUniId = p.id; App.go('uni'); } },
      onHover: p => showTip(box, tip, globe, p),
    });
    globe.setHighlights([{ iso3: HOME.iso3, color: COLORS.cyan, alpha: 0.3 }]);
    box._globe = globe;
    box._sig = '';
    return box;
  }

  function syncGlobe() {
    const anchor = document.getElementById('filters');
    if (Store.state.screen !== 'map' || !anchor) return;
    if (!window.PoliGlobe || !window.d3 || !window.d3.geoOrthographic) return;
    if (!Store.state.universities || !Store.state.universities.length) return;
    let box = document.getElementById(GLOBE_ID);
    if (!box) box = createGlobe(anchor);
    const { unis, points } = buildPoints(window.PoliGlobe.COLORS);
    const sig = unis.map(u => u.id + ':' + tier(u)).join('|');
    if (sig !== box._sig) {          // only touch the globe when the data changed
      box._sig = sig;
      box._globe.setPoints(points);
    }
  }

  /* ------------------------------------------------------------ chrome / glue */

  function syncChrome() {
    const body = document.body;
    const screen = (Store.state && Store.state.screen) || '';
    if (body.dataset.screen !== screen) body.dataset.screen = screen;
    const top = document.getElementById('topBar');
    const bar = top && !top.hidden ? 'on' : 'off';
    if (body.dataset.topbar !== bar) body.dataset.topbar = bar;
  }

  function syncThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const color = THEME_COLOR[document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'];
    if (meta.content !== color) meta.content = color;
  }

  const STEPS = [syncChrome, skinBrand, cleanText, skinLegend, skinDevCode, skinSteps, syncGlobe, syncThemeColor];

  function apply() {
    // each step is isolated: one failing never blocks the others, never throws
    STEPS.forEach(step => { try { step(); } catch (err) { console.warn('[skin]', step.name, err); } });
  }

  const insideGlobe = node => {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(el && el.closest && el.closest('.globe-box'));
  };

  function start() {
    const obs = new MutationObserver(records => {
      if (records.every(r => r.type !== 'attributes' && insideGlobe(r.target))) return; // tooltip churn
      apply();
      obs.takeRecords();             // drop the mutations we just made ourselves
    });
    const opts = { childList: true, subtree: true, characterData: true };
    [document.getElementById('app'), document.getElementById('topBar'), document.body]
      .forEach(node => { if (node) obs.observe(node, opts); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    apply();                          // catch up if the first render already happened
    obs.takeRecords();
  }

  try { start(); } catch (err) { console.warn('[skin] disabled:', err); }
})();
