export const judgeContestantNumber = contestant => contestant.registrationNumber ?? contestant.contestantNumber

export function judgeDivision(contestant, sheet) {
  const division = (sheet.allowedDivisions ?? sheet.divisions ?? []).find(item => item.id === contestant.divisionId)
  const name = contestant.divisionName ?? division?.name ?? ''
  const label = String(name || contestant.gender || contestant.sex || '').trim().toLowerCase()
  const female = /^(female|women|woman|ladies|girls|ms\.?|miss)$/.test(label)
  const male = /^(male|men|man|gentlemen|boys|mr\.?)$/.test(label)
  return { id: contestant.divisionId ?? (name ? `label:${name}` : null), name, label: female ? 'Women' : male ? 'Men' : name, tone: female ? 'female' : male ? 'male' : 'neutral', order: male ? 0 : female ? 1 : 2, color: contestant.rowColor ?? division?.rowColor ?? division?.row_color }
}

export function judgeDivisionOptions(sheet) {
  const choices = new Map()
  for (const contestant of sheet?.contestants ?? []) {
    const division = judgeDivision(contestant, sheet)
    if (division.id) choices.set(division.id, division)
  }
  return [...choices.values()].sort((a,b) => a.order-b.order || a.label.localeCompare(b.label))
}
