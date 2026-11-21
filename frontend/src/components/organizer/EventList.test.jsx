import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import EventListCard from './EventList'

function renderCard(status) {
  render(
    <MemoryRouter>
      <EventListCard
        module="election"
        event={{ id: 'e1', title: 'Event one', status }}
        titleHref="/title"
        editHref="/edit"
        continueSetupHref="/setup"
      />
    </MemoryRouter>,
  )
  return screen.getByRole('article')
}

describe('event list card', () => {
  it('offers Edit while the event is a draft, plus Continue setup', () => {
    const card = renderCard('draft')
    expect(within(card).getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/edit')
    expect(within(card).getByRole('link', { name: 'Continue setup' })).toHaveAttribute('href', '/setup')
  })

  it.each(['scheduled', 'active', 'completed', 'cancelled', 'archived'])(
    'offers a read-only View once the event is %s, never Manage',
    (status) => {
      const card = renderCard(status)
      expect(within(card).getByRole('link', { name: 'View' })).toHaveAttribute('href', '/edit')
      expect(within(card).queryByRole('link', { name: /Manage|Edit|Continue setup/ })).not.toBeInTheDocument()
    },
  )
})
