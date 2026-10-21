import { useState, useMemo } from 'react'
import { FileSpreadsheet, FileText, ChevronLeft, ChevronRight, X } from 'lucide-react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import Button from '@/components/ui/Button'
import { downloadExcel, downloadCsv } from '@/utils/exportReport'

/**
 * ParticipantParticipationTable
 *
 * Renders a clean roster of enrolled voters or respondents showing who has
 * participated (voted/responded) and who has not. Includes multi-level filtering
 * by Program and Year & Section (e.g. BSCS 1A, 1B, 2A; BSED 1A...), search by
 * Student ID or Name, status filter, and quick Excel/CSV export.
 */
export default function ParticipantParticipationTable({
  title = 'Voter participation',
  description = 'List of enrolled participants and their voting status.',
  participants = [],
  statusKey = 'hasVoted',
  votedLabel = 'Voted',
  notVotedLabel = 'Not voted',
  filename = 'participation-roster',
}) {
  const [search, setSearch] = useState('')
  const [selectedProgram, setSelectedProgram] = useState('all')
  const [selectedSection, setSelectedSection] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Extract distinct programs (sorted alphabetically)
  const programs = useMemo(() => {
    const set = new Set()
    for (const p of participants) {
      if (p.program && p.program !== 'Unspecified') {
        set.add(p.program)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [participants])

  // Extract distinct sections, optionally constrained to selected program
  const sections = useMemo(() => {
    const set = new Set()
    for (const p of participants) {
      if (selectedProgram !== 'all' && p.program !== selectedProgram) continue
      if (p.yearSection && p.yearSection !== 'Unspecified') {
        set.add(p.yearSection)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [participants, selectedProgram])

  // Filter participants
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return participants.filter((p) => {
      if (selectedProgram !== 'all' && (p.program || 'Unspecified') !== selectedProgram) {
        return false
      }
      if (selectedSection !== 'all' && (p.yearSection || 'Unspecified') !== selectedSection) {
        return false
      }
      const hasParticipated = Boolean(p[statusKey])
      if (selectedStatus === 'voted' && !hasParticipated) {
        return false
      }
      if (selectedStatus === 'not_voted' && hasParticipated) {
        return false
      }
      if (q) {
        const idMatch = String(p.schoolId ?? '').toLowerCase().includes(q)
        const nameMatch = `${p.firstName ?? ''} ${p.lastName ?? ''}`.toLowerCase().includes(q)
        if (!idMatch && !nameMatch) return false
      }
      return true
    })
  }, [participants, selectedProgram, selectedSection, selectedStatus, search, statusKey])

  // Reset pagination when filter changes
  const handleProgramChange = (prog) => {
    setSelectedProgram(prog)
    setSelectedSection('all')
    setPage(1)
  }

  const handleSectionChange = (sec) => {
    setSelectedSection(sec)
    setPage(1)
  }

  const handleStatusChange = (st) => {
    setSelectedStatus(st)
    setPage(1)
  }

  const handleSearchChange = (e) => {
    setSearch(e.target.value)
    setPage(1)
  }

  const handleClearFilters = () => {
    setSearch('')
    setSelectedProgram('all')
    setSelectedSection('all')
    setSelectedStatus('all')
    setPage(1)
  }

  // Summary counts
  const totalCount = participants.length
  const filteredCount = filtered.length
  const filteredParticipated = filtered.filter((p) => Boolean(p[statusKey])).length
  const filteredTurnout = filteredCount > 0 ? Math.round((filteredParticipated / filteredCount) * 1000) / 10 : 0

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, safePage, pageSize])

  const hasActiveFilters = search || selectedProgram !== 'all' || selectedSection !== 'all' || selectedStatus !== 'all'

  // Excel / CSV Export
  const handleExportExcel = () => {
    const rows = filtered.map((p) => ({
      'Student ID': p.schoolId || 'N/A',
      'Last Name': p.lastName || '',
      'First Name': p.firstName || '',
      'Program': p.program || '',
      'Year & Section': p.yearSection || '',
      'Status': p[statusKey] ? votedLabel : notVotedLabel,
    }))
    downloadExcel(filename, [{ name: 'Participation', rows }])
  }

  const handleExportCsv = () => {
    const rows = filtered.map((p) => ({
      schoolId: p.schoolId || 'N/A',
      lastName: p.lastName || '',
      firstName: p.firstName || '',
      program: p.program || '',
      yearSection: p.yearSection || '',
      status: p[statusKey] ? votedLabel : notVotedLabel,
    }))
    downloadCsv(`${filename}.csv`, rows)
  }

  if (!participants.length) {
    return null
  }

  return (
    <Card className="space-y-5 p-5 sm:p-6">
      {/* Header with Title & Quick Export */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-v-text">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-v-text-subtle">{description}</p>}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            title="Download current roster as CSV"
            className="text-xs"
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            title="Download current roster as Excel"
            className="text-xs"
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <SearchInput
          placeholder="Search by name or ID..."
          value={search}
          onChange={handleSearchChange}
        />

        {/* Program Filter */}
        <select
          value={selectedProgram}
          onChange={(e) => handleProgramChange(e.target.value)}
          aria-label="Filter by program"
          className="w-full rounded-lg border border-v-border-strong bg-v-surface-elevated px-3 py-2 text-sm text-v-text shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:border-v-text-muted focus:border-v-primary focus:bg-v-surface focus:outline-none focus:ring-2 focus:ring-v-primary/20"
        >
          <option value="all">All Programs ({programs.length})</option>
          {programs.map((prog) => (
            <option key={prog} value={prog}>
              {prog}
            </option>
          ))}
        </select>

        {/* Year & Section Filter */}
        <select
          value={selectedSection}
          onChange={(e) => handleSectionChange(e.target.value)}
          aria-label="Filter by section"
          className="w-full rounded-lg border border-v-border-strong bg-v-surface-elevated px-3 py-2 text-sm text-v-text shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:border-v-text-muted focus:border-v-primary focus:bg-v-surface focus:outline-none focus:ring-2 focus:ring-v-primary/20"
        >
          <option value="all">All Sections ({sections.length})</option>
          {sections.map((sec) => (
            <option key={sec} value={sec}>
              {sec}
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={selectedStatus}
          onChange={(e) => handleStatusChange(e.target.value)}
          aria-label="Filter by status"
          className="w-full rounded-lg border border-v-border-strong bg-v-surface-elevated px-3 py-2 text-sm text-v-text shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:border-v-text-muted focus:border-v-primary focus:bg-v-surface focus:outline-none focus:ring-2 focus:ring-v-primary/20"
        >
          <option value="all">All Status</option>
          <option value="voted">{votedLabel} Only</option>
          <option value="not_voted">{notVotedLabel} Only</option>
        </select>
      </div>

      {/* Roster Counters & Reset */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-v-text-muted">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Showing <strong className="font-semibold text-v-text">{filteredCount}</strong> of{' '}
            {totalCount} participants
          </span>
          <span className="text-v-border-strong">•</span>
          <span>
            <strong className="font-semibold text-v-text">{filteredParticipated}</strong> {votedLabel.toLowerCase()}{' '}
            ({filteredTurnout}%)
          </span>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="inline-flex items-center gap-1 text-xs text-v-primary hover:underline"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-v-border">
        <table className="w-full min-w-160 text-left text-sm">
          <thead className="border-b border-v-border bg-v-surface-elevated text-xs font-medium uppercase tracking-wider text-v-text-subtle">
            <tr>
              <th className="px-3.5 py-2.5">Student ID</th>
              <th className="px-3.5 py-2.5">Name</th>
              <th className="px-3.5 py-2.5">Program</th>
              <th className="px-3.5 py-2.5">Year &amp; Section</th>
              <th className="px-3.5 py-2.5 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-v-border">
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-v-text-muted">
                  No participants match the selected filter.
                </td>
              </tr>
            ) : (
              paginatedRows.map((p) => {
                const hasParticipated = Boolean(p[statusKey])
                const fullName = [p.lastName, p.firstName].filter(Boolean).join(', ') || '—'
                return (
                  <tr key={p.id} className="transition-colors hover:bg-v-surface-elevated/50">
                    <td className="px-3.5 py-2.5 font-mono text-xs text-v-text-muted">
                      {p.schoolId || '—'}
                    </td>
                    <td className="px-3.5 py-2.5 font-medium text-v-text">{fullName}</td>
                    <td className="px-3.5 py-2.5 text-v-text-muted">{p.program || '—'}</td>
                    <td className="px-3.5 py-2.5 text-v-text-muted">{p.yearSection || '—'}</td>
                    <td className="px-3.5 py-2.5 text-right">
                      {hasParticipated ? (
                        <Badge tone="success" dot>
                          {votedLabel}
                        </Badge>
                      ) : (
                        <Badge tone="neutral" dot>
                          {notVotedLabel}
                        </Badge>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-v-text-muted">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
              className="rounded border border-v-border bg-v-surface-elevated px-2 py-1 text-xs text-v-text focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span>
              Page {safePage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
