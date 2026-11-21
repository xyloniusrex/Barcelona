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
  auth.py             login with a @student.upt.ro address + 6-digit code (no sign-up)
  seed.py             8 partner universities, courses, precomputed matches (idempotent)
  i18n.py, i18n_ro.py server-side translation table (Romanian), refreshed on every request
  anim/               Pillow MJPEG clips - no longer used by the UI (the intro is drawn on the device)
web/                  static PWA (no build step): vanilla JS + canvas globe
  js/app.js           screens, router, top bar, Home, intro, all text through T()
  js/stage.js         every globe scene: page background, Home, Map, journey intro
  js/globe.js         canvas globe (d3-geo orthographic), Natural Earth 110m data
  js/store.js         state + API client, mirrors user data to localStorage
  js/term.js          hidden command line (backquote key)
  sw.js               cache policy (see below)
tools/                map/icon generators (deterministic, committed output)
```

### What runs where

| Concern | Device | Server |
| --- | --- | --- |
| App shell, globe, screens | yes (cached PWA, installs on phone) | static files only |
| Animations | drawn on the device (vector canvas, sharp at any size) | nothing |
| Course catalogue + match summaries | cached on first load | SQLite, precomputed |
| User data (profile, shortlist, mobility, tasks, scans) | offline mirror | SQLite, always authoritative |
| Document scans | image never leaves the device in the prototype; only the JSON result is stored | hook for the vision model |

### Caching rules (why the server stays idle)

- **Reused constantly** (shell, map geometry, university/course catalogue,
  animation clips): served once, then `cache-first` in the service worker —
  `poligo-anim-v1` for clips, `poligo-v1-data` for seed endpoints.
- **One-time use** (scan results): fetched once per device, never re-fetched.
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

## Using the app

- **Log in**: only `name@student.upt.ro` addresses are accepted, there is no
  separate sign-up (the first successful login creates the account). Without an
  SMTP server configured the 6-digit code is shown on screen.
- **Top bar** (always there): the PoliGo logo takes you to **Home**; next to it
  the language (RO/EN), the theme (dark/light), the Home button and the Profile
  button (log out lives in Profile).
- **Home**: the globe with Romania and your destination, a live countdown in
  days / hours / minutes and the menu. After "I got accepted" a full-screen intro
  flies from Timișoara to the partner city and shows up on every launch.
- **Background**: every screen has the planet behind it; once you open or accept
  a university it frames Romania and the partner country side by side.
- Dates are always entered and shown as day.month.year.

## Data + demo path

Partner universities (demo data - confirm the real agreements with the UPT
Erasmus Office): St. Pölten UAS, Instituto Politécnico de Setúbal,
UC Leuven-Limburg, Vidzeme UAS, Saxion, Hochschule Fulda, JAMK and MATE. Six
Computer Science year-3/spring subjects with precomputed Good/Partial/No-match
rows. Adding a university = adding it to `server/seed.py` (rows that are
missing are inserted on the next start; existing databases keep their data).

Demo flow: Landing -> Log in -> Setup -> Home -> Map -> University detail (with a
link to its site) -> Shortlist -> "I got accepted" (day/month/year pickers) ->
**waiting for approval** (Home shows the request; it checks every 30 s) -> an admin
approves it in `/#admin` -> intro -> Home with countdown -> Today / Plan (steps +
calendar) / Documents (Erasmus papers + your ID documents + scans) / Profile.
The scanner returns a canned vision-model result; the real model call plugs into
`POST /api/scan`, API key stays server-side.

### Admin

There is no admin *account*: the admin panel is a screen protected by a token.

1. Get the token: `docker compose exec poligo cat /app/data/admin_token.txt`
   (or set your own with the `POLIGO_ADMIN_TOKEN` environment variable).
2. Open `http://<host>:8000/#admin` (or press the backquote key and type `admin`).
3. Paste the token. Tabs: **Approvals** (approve / reject "I got accepted"
   requests; the student gets a message in Profile), Summary, Logs, Messages.

### On a phone

PoliGo is a PWA: there is nothing to download from a store. Put it on a public
HTTPS address (see the Cloudflare Tunnel section below; phones only install
PWAs over HTTPS), open it on the phone, then **Android / Chrome**: menu ->
*Install app* (or the *Install the app* button in Profile); **iPhone / Safari**:
Share -> *Add to Home Screen*. It then opens full screen with its own icon.

Romanian lives in `server/i18n_ro.py`; any string missing there simply shows in
English. To add a language, add a table next to it and register it in `i18n.py`.

## What's intentionally out of scope for the prototype

- Live AI matching of user-uploaded PDFs (hooks exist; matches are precomputed)
- LA-draft PDF export, compare screen, return/recognition screen

## Expose on a domain (Cloudflare Tunnel)

`docker-compose.yml` ships an optional `cloudflared` connector service. It is
off by default and joins the same network as `poligo`, so the dashboard only
needs the internal name:

1. Cloudflare Zero Trust -> Networks -> Tunnels -> Create tunnel -> copy the connector token.
2. Save it in a `.env` file next to `docker-compose.yml` (`CLOUDFLARE_TOKEN=...`).
   The token is a secret - never commit it.
3. Start everything:
   ```
   docker compose --profile tunnel up -d
   ```
4. Back in the dashboard, add a public hostname for the tunnel ->
   Service: `HTTP` / `poligo:8000`.

Why manual `docker run` recipes often fail on Linux servers:
`host.docker.internal` only exists on Docker Desktop. Inside the compose
network this problem disappears (that is why the service here targets
`poligo:8000` over plain HTTP). For an ad-hoc share without an account:

```
docker run --rm -d --name cloudflared --add-host=host.docker.internal:host-gateway \
  cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://host.docker.internal:8000
```

Quick-URLs are random and die with the container; use a named tunnel for a
real deployment. The admin panel (`/#admin`) is reachable from the domain and
protected only by the token in `data/admin_token.txt` inside the container.
