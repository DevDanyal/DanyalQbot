# ARCHITECTURE.md — Danyal QBot

## High-level flow

```
        Web dashboard (Next.js)                    Mobile app (future)
        ──────────────────────                    ─────────────────
        /login  /admin  /api/auth/*               /api/v1/*
             │                        │
             ▼                        ▼
    ┌─────────────────────────────────────────────────────┐
    │   Next.js app (Vercel)                              │
    │   - pages (customer + admin)                        │
    │   - API routes (cookie + token)                     │
    │   - /api/v1/* JSON API for external clients         │
    └──────────────┬──────────────────────────────────────┘
                   │ Turso / libSQL (serverless)
                   ▼
    ┌──────────────────────────────┐
    │   Database — source of truth │
    │   customers, licenses,       │
    │   plans, devices, sessions,  │
    │   security_logs, activity    │
    │   -logs, quota accounts      │
    └──────────────────────────────┘
                   │ HTTP (BOT_AUTH_TOKEN-protected)
                   ▼
    ┌──────────────────────────────┐
    │   Flask trading backend      │
    │   (Render / Fly / local)     │
    │   - BotController per buyer  │
    │   - Quotex WebSocket conn    │
    └──────────────────────────────┘
```

## Module layers (web/)

### `src/lib/` — service layer

| File | Responsibility |
|---|---|
| `db.ts` | Turso client, schema init + additive migrations, password hashing (scrypt), session tokens (SHA-256), rate limiting, AES secret encryption, Quotex account CRUD |
| `customers.ts` | Customer (user) records: create, find, update status, extend expiry, reset password, record login, device mirror |
| `licensing.ts` | Plans + licenses: plan CRUD, license create/extend/suspend/activate/revoke, expiry change, plan change, status derivation (`ACTIVE | EXPIRING_SOON | EXPIRED | SUSPENDED`), public DTOs |
| `devices.ts` | Device binding: key hashing, format validation, register/verify/revoke/reset, active device counts, admin view |
| `audit.ts` | `security_logs` + `activity_logs` write and query |
| `auth.ts` | Cookie helpers, client-IP extraction, legacy device fingerprint |
| `auth-service.ts` | The single `loginFlow` gate: auth → account status → license/expiry → device binding → session. Machine-readable error codes. |
| `api-auth.ts` | Bearer-token extraction, session resolution (`resolveAuthFromToken`), admin guard (`requireAdminFromToken`), `ApiError` type |
| `api-v1.ts` | Consistent `apiOk` / `apiFail` response helpers |
| `api.ts` | Client-side fetch helpers for the dashboard UI |

### `src/app/api/v1/` — token-based JSON API (mobile-ready)

All routes authenticate with `Authorization: Bearer <token>`.

| Route | Method | Auth |
|---|---|---|
| `/api/v1/auth/login` | POST | none (public) |
| `/api/v1/auth/logout` | POST | any |
| `/api/v1/auth/logout-all` | POST | customer |
| `/api/v1/auth/me` | GET | any |
| `/api/v1/devices` | GET | customer |
| `/api/v1/devices/:id` | DELETE | customer |
| `/api/v1/licenses/me` | GET | customer |
| `/api/v1/admin/login` | POST | none (master password + rate limit) |
| `/api/v1/admin/users` | GET, POST | admin |
| `/api/v1/admin/users/:id` | GET, PATCH | admin |
| `/api/v1/admin/licenses` | GET, POST | admin |
| `/api/v1/admin/licenses/:id` | GET, PATCH | admin |
| `/api/v1/admin/devices` | GET | admin |
| `/api/v1/admin/devices/:id` | PATCH | admin |
| `/api/v1/admin/devices/reset/:id` | POST | admin |
| `/api/v1/admin/security` | GET | admin |
| `/api/v1/admin/activity` | GET | admin |
| `/api/v1/admin/plans` | GET, POST | admin |
| `/api/v1/admin/plans/:id` | PATCH | admin |
| `/api/v1/admin/stats` | GET | admin |

### Middleware / proxy

`src/proxy.ts` (Next.js middleware) protects web-pages and the legacy cookie
API. `/api/v1/*` paths are intentionally public — the V1 routes do their own
bearer-token authorization so the mobile app is not blocked by cookie checks.

## Database

Uses Turso (libSQL, SQLite-compatible). Full schema is created by
`initSchema()` in `src/lib/db.ts` with additive `ensureColumn` migrations for
already-deployed databases.

Tables:
- `customers` — buyer accounts (user_id, password_hash, status, expires_at mirror, last_login)
- `plans` — subscribable plans (code, duration_days, device_limit, price_cents)
- `licenses` — per-customer license (license_id, plan_id, status, start/expiry, device_limit)
- `devices` — bound devices (device_key_hash, platform, is_active, first/last_seen)
- `sessions` — opaque session tokens (token_hash, role, device_fp, ip, ua, expiry)
- `login_attempts` — rate limiting buckets
- `quotex_accounts` — buyers' Quotex credentials (AES-encrypted)
- `security_logs` — auth failures, device changes, admin ops
- `activity_logs` — benign user actions

Startup seeds 4 default plans from `seedDefaultPlans()`.

## Auth flow (server-side, non-bypassable)

```
POST /api/v1/auth/login { userId, password, deviceKey, platform, label }
  │
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
  │    disabled → DEVICE_UNAUTHORIZED
  ├─ create session (opaque 32-byte token, stored hashed)
  └─ respond { ok, token, user, license, device }
```

Every protected API call hits `resolveAuthFromToken` → verifies the session
token, its expiry, the account, and the license in real time. Expired/suspended
licenses break existing sessions immediately, not just on next login.

## Device security

- Client supplies a high-entropy persistent device key (24–64 chars `[A-Za-z0-9_-]`).
- Only the SHA-256 hash is stored — DB leak does not expose the key.
- Server decides registration/denial; frontend cannot override.
- Admin can revoke individual devices or reset all devices (also kills sessions).
- Never sent back to clients.

## Admin authorization

- Admin logs in with `ADMIN_PASSWORD` (timing-safe compare, rate-limited, 12h session).
- Admin routes call `requireAdminFromToken`, which rejects non-admin sessions.
- Legacy cookie admin routes (`/api/admin/*`) additionally gate on the web cookie session.
- All admin mutations write a `security_logs` entry (actor = admin).

## Testing

- `web` — Vitest, in-memory libSQL, 59 tests (see `src/__tests__/backend.test.ts`).
- `quotex_bot` — pytest, 36 tests.

## Future / Android app

The `/api/v1/*` JSON API is the contract the Android app will speak. The app
does:
1. Generate a persistent device key on first install.
2. `POST /api/v1/auth/login` → get bearer token.
3. Attach `Authorization: Bearer <token>` on subsequent calls.
4. On `LICENSE_EXPIRED` / `DEVICE_UNAUTHORIZED`, show the corresponding screen.