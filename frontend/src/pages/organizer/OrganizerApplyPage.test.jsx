import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OrganizerApplyPage from './OrganizerApplyPage'
import { organizerApplyService } from '@/services/organizer-apply.service'

vi.mock('@/services/organizer-apply.service', () => ({
  organizerApplyService: { getForm: vi.fn(), submit: vi.fn() },
}))

const TOKEN = 'a'.repeat(64)
const context = {
  email: 'ada@example.com',
  note: 'Welcome aboard',
  organizationTypes: ['Co-curricular', 'Extra-curricular'],
  programs: ['BSCS', 'BSIT'],
}
const gone = (message = 'This invitation link is invalid or is no longer available.') =>
  Object.assign(new Error('gone'), { response: { status: 410, data: { message } } })
const invalid = (errors) =>
  Object.assign(new Error('bad'), { response: { status: 400, data: { message: 'Validation failed', details: { errors } } } })

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/organizer/apply/${TOKEN}`]}>
      <Routes>
        <Route path="/organizer/apply/:token" element={<OrganizerApplyPage />} />
      </Routes>
    </MemoryRouter>,
  )

const pdf = (name = 'cert.pdf') => new File(['%PDF-1.7 content'], name, { type: 'application/pdf' })

async function fillValidForm({ withFile = true } = {}) {
  await screen.findByRole('heading', { name: 'Organizer application' })
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada Lovelace' } })
  fireEvent.change(screen.getByLabelText('Position'), { target: { value: 'President' } })
  fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: 'Computing Society' } })
  fireEvent.change(screen.getByLabelText('Organization type'), { target: { value: 'Co-curricular' } })
  fireEvent.click(screen.getByLabelText(/All programs/))
  if (withFile) fireEvent.change(screen.getByLabelText('Certificate files'), { target: { files: [pdf()] } })
}

beforeEach(() => {
  vi.resetAllMocks()
  organizerApplyService.getForm.mockResolvedValue({ data: context })
  organizerApplyService.submit.mockResolvedValue({ data: { success: true } })
})

describe('OrganizerApplyPage', () => {
  it('loads the form with the bound email read-only and the invitation note', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Organizer application' })).toBeInTheDocument()
    expect(organizerApplyService.getForm).toHaveBeenCalledWith(TOKEN)
    const email = screen.getByLabelText('Email')
    expect(email).toHaveValue('ada@example.com')
    expect(email).toHaveAttribute('readonly')
    expect(screen.getByText('Welcome aboard')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Extra-curricular' })).toBeInTheDocument()
  })

  it('shows the generic message for an unusable link and no form', async () => {
    organizerApplyService.getForm.mockRejectedValue(gone())
    renderPage()
    expect(await screen.findByText(/can.t be used/)).toBeInTheDocument()
    expect(screen.getByText('This invitation link is invalid or is no longer available.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument()
  })

  it('shows a retryable error (not the invalid-link screen) for other failures', async () => {
    organizerApplyService.getForm.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 500, data: { message: 'Server error' } } }))
    renderPage()
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument()
    expect(screen.queryByText(/Ask the administrator/)).not.toBeInTheDocument()
  })

  it('blocks submission and lists every missing item', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Organizer application' })
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    expect(await screen.findByText('Please fix the following')).toBeInTheDocument()
    for (const text of [
      'Enter your name.',
      'Enter your position.',
      'Enter the organization name.',
      'Choose the organization type.',
      'Choose the student access you need.',
      'Attach at least one certificate.',
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
    expect(organizerApplyService.submit).not.toHaveBeenCalled()
  })

  it('requires a program when "Selected programs" is chosen', async () => {
    renderPage()
    await fillValidForm()
    fireEvent.click(screen.getByLabelText(/Selected programs/))
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    expect(await screen.findByText('Select at least one program.')).toBeInTheDocument()
    expect(organizerApplyService.submit).not.toHaveBeenCalled()
  })

  it('submits multipart data with the files and shows the confirmation', async () => {
    renderPage()
    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    expect(await screen.findByRole('heading', { name: 'Application submitted' })).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()

    const [token, body] = organizerApplyService.submit.mock.calls[0]
    expect(token).toBe(TOKEN)
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('organizerName')).toBe('Ada Lovelace')
    expect(body.get('organizationType')).toBe('Co-curricular')
    expect(body.get('scopeType')).toBe('all')
    expect(JSON.parse(body.get('programs'))).toEqual([])
    expect(body.getAll('certificates')).toHaveLength(1)
    expect(body.get('email')).toBeNull() // the email is bound server-side, never sent
  })

  it('sends the chosen programs for a scoped request', async () => {
    renderPage()
    await fillValidForm()
    fireEvent.click(screen.getByLabelText(/Selected programs/))
    fireEvent.click(screen.getByRole('button', { name: 'BSIT' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    await screen.findByRole('heading', { name: 'Application submitted' })
    const body = organizerApplyService.submit.mock.calls[0][1]
    expect(body.get('scopeType')).toBe('scoped')
    expect(JSON.parse(body.get('programs'))).toEqual(['BSIT'])
  })

  it('refuses a disallowed file client-side and lets the user remove a chosen one', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Organizer application' })
    const input = screen.getByLabelText('Certificate files')

    fireEvent.change(input, { target: { files: [new File(['MZ'], 'run.exe', { type: 'application/x-msdownload' })] } })
    expect(await screen.findByText(/run\.exe" is not a PDF, JPEG or PNG/)).toBeInTheDocument()

    fireEvent.change(input, { target: { files: [pdf('keep.pdf')] } })
    expect(screen.getByText('keep.pdf')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove keep.pdf' }))
    expect(screen.queryByText('keep.pdf')).not.toBeInTheDocument()
  })

  it('shows server validation errors and keeps the form so the applicant can retry', async () => {
    organizerApplyService.submit.mockRejectedValue(invalid(['program "NOPE" is not in the managed list']))
    renderPage()
    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    expect(await screen.findByText('program "NOPE" is not in the managed list')).toBeInTheDocument()
    expect(screen.getByLabelText('Your name')).toHaveValue('Ada Lovelace')
  })

  it('switches to the invalid-link screen if the link was used while the form was open', async () => {
    organizerApplyService.submit.mockRejectedValue(gone())
    renderPage()
    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    await waitFor(() => expect(screen.getByText(/can.t be used/)).toBeInTheDocument())
  })
})

describe('OrganizerApplyPage live validation', () => {
  it('flags a blank field after it is left, before any submit, and clears it once filled', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Organizer application' })
    const name = screen.getByLabelText('Your name')
    expect(screen.queryByText('Your name is required')).not.toBeInTheDocument() // nothing nags on first load

    fireEvent.change(name, { target: { value: '   ' } })
    fireEvent.blur(name)
    expect(await screen.findByText('Your name is required')).toBeInTheDocument()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(organizerApplyService.submit).not.toHaveBeenCalled()

    fireEvent.change(name, { target: { value: 'Ada' } })
    await waitFor(() => expect(screen.queryByText('Your name is required')).not.toBeInTheDocument())
  })

  it('flags a value over the server limit, and keeps the summary current once Submit was pressed', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Organizer application' })
    const position = screen.getByLabelText('Position')
    fireEvent.change(position, { target: { value: 'p'.repeat(256) } })
    fireEvent.blur(position)
    expect(await screen.findByText('Position must be 255 characters or fewer')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))
    expect(await screen.findByText('Attach at least one certificate.')).toBeInTheDocument()

    // The summary now follows the form: attaching a file removes its line.
    fireEvent.change(screen.getByLabelText('Certificate files'), { target: { files: [pdf()] } })
    await waitFor(() => expect(screen.queryByText('Attach at least one certificate.')).not.toBeInTheDocument())
  })
})
