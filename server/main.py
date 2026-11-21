"""PoliGo server: FastAPI + SQLite + Python-rendered animation streams.

The server is deliberately thin: it serves the static PWA shell, a small JSON
API for user data (all of it stored in SQLite), and one-time MJPEG animation
clips rendered with Pillow. Everything reusable is cached on the device by the
service worker.
"""
import asyncio
import json
import secrets
import uuid
from datetime import date, datetime, timedelta
from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from server import auth as authmod
from server import cleanup as cleanupmod
from server import finder as findermod
from server import ical as icalmod
from server import jobs as jobsmod
from server import logs as logsmod
from server import seed as seedmod
from server.anim import streams as anim_streams
from server.db import db, init_db, j, parse

WEB_DIR = os.path.join(os.path.dirname(__file__), "..", "web")


@asynccontextmanager
async def lifespan(app: FastAPI):
    seedmod.seed()
    logsmod.admin_token()
    jobsmod.run_scheduler_now_on_boot()
    task = asyncio.create_task(jobsmod.scheduler())
    asyncio.create_task(jobsmod.run_extra_jobs())  # site watcher + cleanup; backgrounded so slow sites never delay startup
    logsmod.log_event("INFO", "server", "server started - scheduler running for erasmus scans")
    yield
    task.cancel()
    logsmod.log_event("INFO", "server", "server stopped")


