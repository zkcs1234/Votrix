export const EVENT_STAGES = {
  election: [
    { key: 'details', label: 'Details', path: 'edit' },
    { key: 'branding', label: 'Branding', path: 'edit' },
    { key: 'information-form', label: 'Information Form', path: 'form' },
    { key: 'positions', label: 'Positions', path: 'positions' },
    { key: 'candidates', label: 'Candidates', path: 'candidates' },
    { key: 'voters', label: 'Voters', path: 'voters' },
    { key: 'analytics', label: 'Analytics', path: 'analytics' },
    { key: 'report', label: 'Report', path: null },
  ],
  competition: [
    { key: 'details', label: 'Details', path: 'edit' },
    { key: 'branding', label: 'Branding', path: 'edit' },
    { key: 'information-form', label: 'Information Form', path: 'form' },
    { key: 'contestants', label: 'Contestants', path: 'contestants' },
    { key: 'criteria', label: 'Criteria', path: 'criteria' },
    { key: 'judges', label: 'Judges', path: 'judges' },
    { key: 'rankings', label: 'Rankings', path: 'rankings' },
    { key: 'live', label: 'Live Control', path: 'live' },
    { key: 'analytics', label: 'Analytics', path: 'analytics' },
    { key: 'report', label: 'Report', path: null },
  ],
  polling: [
    { key: 'details', label: 'Details', path: 'edit' },
    { key: 'branding', label: 'Branding', path: 'edit' },
    { key: 'settings', label: 'Settings', path: 'settings' },
    { key: 'information-form', label: 'Information Form', path: 'form' },
    { key: 'builder', label: 'Builder', path: 'builder' },
    { key: 'respondents', label: 'Respondents', path: 'respondents' },
    { key: 'analytics', label: 'Analytics', path: 'analytics' },
    { key: 'report', label: 'Report', path: null },
  ],
}

export const MODULE_BASE_PATH = {
  election: '/organizer/election/events',
  competition: '/organizer/competition/events',
  polling: '/organizer/polling/events',
}

export function stagePath(module, stageKey, eventId) {
  const base = MODULE_BASE_PATH[module]
  if (!base) return null
  const stages = EVENT_STAGES[module] ?? []
  const stage = stages.find((s) => s.key === stageKey)
  if (!stage) return null
  if (stage.path === null) return null
  if (eventId === 'new') {
    const persisted = stages.find((s) => s.path !== null && s.path !== 'edit')
    return `${base}/new/${persisted?.path ?? stage.path}`
  }
  return `${base}/${eventId}/${stage.path}`
}

export function getStageIndex(module, stageKey) {
  return (EVENT_STAGES[module] ?? []).findIndex((s) => s.key === stageKey)
}

/**
 * Derive the current stage key from a URL pathname.
 * Matches the `path` property of each stage definition.
 * Returns null if no stage matches.
 */
export function stageKeyFromPath(module, pathname) {
  const stages = EVENT_STAGES[module] ?? []
  for (const stage of stages) {
    if (!stage.path) continue
    if (pathname.includes(`/${stage.path}`)) {
      return stage.key
    }
  }
  // Fallback to checking if this is a "new" route
  if (pathname.endsWith('/new')) {
    return 'details'
  }
  return null
}

export function getNextStage(module, stageKey) {
  const stages = EVENT_STAGES[module] ?? []
  const idx = stages.findIndex((s) => s.key === stageKey)
  if (idx === -1 || idx + 1 >= stages.length) return null
  return stages[idx + 1]
}

export function getPrevStage(module, stageKey) {
  const stages = EVENT_STAGES[module] ?? []
  const idx = stages.findIndex((s) => s.key === stageKey)
  if (idx <= 0) return null
  return stages[idx - 1]
}
