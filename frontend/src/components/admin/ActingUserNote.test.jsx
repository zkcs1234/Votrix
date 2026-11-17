import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ActingUserNote from './ActingUserNote'

describe('ActingUserNote', () => {
  it('names the student officer behind an owner-attributed action', () => {
    render(<ActingUserNote log={{ details: { actingUserId: 's1', actingUserEmail: 'student@example.com', title: 'x' } }} />)
    expect(screen.getByText('student@example.com')).toBeInTheDocument()
    expect(screen.getByText(/\(officer\)/)).toBeInTheDocument()
  })

  it('falls back to the id when the email was not recorded', () => {
    render(<ActingUserNote log={{ details: { actingUserId: 's1', actingUserEmail: null } }} />)
    expect(screen.getByText('s1')).toBeInTheDocument()
  })

  it.each([
    ['an ordinary row', { details: { title: 'x' } }],
    ['no details', { details: null }],
    ['no log', undefined],
  ])('renders nothing for %s', (_label, log) => {
    const { container } = render(<ActingUserNote log={log} />)
    expect(container).toBeEmptyDOMElement()
  })
})