app = FastAPI(title="PoliGo", version="0.1.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=512)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(anim_streams.router)


@app.exception_handler(HTTPException)
async def http_error(request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        code = exc.detail.get("error", "ERR_HTTP")
        level = "ERROR" if exc.status_code >= 500 else "WARN"
        logsmod.log_event(level, "http", f"{request.method} {request.url.path} -> {exc.status_code} {code}", detail=str(exc.detail.get("message", "")))
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    code = f"ERR_HTTP_{exc.status_code}"
    level = "WARN" if exc.status_code < 500 else "ERROR"
    logsmod.log_event(level, "http", f"{request.method} {request.url.path} -> {exc.status_code}", detail=str(exc.detail))
    return JSONResponse(status_code=exc.status_code, content={"error": code, "message": str(exc.detail)})


@app.exception_handler(Exception)
async def unhandled_error(request, exc: Exception):
    logsmod.log_event("ERROR", "http", f"{request.method} {request.url.path} crashed", detail=f"{type(exc).__name__}: {exc}")
    return JSONResponse(status_code=500, content={"error": "ERR_INTERNAL", "message": f"{type(exc).__name__}: {exc}"})


def job(row):
    if row is None:
        return None
    d = dict(row)
    if isinstance(d.get("topics"), str):
        d["topics"] = parse(d.pop("topics"), [])
    if isinstance(d.get("languages"), str):
        d["languages"] = parse(d.pop("languages"), [])
    if isinstance(d.get("missing_topics"), str):
        d["missing_topics"] = parse(d.pop("missing_topics"), [])
    return d


def university_summaries(conn):
    rows = conn.execute(
        "SELECT m.university_id, m.home_course_id, m.label, m.partner_course_id, hc.ects "
        "FROM matches m JOIN home_courses hc ON hc.id = m.home_course_id WHERE m.program = ?",
        (seedmod.PROGRAM,),
    ).fetchall()
    out = {}
    for r in rows:
        u = out.setdefault(r["university_id"], {"matched": 0, "total": 0, "labels": [], "ects_covered": 0})
        u["total"] += 1
        if r["label"] != "none" and r["partner_course_id"]:
            u["matched"] += 1
            u["labels"].append(r["label"])
            u["ects_covered"] += r["ects"]
    return out


class UserIn(BaseModel):
    id: str | None = None
    email: str | None = None
    faculty: str | None = None
    program: str | None = None
    year: int | None = None
    semester_abroad: str | None = None
    mode: str | None = None
    theme: str | None = None
    language: str | None = None
    onboarding: str | None = None
    availability: str | None = None


@app.get("/api/home-courses")
def home_courses():
    with db() as conn:
        rows = conn.execute("SELECT * FROM home_courses WHERE program = ? ORDER BY id", (seedmod.PROGRAM,)).fetchall()
        total_ects = sum(r["ects"] for r in rows)
        return {"program": seedmod.PROGRAM, "total_ects": total_ects, "courses": [job(r) for r in rows]}


@app.get("/api/universities")
def universities():
    with db() as conn:
        rows = conn.execute("SELECT * FROM universities").fetchall()
        summaries = university_summaries(conn)
        out = []
        for r in rows:
            d = job(r)
            d["summary"] = summaries.get(r["id"], {"matched": 0, "total": 0, "labels": [], "ects_covered": 0})
            out.append(d)
        return {"universities": out}


@app.get("/api/universities/{university_id}")
def university_detail(university_id: str):
    with db() as conn:
        row = conn.execute("SELECT * FROM universities WHERE id = ?", (university_id,)).fetchone()
        if not row:
            raise HTTPException(404, {"error": "ERR_NO_UNIVERSITY", "message": "unknown university"})
        d = job(row)
        rows = conn.execute(
            "SELECT m.label, m.explanation, m.missing_topics, m.partner_course_id, "
            "hc.name AS home_name, hc.ects AS home_ects, "
            "pc.name AS partner_name, pc.ects AS partner_ects, pc.language AS partner_language "
            "FROM matches m JOIN home_courses hc ON hc.id = m.home_course_id "
            "LEFT JOIN partner_courses pc ON pc.id = m.partner_course_id "
            "WHERE m.university_id = ? AND m.program = ?",
            (university_id, seedmod.PROGRAM),
        ).fetchall()
        d["matches"] = [job(r) for r in rows]
        summaries = university_summaries(conn)
        d["summary"] = summaries.get(university_id, {"matched": 0, "total": 0, "labels": [], "ects_covered": 0})
        return d


@app.post("/api/users")
def create_user(user: UserIn):
    uid = user.id or str(uuid.uuid4())
    with db() as conn:
        exists = conn.execute("SELECT 1 FROM users WHERE id = ?", (uid,)).fetchone()
        if not exists:
            conn.execute(
                "INSERT INTO users (id, email, faculty, program, year, semester_abroad, "
                "theme, language, onboarding, availability) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (uid, user.email, user.faculty, user.program, user.year, user.semester_abroad,
                 user.theme, user.language, user.onboarding, user.availability),
            )
        else:
            sets = {k: v for k, v in user.model_dump().items()
                    if k not in ("id",) and v is not None and k != "email"}
            if sets:
                cols = ", ".join(f"{k} = ?" for k in sets)
                conn.execute(f"UPDATE users SET {cols} WHERE id = ?", (*sets.values(), uid))
    return {"id": uid}


def _get_user(conn, uid):
    row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not row:
        raise HTTPException(404, {"error": "ERR_NO_USER", "message": "unknown user"})
    return row


@app.get("/api/users/{uid}")
def get_user(uid: str):
    with db() as conn:
        row = _get_user(conn, uid)
        d = job(row)
        d["shortlist"] = [
            job(r) for r in conn.execute(
                "SELECT u.id, u.name, u.city, u.country, u.country_code, s.rank FROM shortlist s "
                "JOIN universities u ON u.id = s.university_id WHERE s.user_id = ? ORDER BY s.rank",
                (uid,),
            )
        ]
        mob = conn.execute(
            "SELECT * FROM mobilities WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC", (uid,)
        ).fetchone()
        d["mobility"] = job(mob)
        pending = conn.execute(
            "SELECT * FROM mobilities WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC", (uid,)
        ).fetchone()
        d["pending"] = job(pending)
        return d


@app.patch("/api/users/{uid}")
def update_user(uid: str, user: UserIn, request: Request):
    fields = {k: v for k, v in user.model_dump().items() if v is not None and k != "id"}
    if fields:
        with db() as conn:
            _require_session(request, conn, uid)
            _get_user(conn, uid)
            sets = ", ".join(f"{k} = ?" for k in fields)
            conn.execute(f"UPDATE users SET {sets} WHERE id = ?", (*fields.values(), uid))
            logsmod.log_event("INFO", "user", "profile fields updated", user_id=uid, detail=json.dumps(fields, default=str), conn=conn)
    return {"ok": True}


@app.post("/api/shortlist")
def add_shortlist(user_id: str, university_id: str):
    with db() as conn:
        rank = conn.execute("SELECT COUNT(*) FROM shortlist WHERE user_id = ?", (user_id,)).fetchone()[0] + 1
        conn.execute(
            "INSERT OR REPLACE INTO shortlist (user_id, university_id, rank) VALUES (?,?,?)",
            (user_id, university_id, rank),
        )
    return {"ok": True}


@app.delete("/api/shortlist/{user_id}/{university_id}")
def remove_shortlist(user_id: str, university_id: str):
    with db() as conn:
        conn.execute("DELETE FROM shortlist WHERE user_id = ? AND university_id = ?", (user_id, university_id))
    return {"ok": True}


def _require_session(request: Request, conn, uid: str):
    """Verify a Bearer session token for a user action.

    Guest device rows (no email) stay open so the prototype keeps working.
    Everything else needs a valid session token from /api/auth/verify.
    Every failure returns an explicit error code.
    """
    row = conn.execute("SELECT email FROM users WHERE id = ?", (uid,)).fetchone()
    if row is None:
        raise HTTPException(404, {"error": "ERR_NO_USER", "message": "unknown user"})
    if not row["email"]:
        return
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(401, {"error": "ERR_NO_TOKEN", "message": "sign in first - no session token sent"})
    token = header[7:].strip()
    ok = conn.execute("SELECT 1 FROM sessions WHERE token = ? AND user_id = ?", (token, uid)).fetchone()
    if not ok:
        raise HTTPException(403, {"error": "ERR_BAD_TOKEN", "message": "session token is not valid for this user - sign in again"})


class AuthCodeIn(BaseModel):
    email: str


class VerifyIn(BaseModel):
    email: str
    code: str


@app.post("/api/auth/request-code")
def request_code(payload: AuthCodeIn):
    email = payload.email.strip().lower()
    if not authmod.upt_email_ok(email):
        raise HTTPException(403, {"error": "ERR_NOT_UPT_MAIL", "message": "only @student.upt.ro addresses can log in"})
    with db() as conn:
        prev = conn.execute("SELECT created_at FROM auth_codes WHERE email = ?", (email,)).fetchone()
        if prev:
            elapsed = datetime.utcnow() - datetime.strptime(prev["created_at"], "%Y-%m-%d %H:%M:%S")
            if elapsed < timedelta(seconds=60):
                raise HTTPException(429, {"error": "ERR_RATE_LIMITED", "message": "wait a minute before asking for another code"})
        code = authmod.new_code()
        expires_at = (datetime.utcnow() + timedelta(minutes=authmod.CODE_TTL_MINUTES)).strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            "INSERT OR REPLACE INTO auth_codes (email, code, expires_at, attempts, created_at) VALUES (?,?,?,0,?)",
            (email, code, expires_at, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")),
        )
    logsmod.log_event("INFO", "auth", f"code requested for {email}", detail="sent_by_smtp=pending")
    sent, detail = True, ""
    try:
        sent, detail = authmod.send_code(email, code)
    except authmod.AuthError as e:
        raise HTTPException(e.status, {"error": e.code, "message": e.message})
    except Exception as e:
        raise HTTPException(502, {"error": "ERR_SMTP_SEND", "message": f"could not send the code: {e}"})
    if sent:
        return {"ok": True, "code_sent": True, "message": "verification code sent to your student mail"}
    return {"ok": True, "code_sent": False, "dev_code": code,
            "message": "no mail sender is configured - the code is shown here instead"}


@app.post("/api/auth/verify")
def verify(payload: VerifyIn):
    email = payload.email.strip().lower()
    code = payload.code.strip()
    with db() as conn:
        row = conn.execute("SELECT * FROM auth_codes WHERE email = ?", (email,)).fetchone()
        if not row:
            raise HTTPException(404, {"error": "ERR_NO_CODE", "message": "request a code first"})
        try:
            expires_at = datetime.strptime(row["expires_at"], "%Y-%m-%d %H:%M:%S")
        except ValueError:
            conn.execute("DELETE FROM auth_codes WHERE email = ?", (email,))
            raise HTTPException(403, {"error": "ERR_EXPIRED", "message": "code expired - request a new one"})
        if datetime.utcnow() > expires_at:
            conn.execute("DELETE FROM auth_codes WHERE email = ?", (email,))
            raise HTTPException(403, {"error": "ERR_EXPIRED", "message": "code expired - request a new one"})
        if row["attempts"] >= authmod.MAX_ATTEMPTS:
            conn.execute("DELETE FROM auth_codes WHERE email = ?", (email,))
            raise HTTPException(403, {"error": "ERR_TOO_MANY_TRIES", "message": "too many wrong codes - request a new one"})
        if not secrets.compare_digest(row["code"], code):
            left = authmod.MAX_ATTEMPTS - (row["attempts"] + 1)
            if left <= 0:
                conn.execute("DELETE FROM auth_codes WHERE email = ?", (email,))
                raise HTTPException(403, {"error": "ERR_TOO_MANY_TRIES", "message": "too many wrong codes - request a new one"})
            conn.execute("UPDATE auth_codes SET attempts = attempts + 1 WHERE email = ?", (email,))
            logsmod.log_event("WARN", "auth", f"wrong code for {email}", detail=f"tries_left={left}", conn=conn)
            raise HTTPException(403, {"error": "ERR_WRONG_CODE", "message": f"wrong code - {left} tries left"})
        conn.execute("DELETE FROM auth_codes WHERE email = ?", (email,))
        existing = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not existing:
            conn.execute("INSERT OR IGNORE INTO users (id, email) VALUES (?,?)", (str(uuid.uuid4()), email))
            existing = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        token = secrets.token_urlsafe(32)
        conn.execute("INSERT INTO sessions (token, user_id) VALUES (?,?)", (token, existing["id"]))
        user = job(existing)
    logsmod.log_event("INFO", "auth", "user signed in via mail verification", user_id=user["id"], detail=f"email={email}")
    return {"ok": True, "token": token, "user": user}


class AcceptedIn(BaseModel):
    user_id: str
    university_id: str
    start_date: str
    arrival_date: str | None = None
    end_date: str
    token: str | None = None


def _tasks_from_template(mobility_id, start, arrival, end):
    anchors = {"S": start, "A": arrival, "E": end}
    out = []
    for t in seedmod.TIMELINE_TEMPLATE:
        base = date.fromisoformat(anchors[t["anchor"]])
        out.append((mobility_id, t["title"], t["stage"], (base + timedelta(days=t["offset"])).isoformat(), "template", 0))
    return out


@app.post("/api/accepted")
def accepted(payload: AcceptedIn, request: Request):
    """The student says they were accepted. The mobility starts as 'pending':
    the journey (timeline, intro, countdown) opens only after an admin approves
    it in the admin panel (POST /api/admin/approvals/{id})."""
    arrival = payload.arrival_date or (date.fromisoformat(payload.start_date) - timedelta(days=3)).isoformat()
    mid = str(uuid.uuid4())
    with db() as conn:
        _require_session(request, conn, payload.user_id)
        _get_user(conn, payload.user_id)
        conn.execute("UPDATE mobilities SET status = 'withdrawn' WHERE user_id = ? AND status = 'pending'", (payload.user_id,))
        conn.execute(
            "INSERT INTO mobilities (id, user_id, university_id, start_date, arrival_date, end_date, status) VALUES (?,?,?,?,?,?, 'pending')",
            (mid, payload.user_id, payload.university_id, payload.start_date, arrival, payload.end_date),
        )
        conn.executemany(
            "INSERT INTO tasks (mobility_id, title, stage, due_date, source, done) VALUES (?,?,?,?,?,?)",
            _tasks_from_template(mid, payload.start_date, arrival, payload.end_date),
        )
        logsmod.log_event("INFO", "user", f"mobility at {payload.university_id} sent for approval", user_id=payload.user_id,
                          detail=f"start={payload.start_date} end={payload.end_date}", conn=conn)
        tasks = [job(r) for r in conn.execute("SELECT * FROM tasks WHERE mobility_id = ? ORDER BY due_date", (mid,))]
        mob = job(conn.execute("SELECT * FROM mobilities WHERE id = ?", (mid,)).fetchone())
    return {"mobility": mob, "tasks": tasks}


@app.get("/api/mobilities/{mobility_id}")
def get_mobility(mobility_id: str):
    with db() as conn:
        mob = conn.execute("SELECT * FROM mobilities WHERE id = ?", (mobility_id,)).fetchone()
        if not mob:
            raise HTTPException(404, {"error": "ERR_NO_MOBILITY", "message": "unknown mobility"})
        tasks = [job(r) for r in conn.execute("SELECT * FROM tasks WHERE mobility_id = ? ORDER BY due_date", (mobility_id,))]
        return {"mobility": job(mob), "tasks": tasks}


class TaskIn(BaseModel):
    mobility_id: str
    title: str
    stage: str = "during"
    due_date: str | None = None


@app.post("/api/tasks")
def add_task(task: TaskIn):
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO tasks (mobility_id, title, stage, due_date, source, done) VALUES (?,?,?,?, 'user', 0)",
            (task.mobility_id, task.title, task.stage, task.due_date),
        )
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (cur.lastrowid,)).fetchone()
    return job(row)


