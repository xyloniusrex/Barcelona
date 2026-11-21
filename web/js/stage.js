/* stage.js - every globe scene of the app, built on globe.js (window.PoliGlobe).
 *
 *  - background   a quiet planet behind every screen. Before a university is
 *                 chosen it is Europe with Romania lit; afterwards it frames
 *                 Romania and the partner country side by side (setDestination).
 *  - mapGlobe     the interactive globe above the university list on the Map.
 *  - homeGlobe    the big globe on the Home screen (both countries + the arc,
 *                 or every partner when nothing is chosen yet).
 *  - introGlobe   the journey intro: starts on Timisoara, flies to frame both
 *                 countries and draws the arc.
 *
 * Needs vendor/d3-array, vendor/d3-geo, js/globe.js and js/store.js loaded first.
 * Every entry point is a no-op (returns null) when the libraries are missing, so
 * the rest of the app keeps working without a globe.
 */
const Stage = (() => {
  'use strict';

  const HOME = { name: 'Timișoara', lat: 45.75, lon: 21.21, iso3: 'ROU' };
  const ISO3 = {
    RO: 'ROU', AT: 'AUT', PT: 'PRT', BE: 'BEL', LV: 'LVA', NL: 'NLD', DE: 'DEU', FI: 'FIN', HU: 'HUN',
    ES: 'ESP', IT: 'ITA', FR: 'FRA', PL: 'POL', CZ: 'CZE', SK: 'SVK', SE: 'SWE', DK: 'DNK', IE: 'IRL',
    GR: 'GRC', BG: 'BGR', HR: 'HRV', SI: 'SVN', LT: 'LTU', EE: 'EST', NO: 'NOR', CH: 'CHE', TR: 'TUR',
  };
  const WINDOW_RADIUS = (w, h) => Math.min(Math.max(w, h) * 1.1, w * 1.8);

  const ready = () => !!(window.PoliGlobe && window.d3 && window.d3.geoOrthographic);
  const isLight = () => document.documentElement.dataset.theme === 'light';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = (k, v) => (window.Store ? Store.t(k, v) : k);

  const homeLL = () => [HOME.lon, HOME.lat];
  const uniLL = u => [u.lng, u.lat];

  function colors(light) {
    return light ? { home: '#0369A1', dest: '#B45309' } : { home: '#38BDF8', dest: '#FBBF24' };
  }

  /* Where to look and how close, so Timisoara and the university share the view:
   * the two sit about `spread` * width either side of the centre. */
  function view(g, uni, spread) {
    if (!uni) return { center: [17, 47.5], zoom: 1 };
    const a = homeLL(), b = uniLL(uni);
    const mid = window.d3.geoInterpolate(a, b)(0.5);
    const half = Math.max(window.d3.geoDistance(a, b) / 2, 0.05);
    const radius = (g.w * spread) / Math.sin(half);
    return { center: mid, zoom: clamp(radius / g.o.radius(g.w, g.h), 0.45, 3.4) };
  }

  /* Paint "Romania (+ the partner country)" on a globe. */
  function scene(g, uni, o) {
    o = Object.assign({ animate: false, spread: 0.3, light: false, pulse: true, labels: true, arc: true }, o);
    const c = colors(o.light);
    const code = uni && ISO3[uni.country_code];
    const hl = [{ iso3: HOME.iso3, color: c.home, alpha: o.light ? 0.24 : 0.3 }];
    if (code) hl.push({ iso3: code, color: c.dest, alpha: o.light ? 0.3 : 0.42 });
    const pts = [{
      lon: HOME.lon, lat: HOME.lat, color: c.home, r: 4, pulse: o.pulse && !uni,
      label: o.labels ? HOME.name : null, showLabel: o.labels, anchor: 'middle', dx: 0, dy: 20,
    }];
    if (uni) {
      pts.push({
        lon: uni.lng, lat: uni.lat, color: c.dest, r: 5, pulse: o.pulse,
        label: o.labels ? uni.city : null, showLabel: o.labels, anchor: 'middle', dx: 0, dy: 22,
      });
    }
    g.setHighlights(hl);
    g.setPoints(pts);
    g.setArc(uni && o.arc ? { from: homeLL(), to: uniLL(uni) } : null);
    // The zoom depends on the box size, which is unknown while the element is still
    // detached (Home builds its globe before it is attached): re-frame on every resize.
    g.onResize = () => { const r = view(g, uni, o.spread); g.jumpTo(r.center, r.zoom); };
    const v = view(g, uni, o.spread);
    if (!o.animate) { g.jumpTo(v.center, v.zoom); return Promise.resolve(); }
    return g.flyTo(v.center, v.zoom, 1300);
  }

  /* --------------------------------------------------------------- background */

  let bg = null;
  let bgUni = null;
  let bgKey = '\0';

  function init() {
    if (bg || !ready()) return;
    try {
      const el = document.createElement('div');
      el.id = 'stage';
      el.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(el, document.body.firstChild);
      bg = new window.PoliGlobe.Globe(el, {
        interactive: false, static: true, theme: isLight() ? 'light' : 'dark',
        center: [17, 47.5], radius: (w, h) => Math.max(w, h) * 0.95,
      });
      paintBackground(false);
      new MutationObserver(() => paintBackground(false)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (err) {
      bg = null;
      console.warn('[stage] background disabled:', err);
    }
  }

  function paintBackground(animate) {
    if (!bg) return;
    bg.setTheme(isLight() ? 'light' : 'dark');
    scene(bg, bgUni, { animate, spread: 0.28, light: isLight(), pulse: false });
  }

  /* uni = the chosen / accepted university, or null for the plain planet. */
  function setDestination(uni) {
    if (!bg) return;
    const key = uni ? uni.id : '';
    if (key === bgKey) return;
    const first = bgKey === '\0';
    bgKey = key;
    bgUni = uni || null;
    paintBackground(!first);
  }

  /* --------------------------------------------------------------- map / home */

  // label offsets so the city names do not collide around Austria / Benelux / Germany
  const LABEL_POS = {
    stpolten: { anchor: 'end', dx: -10, dy: 16 },
    leuven: { anchor: 'end', dx: -10, dy: -2 },
    vidzeme: { anchor: 'end', dx: -10, dy: 4 },
    saxion: { anchor: 'end', dx: -10, dy: -6 },
    fulda: { anchor: 'start', dx: 10, dy: -4 },
    mate: { anchor: 'start', dx: 10, dy: 12 },
    jamk: { anchor: 'end', dx: -10, dy: 4 },
  };

  function tier(u) {
    const s = u.summary || {};
    const f = s.total ? s.matched / s.total : 0;
    return f >= 0.6 ? 'good' : f >= 0.3 ? 'partial' : 'weak';
  }

  // Mirrors app.js's REGIONS table so the globe highlights the same universities
  // the list below it shows when the region filter is active.
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

  function visibleUnis() {
    const { lang, country, region, quality } = Store.state.filters || {};
    return Store.sortedUnis().filter(u =>
      typeof u.lat === 'number' && typeof u.lng === 'number' &&
      (!lang || (u.languages || []).includes(lang)) &&
      (!country || u.country === country) &&
      (!region || regionOf(u.country) === region) &&
      (!quality || tier(u) === quality));
  }

  function partnerPoints(unis, labelFirst, pulseHome = true) {
    const COLORS = window.PoliGlobe.COLORS;
    const pts = unis.map((u, i) => Object.assign({
      id: u.id, lon: u.lng, lat: u.lat, color: COLORS[tier(u)],
      label: u.city, showLabel: i < labelFirst, clickable: true,
    }, LABEL_POS[u.id] || {}));
    // a pulsing marker forces a locked-down, non-draggable globe (the Map screen)
    // to keep redrawing every frame - only animate it where that is the point (Home).
    pts.push({ id: null, lon: HOME.lon, lat: HOME.lat, color: COLORS.cyan, r: 4, pulse: pulseHome, label: HOME.name, showLabel: true, dx: 6, dy: 18, clickable: false });
    return pts;
  }

  function showTip(box, tip, globe, p) {
    const u = p && p.id && Store.uniById(p.id);
    if (!u) { tip.hidden = true; return; }
    const s = u.summary || { matched: 0, total: 0, ects_covered: 0 };
    tip.innerHTML = '<b>' + esc(u.name) + '</b><span>' + esc(u.city) + ', ' + esc(T(u.country)) + '</span>' +
      '<em>' + s.matched + '/' + s.total + ' · ' + (s.ects_covered || 0) + ' ECTS</em>';
    const xy = globe.proj([p.lon, p.lat]) || [0, 0];
    tip.style.left = Math.max(95, Math.min(box.clientWidth - 95, xy[0])) + 'px';
    tip.style.top = xy[1] + 'px';
    tip.classList.toggle('below', xy[1] < 120);
    tip.hidden = false;
  }

  /* The Map screen's globe: a fixed, locked-down view of Europe - no drag, no
   * zoom, no pulsing marker - so it only redraws when the point list changes
   * or something is hovered, instead of looping a full redraw every frame. */
  function mapGlobe(anchor, onPick) {
    if (!ready()) return null;
    const { Globe, COLORS } = window.PoliGlobe;
    const box = document.createElement('div');
    box.className = 'globe-box';
    box.id = 'map-globe';
    box.innerHTML = '<div class="legend" aria-hidden="true">' +
      '<span><i style="background:' + COLORS.good + '"></i>≥60%</span>' +
      '<span><i style="background:' + COLORS.partial + '"></i>≥30%</span>' +
      '<span><i style="background:' + COLORS.weak + '"></i>&lt;30%</span></div>' +
      '<div class="tooltip" hidden></div>';
    anchor.parentNode.insertBefore(box, anchor);
    const tip = box.querySelector('.tooltip');
    const globe = new Globe(box, {
      center: [14, 49], theme: isLight() ? 'light' : 'dark',
      radius: (w, h) => Math.max(w, h) * 0.95,
      drag: false, static: true, touchAction: 'auto',
      label: T('Map of Europe with partner universities'),
      onClick: p => { if (p && p.id && onPick) onPick(p.id); },
      onHover: p => showTip(box, tip, globe, p),
    });
    globe.setHighlights([{ iso3: HOME.iso3, color: COLORS.cyan, alpha: 0.3 }]);
    box._globe = globe;
    box._sig = '';
    return box;
  }

  function syncMap(box) {
    if (!box || !box._globe) return;
    const unis = visibleUnis();
    const sig = unis.map(u => u.id + ':' + tier(u)).join('|');
    if (sig === box._sig) return;
    box._sig = sig;
    box._globe.setPoints(partnerPoints(unis, 4, false));
  }

  /* The globe on the Home screen. `uni` chosen -> both countries and the arc;
   * nothing chosen -> Europe with every partner as a clickable dot. */
  function homeGlobe(box, uni, onPick) {
    if (!ready()) return null;
    const { Globe, COLORS } = window.PoliGlobe;
    const g = new Globe(box, {
      radius: WINDOW_RADIUS, halo: uni ? COLORS.gold : COLORS.cyan, touchAction: 'pan-y', theme: isLight() ? 'light' : 'dark',
      label: T('Globe showing Romania and your destination'),
      onClick: p => { if (p && p.id && onPick) onPick(p.id); },
    });
    if (uni) {
      scene(g, uni, { spread: 0.3, light: isLight() });
    } else {
      g.setHighlights([{ iso3: HOME.iso3, color: COLORS.cyan, alpha: 0.3 }]);
      g.setPoints(partnerPoints(visibleUnisAll(), 3));
      g.jumpTo([15, 49], 1.2);
    }
    return g;
  }

  const visibleUnisAll = () => Store.sortedUnis().filter(u => typeof u.lat === 'number' && typeof u.lng === 'number');

  /* ------------------------------------------------------------------- intro */

  /* Returns { play(onStep) } - the caller owns the captions, the globe owns the
   * camera: close on Timisoara -> fly to frame both -> draw the arc. */
  function introGlobe(box, uni) {
    if (!ready()) return null;
    const g = new window.PoliGlobe.Globe(box, { radius: WINDOW_RADIUS, interactive: false, halo: window.PoliGlobe.COLORS.gold });
    scene(g, uni, { arc: false, animate: false, spread: 0.28 });
    g.onResize = null;                       // the intro drives the camera itself
    g.jumpTo([HOME.lon, HOME.lat - 2], 1.7);
    let cancelled = false;
    return {
      globe: g,
      async play(onStep) {
        onStep(1);
        await wait(2200);   // long enough to read "You are here" before the camera moves
        if (cancelled) return;
        onStep(2);
        const v = view(g, uni, 0.28);
        await g.flyTo(v.center, v.zoom, 1500);
        if (cancelled) return;
        await g.setArc({ from: homeLL(), to: uniLL(uni) }, { animate: true, duration: 1300 });
        if (cancelled) return;
        onStep(3);
      },
      finish() {
        cancelled = true;
        const v = view(g, uni, 0.28);
        g.jumpTo(v.center, v.zoom);
        g.setArc({ from: homeLL(), to: uniLL(uni) });
      },
    };
  }

  return { HOME, init, setDestination, mapGlobe, syncMap, homeGlobe, introGlobe, ready };
})();
