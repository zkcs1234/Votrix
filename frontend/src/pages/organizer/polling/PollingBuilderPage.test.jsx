import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PollingBuilderPage from './PollingBuilderPage'
import { pollingService } from '@/services/polling.service'
import api from '@/services/api'

vi.mock('@/services/api', () => ({ default: { get: vi.fn() } }))
vi.mock('@/services/polling.service', () => ({
  pollingService: { listQuestions: vi.fn(), createQuestion: vi.fn(), updateQuestion: vi.fn() },
}))
vi.mock('@/hooks/useEventStatus', () => ({ default: () => ({ status: 'draft', setupLocked: false }) }))
vi.mock('@/components/upload/ImageUploadField', () => ({ default: () => null }))

const types = [
  { key: 'single_choice', label: 'Single choice', ui: { input: 'radio' }, answerFormat: { kind: 'choice' } },
  {
    key: 'number', label: 'Number', ui: { input: 'number' }, answerFormat: { kind: 'numeric' },
    configSchema: { step: { type: 'number', minimum: 0 } },
  },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/organizer/polling/events/p1/builder']}>
      <Routes><Route path="/organizer/polling/events/:eventId/builder" element={<PollingBuilderPage />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  api.get.mockResolvedValue({ data: { types } })
  pollingService.listQuestions.mockResolvedValue({ data: { questions: [] } })
  pollingService.createQuestion.mockResolvedValue({ data: {} })
})

describe('Poll builder question form', () => {
  it('flags a blank question and too few options while editing, and explains the disabled button', async () => {
    renderPage()
    const question = await screen.findByLabelText(/^Question text/)
    const add = screen.getByRole('button', { name: 'Add question' })
    expect(add).toBeDisabled()
    expect(screen.getByText('Enter the question text to continue.')).toBeInTheDocument()

    fireEvent.change(question, { target: { value: '   ' } })
    expect(screen.queryByText('Question text is required')).not.toBeInTheDocument() // not before leaving the field
    fireEvent.blur(question)
    expect(await screen.findByText('Question text is required')).toBeInTheDocument()

    fireEvent.change(question, { target: { value: 'Favourite colour?' } })
    await waitFor(() => expect(screen.queryByText('Question text is required')).not.toBeInTheDocument())

    const first = screen.getByPlaceholderText('Option 1')
    fireEvent.change(first, { target: { value: 'Red' } })
    fireEvent.blur(first)
    expect(await screen.findByText('Add at least two options')).toBeInTheDocument()
    expect(add).toBeDisabled()
    expect(screen.getByText('Fix the highlighted fields to continue.')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Option 2'), { target: { value: 'Blue' } })
    await waitFor(() => expect(add).toBeEnabled())
    expect(screen.queryByText('Add at least two options')).not.toBeInTheDocument()
  })

  it('flags a repeated option and submits once everything is valid', async () => {
    renderPage()
    fireEvent.change(await screen.findByLabelText(/^Question text/), { target: { value: 'Pick one' } })
    fireEvent.change(screen.getByPlaceholderText('Option 1'), { target: { value: 'Red' } })
    const second = screen.getByPlaceholderText('Option 2')
    fireEvent.change(second, { target: { value: 'red' } })
    fireEvent.blur(second)
    expect(await screen.findByText('This option is already listed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add question' })).toBeDisabled()

    fireEvent.change(second, { target: { value: 'Blue' } })
    const add = screen.getByRole('button', { name: 'Add question' })
    await waitFor(() => expect(add).toBeEnabled())
    fireEvent.click(add)

    await waitFor(() => expect(pollingService.createQuestion).toHaveBeenCalledWith('p1', expect.objectContaining({
      question: 'Pick one',
      options: [
        { label: 'Red', imageUrl: null, imageAssetId: null },
        { label: 'Blue', imageUrl: null, imageAssetId: null },
      ],
    })))
  })

  it('validates a numeric setting as it is typed', async () => {
    renderPage()
    fireEvent.change(await screen.findByLabelText(/^Question type/), { target: { value: 'number' } })
    fireEvent.change(await screen.findByLabelText(/^Question text/), { target: { value: 'How many?' } })
    const step = await screen.findByLabelText('Step')
    fireEvent.change(step, { target: { value: '0' } })
    fireEvent.blur(step)
    expect(await screen.findByText('Step must be greater than 0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add question' })).toBeDisabled()

    fireEvent.change(step, { target: { value: '1' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add question' })).toBeEnabled())
  })
})
