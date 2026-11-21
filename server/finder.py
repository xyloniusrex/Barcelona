"""Watches each partner country's official Erasmus+ site for changes.

Eight sites, eight languages, eight layouts: reliably parsing a structured
"opportunity" (title, deadline, eligibility) out of each one without a page
specific scraper per site would be fragile and likely to silently show stale
or wrong data. Instead this fetches each page, reduces it to visible text,
and hashes it. A changed hash since the last check is a real, honest signal -
something on the official page was updated - without pretending to
understand funding-call semantics in Dutch, Hungarian, Latvian, Finnish,
Portuguese or German. Staff see the result in the admin "Sources" tab and
follow the link when something changed.
"""
import hashlib
import html
import json
import re
import socket
import urllib.request
from urllib.error import HTTPError, URLError

from server.db import db
from server import logs as logsmod
from server.erasmus_sources import SOURCES

USER_AGENT = "Mozilla/5.0 (compatible; PoliGoErasmusWatcher/1.0)"
TIMEOUT = 15

_SCRIPT_STYLE_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.I | re.S)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _visible_text(raw_html: str) -> str:
    text = _SCRIPT_STYLE_RE.sub(" ", raw_html)
    text = _TAG_RE.sub(" ", text)
    text = html.unescape(text)
    return _WS_RE.sub(" ", text).strip()


def _fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        charset = r.headers.get_content_charset() or "utf-8"
        return r.read().decode(charset, errors="replace")


def check_source(source: dict) -> dict:
    """One source, one check. Never raises - a failure is reported, not thrown."""
    try:
        text = _visible_text(_fetch(source["url"]))
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        return {"ok": True, "digest": digest, "snippet": text[:280], "error": None}
    except (URLError, HTTPError, socket.timeout, TimeoutError) as e:
        return {"ok": False, "digest": None, "snippet": None, "error": f"{type(e).__name__}: {e}"}
    except Exception as e:
        return {"ok": False, "digest": None, "snippet": None, "error": f"{type(e).__name__}: {e}"}


def scan_sources():
    """Checks every configured source and records one row per source, flagging
    changed=1 when this check's text hash differs from the last stored one."""
    results = []
    with db() as conn:
        for src in SOURCES:
            res = check_source(src)
            prev = conn.execute(
                "SELECT digest FROM erasmus_source_checks WHERE country = ? ORDER BY id DESC LIMIT 1",
                (src["country"],),
            ).fetchone()
            changed = bool(res["ok"] and prev and prev["digest"] and res["digest"] != prev["digest"])
            conn.execute(
                "INSERT INTO erasmus_source_checks (ts, country, agency, url, ok, digest, snippet, error, changed) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (logsmod.now(), src["country"], src["agency"], src["url"],
                 1 if res["ok"] else 0, res["digest"], res["snippet"], res["error"], 1 if changed else 0),
            )
            results.append({**src, **res, "changed": changed})
        ok = sum(1 for r in results if r["ok"])
        changed_n = sum(1 for r in results if r["changed"])
        summary = [{"country": r["country"], "ok": r["ok"], "changed": r["changed"], "error": r["error"]} for r in results]
        logsmod.log_event(
            "INFO", "erasmus_finder",
            f"checked {len(results)} official sites: {ok} ok, {changed_n} changed",
            detail=json.dumps(summary)[:2000], conn=conn,
        )
    return results


def latest():
    """The most recent check per country, newest country name first for a stable order."""
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM erasmus_source_checks "
            "WHERE id IN (SELECT MAX(id) FROM erasmus_source_checks GROUP BY country) "
            "ORDER BY country"
        ).fetchall()
        return [dict(r) for r in rows]
