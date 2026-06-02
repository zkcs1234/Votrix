import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import { SkeletonList } from '@/components/ui/Skeleton'
import Button from '@/components/ui/Button'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useOptimistic } from '@/hooks/useOptimistic'

function EventCard({ event, onToggleVoting }) {
  const [toggling, setToggling] = useState(false)

  const handleToggle = async () => {
    setToggling(true)
    try {
      await onToggleVoting(event)
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-v-border bg-v-surface p-5">
      <div>
        <Link
          to={`/organizer/election/events/${event.id}/positions`}
          className="text-lg font-medium text-v-text hover:text-v-text-muted"
        >
          {event.title}
        </Link>
        <p className="mt-1 text-sm text-v-text-subtle">{event.status}</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleToggle}
          disabled={toggling}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            event.votingEnabled
              ? 'border border-red-800 text-v-danger hover:bg-red-950'
              : 'border border-emerald-800 text-emerald-300 hover:bg-emerald-950'
          } disabled:opacity-50`}
        >
          {toggling
            ? event.votingEnabled
              ? 'Closing...'
              : 'Opening...'
            : event.votingEnabled
              ? 'Close voting'
              : 'Open voting'}
        </button>
        <Link
          to={`/organizer/election/events/${event.id}/edit`}
          className="rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated"
        >
          Edit
        </Link>
      </div>
    </div>
  )
}

function EventCardSkeleton() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-v-border bg-v-surface p-5">
      <div className="space-y-2">
        <div className="h-5 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="h-4 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
      </div>
      <div className="flex gap-2">
        <div className="h-7 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="h-7 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
      </div>
    </div>
  )
}

export default function ElectionEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Use delayed loading
  const showLoader = useDelayedLoading(loading, 300)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await electionService.listEvents()
      setEvents(data.events ?? [])
      setError(null)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load events')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Optimistic toggle - update UI immediately, rollback on error
  const handleToggleVoting = useCallback(
    async (event) => {
      const previousEvents = [...events]
      const previousEvent = events.find((e) => e.id === event.id)

      // Optimistically update UI
      setEvents((prev) =>
        prev.map((e) =>
          e.id === event.id ? { ...e, votingEnabled: !e.votingEnabled } : e
        )
      )

      try {
        await electionService.setVoting(event.id, !event.votingEnabled)
      } catch (err) {
        // Rollback on error
        setEvents(previousEvents)
        throw err
      }
    },
    [events]
  )

  // Show nothing under 300ms
  if (loading && !showLoader) {
    return null
  }

  // Show skeleton after 300ms
  if (loading || showLoader) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-7 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
          <div className="h-9 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>

        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-v-text">Events</h2>
        <Link
          to="/organizer/election/events/new"
          className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white hover:bg-v-primary-hover"
        >
          New event
        </Link>
      </div>

      <div className="space-y-3">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onToggleVoting={handleToggleVoting}
          />
        ))}
        {!events.length && <p className="text-v-text-subtle">No events yet.</p>}
      </div>
    </div>
  )
}