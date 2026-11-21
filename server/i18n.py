"""Server-side translation overlay.

For each new UI language the server generates the translated strings once,
stores them in the `translations` table and serves them from there forever:
the heavy work runs exactly once per language and the saved result is reused.
The prototype ships Romanian; other languages fall back to English keys.
"""
from server.db import db
from server.i18n_ro import RO

# canonical keys are the English UI strings; the Romanian table lives in i18n_ro.py
TRANSLATIONS = {"ro": RO}


def ensure_language(lang):
    """Translate once, save to the DB, and serve the saved strings after that."""
    table = TRANSLATIONS.get(lang)
    if not table:
        return {"lang": lang, "strings": {}, "generated": False}
    with db() as conn:
        have = {r["key"]: r["text"] for r in conn.execute(
            "SELECT key, text FROM translations WHERE lang = ?", (lang,)
        ).fetchall()}
        # insert new keys AND refresh any saved text that changed in the table, so
        # an improved translation reaches databases created by older versions
        changed = {k: t for k, t in table.items() if have.get(k) != t}
        if changed:
            conn.executemany(
                "INSERT OR REPLACE INTO translations (lang, key, text) VALUES (?,?,?)",
                [(lang, k, t) for k, t in changed.items()],
            )
            have.update(changed)
    return {"lang": lang, "strings": have, "generated": True}
