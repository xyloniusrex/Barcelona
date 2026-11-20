"""PoliGo server: FastAPI + SQLite + Python-rendered animation streams.

The server is deliberately thin: it serves the static PWA shell, a small JSON
API for user data (all of it stored in SQLite), and one-time MJPEG animation
clips rendered with Pillow. Everything reusable is cached on the device by the
service worker.
"""
import uuid
from datetime import date, timedelta
from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from server import seed as seedmod
from server.anim import streams as anim_streams
from server.db import db, init_db, j, parse

WEB_DIR = os.path.join(os.path.dirname(__file__), "..", "web")


@asynccontextmanager
async def lifespan(app: FastAPI):
    seedmod.seed()
    yield


app = FastAPI(title="PoliGo", version="0.1.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=512)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(anim_streams.router)


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
            raise HTTPException(404, "unknown university")
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
                "INSERT INTO users (id, email, faculty, program, year, semester_abroad) VALUES (?,?,?,?,?,?)",
                (uid, user.email, user.faculty, user.program, user.year, user.semester_abroad),
            )
    return {"id": uid}


def _get_user(conn, uid):
    row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not row:
        raise HTTPException(404, "unknown user")
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
        return d


@app.patch("/api/users/{uid}")
def update_user(uid: str, user: UserIn):
    fields = {k: v for k, v in user.model_dump().items() if v is not None and k != "id"}
    if fields:
        with db() as conn:
            _get_user(conn, uid)
            sets = ", ".join(f"{k} = ?" for k in fields)
            conn.execute(f"UPDATE users SET {sets} WHERE id = ?", (*fields.values(), uid))
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


class AcceptedIn(BaseModel):
    user_id: str
    university_id: str
    start_date: str
    arrival_date: str | None = None
    end_date: str


def _tasks_from_template(mobility_id, start, arrival, end):
    anchors = {"S": start, "A": arrival, "E": end}
    out = []
    for t in seedmod.TIMELINE_TEMPLATE:
        base = date.fromisoformat(anchors[t["anchor"]])
        out.append((mobility_id, t["title"], t["stage"], (base + timedelta(days=t["offset"])).isoformat(), "template", 0))
    return out


@app.post("/api/accepted")
def accepted(payload: AcceptedIn):
    arrival = payload.arrival_date or (date.fromisoformat(payload.start_date) - timedelta(days=3)).isoformat()
    mid = str(uuid.uuid4())
    with db() as conn:
        _get_user(conn, payload.user_id)
        conn.execute("UPDATE mobilities SET status = 'archived' WHERE user_id = ? AND status = 'active'", (payload.user_id,))
        conn.execute(
            "INSERT INTO mobilities (id, user_id, university_id, start_date, arrival_date, end_date, status) VALUES (?,?,?,?,?,?, 'active')",
            (mid, payload.user_id, payload.university_id, payload.start_date, arrival, payload.end_date),
        )
        conn.execute("UPDATE users SET mode = 'journey' WHERE id = ?", (payload.user_id,))
        conn.executemany(
            "INSERT INTO tasks (mobility_id, title, stage, due_date, source, done) VALUES (?,?,?,?,?,?)",
            _tasks_from_template(mid, payload.start_date, arrival, payload.end_date),
        )
        tasks = [job(r) for r in conn.execute("SELECT * FROM tasks WHERE mobility_id = ? ORDER BY due_date", (mid,))]
        mob = job(conn.execute("SELECT * FROM mobilities WHERE id = ?", (mid,)).fetchone())
    return {"mobility": mob, "tasks": tasks}


@app.get("/api/mobilities/{mobility_id}")
def get_mobility(mobility_id: str):
    with db() as conn:
        mob = conn.execute("SELECT * FROM mobilities WHERE id = ?", (mobility_id,)).fetchone()
        if not mob:
            raise HTTPException(404, "unknown mobility")
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
        raise HTTPException(404, "unknown task")
    return job(row)


class ScanIn(BaseModel):
    mobility_id: str


@app.post("/api/scan")
def scan(payload: ScanIn):
    mobility_id = payload.mobility_id
    """Document scanner hook. In the prototype the explanation is a canned
    demo result; the vision-model call plugs in here (server-side, key never
    in the browser). The image is never stored - only the JSON result."""
    doc = seedmod.WELCOME_DOC
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO scanned_docs (mobility_id, document_type, language, summary, result_json) VALUES (?,?,?,?,?)",
            (mobility_id, doc["document_type"], doc["language"], doc["summary"], j(doc)),
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
    file_name: str
    size: int = 0


@app.get("/api/user-docs")
def user_docs(user_id: str):
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM user_docs WHERE user_id = ? ORDER BY uploaded_at", (user_id,)
        ).fetchall()
        return {"docs": [job(r) for r in rows]}


@app.post("/api/user-docs")
def add_user_doc(doc: UserDocIn):
    """Identity documents: only the record (type/name/size) is stored here.
    The file itself never leaves the user's device - it lives in IndexedDB,
    so the server holds no sensitive personal documents."""
    with db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO user_docs (user_id, doc_type, file_name, size) VALUES (?,?,?,?)",
            (doc.user_id, doc.doc_type, doc.file_name, doc.size),
        )
        row = conn.execute(
            "SELECT * FROM user_docs WHERE user_id = ? AND doc_type = ?",
            (doc.user_id, doc.doc_type),
        ).fetchone()
    return job(row)


@app.delete("/api/user-docs/{doc_id}")
def delete_user_doc(doc_id: int, user_id: str):
    with db() as conn:
        conn.execute("DELETE FROM user_docs WHERE id = ? AND user_id = ?", (doc_id, user_id))
    return {"ok": True}


@app.get("/api/users/by-email/{email}")
def get_user_by_email(email: str):
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ? ORDER BY created_at LIMIT 1", (email,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "no account for this email")
    return job(row)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "poligo"}


app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
init_db()
