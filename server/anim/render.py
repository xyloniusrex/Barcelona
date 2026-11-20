"""Pillow-rendered animation frames for PoliGo.

All UI animation clips (accepted-transition, destination pulse, match dots
lighting up) are rendered here with Pillow, streamed once to the device as
MJPEG and then cached by the client's service worker, so the server only
ever renders a clip a single time per device.
"""
import math

from PIL import Image, ImageDraw, ImageFilter

FPS = 20
TRANSITION_FRAMES = 44
PULSE_FRAMES = 24
DOTS_FRAMES = 36
TRANSITION_SIZE = 400
PULSE_SIZE = 160
DOTS_SIZE = (480, 300)

BG = (7, 11, 20)
SPHERE = (11, 18, 32)
BORDER = (36, 48, 77)
GRATICULE = (26, 34, 56)
TEXT = (233, 238, 248)
EXPLORE = (56, 189, 248)
JOURNEY = (251, 191, 36)
GOOD = (52, 211, 153)
PARTIAL = (251, 146, 60)
NONE = (248, 113, 113)

TIMISOARA = (45.75, 21.23)

LABEL_COLORS = {"good": GOOD, "partial": PARTIAL, "none": NONE}


def _rot(lat, lng, cam_lat, cam_lng):
    """Rotate a lat/lng into the camera frame; returns (x, y, z) with z > 0 visible."""
    la = math.radians(lat)
    lo = math.radians(lng - cam_lng)
    cl = math.radians(cam_lat)
    ca, sa = math.cos(la), math.sin(la)
    clo, slo = math.cos(lo), math.sin(lo)
    ccl, scl = math.cos(cl), math.sin(cl)
    vx = ca * clo
    yr = sa * ccl - ca * slo * scl
    zr = sa * scl + ca * slo * ccl
    return vx, yr, zr


def _proj(vec, cx, cy, r):
    return (cx + r * vec[0], cy - r * vec[1])


def _graticule(draw, cx, cy, r, cam_lat, cam_lng, step=20, sample=4, width=1):
    col = GRATICULE
    for lng in range(-180, 180 + step, step):
        prev = None
        for lat90 in range(-90, 90 + 1, sample):
            lat = min(89.9, max(-89.9, lat90))
            v = _rot(lat, lng + cam_lng, cam_lat, cam_lng)
            p = _proj(v, cx, cy, r) if v[2] > 0 else None
            if prev and p:
                draw.line([prev, p], fill=col, width=width)
            prev = p
    for lat in range(-70, 70 + step, step):
        prev = None
        for lng in range(-180, 180 + 1, sample):
            v = _rot(lat, lng + cam_lng, cam_lat, cam_lng)
            p = _proj(v, cx, cy, r) if v[2] > 0 else None
            if prev and p:
                draw.line([prev, p], fill=col, width=width)
            prev = p


def _sphere(lat, lng):
    la = math.radians(lat)
    lo = math.radians(lng)
    return (math.cos(la) * math.cos(lo), math.sin(la), math.cos(la) * math.sin(lo))


def _to_cam(v, cam_lat, cam_lng):
    """Rotate an absolute cartesian unit vector into the camera frame."""
    clng = math.radians(cam_lng)
    vx = v[0] * math.cos(clng) + v[2] * math.sin(clng)
    vz = -v[0] * math.sin(clng) + v[2] * math.cos(clng)
    cl = math.radians(cam_lat)
    yr = v[1] * math.cos(cl) - vz * math.sin(cl)
    zr = v[1] * math.sin(cl) + vz * math.cos(cl)
    return vx, yr, zr


def _arc_points(a, b, n=72):
    va, vb = _sphere(*a), _sphere(*b)
    dot = max(-1.0, min(1.0, sum(x * y for x, y in zip(va, vb))))
    omega = math.acos(dot)
    if omega < 1e-6:
        return [a, b]
    so = math.sin(omega)
    pts = []
    for i in range(n + 1):
        f = i / n
        k1 = math.sin((1 - f) * omega) / so
        k2 = math.sin(f * omega) / so
        v = tuple(k1 * va[j] + k2 * vb[j] for j in range(3))
        rn = math.sqrt(sum(c * c for c in v)) or 1.0
        v = tuple(c / rn for c in v)
        lat = math.degrees(math.asin(max(-1.0, min(1.0, v[1]))))
        lng = math.degrees(math.atan2(v[2], v[0]))
        pts.append((lat, lng))
    return pts


def _ease(f):
    f = max(0.0, min(1.0, f))
    return f * f * (3 - 2 * f)


def _lerp(a, b, f):
    return a + (b - a) * f


def _lerp_color(c1, c2, f):
    return tuple(int(_lerp(c1[i], c2[i], f)) for i in range(3))


