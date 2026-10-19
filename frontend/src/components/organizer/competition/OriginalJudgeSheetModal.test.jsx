import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import OriginalJudgeSheetModal from './OriginalJudgeSheetModal'
import { originalJudgeSheet, originalJudgeSheetPrintHtml } from '@/utils/originalJudgeSheet'

function fixture() {
  const view = {
    eventId: 'event', competitionId: 'music', roundId: 'final', complete: true,
    session: { id: 'session', entry_ids: ['red', 'blue'] },
    progress: [{ judgeId: 'j1', judgeName: 'Ana Cruz', submitted: true, submissionId: 's1', submittedAt: '2026-10-19T01:20:00Z' }, { judgeId: 'j2', judgeName: 'Ben Reyes', submitted: true, submissionId: 's2', submittedAt: '2026-10-19T01:25:00Z' }],
    entries: [{ id: 'red', name: 'Red Bison', contestantNumber: 1 }, { id: 'blue', name: 'Blue Sharks', contestantNumber: 2 }],
    rules: { id: 'rules', version: 3, configuration_snapshot: { scoringConfig: { criterionBasis: 'weighted' }, criteria: [
      { id: 'vocal', roundId: 'final', name: 'Vocal Quality', percentage: 60, minorCriteria: [{ id: 'tone', name: 'Tone', percentage: 70, minScore: 0, maxScore: 10 }, { id: 'pitch', name: 'Pitch', percentage: 30, minScore: 0, maxScore: 10 }] },
      { id: 'stage', roundId: 'final', name: 'Stage Presence', percentage: 40, minScore: 0, maxScore: 10 },
      { id: 'old', roundId: 'preliminary', name: 'Other round', minScore: 0, maxScore: 100 },
    ] } },
    calculation: { output_snapshot: { results: [{ finalScore: 999.99, rank: 1 }], worksheets: [{ judgeId: 'j1', total: 777.77 }] } },
  }
  view.submissions = view.progress.map((judge, i) => ({ id: judge.submissionId, judge_id: judge.judgeId, session_id: 'session', rules_version: 'rules', round_id: 'final', submitted_at: judge.submittedAt, sources: view.entries.flatMap(entry => [
    { session_id: 'session', judge_id: judge.judgeId, locked: true, entry_id: entry.id, criterion_id: 'vocal', revision: 2, scores: { tone: i ? 1.25 : 10, pitch: i ? 2.5 : 8 } },
    { session_id: 'session', judge_id: judge.judgeId, locked: true, entry_id: entry.id, criterion_id: 'stage', revision: 3, scores: { stage: i ? 3.75 : 0 } },
  ]) }))
  return { view, choice: { eventName: 'Campus Arts 2026', competitionName: 'Solo Singing', roundName: 'Final' }, selection: { judgeId: 'j1', submissionId: 's1' }, onClose: vi.fn(), onDownload: vi.fn(), reviewer: false, busy: false }
}

test('original sheet has one contestant row, grouped minor criteria, exact saved values and raw subtotals', () => {
  const props = fixture(); render(<OriginalJudgeSheetModal {...props}/>)
  const dialog = screen.getByRole('dialog', { name: 'Judge Score Sheet' })
  expect(dialog).toHaveTextContent('Campus Arts 2026 · Solo Singing · Final')
  expect(dialog).toHaveTextContent('Judge: Ana Cruz')
  expect(dialog).toHaveTextContent('Current submission · s1')
  expect(dialog).toHaveTextContent('Frozen rule revision 3')
  const table = within(dialog).getByRole('table', { name: 'Original submitted scores for Ana Cruz' })
  expect(within(table).getAllByRole('rowheader')).toHaveLength(2)
  expect(within(table).getByRole('columnheader', { name: 'Vocal Quality 60% weight' })).toHaveAttribute('colspan', '3')
  expect(within(table).getByRole('columnheader', { name: 'Tone (70%) [0–10]' })).toBeInTheDocument()
  const row = within(table).getByRole('rowheader', { name: 'Red Bison' }).closest('tr')
  expect(within(row).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['001', '10', '8', '18', '0', '18'])
  for (const value of ['999.99', '777.77', '1.25', 'Other round', 'Average', 'Rank']) expect(dialog).not.toHaveTextContent(value)
  expect(within(dialog).queryByRole('spinbutton')).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Download CSV' }))
  expect(props.onDownload).toHaveBeenCalledWith('j1', 'Ana Cruz', 's1')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close Sheet' }))
  expect(props.onClose).toHaveBeenCalled()
})

