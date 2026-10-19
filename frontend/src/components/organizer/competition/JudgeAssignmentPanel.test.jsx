import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import JudgeAssignmentPanel from './JudgeAssignmentPanel'
import { pageantService } from '@/services/pageant.service'
vi.mock('@/services/pageant.service', () => ({ pageantService: { createJudgeAssignment: vi.fn(), deleteJudgeAssignment: vi.fn() } }))
const judges = [{ id: 'j1', displayName: 'Judge One' }, { id: 'j2', displayName: 'Judge Two' }]
function open({ readOnly = false, assignments = [], reload = vi.fn().mockResolvedValue(), official = false } = {}) {
  render(<MemoryRouter initialEntries={['/events/e/judges']}><Routes><Route path="/events/:eventId/judges" element={<JudgeAssignmentPanel readOnly={readOnly} reload={reload} foundation={{ event: { official_rules_id: official ? 'rules' : null }, judges, assignments }} />} /></Routes></MemoryRouter>)
}
beforeEach(() => { vi.resetAllMocks(); pageantService.createJudgeAssignment.mockResolvedValue({ data: {} }); pageantService.deleteJudgeAssignment.mockResolvedValue({ data: {} }) })
it('reports partial bulk failures by judge and retries only failures', async () => {
  pageantService.createJudgeAssignment.mockRejectedValueOnce({ response: { data: { message: 'Judge One is unavailable' } } })
  open(); fireEvent.click(screen.getByRole('button', { name: 'Assign all' }))
  await screen.findByText('1 assignment(s) saved; 0 already assigned; 1 failed.')
  expect(screen.getByRole('alert')).toHaveTextContent('Judge One: Judge One is unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Retry failed assignments' }))
  await screen.findByText('1 assignment(s) saved; 0 already assigned; 0 failed.')
  expect(pageantService.createJudgeAssignment.mock.calls.map(call => call[1])).toEqual(['j1', 'j2', 'j1'])
})
it('skips current same-scope assignments and guards repeated bulk clicks', async () => {
  let resolve
  pageantService.createJudgeAssignment.mockImplementation(() => new Promise(done => { resolve = done }))
  open({ assignments: [{ id: 'a', judgeId: 'j1', scope: 'event', scopeId: 'e' }] })
  const assign = screen.getByRole('button', { name: 'Assign all' })
  fireEvent.click(assign); fireEvent.click(assign)
  expect(pageantService.createJudgeAssignment).toHaveBeenCalledExactlyOnceWith('e', 'j2', { scope: 'event', scopeId: 'e' })
  resolve({ data: {} }); await screen.findByText('1 assignment(s) saved; 1 already assigned; 0 failed.')
})
it('frozen panel disables Add, Remove and bulk mutations', async () => {
  open({ official: true, assignments: [{ id: 'a', judgeId: 'j1', scope: 'event', scopeId: 'e' }] })
  expect(screen.getByRole('button', { name: 'Assign all' })).toBeDisabled()
  screen.getAllByRole('button', { name: 'Add assignment' }).forEach(button => expect(button).toBeDisabled())
  expect(screen.getByRole('button', { name: /Remove Event-wide/ })).toBeDisabled()
  expect(pageantService.createJudgeAssignment).not.toHaveBeenCalled()
})
it('delete failure is displayed and does not announce success', async () => {
  pageantService.deleteJudgeAssignment.mockRejectedValue({ response: { data: { message: 'Rules already frozen' } } })
  open({ assignments: [{ id: 'a', judgeId: 'j1', scope: 'event', scopeId: 'e' }] })
  fireEvent.click(screen.getByRole('button', { name: /Remove Event-wide/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Rules already frozen')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Assign all' })).toBeEnabled())
})
