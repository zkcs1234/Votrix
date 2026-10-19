// Presentation grouping only. Ranks and judge placements must already come
// from the saved division calculation; never rank filtered results locally.
export function divisionStandings(rows, scope) {
  if(scope?.mode!=='division')return [{id:'all',name:'',rows}]
  return scope.divisions.map(division=>({...division,rows:rows.filter(row=>row.divisionId===division.id)})).filter(group=>group.rows.length)
}
