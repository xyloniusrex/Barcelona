"""Deletes data that has passed its own expiry date.

Login verification codes are handled separately (server/auth.py enforces
expiry at verify-time and the row is deleted the moment it is used or
rejected) and are intentionally not touched here - this only covers data
whose expiry the rest of the app does not already clean up on its own:
identity documents (ID card, passport, EHIC...) past their expires_on date.
"""
from datetime import date

from server.db import db
from server import logs as logsmod


def cleanup_expired():
    """One pass. Returns how many expired documents were deleted, and which."""
    today = date.today().isoformat()
    with db() as conn:
        rows = conn.execute(
            "SELECT id, user_id, doc_type, expires_on FROM user_docs "
            "WHERE expires_on IS NOT NULL AND expires_on != '' AND expires_on < ?",
            (today,),
        ).fetchall()
        items = [dict(r) for r in rows]
        if items:
            conn.executemany("DELETE FROM user_docs WHERE id = ?", [(r["id"],) for r in items])
            for r in items:
                logsmod.log_event(
                    "INFO", "cleanup", f"deleted expired document: {r['doc_type']}",
                    user_id=r["user_id"], detail=f"expires_on={r['expires_on']}", conn=conn,
                )
        else:
            logsmod.log_event("INFO", "cleanup", "no expired documents to delete", conn=conn)
    return {"deleted": len(items), "items": items}
