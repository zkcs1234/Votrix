import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import { nativeCompetitionService } from '@/services/competition-native.service'
import { isReadOnlyEventStatus } from '@/utils/constants'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import EventListCard, { EventListHeader, EventListSkeleton, EventListEmpty, EventListError } from '@/components/organizer/EventList'
import useCompetitionSync from '@/hooks/useCompetitionSync'
import useLatestRequest from '@/hooks/useLatestRequest'
import { getErrorMessage } from '@/utils/getErrorMessage'
import useDraft from '@/hooks/useDraft'
import DraftBanner from '@/components/organizer/DraftBanner'
import { resolveScaleBounds, scaleBoundsLabel, minorScoreLabel } from '@/utils/scoreScale'

// Native (child) competitions keep their criteria in each child's saved
// configuration and their contestants in the child's entries. The event-level
// foundation route is legacy-only (the backend rejects it for native events
// with "An explicit legacy competition mapping is required"), so the preview
// reads the child data instead and falls back to the legacy foundation only
// when the event has no native children.
function nativeSection(competition, foundation, entries, masters) {
  const configuration = foundation.configuration ?? {}
  const range = (item) => (item.minScore != null && item.maxScore != null ? `${item.minScore}–${item.maxScore}` : null)
  const masterById = new Map(masters.map((m) => [m.id, m]))
  return {
    id: competition.id,
    name: competition.name,
    scoringConfig: configuration.scoringConfig ?? null,
    criteria: (configuration.criteria ?? []).map((c) => ({
      ...c,
      rangeLabel: range(c),
      minorCriteria: (c.minorCriteria ?? []).map((m) => ({ ...m, rangeLabel: range(m) })),
    })),
    contestants: entries.map((entry) => {
      const master = masterById.get(entry.contestant_id) ?? {}
      return { ...master, id: entry.id ?? entry.contestant_id, contestantNumber: master.contestantNumber ?? master.contestant_number ?? entry.entry_number }
    }),
  }
}

async function loadPreviewSections(eventId) {
  // A disabled/unavailable native schema simply means there are no native children.
  const competitions = await nativeCompetitionService.list(eventId).then(({ data }) => data.competitions ?? [], () => [])
  const natives = competitions.filter((c) => c.origin === 'native')
  if (natives.length) {
    const [masters, ...details] = await Promise.all([
      pageantService.listContestants(eventId).then(({ data }) => data.contestants ?? []),
      ...natives.map((c) => Promise.all([nativeCompetitionService.foundation(eventId, c.id), nativeCompetitionService.entries(eventId, c.id)])),
    ])
    return natives.map((c, i) => nativeSection(c, details[i][0].data, details[i][1].data.entries ?? [], masters))
  }
  const { data } = await pageantService.getFoundation(eventId)
  const foundation = data.foundation ?? data
  return [{
    id: 'legacy',
    name: null,
    contestants: foundation.contestants ?? [],
    criteria: foundation.criteria ?? [],
    scoringConfig: foundation.scoringConfig ?? foundation.event?.scoring_config ?? null,
  }]
}

