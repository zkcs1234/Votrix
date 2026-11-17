import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useParticipantSync, resetParticipantSyncThrottle } from './useParticipantSync'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import { authService } from '@/services/auth.service'

vi.mock('@/services/auth.service', () => ({ authService: { getMe: vi.fn() } }))

const officership = { organizerId: 'o1', organizationName: 'Computing Society', position: 'President' }
const student = { id: 's1', role: 'participant', participantTypes: ['STUDENT'], officership: null }

beforeEach(() => {
  vi.clearAllMocks()
  resetParticipantSyncThrottle()
  useAuthStore.setState({ user: student, isAuthenticated: true, isBootstrapping: false })
  vi.spyOn(useToastStore.getState(), 'info').mockImplementation(() => {})
})

describe('useParticipantSync', () => {
  it('does nothing when disabled', () => {
    renderHook(() => useParticipantSync(false))
    expect(authService.getMe).not.toHaveBeenCalled()
  })

  it('a student who was just made an officer sees it without signing in again', async () => {
    authService.getMe.mockResolvedValue({ data: { user: { ...student, officership } } })
    renderHook(() => useParticipantSync(true))
    await waitFor(() => expect(useAuthStore.getState().user.officership).toEqual(officership))
  })

  it('picks up a changed account type', async () => {
    authService.getMe.mockResolvedValue({ data: { user: { ...student, participantTypes: ['JUDGE'] } } })
    renderHook(() => useParticipantSync(true))
    await waitFor(() => expect(useAuthStore.getState().user.participantTypes).toEqual(['JUDGE']))
  })

  it('tells an officer when their officer access has ended', async () => {
    useAuthStore.setState({ user: { ...student, officership } })
    authService.getMe.mockResolvedValue({ data: { user: student } })
    renderHook(() => useParticipantSync(true))
    await waitFor(() => expect(useAuthStore.getState().user.officership).toBeNull())
    expect(useToastStore.getState().info).toHaveBeenCalledWith('Your officer access has ended.')
  })

  it('does not touch the store when nothing changed', async () => {
    const before = useAuthStore.getState().user
    authService.getMe.mockResolvedValue({ data: { user: { ...student } } })
    renderHook(() => useParticipantSync(true))
    await waitFor(() => expect(authService.getMe).toHaveBeenCalled())
    expect(useAuthStore.getState().user).toBe(before)
  })

  it('ignores a response for a different account', async () => {
    authService.getMe.mockResolvedValue({ data: { user: { ...student, id: 'someone-else', participantTypes: ['JUDGE'] } } })
    renderHook(() => useParticipantSync(true))
    await waitFor(() => expect(authService.getMe).toHaveBeenCalled())
    expect(useAuthStore.getState().user.participantTypes).toEqual(['STUDENT'])
  })

  it('survives a failed request', async () => {
    authService.getMe.mockRejectedValue(new Error('offline'))
    renderHook(() => useParticipantSync(true))
    await waitFor(() => expect(authService.getMe).toHaveBeenCalled())
    expect(useAuthStore.getState().user).toEqual(student)
  })

  it('is throttled so moving between pages does not re-fetch each time', async () => {
    authService.getMe.mockResolvedValue({ data: { user: student } })
    const first = renderHook(() => useParticipantSync(true))
    await waitFor(() => expect(authService.getMe).toHaveBeenCalledTimes(1))
    first.unmount()
    renderHook(() => useParticipantSync(true))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(authService.getMe).toHaveBeenCalledTimes(1)
  })
})