@app.patch("/api/tasks/{task_id}")
def patch_task(task_id: int, done: bool):
    with db() as conn:
        conn.execute("UPDATE tasks SET done = ? WHERE id = ?", (1 if done else 0, task_id))
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        raise HTTPException(404, {"error": "ERR_NO_TASK", "message": "unknown task"})
    return job(row)


class ScanIn(BaseModel):
    mobility_id: str


@app.post("/api/scan")
def scan(payload: ScanIn):
    """Document scanner hook. In the prototype the explanation is a canned
    demo result; the vision-model call plugs in here (server-side, key never
    in the browser). The image is never stored - only the JSON result.

    result_json holds just the explanation (what / steps / deadlines / bring /
    watch_out / keywords), which is exactly what the client renders."""
    mobility_id = payload.mobility_id
    doc = seedmod.WELCOME_DOC
    with db() as conn:
        if not conn.execute("SELECT 1 FROM mobilities WHERE id = ?", (mobility_id,)).fetchone():
            raise HTTPException(404, {"error": "ERR_NO_MOBILITY", "message": "no active mobility - accept an offer first"})
        cur = conn.execute(
            "INSERT INTO scanned_docs (mobility_id, document_type, language, summary, result_json) VALUES (?,?,?,?,?)",
            (mobility_id, doc["document_type"], doc["language"], doc["summary"], j(doc["result"])),
        )
        row = conn.execute("SELECT * FROM scanned_docs WHERE id = ?", (cur.lastrowid,)).fetchone()
    return job(row)


