# QX Trading Dashboard (Next.js 16.3)

Modern web dashboard for the Quotex trading bot. Renders bot status, chart
analysis, auto-trader controls, and trade history. It talks to the Flask API
backend (`../quotex_bot/run_web.py`) through Next.js route handlers in
`src/app/api/`.

## ⏭️ TODO (tomorrow): go live with the license system

The login/admin/expiry/device system is fully built. It just needs a storage
database connected. Do these 3 steps in order:

### 1. Create a Turso database (5 min)
- Go to https://turso.tech, sign up, create a database named `danyalqbot`
- Pick a location (e.g. `us-east`)
- Click **Generate API Token** and copy BOTH:
  - **URL** → looks like `libsql://danyalqbot-<org>.turso.io`
  - **Token** → a long string (shown only once — copy it now)
- CLI alternative:
  ```
  turso auth login
  turso db create danyalqbot
  turso db show danyalqbot
  turso db tokens create danyalqbot
  ```

### 2. Add env vars on Vercel
Vercel → project → **Settings → Environment Variables** (Production):
- `TURSO_DATABASE_URL` = `libsql://danyalqbot-<org>.turso.io`
- `TURSO_AUTH_TOKEN` = your token
- `ADMIN_PASSWORD` = a long secret password you make up (this logs you into `/admin`)

Then **Redeploy** (Settings → Deployments → Redeploy, or push).

### 3. Use it
- Open `https://danyalqbot.vercel.app/admin/login` → enter your admin password
- Click **Create license** → customer name, User ID, password, days
- Send the customer their ID + password → they log in at `.../login`

---

## License & Login System

The dashboard is protected by a per-customer license system. Every page and
API route is gated behind a login (`src/proxy.ts`). Features:

- Customer login page (`/login`) — checks credentials, license status, expiry,
  and one-device binding.
- **Admin panel** (`/admin/login` then `/admin`) — create customers, set expiry,
  suspend/revoke/activate, extend licenses. Build from the tables in this doc.
- Expiry enforcement: an expired license is denied on login and any active
  session stops working.
- Device binding: the first device a customer logs in on becomes their bound
  device; a license bound to another device is rejected.

### Required environment variables (Vercel -> Settings -> Environment Variables)

Because Vercel is serverless, customer data is stored in **Turso** (a
serverless SQLite). You must create a free database first:

1. Go to <https://turso.tech>, sign up, and create a database (e.g. `danyalqbot`).
2. Run `turso db tokens create danyalqbot` to get an auth token.
3. Set these in the Vercel project:

```bash
TURSO_DATABASE_URL=libsql://danyalqbot-<org>.turso.io
TURSO_AUTH_TOKEN=<your-token>
ADMIN_PASSWORD=<a-long-secret-admin-password>
FLASK_URL=https://your-flask-backend-url
```

Until `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` are set, login and admin show a
"not configured" message and every page redirects to `/login` (access is locked,
which is the intended security behavior).

### Workflow as the seller

1. Open `/admin/login`, enter `ADMIN_PASSWORD`.
2. In the admin panel click **Create license**, enter the customer's name, an
   ID (e.g. `DQB-1234-ABCD`), a password, and duration in days.
3. Send the customer their **User ID + password** (and your site URL).
4. Customer opens `/login`, enters them. Done — access until their expiry.
5. To stop someone: set them **suspended/revoked**; to renew: **+30d**.

> Passwords are hashed with scrypt. Never put these values in client code —
> they live only in Vercel server env vars.

## Getting Started

1. Start the Flask backend (serves the bot + `/api/*` endpoints):

   ```bash
   cd ../quotex_bot
   python run_web.py            # http://127.0.0.1:8000
   ```

2. Start the Next.js frontend:

   ```bash
   npm install
   npm run dev                  # http://localhost:3000
   # or, for production:
   npm run build && npm run start
   ```

3. Open [http://localhost:3000](http://localhost:3000).

If the backend runs on a different host/port, copy `.env.example` to `.env.local`
and set `FLASK_URL`.

## Notes

- Frontend polls `/api/bot/status` (3s) and `/api/stats` (5s) and proxies
  uploads, start/stop to Flask. If the backend is down the dashboard shows an
  offline banner and reconnects automatically.
- This is the UI only — all bot logic, risk rules, and trading live in the
  `quotex_bot/` Python package.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
