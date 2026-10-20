import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CompetitionCategoriesPage from './CompetitionCategoriesPage'
import {queryClient} from '@/app/queryClient'

const f = vi.hoisted(() => ({
  event: null,
  children: [],
  divisions: [],
  createDivision: vi.fn(),
  createCompetition: vi.fn(),
  editCompetition: vi.fn(),
  deleteDivision: vi.fn(),
  setDivisionsEnabled: vi.fn(),
  listDivisions: vi.fn(),
}))

vi.mock('@/services/pageant.service', () => ({
  pageantService: {
    getEvent: vi.fn(async () => ({ data: { event: f.event } })),
    updateEvent: vi.fn(),
    listDivisions: f.listDivisions,
    createDivision: f.createDivision,
    deleteDivision: f.deleteDivision,
    setDivisionsEnabled: f.setDivisionsEnabled,
  },
}))

vi.mock('@/services/competition-native.service', () => ({
  nativeCompetitionService: {
    list: vi.fn(async () => ({ data: { competitions: f.children } })),
    create: f.createCompetition,
    edit: f.editCompetition,
    remove: vi.fn(),
  },
}))

beforeEach(() => {
  queryClient.clear()
  vi.clearAllMocks()
  f.event = { id: 'event', status: 'draft', competitionType: 'pageant', divisionsEnabled: false }
  f.children = []
  f.divisions = []
  f.listDivisions.mockImplementation(async () => ({ data: { divisions: [...f.divisions] } }))
  f.setDivisionsEnabled.mockResolvedValue({ data: {} })
  f.createCompetition.mockImplementation(async (_eventId, competition) => {
    const created = { ...competition, origin: 'native', participation_format: 'individual' }
    f.children.push(created)
    return { data: { competition: created } }
  })
  f.createDivision.mockImplementation(async (_eventId, division) => {
    const created = { id: `division-${f.divisions.length + 1}`, ...division }
    f.divisions.push(created)
    return { data: { division: created } }
  })
  f.deleteDivision.mockImplementation(async (_eventId, divisionId) => {
    f.divisions = f.divisions.filter(division => division.id !== divisionId)
    return { data: {} }
  })
})

afterEach(cleanup)

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/organizer/competition/events/event/categories']}>
      <Routes>
        <Route path="/organizer/competition/events/:eventId/categories" element={<CompetitionCategoriesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderTypeFlow() {
  return render(
    <MemoryRouter initialEntries={['/organizer/competition/events/event/type']}>
      <Routes>
        <Route path="/organizer/competition/events/:eventId/type" element={<CompetitionCategoriesPage typeOnly />} />
        <Route path="/organizer/competition/events/:eventId/categories" element={<CompetitionCategoriesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

test('passes loaded competition choices from type selection into Step 4 without fetching them again', async () => {
  f.event.competitionType = 'dance'
  renderTypeFlow()

  const { pageantService } = await import('@/services/pageant.service')
  const { nativeCompetitionService } = await import('@/services/competition-native.service')
  const nextButton = await screen.findByRole('button', { name: /Next: Competitions \/ Categories/ })
  const eventCallsBeforeNavigation = pageantService.getEvent.mock.calls.length
  const listCallsBeforeNavigation = nativeCompetitionService.list.mock.calls.length
  fireEvent.click(nextButton)
  expect(await screen.findByRole('heading', { name: 'Choose your competitions' })).toBeInTheDocument()
  expect(screen.queryByText(/Loading your saved competitions/)).not.toBeInTheDocument()
  expect(await screen.findByText('Suggested choices')).toBeInTheDocument()
  expect(pageantService.getEvent).toHaveBeenCalledTimes(eventCallsBeforeNavigation)
  expect(nativeCompetitionService.list).toHaveBeenCalledTimes(listCallsBeforeNavigation)
})

test('pageant divisions create one Pageant scoring competition and count it once', async () => {
  renderPage()

  fireEvent.click(await screen.findByRole('checkbox', { name: 'Women' }))
  await screen.findByText('1 division · Women')
  fireEvent.click(screen.getByRole('checkbox', { name: 'Men' }))
  await screen.findByText('2 divisions · Women · Men')

  expect(f.createCompetition).toHaveBeenCalledTimes(1)
  expect(f.createCompetition).toHaveBeenCalledWith('event', expect.objectContaining({
    name: 'Pageant',
    competitionType: 'pageant',
  }))
  expect(f.createDivision).toHaveBeenCalledTimes(2)
  expect(f.createDivision).toHaveBeenNthCalledWith(1, 'event', { name: 'Women' })
  expect(f.createDivision).toHaveBeenNthCalledWith(2, 'event', { name: 'Men' })
  expect(screen.getByText('1 selected')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Pageant' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Women' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Men' })).not.toBeInTheDocument()
  expect(f.setDivisionsEnabled).toHaveBeenCalledWith('event', true)
})

test('existing Pageant divisions get one shared scoring competition on selection load', async () => {
  f.divisions = [{ id: 'women', name: 'Women' }, { id: 'men', name: 'Men' }]
  renderPage()

  expect(await screen.findByText('1 selected')).toBeInTheDocument()
  expect(f.createCompetition).toHaveBeenCalledTimes(1)
  expect(f.createCompetition).toHaveBeenCalledWith('event', expect.objectContaining({
    name: 'Pageant',
    competitionType: 'pageant',
  }))
  expect(f.createDivision).not.toHaveBeenCalled()
  expect(screen.getByRole('heading', { name: 'Pageant' })).toBeInTheDocument()
})

test('non-pageant preset choices continue to create separate competitions', async () => {
  f.event.competitionType = 'dance'
  f.listDivisions.mockClear()
  renderPage()

  fireEvent.click(await screen.findByRole('checkbox', { name: 'Street Dance' }))
  expect(screen.getByText('1 selected')).toBeInTheDocument()
  await waitFor(() => expect(f.createCompetition).toHaveBeenCalledWith(
    'event',
    expect.objectContaining({ name: 'Street Dance', competitionType: 'dance' }),
  ))
  await waitFor(() => expect(f.editCompetition).toHaveBeenCalledTimes(1))
  const { nativeCompetitionService } = await import('@/services/competition-native.service')
  expect(nativeCompetitionService.list).toHaveBeenCalledTimes(1)
  expect(f.createDivision).not.toHaveBeenCalled()
  expect(f.listDivisions).not.toHaveBeenCalled()
})

test('shows a new competition as selected while the save request is still pending', async () => {
  f.event.competitionType = 'dance'
  let finishCreate
  f.createCompetition.mockReturnValue(new Promise(resolve => { finishCreate = resolve }))
  renderPage()
  const { nativeCompetitionService } = await import('@/services/competition-native.service')
  const card = await screen.findByRole('checkbox', { name: 'Street Dance' })

  fireEvent.click(card)

  expect(card).toBeChecked()
  expect(screen.getByText('1 selected')).toBeInTheDocument()
  expect(nativeCompetitionService.list).toHaveBeenCalledTimes(1)
  finishCreate({ data: { competition: { id: 'street-dance', name: 'Street Dance', origin: 'native', setup_revision: 1 } } })
  await waitFor(() => expect(f.editCompetition).toHaveBeenCalledTimes(1))
})
