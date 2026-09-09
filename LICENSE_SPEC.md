# License & Login System — Project Spec

Status: PLANNED — implementation starts when seller says "go for plan and implement".

---

## 1. Goal

- Seller sells the Quotex trading bot to multiple buyers.
- Each buyer needs a personal license key to run the bot.
- One license = one buyer = one device. Cannot be shared.
- License has an expiry date. When it passes, the bot locks automatically.
- A login system protects the dashboard (nobody can control the bot without logging in).

## 2. Honest Caveat

- Python ships as source code, so no lock is unbreakable.
- Design stops ~99% of casual sharing (copy/paste to a friend).
- A skilled techie can still edit code — real enforcement = license agreement + optional online check later.

---

## 3. Login System (chosen design)

- Stack: JWT (access + refresh tokens) + bcrypt + SQLite + rate limiting + TOTP 2FA.
- Storage: SQLite (zero config, embedded).
- Access token: 15 min lifetime, httpOnly cookie.
- Refresh token: 7 days, stored in DB, rotated on use, enables remote logout.
- Passwords: bcrypt, 12 rounds, never logged.
- Rate limiting: 5 failed logins = 15 min lockout (per IP + per user).
- 2FA: optional TOTP (Google Authenticator / Authy) via pyotp.
- Next.js frontend and Flask API both protected; Flask API is the real gatekeeper.
- Secrets (JWT_SECRET) in .env, never in code.

---

## 4. License System — Signed Key (offline, self-contained)

### 4.1 How it works

- Seller keeps a SECRET key (never ships it).
- Bot embeds only the PUBLIC key (can verify, cannot sign).
- Seller runs one command per buyer to create a license file.
- License file contains: buyer name + expiry date + device ID + signature.

### 4.2 Why Ed25519 (asymmetric)

- HMAC/AES uses a shared secret — a buyer who finds it can forge licenses.
- Ed25519: buyer only has the public key, which cannot sign.
- Only the seller can issue / renew licenses.

---

## 5. Device Binding (anti-sharing)

- On first run, bot generates a Device ID from hardware
  (MAC address / Windows machine GUID / CPU ID).
- Buyer sends their Device ID to the seller in chat (WhatsApp, email, Discord...).
- Seller generates the license bound to that Device ID.
- License only works on that one device. Copied to another PC = locked with
  "License is bound to another device."

### 5.1 Where the buyer sees the Device ID

Terminal when running `python main.py`:

```
Device ID: RJ23-KL98-4F7D
No license found — send this ID to your seller.
```

Browser when opening `localhost:8000`:

```
Project Locked
Status: No license found
Your Device ID: RJ23-KL98-4F7D
To activate: send this Device ID to the seller to receive your license key.
```

Normal dashboard appears only after a valid license is active, with a badge:
`License: active — expires in X days`.

---

## 6. Expiry Behavior

- Warnings before expiry: 7 / 3 / 1 days before -> logged + dashboard banner.
- Hard lock at expiry: bot refuses to start trading and stops a running
  session within a minute. Shows "License expired — contact seller to renew."
- Data/history stays intact and viewable.
- Multi-point guard: validation runs at startup, on the main loop, and
  before every order placement.

---

## 7. Lock Reasons (bot enforces all automatically)

- No license file -> "No license found."
- Invalid/edited/corrupted file -> "Invalid signature."
- Wrong Device ID -> "License is bound to another device."
- Expired date -> "License expired — contact seller to renew."

---

## 8. Seller Commands (one command per buyer)

```
python tools/license_tool.py --user "BuyerA" --days 30 --device "RJ23-KL98-4F7D"
```

- Creates `tools/licenses/BuyerA.key`.
- Updates `tools/licenses/sales.json` (master record: buyer, issued, expires, device ID).
- `tools/licenses/` stays on seller machine, gitignored, never shipped.

Renewal: buyer sends same Device ID again -> seller reruns command with new `--days`.

---

## 9. Sale Flow (rules)

1. Buyer downloads project, runs `python main.py`.
2. Bot does not trade. Prints Device ID + "send this to your seller."
3. Buyer sends Device ID to seller in chat.
4. Seller runs license tool -> sends key file to buyer.
5. Buyer drops .key file into project folder (or pastes code in config).
6. Bot verifies: signature + device ID + expiry -> runs.
7. Seller keeps `tools/licenses/` + private secret safe.

---

## 10. Optional Phase 2 — Online Check

- Seller hosts a tiny Flask endpoint.
- Bot pings it daily with license ID + Device ID.
- Detects one license active on 2+ devices -> seller can revoke remotely.
- 48h grace period if no internet, so buyers with outages are not instantly cut.
- Only add once there are many customers.

---

## 11. Test Roleplay In Progress

- Test role: assistant = buyer, seller = user.
- Test buyer Device ID: RJ23-KL98-4F7D
- Status: awaiting seller to run the license tool for this ID.

---

## 12. Planned File Layout

```
quotex_bot/license/           # new package
├── keys.py          # Ed25519 verify (public key embedded)
├── validate.py      # startup + periodic + pre-order checks
├── lockout.py       # lock state, warnings, auto-stop
└── types.py         # LicensePayload dataclass
tools/
└── license_tool.py  # SELLER tool: generate/renew (private key in .env)
quotex_bot/web/app.py        # license status endpoint + lock enforcement
quotex_bot/config.yaml       # optional license.path
web/src/app/login/           # login page
web/src/middleware.ts        # route protection
quotex_bot/auth/             # login system package (users, tokens, totp)
```