@app.get("/api/scans/{mobility_id}")
def scans(mobility_id: str):
    with db() as conn:
        rows = conn.execute("SELECT * FROM scanned_docs WHERE mobility_id = ? ORDER BY id DESC", (mobility_id,)).fetchall()
        return {"scans": [job(r) for r in rows]}


class SignupIn(BaseModel):
    email: str
    faculty: str | None = None
    wants: str | None = None


@app.post("/api/signups")
def signup(s: SignupIn):
    with db() as conn:
        conn.execute("INSERT INTO signups (email, faculty, wants) VALUES (?,?,?)", (s.email, s.faculty, s.wants))
    return {"ok": True}


class UserDocIn(BaseModel):
    user_id: str
    doc_type: str
    file_name: str = ""
    size: int = 0
    doc_number: str | None = None
    issued_on: str | None = None
    expires_on: str | None = None
    notes: str | None = None


@app.get("/api/user-docs")
def user_docs(user_id: str):
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM user_docs WHERE user_id = ? ORDER BY uploaded_at", (user_id,)
        ).fetchall()
        return {"docs": [job(r) for r in rows]}


@app.post("/api/user-docs")
def add_user_doc(doc: UserDocIn):
    """Identity documents: only the record (type/name/size/manual data) is
    stored here. A photo, if any, never leaves the user's device - it lives in
    IndexedDB, so the server holds no sensitive personal files."""
    with db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO user_docs (user_id, doc_type, file_name, size, "
            "doc_number, issued_on, expires_on, notes) VALUES (?,?,?,?,?,?,?,?)",
            (doc.user_id, doc.doc_type, doc.file_name, doc.size,
             doc.doc_number, doc.issued_on, doc.expires_on, doc.notes),
        )
        row = conn.execute(
            "SELECT * FROM user_docs WHERE user_id = ? AND doc_type = ?",
            (doc.user_id, doc.doc_type),
        ).fetchone()
    return job(row)


