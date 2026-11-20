/* globe.js — 2D canvas orthographic globe, the persistent background layer.
 * Dark sphere, faint graticule, country polygons from Natural Earth 110m,
 * Romania in accent, partner points, journey arc with animated dashes.
 * Mirrors the geometry of the server's Pillow renderer. */
const Globe = (() => {
  const TIMISOARA = { lat: 45.75, lng: 21.23 };
  const COLORS = {
    bg: '#070B14', sphere: '#0B1220', border: '#24304D', graticule: 'rgba(36,48,77,0.55)',
    land: 'rgba(233,238,248,0.03)', stroke: 'rgba(148,160,188,0.25)',
    explore: '#38BDF8', journey: '#FBBF24', good: '#34D399', partial: '#FB923C', none: '#F87171',
  };

  const S = {
    canvas: null, ctx: null, features: [], ready: false,
    cam: { lat: 47, lng: 15 }, drag: null, autoRotate: false, raf: null,
    points: [], arcs: [], pulses: [], onTap: null, accent: ['#38BDF8', 0.35], destCountry: null,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };

  function rot(lat, lng, camLat, camLng) {
    const la = lat * Math.PI / 180, lo = (lng - camLng) * Math.PI / 180, cl = camLat * Math.PI / 180;
    const ca = Math.cos(la), sa = Math.sin(la);
    const clo = Math.cos(lo), slo = Math.sin(lo);
    const ccl = Math.cos(cl), scl = Math.sin(cl);
    return { x: ca * clo, y: sa * ccl - ca * slo * scl, z: sa * scl + ca * slo * ccl };
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    S.canvas.width = innerWidth * dpr;
    S.canvas.height = innerHeight * dpr;
  }

  let geojson = null;
  async function preload() {
    const res = await fetch('/data/countries-110m.geojson');
    geojson = await res.json();
  }

  function init(canvasId, onTap) {
    S.canvas = document.getElementById(canvasId);
    S.ctx = S.canvas.getContext('2d');
    S.onTap = onTap;
    resize();
    addEventListener('resize', resize);

    S.canvas.addEventListener('pointerdown', e => {
      S.autoRotate = false;
      S.drag = { x: e.clientX, y: e.clientY, lng: S.cam.lng, lat: S.cam.lat };
    });
    addEventListener('pointermove', e => {
      if (!S.drag) return;
      const r = globeRadius();
      S.cam.lng = S.drag.lng + (e.clientX - S.drag.x) * 0.35 / (r / 90);
      S.cam.lat = Math.max(-80, Math.min(80, S.drag.lat + (e.clientY - S.drag.y) * 0.35 / (r / 90)));
    });
    addEventListener('pointerup', () => { S.drag = null; });
    S.canvas.addEventListener('click', e => {
      if (!S.onTap) return;
      const hit = hitTest(e.clientX * (S.canvas.width / innerWidth), e.clientY * (S.canvas.height / innerHeight));
      if (hit) S.onTap(hit);
    });

    const start = () => { S.ready = true; };
    if (geojson) start();
    else preload().then(start).catch(() => { S.ready = true; });

    if (!S.raf) loop();
  }

  let W = 0, H = 0;
  function globeRadius() {
    return Math.min(W, H) * 0.42;
  }

  function project(cam, lat, lng, W_, H_) {
    const r = Math.min(W_, H_) * 0.42;
    const v = rot(lat, lng, cam.lat, cam.lng);
    return v.z > 0 ? { x: W_ / 2 + r * v.x, y: H_ / 2 - r * v.y, visible: true } : { visible: false };
  }

  function hitTest(px, py) {
    const r = globeRadius();
    for (const p of S.points) {
      const q = project(S.cam, p.lat, p.lng, W, H);
      if (!q.visible) continue;
      const dx = px - q.x, dy = py - q.y;
      if (dx * dx + dy * dy < Math.pow(Math.max(14, 6 + p.radius * r * 2), 2)) return p;
    }
    return null;
  }

  function setPoints(points) { S.points = points; }
  function setArcs(arcs) { S.arcs = arcs; }
  function setPulses(pulses) { S.pulses = pulses; }
  function setDestination(country) { S.destCountry = country; }
  function setAutoRotate(v) { S.autoRotate = v && !S.reducedMotion; }
  function focusTo(lat, lng) { S.cam = { lat, lng }; }

  function drawCountry(ctx, poly, cx, cy, r) {
    for (const ring of poly) {
      ctx.beginPath();
      let started = false, prevZ = false;
      for (const [lng, lat] of ring) {
        const v = rot(lat, lng, S.cam.lat, S.cam.lng);
        if (v.z <= 0) { started = false; prevZ = false; continue; }
        const px = cx + r * v.x, py = cy - r * v.y;
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
        prevZ = true;
      }
      ctx.closePath();
    }
  }

  const t0 = performance.now();
  function loop() {
    S.raf = requestAnimationFrame(loop);
    if (!S.canvas) return;
    const ctx = S.ctx;
    W = S.canvas.width; H = S.canvas.height;
    const t = (performance.now() - t0) / 1000;

    if (S.autoRotate && !S.drag) S.cam.lng += 0.02;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    const r = globeRadius(), cx = W / 2, cy = H / 2;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.sphere;
    ctx.fill();

    if (!S.ready || !geojson) { requestAnimationFrame(loop); return; }

    // graticule
    ctx.strokeStyle = COLORS.graticule;
    ctx.lineWidth = Math.max(0.5, r / 400);
    for (let lng = -180; lng < 180; lng += 20) {
      ctx.beginPath();
      let started = false;
      for (let lat = -88; lat <= 88; lat += 4) {
        const q = project(S.cam, lat, lng + S.cam.lng, W, H);
        if (!q.visible) { started = false; continue; }
        started ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
        started = true;
      }
      ctx.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 20) {
      ctx.beginPath();
      let started = false;
      for (let lng = -180; lng <= 180; lng += 4) {
        const q = project(S.cam, lat, lng + S.cam.lng, W, H);
        if (!q.visible) { started = false; continue; }
        started ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
        started = true;
      }
      ctx.stroke();
    }

    // countries
    for (const f of geojson.features) {
      const name = f.properties.name;
      const isRO = name === 'Romania';
      const isDst = S.destCountry && name === S.destCountry;
      for (const poly of f.geometry.coordinates) {
        drawCountry(ctx, poly, cx, cy, r);
        if (isRO || isDst) {
          ctx.fillStyle = isRO ? hexA(S.accent[0], S.accent[1]) : hexA(COLORS.journey, 0.35);
          ctx.fill('evenodd');
        } else {
          ctx.fillStyle = COLORS.land;
          ctx.fill('evenodd');
        }
        ctx.strokeStyle = COLORS.stroke;
        ctx.lineWidth = Math.max(0.5, r / 500);
        ctx.stroke();
      }
    }

    // atmosphere
    const atmo = ctx.createRadialGradient(cx, cy, r, cx, cy, r * 1.06);
    atmo.addColorStop(0, hexA(S.accent[0], 0.18));
    atmo.addColorStop(1, 'transparent');
    ctx.fillStyle = atmo;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.06, 0, Math.PI * 2); ctx.fill();

    // Timisoara pulsing point
    const home = project(S.cam, TIMISOARA.lat, TIMISOARA.lng, W, H);
    if (home.visible) {
      const pr = r * 0.012 * (1 + 0.4 * Math.sin(t * 3));
      ctx.fillStyle = S.accent[0];
      ctx.beginPath(); ctx.arc(home.x, home.y, pr, 0, Math.PI * 2); ctx.fill();
      const ring = r * 0.03 * (1 + Math.sin(t * 2));
      ctx.strokeStyle = hexA(S.accent[0], 0.5);
      ctx.beginPath(); ctx.arc(home.x, home.y, ring, 0, Math.PI * 2); ctx.stroke();
    }

    // partner points
    for (const p of S.points) {
      const q = project(S.cam, p.lat, p.lng, W, H);
      if (!q.visible) continue;
      const pr = Math.max(2.5, (0.008 + 0.014 * p.radius) * r);
      ctx.fillStyle = COLORS[p.color] || S.accent[0];
      ctx.beginPath(); ctx.arc(q.x, q.y, pr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hexA(COLORS[p.color] || S.accent[0], 0.4);
      ctx.beginPath(); ctx.arc(q.x, q.y, pr + 2 + Math.sin(t * 2 + q.x) * 1, 0, Math.PI * 2); ctx.stroke();
    }

    // arcs with animated dashes + destination pulses
    for (const arc of S.arcs) {
      const pts = greatCircle(arc.from, arc.to, 72);
      ctx.setLineDash([r * 0.12, r * 0.06]);
      ctx.lineDashOffset = -(t * 40) % (r * 0.18);
      ctx.lineWidth = 2;
      let prev = null;
      pts.forEach((ll, i) => {
        const q = project(S.cam, ll[0], ll[1], W, H);
        if (!q.visible) { prev = null; return; }
        if (prev) {
          const f = i / pts.length;
          ctx.strokeStyle = mixHex(COLORS.explore, COLORS.journey, f);
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
        prev = q;
      });
      ctx.setLineDash([]);
    }
    for (const p of S.pulses) {
      const q = project(S.cam, p.lat, p.lng, W, H);
      if (!q.visible) continue;
      const rf = (t * 0.8 + (p.phase || 0)) % 1;
      ctx.strokeStyle = hexA(COLORS.journey, 0.8 * (1 - rf));
      ctx.beginPath(); ctx.arc(q.x, q.y, r * 0.03 + rf * r * 0.12, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = COLORS.journey;
      ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }

  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function greatCircle(a, b, n) {
    const va = sph(a.lat, a.lng), vb = sph(b.lat, b.lng);
    let dot = va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2];
    dot = Math.max(-1, Math.min(1, dot));
    const omega = Math.acos(dot);
    if (omega < 1e-6) return [[a.lat, a.lng], [b.lat, b.lng]];
    const so = Math.sin(omega);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const k1 = Math.sin((1 - f) * omega) / so, k2 = Math.sin(f * omega) / so;
      const v = [k1 * va[0] + k2 * vb[0], k1 * va[1] + k2 * vb[1], k1 * va[2] + k2 * vb[2]];
      const nl = Math.hypot(v[0], v[1], v[2]) || 1;
      const lat = Math.asin(Math.max(-1, Math.min(1, v[1] / nl))) * 180 / Math.PI;
      const lng = Math.atan2(v[2] / nl, v[0] / nl) * 180 / Math.PI;
      pts.push([lat, lng]);
    }
    return pts;
  }

  function sph(lat, lng) {
    const la = lat * Math.PI / 180, lo = lng * Math.PI / 180;
    return [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
  }

  function mixHex(h1, h2, f) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const c = i => Math.round(((a >> i) & 255) * (1 - f) + ((b >> i) & 255) * f);
    return `rgb(${c(16)},${c(8)},${c(0)})`;
  }

  return { init, preload, setPoints, setArcs, setPulses, setDestination, setAutoRotate, focusTo, _s: S };
})();