function PreviewSection({ section, showName }) {
  const { criteria, contestants } = section
  const eventBounds = resolveScaleBounds(section.scoringConfig)
  return (
    <div className="space-y-6">
      {showName && <h4 className="text-lg font-semibold text-v-text">{section.name}</h4>}
      <div className="space-y-3">
        <h4 className="font-medium text-v-text">Criteria</h4>
        {criteria.length > 0 ? (
          <div className="space-y-2">
            {criteria.map((c) => {
              const minors = c.minorCriteria ?? []
              return (
                <div key={c.id} className="rounded-xl border border-v-border-strong px-4 py-2.5 bg-v-surface-elevated">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-v-text">{c.name}</span>
                    <span className="text-xs text-v-text-subtle">
                      {c.percentage != null ? `${c.percentage}%` : null}
                      {minors.length === 0 && `${c.percentage != null ? ' · ' : ''}score ${c.rangeLabel ?? scaleBoundsLabel(eventBounds)}`}
                    </span>
                  </div>
                  {minors.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t border-v-border/60 pt-2">
                      {minors.map((m) => (
                        <li key={m.id} className="flex items-center justify-between gap-3 text-xs text-v-text-subtle">
                          <span>{m.name}</span>
                          <span>score {m.rangeLabel ?? minorScoreLabel(m)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-v-text-subtle">No criteria added yet.</p>
        )}
      </div>

      <div className="space-y-3">
        <h4 className="font-medium text-v-text">Contestants</h4>
        {contestants.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {contestants.map((c) => (
              <div key={c.id} className="v-card p-3 text-center">
                {c.photo ? (
                  <img src={c.photo} alt="" className="mb-2 h-24 w-full rounded-lg object-cover" />
                ) : (
                  <div className="mb-2 flex h-24 w-full items-center justify-center rounded-lg bg-v-surface-elevated text-v-text-subtle text-sm">
                    No photo
                  </div>
                )}
                <p className="text-sm font-medium text-v-text">{c.name}</p>
                {(c.contestantNumber ?? c.contestant_number) != null && (
                  <p className="text-xs text-v-text-subtle">#{c.contestantNumber ?? c.contestant_number}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-v-text-subtle">No contestants added yet.</p>
        )}
      </div>
    </div>
  )
}

function ScoringSheetPreviewModal({ eventId, eventTitle, onClose }) {
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const beginRead = useLatestRequest(eventId)

  const load = useCallback(async () => {
    const isCurrent = beginRead()
    setLoading(true); setError(null)
    await loadPreviewSections(eventId)
      .then((next) => { if (isCurrent()) setSections(next) })
      .catch((err) => { if (isCurrent()) setError(getErrorMessage(err, 'Failed to load preview')) })
      .finally(() => { if (isCurrent()) setLoading(false) })
  }, [eventId, beginRead])
  useEffect(() => { void load() }, [load])

  return (
    <div role="dialog" aria-modal="true" aria-label="Scoring sheet preview" className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-v-surface rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto border border-v-border space-y-6">
        <div className="flex items-center justify-between border-b border-v-border pb-3">
          <div>
            <span className="v-caption uppercase tracking-wider text-v-primary font-semibold">Scoring Sheet Preview</span>
            <h3 className="text-xl font-semibold text-v-text">{eventTitle || 'Competition'}</h3>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {loading && (
          <div className="py-12 flex justify-center">
            <LoadingSpinner />
          </div>
        )}

        {error && <div role="alert"><p className="text-sm text-v-danger">{error}</p><Button variant="secondary" onClick={load}>Retry preview</Button></div>}

        {!loading && !error && (
          <div className="space-y-8">
            <p className="text-xs text-v-text-subtle">
              This is a read-only preview of the contestants and criteria judges will score.
            </p>
            {sections.map((section) => (
              <PreviewSection key={section.id} section={section} showName={sections.length > 1 || Boolean(section.name)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CompetitionEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewEventId, setPreviewEventId] = useState(null)
  const [error, setError] = useState('')
  const beginRead = useLatestRequest('competition-events')
  const { hasDraft, draft, deleteDraft } = useDraft('competition')

  const load = useCallback(async () => {
    const isCurrent = beginRead()
    try { const { data } = await pageantService.listEvents(); if (isCurrent()) { setEvents(data.events ?? []); setError('') } }
    catch (err) { if (isCurrent()) setError(getErrorMessage(err, 'Could not load competitions')) }
    finally { if (isCurrent()) setLoading(false) }
  }, [beginRead])

  useEffect(() => {
    load()
  }, [load])

  // Listen for session status changes to update event list
  useCompetitionSync(null, load)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-40 animate-pulse rounded-lg bg-v-surface-elevated" />
        <EventListSkeleton />
      </div>
    )
  }

  const previewEvent = events.find((e) => e.id === previewEventId)

  return (
    <div className="space-y-6">
      {previewEventId && (
        <ScoringSheetPreviewModal
          eventId={previewEventId}
          eventTitle={previewEvent?.title}
          onClose={() => setPreviewEventId(null)}
        />
      )}

      <EventListHeader title="Competitions" newEventPath="/organizer/competition/events/new" />

      {hasDraft && (
        <DraftBanner
          module="competition"
          draft={draft}
          onDelete={deleteDraft}
          newEventPath="/organizer/competition/events/new"
        />
      )}
      {error ? (
        <EventListError message={error} retryLabel="Retry loading competitions" onRetry={load} />
      ) : (
        <div className="space-y-3">
          {events.length === 0 && (
            <EventListEmpty title="No competitions yet." hint="Create an event to begin setup." />
          )}
          {events.map((event) => (
            <EventListCard
              key={event.id}
              module="competition"
              event={event}
              titleHref={`/organizer/competition/events/${event.id}/${event.status === 'draft' ? 'workspace' : isReadOnlyEventStatus(event.status) ? 'rankings' : 'live'}`}
              editHref={`/organizer/competition/events/${event.id}/edit`}
              continueSetupHref={`/organizer/competition/events/${event.id}/workspace`}
              actions={
                <>
                  <Button variant="secondary" onClick={() => setPreviewEventId(event.id)}>
                    <Eye className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    Preview
                  </Button>
                  {event.status !== 'draft' && !isReadOnlyEventStatus(event.status) && (
                    <Link
                      to={`/organizer/competition/events/${event.id}/live`}
                      className="v-btn-secondary"
                    >
                      Live Control
                    </Link>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
