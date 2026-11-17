import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CsvImportPreview from './CsvImportPreview'

const columns = [
  { header: 'Name', cell: (row) => [row.first_name, row.last_name].filter(Boolean).join(' ') },
  { header: 'Email', cell: (row) => row.email },
  { header: 'School ID', cell: (row) => row.school_id },
]
const preview = {
  total: 3,
  valid: 2,
  errors: ['Row 4: invalid email'],
  ignoredColumns: ['account_id', 'created_at'],
  summary: { newAccounts: 1, existingAccounts: 1 },
  data: [
    { first_name: 'Ana', last_name: 'Cruz', email: 'ana@example.com', school_id: '2024-1', type: 'new' },
    { first_name: 'Ben', last_name: 'Lee', email: 'ben@example.com', school_id: '', type: 'existing' },
  ],
}

const setup = (overrides = {}) => {
  const onRegister = vi.fn()
  const onClose = vi.fn()
  render(
    <CsvImportPreview
      preview={{ ...preview, ...overrides }}
      columns={columns}
      noun="students"
      resultsFilename="r.csv"
      errorsFilename="e.csv"
      onRegister={onRegister}
      onClose={onClose}
    />,
  )
  return { onRegister, onClose }
}

describe('CsvImportPreview', () => {
  it('shows the rows to register, the skipped rows and the columns that were ignored', () => {
    setup()
    expect(screen.getByText('2 of 3 ready')).toBeInTheDocument()
    expect(screen.getByText('New students: 1')).toBeInTheDocument()
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    expect(screen.getByText('1 row error(s) — these will be skipped')).toBeInTheDocument()
    expect(screen.getByTestId('ignored-columns')).toHaveTextContent('account_id, created_at')
    expect(screen.getAllByText('—')).toHaveLength(1) // Ben has no school ID
  })

  it('does not mention ignored columns when there are none', () => {
    setup({ ignoredColumns: [] })
    expect(screen.queryByTestId('ignored-columns')).not.toBeInTheDocument()
  })

  it('registers the previewed rows', () => {
    const { onRegister } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Register 2' }))
    expect(onRegister).toHaveBeenCalled()
  })

  it('cannot register when nothing in the file is valid', () => {
    setup({ data: [], valid: 0 })
    expect(screen.getByRole('button', { name: 'Register 0' })).toBeDisabled()
  })
})
