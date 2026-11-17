// Human-readable summary of an organizer access scope ({ scopeType, programs }).
export function formatScope(scope) {
  if (!scope || scope.scopeType !== 'scoped') return 'All access'
  return (scope.programs ?? []).join(', ') || 'scoped'
}
