import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, Zap, Clock, CheckCircle2, Archive, Vote, Trophy, BarChart2, Download, X, Eye, ClipboardList, Users } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import Card from '@/components/ui/Card'
import { format } from 'date-fns'
import SearchInput from '@/components/ui/SearchInput'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import StatCard from '@/components/ui/StatCard'
import PageHeader from '@/components/ui/PageHeader'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { getErrorMessage } from '@/utils/getErrorMessage'

function eventTypeMatches(eventType, filter) {
  if (filter === 'all') return true
  if (filter === 'competition') return eventType === 'competition_scoring' || eventType === 'pageant'
  return eventType === filter
}

function eventTypeLabel(eventType) {
  if (eventType === 'competition_scoring' || eventType === 'pageant') return 'Competition'
  if (eventType === 'election') return 'Election'
  if (eventType === 'polling') return 'Polling'
  return eventType?.replace(/_/g, ' ') || 'Unknown'
}

function eventModule(eventType) {
  if (eventType === 'election') return 'election'
  if (eventType === 'competition_scoring' || eventType === 'pageant') return 'competition-scoring'
  if (eventType === 'polling') return 'polling'
  return undefined
}

export default function GlobalEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [exporting, setExporting] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const showLoader = useDelayedLoading(loading, 300)
  const { success: toastSuccess, error: toastError } = useToast()
  const navigate = useNavigate()

  const handleExport = async () => {
    setExporting(true)
    try {
      const { data } = await adminService.exportEvents({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        search: search.trim() || undefined,
      })
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'events.csv'
      a.click()
      URL.revokeObjectURL(url)
      toastSuccess('Events exported')
    } catch {
      toastError('Export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleViewEvent = (event) => {
    setSelectedEvent(event)
  }

  const handleCloseView = () => {
    setSelectedEvent(null)
  }

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await adminService.getGlobalEvents()
      setEvents(data.events || [])
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load global events'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchEvents()
  }, [fetchEvents])

  const stats = useMemo(() => {
    const total = events.length
    const active = events.filter((event) => event.status === 'active').length
    const scheduled = events.filter((event) => event.status === 'scheduled').length
    const completed = events.filter((event) => event.status === 'completed').length
    const archived = events.filter((event) => event.status === 'archived').length
    return { total, active, scheduled, completed, archived }
  }, [events])

  const filteredEvents = useMemo(() => {
    const searchLower = search.trim().toLowerCase()
    return events.filter((event) => {
      const matchesSearch =
        !searchLower ||
        event.title?.toLowerCase().includes(searchLower) ||
        event.organizations?.organization_name?.toLowerCase().includes(searchLower)

      const matchesType = eventTypeMatches(event.event_type, typeFilter)
      const matchesStatus = statusFilter === 'all' || event.status === statusFilter

      return matchesSearch && matchesType && matchesStatus
    })
  }, [events, search, typeFilter, statusFilter])

  const hasActiveFilters = Boolean(search.trim()) || typeFilter !== 'all' || statusFilter !== 'all'

  if (loading && !showLoader) {
    return null
  }

  if (loading || showLoader) {
    return (
      <div className="space-y-6">
        <div className="v-card-md">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="v-card-sm h-20 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-20 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-20 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-20 animate-pulse bg-v-surface-elevated" />
        </div>

        <Card padding="sm">
          <div className="h-10 w-full animate-pulse rounded-xl bg-v-surface-elevated" />
          <div className="mt-4 flex gap-3">
            <div className="h-10 w-32 animate-pulse rounded-xl bg-v-surface-elevated" />
            <div className="h-10 w-32 animate-pulse rounded-xl bg-v-surface-elevated" />
            <div className="h-10 w-32 animate-pulse rounded-xl bg-v-surface-elevated" />
          </div>
          <div className="mt-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-v-surface-elevated" />
            ))}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        description="Monitor all elections, competitions, and polls across the platform."
        actions={
          <Button size="sm" variant="secondary" onClick={handleExport} loading={exporting}>
            <Download className="h-4 w-4" strokeWidth={1.5} />
            Export CSV
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total events" value={stats.total} icon={CalendarDays} />
        <StatCard label="Active" value={stats.active} icon={Zap} />
        <StatCard label="Scheduled" value={stats.scheduled} icon={Clock} />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} />
        <StatCard label="Archived" value={stats.archived} icon={Archive} />
      </div>

      <Card padding="sm">
        {error ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-v-danger">{error}</p>
            <Button variant="secondary" onClick={fetchEvents}>Retry loading events</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <SearchInput
                placeholder="Search by title or organization"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-w-0 flex-1 lg:max-w-md"
              />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className={`${INPUT_CLASS} w-full sm:w-44`}
                aria-label="Filter by event type"
              >
                <option value="all">All types</option>
                <option value="election">Election</option>
                <option value="competition">Competition</option>
                <option value="polling">Polling</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`${INPUT_CLASS} w-full sm:w-44`}
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="archived">Archived</option>
              </select>
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all') }}
                >
                  <X className="h-4 w-4" strokeWidth={1.5} /> Clear filters
                </Button>
              )}
            </div>

            <p className="text-sm text-v-text-subtle">
              Showing <span className="font-medium text-v-text">{filteredEvents.length}</span> of {events.length} events
            </p>

            {filteredEvents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-v-border p-8 text-center text-v-text-subtle">
                No events match your current filters.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-v-border">
                <table className="v-table min-w-[900px]">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Organization</th>
                      <th>Status</th>
                      <th>Date range</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-v-border">
                    {filteredEvents.map((event) => (
                      <tr key={event.id} className="hover:bg-v-surface-elevated/50">
                        <td className="font-medium text-v-text">{event.title}</td>
                        <td className="capitalize">
                          <span data-module={eventModule(event.event_type)}>
                            <Badge className="border-v-primary/20 bg-v-primary-soft text-v-primary">
                              <span className="inline-flex items-center gap-1.5">
                              {event.event_type === 'election' && <Vote className="h-3 w-3" strokeWidth={2} />}
                              {(event.event_type === 'competition_scoring' || event.event_type === 'pageant') && <Trophy className="h-3 w-3" strokeWidth={2} />}
                              {event.event_type === 'polling' && <BarChart2 className="h-3 w-3" strokeWidth={2} />}
                              {eventTypeLabel(event.event_type)}
                              </span>
                            </Badge>
                          </span>
                        </td>
                        <td>{event.organizations?.organization_name || 'N/A'}</td>
                        <td className="capitalize">
                          <Badge tone={event.status === 'active' ? 'success' : event.status === 'cancelled' ? 'danger' : 'default'}>
                            {event.status}
                          </Badge>
                        </td>
                        <td className="v-caption">
                          {event.start_date && event.end_date
                            ? `${format(new Date(event.start_date), 'MMM d, yyyy')} - ${format(
                                new Date(event.end_date),
                                'MMM d, yyyy',
                              )}`
                            : 'Not set'}
                        </td>
                        <td className="align-middle">
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 gap-1.5 px-3 text-xs"
                            onClick={() => handleViewEvent(event)}
                            aria-label={`View details for ${event.title}`}
                          >
                            <Eye className="h-4 w-4" strokeWidth={1.5} />
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Event Details Modal */}
      {selectedEvent && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleCloseView}
        >
          <div 
            className="v-card-md w-full max-w-3xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-v-text">{selectedEvent.title}</h2>
                <p className="mt-1 text-sm text-v-text-subtle">Event Details & Monitoring</p>
              </div>
              <button
                type="button"
                onClick={handleCloseView}
                className="v-press rounded-lg p-2 hover:bg-v-surface-elevated"
                aria-label="Close details"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>

            {/* Event Overview Section */}
            <div className="mb-6 space-y-4">
              <h3 className="text-sm font-semibold text-v-text">Event Overview</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-v-text-subtle">Event Type</p>
                  <Badge className="mt-1 border-v-primary/20 bg-v-primary-soft text-v-primary">
                    <span className="inline-flex items-center gap-1.5">
                      {selectedEvent.event_type === 'election' && <Vote className="h-3 w-3" strokeWidth={2} />}
                      {(selectedEvent.event_type === 'competition_scoring' || selectedEvent.event_type === 'pageant') && <Trophy className="h-3 w-3" strokeWidth={2} />}
                      {selectedEvent.event_type === 'polling' && <BarChart2 className="h-3 w-3" strokeWidth={2} />}
                      {eventTypeLabel(selectedEvent.event_type)}
                    </span>
                  </Badge>
                </div>
                <div>
                  <p className="text-xs font-medium text-v-text-subtle">Status</p>
                  <Badge className="mt-1" tone={selectedEvent.status === 'active' ? 'success' : selectedEvent.status === 'cancelled' ? 'danger' : 'default'}>
                    {selectedEvent.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs font-medium text-v-text-subtle">Start Date</p>
                  <p className="mt-1 text-sm text-v-text">
                    {selectedEvent.start_date ? format(new Date(selectedEvent.start_date), 'MMM d, yyyy h:mm a') : 'Not set'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-v-text-subtle">End Date</p>
                  <p className="mt-1 text-sm text-v-text">
                    {selectedEvent.end_date ? format(new Date(selectedEvent.end_date), 'MMM d, yyyy h:mm a') : 'Not set'}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-v-text-subtle">Event ID</p>
                  <p className="mt-1 font-mono text-xs text-v-text-muted">{selectedEvent.id}</p>
                </div>
              </div>
            </div>

            {/* Organization Info Section */}
            <div className="mb-6 space-y-4">
              <h3 className="text-sm font-semibold text-v-text">Organization</h3>
              <div className="rounded-lg border border-v-border bg-v-surface-elevated p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-v-text-subtle">Organization Name</p>
                    <p className="mt-1 text-sm text-v-text">
                      {selectedEvent.organizations?.organization_name || 'N/A'}
                    </p>
                  </div>
                  {selectedEvent.organizations?.organizer?.id && (
                    <div>
                      <p className="text-xs font-medium text-v-text-subtle">Organizer</p>
                      <button
                        type="button"
                        onClick={() => {
                          handleCloseView()
                          navigate(`/admin/organizers/${selectedEvent.organizations.organizer.id}`)
                        }}
                        className="mt-1 text-sm text-v-primary hover:underline"
                      >
                        View Organizer Profile →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Participation Stats Section */}
            <div className="mb-6 space-y-4">
              <h3 className="text-sm font-semibold text-v-text">Participation Metrics</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-v-border bg-v-surface-elevated p-4">
                  <p className="text-xs font-medium text-v-text-subtle">Total Participants</p>
                  <p className="mt-2 text-2xl font-semibold text-v-text">
                    {selectedEvent.participant_count || 0}
                  </p>
                </div>
                <div className="rounded-lg border border-v-border bg-v-surface-elevated p-4">
                  <p className="text-xs font-medium text-v-text-subtle">Voters/Judges</p>
                  <p className="mt-2 text-2xl font-semibold text-v-text">
                    {selectedEvent.voter_count || 0}
                  </p>
                </div>
                <div className="rounded-lg border border-v-border bg-v-surface-elevated p-4">
                  <p className="text-xs font-medium text-v-text-subtle">Submissions</p>
                  <p className="mt-2 text-2xl font-semibold text-v-text">
                    {selectedEvent.submission_count || 0}
                  </p>
                </div>
              </div>
              <p className="text-xs text-v-text-subtle">
                Note: Metrics may vary based on event type and configuration
              </p>
            </div>

            {/* Admin Actions Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-v-text">Admin Actions</h3>
              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/admin/audit-logs?entity=events&entityId=${selectedEvent.id}`}
                  className="v-press inline-flex items-center gap-2 rounded-lg border border-v-border bg-v-surface px-4 py-2 text-sm font-medium text-v-text transition hover:bg-v-surface-elevated"
                  onClick={handleCloseView}
                >
                  <ClipboardList className="h-4 w-4" strokeWidth={1.5} />
                  View Audit Logs
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    handleCloseView()
                    const { data } = await adminService.exportEvents({ eventId: selectedEvent.id })
                    const url = URL.createObjectURL(data)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${selectedEvent.title?.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'event'}-report.csv`
                    a.click()
                    URL.revokeObjectURL(url)
                    toastSuccess('Event report exported')
                  }}
                  className="v-press inline-flex items-center gap-2 rounded-lg border border-v-border bg-v-surface px-4 py-2 text-sm font-medium text-v-text transition hover:bg-v-surface-elevated"
                >
                  <Download className="h-4 w-4" strokeWidth={1.5} />
                  Export Event Report
                </button>
                {selectedEvent.organizations?.organizer?.id && (
                  <button
                    type="button"
                    onClick={() => {
                      handleCloseView()
                      navigate(`/admin/organizers/${selectedEvent.organizations.organizer.id}`)
                    }}
                    className="v-press inline-flex items-center gap-2 rounded-lg border border-v-border bg-v-surface px-4 py-2 text-sm font-medium text-v-text transition hover:bg-v-surface-elevated"
                  >
                    <Users className="h-4 w-4" strokeWidth={1.5} />
                    View Organizer
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
