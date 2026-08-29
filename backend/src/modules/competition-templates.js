// Phase 1–2 — Competition starter templates.
//
// Static, versioned-in-code presets. A template SEEDS editable structure when an
// event is created (categories / rounds / criteria / scoring_config) so an
// organizer isn't staring at a blank Workspace. Nothing here is branched on at
// runtime — every seeded row is a normal, editable/deletable record afterward,
// and the scoring engine never reads the template or the competition_type.
//
// Weight invariants (so a seeded event is immediately valid, per §8A):
//   - categories[].weight sum to 100 (when present)
//   - rounds[].weight sum to 100 (when present)
//   - criteria[].percentage sum to 100 (event-wide flat rule; templates do NOT
//     seed round↔criteria membership, so the flat criteria rule applies)

const DEFAULT_SCORING = {
  scoreType: 'range_1_100',
  calculationMethod: 'weighted_average',
  decimalPlaces: 2,
}

const TEMPLATES = {
  pageant: {
    key: 'pageant',
    label: 'Pageant',
    description: 'Multi-round pageant with weighted categories and prelim → final rounds.',
    scoringConfig: { ...DEFAULT_SCORING },
    categories: [
      { name: 'Talent', weight: 40 },
      { name: 'Evening Gown', weight: 30 },
      { name: 'Q&A', weight: 30 },
    ],
    rounds: [
      { name: 'Preliminary', weight: 50 },
      { name: 'Final', weight: 50 },
    ],
    criteria: [
      { name: 'Poise & Bearing', percentage: 25 },
      { name: 'Stage Presence', percentage: 25 },
      { name: 'Beauty', percentage: 25 },
      { name: 'Intelligence', percentage: 25 },
    ],
  },
  dance: {
    key: 'dance',
    label: 'Dance Competition',
    description: 'Prelim → final rounds with dance-specific criteria. Use Divisions for solo/team.',
    scoringConfig: { ...DEFAULT_SCORING },
    categories: [],
    rounds: [
      { name: 'Preliminary', weight: 40 },
      { name: 'Final', weight: 60 },
    ],
    criteria: [
      { name: 'Technique', percentage: 40 },
      { name: 'Choreography', percentage: 30 },
      { name: 'Musicality', percentage: 30 },
    ],
  },
  singing: {
    key: 'singing',
    label: 'Singing Competition',
    description: 'Single-round vocal scoring; add rounds later if you run heats and a final.',
    scoringConfig: { ...DEFAULT_SCORING },
    categories: [],
    rounds: [],
    criteria: [
      { name: 'Pitch & Accuracy', percentage: 34 },
      { name: 'Tone & Quality', percentage: 33 },
      { name: 'Performance', percentage: 33 },
    ],
  },
  talent: {
    key: 'talent',
    label: 'Talent Competition',
    description: 'Single-round general talent scoring with broad criteria.',
    scoringConfig: { ...DEFAULT_SCORING },
    categories: [],
    rounds: [],
    criteria: [
      { name: 'Skill', percentage: 40 },
      { name: 'Creativity', percentage: 30 },
      { name: 'Presentation', percentage: 30 },
    ],
  },
  simple: {
    key: 'simple',
    label: 'Simple / Blank',
    description: 'Start blank — one group, one round, add your own criteria.',
    scoringConfig: { ...DEFAULT_SCORING },
    categories: [],
    rounds: [],
    criteria: [],
  },
}

// The set of accepted competition_type labels (nullable is also valid = unset).
export const COMPETITION_TYPES = Object.keys(TEMPLATES)

export function isValidCompetitionType(type) {
  return type === null || type === undefined || COMPETITION_TYPES.includes(type)
}

export function getTemplate(key) {
  if (!key) return null
  return TEMPLATES[key] ?? null
}

// Public catalog (safe to expose to organizers for the wizard picker).
export function listTemplates() {
  return Object.values(TEMPLATES).map((t) => ({
    key: t.key,
    label: t.label,
    description: t.description,
    scoringConfig: t.scoringConfig,
    categories: t.categories,
    rounds: t.rounds,
    criteria: t.criteria,
  }))
}
