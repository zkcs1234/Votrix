import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Play, Pause, Square, RefreshCw, Users, Star, CheckCircle, Clock, LockOpen,
} from 'lucide-react'
import { competitionSessionService } from '@/services/competition-session.service.js'
import { pageantService } from '@/services/pageant.service.js'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

const SESSION_STATUS = {
  IDLE: 'idle',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
}

export default function CompetitionLiveControlPage() {
  const { eventId } = useParams()
  const { success, error: toastError } = useToast()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  // Whole-round progress matrix: { judges, contestants, submitted:[{judgeId,contestantId,submittedAt}] }
  const [judgeProgress, setJudgeProgress] = useState(null)
  const [event, setEvent] = useState(null)
  const [eventStatus, setEventStatus] = useState(null)
  const [foundation, setFoundation] = useState(null)

  // Phase 6 — round finalize & advancement review modal.
  const [finalizeRoundId, setFinalizeRoundId] = useState(null)
  const [finalizePreview, setFinalizePreview] = useState(null)
  const [finalizeChecked, setFinalizeChecked] = useState(() => new Set())
  const [finalizeLoading, setFinalizeLoading] = useState(false)
  const [finalizeSubmitting, setFinalizeSubmitting] = useState(false)

  const showLoader = useDelayedLoading(loading, 300)

  const loadSession = useCallback(async () => {
    try {
      const [{ data: sessionData }, { data: foundationData }, { data: eventData }] = await Promise.all([
        competitionSessionService.getActiveSession(eventId).catch(() => ({ data: {} })),
        pageantService.getFoundation(eventId).catch(() => ({ data: {} })),
        pageantService.getEvent(eventId).catch(() => ({ data: {} })),
      ])

      setSession(sessionData.session || null)
      setEvent(sessionData.event || eventData.event || null)
      setEventStatus(eventData.event?.status ?? null)
      setFoundation(foundationData.foundation || null)

      if (sessionData.session?.status === SESSION_STATUS.ACTIVE || sessionData.session?.status === SESSION_STATUS.PAUSED) {
        const { data: progressData } = await competitionSessionService.getJudgeProgress(eventId)
        setJudgeProgress(progressData)
      }
    } catch {
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  const refreshJudgeProgress = useCallback(async () => {
    try {
      const { data } = await competitionSessionService.getJudgeProgress(eventId)
      setJudgeProgress(data)
    } catch {
      /* progress refresh is best-effort */
    }
  }, [eventId])

  // Real-time WebSocket subscriptions. Event names MUST match what the backend
  // emits (previously these listened for 'session:state-changed' /
  // 'session:judge-submitted', which the backend never sends, so live updates
  // silently never fired and the page relied on manual refresh). The organizer
  // is auto-joined to the event rooms on socket connect (see ws-server setupRooms).
  useSocketEvent('session:status-changed', () => loadSession(), [loadSession])
  useSocketEvent('session:contestant-changed', () => loadSession(), [loadSession])
  useSocketEvent('session:round-changed', () => loadSession(), [loadSession])
  useSocketEvent('session:active-criteria-changed', () => loadSession(), [loadSession])
  useSocketEvent('session:division-changed', () => loadSession(), [loadSession])
  useSocketEvent('session:judge-score-submitted', () => refreshJudgeProgress(), [refreshJudgeProgress])

  // Actions
  const performAction = async (action, actionName) => {
    setActionLoading(actionName)
    try {
      const actions = {
        start: () => competitionSessionService.startSession(eventId),
        pause: () => competitionSessionService.pauseSession(eventId),
        resume: () => competitionSessionService.resumeSession(eventId),
        complete: () => competitionSessionService.completeSession(eventId),
      }
      await actions[action]()
      await loadSession()
      const successMessages = {
        start: 'Scoring session started',
        pause: 'Session paused',
        resume: 'Session resumed',
        complete: 'Session completed',
      }
      if (successMessages[action]) success(successMessages[action])
    } catch (err) {
      toastError(getErrorMessage(err))
    } finally {
      setActionLoading(null)
    }
  }

  const setActiveRound = async (roundId) => {
    setActionLoading('setRound')
    try {
      await competitionSessionService.setActiveRound(eventId, roundId)
      await loadSession()
      success('Active round updated')
    } catch (err) {
      toastError(getErrorMessage(err))
    } finally {
      setActionLoading(null)
    }
  }

  // Open/close a criterion for scoring in the current round. We always send the
  // explicit list of currently-open criteria (flipping the toggled one) so we
  // never depend on the "empty = all open" default.
  const toggleCriterion = async (criteriaId) => {
    const crits = session?.criteriaControl ?? []
    const nextActive = crits
      .filter((c) => (c.id === criteriaId ? !c.active : c.active))
      .map((c) => c.id)
    setActionLoading('setCriteria')
    try {
      await competitionSessionService.setActiveCriteria(eventId, nextActive)
      await loadSession()
    } catch (err) {
      toastError(getErrorMessage(err))
    } finally {
      setActionLoading(null)
    }
  }

  // B5 — reopen a locked contestant so judges can revise (all judges, or one).
  const unlockContestant = async (contestantId, judgeId = null) => {
    setActionLoading(`unlock:${contestantId}:${judgeId ?? 'all'}`)
    try {
      await competitionSessionService.unlockScore(eventId, contestantId, judgeId)
      await refreshJudgeProgress()
      success('Score reopened for editing')
    } catch (err) {
      toastError(getErrorMessage(err))
    } finally {
      setActionLoading(null)
    }
  }

  const performActionDivision = async (divisionId) => {
    setActionLoading('setDivision')
    try {
      await competitionSessionService.setActiveDivision(eventId, divisionId)
      await loadSession()
    } catch (err) {
      toastError(getErrorMessage(err))
    } finally {
      setActionLoading(null)
    }
  }

  // Phase 6 — open the finalize review modal for a round.
  const openFinalize = async (roundId) => {
    setFinalizeRoundId(roundId)
    setFinalizePreview(null)
    setFinalizeLoading(true)
    try {
      const { data } = await competitionSessionService.previewRoundAdvancement(eventId, roundId)
      setFinalizePreview(data)
      setFinalizeChecked(new Set(data.standing.filter((s) => s.qualified).map((s) => s.contestantId)))
    } catch (err) {
      toastError(getErrorMessage(err))
      setFinalizeRoundId(null)
    } finally {
      setFinalizeLoading(false)
    }
  }

  const toggleFinalizeChecked = (contestantId) => {
    setFinalizeChecked((prev) => {
      const next = new Set(prev)
      if (next.has(contestantId)) next.delete(contestantId)
      else next.add(contestantId)
      return next
    })
  }

  const closeFinalize = () => {
    setFinalizeRoundId(null)
    setFinalizePreview(null)
    setFinalizeChecked(new Set())
  }

  const confirmFinalize = async () => {
    if (!finalizePreview) return
    // Compute overrides relative to the auto-selected qualifiers.
    const add = []
    const remove = []
    for (const s of finalizePreview.standing) {
      const checked = finalizeChecked.has(s.contestantId)
      if (checked && !s.qualified) add.push(s.contestantId)
      if (!checked && s.qualified) remove.push(s.contestantId)
    }
    const isRecompute = Boolean(finalizePreview.finalized)
    setFinalizeSubmitting(true)
    try {
      const { data } = await competitionSessionService.finalizeRound(
        eventId,
        finalizeRoundId,
        { add, remove },
        isRecompute, // force = re-finalize to refresh a frozen snapshot
      )
      closeFinalize()
      await loadSession()
      success(
        isRecompute
          ? `Round "${data.roundName}" standings recomputed with the current scores.`
          : `Round "${data.roundName}" finalized. ${data.qualifiers.length} qualifier(s)` +
              (data.nextRoundName ? ` seeded into "${data.nextRoundName}".` : '.'),
      )
    } catch (err) {
      toastError(getErrorMessage(err))
    } finally {
      setFinalizeSubmitting(false)
    }
  }

  if (loading && !showLoader) return null

  if (loading || showLoader) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  const status = session?.status ?? SESSION_STATUS.IDLE

  // No session exists — show start view
  if (status === SESSION_STATUS.IDLE || !session) {
    return (
      <div className="space-y-6">
        <PageHeader eventId={eventId} title={event?.title ?? 'Competition Live Control'} />
        <NoSessionView
          onStart={() => performAction('start', 'start')}
          actionLoading={actionLoading}
          isDraft={eventStatus === 'draft'}
        />
      </div>
    )
  }

  // Completed session
  if (status === SESSION_STATUS.COMPLETED) {
    return (
      <div className="space-y-6">
        <PageHeader eventId={eventId} title={event?.title ?? 'Competition Live Control'} />
        <CompletedSessionView session={session} onStart={() => performAction('start', 'start')} actionLoading={actionLoading} />
      </div>
    )
  }

  // Active or Paused session
  return (
    <div className="space-y-6">
      <PageHeader eventId={eventId} title={event?.title ?? 'Competition Live Control'} />

      {/* Session Status Bar */}
      <div className="flex items-center justify-between rounded-xl border border-v-border bg-v-surface-elevated px-6 py-4">
        <div className="flex items-center gap-4">
          <Badge
            variant={
              status === SESSION_STATUS.ACTIVE
                ? 'success'
                : status === SESSION_STATUS.PAUSED
                  ? 'warning'
                  : 'default'
            }
          >
            {status === SESSION_STATUS.ACTIVE ? 'LIVE' : status === SESSION_STATUS.PAUSED ? 'PAUSED' : 'COMPLETED'}
          </Badge>
          <div className="text-sm text-v-text-muted">
            <span className="font-medium text-v-text">Session started:</span>{' '}
            {new Date(session.startedAt).toLocaleTimeString()}
          </div>
        </div>
        <div className="flex gap-2">
          {status === SESSION_STATUS.ACTIVE && (
            <Button size="sm" variant="secondary" onClick={() => performAction('pause', 'pause')} loading={actionLoading === 'pause'}>
              <Pause className="h-4 w-4 mr-1" /> Pause
            </Button>
          )}
          {status === SESSION_STATUS.PAUSED && (
            <Button size="sm" onClick={() => performAction('resume', 'resume')} loading={actionLoading === 'resume'}>
              <Play className="h-4 w-4 mr-1" /> Resume
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={() => performAction('complete', 'complete')} loading={actionLoading === 'complete'}>
            <Square className="h-4 w-4 mr-1" /> End Session
          </Button>
        </div>
      </div>

      {/* Current Stage & Contestant */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Current Round/Stage */}
        <div className="rounded-xl border border-v-border bg-v-surface p-6 flex flex-col gap-4">
          <div>
            <h3 className="mb-1 text-sm font-medium text-v-text-muted uppercase tracking-wider">Current Stage</h3>
            <div className="mb-2">
              <p className="text-xl font-bold text-v-text">
                {session.hasRounds
                  ? (session.activeRound?.name ?? 'No round active')
                  : 'Criteria scoring'}
              </p>
              <p className="text-sm text-v-text-subtle">
                {(session.activeRound?.contestants?.length ?? session.roundContestants?.length ?? 0)} contestants
                {' · '}
                {session.criteriaControl?.length ?? 0} criteria
              </p>
            </div>
            
            {foundation?.event?.divisions_enabled && (
              <div className="mt-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-v-primary/10 px-2 py-1 text-xs font-medium text-v-primary">
                  Division: {session.activeDivisionId ? foundation?.divisions?.find(d => d.id === session.activeDivisionId)?.name : 'Event-wide'}
                </span>
              </div>
            )}
          </div>

          <div className="mt-auto grid gap-4 pt-4 border-t border-v-border">
            {foundation?.event?.divisions_enabled && foundation?.divisions?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-v-text-subtle mb-1">Switch division:</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => performActionDivision(null)}
                    disabled={actionLoading === 'setDivision'}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      !session.activeDivisionId
                        ? 'bg-v-primary text-white'
                        : 'border border-v-border text-v-text-muted hover:bg-v-surface-elevated'
                    }`}
                  >
                    Event-wide
                  </button>
                  {foundation.divisions.map((div) => (
                    <button
                      key={div.id}
                      type="button"
                      onClick={() => performActionDivision(div.id)}
                      disabled={actionLoading === 'setDivision'}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        session.activeDivisionId === div.id
                          ? 'bg-v-primary text-white'
                          : 'border border-v-border text-v-text-muted hover:bg-v-surface-elevated'
                      }`}
                    >
                      {div.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {session.availableRounds?.length > 1 && (
              <div className="space-y-1">
                <p className="text-xs text-v-text-subtle mb-1">Switch round:</p>
                <div className="flex flex-wrap gap-2">
                  {session.availableRounds.map((round) => (
                    <button
                      key={round.id}
                      type="button"
                      onClick={() => setActiveRound(round.id)}
                      disabled={actionLoading === 'setRound'}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        session.activeRound?.id === round.id
                          ? 'bg-v-primary text-white'
                          : 'border border-v-border text-v-text-muted hover:bg-v-surface-elevated'
                      }`}
                    >
                      {round.name}
                      {round.isOpen ? '' : ' (closed)'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Which criteria are open for scoring. Works with rounds (the
                active round's criteria) or without (event-wide criteria). Judges
                only see open criteria; opening one exposes its minor criteria. */}
            {session.criteriaControl?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-v-text-subtle mb-1">Criteria open for scoring:</p>
                <div className="flex flex-wrap gap-2">
                  {session.criteriaControl.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCriterion(c.id)}
                      disabled={actionLoading === 'setCriteria'}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                        c.active
                          ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border border-v-border text-v-text-subtle hover:bg-v-surface-elevated'
                      }`}
                      title={
                        c.active
                          ? 'Open — judges can score this. Click to close.'
                          : 'Closed — hidden from judges. Click to open.'
                      }
                    >
                      {c.active ? '● ' : '○ '}
                      {c.name}
                      {c.minors?.length ? (
                        <span className="ml-1 opacity-70">({c.minors.length})</span>
                      ) : null}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-v-text-subtle">
                  Judges only see open criteria. The number is how many minor criteria it holds.
                </p>
              </div>
            )}

            {/* Phase 6 — finalize the active round & advance qualifiers.
                Once finalized, the same control re-opens to RECOMPUTE the frozen
                standings snapshot (e.g. after a scoring fix). */}
            {session.activeRound?.id && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => openFinalize(session.activeRound.id)}
                  disabled={finalizeLoading}
                  className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
                >
                  {finalizeLoading
                    ? 'Loading…'
                    : session.activeRound.finalized
                      ? 'Recompute finalized standings'
                      : 'Finalize round & advance'}
                </button>
                <p className="text-[11px] text-v-text-subtle">
                  {session.activeRound.finalized
                    ? 'This round is finalized. Recompute to refresh its saved standings with the current scores.'
                    : "Snapshots this round's standing and seeds qualifiers into the next round. Review before confirming."}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Round field — the whole round is on stage; judges score every
            contestant from one sheet. Read-only roster (no per-contestant
            control: the organizer drives rounds & criteria, not contestants). */}
        <div className="rounded-xl border border-v-border bg-v-surface p-6">
          <h3 className="mb-1 text-sm font-medium text-v-text-muted uppercase tracking-wider">
            On stage this round
          </h3>
          <p className="mb-3 text-sm text-v-text-subtle">
            {(session.roundContestants?.length ?? 0) > 0
              ? `All ${session.roundContestants.length} contestants in ${session.activeRound?.name ?? 'this round'} are on judges’ scoresheets.`
              : 'No contestants assigned to this round yet.'}
          </p>
          {session.roundContestants?.length > 0 && (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {session.roundContestants.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg border border-v-border bg-v-surface-elevated/40 px-3 py-2"
                >
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-v-surface px-1.5 text-sm font-bold tabular-nums text-v-text border border-v-border">
                    #{c.contestantNumber}
                  </span>
                  {c.photo && (
                    <img src={c.photo} alt="" className="h-8 w-8 rounded-lg object-cover" />
                  )}
                  <span className="min-w-0 truncate text-sm font-medium text-v-text">{c.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Judge Progress — whole-round contestant × judge matrix. A locked cell
          can be reopened (B5) so the judge can revise; every unlock is audited. */}
      <JudgeProgressGrid
        progress={judgeProgress}
        onUnlock={unlockContestant}
        actionLoading={actionLoading}
      />


      {/* Phase 6 — finalize round & advancement review modal */}
      {finalizeRoundId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-v-border bg-v-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-v-border px-5 py-3">
              <h3 className="text-sm font-semibold text-v-text">
                Finalize {finalizePreview?.roundName ?? 'round'}
              </h3>
              <button
                type="button"
                onClick={closeFinalize}
                className="text-v-text-muted hover:text-v-text"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              {finalizeLoading || !finalizePreview ? (
                <p className="text-sm text-v-text-muted">Loading standing…</p>
              ) : (
                <>
                  <p className="mb-3 text-xs text-v-text-subtle">
                    Advancement: <span className="text-v-text">{finalizePreview.advancementType}</span>
                    {finalizePreview.advancementValue != null && ` (${finalizePreview.advancementValue})`}
                    {' · '}Policy: <span className="text-v-text">{finalizePreview.scorePolicy}</span>
                    {finalizePreview.nextRoundName
                      ? ` · Next: ${finalizePreview.nextRoundName}`
                      : ' · No next round'}
                  </p>
                  <p className="mb-2 text-xs text-v-text-muted">
                    Check who advances ({finalizeChecked.size} selected). Auto-selected can be overridden.
                  </p>
                  <ul className="space-y-1">
                    {finalizePreview.standing.map((s) => (
                      <li
                        key={s.contestantId}
                        className="flex items-center justify-between rounded-lg border border-v-border px-3 py-2 text-sm"
                      >
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={finalizeChecked.has(s.contestantId)}
                            onChange={() => toggleFinalizeChecked(s.contestantId)}
                          />
                          <span className="text-v-text">
                            #{s.rank} {s.contestantName}
                          </span>
                        </label>
                        <span className="text-xs text-v-text-subtle">{Number(s.score).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-v-border px-5 py-3">
              <Button variant="outline" onClick={closeFinalize} disabled={finalizeSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={confirmFinalize}
                disabled={finalizeSubmitting || finalizeLoading || !finalizePreview}
              >
                {finalizeSubmitting
                  ? 'Working…'
                  : finalizePreview?.finalized
                    ? 'Recompute standings'
                    : 'Finalize & advance'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// Whole-round progress: rows = contestants, columns = judges. A locked cell
// shows a check + an unlock control; an empty cell means that judge still owes a
// score for that contestant. A row-level "Reopen" unlocks every judge at once.
function JudgeProgressGrid({ progress, onUnlock, actionLoading }) {
  const judges = progress?.judges ?? []
  const contestants = progress?.contestants ?? []
  const submitted = progress?.submitted ?? []

  const lockedSet = new Set(submitted.map((s) => `${s.judgeId}:${s.contestantId}`))
  const totalCells = judges.length * contestants.length
  const lockedCount = submitted.length

  return (
    <div className="rounded-xl border border-v-border bg-v-surface p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-v-text-muted uppercase tracking-wider">Judge Progress</h3>
        {totalCells > 0 && (
          <span className="text-xs text-v-text-subtle">
            {lockedCount}/{totalCells} scores locked
          </span>
        )}
      </div>

      {judges.length === 0 || contestants.length === 0 ? (
        <p className="text-sm text-v-text-subtle">
          {judges.length === 0
            ? 'No eligible judges for the current round/division yet.'
            : 'No contestants in the current round yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-v-border">
                <th className="sticky left-0 z-10 bg-v-surface py-2 pr-4 text-left font-medium text-v-text-muted">
                  Contestant
                </th>
                {judges.map((j) => (
                  <th key={j.judgeId} className="px-2 py-2 text-center font-medium text-v-text-muted">
                    <span className="block max-w-24 truncate">{j.displayName || 'Judge'}</span>
                  </th>
                ))}
                <th className="py-2 pl-2 text-right font-medium text-v-text-muted">Done</th>
              </tr>
            </thead>
            <tbody>
              {contestants.map((c) => {
                const rowLocked = judges.filter((j) => lockedSet.has(`${j.judgeId}:${c.id}`)).length
                const rowBusy = actionLoading === `unlock:${c.id}:all`
                return (
                  <tr key={c.id} className="border-b border-v-border/50">
                    <td className="sticky left-0 z-10 bg-v-surface py-2 pr-4 text-v-text">
                      <span className="font-medium tabular-nums">#{c.contestantNumber}</span> {c.name}
                    </td>
                    {judges.map((j) => {
                      const locked = lockedSet.has(`${j.judgeId}:${c.id}`)
                      const cellBusy = actionLoading === `unlock:${c.id}:${j.judgeId}`
                      return (
                        <td key={j.judgeId} className="px-2 py-2 text-center">
                          {locked ? (
                            <button
                              type="button"
                              onClick={() => onUnlock(c.id, j.judgeId)}
                              disabled={cellBusy || rowBusy}
                              title="Locked — click to reopen this judge's score"
                              className="group inline-flex items-center justify-center rounded-md p-1 text-v-success hover:bg-amber-500/10 hover:text-amber-400 disabled:opacity-50"
                            >
                              <CheckCircle className="h-4 w-4 group-hover:hidden" />
                              <LockOpen className="hidden h-4 w-4 group-hover:block" />
                            </button>
                          ) : (
                            <span className="inline-flex items-center justify-center text-v-text-subtle" title="Waiting">
                              <Clock className="h-4 w-4" />
                            </span>
                          )}
                        </td>
                      )
                    })}
                    <td className="py-2 pl-2 text-right">
                      <span className={rowLocked === judges.length ? 'text-v-success' : 'text-v-text-subtle'}>
                        {rowLocked}/{judges.length}
                      </span>
                      {rowLocked > 0 && (
                        <button
                          type="button"
                          onClick={() => onUnlock(c.id, null)}
                          disabled={rowBusy}
                          className="ml-2 rounded-md border border-v-border px-2 py-0.5 text-[11px] text-v-text-muted hover:bg-amber-500/10 hover:text-amber-400 disabled:opacity-50"
                        >
                          {rowBusy ? '…' : 'Reopen'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-v-text-subtle">
            Reopening a locked score is audited and lets that judge revise and re-submit.
          </p>
        </div>
      )}
    </div>
  )
}

function PageHeader({ eventId, title }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold text-v-text">Live Competition Control</h2>
        <p className="mt-1 text-sm text-v-text-subtle">{title}</p>
      </div>
      <div className="flex gap-2 text-sm">
        <Link
          to={`/organizer/competition/events/${eventId}/contestants`}
          className="rounded-lg border border-v-border px-3 py-1.5 text-v-text-muted hover:bg-v-surface-elevated"
        >
          <Users className="h-4 w-4 inline mr-1" /> Contestants
        </Link>
        <Link
          to={`/organizer/competition/events/${eventId}/judges`}
          className="rounded-lg border border-v-border px-3 py-1.5 text-v-text-muted hover:bg-v-surface-elevated"
        >
          <Star className="h-4 w-4 inline mr-1" /> Judges
        </Link>
        <Link
          to={`/organizer/competition/events/${eventId}/rankings`}
          className="rounded-lg border border-v-border px-3 py-1.5 text-v-text-muted hover:bg-v-surface-elevated"
        >
          Rankings
        </Link>
      </div>
    </div>
  )
}

function NoSessionView({ onStart, actionLoading, isDraft = false }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-v-border px-6 py-16 text-center">
      <Play className="mb-4 h-12 w-12 text-v-text-subtle" />
      <h3 className="text-lg font-semibold text-v-text">No Active Session</h3>
      <p className="mt-2 mb-6 max-w-md text-sm text-v-text-muted">
        Start a live competition session to control the flow of rounds and contestants in real time.
        Judges will automatically see only the active round and current contestant.
      </p>
      {isDraft && (
        <p className="mb-4 max-w-md text-sm text-v-warning">
          This event is still in setup. Publish it from the Judges page before starting a live session.
        </p>
      )}
      <Button onClick={onStart} loading={actionLoading === 'start'} size="lg" disabled={isDraft}>
        <Play className="h-4 w-4 mr-2" /> Start Live Session
      </Button>
    </div>
  )
}

function CompletedSessionView({ session, onStart, actionLoading }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-v-border px-6 py-16 text-center">
      <CheckCircle className="mb-4 h-12 w-12 text-v-success" />
      <h3 className="text-lg font-semibold text-v-text">Session Completed</h3>
      <p className="mt-2 mb-2 text-sm text-v-text-muted">
        The live competition session has ended. All scores are locked.
      </p>
      <p className="mb-6 text-xs text-v-text-subtle">
        Started: {new Date(session.startedAt).toLocaleString()} · Completed:{' '}
        {session.completedAt ? new Date(session.completedAt).toLocaleString() : '—'}
      </p>
      <div className="flex gap-3">
        <Button onClick={onStart} loading={actionLoading === 'start'}>
          <RefreshCw className="h-4 w-4 mr-2" /> Start New Session
        </Button>
      </div>
    </div>
  )
}

