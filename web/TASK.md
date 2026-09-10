# TASK.md — Danyal QBot

Task list and progress tracker for turning this project into a professional
commercial product with an Android app.

## Definitions of done

- Backend is the source of truth for license validity (never the frontend).
- License expiry/status checked server-side on every protected request.
- Device binding enforced server-side; frontend cannot bypass.
- Admin endpoints protected; customers cannot reach them.
- No secrets in repo, frontend, or logs.
- Full test suite passes.

---

## Completed

### Backend foundation (this sprint)

- [x] Inspect existing architecture (Next.js web, token V1 API, Turso DB, Flask backend).
- [x] Fix critical middleware bug: `/api/v1/*` routes were blocked by the cookie-only auth middleware (mobile bearer tokens couldn't reach the API). Now pass through and self-authorize.
- [x] Fix `set_expiry` admin action that imported a nonexistent `extendConsumer` function.
- [x] Add token-based admin login: `POST /api/v1/admin/login` (timing-safe, rate-limited, 12h session).
- [x] Add rate limiting to admin login (previously none).
- [x] Add admin endpoints:
  - `GET /api/v1/admin/security` (security logs)
  - `GET /api/v1/admin/activity` (activity logs)
  - `GET /api/v1/admin/devices` (all devices)
  - `PATCH /api/v1/admin/devices/:id` (revoke/deactivate/activate device)
  - `POST /api/v1/admin/devices/reset/:id` (reset all devices for a user)
  - `GET/POST /api/v1/admin/plans` and `PATCH /api/v1/admin/plans/:id` (plan CRUD)
  - `GET /api/v1/admin/stats` (dashboard summary)
  - `GET /api/v1/admin/users/:id` (single user detail: license, devices, sessions, logs)
  - `GET /api/v1/admin/licenses/:id` (license detail)
- [x] Fix type errors in `auth-service.ts`, `licensing.ts`, admin routes.
- [x] Write 59 automated tests (Vitest, in-memory libSQL) covering:
  - password hashing, session create/validate/revoke, rate limiting
  - customer CRUD, plan CRUD, license create/status/extend
  - device register/verify/revoke/reset, device limit enforcement
  - audit logging, login flow success/failure paths, token resolution, admin authorization
- [x] Run existing Python tests (36) — all pass.
- [x] Create docs: `PROJECT.md`, `ARCHITECTURE.md`, `SECURITY.md`, `API.md`, `TASK.md`.

## Remaining

### Money / payments
- [ ] Choose payment provider (Razorpay / Stripe / manual).
- [ ] Purchase flow: create/assign plans to a license.
- [ ] Auto-renew or manual renewal notifications.

### Android app (next major milestone)
- [ ] Native Android app (Kotlin) that talks to `/api/v1/*`.
- [ ] Persistent device key from Android Keystore (hardware-backed).
- [ ] Login screen → dashboard → license status screen.
- [ ] Handle `LICENSE_EXPIRED`, `DEVICE_UNAUTHORIZED`, `RATE_LIMITED` states.
- [ ] Google Play listing + release.

### Hardening / production
- [ ] Move admin login from single shared password to per-admin accounts + RBAC.
- [ ] Deploy Flask backend to Render (needs payment card) and update `FLASK_URL`.
- [ ] Add per-IP + per-account login rate limiting on the legacy cookie routes.
- [ ] Consider refresh tokens vs long-lived bearer tokens (currently 7-day TTL).
- [ ] Add email notifications (password reset, license expiration).
- [ ] Add a public status page / health endpoint for the bot backend.

---

## Recommended next task

**Build the Android app login + license flow.** The V1 API is complete and
tested. The app should:
1. Register a hardware-backed device key (Android Keystore) on first launch.
2. `POST /api/v1/auth/login` with `{ userId, password, deviceKey }`.
3. Store the token in EncryptedSharedPreferences.
4. Render the license status returned by the API.
5. On `DEVICE_UNAUTHORIZED` show "request device reset"; on `LICENSE_EXPIRED`
   show the renewal screen.

Before starting the app, decide the monetization path (manual key sale vs a
store purchase) since that determines whether the Play app is a simple
"login with your DQB account" client.