import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import CompetitionWorkspacePage from './CompetitionWorkspacePage'
import { pageantService } from '@/services/pageant.service'
import { workflowService } from '@/services/competition-workflow.service'
import useEventStatus from '@/hooks/useEventStatus'

vi.mock('@/services/pageant.service', () => ({ pageantService: {
  getFoundation: vi.fn(), createRound: vi.fn(), updateRound: vi.fn(), deleteRound: vi.fn(),
  setScoringConfig: vi.fn(), createCriteria: vi.fn(), addRoundCriteria: vi.fn(),
} }))
vi.mock('@/services/competition-workflow.service', () => ({ workflowService: { action: vi.fn(), createRoundCriterion: vi.fn() } }))
vi.mock('@/hooks/useEventStatus', () => ({ default: vi.fn() }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

let foundation
let nextId
function round(id, values = {}) {
  return { id, eventId: 'event-id', name: id, purpose: 'regular', progression: 'weighted', weight: 100,
    categoryId: null, divisionId: null, description: null, displayOrder: 0, isOpen: false,
    contestantIds: [], criteriaIds: [], advancementType: 'none', advancementValue: null,
    scorePolicy: 'independent', finalizedAt: null, nextRoundId: null, ...values }
}
function Location() { const location = useLocation(); return <p data-testid="location">{location.pathname}{location.search}</p> }
async function openWorkspace(search = '') {
  render(<MemoryRouter initialEntries={[`/organizer/competition/events/event-id/workspace${search}`]}>
    <Routes><Route path="/organizer/competition/events/:eventId/workspace" element={<CompetitionWorkspacePage />} /></Routes><Location />
  </MemoryRouter>)
  await screen.findByRole('heading', { name: search.startsWith('?tab=criteria') ? 'Criteria' : 'Competition Rounds' })
}
function nameRound(name) { fireEvent.change(screen.getByLabelText('What is the name of this round?'), { target: { value: name } }) }
function selectCombined(weight) {
  fireEvent.click(screen.getByRole('radio', { name: /^Combine with other rounds/ }))
  fireEvent.change(screen.getByLabelText('Contribution to combined result (%)'), { target: { value: String(weight) } })
}
async function createRound(name) {
  nameRound(name)
  fireEvent.click(screen.getByRole('button', { name: 'Create Round', exact: true }))
  await screen.findByText(`${name} created successfully.`)
  return screen.getByRole('heading', { name, level: 4 }).closest('li')
}

beforeEach(() => {
  vi.resetAllMocks()
  nextId = 1
  foundation = { event: { id: 'event-id', title: 'School competition', status: 'draft', divisions_enabled: false },
    rounds: [], categories: [], divisions: [], criteria: [], contestants: [], judges: [], assignments: [], scoringConfig: { deductionRules: [] } }
  useEventStatus.mockReturnValue({ status: 'draft', setupLocked: false, loading: false })
  pageantService.getFoundation.mockImplementation(async () => ({ data: { foundation: structuredClone(foundation) } }))
  pageantService.createRound.mockImplementation(async (_eventId, payload) => {
    const saved = round(`saved-database-id-${nextId++}`, { ...payload, displayOrder: foundation.rounds.length })
    foundation.rounds.push(saved)
    return { data: { success: true, round: saved } }
  })
  pageantService.updateRound.mockImplementation(async (_eventId, id, payload) => {
    const saved = foundation.rounds.find(item => item.id === id)
    Object.assign(saved, payload)
    return { data: { round: structuredClone(saved) } }
  })
  pageantService.deleteRound.mockImplementation(async (_eventId, id) => { foundation.rounds = foundation.rounds.filter(item => item.id !== id); return { data: { success: true } } })
  workflowService.action.mockResolvedValue({ data: { success: true } })
})

it('creates one independent dance round with no contribution field or event-wide checklist', async () => {
  await openWorkspace()
  expect(screen.queryByLabelText('Contribution to combined result (%)')).not.toBeInTheDocument()
  expect(screen.queryByText(/Setup checklist|must equal 100%|Round weight total/i)).not.toBeInTheDocument()
  const card = await createRound('Dance Performance')
  expect(pageantService.createRound).toHaveBeenCalledExactlyOnceWith('event-id', {
    name: 'Dance Performance', purpose: 'regular', progression: 'back_to_zero', weight: 0, categoryId: null, divisionId: null,
  })
  expect(within(card).getByText('Scoring Round · Independent scoring')).toBeInTheDocument()
  expect(within(card).getByRole('button', { name: 'Configure Scoring Criteria' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Create Another Round' })).toBeInTheDocument()
})

it('keeps qualification purpose independent and saves advancement separately', async () => {
  await openWorkspace()
  fireEvent.click(screen.getByRole('radio', { name: /^Select qualifiers/ }))
  const card = await createRound('Preliminary')
  expect(pageantService.createRound.mock.calls[0][1]).toMatchObject({ purpose: 'qualification', progression: 'back_to_zero', weight: 0 })
  fireEvent.click(within(card).getByRole('button', { name: 'More Settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Configure advancement' }))
  fireEvent.change(screen.getByLabelText('Who should proceed to the next round?'), { target: { value: 'top_n' } })
  fireEvent.change(screen.getByLabelText('Number of entries advancing'), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save advancement' }))
  await screen.findByText('Preliminary updated successfully.')
  expect(pageantService.updateRound).toHaveBeenCalledExactlyOnceWith('event-id', 'saved-database-id-1', { advancementType: 'top_n', advancementValue: 3, scorePolicy: 'independent' })
})

it('creates a final round and exposes Back to Zero without requiring a combined weight', async () => {
  await openWorkspace()
  fireEvent.click(screen.getByRole('radio', { name: /^Determine final winners/ }))
  const card = await createRound('Final')
  expect(pageantService.createRound.mock.calls[0][1]).toMatchObject({ purpose: 'final', progression: 'back_to_zero', weight: 0 })
  fireEvent.click(within(card).getByRole('button', { name: 'More Settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Configure progression' }))
  expect(screen.getByLabelText("How should this round's scores be used?")).toHaveValue('back_to_zero')
  expect(screen.queryByLabelText('Contribution to combined result (%)')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save progression' }))
  await screen.findByText('No changes to save.')
  expect(pageantService.updateRound).not.toHaveBeenCalled()
})

it('creates two combined rounds with 30% and 70% contributions', async () => {
  await openWorkspace()
  selectCombined(30)
  await createRound('First round')
  selectCombined(70)
  await createRound('Second round')
  expect(pageantService.createRound.mock.calls.map(call => call[1].weight)).toEqual([30, 70])
  expect(foundation.rounds.every(item => item.progression === 'weighted')).toBe(true)
})

it('validates contributions only within the selected scoring group', async () => {
  foundation.categories = [{ id: 'a', name: 'Group A' }, { id: 'b', name: 'Group B' }]
  foundation.rounds = [round('existing-a', { weight: 60, categoryId: 'a' }), round('existing-b', { weight: 100, categoryId: 'b', displayOrder: 1 })]
  await openWorkspace()
  selectCombined(41)
  fireEvent.change(screen.getByLabelText('Scoring group (optional)'), { target: { value: 'a' } })
  nameRound('Group A final')
  fireEvent.click(screen.getByRole('button', { name: 'Create Round', exact: true }))
  expect(await screen.findByText(/Only 40.00% is available/)).toBeInTheDocument()
  expect(pageantService.createRound).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Contribution to combined result (%)'), { target: { value: '40' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create Round', exact: true }))
  await screen.findByText('Group A final created successfully.')
  expect(pageantService.createRound.mock.calls[0][1]).toMatchObject({ categoryId: 'a', weight: 40 })
})

it('allows another independent round when combined contributions already total 100%', async () => {
  foundation.rounds = [round('existing')]
  await openWorkspace()
  await createRound('Independent final')
  expect(pageantService.createRound.mock.calls[0][1]).toMatchObject({ progression: 'back_to_zero', weight: 0 })
})

it('waits for confirmed persistence and navigates to Criteria using the returned round ID', async () => {
  let resolveCreation
  pageantService.createRound.mockImplementation(() => new Promise(resolve => { resolveCreation = resolve }))
  await openWorkspace()
  nameRound('Persisted round')
  fireEvent.click(screen.getByRole('button', { name: 'Create Round', exact: true }))
  expect(screen.queryByText('Persisted round created successfully.')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Configure Scoring Criteria' })).not.toBeInTheDocument()
  const saved = round('actual-returned-round-uuid', { name: 'Persisted round', progression: 'back_to_zero', weight: 0 })
  foundation.rounds.push(saved)
  resolveCreation({ data: { round: saved } })
  await screen.findByText('Persisted round created successfully.')
  fireEvent.click(screen.getByRole('button', { name: 'Configure Scoring Criteria' }))
  expect(await screen.findByText('New criterion for “Persisted round”')).toBeInTheDocument()
  expect(screen.getByTestId('location')).toHaveTextContent('tab=criteria&roundId=actual-returned-round-uuid')
  expect(screen.getByRole('button', { name: /^Persisted round/ })).toHaveAttribute('aria-pressed', 'true')
})

it('shows a failed create inline and keeps the organizer’s input without a success card', async () => {
  pageantService.createRound.mockRejectedValue({ response: { data: { message: 'Setup is frozen' } } })
  await openWorkspace()
  nameRound('Keep this name')
  fireEvent.click(screen.getByRole('button', { name: 'Create Round', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Setup is frozen')
  expect(screen.getByLabelText('What is the name of this round?')).toHaveValue('Keep this name')
  expect(screen.queryByText(/created successfully/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Configure Scoring Criteria' })).not.toBeInTheDocument()
})

it('preserves saved weights, scope, score policy, and advancement during a name-only edit', async () => {
  foundation.rounds = [round('saved-round', { name: 'Existing', weight: 75, purpose: 'qualification', progression: 'carry_forward', categoryId: 'a', divisionId: 'd', advancementType: 'top_n', advancementValue: 5, scorePolicy: 'cumulative' })]
  foundation.categories = [{ id: 'a', name: 'Existing group' }]
  foundation.divisions = [{ id: 'd', name: 'Existing division' }]
  foundation.event.divisions_enabled = true
  await openWorkspace()
  fireEvent.click(screen.getByRole('button', { name: 'Edit Round' }))
  const edit = screen.getByRole('form', { name: 'Edit Existing' })
  fireEvent.change(within(edit).getByLabelText('What is the name of this round?'), { target: { value: 'Renamed' } })
  fireEvent.click(within(edit).getByRole('button', { name: 'Save Round' }))
  await screen.findByText('Renamed updated successfully.')
  expect(pageantService.updateRound).toHaveBeenCalledExactlyOnceWith('event-id', 'saved-round', { name: 'Renamed' })
  expect(foundation.rounds[0]).toMatchObject({ weight: 75, progression: 'carry_forward', scorePolicy: 'cumulative', advancementType: 'top_n', advancementValue: 5, categoryId: 'a', divisionId: 'd' })
})

it('opens the existing penalty editor and keeps the disabled state understandable', async () => {
  foundation.rounds = [round('saved-round')]
  await openWorkspace()
  fireEvent.click(screen.getByRole('button', { name: 'More Settings' }))
  expect(screen.getByText(/Disabled. Define permitted deductions/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Configure penalties' }))
  expect(await screen.findByText('Predefined deductions (disabled when empty)')).toBeInTheDocument()
  expect(screen.getByText('Predefined deductions (disabled when empty)').closest('details')).toHaveAttribute('open')
  expect(screen.getByTestId('location')).toHaveTextContent('tab=scoring&roundId=saved-round&section=deductions')
})

it('preserves the stored contribution of a special award during a name-only edit', async () => {
  foundation.rounds = [round('special-round', { name: 'Existing award', purpose: 'special', weight: 75 })]
  await openWorkspace()
  expect(screen.getByText('Special Award Round · Independent award scoring')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Edit Round' }))
  const edit = screen.getByRole('form', { name: 'Edit Existing award' })
  expect(within(edit).queryByLabelText('Contribution to combined result (%)')).not.toBeInTheDocument()
  fireEvent.change(within(edit).getByLabelText('What is the name of this round?'), { target: { value: 'Renamed award' } })
  fireEvent.click(within(edit).getByRole('button', { name: 'Save Round' }))
  await screen.findByText('Renamed award updated successfully.')
  expect(pageantService.updateRound).toHaveBeenCalledExactlyOnceWith('event-id', 'special-round', { name: 'Renamed award' })
  expect(foundation.rounds[0]).toMatchObject({ purpose: 'special', progression: 'weighted', weight: 75 })
})

it('changes an existing final to Back to Zero only when explicitly saved', async () => {
  foundation.rounds = [round('final-round', { name: 'Existing final', purpose: 'final' })]
  await openWorkspace()
  fireEvent.click(screen.getByRole('button', { name: 'More Settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Configure progression' }))
  fireEvent.change(screen.getByLabelText("How should this round's scores be used?"), { target: { value: 'back_to_zero' } })
  expect(pageantService.updateRound).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save progression' }))
  await screen.findByText('Existing final updated successfully.')
  expect(pageantService.updateRound).toHaveBeenCalledExactlyOnceWith('event-id', 'final-round', { progression: 'back_to_zero' })
  expect(foundation.rounds[0].weight).toBe(100)
})

it('protects published rounds and links Live Control to the existing route', async () => {
  foundation.rounds = [round('saved-round')]
  foundation.event.status = 'scheduled'
  foundation.event.official_rules_id = 'frozen-rules'
  useEventStatus.mockReturnValue({ status: 'scheduled', setupLocked: true, loading: false })
  await openWorkspace()
  expect(screen.queryByRole('button', { name: 'Create Round', exact: true })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Edit Round' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'More Settings' }))
  expect(screen.getByRole('link', { name: 'Open Live Control' })).toHaveAttribute('href', '/organizer/competition/events/event-id/live')
  expect(pageantService.updateRound).not.toHaveBeenCalled()
})

it('keeps existing Criteria links and supports keyboard workspace tab navigation', async () => {
  foundation.rounds = [round('first'), round('second', { displayOrder: 1 })]
  await openWorkspace('?tab=criteria&roundId=second')
  expect(screen.getByRole('button', { name: /^second/ })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Criteria', exact: true }), { key: 'ArrowLeft' })
  expect(await screen.findByRole('heading', { name: 'Competition Rounds' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Rounds', exact: true })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Rounds', exact: true }), { key: 'ArrowRight' })
  expect(await screen.findByText('New criterion for “second”')).toBeInTheDocument()
})

it('retains the confirmed round even if refreshing the saved list fails', async () => {
  await openWorkspace()
  pageantService.getFoundation.mockRejectedValueOnce(new Error('Refresh failed'))
  await createRound('Confirmed round')
  expect(await screen.findByRole('alert')).toHaveTextContent('The change was saved')
  expect(screen.getByRole('heading', { name: 'Confirmed round', level: 4 })).toBeInTheDocument()
})

it('reuses the existing reorder and delete APIs for selected draft rounds', async () => {
  foundation.rounds = [round('first'), round('second', { displayOrder: 1 })]
  await openWorkspace()
  const second = screen.getByRole('heading', { name: 'second', level: 4 }).closest('li')
  fireEvent.click(within(second).getByRole('button', { name: 'More Settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Move earlier' }))
  await screen.findByText('Round order updated.')
  expect(workflowService.action).toHaveBeenCalledExactlyOnceWith('event-id', 'round-order', { roundIds: ['second', 'first'] })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  fireEvent.click(within(second).getByRole('button', { name: 'Delete', exact: true }))
  await screen.findByText('second deleted.')
  expect(pageantService.deleteRound).toHaveBeenCalledExactlyOnceWith('event-id', 'second')
  expect(screen.queryByRole('heading', { name: 'second', level: 4 })).not.toBeInTheDocument()
})
