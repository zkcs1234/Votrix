import { Suspense } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { routeConfig } from './index'
import { organizerApplyService } from '@/services/organizer-apply.service'

vi.mock('@/services/organizer-apply.service', () => ({
  organizerApplyService: { getForm: vi.fn(), submit: vi.fn() },
}))

const TOKEN = 'b'.repeat(64)

beforeEach(() => {
  vi.resetAllMocks()
  organizerApplyService.getForm.mockResolvedValue({
    data: { email: 'ada@example.com', note: null, organizationTypes: ['Co-curricular'], programs: [] },
  })
})

describe('public organizer application route', () => {
  it('is reachable by a signed-out visitor and is not captured by the protected /organizer route', async () => {
    const router = createMemoryRouter(routeConfig, { initialEntries: [`/organizer/apply/${TOKEN}`] })
    render(
      <Suspense fallback={<p>loading</p>}>
        <RouterProvider router={router} />
      </Suspense>,
    )

    // The first dynamic import of the lazy page graph can exceed the 1s default.
    expect(await screen.findByRole('heading', { name: 'Organizer application' }, { timeout: 8000 })).toBeInTheDocument()
    expect(organizerApplyService.getForm).toHaveBeenCalledWith(TOKEN)
    // No redirect to /login or to a role dashboard.
    expect(router.state.location.pathname).toBe(`/organizer/apply/${TOKEN}`)
  })
})
