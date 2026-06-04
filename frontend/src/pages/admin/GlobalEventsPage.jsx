import { useEffect, useMemo, useState } from 'react'
import { adminService } from '@/services/admin.service'
import Card from '@/components/ui/Card'
import { format } from 'date-fns'
import SearchInput from '@/components/ui/SearchInput'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import StatCard from '@/components/ui/StatCard'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

export default function GlobalEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const showLoader = useDelayedLoading(loading, 300)

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

      const matchesType = typeFilter === 'all' || event.event_type === typeFilter
      const matchesStatus = statusFilter === 'all' || event.status === statusFilter

      return matchesSearch && matchesType && matchesStatus
    })
  }, [events, search, typeFilter, statusFilter])

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
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
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
      <div>
        <h1 className="v-page-title">Global events</h1>
        <p className="v-caption">
          Monitor all elections, competitions, and polls across the platform.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total events" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Scheduled" value={stats.scheduled} />
        <StatCard label="Completed" value={stats.completed} />
      </div>

      <Card>
        {error ? (
          <div className="p-8 text-center text-v-danger">{error}</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <SearchInput
                placeholder="Search by title or organization"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="lg:max-w-md"
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={typeFilter === 'all' ? 'primary' : 'secondary'}
                  onClick={() => setTypeFilter('all')}
                >
                  All types
                </Button>
                <Button
                  type="button"
                  variant={typeFilter === 'election' ? 'primary' : 'secondary'}
                  onClick={() => setTypeFilter('election')}
                >
                  Election
                </Button>
                <Button
                  type="button"
                  variant={typeFilter === 'competition_scoring' ? 'primary' : 'secondary'}
                  onClick={() => setTypeFilter('competition_scoring')}
                >
                  Competition
                </Button>
                <Button
                  type="button"
                  variant={typeFilter === 'polling' ? 'primary' : 'secondary'}
                  onClick={() => setTypeFilter('polling')}
                >
                  Polling
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={statusFilter === 'all' ? 'primary' : 'secondary'}
                onClick={() => setStatusFilter('all')}
              >
                All statuses
              </Button>
              <Button
                type="button"
                variant={statusFilter === 'draft' ? 'primary' : 'secondary'}
                onClick={() => setStatusFilter('draft')}
              >
                Draft
              </Button>
              <Button
                type="button"
                variant={statusFilter === 'scheduled' ? 'primary' : 'secondary'}
                onClick={() => setStatusFilter('scheduled')}
              >
                Scheduled
              </Button>
              <Button
                type="button"
                variant={statusFilter === 'active' ? 'primary' : 'secondary'}
                onClick={() => setStatusFilter('active')}
              >
                Active
              </Button>
              <Button
                type="button"
                variant={statusFilter === 'completed' ? 'primary' : 'secondary'}
                onClick={() => setStatusFilter('completed')}
              >
                Completed
              </Button>
              <Button
                type="button"
                variant={statusFilter === 'cancelled' ? 'primary' : 'secondary'}
                onClick={() => setStatusFilter('cancelled')}
              >
                Cancelled
              </Button>
            </div>

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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-v-border">
                    {filteredEvents.map((event) => (
                      <tr key={event.id} className="hover:bg-v-surface-elevated/50">
                        <td className="font-medium text-v-text">{event.title}</td>
                        <td className="capitalize">
                          <Badge>{event.event_type}</Badge>
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
