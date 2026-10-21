export function groupHasPositions(positions) {
  return Array.isArray(positions) && positions.length > 0
}

export function groupHasCandidatesForEveryPosition(positions, candidates) {
  if (!groupHasPositions(positions)) return false
  const candidatePositionIds = new Set((candidates ?? []).map((candidate) => candidate.positionId))
  return positions.every((position) => candidatePositionIds.has(position.id))
}

export function firstIncompleteSectionId(sections, completedIds) {
  return sections.find((section) => !completedIds.includes(section.id))?.id ?? sections[0]?.id ?? ''
}