@app.patch("/api/user-docs/{doc_id}")
def update_user_doc(doc_id: int, user_id: str, doc: UserDocIn):
    fields = {k: v for k, v in doc.model_dump().items()
              if k not in ("user_id", "doc_type") and v is not None}
    with db() as conn:
        row = conn.execute("SELECT * FROM user_docs WHERE id = ? AND user_id = ?", (doc_id, user_id)).fetchone()
        if not row:
            raise HTTPException(404, {"error": "ERR_NO_DOC", "message": "no such document"})
        if fields:
            sets = ", ".join(f"{k} = ?" for k in fields)
            conn.execute(f"UPDATE user_docs SET {sets} WHERE id = ?", (*fields.values(), doc_id))
        row = conn.execute("SELECT * FROM user_docs WHERE id = ?", (doc_id,)).fetchone()
    return job(row)


@app.delete("/api/user-docs/{doc_id}")
def delete_user_doc(doc_id: int, user_id: str):
    with db() as conn:
        conn.execute("DELETE FROM user_docs WHERE id = ? AND user_id = ?", (doc_id, user_id))
    return {"ok": True}


@app.get("/api/i18n/{lang}")
def get_strings(lang: str):
    """Translated UI strings. Generated server-side once per language, then
    always served from the saved translations table."""
    from server.i18n import ensure_language
    return ensure_language(lang)


