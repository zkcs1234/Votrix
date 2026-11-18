import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotificationsModal from './NotificationsModal'

const mocks = vi.hoisted(() => ({ getNotifications: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() }))
vi.mock('@/services/notifications.service', () => ({ notificationsService: mocks }))
vi.mock('@/hooks/useDelayedLoading', () => ({ useDelayedLoading: () => false }))

const notification = {
  id: 'n1', title: "You're invited to Campus poll", message: 'You have been added.',
  type: 'voter.invitation.registered', is_read: false, created_at: new Date().toISOString(), action_url: '/participant/polling/events/p1',
}

function renderModal(onClose = vi.fn()) {
  mocks.getNotifications.mockResolvedValue({ data: { notifications: [notification] } })
  render(<MemoryRouter><div id="header"><NotificationsModal onClose={onClose} /></div></MemoryRouter>)
  return onClose
}

beforeEach(() => vi.clearAllMocks())

describe('NotificationsModal', () => {
  it('is one centered dialog at every screen size, rendered outside the header', async () => {
    renderModal()
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // Rendered in <body>, not inside the (stacking-context) header that opened it.
    expect(document.getElementById('header')).not.toContainElement(dialog)
    // The phone layout at every size: no desktop-only dropdown positioning.
    expect(dialog.parentElement.className).toMatch(/fixed inset-0.*items-center justify-center/)
    expect(dialog.className).not.toMatch(/\bsm:/)
    expect(dialog.parentElement.className).not.toMatch(/\bsm:/)
  })

  it('stacks each notification with its actions underneath, like the phone layout', async () => {
    renderModal()
    const open = await screen.findByRole('link', { name: 'Open' })
    const actions = open.parentElement
    expect(actions.className).not.toMatch(/\bsm:/)
    expect(actions.parentElement.className).toMatch(/flex-col/)
    expect(actions.parentElement.className).not.toMatch(/sm:flex-row/)
  })

  it('closes on Escape and on the backdrop, but not when clicking inside', async () => {
    const onClose = renderModal()
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' })
    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(dialog.parentElement)
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
