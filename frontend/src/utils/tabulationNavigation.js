export const TABULATION_WORKSPACES = [
  {
    id: 'results',
    label: 'Results',
    description: 'Validate the saved calculation, review rankings, and finalize official results before round advancement.',
    sections: [
      { id: 'validation', label: 'Validation' },
      { id: 'results', label: 'Results & Rankings' },
      { id: 'finalization', label: 'Finalization' },
    ],
  },
]

export const TABULATION_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'submissions', label: 'Judge Submissions' },
  { id: 'deductions', label: 'Deductions & Adjustments' },
]

export const tabulationWorkspace = section => TABULATION_WORKSPACES.find(workspace =>
  workspace.id === section || workspace.sections.some(item => item.id === section),
)

export function tabulationDestination(eventId, section, search = '') {
  const base = `/organizer/competition/events/${eventId}`
  if (['scoring', 'overview', 'matrix', 'entries', 'submissions', 'deductions'].includes(section)) {
    const anchor = section === 'entries' ? 'matrix' : section === 'scoring' ? 'overview' : section
    return `${base}/tabulation${search}#tabulation-${anchor}`
  }
  const workspace = tabulationWorkspace(section)
  if (workspace) return `${base}/${workspace.id}${search}#tabulation-${section}`
  if (section === 'adjustments') return `${base}/adjustments${search}`
  if (['advancement', 'audit'].includes(section)) return `${base}/${section}${search}`
  return `${base}/tabulation${search}#tabulation-overview`
}