def render_transition(university):
    """The 'I got accepted' clip: fly from Europe toward the destination while an
    arc draws from Timisoara, dashes animate, the accent cross-fades to gold and
    the greeting fades in."""
    uni_lat, uni_lng = university["lat"], university["lng"]
    cam_start = (47.0, 15.0)
    mid_lat = (cam_start[0] + uni_lat) / 2
    mid_lng = (cam_start[1] + uni_lng) / 2
    frames = []
    W = H = TRANSITION_SIZE
    for fi in range(TRANSITION_FRAMES):
        t = fi / (TRANSITION_FRAMES - 1)
        img = Image.new("RGB", (W, H), BG)
        draw = ImageDraw.Draw(img)

        zoom = _ease((t - 0.18) / 0.55) if t > 0.18 else 0.0
        r = _lerp(150, 230, zoom)
        cam_lat = _lerp(cam_start[0], mid_lat, zoom)
        cam_lng = _lerp(cam_start[1], mid_lng, zoom)

        dim = 0.5 + 0.5 * _ease(t / 0.35)
        _graticule(draw, W / 2, H / 2, r, cam_lat, cam_lng, width=1)

        accent = _lerp_color(EXPLORE, JOURNEY, _ease((t - 0.7) / 0.3) if t > 0.7 else 0.0)

        home = _rot(*TIMISOARA, cam_lat, cam_lng)
        dst = _rot(uni_lat, uni_lng, cam_lat, cam_lng)
        if home[2] > 0:
            p = _proj(home, W / 2, H / 2, r)
            rad = 4 if zoom < 0.9 else 3
            glow = Image.new("RGB", (W, H), BG)
            gdraw = ImageDraw.Draw(glow)
            for gr in (rad * 5, rad * 3, rad):
                gdraw.ellipse([p[0] - gr, p[1] - gr, p[0] + gr, p[1] + gr], fill=_lerp_color(BG, EXPLORE, 1 / gr))
            img = Image.blend(img, Image.blend(img, glow, 0.25), dim)
            draw = ImageDraw.Draw(img)
            draw.ellipse([p[0] - rad, p[1] - rad, p[0] + rad, p[1] + rad], fill=EXPLORE)

        # destination country highlight: pulsing gold ring at the destination city
        if dst[2] > 0 and zoom > 0.25:
            p = _proj(dst, W / 2, H / 2, r)
            ring_f = (t * 3) % 1.0
            ring_r = 8 + 26 * ring_f
            alpha = 1 - ring_f
            draw.ellipse([p[0] - ring_r, p[1] - ring_r, p[0] + ring_r, p[1] + ring_r], outline=_lerp_color(BG, JOURNEY, alpha * dim), width=2)
            draw.ellipse([p[0] - 4, p[1] - 4, p[0] + 4, p[1] + 4], fill=JOURNEY)

        # arc from Timisoara to destination, gradient explore->journey
        arc_t = _ease((t - 0.4) / 0.55) if t > 0.4 else 0.0
        if arc_t > 0:
            up = 0.18
            pts = _arc_points(TIMISOARA, (uni_lat, uni_lng))
            n_vis = max(2, int(len(pts) * arc_t))
            prev = None
            for i in range(n_vis):
                lat, lng = pts[i]
                v = _rot(lat, lng, cam_lat, cam_lng)
                if v[2] <= 0:
                    prev = None
                    continue
                p = _proj(v, W / 2, H / 2, r * (1 + up * math.sin(math.pi * i / len(pts))))
                if prev:
                    seg = i / len(pts)
                    col = _lerp_color(EXPLORE, JOURNEY, seg)
                    dash_on = ((i + int(t * 10)) // 3) % 2 == 0
                    if dash_on:
                        draw.line([prev, p], fill=col, width=2)
                prev = p

        # accent glow line at the bottom edge, cross-fading cyan -> gold
        draw.line([(0, H - 3), (W, H - 3)], fill=accent, width=3)

        # greeting fades in over the last phase
        txt_a = _ease((t - 0.78) / 0.22)
        if txt_a > 0 and university.get("greeting"):
            col = _lerp_color(BG, TEXT, txt_a)
            draw.text((W / 2, H / 2 - 52), university["greeting"], fill=col, anchor="mm")

        frames.append(img)
    return frames


def render_pulse(accent=JOURNEY):
    """Looping destination pulse ring for the Journey home screen."""
    S = PULSE_SIZE
    frames = []
    for fi in range(PULSE_FRAMES):
        img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        f = fi / PULSE_FRAMES
        for k in range(2):
            rf = (f + k / 2) % 1.0
            rr = 12 + 52 * rf
            a = int(255 * (1 - rf) * 0.8)
            draw.ellipse([S / 2 - rr, S / 2 - rr, S / 2 + rr, S / 2 + rr], outline=accent + (a,), width=3)
        draw.ellipse([S / 2 - 6, S / 2 - 6, S / 2 + 6, S / 2 + 6], fill=accent + (255,))
        frames.append(img)
    return frames


def render_dots(points, cam=(47.0, 15.0)):
    """Loop where partner universities light up one by one, sized and colored by
    match score. points: list of (lat, lng, label, score 0..1)."""
    W, H = DOTS_SIZE
    cx, cy, r = W / 2, H + 90, 300
    frames = []
    per = max(1, DOTS_FRAMES // max(1, len(points)))
    for fi in range(DOTS_FRAMES):
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        for idx, (lat, lng, label, score) in enumerate(points):
            lit_f = max(0.0, min(1.0, (fi - idx * per) / per))
            if lit_f <= 0:
                continue
            v = _rot(lat, lng, cam[0], cam[1])
            if v[2] <= 0:
                continue
            p = _proj(v, cx, cy, r)
            col = LABEL_COLORS.get(label, EXPLORE)
            rad = 3 + score * 5 + lit_f * 2
            glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            gdraw = ImageDraw.Draw(glow)
            gdraw.ellipse([p[0] - rad * 3, p[1] - rad * 3, p[0] + rad * 3, p[1] + rad * 3], fill=col + (int(60 * lit_f),))
            img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(4)))
            draw = ImageDraw.Draw(img)
            draw.ellipse([p[0] - rad, p[1] - rad, p[0] + rad, p[1] + rad], fill=col + (int(255 * lit_f),))
        frames.append(img)
    return frames
