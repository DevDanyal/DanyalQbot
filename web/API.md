# API.md — Danyal QBot V1 API

Base path: `/api/v1`

All endpoints return JSON. Success shape:

```json
{ "ok": true, "...": "data" }
```

Error shape:

```json
{ "ok": false, "error": { "code": "...", "message": "..." } }
```

## Auth

### POST `/api/v1/auth/login`

Public. The main login + license + device gate.

Request:
```json
{
  "userId": "DQB-XXXX-XXXX",
  "password": "...",
  "deviceKey": "24..64 chars [A-Za-z0-9_-]",
  "platform": "android",
  "label": "Samsung Galaxy"
}
```

Response `200`:
```json
{
  "ok": true,
  "token": "...",
  "user": { "name": "...", "userId": "DQB-XXXX-XXXX" },
  "license": {
    "licenseId": "LIC-...",
    "status": "ACTIVE",
    "plan": { "code": "PRO", "name": "Pro" },
    "startAt": 1726000000000,
    "expiresAt": 1728600000000,
    "deviceLimit": 1
  },
  "device": { "deviceId": 1, "registered": true }
}
```

Errors: `400 INVALID_INPUT`, `400 INVALID_DEVICE_KEY`, `401 INVALID_CREDENTIALS`,
`403 ACCOUNT_DISABLED`, `403 LICENSE_MISSING`, `403 LICENSE_SUSPENDED`,
`403 LICENSE_EXPIRED`, `403 DEVICE_UNAUTHORIZED`, `429 RATE_LIMITED`,
`503 SERVICE_UNAVAILABLE`.

### POST `/api/v1/auth/logout`

Revokes the current session. Auth: any.
```
-> { "ok": true }
```

### POST `/api/v1/auth/logout-all`

Revokes all sessions for the signed-in customer. Auth: customer.
```
-> { "ok": true }
```

### GET `/api/v1/auth/me`

Returns current identity, license, and session. Auth: any bearer.
```json
{
  "ok": true,
  "authenticated": true,
  "role": "customer",
  "user": { "id": 1, "userId": "DQB-XXXX-XXXX", "name": "..." },
  "license": { ... },
  "session": { "id": 1, "customerId": 1, "role": "customer", "createdAt": ..., "expiresAt": ... }
}
```

## Devices

### GET `/api/v1/devices`

Lists the signed-in customer's devices. Auth: customer.
```json
{ "ok": true, "devices": [{ "id": 1, "label": "...", "platform": "android", "isActive": true, "firstSeenAt": ..., "lastSeenAt": ... }] }
```

### DELETE `/api/v1/devices/:id`

Customer revokes their own device. Auth: customer.
```
-> { "ok": true, "deviceId": 1 }
```

## Licenses

### GET `/api/v1/licenses/me`

Customer's license + status + devices. Auth: customer.
```json
{
  "ok": true,
  "license": { "licenseId": "...", "status": "ACTIVE", "plan": {...}, "startAt": ..., "expiresAt": ..., "deviceLimit": 1 },
  "rawStatus": "ACTIVE",
  "devices": [ ... ]
}
```

## Admin

All admin routes require an admin token.

### POST `/api/v1/admin/login`

Public. Master-password login with rate limiting.

Request: `{ "password": "..." }`
```
-> { "ok": true, "token": "..." }
```

### GET `/api/v1/admin/users`

List all users with their license summary. Auth: admin.

### POST `/api/v1/admin/users`

Create user + license.

Request:
```json
{
  "name": "John",
  "userId": "DQB-XXXX-XXXX",
  "password": "min6chars",
  "planCode": "PRO",
  "days": 30
}
```

### GET `/api/v1/admin/users/:id`

Full detail: user, license, devices, active sessions, recent security/activity logs.

### PATCH `/api/v1/admin/users/:id`

Actions (body `{ "action": "..." }`):

| action | extra body | effect |
|---|---|---|
| `suspend` | — | suspend license + user |
| `activate` | — | reactivate |
| `reset_password` | `{ "password": "..." }` | new password, revoke sessions |
| `reset_devices` | — | deactivate all devices, revoke sessions |

### GET `/api/v1/admin/licenses?status=active|suspended|revoked|expired`

List licenses.

### POST `/api/v1/admin/licenses`

Create a license for an existing customer.

Request: `{ "customerId": 1, "planCode": "PRO", "days": 30 }`

### GET `/api/v1/admin/licenses/:id`

License detail + owning customer.

### PATCH `/api/v1/admin/licenses/:id`

Actions:

| action | extra body | effect |
|---|---|---|
| `extend` | `{ "days": 30 }` | add days to expiry |
| `suspend` | — | suspend |
| `activate` | — | reactivate |
| `revoke` | — | revoke license |
| `set_expiry` | `{ "expiresAt": <ms> }` | set absolute expiry |
| `change_plan` | `{ "planCode": "PREMIUM" }` | switch plan + device limit |

### GET `/api/v1/admin/devices`

List all devices across all users.

### PATCH `/api/v1/admin/devices/:id`

Actions: `revoke`, `deactivate`, `activate`.

### POST `/api/v1/admin/devices/reset/:id`

Reset all devices for a customer (kills their sessions).

### GET `/api/v1/admin/security?limit=N&actorId=N`

Security logs.

### GET `/api/v1/admin/activity?limit=N&customerId=N`

Activity logs.

### GET `/api/v1/admin/plans`

List plans.

### POST `/api/v1/admin/plans`

Create plan: `{ "code", "name", "durationDays", "deviceLimit", "priceCents?", "description?" }`.

### PATCH `/api/v1/admin/plans/:id`

Update plan: any of `name`, `durationDays`, `deviceLimit`, `priceCents`, `description`, `status`.

### GET `/api/v1/admin/stats`

Dashboard summary:
```json
{
  "ok": true,
  "customers": { "total": 10, "active": 8 },
  "licenses": { "active": 8, "expired": 1, "suspended": 1, "total": 10 },
  "devices": { "total": 9, "active": 9 },
  "activeSessions": 7
}
```

## Error codes reference

| Code | Meaning |
|---|---|
| `INVALID_INPUT` | Missing/too-short/out-of-range input |
| `INVALID_DEVICE_KEY` | deviceKey failed format check |
| `INVALID_CREDENTIALS` | Wrong user/password |
| `ACCOUNT_DISABLED` | Customer status != active |
| `LICENSE_MISSING` | No license row on this account |
| `LICENSE_SUSPENDED` | License suspended/revoked |
| `LICENSE_EXPIRED` | License past expiry |
| `DEVICE_UNAUTHORIZED` | Device key disabled, or license device limit reached |
| `RATE_LIMITED` | Too many failed attempts |
| `AUTH_REQUIRED` | Missing/invalid bearer token |
| `TOKEN_EXPIRED` | Session token past expiry |
| `ADMIN_REQUIRED` | Non-admin tried an admin route |
| `PLAN_NOT_FOUND` | Unknown plan code |
| `LICENSE_EXISTS` | Customer already has a license |
| `USER_EXISTS` | userId already taken |
| `NOT_FOUND` | Resource not found |
| `SERVICE_UNAVAILABLE` | Backend/DB not configured |