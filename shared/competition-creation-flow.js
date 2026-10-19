import { setupReadiness } from './competition-setup-readiness.js'
// One catalog for the organizer wizard; presets are choices, never sample records.
export const COMPETITION_TYPES = [
  ['pageant', 'Pageant'], ['dance', 'Dance'], ['music', 'Music'],
  ['visual_arts', 'Visual Arts'], ['dramatic_arts', 'Dramatic Arts'],
  ['literary_arts', 'Literary Arts'], ['other', 'Other'],
]
export const COMPETITION_PRESETS = {
  pageant: ['Women', 'Men'],
  dance: ['Street Dance', 'Hip-Hop', 'Contemporary Duo', 'Contemporary Dance', 'Folk Dance', 'Indigenous Dance'],
  music: ['Vocal Solo', 'Vocal Duet', 'Pop Solo', 'Acapella', 'Group Singing', 'Song Writing', 'Standard Chorale Contest', 'Quartet'],
  visual_arts: ['Painting', 'Photo Contest', 'Pencil Drawing', 'Charcoal Rendering', 'On the Spot Poster Making'],
  dramatic_arts: ['Short and Sweet Plays (Dialogue)', 'Short and Sweet Play (Musical)', 'Radio Drama', 'Duo Acting'],
  literary_arts: ['Pagsulat ng Sanaysay', 'Dagliang Talumpati', 'Pagkukuwento', 'Essay Writing', 'Story Telling', 'Dramatic Monologue', 'Dramatic Monologue (Filipino)'],
  other: [],
}
export const PARTICIPATION_FORMATS = [['individual', 'Individual'], ['duo', 'Duo / Pair'], ['group', 'Group / Team']]

export function competitionScoringReady({configuration,criteriaReadiness}) {
  if (!configuration || !criteriaReadiness?.allReady || configuration.scoringConfig.calculationMethod==='undecided') return false
  if (configuration.scoringConfig.calculationMethod==='manual'&&!configuration.scoringConfig.manualBasis?.trim()) return false
  if (configuration.rounds.some(r=>r.progression==='weighted')&&Math.abs(configuration.rounds.reduce((sum,r)=>sum+(Number(r.weight)||0),0)-100)>0.001) return false
  if (!setupReadiness(configuration).allReady) return false
  return true
}

export function competitionSetupIssues({ competition, configuration, criteriaReadiness, assignments = [], entries = [], judges = [] }) {
  const issues = []
  if (!configuration || !criteriaReadiness?.allReady || configuration.scoringConfig?.calculationMethod === 'undecided') issues.push({ step: 'workspace', message: 'Complete scoring criteria and calculation settings.' })
  if (configuration?.scoringConfig?.calculationMethod === 'manual' && !configuration.scoringConfig.manualBasis?.trim()) issues.push({step:'workspace',message:'Explain the basis for manual official placements.'})
  if (configuration?.rounds.some(r=>r.progression==='weighted') && Math.abs(configuration.rounds.reduce((sum,r)=>sum+(Number(r.weight)||0),0)-100)>0.001) issues.push({step:'workspace',message:'Round contributions must total 100%.'})
  if (!entries.length) issues.push({ step: 'contestants', message: 'Register at least one entry.' })
  const panel = assignments.filter(a => judges.some(j => j.id === a.participant_id && j.isActive && j.accountStatus === 'active' && ['judge', 'head_judge'].includes(j.role)))
  if (panel.length !== assignments.length) issues.push({step:'judges',message:'Remove or replace inactive judge assignments.'})
  const scopes = configuration?.structure === 'multiple' ? configuration.rounds : [{ id: null, name: 'Single scoring phase' }]
  for (const scope of scopes ?? []) {
    if (!panel.some(a => a.round_id == null || a.round_id === scope.id)) issues.push({ step: 'judges', message: `Assign an active judge to ${scope.name}.` })
    if ((scope.calculationMethod ?? configuration?.scoringConfig.calculationMethod) === 'lowest_removal' && new Set(panel.filter(a=>a.round_id == null || a.round_id===scope.id).map(a=>a.participant_id)).size <= (configuration.scoringConfig.dropHighest??0)+(configuration.scoringConfig.dropLowest??0)) issues.push({step:'judges',message:`Retain at least one judge after removing extremes in ${scope.name}.`})
  }
  if (competition?.official_child_rules_id && competition.rulesCurrent === false) issues.push({ step: 'review', message: 'Frozen rules are stale; review the changed dependencies.' })
  return issues
}
