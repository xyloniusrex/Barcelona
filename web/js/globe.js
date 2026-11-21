/* globe.js - interactive canvas globe (d3-geo orthographic projection).
 * Copied from the PoliGo design repo (github.com/PavelCsako/PoliGo, js/globe.js)
 * and adapted as a classic script: the `export`s are gone and the API hangs off
 * window.PoliGlobe = { Globe, COLORS, loadWorld, PALETTES }. Needs
 * vendor/d3-array.min.js and vendor/d3-geo.min.js loaded first.
 * Changes vs upstream: the IIFE wrapper, the absolute data path (the app is
 * served from "/"), a light palette, jumpTo() and `static` globes that only
 * redraw when something changed (used for the page background).
 */
(() => {
const d3 = window.d3;

const COLORS = { cyan: '#38BDF8', gold: '#FBBF24', good: '#34D399', partial: '#FB923C', weak: '#7C87A6' };

let worldPromise = null;
function loadWorld() {
  worldPromise ??= fetch('/data/countries.geo.json').then(r => r.json()).catch(() => ({ type: 'FeatureCollection', features: [] }));
  return worldPromise;
}

// Colours the globe is painted with. "dark" is the space-window look used on the
// map, home and intro screens; "light" is for the page background in light theme.
const PALETTES = {
  dark: { sphere: ['#16263F', '#0C1526', '#060A12'], graticule: 'rgba(148,160,188,0.10)', land: 'rgba(233,238,248,0.065)', border: 'rgba(148,160,188,0.36)', labelFill: '#E9EEF8', labelStroke: 'rgba(7,11,20,0.8)' },
  light: { sphere: ['#FBFDFF', '#E6EDF9', '#CFDBEF'], graticule: 'rgba(30,41,59,0.10)', land: 'rgba(15,23,42,0.08)', border: 'rgba(51,65,85,0.42)', labelFill: '#0B1220', labelStroke: 'rgba(244,246,251,0.92)' },
};

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Globe {
  constructor(container, opts = {}) {
    this.el = container;
    this.o = {
      center: [12, 48], zoom: 1, minZoom: 0.45, maxZoom: 4,
      radius: (w, h) => Math.max(w, h) * 0.95, offsetY: 0,
      autoRotate: 0, interactive: true, drag: true, touchAction: 'none', halo: COLORS.cyan,
      static: false, theme: 'dark', ...opts,
    };
    this.palette = PALETTES[this.o.theme === 'light' ? 'light' : 'dark'];
    this.dirty = true;
    this.rotate = [-this.o.center[0], -this.o.center[1], 0];
    this.zoom = this.o.zoom;
    this.points = []; this.highlights = []; this.arc = null; this.arcProgress = 1;
    this.hover = null; this.vel = [0, 0]; this.pointers = new Map(); this.idleUntil = 0; this.anim = null;
    this.onClick = opts.onClick ?? null; this.onHover = opts.onHover ?? null;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'globe-canvas';
    this.canvas.style.touchAction = this.o.touchAction;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', opts.label ?? 'Globe with partner universities');
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.proj = d3.geoOrthographic().clipAngle(90).precision(0.4);
    this.path = d3.geoPath(this.proj, this.ctx);
    this.graticule = d3.geoGraticule().step([15, 15])();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    if (this.o.interactive) this.bind();
    loadWorld().then(w => { this.world = w; this.byIso = new Map(w.features.map(f => [f.id, f])); this.dirty = true; });
    this.running = true;
    const tick = now => { if (!this.running) return; if (!this.canvas.isConnected) return this.destroy(); this.frame(now); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  destroy() { this.running = false; this.ro.disconnect(); }

  resize() {
    const r = this.el.getBoundingClientRect();
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px';
    this.dirty = true;
    this.onResize?.();   // scenes that frame by size (js/stage.js) re-frame here
  }

  // Redraw on the next frame. Static globes (page background) only draw when asked.
  invalidate() { this.dirty = true; }

  setTheme(theme) {
    this.palette = PALETTES[theme === 'light' ? 'light' : 'dark'];
    this.dirty = true;
  }

  // Jump (no animation) to a view.
  jumpTo([lon, lat], zoom = this.zoom) {
    this.anim = null;
    this.rotate = [-lon, -lat, 0]; this.zoom = zoom; this.dirty = true;
  }

  get radius() { return this.o.radius(this.w, this.h) * this.zoom; }
  get center() { return [-this.rotate[0], -this.rotate[1]]; }

  setPoints(points) { this.points = points; this.dirty = true; }
  setHighlights(h) { this.highlights = h; this.dirty = true; }
  setArc(arc, { animate = false, duration = 1400 } = {}) {
    this.arc = arc; this.dirty = true;
    if (!arc || !animate) { this.arcProgress = 1; return Promise.resolve(); }
    this.arcProgress = 0;
    return this.tween(duration, t => { this.arcProgress = t; });
  }

  flyTo([lon, lat], zoom = this.zoom, duration = 1400) {
    const from = this.center, z0 = this.zoom, interp = d3.geoInterpolate(from, [lon, lat]);
    return this.tween(duration, t => { const c = interp(t); this.rotate = [-c[0], -c[1], 0]; this.zoom = z0 + (zoom - z0) * t; });
  }

  tween(duration, fn) {
    return new Promise(resolve => {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { fn(1); return resolve(); }
      const t0 = performance.now();
      this.anim = now => { const t = clamp((now - t0) / duration, 0, 1); fn(ease(t)); if (t >= 1) { this.anim = null; resolve(); } };
    });
  }

  bind() {
    const c = this.canvas;
    const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, pos(e));
      this.down = { p: pos(e), moved: 0, t: performance.now() };
      this.vel = [0, 0]; this.idleUntil = performance.now() + 4000; this.anim = null;
      if (this.o.drag) c.classList.add('grabbing');
    });
    c.addEventListener('pointermove', e => {
      const p = pos(e);
      if (!this.pointers.has(e.pointerId)) { if (e.pointerType === 'mouse') this.setHover(this.hit(p, 14)); return; }
      const prev = this.pointers.get(e.pointerId);
      this.pointers.set(e.pointerId, p);
      if (!this.o.drag) return;   // click/hover still work; rotating and zooming are locked
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (this.pinch) this.zoom = clamp(this.zoom * d / this.pinch, this.o.minZoom, this.o.maxZoom);
        this.pinch = d; this.down.moved = 99; return;
      }
      const dx = p[0] - prev[0], dy = p[1] - prev[1];
      if (this.down) this.down.moved += Math.abs(dx) + Math.abs(dy);
      const k = 180 / (Math.PI * this.radius);
      this.rotate = [this.rotate[0] + dx * k, clamp(this.rotate[1] - dy * k, -85, 85), 0];
      this.vel = [dx * k, -dy * k];
      this.idleUntil = performance.now() + 4000;
    });
    const up = e => {
      const p = pos(e);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      c.classList.remove('grabbing');
      if (this.down && this.down.moved < 6) {
        const hit = this.hit(p, e.pointerType === 'mouse' ? 14 : 24);
        if (hit && this.onClick) this.onClick(hit);
        this.vel = [0, 0];
      }
      this.down = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => { if (!this.pointers.size) this.setHover(null); });
    c.addEventListener('wheel', e => {
      if (!this.o.drag) return;   // let the page scroll normally instead of zooming
      e.preventDefault();
      this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * 0.0015), this.o.minZoom, this.o.maxZoom);
      this.idleUntil = performance.now() + 4000;
    }, { passive: false });
  }

  setHover(p) {
    if (p === this.hover) return;
    this.hover = p; this.canvas.style.cursor = p ? 'pointer' : '';
    this.dirty = true;   // hover changes the drawn point radius - matters for static globes too
    this.onHover?.(p);
  }

  visible(lon, lat) { return d3.geoDistance([lon, lat], this.center) < Math.PI / 2 - 0.04; }

  hit([x, y], radius) {
    let best = null, bd = radius;
    for (const p of this.points) {
      if (!p.clickable || !this.visible(p.lon, p.lat)) continue;
      const [px, py] = this.proj([p.lon, p.lat]);
      const d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  frame(now) {
    let busy = !!this.anim || this.pointers.size > 0;
    if (this.anim) this.anim(now);
    else if (!this.pointers.size) {
      if (Math.abs(this.vel[0]) + Math.abs(this.vel[1]) > 0.002) {
        this.rotate = [this.rotate[0] + this.vel[0], clamp(this.rotate[1] + this.vel[1], -85, 85), 0];
        this.vel = [this.vel[0] * 0.93, this.vel[1] * 0.93];
        busy = true;
      } else if (this.o.autoRotate && now > this.idleUntil) {
        this.rotate = [this.rotate[0] + this.o.autoRotate, this.rotate[1], 0];
        busy = true;
      }
    }
    // a static globe (the page background) sleeps until something changes
    if (this.o.static && !busy && !this.dirty && !this.points.some(p => p.pulse)) return;
    this.dirty = false;
    this.draw(now);
  }

  draw(now) {
    const { ctx, w, h } = this, r = this.radius, cx = w / 2, cy = h / 2 + this.o.offsetY;
    this.proj.scale(r).translate([cx, cy]).rotate(this.rotate);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // halo + sphere
    const halo = ctx.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.2);
    halo.addColorStop(0, hexA(this.o.halo, 0.22)); halo.addColorStop(1, hexA(this.o.halo, 0));
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, r * 1.2, 0, Math.PI * 2); ctx.fill();
    const sph = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, 0, cx, cy, r * 1.3);
    const pal = this.palette;
    sph.addColorStop(0, pal.sphere[0]); sph.addColorStop(0.55, pal.sphere[1]); sph.addColorStop(1, pal.sphere[2]);
    ctx.fillStyle = sph; ctx.beginPath(); this.path({ type: 'Sphere' }); ctx.fill();

    ctx.lineWidth = 0.7; ctx.strokeStyle = pal.graticule;
    ctx.beginPath(); this.path(this.graticule); ctx.stroke();

    if (this.world) {
      ctx.beginPath(); this.path(this.world);
      ctx.fillStyle = pal.land; ctx.fill();
      ctx.lineWidth = 0.6; ctx.strokeStyle = pal.border; ctx.stroke();
      for (const hl of this.highlights) {
        const f = this.byIso.get(hl.iso3); if (!f) continue;
        ctx.beginPath(); this.path(f);
        ctx.fillStyle = hexA(hl.color, hl.alpha ?? 0.36); ctx.fill();
        ctx.lineWidth = 1.1; ctx.strokeStyle = hexA(hl.color, 0.95); ctx.stroke();
      }
    }
    ctx.lineWidth = 1; ctx.strokeStyle = hexA(this.o.halo, 0.35);
    ctx.beginPath(); this.path({ type: 'Sphere' }); ctx.stroke();

    if (this.arc) this.drawArc();
    this.drawPoints(now);
  }

  drawArc() {
    const { ctx } = this, { from, to } = this.arc;
    const interp = d3.geoInterpolate(from, to), n = 80, last = Math.max(1, Math.round(n * this.arcProgress));
    const a = this.proj(from), b = this.proj(to);
    const lift = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.28;
    const pts = [];
    for (let i = 0; i <= last; i++) {
      const t = i / n, ll = interp(t);
      if (!this.visible(ll[0], ll[1])) continue;
      const [x, y] = this.proj(ll); pts.push([x, y - lift * Math.sin(Math.PI * t)]);
    }
    if (pts.length < 2) return;
    const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    g.addColorStop(0, COLORS.cyan); g.addColorStop(1, COLORS.gold);
    for (const [wd, al] of [[8, 0.18], [2.6, 1]]) {
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.globalAlpha = al; ctx.lineWidth = wd; ctx.lineCap = 'round'; ctx.strokeStyle = g; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawPoints(now) {
    const { ctx } = this;
    const labels = [];
    for (const p of this.points) {
      if (!this.visible(p.lon, p.lat)) continue;
      const [x, y] = this.proj([p.lon, p.lat]), rr = (p.r ?? 4.5) * (p === this.hover ? 1.35 : 1);
      if (p.pulse) {
        const t = ((now ?? 0) % 2200) / 2200;
        ctx.beginPath(); ctx.arc(x, y, rr * (1.5 + t * 4.5), 0, Math.PI * 2);
        ctx.strokeStyle = hexA(p.color, 0.55 * (1 - t)); ctx.lineWidth = 1.4; ctx.stroke();
      }
      const gl = ctx.createRadialGradient(x, y, 0, x, y, rr * 3.4);
      gl.addColorStop(0, hexA(p.color, 0.45)); gl.addColorStop(1, hexA(p.color, 0));
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, rr * 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.beginPath(); ctx.arc(x, y, rr * 0.42, 0, Math.PI * 2); ctx.fill();
      if (p.label && (p.showLabel || p === this.hover)) labels.push([p, x, y]);
    }
    ctx.font = '600 12px Inter, system-ui, sans-serif'; ctx.lineJoin = 'round';
    for (const [p, x, y] of labels) {
      const align = p.anchor ?? 'start';
      ctx.textAlign = align === 'end' ? 'right' : align === 'middle' ? 'center' : 'left';
      const tx = x + (p.dx ?? 10), ty = y + (p.dy ?? 4);
      ctx.lineWidth = 4; ctx.strokeStyle = this.palette.labelStroke; ctx.strokeText(p.label, tx, ty);
      ctx.fillStyle = this.palette.labelFill; ctx.fillText(p.label, tx, ty);
    }
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

window.PoliGlobe = { Globe, COLORS, loadWorld, PALETTES };
})();
