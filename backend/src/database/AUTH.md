# Phase 3 — Authentication

## Token strategy

| Token | Lifetime | Delivery |
|-------|----------|----------|
| **Access** | 15m (configurable) | JSON body + `Authorization: Bearer` + httpOnly cookie |
| **Refresh** | 7d (configurable) | httpOnly cookie only |

Rotate both via `POST /api/auth/refresh`.

## Endpoints

| Method | Path | Access |
|--------|------|--------|
| POST | `/api/auth/admin/login` | Public |
| POST | `/api/auth/organizer/login` | Public |
| POST | `/api/auth/voter/login` | Public |
| GET | `/api/auth/csrf` | Issue CSRF token (cookie + body) |
| POST | `/api/auth/refresh` | Refresh cookie |
| POST | `/api/auth/logout` | Public |
| GET | `/api/auth/me` | Access token |
| POST | `/api/auth/change-password` | Access token |
| GET | `/api/admin/overview` | Admin |
| POST | `/api/admin/organizers` | Admin |
| GET | `/api/organizer/overview` | Organizer |
| GET | `/api/voter/overview` | Voter |

Protected role routes use `requirePasswordChanged` — returns `403` with `code: MUST_CHANGE_PASSWORD` until the user updates their password.

## Account rules

- **Admin:** insert manually; login with `username` + `password`.
- **Organizer:** created by admin via `POST /api/admin/organizers`; must change password on first login.
- **Voter:** created via CSV import (Phase 4); login with `email` + temporary password; must change password on first login.

## Environment

```env
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```
