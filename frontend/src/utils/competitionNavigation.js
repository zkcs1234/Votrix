export function competitionNavigationHref(href, eventId, location) {
  const base = `/organizer/competition/events/${eventId}/`
  const isWorkspace = path => ['live', 'scoring', 'results', 'adjustments', 'advancement', 'audit', 'tabulation'].some(section => path === `${base}${section}`) || path.startsWith(`${base}tabulation/`)
  if (!isWorkspace(location.pathname) || !isWorkspace(href)) return href
  const current = new URLSearchParams(location.search)
  const context = new URLSearchParams()
  for (const name of ['competitionId', 'roundId']) {
    if (current.has(name)) context.set(name, current.get(name))
  }
  return context.size ? `${href}?${context}` : href
}
