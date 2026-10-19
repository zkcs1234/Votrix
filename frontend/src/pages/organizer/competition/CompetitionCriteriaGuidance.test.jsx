import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import CompetitionWorkspacePage from './CompetitionWorkspacePage'
import { pageantService } from '@/services/pageant.service'
import { workflowService } from '@/services/competition-workflow.service'

vi.mock('@/services/pageant.service', () => ({ pageantService: {
  getFoundation: vi.fn(), createCriteria: vi.fn(), updateCriteria: vi.fn(), deleteCriteria: vi.fn(), removeRoundCriteria: vi.fn(), addRoundCriteria: vi.fn(),
  createMinorCriteria: vi.fn(), updateMinorCriteria: vi.fn(), deleteMinorCriteria: vi.fn(),
} }))
vi.mock('@/services/competition-workflow.service', () => ({ workflowService: { createRoundCriterion: vi.fn() } }))
vi.mock('@/hooks/useEventStatus', () => ({ default: () => ({ status: 'draft', setupLocked: false, loading: false }) }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }))
const criterion = (id, percentage = 100, extra = {}) => ({ id, name: id, percentage, minScore: 1, maxScore: 100, is_active: true, minorCriteria: [], ...extra })
const round = (id, name, criteriaIds, displayOrder) => ({ id, name, criteriaIds, displayOrder })
let foundation
function Location() { const location = useLocation(); return <p data-testid="location">{location.search}</p> }
async function open(roundId = 'pre-actual-id') {
  render(<MemoryRouter initialEntries={[`/organizer/competition/events/e/workspace?tab=criteria${roundId ? `&roundId=${roundId}` : ''}`]}><Routes><Route path="/organizer/competition/events/:eventId/workspace" element={<CompetitionWorkspacePage />} /></Routes><Location /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Scoring Criteria' })
}
const card = name => within(screen.getByRole('region', { name: 'Round Setup Progress' })).getByRole('button', { name: new RegExp(`^Configure ${name}:`) })
const continueButton = () => screen.getByRole('button', { name: 'Continue to Divisions' })
const completion = () => within(screen.getByRole('region', { name: 'Criteria Completion' }))
function newMajor(name, weight) { fireEvent.change(screen.getByLabelText(/New criterion for|Criteria name/), { target: { value: name } }); fireEvent.change(screen.getByLabelText('Weight percentage'), { target: { value: String(weight) } }) }
beforeEach(() => {
  vi.resetAllMocks()
  foundation = { event: { id: 'e', scoring_config: {} }, rounds: [round('final-actual-id', 'Final', ['final-c'], 1), round('pre-actual-id', 'Preliminary', ['pre-c'], 0)], criteria: [criterion('pre-c'), criterion('final-c', 60)], divisions: [], categories: [] }
  pageantService.getFoundation.mockImplementation(async () => ({ data: { foundation: structuredClone(foundation) } }))
  workflowService.createRoundCriterion.mockImplementation(async (_event, roundId, payload) => {
    foundation.criteria.push(criterion('new-saved-id', payload.percentage, payload))
    foundation.rounds.find(r => r.id === roundId).criteriaIds.push('new-saved-id')
    return { data: { criteria: { id: 'new-saved-id' } } }
  })
  pageantService.createCriteria.mockImplementation(async (_event, payload) => { foundation.criteria.push(criterion('flat-new-id', payload.percentage, payload)); return { data: { criteria: { id: 'flat-new-id' } } } })
  pageantService.updateCriteria.mockImplementation(async (_event, id, payload) => { const c = foundation.criteria.find(c => c.id === id); Object.assign(c, payload); if ('isActive' in payload) c.is_active = payload.isActive })
  pageantService.updateMinorCriteria.mockImplementation(async (_event, id, minorId, payload) => Object.assign(foundation.criteria.find(c => c.id === id).minorCriteria.find(m => m.id === minorId), payload))
  pageantService.removeRoundCriteria.mockImplementation(async (_event, roundId, id) => { const r = foundation.rounds.find(r => r.id === roundId); r.criteriaIds = r.criteriaIds.filter(c => c !== id) })
  pageantService.deleteCriteria.mockImplementation(async (_event, id) => { foundation.criteria = foundation.criteria.filter(c => c.id !== id); foundation.rounds.forEach(r => { r.criteriaIds = r.criteriaIds.filter(c => c !== id) }) })
  pageantService.addRoundCriteria.mockImplementation(async (_event, roundId, id) => foundation.rounds.find(r => r.id === roundId).criteriaIds.push(id))
  pageantService.createMinorCriteria.mockImplementation(async (_event, id, payload) => foundation.criteria.find(c => c.id === id).minorCriteria.push({ id: 'new-minor-id', isActive: true, ...payload }))
  pageantService.deleteMinorCriteria.mockImplementation(async (_event, id, minorId) => { const c = foundation.criteria.find(c => c.id === id); c.minorCriteria = c.minorCriteria.filter(m => m.id !== minorId) })
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
})
it('shows saved progress, uses official order and guides to the actual next round ID', async () => {
  const original = structuredClone(foundation)
  await open()
  expect(screen.getByText('1 of 2 ready')).toBeInTheDocument()
  expect(card('Preliminary')).toHaveTextContent('1. Preliminary')
  expect(card('Final')).toHaveTextContent('60% · In Progress')
  expect(continueButton()).toBeDisabled()
  expect(screen.queryByRole('button', { name: /Validate Round/i })).not.toBeInTheDocument()
  fireEvent.click(completion().getByRole('button', { name: 'Next: Final' }))
  expect(screen.getByTestId('location')).toHaveTextContent('roundId=final-actual-id')
  await screen.findByLabelText('New criterion for “Final”')
  expect(completion().getByText('40% remaining. Add or adjust criteria to complete this round.')).toBeInTheDocument()
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  expect(foundation).toEqual(original)
})
it('unlocks Continue to Divisions only after the final save and confirmation reload', async () => {
  await open('final-actual-id')
  newMajor('Presentation', 40)
  fireEvent.click(screen.getByRole('button', { name: 'Add to round' }))
  await screen.findByText('All Rounds Ready')
  expect(continueButton()).toBeEnabled()
  expect(workflowService.createRoundCriterion).toHaveBeenCalledWith('e', 'final-actual-id', expect.objectContaining({ name: 'Presentation', percentage: 40 }))
  expect(foundation.criteria.find(c => c.id === 'pre-c').percentage).toBe(100)
  fireEvent.click(continueButton())
  expect(screen.getByRole('tab', { name: 'Divisions' })).toHaveAttribute('aria-selected', 'true')
})
it('a previously complete reused criterion becomes incomplete in every linked round after editing', async () => {
  foundation.rounds.forEach(r => { r.criteriaIds = ['pre-c'] })
  await open()
  expect(continueButton()).toBeEnabled()
  vi.spyOn(window, 'prompt').mockReturnValueOnce('Quality revised').mockReturnValueOnce('80')
  fireEvent.click(screen.getByRole('button', { name: 'Edit major pre-c' }))
  await screen.findByText('0 of 2 ready')
  expect(card('Final')).toHaveTextContent('80% · In Progress')
  expect(continueButton()).toBeDisabled()
  expect(foundation.criteria.find(c => c.id === 'pre-c').id).toBe('pre-c')
})
it('100% cannot be complete with disabled minors, and enabling a valid minor restores completion', async () => {
  foundation.rounds = [foundation.rounds[1]]
  foundation.criteria[0].minorCriteria = [{ id: 'm', name: 'Technique', scoreType: 'range_1_10', isActive: false }]
  await open()
  expect(card('Preliminary')).toHaveTextContent('100% · Needs Attention')
  expect(continueButton()).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Enable Technique' }))
  await screen.findByText('All Rounds Ready')
  expect(continueButton()).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Disable Technique' }))
  await waitFor(() => expect(continueButton()).toBeDisabled())
})
it('flat scoring validates saved direct inputs and automatically completes after creating the remaining weight', async () => {
  foundation.rounds = []; foundation.criteria = [criterion('flat', 60)]
  await open(null)
  expect(continueButton()).toBeDisabled()
  newMajor('Technique', 40)
  fireEvent.click(screen.getByRole('button', { name: 'Add criteria' }))
  await screen.findByText('Scoring Criteria Ready')
  expect(pageantService.createCriteria).toHaveBeenCalledWith('e', expect.objectContaining({ percentage: 40 }))
  expect(continueButton()).toBeEnabled()
})
it('invalid direct ranges with no minor inputs block completion at 100%', async () => {
  foundation.rounds = []; foundation.criteria = [criterion('missing-input', 100, { minScore: null, maxScore: null })]
  await open(null)
  expect(continueButton()).toBeDisabled()
  expect(completion().getByText(/configure a valid score range/)).toBeInTheDocument()
})
it('manual round cards remain available before completion and Previous Round restores the saved selection', async () => {
  foundation.criteria[0].percentage = 80
  await open()
  expect(completion().getByRole('button', { name: 'Next: Final' })).toBeDisabled()
  fireEvent.click(card('Final'))
  expect(card('Final')).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(completion().getByRole('button', { name: 'Previous Round' }))
  expect(card('Preliminary')).toHaveAttribute('aria-pressed', 'true')
  expect(foundation.criteria[0].percentage).toBe(80)
})
it('failed saves preserve entered data and never produce a completed round', async () => {
  workflowService.createRoundCriterion.mockRejectedValueOnce(new Error('Save rejected'))
  await open('final-actual-id')
  newMajor('Presentation', 40)
  fireEvent.click(screen.getByRole('button', { name: 'Add to round' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('New criterion for “Final”')).toHaveValue('Presentation')
  expect(screen.getByLabelText('Weight percentage')).toHaveValue(40)
  expect(card('Final')).toHaveTextContent('Needs Attention')
  expect(continueButton()).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Add to round' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Use saved configuration' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add to round' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Add to round' }))
  await screen.findByText('All Rounds Ready')
  expect(continueButton()).toBeEnabled()
})
it('pending saves cannot enable navigation, even while manual round selection changes', async () => {
  let resolveSave
  pageantService.updateCriteria.mockImplementation(() => new Promise(resolve => { resolveSave = resolve }))
  foundation.rounds.forEach(r => { r.criteriaIds = ['pre-c'] })
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Disable pre-c' }))
  expect(continueButton()).toBeDisabled()
  expect(completion().getByRole('button', { name: 'Next: Final' })).toBeDisabled()
  fireEvent.click(card('Final'))
  expect(continueButton()).toBeDisabled()
  await act(async () => { resolveSave() })
  await waitFor(() => expect(continueButton()).toBeEnabled())
})
it('a confirmed write with a failed reload is recovered by fetching, without inserting twice', async () => {
  await open('final-actual-id')
  pageantService.getFoundation.mockRejectedValueOnce(new Error('Reload failed'))
  newMajor('Presentation', 40)
  fireEvent.click(screen.getByRole('button', { name: 'Add to round' }))
  await screen.findByRole('alert')
  expect(continueButton()).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved criteria' }))
  await screen.findByText('All Rounds Ready')
  expect(workflowService.createRoundCriterion).toHaveBeenCalledTimes(1)
  expect(continueButton()).toBeEnabled()
})
it('detaching and reattaching retained records automatically rechecks readiness', async () => {
  foundation.rounds = [foundation.rounds[1]]
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Remove from round' }))
  await waitFor(() => expect(card('Preliminary')).toHaveTextContent('Not Started'))
  expect(foundation.criteria.some(c => c.id === 'pre-c')).toBe(true)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pre-c' } })
  fireEvent.click(screen.getByRole('button', { name: 'Attach', exact: true }))
  await screen.findByText('All Rounds Ready')
  expect(continueButton()).toBeEnabled()
})
it('minor create, range edit, and delete each revalidate saved inputs', async () => {
  foundation.rounds = [foundation.rounds[1]]
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Add minor criterion' }))
  fireEvent.change(screen.getByLabelText('Minor criterion name'), { target: { value: 'Expression' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }))
  await screen.findByRole('button', { name: 'Edit Expression' })
  fireEvent.click(screen.getByRole('button', { name: 'Edit Expression' }))
  fireEvent.change(screen.getByLabelText('Minor score type'), { target: { value: 'custom_range' } })
  fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Maximum score'), { target: { value: '20' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save minor' }))
  await waitFor(() => expect(pageantService.updateMinorCriteria).toHaveBeenCalledWith('e', 'pre-c', 'new-minor-id', { name: 'Expression', scoreType: 'custom_range', customMin: 0, customMax: 20 }))
  await waitFor(() => expect(continueButton()).toBeEnabled())
  fireEvent.click(screen.getByTitle('Delete minor criterion'))
  await waitFor(() => expect(pageantService.deleteMinorCriteria).toHaveBeenCalledTimes(1))
  expect(foundation.criteria[0].minorCriteria).toEqual([])
})
it('stale round-switch responses cannot overwrite a newer saved foundation', async () => {
  await open()
  let resolveOld
  const old = structuredClone(foundation)
  pageantService.getFoundation.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
  fireEvent.click(card('Final'))
  foundation.criteria[1].percentage = 100
  fireEvent.click(card('Preliminary'))
  await screen.findByText('All Rounds Ready')
  await act(async () => { resolveOld({ data: { foundation: old } }) })
  expect(continueButton()).toBeEnabled()
  expect(card('Final')).toHaveTextContent('100% · Complete')
})
it('places the Criteria wizard footer in its sticky portal and reserves content space', async () => {
  const portal = document.createElement('div'); portal.id = 'stage-footer-portal'; document.body.appendChild(portal)
  try {
    await open()
    expect(portal.querySelector('[data-workspace-footer]')).not.toBeNull()
    expect(continueButton()).toBeDisabled()
  } finally { portal.remove() }
})
