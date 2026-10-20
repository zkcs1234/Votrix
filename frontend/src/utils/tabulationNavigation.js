// Existing URLs remain the section identifiers for both native and legacy views.
export const TABULATION_WORKSPACES = [
  {
    id: 'scoring', label: 'Scoring',
    description: 'Review judge submissions, inspect the score matrix, and manage configured deductions.',
    sections: [
      { id: 'submissions', label: 'Judge Submissions' },
      { id: 'matrix', label: 'Tabulation Matrix' },
      { id: 'deductions', label: 'Deductions & Adjustments' },
    ],
  },
  {
    id: 'results', label: 'Results',
    description: 'Validate the saved calculation, review rankings, and finalize official results before round advancement.',
    sections: [
      { id: 'validation', label: 'Validation' },
      { id: 'results', label: 'Results & Rankings' },
      { id: 'finalization', label: 'Finalization' },
    ],
  },
]

export const tabulationWorkspace = section => TABULATION_WORKSPACES.find(workspace =>
  workspace.id === section || workspace.sections.some(item => item.id === section),
)

export function tabulationDestination(eventId, section, search = '') {
  const base = `/organizer/competition/events/${eventId}`
  const workspace = tabulationWorkspace(section)
  if (workspace) return `${base}/${workspace.id}${search}#tabulation-${section === workspace.id && section !== 'results' ? workspace.sections[0].id : section}`
  if (['advancement', 'audit'].includes(section)) return `${base}/${section}${search}`
  return `${base}/tabulation/overview${search}`
}
