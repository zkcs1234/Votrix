import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import EventDetailsFields from './EventDetailsFields'
import { LIVE_FORM_MODE } from '@/hooks/useLiveForm'
import { electionEventSchemaStep1, pollingEventSchemaStep1 } from '@/schemas/event.schemas'

function Harness({ schema = electionEventSchemaStep1, defaults = {} }) {
  const { register, control, getValues, trigger, watch, formState: { errors } } = useForm({
    ...LIVE_FORM_MODE,
    resolver: zodResolver(schema),
    defaultValues: {
      title: '', description: '', startDate: '', endDate: '', resultsVisibility: 'public', ...defaults,
    },
  })
  return (
    <form noValidate>
      <EventDetailsFields
        register={register}
        control={control}
        errors={errors}
        trigger={trigger}
        getValues={getValues}
        values={watch()}
      />
    </form>
  )
}

describe('EventDetailsFields live validation', () => {
  it('flags a blank title after leaving the field and clears it once filled', async () => {
    render(<Harness />)
    const title = screen.getByLabelText(/^Title/)

    fireEvent.change(title, { target: { value: '   ' } })
    expect(screen.queryByText('Title is required')).not.toBeInTheDocument() // not before leaving the field
    fireEvent.blur(title)
    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(title).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(title, { target: { value: 'Student council election' } })
    await waitFor(() => expect(screen.queryByText('Title is required')).not.toBeInTheDocument())
  })

  it('treats a whitespace-only polling title as empty too', async () => {
    render(<Harness schema={pollingEventSchemaStep1} />)
    const title = screen.getByLabelText(/^Title/)
    fireEvent.change(title, { target: { value: '    ' } })
    fireEvent.blur(title)
    expect(await screen.findByText('Title is required')).toBeInTheDocument()
  })

  it('shows a character counter near the 200-character title limit and flags going over', async () => {
    render(<Harness />)
    const title = screen.getByLabelText(/^Title/)
    fireEvent.change(title, { target: { value: 'a'.repeat(150) } })
    expect(screen.queryByText('150/200')).not.toBeInTheDocument()
    fireEvent.change(title, { target: { value: 'a'.repeat(170) } })
    expect(screen.getByText('170/200')).toBeInTheDocument()

    fireEvent.change(title, { target: { value: 'a'.repeat(201) } })
    fireEvent.blur(title)
    expect(await screen.findByText('Title must be 200 characters or less')).toBeInTheDocument()
  })

  it('flags a cleared end date immediately, without waiting for blur or submit', async () => {
    render(<Harness defaults={{ title: 'T', startDate: '2030-05-01T09:00', endDate: '2030-05-02T09:00' }} />)
    const end = screen.getByLabelText(/^End Date/)
    expect(screen.queryByText('End date is required')).not.toBeInTheDocument()

    fireEvent.change(end, { target: { value: '' } })
    expect(await screen.findByText('End date is required')).toBeInTheDocument()
    expect(end).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows the required asterisks on title and both dates', () => {
    render(<Harness />)
    for (const name of [/^Title/, /^Start Date/, /^End Date/]) {
      expect(screen.getByLabelText(name)).toBeRequired()
    }
  })
})
