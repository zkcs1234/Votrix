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
  }
}
