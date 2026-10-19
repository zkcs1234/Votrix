export function progressionIssues(round,rounds=[],method) {
  const issues=[],type=round.advancementType ?? 'none',value=round.advancementValue
  if(!['none','top_n','top_percent','threshold','manual'].includes(type))issues.push('Choose a supported advancement rule.')
  if(['top_n','top_percent','threshold'].includes(type)){
    const amount=Number(value),missing=value===null||value===undefined||value===''||typeof value==='boolean'
    if(missing||!Number.isFinite(amount)||(type==='top_n'&&(!Number.isInteger(amount)||amount<1))||(type==='top_percent'&&(amount<=0||amount>100))||(type==='threshold'&&amount<0)){
      issues.push(type==='top_n'?'Top N needs a positive whole number.':type==='top_percent'?'Top percentage must be greater than 0 and no more than 100.':'A minimum score needs a finite value of 0 or more.')
    }
  }
  if(type==='threshold'&&['rank_based','manual'].includes(method))issues.push('Minimum-score qualification requires numeric official scores; placement/manual results use Top N, percentage, or authorized manual selection.')
  if(round.nextRoundId){const next=rounds.find(r=>r.id===round.nextRoundId);if(!next||next.purpose==='special'||Number(next.displayOrder)<=Number(round.displayOrder))issues.push('Choose a later main round. Special awards keep independent entry assignments.')}
  return issues
}
