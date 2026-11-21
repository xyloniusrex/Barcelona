"""SQLite persistence for PoliGo. Small, single-file, Docker-volume friendly."""
import json
import os
import sqlite3
from contextlib import contextmanager

DB_PATH = os.environ.get("POLIGO_DB", os.path.join(os.path.dirname(__file__), "..", "data", "poligo.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    faculty TEXT,
    program TEXT,
    year INTEGER,
    semester_abroad TEXT,
    mode TEXT NOT NULL DEFAULT 'explore',
    theme TEXT,
    language TEXT,
    onboarding TEXT,
    availability TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS home_courses (
    id TEXT PRIMARY KEY,
    program TEXT NOT NULL,
    semester INTEGER NOT NULL,
    name TEXT NOT NULL,
    ects INTEGER NOT NULL,
    topics TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'mandatory'
);
CREATE TABLE IF NOT EXISTS universities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    country TEXT NOT NULL,
    country_code TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    languages TEXT NOT NULL,
    website TEXT,
    greeting TEXT
);
CREATE TABLE IF NOT EXISTS partner_courses (
    id TEXT PRIMARY KEY,
    university_id TEXT NOT NULL REFERENCES universities(id),
    name TEXT NOT NULL,
    ects INTEGER NOT NULL,
    semester INTEGER NOT NULL,
    language TEXT NOT NULL,
    description TEXT
);
CREATE TABLE IF NOT EXISTS matches (
    program TEXT NOT NULL,
    university_id TEXT NOT NULL REFERENCES universities(id),
    home_course_id TEXT NOT NULL REFERENCES home_courses(id),
    partner_course_id TEXT,
    label TEXT NOT NULL,
    explanation TEXT,
    missing_topics TEXT,
    PRIMARY KEY (university_id, home_course_id)
);
CREATE TABLE IF NOT EXISTS shortlist (
    user_id TEXT NOT NULL REFERENCES users(id),
    university_id TEXT NOT NULL REFERENCES universities(id),
    rank INTEGER NOT NULL,
    PRIMARY KEY (user_id, university_id)
);
CREATE TABLE IF NOT EXISTS mobilities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    university_id TEXT NOT NULL REFERENCES universities(id),
    start_date TEXT NOT NULL,
    arrival_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mobility_id TEXT NOT NULL REFERENCES mobilities(id),
    title TEXT NOT NULL,
    stage TEXT NOT NULL,
    due_date TEXT,
    source TEXT NOT NULL DEFAULT 'template',
    done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS scanned_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mobility_id TEXT NOT NULL REFERENCES mobilities(id),
    document_type TEXT NOT NULL,
    language TEXT,
    summary TEXT,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS user_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    doc_type TEXT NOT NULL,
    file_name TEXT,
    size INTEGER NOT NULL DEFAULT 0,
    doc_number TEXT,
    issued_on TEXT,
    expires_on TEXT,
    notes TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, doc_type)
);
CREATE TABLE IF NOT EXISTS signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    faculty TEXT,
    wants TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS translations (
    lang TEXT NOT NULL,
    key TEXT NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (lang, key)
);
CREATE TABLE IF NOT EXISTS auth_codes (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    level TEXT NOT NULL,
    category TEXT NOT NULL,
    user_id TEXT,
    event TEXT NOT NULL,
    detail TEXT
);
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    from_admin INTEGER NOT NULL DEFAULT 0,
    to_user TEXT,
    from_user TEXT,
    text TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS opportunity_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at TEXT NOT NULL,
    count INTEGER NOT NULL,
    detail_json TEXT
);
CREATE TABLE IF NOT EXISTS erasmus_source_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    country TEXT NOT NULL,
    agency TEXT NOT NULL,
    url TEXT NOT NULL,
    ok INTEGER NOT NULL DEFAULT 0,
    digest TEXT,
    snippet TEXT,
    error TEXT,
    changed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(id);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user);
CREATE INDEX IF NOT EXISTS idx_tasks_mob ON tasks(mobility_id);
CREATE INDEX IF NOT EXISTS idx_erasmus_checks_country ON erasmus_source_checks(country, id);
"""


def connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db():
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.executescript(SCHEMA)
        for stmt in MIGRATIONS:
            try:
                conn.execute(stmt)
            except sqlite3.OperationalError:
                pass  # column/table already exists


# incremental changes for databases created by older versions
MIGRATIONS = [
    "ALTER TABLE users ADD COLUMN theme TEXT",
    "ALTER TABLE users ADD COLUMN language TEXT",
    "ALTER TABLE users ADD COLUMN onboarding TEXT",
    "ALTER TABLE users ADD COLUMN availability TEXT",
    "ALTER TABLE user_docs ADD COLUMN file_name TEXT",
    "ALTER TABLE user_docs ADD COLUMN doc_number TEXT",
    "ALTER TABLE user_docs ADD COLUMN issued_on TEXT",
    "ALTER TABLE user_docs ADD COLUMN expires_on TEXT",
    "ALTER TABLE user_docs ADD COLUMN notes TEXT",
    "CREATE TABLE IF NOT EXISTS auth_codes ("
    " email TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at TEXT NOT NULL,"
    " attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
    "CREATE TABLE IF NOT EXISTS sessions ("
    " token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),"
    " created_at TEXT NOT NULL DEFAULT (datetime('now')))",
    "CREATE TABLE IF NOT EXISTS logs ("
    " id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, level TEXT NOT NULL,"
    " category TEXT NOT NULL, user_id TEXT, event TEXT NOT NULL, detail TEXT)",
    "CREATE TABLE IF NOT EXISTS messages ("
    " id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, from_admin INTEGER NOT NULL DEFAULT 0,"
    " to_user TEXT, from_user TEXT, text TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0)",
    "CREATE TABLE IF NOT EXISTS opportunity_scans ("
    " id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT NOT NULL, count INTEGER NOT NULL, detail_json TEXT)",
    "CREATE TABLE IF NOT EXISTS erasmus_source_checks ("
    " id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, country TEXT NOT NULL, agency TEXT NOT NULL,"
    " url TEXT NOT NULL, ok INTEGER NOT NULL DEFAULT 0, digest TEXT, snippet TEXT, error TEXT,"
    " changed INTEGER NOT NULL DEFAULT 0)",
    "CREATE INDEX IF NOT EXISTS idx_erasmus_checks_country ON erasmus_source_checks(country, id)",
]


def j(value) -> str:
    return json.dumps(value, separators=(",", ":"))


def parse(value, default=None):
    return json.loads(value) if value else default