@app.get("/api/deadlines")
def deadlines():
    """Project paperwork deadlines (static seed data, client caches it)."""
    return {"deadlines": seedmod.PROJECT_DEADLINES}


@app.get("/api/calendar/{user_id}.ics")
def calendar_ics(user_id: str):
    """Exports the active mobility period, tasks and project deadlines as a
    single .ics feed - importable (or subscribable, via "from URL") in Google
    Calendar, Outlook or Apple Calendar."""
    with db() as conn:
        user = _get_user(conn, user_id)
        mob_row = conn.execute(
            "SELECT * FROM mobilities WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC", (user_id,)
        ).fetchone()
        mobility = None
        tasks = []
        if mob_row:
            mobility = dict(mob_row)
            uni = conn.execute("SELECT name FROM universities WHERE id = ?", (mobility["university_id"],)).fetchone()
            mobility["university_name"] = uni["name"] if uni else None
            tasks = [dict(r) for r in conn.execute("SELECT * FROM tasks WHERE mobility_id = ?", (mobility["id"],))]
    deadlines_list = icalmod.project_deadlines(dict(user), mobility)
    body = icalmod.build_feed(mobility, tasks, deadlines_list)
    return Response(content=body, media_type="text/calendar; charset=utf-8",
                     headers={"Content-Disposition": 'inline; filename="poligo.ics"'})


def _require_admin(request: Request):
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(401, {"error": "ERR_NO_TOKEN", "message": "admin token required - set it in the admin tab"})
    if header[7:].strip() != logsmod.admin_token():
        raise HTTPException(403, {"error": "ERR_BAD_TOKEN", "message": "admin token is invalid"})


