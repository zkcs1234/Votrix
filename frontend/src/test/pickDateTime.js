import { fireEvent, screen } from '@testing-library/react'

/**
 * Drives the shared two-step CalendarCard picker the way a person does:
 * open it, move to the right month, pick the day, go to Time, choose AM/PM
 * first (the hour button's 24-hour value depends on it), then the hour and
 * minute, and confirm.
 *
 * `hour` is the 12-hour clock value (1-12) and `period` is 'AM' or 'PM'.
 * Pick the AM/PM before the hour: choosing "5" while the picker is still on AM
 * means 05:00, which the picker refuses when the minimum is later that day.
 */
export function chooseDateTime(label, date, hour, minute, period) {
  fireEvent.click(screen.getByLabelText(new RegExp(`^${label}`)))
  const now = new Date()
  const monthOffset = (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth()
  for (let i = 0; i < Math.abs(monthOffset); i += 1) {
    fireEvent.click(screen.getByRole('button', { name: monthOffset < 0 ? 'Previous month' : 'Next month' }))
  }
  fireEvent.click(screen.getByRole('button', { name: date.toDateString() }))
  fireEvent.click(screen.getByRole('button', { name: 'Time' }))
  fireEvent.click(screen.getByRole('button', { name: period }))
  fireEvent.click(screen.getByRole('button', { name: `Hour ${hour}` }))
  fireEvent.click(screen.getByRole('button', { name: `Minute ${minute}` }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
}

/** A local date `days` from today at midnight. */
export function daysFromToday(days) {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
}
