import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import CompetitionJudgeWorksheets from './CompetitionJudgeWorksheets'

const state = {
  rules: {
    event: { id: 'event' },
    rounds: [{ id: 'round', name: 'Preliminary', criteriaIds: ['presentation'], contestantIds: ['entry'] }],
    criteria: [{ id: 'presentation', name: 'Presentation', percentage: 100, minorCriteria: [{ id: 'delivery', name: 'Delivery' }] }],
    contestants: [{ id: 'entry', name: 'Entry One', contestantNumber: 1 }],
    judges: [{ judgeId: 'judge', displayName: 'Judge One', role: 'judge' }],
    divisions: [],
  },
  lockedSources: [],
  submissions: [],
}

test('judge worksheets expose an accessible table with grouped criteria and row headers', () => {
  render(<CompetitionJudgeWorksheets state={state} roundId="round" />)

  const table = screen.getByRole('table', { name: 'Judge One — Preliminary judge worksheet' })
  expect(table).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Entry' })).toHaveAttribute('rowspan', '2')
  expect(screen.getByRole('columnheader', { name: 'Presentation (100%)' })).toHaveAttribute('colspan', '2')
  expect(screen.getByRole('columnheader', { name: 'Delivery' })).toHaveAttribute('scope', 'col')
  expect(screen.getByRole('rowheader', { name: '#1 Entry One' })).toBeInTheDocument()
})

test('judge worksheets explain when the selected judge has no eligible entries', () => {
  const restrictedState = {
    ...state,
    rules: {
      ...state.rules,
      judges: [{ ...state.rules.judges[0], assignments: [{ scope: 'round', scopeId: 'another-round' }] }],
    },
  }

  render(<CompetitionJudgeWorksheets state={restrictedState} roundId="round" />)

  expect(screen.getByText('No eligible entries are assigned to this judge for this round.')).toBeInTheDocument()
})

test('judge worksheets explain when no scoring judges are assigned', () => {
  const noJudgesState = {
    ...state,
    rules: {
      ...state.rules,
      judges: [{ judgeId: 'reviewer', role: 'score_reviewer' }],
    },
  }

  render(<CompetitionJudgeWorksheets state={noJudgesState} roundId="round" />)

  expect(screen.getByText('No scoring judges are assigned to this event.')).toBeInTheDocument()
})
