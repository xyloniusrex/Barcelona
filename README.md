# PoliGo

Erasmus companion for Politehnica University Timișoara students. Load your
subjects, see on the globe how many match at each partner university, and after
"I got accepted" the app walks your whole mobility: timeline, scanned documents,
credit recognition.

**Leave on Erasmus. Come back with every credit.**

## Architecture (prototype)

Single small container, deliberately thin server, heavy on-device caching:

```
Dockerfile            python:3.12-slim + FastAPI + SQLite + Pillow
server/
  main.py             thin JSON API + static hosting (all user data -> SQLite)
  db.py               schema + WAL SQLite, single file on a volume
  seed.py             4 partner universities, courses, precomputed matches
  anim/render.py      Pillow frame renderers (orthographic globe, arc, pulses)
  anim/streams.py     MJPEG endpoints: clips render once, then stream from memory
web/                  static PWA (no build step): vanilla JS + canvas globe
  js/globe.js         2D orthographic canvas globe, Natural Earth 110m data
  js/anim.js          fetches each MJPEG clip once, replays it from device cache
  js/store.js         state + API client, mirrors user data to localStorage
  sw.js               cache policy (see below)
tools/                map/icon generators (deterministic, committed output)
```

### What runs where

| Concern | Device | Server |
| --- | --- | --- |
| App shell, globe, screens | yes (cached PWA, installs on phone) | static files only |
| Animations | played back from device cache | Python/Pillow renders each clip once, streams MJPEG |
| Course catalogue + match summaries | cached on first load | SQLite, precomputed |
| User data (profile, shortlist, mobility, tasks, scans) | offline mirror | SQLite, always authoritative |
| Document scans | image never leaves the device in the prototype; only the JSON result is stored | hook for the vision model |

### Caching rules (why the server stays idle)

- **Reused constantly** (shell, map geometry, university/course catalogue,
  animation clips): served once, then `cache-first` in the service worker —
  `poligo-anim-v1` for clips, `poligo-v1-data` for seed endpoints.
- **One-time use** (transition animation, dots countdown, scan results):
  rendered/streamed once per device, never re-fetched.
- **User data**: always written to SQLite; reads mirror to localStorage so the
  app opens offline with the last known state.

## Run

```bash
docker compose up --build      # http://localhost:8000
```

Without Docker:

```bash
pip install -r requirements.txt
uvicorn server.main:app --port 8000
```

Regenerating the committed generated data:

```bash
python tools/build_map.py      # web/data/countries-110m.geojson
python tools/make_icons.py     # web/icons/*.png
```

## Data + demo path

Seed partners (E³UDRES² list from the spec): St. Pölten UAS, Instituto
Politécnico de Setúbal, UC Leuven-Limburg, Vidzeme UAS. Six Computer Science
year-3/spring subjects with precomputed Good/Partial/No-match rows.

Demo flow: Welcome → Profile → Subjects → Map (globe dot animation) →
University detail → Shortlist → "I got accepted" (2.2 s Python-rendered
transition, greeting in the destination language) → Today → Timeline →
Scan (canned vision-model result; the real model call plugs into
`POST /api/scan`, API key stays server-side) → Docs.

## What's intentionally out of scope for the prototype

- Live AI matching of user-uploaded PDFs (hooks exist; matches are precomputed)
- Email magic-link auth (device-scoped user ids in the prototype)
- LA-draft PDF export, compare screen, return/recognition screen
