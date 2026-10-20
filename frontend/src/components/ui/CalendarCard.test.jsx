import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CalendarCard from './CalendarCard'
import { electionEventSchemaStep1, isoToLocalInput, localInputToIso } from '@/schemas/event.schemas'

const dayLabel = (day) => new Date(2026, 9, day).toDateString()

afterEach(() => {
  vi.useRealTimers()
})

function ControlledPicker({ initial = '2026-10-12T09:17', onChange = () => {}, ...props }) {
  const [value, setValue] = useState(initial)
  return <CalendarCard ariaLabel="Start Date and Time" value={value} twoStep
    onChange={(next) => { setValue(next); onChange(next) }} {...props} />
}

function openAndChooseDate(day = 12) {
  fireEvent.click(screen.getByRole('textbox', { name: 'Start Date and Time' }))
  fireEvent.click(screen.getByRole('button', { name: dayLabel(day) }))
}

describe('two-step CalendarCard', () => {
  it('confirms the selected date before entering Time and preserves selections on Back', () => {
    const onChange = vi.fn()
    render(<ControlledPicker confirmDate onChange={onChange} />)
    openAndChooseDate(13)
    const dateHeading = screen.getByText('Select date')
    const stepIndicator = screen.getByRole('list', { name: 'Date and time steps' })
    expect(dateHeading.parentElement).toBe(stepIndicator.parentElement)
    expect(screen.getByText('Selected date')).toBeInTheDocument()
    expect(screen.getByText(new Date(2026, 9, 13).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))).toBeInTheDocument()
    expect(screen.getByText('Date').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: dayLabel(13) })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('group', { name: 'Hour clock' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Time' }))
    expect(screen.getByText('Time').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByRole('button', { name: dayLabel(13) })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hour 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Minute 40' }))
    fireEvent.click(screen.getByRole('button', { name: 'PM' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('button', { name: dayLabel(13) })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Time' }))
    expect(screen.getByRole('button', { name: 'Select minute' })).toHaveTextContent('40')
    expect(screen.getByRole('button', { name: 'PM' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-13T14:40')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const input = screen.getByRole('textbox', { name: 'Start Date and Time' })
    expect(input.value).toMatch(/Oct 13, 2026.*2:40 PM/)
    fireEvent.click(input)
    expect(screen.getByRole('button', { name: dayLabel(13) })).toHaveAttribute('aria-pressed', 'true')
  })

  it('requires a date before Next and retains the existing min/max constraints', () => {
    render(<ControlledPicker initial="" confirmDate />)
    fireEvent.click(screen.getByRole('textbox'))
    expect(screen.getByRole('button', { name: 'Time' })).toBeDisabled()
    expect(screen.getByText('Choose a date')).toBeInTheDocument()
  })

  it('blocks dates and times before the current local minute', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 20, 8, 37))
    render(<ControlledPicker initial="" confirmDate preventPast />)
    fireEvent.click(screen.getByRole('textbox'))

    expect(screen.getByRole('button', { name: dayLabel(19) })).toBeDisabled()
    const today = screen.getByRole('button', { name: dayLabel(20) })
    fireEvent.click(today)
    expect(screen.getByRole('button', { name: 'Time' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Time' }))

    expect(screen.getByRole('button', { name: 'Hour 7' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Hour 8' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Hour 8' }))
    expect(screen.getByRole('button', { name: 'Minute 35' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Minute 40' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(screen.getByRole('textbox').value).toMatch(/Oct 20, 2026.*8:40 AM/)
  })

  it('uses the polished dial controls for exact minutes and keeps the form unsubmitted', () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn((event) => event.preventDefault())
    render(<form onSubmit={onSubmit}><ControlledPicker confirmDate onChange={onChange} /></form>)
    openAndChooseDate(13)
    fireEvent.click(screen.getByRole('button', { name: 'Time' }))
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select hour' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Hour 12' }))
    const minute = screen.getByRole('button', { name: 'Select minute' })
    expect(minute).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Minute 55' }))
    for (let index = 0; index < 4; index += 1) fireEvent.keyDown(minute, { key: 'ArrowUp' })
    expect(minute).toHaveTextContent('59')
    fireEvent.click(screen.getByRole('button', { name: 'PM' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('button', { name: dayLabel(13) })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Time' }))
    expect(screen.getByRole('button', { name: 'Select minute' })).toHaveTextContent('59')
    expect(screen.getByRole('button', { name: 'PM' })).toHaveAttribute('aria-pressed', 'true')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-13T12:59')
    expect(screen.getByRole('textbox')).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('displays midnight with AM while retaining the existing local date-time value', () => {
    const onChange = vi.fn()
    render(<ControlledPicker confirmDate initial="2026-10-12T00:00" onChange={onChange} />)
    expect(screen.getByRole('textbox').value).toMatch(/12:00\s*AM/)
    openAndChooseDate()
    fireEvent.click(screen.getByRole('button', { name: 'Time' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-12T00:00')
    expect(isoToLocalInput(localInputToIso(onChange.mock.calls[0][0]))).toBe('2026-10-12T00:00')
  })

  it('marks today separately from the selected date and restores focus on Escape', () => {
    const now = new Date()
    render(<ControlledPicker confirmDate initial="" />)
    fireEvent.click(screen.getByRole('textbox'))
    const today = screen.getByRole('button', { name: now.toDateString() })
    expect(today).toHaveAttribute('aria-current', 'date')
    expect(today).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(today)
    expect(today).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveFocus()
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('opens the selected month, navigates, and replaces the calendar with the hour clock', () => {
    render(<ControlledPicker />)
    fireEvent.click(screen.getByRole('textbox'))
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: dayLabel(12) })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getAllByRole('button', { name: 'Next month' })[0])
    expect(screen.getByText('November 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    fireEvent.click(screen.getByRole('button', { name: dayLabel(13) }))
    expect(screen.getByRole('group', { name: 'Hour clock' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next month' })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: 'Hour' })).not.toBeInTheDocument()
  })

  it('selects hour, minute, and PM and commits only on Done in the existing format', () => {
    const onChange = vi.fn()
    render(<ControlledPicker onChange={onChange} />)
    openAndChooseDate(13)
    fireEvent.click(screen.getByRole('button', { name: 'Hour 3' }))
    expect(screen.getByRole('group', { name: 'Minute clock' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Minute 25' }))
    expect(screen.getByRole('button', { name: 'Minute 25' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'PM' }))
    expect(screen.getByRole('button', { name: 'PM' })).toHaveAttribute('aria-pressed', 'true')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-13T15:25')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(isoToLocalInput(localInputToIso(onChange.mock.calls[0][0]))).toBe('2026-10-13T15:25')
    expect(electionEventSchemaStep1.safeParse({ title: 'Election', startDate: onChange.mock.calls[0][0],
      endDate: '2026-10-14T15:25', resultsVisibility: 'public',
    }).success).toBe(true)
    expect(electionEventSchemaStep1.safeParse({ title: 'Election', startDate: onChange.mock.calls[0][0],
      endDate: '2026-10-12T15:25', resultsVisibility: 'public',
    }).success).toBe(false)
  })

  it('preserves the date, exact minute, and period when returning to the calendar', () => {
    const onChange = vi.fn()
    render(<ControlledPicker onChange={onChange} />)
    openAndChooseDate(13)
    fireEvent.click(screen.getByRole('button', { name: 'Hour 11' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minute' }), { target: { value: '59' } })
    fireEvent.click(screen.getByRole('button', { name: 'PM' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('button', { name: dayLabel(13) })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('group', { name: 'Minute clock' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: dayLabel(13) }))
    expect(screen.getByRole('spinbutton', { name: 'Minute' })).toHaveValue(59)
    expect(screen.getByRole('button', { name: 'PM' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-13T23:59')
  })

  it('selects exact minutes by tapping the analog dial between the five-minute labels', () => {
    const onChange = vi.fn()
    render(<ControlledPicker onChange={onChange} />)
    openAndChooseDate()
    fireEvent.click(screen.getByRole('button', { name: 'Hour 4' }))
    const dial = screen.getByRole('group', { name: 'Minute clock' })
    vi.spyOn(dial, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 220, height: 220 })
    const angle = 17 * Math.PI / 30
    fireEvent(dial, new MouseEvent('pointerdown', { bubbles: true,
      clientX: 110 + Math.sin(angle) * 82, clientY: 110 - Math.cos(angle) * 82,
    }))
    expect(screen.getByRole('spinbutton', { name: 'Minute' })).toHaveValue(17)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-12T04:17')
  })

  it.each([['AM', '00'], ['PM', '12']])('converts 12 %s correctly', (period, expectedHour) => {
    const onChange = vi.fn()
    render(<ControlledPicker onChange={onChange} />)
    openAndChooseDate()
    fireEvent.click(screen.getByRole('button', { name: 'Hour 12' }))
    fireEvent.click(screen.getByRole('button', { name: 'Minute 0' }))
    fireEvent.click(screen.getByRole('button', { name: period }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onChange).toHaveBeenCalledWith(`2026-10-12T${expectedHour}:00`)
  })

  it('keeps disabled date constraints and discards unfinished edits on Escape', () => {
    const onChange = vi.fn()
    render(<ControlledPicker onChange={onChange} min="2026-10-12T00:00" max="2026-10-14T23:59" />)
    fireEvent.click(screen.getByRole('textbox'))
    expect(screen.getByRole('button', { name: dayLabel(11) })).toBeDisabled()
    expect(screen.getByRole('button', { name: dayLabel(15) })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: dayLabel(13) }))
    fireEvent.click(screen.getByRole('button', { name: 'Hour 5' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('textbox'))
    expect(screen.getByRole('button', { name: dayLabel(12) })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: dayLabel(12) }))
    expect(screen.getByRole('button', { name: 'Select hour' })).toHaveTextContent('09')
  })

  it('supports an empty required field, keyboard opening, and clearing the saved value', () => {
    const onChange = vi.fn()
    render(<ControlledPicker initial="" required defaultHour={0} defaultMinute={0} onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button').find((button) => button.classList.contains('v-cal-cell') && !button.disabled))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onChange.mock.calls[0][0]).toMatch(/T00:00$/)
    fireEvent.click(screen.getByRole('button', { name: 'Clear date' }))
    expect(onChange).toHaveBeenLastCalledWith('')
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('leaves the existing picker flow unchanged when twoStep is omitted', () => {
    const onChange = vi.fn()
    render(<CalendarCard value="2026-10-12T09:17" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    expect(screen.getByRole('spinbutton', { name: 'Hour' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Min' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Hour clock' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: dayLabel(13) }))
    expect(onChange).toHaveBeenCalledWith('2026-10-13T09:17')
  })
})