test('switching judges selects the exact submitted record and recalculation does not change originals', () => {
  const props = fixture(), { rerender } = render(<OriginalJudgeSheetModal {...props}/>)
  props.selection = { judgeId: 'j2', submissionId: 's2' }
  rerender(<OriginalJudgeSheetModal {...props}/>)
  const table = screen.getByRole('table', { name: 'Original submitted scores for Ben Reyes' })
  const original = table.textContent
  expect(table).toHaveTextContent('1.25')
  expect(table).not.toHaveTextContent('18')
  props.view.calculation = { output_snapshot: { results: [{ finalScore: -1 }] } }
  rerender(<OriginalJudgeSheetModal {...props}/>)
  expect(table.textContent).toBe(original)
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(props.onClose).toHaveBeenCalled()
})

test('wrong submission, round, session, rules, judge or source lineage cannot expose any scores', () => {
  const mutations = [p => { p.selection.submissionId = 's2' }, p => { p.view.submissions[0].round_id = 'preliminary' }, p => { p.view.submissions[0].session_id = 'other-session' }, p => { p.view.submissions[0].rules_version = 'old-rules' }, p => { p.view.submissions[0].judge_id = 'j2' }, p => { p.view.submissions[0].sources[0].judge_id = 'j2' }]
  for (const mutate of mutations) {
    const props = fixture(); mutate(props)
    const sheet = originalJudgeSheet(props.view, props.selection)
    expect(sheet.message).toBeTruthy()
    expect(sheet.rows).toBeUndefined()
    expect(sheet.submission).toBeUndefined()
  }
})

test('incomplete context displays real status and withholds historical values and export actions', () => {
  const props = fixture(); props.view.complete = false; props.view.progress[0].submitted = false; props.view.progress[0].submissionState = 'incomplete'
  render(<OriginalJudgeSheetModal {...props}/>)
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent('Incomplete or invalid sheet')
  expect(dialog).toHaveTextContent('withheld')
  expect(within(dialog).queryByRole('table')).not.toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Download CSV' })).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: 'Print / Save PDF' })).toBeDisabled()
})

test('missing scores remain Missing, never zero, and reviewers have no export controls', () => {
  const props = fixture(); delete props.view.submissions[0].sources[0].scores.pitch; props.reviewer = true
  render(<OriginalJudgeSheetModal {...props}/>)
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent('Incomplete saved sheet')
  const row = screen.getByRole('rowheader', { name: 'Red Bison' }).closest('tr')
  expect(within(row).getAllByText('Missing')).toHaveLength(3)
  expect(within(dialog).queryByRole('button', { name: /Print|Download/ })).not.toBeInTheDocument()
})

test('points basis uses submitted major points and print output preserves grouping without injecting markup', () => {
  const props = fixture(), cfg = props.view.rules.configuration_snapshot
  cfg.scoringConfig.criterionBasis = 'points'
  props.view.submissions[0].sources[0].scores = { vocal: 8.125 }
  props.view.submissions[0].sources[2].scores = { vocal: 9.75 }
  props.view.entries[0].name = '<script>alert(1)</script>'
  const sheet = originalJudgeSheet(props.view, props.selection)
  expect(sheet.rows[0].cells[0].values).toEqual([8.125])
  expect(sheet.rows[0].total).toBe(8.125)
  const html = originalJudgeSheetPrintHtml(sheet, { ...props.choice, timestamp: 'Oct 19, 2026' })
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('999.99')
  expect(html).toContain('background:#173766;color:white')
})

test('Print opens only the selected original sheet and invokes the browser print action', () => {
  const props = fixture(), win = { document: { open: vi.fn(), write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn() }
  const open = vi.spyOn(window, 'open').mockReturnValue(win)
  try {
    render(<OriginalJudgeSheetModal {...props}/>)
    fireEvent.click(screen.getByRole('button', { name: 'Print / Save PDF' }))
    expect(win.document.write).toHaveBeenCalledWith(expect.stringContaining('Ana Cruz'))
    expect(win.document.write.mock.calls[0][0]).not.toContain('777.77')
    win.onload()
    expect(win.print).toHaveBeenCalledTimes(1)
    expect(win.opener).toBe(null)
  } finally { open.mockRestore() }
})
