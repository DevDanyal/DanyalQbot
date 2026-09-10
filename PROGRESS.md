# Project Status — handoff notes

Last updated: 2026-09-10

Everything below is committed and pushed to GitHub (`origin/main`).
Secrets live ONLY in gitignored local files and Vercel env vars — never in the repo.

Latest commit: `1a10379` (token-based V1 API, admin endpoints, tests, docs).

---

## Session 2026-09-10 — Professional backend foundation (DONE + committed)

Goal: turn the app into a professional commercial product backend, ready for a
future Android app. Backend/DB is now the source of truth for license validity.

### What changed

- **Fixed critical middleware bug** (`web/src/proxy.ts`): `/api/v1/*` routes were
  blocked by the cookie-only middleware, so bearer-token clients (mobile) couldn't
  reach the API. They now pass through and self-authorize.
- **Fixed `set_expiry`** admin action in `web/src/app/api/v1/admin/licenses/[id]/route.ts`
  (imported nonexistent `extendConsumer`; now uses `setLicenseExpiry`).
- **Added token-based admin login**: `POST /api/v1/admin/login` — timing-safe master
  password check, rate-limited (5/15min), 12h session.
- **Added admin endpoints** (all under `/api/v1/admin/*`, admin-token gated):
  - `GET security` (security logs), `GET activity` (activity logs)
  - `GET devices`, `PATCH devices/[id]` (revoke/deactivate/activate), `POST devices/reset/[id]`
  - `GET/POST plans`, `PATCH plans/[id]`
  - `GET stats` (dashboard summary)
  - `GET users/[id]` (user + license + devices + sessions + logs)
  - `GET licenses/[id]`
- **Type/import fixes** in `auth-service.ts`, `licensing.ts`, `api-auth.ts`, admin routes.
- **Tests**: Vitest suite added — `web/src/__tests__/backend.test.ts` (59 tests) using
  in-memory libSQL. **All 59 pass.** Run with `cd web && npm test`.
  Added `web/vitest.config.ts`, `web/src/__tests__/setup.ts`, `"test"` script in `package.json`.
- **Python backend tests**: all 36 pass (`cd quotex_bot && python -m pytest tests/ -v`).
- **Docs** (in `web/`): `PROJECT.md`, `ARCHITECTURE.md`, `SECURITY.md`, `API.md`, `TASK.md`.

### V1 API summary (for the Android app — this is the contract)

Base `/api/v1`, auth via `Authorization: Bearer <token>`:
`POST auth/login`, `POST auth/logout`, `POST auth/logout-all`, `GET auth/me`,
`GET devices`, `DELETE devices/[id]`, `GET licenses/me`, plus admin routes above.

Full endpoint + error-code reference: `web/API.md`.

### Verified

- `npm run build` — passes (all V1 routes listed).
- `npm test` — 59/59 pass.
- `cd quotex_bot && python -m pytest tests/` — 36/36 pass.
- `npm run lint` — 1 pre-existing error in `quotex-account.tsx` (react-hooks
  set-state-in-effect, not from this session); everything else clean.
- Removed stray empty `,` file at repo root.

### Notes / gotchas for next time

- Tests must pass `db` explicitly to functions that accept it
  (`resolveAuthFromToken`, `requireAdminFromToken`, etc.) because without it they
  call `getDb()` internally and bypass the `getDb` mock.
- In-memory libSQL requires `setLiteral` open; see `web/src/__tests__/setup.ts`.
- vitest@5 needed `--legacy-peer-deps` (peer @types/node ^22 vs project ^20).
- `web/tsconfig.json` excludes `src/__tests__` from the Next build.

### Next steps (tomorrow)

1. **Android app** — login + license flow against `/api/v1/*`; see `web/TASK.md`.
2. **Monetization** — pick payment provider (Razorpay/Stripe/manual), purchase flow.
3. **Deploy Flask backend on Render** (blocked on card) + update `FLASK_URL`.
4. **Hardening** — per-admin accounts/RBAC, email notifications, refresh tokens.

---

---

## What is live right now

- **Site:** https://danyalqbot.vercel.app (Vercel, project `danyalqbot`)
- **Customer/buyer login:** `/login` — buyer enters the ID + password you give them.
- **Admin panel:** `/admin` — admin can create licenses, suspend/revoke, extend +30d.
- **Buyer Quotex account manager:** each buyer connects their OWN Quotex account
  (email + password), picks **Demo** or **Live**, can add multiple and switch / remove.
  Passwords are AES-256-GCM encrypted in Turso via `ENCRYPTION_KEY`.

## Test credentials (for trying it)

| Role | URL | Login |
|------|-----|-------|
| Buyer | https://danyalqbot.vercel.app/login | `TEST-0001` / `testpass123` |
| Admin | https://danyalqbot.vercel.app/admin/login | password `dPkWwRAGX7yL96mfF0KTE4hz` |

- Test buyer's connected Quotex account on the dashboard: `buyer1.demo@gmail.com` (demo).

## Environment variables

Set on Vercel (Production): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
`ADMIN_PASSWORD`, `ENCRYPTION_KEY`, `BOT_AUTH_TOKEN`, `FLASK_URL`.

Locally mirrored in `web/.env.local` (dev) and `quotex_bot/.env` (backend, incl. `BOT_AUTH_TOKEN`).

---

## Architecture pointers (where things live)

- License DB, sessions, rate limiting, encryption → `web/src/lib/db.ts`
- Buyer/owner auth helpers → `web/src/lib/auth.ts`, `web/src/lib/customers.ts`
- Access gating (redirect to `/login`) → `web/src/proxy.ts`
- Admin panel → `web/src/app/admin/`
- Quotex account API → `web/src/app/api/account/quotex/route.ts`
- Bot start/stop/status (web → Flask) → `web/src/app/api/bot/*`
- Flask backend (multi-buyer instances, per-buyer trade logs) → `quotex_bot/quotex_bot/web/app.py`
- Trade/strategy code → `quotex_bot/quotex_bot/` (connector, scheduler, strategy, risk)

---

## Pending (blocked)

1. **Deploy the Flask backend on Render** — blocked: Render asks for a card.
   - Use `render.yaml` blueprint (service `quotex-bot-backend`, rootDir `quotex_bot`).
   - On Render set: `BOT_AUTH_TOKEN` (MUST match Vercel value), then later
     `QUOTEX_EMAIL` / `QUOTEX_PASSWORD` / `QUOTEX_PROXY` / `QUOTEX_PIN` for the owner account.
2. **Update `FLASK_URL`** on Vercel to the deployed backend URL (currently `http://127.0.0.1:8000`), then redeploy.
3. Once backend is live: dashboard stop showing "Trading backend offline", and
   buyers can press **Start trading** on their own accounts.

## How to run locally (for development)

```bash
# backend (terminal 1)
cd quotex_bot
python run_web.py          # http://127.0.0.1:8000

# web app (terminal 2)
cd web
npm run dev                # http://localhost:3000
```

Local env for the web comes from `web/.env.local` (Turso + keys already there).