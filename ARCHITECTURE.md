# Danyal QBot — Architecture

High-level view and data flow for the whole system. For a module-by-module
walkthrough of the web app, see `web/ARCHITECTURE.md`.

```
        Web dashboard (Next.js)                    Mobile app (future)
        ──────────────────────                    ─────────────────
        /login  /admin  /api/auth/*               /api/v1/*
             │                        │
             ▼                        ▼
    ┌─────────────────────────────────────────────────────┐
    │   Next.js app (Vercel)                              │
    │   - customer pages (route group `(app)`)           │
    │   - admin panel (/admin)                           │
    │   - API routes (cookie + token)                    │
    │   - /api/v1/* JSON API for external clients        │
    └──────────────┬──────────────────────────────────────┘
                   │ Turso / libSQL (serverless)
                   ▼
    ┌──────────────────────────────┐
    │   Database — source of truth │
    │   customers, plans,          │
    │   licenses, devices,         │
    │   sessions, quotex_accounts, │
    │   security/activity logs,    │
    │   notifications, app_versions│
    └──────────────────────────────┘
                   │ HTTP (BOT_AUTH_TOKEN-protected)
                   ▼
    ┌──────────────────────────────┐
    │   Flask trading backend      │
    │   (Render / Fly / local)     │
    │   - BotController per buyer  │
    │   - Quotex WebSocket conn    │
    │   - backtest + chart analysis│
    └──────────────────────────────┘
```

## Web app layers (`web/src/`)

| Area | Responsibility |
|---|---|
| `app/(app)/` | Customer app shell + pages: Home, QBot, History, License, Notifications, Profile, Settings, Support. Mobile bottom nav + desktop sidebar. |
| `app/admin/` | Owner-only panel: dashboard, users, licenses, devices, plans, security, activity, notifications, settings. |
| `app/api/` | Legacy cookie-based endpoints (`/api/auth/*`, `/api/bot/*`, `/api/account/quotex`, `/api/stats`, …). |
| `app/api/v1/` | Token-based JSON API (`Authorization: Bearer`). The contract future mobile apps speak. |
| `lib/` | Services: `db`, `auth`, `auth-service` (loginFlow), `api-auth` (token resolution), `customers`, `licensing`, `devices`, `notifications`, `app-version`, `audit`. |
| `components/` | Reusable UI: app primitives (`app-ui`), dashboard components (auto-trader, quotex-account, chart-analyst, history-view), admin helpers. |
| `proxy.ts` | Next.js middleware for cookie-auth page gating. `/api/v1/*` is public to the middleware — V1 routes authorize themselves. |

## Key flows

### Login (server-side, non-bypassable)

```
POST /api/v1/auth/login { userId, password, deviceKey, platform, label }
  ├─ validate input & deviceKey format
  ├─ rate-limit by (ip + userId)
  ├─ look up customer by userId
  ├─ verify password (scrypt, timing-safe)
  ├─ account status == active
  ├─ license exists
  ├─ license status ACTIVE (not SUSPENDED / EXPIRED)
  ├─ device check:
  │    known + active → allowed
  │    unknown + slot free → register
  │    unknown + no slot → DEVICE_UNAUTHORIZED
  │    disabled       → DEVICE_UNAUTHORIZED
  ├─ create session (opaque 32-byte token, stored hashed)
  ├─ auto-notify on license_expiring / suspended / expired / new device
  └─ respond { ok, token, user, license, device }
```

Every protected call runs `resolveAuthFromToken` → verifies token, expiry,
account status, and license **in real time**, so a suspended/expired license
breaks existing sessions immediately.

### Trading

Web calls the Flask backend (protected by `BOT_AUTH_TOKEN` shared secret).
The backend runs one `BotController` per buyer over a WebSocket connection to
Quotex, executes the EMA-trend + candle-strength strategy, applies risk rules
(fixed % bet, daily loss limit, kill-switch), and exposes status/stats/history.

### Notifications & app versions

`lib/notifications.ts` writes system alerts on login-side license changes
(deduplicated 6h per type) and supports admin broadcast to all active
customers. `lib/app-version.ts` stores per-platform (android/ios/web)
current/minimum/latest versions for future force-update checks.

## Middleware / proxy

- Web pages (non-public) are gated by cookie auth in `src/proxy.ts`.
- `/api/v1/*` paths are **not** gated by the middleware — each V1 route does
  its own bearer-token authorization so mobile apps are never blocked by
  cookie checks.

For the complete endpoint list see `API.md`. For the schema see `DATABASE.md`.