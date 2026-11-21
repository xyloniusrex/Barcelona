"""Minimal iCalendar (.ics) feed builder - no external dependencies.

Generates one VCALENDAR with events for the mobility period, project
deadlines and tasks, so a student's Erasmus timeline can be imported into
Google Calendar, Outlook or Apple Calendar (or kept live via "subscribe from
URL", pointed at /api/calendar/<user_id>.ics).
"""
import calendar
import json
import re
from datetime import date, datetime, timedelta

from server import seed as seedmod


def _esc(text):
    return str(text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line):
    # RFC 5545 content lines are meant to wrap at 75 octets; most clients
    # tolerate longer lines, but folding keeps this feed importable everywhere.
    if len(line) <= 75:
        return line
    out = [line[:75]]
    rest = line[75:]
    while rest:
        out.append(" " + rest[:74])
        rest = rest[74:]
    return "\r\n".join(out)


def _vevent(uid, start, end, summary, description=""):
    dtstart = start.strftime("%Y%m%d")
    dtend = (end + timedelta(days=1)).strftime("%Y%m%d")  # DTEND is exclusive
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}@poligo",
        f"DTSTAMP:{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}",
        f"DTSTART;VALUE=DATE:{dtstart}",
        f"DTEND;VALUE=DATE:{dtend}",
        f"SUMMARY:{_esc(summary)}",
    ]
    if description:
        lines.append(f"DESCRIPTION:{_esc(description)}")
    lines.append("END:VEVENT")
    return "\r\n".join(_fold(l) for l in lines)


def _slug(text):
    return re.sub(r"[^A-Za-z0-9]+", "-", text or "")[:32].strip("-") or "x"


def _sub_months(d, months):
    """Subtract whole months from a date, clamping the day to the target
    month's length (mirrors the rollover the browser's Date() does client-side)."""
    total = d.year * 12 + (d.month - 1) - months
    y, m = divmod(total, 12)
    day = min(d.day, calendar.monthrange(y, m + 1)[1])
    return date(y, m + 1, day)


def project_deadlines(user, mobility):
    """Same selection logic as the client's projectDeadlines(): deadlines for
    the project types picked during onboarding (or all types, if none were),
    anchored to the mobility start date when one exists."""
    types = []
    try:
        onb = json.loads((user or {}).get("onboarding") or "null")
        if onb and isinstance(onb.get("projects"), list) and onb["projects"]:
            types = onb["projects"]
    except (TypeError, ValueError):
        pass
    if not types:
        types = sorted({d["type"] for d in seedmod.PROJECT_DEADLINES})
    start = None
    if mobility and mobility.get("start_date"):
        start = date.fromisoformat(mobility["start_date"])
    out = []
    for d in seedmod.PROJECT_DEADLINES:
        if d["type"] not in types:
            continue
        when = _sub_months(start, d["months_before"]) if start else None
        out.append({"title": d["title"], "note": d.get("note"), "date": when.isoformat() if when else None})
    return out


def build_feed(mobility, tasks, deadlines):
    events = []
    if mobility and mobility.get("start_date") and mobility.get("end_date"):
        start = date.fromisoformat(mobility["start_date"])
        end = date.fromisoformat(mobility["end_date"])
        title = "Erasmus at " + (mobility.get("university_name") or mobility.get("university_id") or "")
        events.append(_vevent("mobility-" + _slug(mobility.get("id", "")), start, end, title))
    for t in tasks or []:
        if not t.get("due_date"):
            continue
        d = date.fromisoformat(t["due_date"])
        events.append(_vevent("task-" + str(t["id"]), d, d, t["title"]))
    for i, dl in enumerate(deadlines or []):
        if not dl.get("date"):
            continue
        d = date.fromisoformat(dl["date"])
        events.append(_vevent(f"deadline-{i}-{_slug(dl['title'])}", d, d, dl["title"], dl.get("note") or ""))
    body = "\r\n".join([
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//PoliGo//Erasmus Planner//EN",
        "CALSCALE:GREGORIAN",
        *events,
        "END:VCALENDAR",
    ])
    return body + "\r\n"
