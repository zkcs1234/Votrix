import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VotrixLogo from './VotrixLogo'
import { DEFAULT_PLATFORM_NAME, usePlatformStore } from '@/store/platform.store'

const renderLogo = (props) => render(<MemoryRouter><VotrixLogo {...props} /></MemoryRouter>)

beforeEach(() => {
  usePlatformStore.setState({ platformName: DEFAULT_PLATFORM_NAME, maintenanceMode: false, loaded: false })
})

describe('VotrixLogo follows the platform name', () => {
  it('keeps the original styled VOTRIX wordmark for the default name', () => {
    renderLogo()
    expect(screen.getByRole('link', { name: 'Votrix home' })).toHaveTextContent('VOTRIX')
  })

  it('treats any casing of the default name as the default brand', () => {
    usePlatformStore.getState().apply({ platformName: 'VOTRIX' })
    renderLogo()
    expect(screen.getByText('I', { selector: 'span' })).toBeInTheDocument() // the accented letter of the styled wordmark
  })

  it('shows a custom platform name exactly as typed, in place of VOTRIX', () => {
    usePlatformStore.getState().apply({ platformName: 'BISU Votes' })
    renderLogo()
    expect(screen.getByText('BISU Votes')).toBeInTheDocument()
    expect(screen.queryByText(/VOTR/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'BISU Votes home' })).toBeInTheDocument()
  })

  it('updates live when the name changes', () => {
    renderLogo()
    expect(screen.getByRole('link', { name: 'Votrix home' })).toBeInTheDocument()
    act(() => usePlatformStore.getState().apply({ platformName: 'Campus Polls' }))
    expect(screen.getByText('Campus Polls')).toBeInTheDocument()
  })

  it('truncates a very long name instead of breaking the sidebar, and keeps the full name as a tooltip', () => {
    const long = 'A Very Long Platform Name For The University Student Council'
    usePlatformStore.getState().apply({ platformName: long })
    renderLogo()
    const label = screen.getByText(long)
    expect(label).toHaveClass('truncate')
    expect(label).toHaveAttribute('title', long)
  })

  it('the mark-only variant shows no name at all', () => {
    usePlatformStore.getState().apply({ platformName: 'BISU Votes' })
    renderLogo({ variant: 'mark' })
    expect(screen.queryByText('BISU Votes')).not.toBeInTheDocument()
  })
})
