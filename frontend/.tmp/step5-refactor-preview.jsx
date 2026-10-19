// Browser-only fixture. No API/database writes; not part of the production entry.
import '../dist/assets/index-Di7oujzp.css'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import NativeSetupWorkspace from '../src/components/organizer/competition/NativeSetupWorkspace'
import { nativeCompetitionService as service } from '../src/services/competition-native.service'
import { pageantService } from '../src/services/pageant.service'

const children = [{ id: 'campus', event_id: 'preview', origin: 'native', name: 'Mr. Campus 2026', competition_type: 'pageant' }, { id: 'dance', event_id: 'preview', origin: 'native', name: 'Folk Dance', competition_type: 'dance' }]
const config = { structure: 'multiple', rounds: [{ id: 'pre', name: 'Preliminary', displayOrder: 0, progression: 'weighted', weight: 40, nextRoundId: 'final', advancementType: 'top_n', advancementValue: 10 }, { id: 'final', name: 'Final', displayOrder: 1, progression: 'weighted', weight: 60 }], criteria: [], scoringConfig: { calculationMethod: 'rank_based', tiePolicy: 'shared', decimalPlaces: 2, defaultMinScore: 1, defaultMaxScore: 10, numericCarryBasis: 'weighted_judge_average', deductionRules: [{ id: 'late', description: 'Late Stage Entry', amount: 2, units: 'points', roundId: 'pre', criteriaId: null }] } }
for (const [roundId, names] of [['pre', [['Facial Features', 30], ['Communication Skills', 25], ['Poise & Bearing', 20], ['Stage Presence', 15], ['Overall Impression', 10]]], ['final', [['Stage Performance', 40], ['Question & Answer', 30], ['Formal Wear', 20], ['Overall Impression', 10]]]]) {
  for (const [name, percentage] of names) config.criteria.push({ id: `${roundId}-${name}`, name, roundId, percentage, minScore: 1, maxScore: 10, minorCriteria: name === 'Facial Features' ? [{ id: 'symmetry', name: 'Facial Symmetry', percentage: 40, minScore: 1, maxScore: 10 }, { id: 'appeal', name: 'Overall Facial Appeal', percentage: 60, minScore: 1, maxScore: 10 }] : [] })
}
const saved = { campus: config, dance: null }
const result = data => Promise.resolve({ data })
service.list = () => result({ competitions: children })
service.foundation = (_event, id) => result({ competition: { ...children.find(c => c.id === id), setup_revision: 1 }, configuration: structuredClone(saved[id]), assignments: [], criteriaReadiness: { allReady: !!saved[id] } })
service.entries = () => result({ entries: [] }); service.enrollments = () => result({ judges: [] }); service.pool = () => result({ judges: [] })
window.fixtureSaves = []
service.configure = (_event, id, body) => { window.fixtureSaves.push(structuredClone({ id, body })); saved[id] = structuredClone(body.configuration); return result({}) }
pageantService.getEvent = () => result({ event: { status: 'draft' } }); pageantService.listContestants = () => result({ contestants: [] })
createRoot(document.getElementById('root')).render(<MemoryRouter><main style={{ maxWidth: 1120, padding: '24px 16px', margin: '0 auto' }}><NativeSetupWorkspace eventId="preview" stage="workspace" initialChildren={children}/></main></MemoryRouter>)
