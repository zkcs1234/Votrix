import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CompetitionReportPage from './CompetitionReportPage'
import { workflowService } from '@/services/competition-workflow.service'
const fixture = vi.hoisted(() => ({ analytics: {}, refresh: vi.fn() }))
vi.mock('@/services/competition-workflow.service', () => ({ workflowService: { exportExcel: vi.fn() } }))
vi.mock('@/hooks/useDelayedLoading', () => ({ useDelayedLoading: () => false }))
vi.mock('@/components/reports/TurnoutReport', () => ({ default: () => <p>Judge turnout</p> }))
vi.mock('@/modules/competition', () => ({
  buildCompetitionCategoryResults: () => [], buildCompetitionRoundResults: () => [],
  buildCompetitionContestantPerformance: report => report.rankings.map(row => ({ name: row.contestantName, value: row.weightedScore })),
  buildCompetitionExportPayload: () => ({}), buildCompetitionReportCsvRows: () => [], buildCompetitionReportSheets: () => [],
}))
vi.mock('@/modules/analytics', () => ({
  useModuleAnalytics: () => ({ ...fixture.analytics, refresh: fixture.refresh }),
  ReportDocument: ({ children, actions }) => <section>{actions}{children}</section>,
  ReportActionsBar: ({ onExportExcel }) => <button onClick={onExportExcel}>Export Excel</button>,
  AnalyticsSection: ({ title, children }) => <section><h2>{title}</h2>{children}</section>,
  AnalyticsStatsGrid: () => <p>Waiting</p>, DistributionList: () => null,
  RankingList: ({ items, valueFormatter }) => <ul>{items.map(item => <li key={item.name}>{item.name}: {valueFormatter(item.value)}</li>)}</ul>,
  downloadCsv: vi.fn(), downloadExcel: vi.fn(), downloadJson: vi.fn(), downloadPdf: vi.fn(),
}))
function open() {
  render(<MemoryRouter initialEntries={['/competition/e/report']}><Routes><Route path="/competition/:eventId/report" element={<CompetitionReportPage />} /></Routes></MemoryRouter>)
}
beforeEach(() => {
  vi.resetAllMocks()
  fixture.analytics = { report: { event: { title: 'Finals' }, rankings: [{ contestantName: 'Incomplete contestant', weightedScore: null }], roundResults: [], divisionResults: [] }, loading: false }
})
it('report failure is visible with retry rather than a blank or falsely empty report', () => {
  fixture.analytics = { report: null, loading: false, reportError: { response: { data: { message: 'Report access denied' } } } }
  open()
  expect(screen.getByRole('alert')).toHaveTextContent('Report access denied')
  fireEvent.click(screen.getByRole('button', { name: 'Retry report' }))
  expect(fixture.refresh).toHaveBeenCalledTimes(1)
})
it('missing numeric totals remain incomplete while manual placements have a clear label', () => {
  open()
  expect(screen.getByText('Incomplete contestant: Incomplete')).toBeInTheDocument()
  expect(screen.queryByText(/Incomplete contestant: 0.00/)).not.toBeInTheDocument()
})
it('workbook rejection displays a useful error without an unhandled request', async () => {
  workflowService.exportExcel.mockRejectedValue({ response: { status: 403, data: { message: 'Workbook access denied' } } })
  open(); fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Workbook access denied')
})
it('manual report totals are identified as manual decisions rather than numeric zero', () => {
  fixture.analytics.report.tabulationMethod = 'manual'
  open(); expect(screen.getByText('Incomplete contestant: Manual official decision')).toBeInTheDocument()
})