@app.get("/api/admin/summary")
def admin_summary(request: Request):
    _require_admin(request)
    with db() as conn:
        counts = {
            "users": conn.execute("SELECT COUNT(*) FROM users").fetchone()[0],
            "sessions": conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0],
            "user_docs": conn.execute("SELECT COUNT(*) FROM user_docs").fetchone()[0],
            "mobilities": conn.execute("SELECT COUNT(*) FROM mobilities").fetchone()[0],
            "pending": conn.execute("SELECT COUNT(*) FROM mobilities WHERE status = 'pending'").fetchone()[0],
            "errors_24h": conn.execute(
                "SELECT COUNT(*) FROM logs WHERE level = 'ERROR' AND ts >= datetime('now', '-1 day')"
            ).fetchone()[0],
            "warn_24h": conn.execute(
                "SELECT COUNT(*) FROM logs WHERE level = 'WARN' AND ts >= datetime('now', '-1 day')"
            ).fetchone()[0],
        }
        recent = conn.execute(
            "SELECT ts, user_id, event FROM logs WHERE category = 'auth' AND level = 'INFO' ORDER BY id DESC LIMIT 10"
        ).fetchall()
    scan = jobsmod.last_scan()
    return {
        "uptime": logsmod.uptime_text(),
        "counts": counts,
        "recent_signins": [dict(r) for r in recent],
        "last_scan": scan,
    }


@app.get("/api/admin/logs")
def admin_logs(request: Request, limit: int = 200, level: str = ""):
    _require_admin(request)
    return {"logs": logsmod.get_logs(limit=limit, level=level)}


class MessageIn(BaseModel):
    text: str
    to_user: str | None = None


@app.get("/api/admin/messages")
def admin_messages(request: Request):
    _require_admin(request)
    with db() as conn:
        rows = conn.execute(
            "SELECT m.*, u2.email AS to_email, u3.email AS from_email "
            "FROM messages m LEFT JOIN users u2 ON u2.id = m.to_user LEFT JOIN users u3 ON u3.id = m.from_user "
            "ORDER BY m.id DESC LIMIT 200"
        ).fetchall()
    return {"messages": [{**dict(r), "to_email": r["to_email"], "from_email": r["from_email"]} for r in rows]}


@app.post("/api/admin/messages")
def admin_send(msg: MessageIn, request: Request):
    _require_admin(request)
    text = msg.text.strip()
    if not text:
        raise HTTPException(400, {"error": "ERR_EMPTY_MESSAGE", "message": "nothing to send"})
    with db() as conn:
        if msg.to_user:
            row = conn.execute("SELECT id FROM users WHERE id = ?", (msg.to_user,)).fetchone()
            if not row:
                raise HTTPException(404, {"error": "ERR_NO_USER", "message": "unknown recipient"})
            conn.execute(
                "INSERT INTO messages (ts, from_admin, to_user, text) VALUES (?,?,?,?)",
                (logsmod.now(), 1, msg.to_user, text),
            )
            target = f"user {msg.to_user}"
        else:
            conn.execute("INSERT INTO messages (ts, from_admin, text) VALUES (?,?,?)", (logsmod.now(), 1, text))
            target = "all users (broadcast)"
    logsmod.log_event("INFO", "admin", f"message sent to {target}", detail=text[:200])
    return {"ok": True}


@app.get("/api/admin/approvals")
def admin_approvals(request: Request):
    """Mobilities waiting for an admin to confirm the acceptance."""
    _require_admin(request)
    with db() as conn:
        rows = conn.execute(
            "SELECT m.*, u.email, un.name AS university_name, un.city "
            "FROM mobilities m JOIN users u ON u.id = m.user_id "
            "LEFT JOIN universities un ON un.id = m.university_id "
            "WHERE m.status = 'pending' ORDER BY m.created_at"
        ).fetchall()
    return {"pending": [dict(r) for r in rows]}


class ApprovalIn(BaseModel):
    approve: bool
    note: str | None = None


