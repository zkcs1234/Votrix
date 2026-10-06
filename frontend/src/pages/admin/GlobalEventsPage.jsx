import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, Zap, Clock, CheckCircle2, Vote, Trophy, BarChart2, Download, X, FileSearch, MoreHorizontal } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import Card from '@/components/ui/Card'
import { format } from 'date-fns'
import SearchInput from '@/components/ui/SearchInput'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import StatCard from '@/components/ui/StatCard'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'
import { INPUT_CLASS } from '@/utils/uiClasses'

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

export default function GlobalEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [exporting, setExporting] = useState(false)
  const [eventExporting, setEventExporting] = useState(null)
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

  const handleEventExport = async (event) => {
    setEventExporting(event.id)
    try {
      const { data } = await adminService.exportEvents({ eventId: event.id })
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = `${event.title?.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'event'}-report.csv`
      a.click()
      URL.revokeObjectURL(url)
      toastSuccess('Event report exported')
    } catch {
      toastError('Event report export failed')
    } finally {
      setEventExporting(null)
    }
  }

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true)
        const { data } = await adminService.getGlobalEvents()
        setEvents(data.events || [])
      } catch (err) {
        setError('Failed to load global events')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchEvents()
  }, [])

  const stats = useMemo(() => {
    const total = events.length
    const active = events.filter((event) => event.status === 'active').length
    const scheduled = events.filter((event) => event.status === 'scheduled').length
    const completed = events.filter((event) => event.status === 'completed').length
    return { total, active, scheduled, completed }
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

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="v-page-title">Global events</h1>
          <p className="v-caption">
            Monitor all elections, competitions, and polls across the platform.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={handleExport} loading={exporting}>
          <Download className="h-4 w-4" strokeWidth={1.5} />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total events" value={stats.total} icon={CalendarDays} />
        <StatCard label="Active" value={stats.active} icon={Zap} />
        <StatCard label="Scheduled" value={stats.scheduled} icon={Clock} />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} />
      </div>

      <Card>
        {error ? (
          <div className="p-8 text-center text-v-danger">{error}</div>
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
              <div className="overflow-x-auto">
                <table className="v-table">
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
                          <Badge>
                            <span className="inline-flex items-center gap-1.5">
                              {event.event_type === 'election' && <Vote className="h-3 w-3" strokeWidth={2} />}
                              {(event.event_type === 'competition_scoring' || event.event_type === 'pageant') && <Trophy className="h-3 w-3" strokeWidth={2} />}
                              {event.event_type === 'polling' && <BarChart2 className="h-3 w-3" strokeWidth={2} />}
                              {eventTypeLabel(event.event_type)}
                            </span>
                          </Badge>
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
                          <div className="grid min-w-[320px] grid-cols-3 items-center gap-2">
                            <Link to={`/admin/audit-logs?entity=events&entityId=${event.id}`} className="v-press inline-flex h-8 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-medium text-v-text-muted transition hover:bg-v-surface-elevated hover:text-v-text" aria-label={`View activity for ${event.title}`}>
                              <FileSearch className="h-4 w-4" strokeWidth={1.5} />
                              Activity
                            </Link>
                            <Button type="button" variant="ghost" size="sm" className="h-8 w-full justify-center gap-1.5 whitespace-nowrap px-2 text-xs" onClick={() => handleEventExport(event)} loading={eventExporting === event.id} aria-label={`Export report for ${event.title}`}>
                              <Download className="h-4 w-4" strokeWidth={1.5} />
                              Export
                            </Button>
                            {event.organizations?.organizer?.id && (
                              <Button type="button" variant="ghost" size="sm" className="h-8 w-full justify-center gap-1.5 whitespace-nowrap px-2 text-xs" onClick={() => navigate(`/admin/organizers/${event.organizations.organizer.id}`)} aria-label={`Open organizer for ${event.title}`}>
                                <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                                Organizer
                              </Button>
                            )}
                          </div>
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
    </div>
  )
}
