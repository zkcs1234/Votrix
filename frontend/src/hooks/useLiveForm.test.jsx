import { useEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useLiveForm } from './useLiveForm'
import FormField from '@/components/ui/FormField'
import { buildStudentSchema, STUDENT_SERVER_FIELDS } from '@/schemas/people.schemas'
import { mapServerErrors } from '@/utils/serverFormErrors'

const handle = { current: null }
function Harness({ onSubmit = () => {} }) {
  const form = useLiveForm({
    schema: buildStudentSchema(['BSIT']),
    defaultValues: { email: '', firstName: '', lastName: '', schoolId: '', program: '' },
    serverFieldMap: STUDENT_SERVER_FIELDS,
  })
  useEffect(() => { handle.current = form })
  const { register, handleSubmit, formState: { errors } } = form
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormField label="Email" required error={errors.email?.message}>
        {(p) => <input type="email" {...p} {...register('email')} />}
      </FormField>
      <FormField label="School ID" required error={errors.schoolId?.message} counter={{ value: form.watch('schoolId'), max: 10 }}>
        {(p) => <input {...p} {...register('schoolId')} />}
      </FormField>
      <button type="submit" disabled={!form.canSubmit}>Add</button>
      <p data-testid="reason">{form.blockedReason}</p>
      <p data-testid="form-error">{form.formError}</p>
    </form>
  )
}

describe('useLiveForm + FormField', () => {
  it('shows an error after leaving a bad field, without any submit', async () => {
    render(<Harness />)
    const email = screen.getByLabelText(/email/i)

    // Typing alone does not nag before the field has been left.
    fireEvent.change(email, { target: { value: 'not-an-email' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.blur(email)
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address')
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAttribute('aria-describedby', expect.stringContaining('message'))
  })

  it('clears the error as soon as the value becomes valid', async () => {
    render(<Harness />)
    const email = screen.getByLabelText(/email/i)
    fireEvent.change(email, { target: { value: 'bad' } })
    fireEvent.blur(email)
    await screen.findByRole('alert')

    fireEvent.change(email, { target: { value: 'ana@example.com' } })
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(email).not.toHaveAttribute('aria-invalid')
  })

  it('explains why the submit button is disabled', async () => {
    render(<Harness />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled())
    expect(screen.getByTestId('reason')).toHaveTextContent('Fill in the required fields')

    const email = screen.getByLabelText(/email/i)
    fireEvent.change(email, { target: { value: 'bad' } })
    fireEvent.blur(email)
    await waitFor(() => expect(screen.getByTestId('reason')).toHaveTextContent('Fix the highlighted fields'))
  })

  it('shows a character counter only when near the limit', () => {
    render(<Harness />)
    const id = screen.getByLabelText(/school id/i)
    fireEvent.change(id, { target: { value: 'abc' } })
    expect(screen.queryByText('3/10')).not.toBeInTheDocument()
    fireEvent.change(id, { target: { value: 'abcdefgh' } })
    expect(screen.getByText('8/10')).toBeInTheDocument()
  })

  it('attaches a server rejection to the matching field and keeps the rest for the form alert', async () => {
    render(<Harness />)
    const err = {
      response: {
        data: {
          message: 'Validation failed',
          details: { errors: ['Another participant already uses this school ID', 'something unexpected'] },
        },
      },
    }
    let message
    act(() => { message = handle.current.handleServerError(err) })

    expect(message).toBe('Something unexpected')
    expect(await screen.findByText('Another participant already uses this school ID')).toBeInTheDocument()
    expect(screen.getByTestId('form-error')).toHaveTextContent('Something unexpected')
  })
})

describe('mapServerErrors', () => {
  it('routes messages by keyword and reports the unmatched', () => {
    const { fieldErrors, unmatched } = mapServerErrors(
      ['invalid email', 'program "X" is not in the program list', 'database offline'],
      STUDENT_SERVER_FIELDS,
    )
    expect(fieldErrors).toEqual({
      email: 'Invalid email',
      program: 'Program "X" is not in the program list',
    })
    expect(unmatched).toEqual(['Database offline'])
  })
})
