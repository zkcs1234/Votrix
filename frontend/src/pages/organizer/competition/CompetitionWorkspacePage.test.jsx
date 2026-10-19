import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import CompetitionWorkspacePage from './CompetitionWorkspacePage'
import { pageantService } from '@/services/pageant.service'
import { workflowService } from '@/services/competition-workflow.service'
import useEventStatus from '@/hooks/useEventStatus'

vi.mock('@/services/pageant.service', () => ({ pageantService: {
  getFoundation: vi.fn(), createRound: vi.fn(), updateRound: vi.fn(), deleteRound: vi.fn(),
  setScoringConfig: vi.fn(), createCriteria: vi.fn(), addRoundCriteria: vi.fn(),
  setDivisionsEnabled: vi.fn(), createDivision: vi.fn(), updateDivision: vi.fn(), deleteDivision: vi.fn(), reorderDivisions: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn(),
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
  await screen.findByRole('heading', { name: search.startsWith('?tab=criteria') ? 'Scoring Criteria' : search.startsWith('?tab=scoring') ? 'Official Scoring Rules' : 'Competition Rounds' })
}
function nameRound(name) { fireEvent.change(screen.getByLabelText('Round name'), { target: { value: name } }) }
function openActions(action, card = null) {
  fireEvent.click((card ? within(card) : screen).getByRole('button', { name: /^More actions for/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: action, exact: true }))
}
function selectCombined(weight) {
  fireEvent.change(screen.getByLabelText('How are scores used?'), { target: { value: 'weighted' } })
  fireEvent.change(screen.getByLabelText('Contribution to combined result (%)'), { target: { value: String(weight) } })
}
async function createRound(name) {
  nameRound(name)
  fireEvent.click(screen.getByRole('button', { name: 'Create Round', exact: true }))
  await screen.findByText(`${name} created successfully.`)
  return screen.getByRole('heading', { name, level: 4 }).closest('li')
}

it('opens the saved advancement rule directly from Contestants & Entries',async()=>{
  foundation.rounds=[round('Preliminary',{purpose:'qualification',advancementType:'top_n',advancementValue:5})]
  await openWorkspace('?tab=rounds&section=advancement&roundId=Preliminary')
  expect(await screen.findByRole('heading',{name:'Advancement & Elimination'})).toBeInTheDocument()
  expect(screen.getByLabelText('Number of entries advancing')).toHaveValue(5)
})

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
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
it('keeps unsaved scoring choices across tabs and permits continuation only after a saved draft', async () => {
  foundation.scoringConfig = { calculationMethod: 'sum', confirmed: false, tiePolicy: 'shared', decimalPlaces: 2, independentApproval: false, deductionRules: [] }
  pageantService.setScoringConfig.mockImplementation(async (_id, config) => { foundation.scoringConfig = structuredClone(config); foundation.event.scoring_config = structuredClone(config); return { data: { success: true, config } } })
  await openWorkspace('?tab=scoring')
  fireEvent.change(screen.getByLabelText('Calculation method'), { target: { value: 'rank_based' } })
  expect(screen.getByRole('button', { name: 'Continue to Contestants & Entries' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Back: Divisions' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Scoring rules' }))
  expect(screen.getByLabelText('Calculation method')).toHaveValue('rank_based')
  expect(screen.getByRole('button', { name: 'Continue to Contestants & Entries' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  await screen.findByText('Draft saved. Complete and confirm the official rules before publishing.')
  await waitFor(()=>expect(screen.getByRole('button', { name: 'Continue to Contestants & Entries' })).toBeEnabled())
  expect(screen.getByText(/Draft saved — this step remains incomplete/)).toBeInTheDocument()
})

it('creates one independent dance round with no contribution field or event-wide checklist', async () => {
  await openWorkspace()
  expect(screen.queryByLabelText('Contribution to combined result (%)')).not.toBeInTheDocument()
  expect(screen.queryByText(/Setup checklist|must equal 100%|Round weight total/i)).not.toBeInTheDocument()
  const card = await createRound('Dance Performance')
  expect(pageantService.createRound).toHaveBeenCalledExactlyOnceWith('event-id', {
    name: 'Dance Performance', purpose: 'regular', progression: 'back_to_zero', weight: 0, categoryId: null, divisionId: null,
  })
  expect(within(card).getByText('Independent · 0 criteria')).toBeInTheDocument()
  expect(within(card).getByRole('button', { name: /^Configure criteria for/  })).toBeInTheDocument()
  expect(screen.getByRole('form', { name: 'Create Round' })).toBeInTheDocument()
})

it('keeps qualification purpose independent and saves advancement separately', async () => {
  await openWorkspace()
  fireEvent.change(screen.getByLabelText('Round purpose'), { target: { value: 'qualification' } })
  const card = await createRound('Preliminary')
  expect(pageantService.createRound.mock.calls[0][1]).toMatchObject({ purpose: 'qualification', progression: 'back_to_zero', weight: 0 })
  fireEvent.click(within(card).getByRole('button', { name: /^Settings for/  }))
  fireEvent.click(screen.getByRole('button', { name: 'Advancement & Elimination' }))
  fireEvent.change(screen.getByLabelText('Who should proceed to the next round?'), { target: { value: 'top_n' } })
  fireEvent.change(screen.getByLabelText('Number of entries advancing'), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save advancement' }))
  await screen.findByText('Preliminary updated successfully.')
  expect(pageantService.updateRound).toHaveBeenCalledExactlyOnceWith('event-id', 'saved-database-id-1', { advancementType: 'top_n', advancementValue: 3, scorePolicy: 'independent' })
})

it('creates a final round and exposes Back to Zero without requiring a combined weight', async () => {
  await openWorkspace()
  fireEvent.change(screen.getByLabelText('Round purpose'), { target: { value: 'final' } })
  const card = await createRound('Final')
  expect(pageantService.createRound.mock.calls[0][1]).toMatchObject({ purpose: 'final', progression: 'back_to_zero', weight: 0 })
  fireEvent.click(within(card).getByRole('button', { name: /^Settings for/  }))
  fireEvent.click(screen.getByRole('button', { name: 'Next Round / Back to Zero' }))
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
  expect(screen.queryByRole('button', { name: /^Configure criteria for/  })).not.toBeInTheDocument()
  const saved = round('actual-returned-round-uuid', { name: 'Persisted round', progression: 'back_to_zero', weight: 0 })
  foundation.rounds.push(saved)
  resolveCreation({ data: { round: saved } })
  await screen.findByText('Persisted round created successfully.')
  fireEvent.click(screen.getByRole('button', { name: /^Configure criteria for/  }))
  expect(await screen.findByText('New criterion for “Persisted round”')).toBeInTheDocument()
  expect(screen.getByTestId('location')).toHaveTextContent('tab=criteria&roundId=actual-returned-round-uuid')
  expect(screen.getByRole('button', { name: /^Configure Persisted round:/ })).toHaveAttribute('aria-pressed', 'true')
})

it('shows a failed create inline and keeps the organizer’s input without a success card', async () => {
  pageantService.createRound.mockRejectedValue({ response: { data: { message: 'Setup is frozen' } } })
  await openWorkspace()
  nameRound('Keep this name')
  fireEvent.click(screen.getByRole('button', { name: 'Create Round', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Setup is frozen')
  expect(screen.getByLabelText('Round name')).toHaveValue('Keep this name')
  expect(screen.queryByText(/created successfully/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Configure criteria for/  })).not.toBeInTheDocument()
})

it('preserves saved weights, scope, score policy, and advancement during a name-only edit', async () => {
  foundation.rounds = [round('saved-round', { name: 'Existing', weight: 75, purpose: 'qualification', progression: 'carry_forward', categoryId: 'a', divisionId: 'd', advancementType: 'top_n', advancementValue: 5, scorePolicy: 'cumulative' })]
  foundation.categories = [{ id: 'a', name: 'Existing group' }]
  foundation.divisions = [{ id: 'd', name: 'Existing division' }]
  foundation.event.divisions_enabled = true
  await openWorkspace()
  openActions('Edit')
  const edit = screen.getByRole('form', { name: 'Edit Existing' })
  fireEvent.change(within(edit).getByLabelText('Round name'), { target: { value: 'Renamed' } })
  fireEvent.click(within(edit).getByRole('button', { name: 'Save Round' }))
  await screen.findByText('Renamed updated successfully.')
  expect(pageantService.updateRound).toHaveBeenCalledExactlyOnceWith('event-id', 'saved-round', { name: 'Renamed' })
  expect(foundation.rounds[0]).toMatchObject({ weight: 75, progression: 'carry_forward', scorePolicy: 'cumulative', advancementType: 'top_n', advancementValue: 5, categoryId: 'a', divisionId: 'd' })
})

it('opens the existing penalty editor and keeps the disabled state understandable', async () => {
  foundation.scoringConfig.calculationMethod = 'weighted_average'
  foundation.rounds = [round('saved-round')]
  await openWorkspace()
  fireEvent.click(screen.getByRole('button', { name: /^Settings for/  }))
  expect(screen.getByText(/Disabled until permitted rules/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Deductions & Penalties' }))
  expect(await screen.findByText('Configure Penalty Rules')).toBeInTheDocument()
  expect(screen.getByText('Configure Penalty Rules').closest('details')).toHaveAttribute('open')
  expect(screen.getByTestId('location')).toHaveTextContent('tab=scoring&roundId=saved-round&section=deductions')
})

it('preserves the stored contribution of a special award during a name-only edit', async () => {
  foundation.rounds = [round('special-round', { name: 'Existing award', purpose: 'special', weight: 75 })]
  await openWorkspace()
  expect(screen.getByText('Independent award · 0 criteria')).toBeInTheDocument()
  openActions('Edit')
  const edit = screen.getByRole('form', { name: 'Edit Existing award' })
  expect(within(edit).queryByLabelText('Contribution to combined result (%)')).not.toBeInTheDocument()
  fireEvent.change(within(edit).getByLabelText('Round name'), { target: { value: 'Renamed award' } })
  fireEvent.click(within(edit).getByRole('button', { name: 'Save Round' }))
  await screen.findByText('Renamed award updated successfully.')
  expect(pageantService.updateRound).toHaveBeenCalledExactlyOnceWith('event-id', 'special-round', { name: 'Renamed award' })
  expect(foundation.rounds[0]).toMatchObject({ purpose: 'special', progression: 'weighted', weight: 75 })
})

it('changes an existing final to Back to Zero only when explicitly saved', async () => {
  foundation.rounds = [round('final-round', { name: 'Existing final', purpose: 'final' })]
  await openWorkspace()
  fireEvent.click(screen.getByRole('button', { name: /^Settings for/  }))
  fireEvent.click(screen.getByRole('button', { name: 'Next Round / Back to Zero' }))
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
  expect(screen.getByRole('button', { name: /^More actions for/ })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: /^Settings for/  }))
  expect(screen.getByRole('link', { name: 'Stage Lineup & Live Scoring' })).toHaveAttribute('href', '/organizer/competition/events/event-id/live')
  expect(pageantService.updateRound).not.toHaveBeenCalled()
})

it('keeps existing Criteria links and supports keyboard workspace tab navigation', async () => {
  foundation.rounds = [round('first'), round('second', { displayOrder: 1 })]
  await openWorkspace('?tab=criteria&roundId=second')
  expect(screen.getByRole('button', { name: /^Configure second:/ })).toHaveAttribute('aria-pressed', 'true')
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
  expect(await screen.findByText(/The change was saved, but the round list could not refresh/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reload saved setup' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Confirmed round', level: 4 })).toBeInTheDocument()
})

it('reuses the existing reorder and delete APIs for selected draft rounds', async () => {
  foundation.rounds = [round('first'), round('second', { displayOrder: 1 })]
  await openWorkspace()
  const second = screen.getByRole('heading', { name: 'second', level: 4 }).closest('li')
  openActions('Reorder', second)
  fireEvent.click(screen.getByRole('button', { name: 'Move earlier' }))
  await screen.findByText('Round order updated.')
  expect(workflowService.action).toHaveBeenCalledExactlyOnceWith('event-id', 'round-order', { roundIds: ['second', 'first'] })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  openActions('Delete', second)
  await screen.findByText('second deleted.')
  expect(pageantService.deleteRound).toHaveBeenCalledExactlyOnceWith('event-id', 'second')
  expect(screen.queryByRole('heading', { name: 'second', level: 4 })).not.toBeInTheDocument()
})

it('opens one focused drawer, traps focus, closes on Escape, and restores its trigger', async () => {
  foundation.rounds = [round('preliminary', { name: 'Preliminary', purpose: 'qualification' })]
  await openWorkspace()
  const trigger = screen.getByRole('button', { name: 'Settings for Preliminary' })
  trigger.focus()
  fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'Preliminary — Round Settings' })
  expect(document.body.style.overflow).toBe('hidden')
  const done = within(dialog).getByRole('button', { name: 'Done' })
  done.focus()
  fireEvent.keyDown(done, { key: 'Tab' })
  expect(within(dialog).getByRole('button', { name: 'Close', exact: true })).toHaveFocus()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Advancement & Elimination' }))
  expect(within(dialog).getByRole('form', { name: 'Advancement settings' })).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: 'Scoring Criteria' })).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Round settings' }))
  expect(within(dialog).queryByRole('form')).not.toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Scoring Criteria' })).toBeInTheDocument()
  fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Close', exact: true }), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.body.style.overflow).not.toBe('hidden')
  expect(trigger).toHaveFocus()
  expect(pageantService.updateRound).not.toHaveBeenCalled()
})

it('keeps workspace navigation in page flow and leaves the shell’s sticky portal empty', async () => {
  const portal = document.createElement('div')
  portal.id = 'stage-footer-portal'
  document.body.appendChild(portal)
  try {
    await openWorkspace()
    const next = screen.getByRole('button', { name: 'Continue to Criteria' })
    expect(next.closest('[data-workspace-footer]')).not.toBeNull()
    expect(portal).toBeEmptyDOMElement()
    expect(screen.getAllByRole('heading', { name: 'Competition Rounds' })).toHaveLength(1)
    expect(screen.getByText('0 configured')).toBeInTheDocument()
    await createRound('Counted round')
    expect(screen.getByText('1 configured')).toBeInTheDocument()
  } finally { portal.remove() }
})

it('explains and disables the next-round selector until a later round exists', async () => {
  foundation.rounds = [round('only-round', { name: 'Only round', progression: 'back_to_zero', weight: 0 })]
  await openWorkspace()
  fireEvent.click(screen.getByRole('button', { name: 'Settings for Only round' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next Round / Back to Zero' }))
  expect(screen.getByLabelText('Next round')).toBeDisabled()
  expect(screen.getByText('Create a later main round first, then return here to choose its source.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(pageantService.updateRound).not.toHaveBeenCalled()
})
it('disables every division mutation after official rule publication', async () => {
  foundation.event.official_rules_id = 'rules'; foundation.event.divisions_enabled = true
  foundation.divisions = [{ id: 'a', name: 'Men', isActive: true }, { id: 'b', name: 'Women', isActive: true }]
  await openWorkspace()
  fireEvent.click(screen.getByRole('tab', { name: 'Divisions', exact: true }))
  expect(screen.getByRole('button', { name: 'Disable Divisions' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Add division' })).toBeDisabled()
  screen.getAllByRole('button', { name: 'Edit', exact: true }).forEach(button => expect(button).toBeDisabled())
  screen.getAllByRole('button', { name: /^Move (Men|Women)/ }).forEach(button => expect(button).toBeDisabled())
  expect(pageantService.updateDivision).not.toHaveBeenCalled()
})
it('guards the hidden category route as read-only for frozen official rules', async () => {
  foundation.event.official_rules_id = 'rules'
  foundation.categories = [{ id: 'a', name: 'Talent', weight: 100, isActive: true }]
  render(<MemoryRouter initialEntries={['/organizer/competition/events/event-id/workspace?tab=structure']}><Routes><Route path="/organizer/competition/events/:eventId/workspace" element={<CompetitionWorkspacePage />} /></Routes></MemoryRouter>)
  await screen.findByText('Talent')
  expect(screen.getByRole('button', { name: 'Add category' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled()
  expect(pageantService.createCategory).not.toHaveBeenCalled()
})
it('uses one atomic division reorder call and reports failure without partial PATCH writes', async () => {
  foundation.event.divisions_enabled = true
  foundation.divisions = [{ id: 'a', name: 'Men', isActive: true }, { id: 'b', name: 'Women', isActive: true }]
  pageantService.reorderDivisions.mockRejectedValue({ response: { data: { message: 'Division order conflict' } } })
  await openWorkspace(); fireEvent.click(screen.getByRole('tab', { name: 'Divisions', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Move Women earlier' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Division order conflict')
  expect(pageantService.reorderDivisions).toHaveBeenCalledExactlyOnceWith('event-id', ['b', 'a'])
  expect(pageantService.updateDivision).not.toHaveBeenCalled()
})
it('shows a division save failure and preserves the typed form for retry', async () => {
  foundation.event.divisions_enabled = true
  pageantService.createDivision.mockRejectedValue({ response: { data: { message: 'Division service offline' } } })
  await openWorkspace(); fireEvent.click(screen.getByRole('tab', { name: 'Divisions', exact: true }))
  fireEvent.change(screen.getByLabelText('Division name'), { target: { value: 'Junior' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add division' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Division service offline')
  expect(screen.getByLabelText('Division name')).toHaveValue('Junior')
})
