"""Structured logging + uptime + admin token.

Every meaningful server event (auth, data changes, admin actions, errors)
is appended to the `logs` table with a level and category, so the admin tab
can answer: who logged in, what was written, how, and what failed.
Admin access uses a bearer token: either the POLIGO_ADMIN_TOKEN env var or
a random one generated once and stored in data/admin_token.txt.
"""
import os
import secrets
from datetime import datetime

from server.db import db, DB_PATH

STARTED = datetime.utcnow()

LEVELS = ("INFO", "WARN", "ERROR")


def admin_token() -> str:
    env = os.environ.get("POLIGO_ADMIN_TOKEN", "").strip()
    if env:
        return env
    path = db_path()
    os.makedirs(path, exist_ok=True)
    token_file = os.path.join(path, "admin_token.txt")
    if os.path.exists(token_file):
        with open(token_file) as f:
            t = f.read().strip()
            if t:
                return t
    t = secrets.token_urlsafe(24)
    with open(token_file, "w") as f:
        f.write(t)
    return t


def db_path() -> str:
    return os.path.dirname(DB_PATH)


def now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def log_event(level, category, event, user_id=None, detail=None, conn=None):
    """Append to the logs table. Pass an open connection when already inside
    a db() transaction, or the second connection deadlocks on the write lock."""
    ts = now()
    sql = "INSERT INTO logs (ts, level, category, user_id, event, detail) VALUES (?,?,?,?,?,?)"
    if conn is not None:
        conn.execute(sql, (ts, level, category, user_id, event, detail))
        return
    with db() as conn:
        conn.execute(sql, (ts, level, category, user_id, event, detail))


def uptime_seconds() -> float:
    return (datetime.utcnow() - STARTED).total_seconds()


def uptime_text() -> str:
    s = int(uptime_seconds())
    return f"{s // 86400}d {s % 86400 // 3600}h {s % 3600 // 60}m {s % 60}s"


def get_logs(limit: int = 200, level: str = ""):
    with db() as conn:
        if level:
            rows = conn.execute(
                "SELECT * FROM logs WHERE level = ? ORDER BY id DESC LIMIT ?", (level, int(limit))
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM logs ORDER BY id DESC LIMIT ?", (int(limit),)).fetchall()
    return [dict(r) for r in rows]
