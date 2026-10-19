// Credentialed HTTP and WebSocket requests share an exact deployment allowlist.
// Preview deployments must be named explicitly; hosting-provider domains do
// not establish that an application belongs to this project.
export function normalizeOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hostname.includes('*')
      || url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch { return null }
}

export function isTrustedOrigin(origin, approvedOrigins) {
  const normalized = normalizeOrigin(origin)
  return normalized !== null && (approvedOrigins ?? []).some(value => normalizeOrigin(value) === normalized)
}
