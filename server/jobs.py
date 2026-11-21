"""Scheduled background job: looks for Erasmus opportunities twice a day,
at 12:00 and 00:00 (UTC) by default.

The prototype's opportunity source is the seeded university DB: each run
summarizes current match/ECTS coverage per university and stores a scan
record; universities that show their best coverage so far are flagged as
new opportunities (is_new=1) for the admin tab. A real web-search/scrape
backend can replace scan_opportunities() later without touching the
schedule. Override the hours with POLIGO_SCAN_HOURS="0,12" (UTC hours).
"""
import json
import os
from datetime import datetime, timedelta

from server.db import db, j
from server import cleanup as cleanupmod
from server import finder as findermod
from server import logs as logsmod


def next_run() -> datetime:
    hours = _hours()
    now = datetime.utcnow()
    candidates = sorted(
        (now.replace(hour=h, minute=0, second=0, microsecond=0) + (timedelta(days=1) if now.hour >= h else timedelta(0)))
        for h in hours
    )
    return candidates[0]


def _hours():
    raw = os.environ.get("POLIGO_SCAN_HOURS", "0,12")
    try:
        return sorted({int(x) % 24 for x in raw.split(",") if x.strip() != ""})
    except ValueError:
        return [0, 12]


def scan_opportunities():
    """One scan pass. Returns the scan record written to opportunity_scans."""
    found = []
    with db() as conn:
        rows = conn.execute("SELECT id, name, city, country, languages FROM universities").fetchall()
        for r in rows:
            summary = conn.execute(
                "SELECT COUNT(*) AS total, "
                "SUM(CASE WHEN m.label != 'none' AND m.partner_course_id IS NOT NULL THEN 1 ELSE 0 END) AS matched "
                "FROM matches m WHERE m.university_id = ? AND m.program = ("
                "SELECT DISTINCT program FROM matches WHERE university_id = ? LIMIT 1)",
                (r["id"], r["id"]),
            ).fetchone()
            total = summary["total"] or 0
            matched = summary["matched"] or 0
            if not total:
                continue
            found.append({
                "university_id": r["id"],
                "title": f"{r['name']} ({r['city']}, {r['country']})",
                "ects_matched": matched,
                "courses": total,
                "languages": r["languages"],
                "score": round(matched / total, 2),
            })
        best = {}
        for prev in conn.execute("SELECT detail_json FROM opportunity_scans WHERE detail_json IS NOT NULL").fetchall():
            try:
                for item in (json.loads(prev["detail_json"]) if prev["detail_json"] else []):
                    key = item["university_id"]
                    best[key] = max(best.get(key, 0), item.get("score", 0))
            except Exception:
                continue
        for item in found:
            item["is_new"] = item["score"] > best.get(item["university_id"], 0)
        run_at = logsmod.now()
        cur = conn.execute(
            "INSERT INTO opportunity_scans (run_at, count, detail_json) VALUES (?,?,?)",
            (run_at, len(found), j(found)),
        )
        logsmod.log_event("INFO", "scan", f"erasmus scan ran: {len(found)} opportunities", detail=j(found), conn=conn)
        return {"id": cur.lastrowid, "run_at": run_at, "count": len(found), "opportunities": found}


async def _run_blocking(fn):
    """Runs a blocking function (network I/O, mostly) off the event loop, so
    it never stalls unrelated HTTP requests while it waits on a slow site."""
    import asyncio
    return await asyncio.get_event_loop().run_in_executor(None, fn)


async def run_extra_jobs():
    """Erasmus site watcher + expired-data cleanup. Each runs independently -
    one failing (a site down, say) never skips the other."""
    try:
        await _run_blocking(findermod.scan_sources)
    except Exception as e:
        logsmod.log_event("ERROR", "erasmus_finder", f"source scan failed: {type(e).__name__}: {e}")
    try:
        await _run_blocking(cleanupmod.cleanup_expired)
    except Exception as e:
        logsmod.log_event("ERROR", "cleanup", f"cleanup failed: {type(e).__name__}: {e}")


async def scheduler():
    """Sleep until the next configured hour, scan, repeat."""
    import asyncio
    while True:
        target = next_run()
        wait = (target - datetime.utcnow()).total_seconds()
        await asyncio.sleep(max(1, wait))
        try:
            scan_opportunities()
        except Exception as e:
            logsmod.log_event("ERROR", "scan", f"scheduled scan failed: {type(e).__name__}: {e}")
        await run_extra_jobs()


def last_scan():
    with db() as conn:
        row = conn.execute("SELECT * FROM opportunity_scans ORDER BY id DESC LIMIT 1").fetchone()
        if not row:
            return None
        return {
            "id": row["id"], "run_at": row["run_at"], "count": row["count"],
            "opportunities": json.loads(row["detail_json"]) if row["detail_json"] else [],
        }


def run_scheduler_now_on_boot():
    """Run one scan immediately at startup so there is always data to show."""
    try:
        return scan_opportunities()
    except Exception as e:
        logsmod.log_event("ERROR", "scan", f"boot scan failed: {type(e).__name__}: {e}")
        return None