@app.post("/api/admin/approvals/{mobility_id}")
def admin_approve(mobility_id: str, payload: ApprovalIn, request: Request):
    _require_admin(request)
    with db() as conn:
        mob = conn.execute("SELECT * FROM mobilities WHERE id = ? AND status = 'pending'", (mobility_id,)).fetchone()
        if not mob:
            raise HTTPException(404, {"error": "ERR_NO_MOBILITY", "message": "no pending mobility with this id"})
        uid = mob["user_id"]
        uni = conn.execute("SELECT name FROM universities WHERE id = ?", (mob["university_id"],)).fetchone()
        uni_name = uni["name"] if uni else mob["university_id"]
        if payload.approve:
            conn.execute("UPDATE mobilities SET status = 'archived' WHERE user_id = ? AND status = 'active'", (uid,))
            conn.execute("UPDATE mobilities SET status = 'active' WHERE id = ?", (mobility_id,))
            conn.execute("UPDATE users SET mode = 'journey' WHERE id = ?", (uid,))
            text = f"Your mobility at {uni_name} was approved. Your journey starts now!"
        else:
            conn.execute("UPDATE mobilities SET status = 'rejected' WHERE id = ?", (mobility_id,))
            text = f"Your mobility at {uni_name} was not approved."
        if payload.note and payload.note.strip():
            text += " " + payload.note.strip()
        conn.execute(
            "INSERT INTO messages (ts, from_admin, to_user, text) VALUES (?,?,?,?)",
            (logsmod.now(), 1, uid, text),
        )
        logsmod.log_event("INFO", "admin", f"mobility {'approved' if payload.approve else 'rejected'} at {mob['university_id']}",
                          user_id=uid, conn=conn)
    return {"ok": True}


@app.post("/api/admin/scan")
def admin_scan(request: Request):
    _require_admin(request)
    out = jobsmod.scan_opportunities()
    return {"ok": True, "scan": out}


@app.get("/api/admin/erasmus-sources")
def admin_erasmus_sources(request: Request):
    """Latest check per official national Erasmus+ site (server/finder.py)."""
    _require_admin(request)
    return {"sources": findermod.latest()}


@app.post("/api/admin/erasmus-sources/scan")
def admin_erasmus_sources_scan(request: Request):
    _require_admin(request)
    return {"ok": True, "sources": findermod.scan_sources()}


@app.post("/api/admin/cleanup")
def admin_cleanup(request: Request):
    """Deletes expired data now (server/cleanup.py) instead of waiting for the
    scheduled run."""
    _require_admin(request)
    return {"ok": True, **cleanupmod.cleanup_expired()}


@app.get("/api/inbox/{user_id}")
def inbox(user_id: str):
    with db() as conn:
        rows = conn.execute(
            "SELECT id, ts, from_admin, to_user, text, read FROM messages "
            "WHERE to_user = ? OR (from_admin = 1 AND to_user IS NULL) ORDER BY id DESC LIMIT 50",
            (user_id,),
        ).fetchall()
        unread = conn.execute(
            "SELECT COUNT(*) FROM messages WHERE read = 0 AND (to_user = ? OR (from_admin = 1 AND to_user IS NULL))",
            (user_id,),
        ).fetchone()[0]
    return {"messages": [dict(r) for r in rows], "unread": unread}


class ReplyIn(BaseModel):
    text: str


@app.post("/api/inbox/{user_id}/reply")
def inbox_reply(user_id: str, payload: ReplyIn):
    text = payload.text.strip()
    if not text:
        raise HTTPException(400, {"error": "ERR_EMPTY_MESSAGE", "message": "nothing to send"})
    with db() as conn:
        conn.execute(
            "INSERT INTO messages (ts, from_admin, to_user, from_user, text) VALUES (?,0,NULL,?,?)",
            (logsmod.now(), user_id, text),
        )
        uid = user_id[:8] + "..." if len(user_id) > 8 else user_id
    logsmod.log_event("INFO", "inbox", f"user reply {uid}", user_id=user_id, detail=text[:200])
    return {"ok": True}


@app.post("/api/inbox/{user_id}/read")
def inbox_read(user_id: str):
    with db() as conn:
        conn.execute(
            "UPDATE messages SET read = 1 WHERE to_user = ? OR (from_admin = 1 AND to_user IS NULL)",
            (user_id,),
        )
    return {"ok": True}


@app.get("/api/health")
def health():
    return {"ok": True, "service": "poligo"}


app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
init_db()
