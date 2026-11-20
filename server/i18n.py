"""Server-side translation overlay.

For each new UI language the server generates the translated strings once,
stores them in the `translations` table and serves them from there forever:
the heavy work runs exactly once per language and the saved result is reused.
The prototype ships Romanian; other languages fall back to English keys.
"""
from server.db import db

# canonical keys are the English UI strings
TRANSLATIONS = {
    "ro": {
        "Map": "Harta",
        "Universities": "Universități",
        "Shortlist": "Lista scurtă",
        "Profile": "Profil",
        "Today": "Astăzi",
        "Calendar": "Calendar",
        "Timeline": "Planificare",
        "Documents": "Documente",
        "Create account": "Creează cont",
        "Log in": "Autentificare",
        "Explore without an account": "Explorează fără cont",
        "Get notified at launch": "Anunță-mă la lansare",
        "Email": "Email",
        "Continue": "Continuă",
        "Back": "Înapoi",
        "Sign in or create an account": "Autentificare sau cont nou",
        "Your documents": "Documentele tale",
        "Language": "Limbă",
        "Theme": "Temă",
        "Dark": "Întunecată",
        "Light": "Luminoasă",
        "Remove document": "Șterge documentul",
        "Upload a copy": "Încarcă o copie",
        "Add manually": "Adaugă manual",
        "Available": "Disponibil",
        "Away": "Plecat",
        "Deadlines": "Termene limită",
        "days to departure": "zile până la plecare",
        "day of": "ziua din",
    },
}


def ensure_language(lang):
    """Translate once, save to the DB, and serve the saved strings after that."""
    table = TRANSLATIONS.get(lang)
    if not table:
        return {"lang": lang, "strings": {}, "generated": False}
    with db() as conn:
        have = {r["key"]: r["text"] for r in conn.execute(
            "SELECT key, text FROM translations WHERE lang = ?", (lang,)
        ).fetchall()}
        missing = {k: t for k, t in table.items() if k not in have}
        if missing:
            conn.executemany(
                "INSERT OR REPLACE INTO translations (lang, key, text) VALUES (?,?,?)",
                [(lang, k, t) for k, t in missing.items()],
            )
            have.update(missing)
    return {"lang": lang, "strings": have, "generated": True}
