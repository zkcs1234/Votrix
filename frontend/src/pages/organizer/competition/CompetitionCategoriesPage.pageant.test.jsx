import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CompetitionCategoriesPage from './CompetitionCategoriesPage'

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
  await waitFor(() => expect(f.createCompetition).toHaveBeenCalledWith(
    'event',
    expect.objectContaining({ name: 'Street Dance', competitionType: 'dance' }),
  ))
  expect(f.createDivision).not.toHaveBeenCalled()
  expect(f.listDivisions).not.toHaveBeenCalled()
})
