import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { voterService } from '@/services/voter.service'
import usePortalList from '@/hooks/usePortalList'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import useCompetitionSync from '@/hooks/useCompetitionSync'
import { participantKind } from '@/utils/workspace'
import PageHeader from '@/components/ui/PageHeader'
import Tabs from '@/components/ui/Tabs'
import SearchInput from '@/components/ui/SearchInput'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import FormAlert from '@/components/ui/FormAlert'
import { SkeletonEventCard } from '@/components/ui/Skeleton'
import VoterEventCard from '@/components/voter/VoterEventCard'

const TYPE_TABS = {
  student: [
    { value: 'all', label: 'All types' },
    { value: 'election', label: 'Elections' },
    { value: 'poll', label: 'Polls' },
  ],
  // A judge only has competitions, so there is nothing to filter by type.
  judge: [],
  participant: [
    { value: 'all', label: 'All types' },
    { value: 'election', label: 'Elections' },
    { value: 'poll', label: 'Polls' },
    { value: 'competition', label: 'Competitions' },
  ],
}

function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// Things the participant can act on: active and upcoming events. Anything they
// finished or missed lives in History.
export default function ParticipantEventsPage() {
  const { user } = useAuth()
  const kind = participantKind(user)
  const typeTabs = TYPE_TABS[kind]

  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search.trim())

  const list = usePortalList(voterService.getEvents, {
    bucket: status === 'all' ? undefined : status,
    type: type === 'all' ? undefined : type,
    search: debouncedSearch || undefined,
    limit: 12,
  })

  useSocketEvent('election:voting-toggled', list.reload)
  useSocketEvent('poll:polling-toggled', list.reload)
  useCompetitionSync(null, list.reload)

  const counts = list.meta?.counts ?? { active: 0, assigned: 0 }
  const filtering = status !== 'all' || type !== 'all' || Boolean(debouncedSearch)

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="My events" description="Events you can act on now or soon. Finished events are in History." />

      <div className="flex flex-col gap-3">
        <Tabs
          variant="segmented"
          label="Event status"
          value={status}
          onChange={setStatus}
          tabs={[
            { value: 'all', label: 'All', count: counts.active + counts.assigned },
            { value: 'active', label: 'Active', count: counts.active },
            { value: 'assigned', label: 'Upcoming', count: counts.assigned },
          ]}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {typeTabs.length > 0 && (
            <Tabs variant="segmented" label="Event type" value={type} onChange={setType} tabs={typeTabs} />
          )}
          <SearchInput placeholder="Search events or organizations" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
        </div>
      </div>

      {list.error ? (
        <div className="space-y-3">
          <FormAlert variant="error">{list.error}</FormAlert>
          <Button onClick={list.reload}>Retry</Button>
        </div>
      ) : list.loading ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading events">
          {[1, 2, 3].map((i) => (
            <li key={i}><SkeletonEventCard /></li>
          ))}
        </ul>
      ) : list.items.length === 0 ? (
        <Card padding="sm" className="text-center">
          <p className="text-sm font-medium text-v-text">{filtering ? 'No events match these filters' : 'No events to act on'}</p>
          <p className="v-caption mt-1">
            {filtering ? 'Try a different filter or clear the search.' : 'Events appear here when an organizer enrolls you.'}
          </p>
        </Card>
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.items.map((event) => (
              <li key={event.dashboardKey ?? `${event.eventType}-${event.id}`}>
                <VoterEventCard event={event} />
              </li>
            ))}
          </ul>
          {list.hasMore && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={list.loadMore} loading={list.loadingMore}>Load more</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
