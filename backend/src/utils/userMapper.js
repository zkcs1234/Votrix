export function sanitizeUser(row) {
  if (!row) return null

  return {
    id: row.id,
    username: row.username ?? null,
    email: row.email ?? null,
    role: row.role,
    accountStatus: row.account_status ?? 'active',
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
    // Participant profile fields (migration 075). Present as null for
    // admin/organizer accounts and for voters not yet backfilled.
    profileType: row.profile_type ?? null,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    schoolId: row.school_id ?? null,
    program: row.program ?? null,
    yearSection: row.year_section ?? null,
    profileData: row.profile_data ?? null,
    // Organizer voter scope (migration 076). Null for non-organizer accounts.
    scope: row.scope ?? null,
  }
}
