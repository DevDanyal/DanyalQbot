# QX Trading Dashboard (Next.js 16.3)

Modern web dashboard for the Quotex trading bot. Renders bot status, chart
analysis, auto-trader controls, and trade history. It talks to the Flask API
backend (`../quotex_bot/run_web.py`) through Next.js route handlers in
`src/app/api/`.

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
