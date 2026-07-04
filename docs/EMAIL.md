# Phase 5 — Email system (Resend)

## Configuration

```env
RESEND_API_KEY=re_xxxx
RESEND_FROM_EMAIL=VOTRIX <notifications@yourdomain.com>
FRONTEND_URL=http://localhost:5173
EMAIL_FROM=VOTRIX <noreply@yourdomain.com>
PASSWORD_RESET_EXPIRY_MINUTES=60
```

Verify your sending domain in [Resend](https://resend.com) before production use.

## Automatic workflows

| Email | Trigger | Includes |
|-------|---------|----------|
| **Organizer invitation** | Admin creates organizer (`POST /api/admin/organizers`) | Email, temporary password, login link |
| **Voter invitation** | Organizer invites voter (`POST /api/organizer/events/:eventId/voters/invite`) | Event link, email, temporary password |
| **Password reset** | `POST /api/auth/forgot-password` | Reset link (expires in 60m default) |
| **Event notification** | `POST /api/organizer/events/:eventId/notify` | Event details, custom message, event link |

Emails are sent via `mailer.service.js`. If Resend is not configured, the API still completes the action but returns `email.sent: false`.

## API endpoints

### Password reset (public)

```
POST /api/auth/forgot-password
{ "email": "user@example.com" }

POST /api/auth/reset-password
{ "token": "...", "newPassword": "...", "confirmPassword": "..." }
```

### Organizer — voter invite

```
POST /api/organizer/events/:eventId/voters/invite
Authorization: Bearer <access_token>
{
  "email": "voter@example.com",
  "temporaryPassword": "optional — auto-generated if omitted"
}
```

### Organizer — resend invitation

```
POST /api/organizer/events/:eventId/voters/:voterId/resend-invitation
```

### Organizer — notify all enrolled voters

```
POST /api/organizer/events/:eventId/notify
{ "message": "Voting is now open until 6 PM." }
```

## Database

Run `migrations/003_password_reset_tokens.sql` for password reset tokens.

## Templates

HTML templates live in `backend/src/templates/email/`.
