import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PollingBuilderPage from './PollingBuilderPage'
import { pollingService } from '@/services/polling.service'
import api from '@/services/api'

vi.mock('@/services/api', () => ({ default: { get: vi.fn() } }))
vi.mock('@/services/polling.service', () => ({
  pollingService: { listQuestions: vi.fn(), createQuestion: vi.fn(), updateQuestion: vi.fn(), uploadGenericImage: vi.fn() },
}))
vi.mock('@/hooks/useEventStatus', () => ({ default: () => ({ status: 'draft', setupLocked: false }) }))
// A minimal stand-in that shows what the saved URL is, like the real field does.
vi.mock('@/components/upload/ImageUploadField', () => ({
  default: ({ label, hint, currentUrl, onFileSelect }) => (
    <div>
      <input type="file" aria-label={label ?? hint} onChange={(e) => onFileSelect(e.target.files[0])} />
      {currentUrl && <img alt="saved" src={currentUrl} />}
    </div>
  ),
}))

const types = [
  { key: 'single_choice', label: 'Single choice', ui: { input: 'radio', optionEditor: 'options' }, answerFormat: { kind: 'choice' } },
]
const file = () => new File(['x'], 'a.png', { type: 'image/png' })

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/organizer/polling/events/p1/builder']}>
      <Routes><Route path="/organizer/polling/events/:eventId/builder" element={<PollingBuilderPage />} /></Routes>
    </MemoryRouter>,
  )
}
async function fillQuestion() {
  fireEvent.change(await screen.findByLabelText(/^Question text/), { target: { value: 'Pick one' } })
  fireEvent.change(screen.getByPlaceholderText('Option 1'), { target: { value: 'Red' } })
  fireEvent.change(screen.getByPlaceholderText('Option 2'), { target: { value: 'Blue' } })
}
const optionImageInputs = () => screen.getAllByLabelText('Option image (optional)')

beforeEach(() => {
  vi.resetAllMocks()
  api.get.mockResolvedValue({ data: { types } })
  pollingService.listQuestions.mockResolvedValue({ data: { questions: [] } })
  pollingService.createQuestion.mockResolvedValue({ data: {} })
})

describe('Poll builder image uploads', () => {
  it('saves the uploaded option and question images with their asset ids', async () => {
    pollingService.uploadGenericImage
      .mockResolvedValueOnce({ data: { url: 'https://cdn/q.png', image_asset_id: 'asset-q' } })
      .mockResolvedValueOnce({ data: { url: 'https://cdn/red.png', image_asset_id: 'asset-red' } })
    renderPage()
    await fillQuestion()
    fireEvent.change(screen.getByLabelText('Question image (optional)'), { target: { files: [file()] } })
    await waitFor(() => expect(screen.getAllByAltText('saved')).toHaveLength(1))
    fireEvent.change(optionImageInputs()[0], { target: { files: [file()] } })
    await waitFor(() => expect(screen.getAllByAltText('saved')).toHaveLength(2))

    fireEvent.click(screen.getByRole('button', { name: 'Add question' }))
    await waitFor(() => expect(pollingService.createQuestion).toHaveBeenCalledTimes(1))
    const payload = pollingService.createQuestion.mock.calls[0][1]
    expect(payload).toMatchObject({ imageUrl: 'https://cdn/q.png', imageAssetId: 'asset-q' })
    expect(payload.options[0]).toEqual({ label: 'Red', imageUrl: 'https://cdn/red.png', imageAssetId: 'asset-red' })
    expect(payload.options[1]).toEqual({ label: 'Blue', imageUrl: null, imageAssetId: null })
  })

  it('cannot be saved while an upload is still running, so the image is not lost', async () => {
    let finish
    pollingService.uploadGenericImage.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    renderPage()
    await fillQuestion()
    fireEvent.change(optionImageInputs()[0], { target: { files: [file()] } })
    expect(await screen.findByText(/Uploading image/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add question' })).toBeDisabled()

    finish({ data: { url: 'https://cdn/red.png', image_asset_id: 'asset-red' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add question' })).toBeEnabled())
  })

  it('says so when an upload fails instead of leaving a preview that looks saved', async () => {
    pollingService.uploadGenericImage.mockRejectedValue({ response: { data: { message: 'Image service unavailable' } } })
    renderPage()
    await fillQuestion()
    fireEvent.change(optionImageInputs()[0], { target: { files: [file()] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Image service unavailable')
    expect(screen.queryByAltText('saved')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add question' }))
    await waitFor(() => expect(pollingService.createQuestion).toHaveBeenCalled())
    expect(pollingService.createQuestion.mock.calls[0][1].options[0].imageUrl).toBeNull()
  })

  it('keeps text typed while the image uploads', async () => {
    let finish
    pollingService.uploadGenericImage.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    renderPage()
    await fillQuestion()
    fireEvent.change(optionImageInputs()[0], { target: { files: [file()] } })
    fireEvent.change(screen.getByPlaceholderText('Option 2'), { target: { value: 'Navy' } })
    finish({ data: { url: 'https://cdn/red.png', image_asset_id: 'asset-red' } })
    await waitFor(() => expect(screen.getAllByAltText('saved')).toHaveLength(1))
    expect(screen.getByPlaceholderText('Option 2')).toHaveValue('Navy')
  })
})
