# SECURITY.md — Danyal QBot

Security decisions and hardening notes. The backend + DB are the source of
truth. Nothing security-critical is decided in the frontend/mobile.

## Core principles

1. **Server is authoritative.** License validity, expiry, and device limits are
   checked in `auth-service.ts` / `api-auth.ts` against the database, on every
   request. Client code cannot bypass.
2. **No secrets in the frontend.** No admin password, DB token, encryption key,
   or device keys are ever sent to the browser. Only opaque session tokens.
3. **Fail closed.** Missing config → 503, not open access.

## Password handling

- **Hash:** Node `crypto.scryptSync(password, per-user-salt, 64)`, stored as `salt:hash`.
- **Verify:** re-derives and compares with `timingSafeEqual`.
- Admin password compare is also timing-safe (`Buffer` + `timingSafeEqual`).
- Passwords are never logged.

## Session/token security

- Session token = 32 random bytes (256-bit entropy), hex-encoded.
- Stored only as SHA-256 hash (`sessions.token_hash`) — DB leak doesn't give usable tokens.
- TTL: 7 days for customers, 12 hours for admin.
- On `resolveAuthFromToken`: token exists → not expired → (customer) account active → license ACTIVE.
- Logout revokes the session row; `logout-all` revokes every session for the account.
- Suspending a license or resetting devices revokes the related sessions.

## Device binding

- Client sends a high-entropy **device key** (24–64 chars) on login.
- Server stores only `SHA-256(deviceKey)`.
- First login from an unknown device registers it if the license has free slots.
- A second device on a 1-device license is rejected (`DEVICE_UNAUTHORIZED`).
- Disabled devices are rejected even if they were previously registered.
- Admin can revoke a device or reset all devices; that kills its sessions.
- The device key is never returned to the client after registration.

## Brute-force / abuse protection

- Rate limiting per `(IP + userId)` for customer login: max 5 attempts per
  15-minute window, then a 15-minute lockout.
- Rate limiting per IP for admin login: same policy.
- Failed attempts increment the bucket; successful login clears it.
- Buckets stored in `login_attempts`.

## Input validation

- `userId` trimmed + uppercased.
- `deviceKey` must match `/^[A-Za-z0-9_-]{24,64}$/` before hashing.
- Password length ≥ 6.
- All numeric inputs (`days`, `deviceLimit`, `expiresAt`, `limit`) validated with `Number.isFinite` + range checks.
- JSON parse failures → 400 `INVALID_INPUT`.

## SQL injection

All queries use parameterized statements (`?` placeholders with args). No
string interpolation of user input into SQL.

## Encryption at rest

- **Quotex buyer passwords** are encrypted with AES-256-GCM; key from `ENCRYPTION_KEY` (base64 32 bytes).
- Format: `iv.tag.ciphertext` (base64). GCM provides authenticity.
- Set `ENCRYPTION_KEY` only on the server; never in the repo.

## CORS / transport

- Vercel + Next.js handle CORS at platform level; API routes are same-origin
  or bearer-token clients.
- All production traffic is HTTPS (Vercel).
- Cookie-based web sessions: `httpOnly`, `sameSite=lax`, `secure`.

## Secure error responses

- Errors use stable machine-readable codes: `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `LICENSE_MISSING`, `LICENSE_SUSPENDED`, `LICENSE_EXPIRED`, `DEVICE_UNAUTHORIZED`, `RATE_LIMITED`, `AUTH_REQUIRED`, `ADMIN_REQUIRED`, `SERVICE_UNAVAILABLE`.
- `apiFail()` never leaks stack traces or DB internals.

## Audit logging

- `security_logs`: failed logins, rate limits, device registrations/revocations, admin actions (user create/suspend/activate, password reset, device reset, license ops, plan ops).
- `activity_logs`: logins, logouts, device self-revocations.
- Never log passwords, tokens, or device keys.

## Secrets & env management

| Secret | Env var | Notes |
|---|---|---|
| Turso DB URL | `TURSO_DATABASE_URL` | Vercel + local `.env.local` |
| Turso token | `TURSO_AUTH_TOKEN` | Full DB access — keep private |
| Admin password | `ADMIN_PASSWORD` | Switch per environment |
| AES key | `ENCRYPTION_KEY` | 32-byte base64 |
| Flask shared token | `BOT_AUTH_TOKEN` | Must match Vercel + Flask |
| Flask URL | `FLASK_URL` | |

All env files (`.env`, `.env.local`) are gitignored.

## Known limitations / next steps

- Admin login has **one** global password, not per-admin accounts. Fine for a
  single-owner product; move to per-admin accounts with RBAC when multiple
  operators exist.
- Device fingerprint relies on the client-supplied device key. On a rooted
  device the key could be copied; a hardware-backed key (Android Keystore) is
  the upgrade path for the mobile app.
- Session tokens are bearer tokens — if a token leaks, the holder can use it
  until expiry. Keep tokens out of logs; the Android app must store them in
  secure storage.