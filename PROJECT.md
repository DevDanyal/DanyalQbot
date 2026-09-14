# Danyal QBot — Project Overview

A commercial, license-gated automated trading platform for Quotex binary
options. Buyers get a web dashboard (and later a mobile app) that controls a
remote trading bot hosted in the cloud.

> **Warning:** The trading strategy has negative expected value long-term and
> Quotex has no official API. This project manages risk and licensing; it does
> not guarantee profit. Use demo accounts for experimentation.

## System at a glance

```
   Web dashboard           Mobile app (planned)         Admin panel
   /login  /qbot  ...      /api/v1/*                    /admin
        \          \            |                          /
         \          \           v                         /
        ┌────────────────────────────────────────────────────┐
        │  Next.js app on Vercel                             │
        │  • customer pages (route group `(app)`)            │
        │  • admin panel (`/admin`)                          │
        │  • cookie API `/api/*`  +  token API `/api/v1/*`   │
        └───────────────────────┬────────────────────────────┘
                                │ Turso (libSQL) — source of truth
        ┌───────────────────────▼────────────────────────────┐
        │  Flask trading backend (Render)                    │
        │  • BotController per buyer                         │
        │  • Quotex WebSocket connection (community api)     │
        │  • backtesting / chart analysis                    │
        └────────────────────────────────────────────────────┘
```

## Repository layout

```
project/
├── web/                  # Next.js 16 app (customer UI + admin + license DB)
│   ├── src/app/(app)/    #    customer app (home, qbot, history, license, …)
│   ├── src/app/admin/    #    admin panel (users, licenses, devices, …)
│   ├── src/app/api/      #    legacy cookie API + /api/v1/* token API
│   ├── src/lib/          #    DB, auth, license, device, notifications services
│   └── src/__tests__/    #    Vitest suite (77 tests)
├── quotex_bot/           # Flask trading backend
│   ├── quotex_bot/web/   #    Flask app (bot control, chart analysis)
│   └── tests/            #    Python tests (36 tests)
├── start_project.bat     # Windows local launcher
├── render.yaml           # Render blueprint for the Flask backend
├── PROJECT.md            # this file
├── ARCHITECTURE.md       # system architecture + data flow
├── SECURITY.md           # security model
├── API.md                # API reference
├── DATABASE.md           # database schema
└── ROADMAP.md            # release roadmap
```

## Documentation map

| Doc | What it covers |
|---|---|
| `ARCHITECTURE.md` | High-level flow, module layers, auth flow, device security |
| `SECURITY.md` | Threat model, password/token handling, admin access, secrets |
| `API.md` | All public & admin endpoints (V1 token API) |
| `DATABASE.md` | Every table, column, index, and seeding behavior |
| `ROADMAP.md` | Release phases: MVP → paid → Android app |
| `web/PROJECT.md` | How to run locally, env vars, live environment |
| `web/ARCHITECTURE.md` | Web app module-by-module detail |

## How to run locally

```bash
# 1. Flask backend (terminal 1)
cd quotex_bot
python run_web.py                    # http://127.0.0.1:8000

# 2. Web app (terminal 2)
cd web
npm install
npm run dev                          # http://localhost:3000
```

Or double-click `start_project.bat`.

## How to test

```bash
cd web && npm test                   # 77 Vitest tests
cd quotex_bot && python -m pytest tests/ -v   # 36 pytest tests
```

## Feature summary

- **Auth** — scrypt password hashing, opaque 32-byte bearer sessions (SHA-256 stored).
- **Licensing** — plans (FREE/PRO/PREMIUM/YEARLY), status derivation ACTIVE /
  EXPIRING_SOON / EXPIRED / SUSPENDED, extension, plan change, expiry.
- **Device binding** — one license = N devices; new devices denied when the
  slot is full unless an admin resets. Only SHA-256 device keys are stored.
- **Notifications** — system + broadcast announcements, unread counts, admin
  broadcast to all active customers.
- **App versions** — per-platform current/minimum/latest versions for future
  force-update in the mobile app.
- **Admin** — user/license/device/plan CRUD, security & activity logs, stats,
  announcements, app-version management.
- **Security** — rate limiting (5 attempts/15 min), timing-safe compares, audit
  logging, AES-256-GCM encrypted Quotex credentials.
- **Trading** — Flask backend with per-buyer BotController, WebSocket connection
  to Quotex, 5s scalping strategy, backtest support, chart analysis.