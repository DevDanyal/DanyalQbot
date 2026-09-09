# Project Status — handoff notes

Last updated: 2026-09-09

Everything below is committed (`0cea69e`) and pushed to GitHub (`origin/main`).
Secrets live ONLY in gitignored local files and Vercel env vars — never in the repo.

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