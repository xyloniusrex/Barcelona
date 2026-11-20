"""MJPEG stream endpoints.

Each clip is rendered once with Pillow, cached in memory as JPEG frames and
then streamed; the client's service worker caches the full clip, so later
playbacks never touch the server.
"""
import asyncio
import io

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image

from server.anim import render

router = APIRouter(prefix="/anim")

BOUNDARY = "poligoframe"
FPS = render.FPS
_RENDER_CACHE = {}


def _encode(images, quality=68):
    frames = []
    for img in images:
        buf = io.BytesIO()
        mime = "image/jpeg"
        if img.mode == "RGBA":
            img = img.quantize(colors=128, method=Image.FASTOCTREE)
            img.save(buf, "PNG", optimize=True)
            mime = "image/png"
        else:
            img.save(buf, "JPEG", quality=quality, optimize=True)
        frames.append((buf.getvalue(), mime))
    return frames


async def _stream(frames, loop):
    while True:
        for chunk, mime in frames:
            head = b"--" + BOUNDARY.encode() + b"\r\nContent-Type: " + mime.encode() + b"\r\n\r\n"
            yield head + chunk + b"\r\n"
            await asyncio.sleep(1.0 / (FPS * 2))
        if not loop:
            return


def _clip_response(frames, loop):
    return StreamingResponse(
        _stream(frames, loop),
        media_type=f"multipart/x-mixed-replace; boundary={BOUNDARY}",
        headers={"Cache-Control": "public, max-age=86400, immutable"},
    )


@router.get("/transition/{university_id}.mjpg")
def transition(university_id: str, loop: int = 0):
    from server.db import db

    with db() as conn:
        row = conn.execute("SELECT * FROM universities WHERE id = ?", (university_id,)).fetchone()
    if not row:
        raise HTTPException(404, "unknown university")
    cache_key = f"transition:{university_id}"
    if cache_key not in _RENDER_CACHE:
        _RENDER_CACHE[cache_key] = _encode(render.render_transition(dict(row)))
    return _clip_response(_RENDER_CACHE[cache_key], loop)


@router.get("/pulse.mjpg")
def pulse(loop: int = 1):
    if "pulse" not in _RENDER_CACHE:
        _RENDER_CACHE["pulse"] = _encode(render.render_pulse())
    return _clip_response(_RENDER_CACHE["pulse"], loop)


@router.get("/dots.mjpg")
def dots(loop: int = 1):
    if "dots" not in _RENDER_CACHE:
        from server.seed import MATCHES, UNIVERSITIES

        scored = []
        for uni in UNIVERSITIES:
            ms = [m for m in MATCHES if m["university_id"] == uni["id"]]
            matched = sum(1 for m in ms if m["label"] != "none" and m["partner_course_id"])
            score = matched / max(1, len(ms))
            label = "good" if score >= 0.7 else ("partial" if score >= 0.5 else "none")
            scored.append((uni["lat"], uni["lng"], label, score))
        _RENDER_CACHE["dots"] = _encode(render.render_dots(scored))
    return _clip_response(_RENDER_CACHE["dots"], loop)
