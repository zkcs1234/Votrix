import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import DateTimeInput from './DateTimeInput'

function ControlledDateTimeInput() {
  const [value, setValue] = useState('2026-10-12T09:17')
  return (
    <>
      <label htmlFor="event-start">Start date and time</label>
      <DateTimeInput
        id="event-start"
        name="startDate"
        value={value}
        onChange={setValue}
        min="2026-10-12T00:00"
        max="2026-10-14T23:59"
      />
    </>
  )
}

const dateLabel = day => new Date(2026, 9, day).toDateString()

afterEach(() => {
  vi.useRealTimers()
})

it('selects, edits, confirms, cancels, and reopens the shared two-step date/time picker', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 10, 8, 37))
  render(<ControlledDateTimeInput />)
  const input = screen.getByRole('textbox', { name: 'Start date and time' })

  fireEvent.click(input)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: dateLabel(11) })).toBeDisabled()
  expect(screen.getByRole('button', { name: dateLabel(15) })).toBeDisabled()
  expect(screen.queryByRole('group', { name: 'Hour clock' })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: dateLabel(13) }))
  fireEvent.click(screen.getByRole('button', { name: 'Time' }))
  fireEvent.click(screen.getByRole('button', { name: 'Hour 2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Minute 40' }))
  fireEvent.click(screen.getByRole('button', { name: 'PM' }))
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByRole('button', { name: dateLabel(13) })).toHaveAttribute('aria-pressed', 'true')

  fireEvent.click(screen.getByRole('button', { name: 'Time' }))
  expect(screen.getByRole('button', { name: 'Select minute' })).toHaveTextContent('40')
  expect(screen.getByRole('button', { name: 'PM' })).toHaveAttribute('aria-pressed', 'true')

  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(input.value).toMatch(/Oct 12, 2026/)

  fireEvent.click(input)
  expect(screen.getByRole('button', { name: dateLabel(12) })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: dateLabel(13) }))
  fireEvent.click(screen.getByRole('button', { name: 'Time' }))
  fireEvent.click(screen.getByRole('button', { name: 'Hour 2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Minute 40' }))
  fireEvent.click(screen.getByRole('button', { name: 'PM' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(input.value).toMatch(/Oct 13, 2026.*2:40 PM/)
})

it('prevents selecting a past day or a time earlier than now in the shared input', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 20, 8, 37))
  render(<DateTimeInput value="" onChange={() => {}} />)
  fireEvent.click(screen.getByRole('textbox'))
  expect(screen.getByRole('button', { name: dateLabel(19) })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: dateLabel(20) }))
  fireEvent.click(screen.getByRole('button', { name: 'Time' }))
  expect(screen.getByRole('button', { name: 'Hour 7' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Hour 8' }))
  expect(screen.getByRole('button', { name: 'Minute 35' })).toBeDisabled()
})
