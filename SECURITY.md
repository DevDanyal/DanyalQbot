# Danyal QBot — Security Model

Security invariants for the platform. Detailed notes: `web/SECURITY.md`.

## Threat model

The product sells paid licenses and binds them to physical devices, so the
main threats are credential theft, license sharing, and account takeovers. The
backend is the source of truth for every authorization decision.

## Core invariants

1. **Passwords** — hashed with scrypt + per-user random salt (Node
   `crypto.scryptSync`). Never stored or returned in plain text.
2. **Session tokens** — opaque 32-byte random tokens; only their SHA-256 hash
   is stored. Expiry 7d (customer) / 12h (admin).
3. **Device binding** — clients send a high-entropy device key (24–64 chars
   `[A-Za-z0-9_-]`). Only `SHA-256(device_key)` is stored, so a DB leak exposes
   neither the key nor a usable login credential.
4. **Real-time authorization** — every protected call re-checks the session,
   account status, and license status. Revoking a license kills sessions
   immediately, not on next login.
5. **No client trust** — the server decides device registration, license
   status, and bets. The frontend can never override these.

## Auth endpoints

| Path | Protection |
|---|---|
| `POST /api/v1/auth/login` | rate-limited (5 attempts / 15 min per bucket), timing-safe password compare |
| `POST /api/v1/auth/change-password` | requires current password, revokes all other sessions (current session re-issued) |
| `POST /api/v1/auth/logout-all` | revokes every session for the customer |
| `POST /api/v1/admin/login` | `ADMIN_PASSWORD` timing-safe compare + rate limit, 12h session |
| All `/api/v1/admin/*` | `requireAdminFromToken` rejects non-admin tokens on every call |

## Credentials & secrets

- **Never commit** credentials. `.env.local`, `.env`, `session.json`, `data/`
  are gitignored.
- On Vercel, set env vars as Production secrets:
  - `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` — database
  - `ADMIN_PASSWORD` — master admin password (rotate regularly)
  - `ENCRYPTION_KEY` — 32-byte base64 AES-256-GCM key
  - `BOT_AUTH_TOKEN` — shared secret web↔Flask
  - `FLASK_URL` — deployed Flask backend URL
- Buyers' Quotex credentials are encrypted with AES-256-GCM
  (`ENCRYPTION_KEY`) before storage (`quotex_accounts.password_enc`).
- `ADMIN_PASSWORD` is verified with a timing-safe compare.

## Defense in depth

- SQL is fully parameterized (libSQL prepared statements) — no string-built SQL.
- Admin panel pages also check login state client-side, but **authorization is
  enforced server-side on every admin route**.
- All admin mutations and security-relevant events append to `security_logs`
  with actor, action, detail, IP.
- All admin mutations and security-relevant events append to `security_logs`.

## Alerts & audit

`lib/audit.ts`:
- `security_logs` — auth failures, device changes, admin ops (dangerous).
- `activity_logs` — benign user activity.

`lib/notifications.ts` — customers are auto-notified (with 6h dedupe) when
their license hits `EXPIRING_SOON`, `EXPIRED`, or `SUSPENDED`, and when a new
device registers on their account (defense against silent account takeover).