# TODO

## Task: Delete all organizer accounts (block access) + fix sign-in errors

### Plan (Goal A: soft-delete/archive)

- [x] 1. Add a DB-safe script to archive/suspend all organizer users (role='organizer')
  - Update `users.account_status` to `archived` (or `suspended`)
  - Optionally set `organizations.status` to `archived/inactive`
  - Ensure no FK violations (no hard deletes)
- [ ] 2. (If needed) Add admin endpoint/service to perform the archive action via API
- [ ] 3. Fix organizer sign-in errors by ensuring login fails with correct reason
  - Verify organizer users are being created with `account_status='pending'`
  - Identify approval step that sets to `active`
  - If approval is missing, add/restore approval flow or provide migration/script
- [ ] 4. Verify frontend error display for organizer login
- [ ] 5. Testing
  - Run backend tests
  - Manual sign-in checks for: active organizer, pending organizer, archived organizer

### Notes

- Current FK prevents hard-deleting organizer users:
  - `organizations.organizer_id ... ON DELETE RESTRICT`
- Therefore Goal A (soft-delete) is the safe approach.
