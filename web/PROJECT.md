# PROJECT.md — Danyal QBot

## What this project is

Danyal QBot is a commercial license-gated trading bot product:

- **Web dashboard** — a Next.js app (`web/`) where buyers log in, manage their Quotex account, start/stop the trading bot, and view history.
- **Admin panel** — license/user/device management for the owner (`/admin`).
- **Trading backend** — a Flask service (`quotex_bot/`) that wraps the Quotex trading logic.
- **Mobile app (planned)** — will talk to the same backend through the `/api/v1/*` JSON API.
- **Vercel** — hosts the Next.js frontend + license database.
- **Turso** — serverless libSQL database; the source of truth for licensing, sessions, devices, and audit logs.

## Live environment

- **Site:** https://danyalqbot.vercel.app
- **Buyer login:** `/login`
- **Admin panel:** `/admin`
- **Backend API (V1) prefix:** `/api/v1/*`

## Repository layout

```
project/
├── web/                      # Next.js 16 app (frontend + API + DB)
│   ├── src/app/api/v1/       # Token-based JSON API (for mobile + web)
│   ├── src/app/api/          # Legacy cookie-based web API
│   ├── src/lib/              # DB, auth, license, device, audit services
│   └── src/__tests__/        # Vitest test suite (59 tests)
├── quotex_bot/               # Flask trading backend
│   ├── quotex_bot/web/       # Flask app (bot control, chart analysis)
│   └── tests/                # Python unit tests (36 tests)
├── start_project.bat         # Local launcher
└── render.yaml               # Render blueprint for the Flask backend
```

## How to run locally

Requires Node.js 18+ and Python 3.10+.

```bash
# 1. Backend (terminal 1)
cd quotex_bot
python run_web.py          # http://127.0.0.1:8000

# 2. Web app (terminal 2)
cd web
npm install
npm run dev                # http://localhost:3000
```

Or double-click `start_project.bat` on Windows.

### Environment variables

Local: `web/.env.local` (web) and `quotex_bot/.env` (backend). See
`web/.env.example` for the full list. On Vercel, set these as Production env
vars:

| Variable | Purpose |
|---|---|
| `TURSO_DATABASE_URL` | Turso/libSQL database URL |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `ADMIN_PASSWORD` | Master admin password |
| `ENCRYPTION_KEY` | 32-byte base64 AES-256-GCM key for Quotex secrets |
| `BOT_AUTH_TOKEN` | Shared token the web app uses to call the Flask backend |
| `FLASK_URL` | URL of the deployed Flask backend |

## How to run tests

```bash
# Web / backend foundation tests
cd web
npm test

# Python trading backend tests
cd quotex_bot
python -m pytest tests/ -v
```

## Feature summary

- **Auth:** password login (scrypt hashing), opaque bearer sessions (SHA-256).
- **License:** plans (FREE/PRO/PREMIUM/YEARLY), ACTIVE / EXPIRING_SOON / EXPIRED / SUSPENDED status derivation, extension, plan change, expiry.
- **Device binding:** one license = N devices, first device registers, others rejected unless admin resets.
- **Admin:** user CRUD, license CRUD, device revoke/reset, security + activity logs, plans, stats.
- **Security:** rate limiting (5 attempts/15 min), timing-safe admin password check, audit logging, encrypted secrets, SQL parameterization.

## Where secrets live

- Never commit credentials. `.env.local`, `.env`, `session.json`, `data/` are gitignored.
- Passwords hashed with scrypt + per-user salt (Node `crypto.scryptSync`).
- Quotex buyer passwords encrypted with AES-256-GCM (`ENCRYPTION_KEY`).