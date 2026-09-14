# Danyal QBot — API Reference

The V1 JSON API (`/api/v1/*`) is the token-based contract. The legacy
cookie API (`/api/*`) is used by the web UI and is documented in
`web/API.md`.

## Conventions

- **Base:** `/api/v1`
- **Auth:** `Authorization: Bearer <token>` (tokens from `POST /api/v1/auth/login`).
- **Responses:** every endpoint returns `{ ok: true, ... }` or
  `{ ok: false, error: { code, message } }`.
- **Status codes:** 200 success · 400 invalid input · 401 auth required ·
  403 forbidden (admin-required, device denied) · 429 rate limited.

## Public

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/login` | Authenticate with `{ userId, password, deviceKey, platform?, label? }`. Returns `token`, `user`, `license`, `device`. Machine-readable error codes. |
| GET | `/api/v1/app-version?platform=android` | Public version check for a platform. |

## Customer (bearer token)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/logout` | Revoke the current token. |
| POST | `/api/v1/auth/logout-all` | Revoke all of the customer's sessions. |
| GET | `/api/v1/auth/me` | Session + role info. |
| POST | `/api/v1/auth/change-password` | `{ currentPassword, newPassword, revokeOthers? }`. Re-issues the session. |
| GET | `/api/v1/account` | Profile + license + devices + unread notification count, in one call. |
| GET | `/api/v1/devices` | List bound devices. |
| DELETE | `/api/v1/devices/:id` | Remove a device. |
| GET | `/api/v1/licenses/me` | The customer's license details. |
| GET | `/api/v1/notifications` | `{ items, unread }` (most recent first). |
| POST | `/api/v1/notifications/read-all` | Mark all read. |
| POST | `/api/v1/notifications/:id/read` | Mark one notification read. |
| GET | `/api/v1/activity` | Recent activity log for this customer. |

## Admin (admin bearer token)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/admin/login` | Master password login, rate-limited. |
| GET/POST | `/api/v1/admin/users` | List/create customers. |
| GET/PATCH | `/api/v1/admin/users/:id` | Read/update a customer (status, expiry, password reset). |
| GET/POST | `/api/v1/admin/licenses` | List/create licenses. |
| GET/PATCH | `/api/v1/admin/licenses/:id` | Read/update (extend, suspend, activate, plan change). |
| GET | `/api/v1/admin/devices` | All devices. |
| PATCH | `/api/v1/admin/devices/:id` | Enable/disable a device. |
| POST | `/api/v1/admin/devices/reset/:id` | Reset all devices for a customer (kills sessions). |
| GET | `/api/v1/admin/security` | Security log (paged). |
| GET | `/api/v1/admin/activity` | Activity log (paged). |
| GET/POST | `/api/v1/admin/plans` | List/create plans. |
| PATCH | `/api/v1/admin/plans/:id` | Update a plan. |
| GET | `/api/v1/admin/stats` | Dashboard stats (incl. notifications totals). |
| GET | `/api/v1/admin/notifications` | All notifications (limit param). |
| POST | `/api/v1/admin/notifications` | Broadcast an announcement to all active customers. |
| GET | `/api/v1/admin/app-version` | All platform version records. |
| POST | `/api/v1/admin/app-version` | Upsert version fields for a platform. |

## Legacy cookie API (web UI)

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` · `/api/auth/logout` | Cookie session (web only). |
| GET | `/api/auth/me` | Current cookie session. |
| GET | `/api/bot/status` · `/api/stats` · `/api/history` | Bot status, stats, trade history (via Flask backend). |
| POST | `/api/bot/start` · `/api/bot/stop` | Start/stop the bot. |
| POST | `/api/analyze` | Upload a chart image for analysis. |
| GET/POST | `/api/account/quotex` | Manage Quotex account credentials. |

## License status derivation

`ACTIVE` → `EXPIRING_SOON` (within 3 days) → `EXPIRED`. `SUSPENDED` is an
admin override. Status is computed server-side on every request; customers with
`EXPIRED` or `SUSPENDED` licenses are denied trading and logged out at the
next authorization check.