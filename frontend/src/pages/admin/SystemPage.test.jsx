import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SystemPage from './SystemPage'

// Each tab has its own tests; here only the tab wiring matters.
vi.mock('./SystemSettingsPage', () => ({ default: () => <p>Settings content</p> }))
vi.mock('./AlertConfigPage', () => ({ default: () => <p>Alerts content</p> }))
vi.mock('./ArchivalPolicyPage', () => ({ default: () => <p>Archival content</p> }))
vi.mock('./HealthDashboardPage', () => ({ default: () => <p>Health content</p> }))

const renderAt = (url) => render(<MemoryRouter initialEntries={[url]}><SystemPage /></MemoryRouter>)

describe('System settings tabs', () => {
  it('opens on Settings and offers the four tabs', () => {
    renderAt('/admin/settings')
    expect(screen.getByText('Settings content')).toBeInTheDocument()
    for (const name of ['Settings', 'Alerts', 'Archival policy', 'System health']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    }
  })

  it('switches tabs and shows only the chosen one', () => {
    renderAt('/admin/settings')
    fireEvent.click(screen.getByRole('tab', { name: 'Alerts' }))
    expect(screen.getByText('Alerts content')).toBeInTheDocument()
    expect(screen.queryByText('Settings content')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Archival policy' }))
    expect(screen.getByText('Archival content')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'System health' }))
    expect(screen.getByText('Health content')).toBeInTheDocument()
  })

  it.each([
    ['health', 'Health content'],
    ['alerts', 'Alerts content'],
    ['archival', 'Archival content'],
  ])('deep link ?section=%s opens that tab', (section, text) => {
    renderAt(`/admin/settings?section=${section}`)
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('falls back to Settings for an unknown section', () => {
    renderAt('/admin/settings?section=nope')
    expect(screen.getByText('Settings content')).toBeInTheDocument()
  })
})
