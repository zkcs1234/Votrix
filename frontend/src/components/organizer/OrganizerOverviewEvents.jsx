import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Badge, { statusTone } from '@/components/ui/Badge'
import CreateEventMenu from '@/components/organizer/CreateEventMenu'
import { SkeletonList } from '@/components/ui/Skeleton'
import { electionService } from '@/services/election.service'
import { pageantService } from '@/services/pageant.service'
import { pollingService } from '@/services/polling.service'
import { EVENT_TYPE_META } from '@/services/voter.service'
import { COMPETITION_SCORING_EVENT_TYPES, EVENT_TYPES } from '@/utils/constants'

// These are the existing module list and creation routes; there is no combined
// organizer Events route. Keep the Overview navigation within those flows.
const MODULES = [
  { key: 'election', label: EVENT_TYPE_META.election.label, service: electionService, destination: 'positions' },
  { key: 'competition', label: EVENT_TYPE_META.competition_scoring.label, service: pageantService, destination: 'contestants' },
  { key: 'polling', label: EVENT_TYPE_META.polling.label, service: pollingService, destination: 'builder' },
]

function moduleFor(event) {
  if (COMPETITION_SCORING_EVENT_TYPES.has(event.eventType)) return MODULES[1]
  return event.eventType === EVENT_TYPES.POLLING ? MODULES[2] : MODULES[0]
}

function ModuleNavigation({ create = false }) {
  return <CreateEventMenu create={create} />
}

export default function OrganizerOverviewEvents({ dashboard }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    // Refresh alongside the existing dashboard's socket updates. Preserve each
    // module's API ordering (newest first), in the Overview's module order.
    Promise.all(MODULES.map((module) => module.service.listEvents()))
      .then((responses) => {
        if (!alive) return
        setEvents(responses.flatMap(({ data }) => data.events ?? []))
        setError(null)
      })
      .catch((err) => {
        if (alive) setError(err.response?.data?.message || 'Failed to load your events.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [dashboard])

  // Limit the data before rendering: no hidden rows, pagination, or scrolling.
  const overviewEvents = events.slice(0, 4)

  return (
    <Card padding="sm">
      <section aria-labelledby="overview-events-title">
        <div className="flex items-center justify-between gap-3">
          <h3 id="overview-events-title" className="v-section-title">Recent events</h3>
          {!loading && !error && events.length > 4 && <ModuleNavigation />}
        </div>
        {loading ? (
          <SkeletonList count={4} />
        ) : error ? (
          <p role="alert" className="mt-3 text-sm text-v-danger">{error}</p>
        ) : !overviewEvents.length ? (
          <div className="mt-4 flex flex-col items-center gap-3 py-4 text-center">
            <div>
              <p className="v-body-text">No events yet.</p>
              <p className="v-caption mt-1">Create an event to get started.</p>
            </div>
            <ModuleNavigation create />
          </div>
        ) : (
<<<<<<< HEAD
          <div role="table" aria-label="Your Events" className="mt-3 overflow-hidden rounded-lg border-2 border-v-border-strong text-sm">
            <div role="row" className="v-events-table-header hidden grid-cols-[minmax(0,1fr)_9rem_8rem_5rem] gap-4 border-b-2 border-v-primary-hover bg-v-primary px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm sm:grid sm:px-4">
=======
          <div role="table" aria-label="Your Events" className="mt-3 text-sm">
            <div role="row" className="hidden grid-cols-[minmax(0,1fr)_9rem_8rem_5rem] gap-4 border-b border-v-border pb-2 text-xs font-semibold uppercase tracking-wide text-v-text-subtle sm:grid">
>>>>>>> main
              {['Event', 'Type', 'Status', 'Action'].map((label) => (
                <span key={label} role="columnheader" className="flex items-center font-bold text-white">{label}</span>
              ))}
            </div>
            {overviewEvents.map((event) => {
              const module = moduleFor(event)
              return (
                <div key={event.id} role="row" className="grid min-w-0 grid-cols-2 items-center gap-x-3 gap-y-2 border-b border-v-border-strong px-3 py-2.5 transition-colors last:border-b-0 hover:bg-v-surface-elevated/70 sm:min-h-14 sm:grid-cols-[minmax(0,1fr)_9rem_8rem_5rem] sm:gap-4 sm:px-4">
                  <div role="cell" className="col-span-2 min-w-0 break-words text-[.875rem] font-medium leading-5 text-v-text sm:col-span-1">{event.title}</div>
                  <div role="cell" className="text-v-text-muted">
                    <span className="mr-2 text-[.7rem] font-semibold uppercase tracking-wide text-v-text-subtle sm:hidden">Type</span>
                    {EVENT_TYPE_META[event.eventType]?.label ?? event.eventType}
                  </div>
                  <div role="cell">
<<<<<<< HEAD
                    <span className="mr-2 text-[.7rem] font-semibold uppercase tracking-wide text-v-text-subtle sm:hidden">Status</span>
                    <Badge tone={event.status === 'active' ? 'success' : event.status === 'cancelled' ? 'danger' : 'default'} className="px-2 py-0.5 text-xs capitalize">
=======
                    <span className="v-caption mr-2 sm:hidden">Status</span>
                    <Badge tone={statusTone(event.status)} dot className="capitalize">
>>>>>>> main
                      {event.status}
                    </Badge>
                  </div>
                  <div role="cell" className="col-span-2 sm:col-span-1">
                    <Link
                      to={`/organizer/${module.key}/events/${event.id}/${module.destination}`}
                      aria-label={`View ${event.title}`}
                      className="v-btn-secondary min-h-8 px-3 py-1 text-sm"
                    >
                      View
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </Card>
  )
}
