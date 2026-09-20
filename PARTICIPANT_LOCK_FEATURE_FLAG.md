# Feature flag: lock the participant roster when an event is active

This flag controls **one** rule: whether you can still **register and invite**
voters / judges / respondents **after** an event becomes **active** (voting or
scoring is open).

- **Production behavior (default):** once an event is `active`, the roster is
  **locked** — no more registering or inviting.
- **Testing behavior:** the roster stays **editable** even while the event is
  `active`, so you can keep registering/inviting during testing when you don't
  have everyone's real email yet.

Nothing about the lock was deleted. This is just a switch. It also does **not**
touch any other rule — the setup lock at `scheduled`, publish-before-invite,
unpublish, and the `completed` / `cancelled` locks all behave the same either way.

---

## The switch

| Where | Environment variable | Reads it |
|---|---|---|
| Backend (API) | `LOCK_PARTICIPANTS_ON_ACTIVE` | `backend/src/utils/eventLifecycle.js` |
| Frontend (web) | `VITE_LOCK_PARTICIPANTS_ON_ACTIVE` | `frontend/src/utils/constants.js` |

Rule for both: the value is **`false`** → testing (roster editable while active).
Anything else, or unset → **production** (roster locks when active).

> Set **both** the backend and the frontend, or the two sides disagree: the UI
> might let you click while the API rejects it (or vice-versa).

---

## ▶️ Enable TESTING (edit roster while the event is active)

**Local development**

1. In `backend/.env` add:
   ```
   LOCK_PARTICIPANTS_ON_ACTIVE=false
   ```
2. In `frontend/.env` add:
   ```
   VITE_LOCK_PARTICIPANTS_ON_ACTIVE=false
   ```
3. Restart both dev servers (the frontend must restart because Vite reads
   `.env` at startup):
   ```
   npm run dev:backend
   npm run dev:frontend
   ```

**Deployed (Render)**

1. Backend service → **Environment** → add `LOCK_PARTICIPANTS_ON_ACTIVE` = `false`.
2. Frontend (static site) → **Environment** → add
   `VITE_LOCK_PARTICIPANTS_ON_ACTIVE` = `false`.
3. Redeploy both (the frontend must be rebuilt for the value to take effect).

---

## ⏹️ Restore PRODUCTION (cannot edit roster once active) — do this when testing is done

Pick either way; both give the default production behavior.

**Local development**

1. In `backend/.env` and `frontend/.env`, **remove** those two lines
   (or set them to `true`):
   ```
   LOCK_PARTICIPANTS_ON_ACTIVE=true
   VITE_LOCK_PARTICIPANTS_ON_ACTIVE=true
   ```
2. Restart both dev servers.

**Deployed (Render)**

1. Delete (or set to `true`) `LOCK_PARTICIPANTS_ON_ACTIVE` on the backend and
   `VITE_LOCK_PARTICIPANTS_ON_ACTIVE` on the frontend.
2. Redeploy both.

That's it — with the flag gone (or `true`), an active event's roster is locked
again, exactly as before.

---

## How to confirm which mode you're in

Open an event that is currently **active**, go to its **Voters / Judges /
Respondents** page:

- **Testing mode:** the register form and "Send invitation" buttons are usable;
  no "Roster locked" banner.
- **Production mode:** a "Roster locked — voting/scoring is active" banner shows
  and the register/invite controls are gone.

If the UI and API disagree (you can click but it errors, or vice-versa), one side
still has the old value — re-check that both env vars are set the same and that
both services were restarted/redeployed.
