import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Play, Pause, SkipForward, SkipBack, Square, RefreshCw, Users, Star, CheckCircle, Clock,
} from 'lucide-react'
import { competitionSessionService } from '@/services/competition-session.service.js'
import { pageantService } from '@/services/pageant.service.js'
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
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [judgeProgress, setJudgeProgress] = useState([])
  const [event, setEvent] = useState(null)
  const [foundation, setFoundation] = useState(null)

  // Phase 6 — round finalize & advancement review modal.
  const [finalizeRoundId, setFinalizeRoundId] = useState(null)
  const [finalizePreview, setFinalizePreview] = useState(null)
  const [finalizeChecked, setFinalizeChecked] = useState(() => new Set())
  const [finalizeLoading, setFinalizeLoading] = useState(false)
  const [finalizeSubmitting, setFinalizeSubmitting] = useState(false)

  // Stage-group builder (simultaneous multi-contestant scoring). Selection is
  // seeded from whatever group is currently on stage.
  const [stageSel, setStageSel] = useState(() => new Set())

  const showLoader = useDelayedLoading(loading, 300)

  const loadSession = useCallback(async () => {
    try {
      const [{ data: sessionData }, { data: foundationData }] = await Promise.all([
        competitionSessionService.getActiveSession(eventId).catch(() => ({ data: {} })),
        pageantService.getFoundation(eventId).catch(() => ({ data: {} }))
      ])
      
      setSession(sessionData.session || null)
      setEvent(sessionData.event || null)
      setFoundation(foundationData.foundation || null)

      if (sessionData.session?.status === SESSION_STATUS.ACTIVE || sessionData.session?.status === SESSION_STATUS.PAUSED) {
        const { data: progressData } = await competitionSessionService.getJudgeProgress(eventId)
        setJudgeProgress(progressData.judges ?? [])
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

  const stageGroupKey = (session?.stageContestants ?? []).map((c) => c.id).join(',')
  useEffect(() => {
    setStageSel(new Set((session?.stageContestants ?? []).map((c) => c.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageGroupKey])

  const applyStageGroup = async (ids) => {
    setActionLoading('stageGroup')
    try {
      await competitionSessionService.setStageGroup(eventId, ids)
      await loadSession()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update stage group')
    } finally {
      setActionLoading(null)
    }
  }

  const refreshJudgeProgress = useCallback(async () => {
    try {
      const { data } = await competitionSessionService.getJudgeProgress(eventId)
      setJudgeProgress(data.judges ?? [])
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
        nextContestant: () => competitionSessionService.nextContestant(eventId),
        prevContestant: () => competitionSessionService.previousContestant(eventId),
      }
      await actions[action]()
      await loadSession()
    } catch (err) {
      alert(err.response?.data?.message || `Failed to ${actionName}`)
    } finally {
      setActionLoading(null)
    }
  }

  const setActiveRound = async (roundId) => {
    setActionLoading('setRound')
    try {
      await competitionSessionService.setActiveRound(eventId, roundId)
      await loadSession()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to set active round')
    } finally {
      setActionLoading(null)
    }
  }

  const selectContestant = async (contestantId) => {
    if (!contestantId) return
    setActionLoading('setContestant')
    try {
      await competitionSessionService.setActiveContestant(eventId, contestantId)
      await loadSession()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to select contestant')
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
      alert(err.response?.data?.message || 'Failed to set active division')
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
      alert(err.response?.data?.message || 'Failed to load advancement preview')
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
    setFinalizeSubmitting(true)
    try {
      const { data } = await competitionSessionService.finalizeRound(eventId, finalizeRoundId, { add, remove })
      closeFinalize()
      await loadSession()
      alert(
        `Round "${data.roundName}" finalized. ${data.qualifiers.length} qualifier(s)` +
          (data.nextRoundName ? ` seeded into "${data.nextRoundName}".` : '.'),
      )
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to finalize round')
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
        <NoSessionView onStart={() => performAction('start', 'start')} actionLoading={actionLoading} />
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
              <p className="text-xl font-bold text-v-text">{session.activeRound?.name ?? 'No round active'}</p>
              <p className="text-sm text-v-text-subtle">
                {session.activeRound?.contestants?.length ?? 0} contestants · {session.activeRound?.criteria?.length ?? 0} criteria
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

            {/* Phase 6 — finalize the active round & advance qualifiers */}
            {session.activeRound?.id && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => openFinalize(session.activeRound.id)}
                  disabled={finalizeLoading}
                  className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
                >
                  {finalizeLoading ? 'Loading…' : 'Finalize round & advance'}
                </button>
                <p className="text-[11px] text-v-text-subtle">
                  Snapshots this round's standing and seeds qualifiers into the next round. Review before confirming.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Current Contestant */}
        <div className="rounded-xl border border-v-border bg-v-surface p-6">
          <h3 className="mb-1 text-sm font-medium text-v-text-muted uppercase tracking-wider">Current Contestant</h3>
          {session.activeContestant ? (
            <div className="flex items-center gap-4">
              {session.activeContestant.photo && (
                <img src={session.activeContestant.photo} alt="" className="h-16 w-16 rounded-xl object-cover" />
              )}
              <div>
                <p className="text-xl font-bold text-v-text">
                  #{session.activeContestant.contestantNumber} {session.activeContestant.name}
                </p>
                <p className="text-sm text-v-text-subtle">
                  {session.activeContestantIndex + 1} of {session.roundContestants?.length ?? 0}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-v-text-muted">No contestant selected</p>
          )}

          {/* Navigation */}
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => performAction('prevContestant', 'prevContestant')}
              disabled={session.activeContestantIndex <= 0}
              loading={actionLoading === 'prevContestant'}
            >
              <SkipBack className="h-4 w-4 mr-1" /> Previous
            </Button>
            <Button
              size="sm"
              onClick={() => performAction('nextContestant', 'nextContestant')}
              disabled={session.activeContestantIndex >= (session.roundContestants?.length ?? 1) - 1}
              loading={actionLoading === 'nextContestant'}
            >
              Next <SkipForward className="h-4 w-4 ml-1" />
            </Button>
          </div>

          {/* Jump directly to any contestant in the order. */}
          {session.roundContestants?.length > 0 && (
            <div className="mt-3">
              <label htmlFor="jump-contestant" className="mb-1 block text-xs text-v-text-subtle">
                Or jump to contestant:
              </label>
              <select
                id="jump-contestant"
                value={session.activeContestant?.id ?? ''}
                disabled={actionLoading === 'setContestant'}
                onChange={(e) => selectContestant(e.target.value)}
                className="w-full rounded-lg border border-v-border bg-v-surface px-3 py-2 text-sm text-v-text focus:border-v-primary focus:outline-none disabled:opacity-50"
              >
                <option value="" disabled>Select a contestant…</option>
                {session.roundContestants.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.contestantNumber} {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Stage group — put several contestants on stage at once (paired
              pageant / head-to-head). Only offered when divisions are enabled
              (e.g. Male + Female on stage together); solo events stay single. */}
          {foundation?.event?.divisions_enabled && session.roundContestants?.length > 1 && (
            <details className="mt-3 rounded-lg border border-v-border bg-v-surface-elevated/40 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-v-text-muted">
                Stage group — score several at once
                {session.stageContestants?.length > 0 && ` (${session.stageContestants.length} on stage)`}
              </summary>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {session.roundContestants.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-v-text">
                    <input
                      type="checkbox"
                      checked={stageSel.has(c.id)}
                      onChange={(e) => {
                        setStageSel((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(c.id)
                          else next.delete(c.id)
                          return next
                        })
                      }}
                    />
                    #{c.contestantNumber} {c.name}
                  </label>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={actionLoading === 'stageGroup' || stageSel.size < 2}
                  onClick={() => applyStageGroup([...stageSel])}
                  className="rounded-lg bg-v-primary px-3 py-1.5 text-xs font-medium text-v-sidebar-active hover:bg-v-primary-hover disabled:opacity-50"
                >
                  {actionLoading === 'stageGroup' ? 'Applying…' : `Put ${stageSel.size || ''} on stage`}
                </button>
                {session.stageContestants?.length > 0 && (
                  <button
                    type="button"
                    disabled={actionLoading === 'stageGroup'}
                    onClick={() => applyStageGroup([])}
                    className="rounded-lg border border-v-border px-3 py-1.5 text-xs font-medium text-v-text-muted hover:bg-v-surface-elevated disabled:opacity-50"
                  >
                    Clear group (single mode)
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-v-text-subtle">
                Pick 2+ contestants. Judges will see all of them and score each individually.
              </p>
            </details>
          )}
        </div>
      </div>

      {/* Judge Progress */}
      <div className="rounded-xl border border-v-border bg-v-surface p-6">
        <h3 className="mb-4 text-sm font-medium text-v-text-muted uppercase tracking-wider">Judge Progress</h3>
        {judgeProgress.length === 0 ? (
          <p className="text-sm text-v-text-subtle">No judges have scored yet for this contestant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-v-border">
                  <th className="py-2 pr-4 text-left text-v-text-muted font-medium">Judge</th>
                  <th className="py-2 pr-4 text-left text-v-text-muted font-medium">Status</th>
                  <th className="py-2 text-left text-v-text-muted font-medium">Submitted At</th>
                </tr>
              </thead>
              <tbody>
                {judgeProgress.map((judge) => (
                  <tr key={judge.judgeId} className="border-b border-v-border/50">
                    <td className="py-2 pr-4 text-v-text">{judge.displayName || judge.email}</td>
                    <td className="py-2 pr-4">
                      {judge.hasSubmittedCurrent ? (
                        <span className="inline-flex items-center gap-1 text-v-success">
                          <CheckCircle className="h-4 w-4" /> Submitted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-v-text-muted">
                          <Clock className="h-4 w-4" /> Waiting
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-v-text-subtle">
                      {judge.submittedAt ? new Date(judge.submittedAt).toLocaleTimeString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                {finalizeSubmitting ? 'Finalizing…' : 'Finalize & advance'}
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

function NoSessionView({ onStart, actionLoading }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-v-border px-6 py-16 text-center">
      <Play className="mb-4 h-12 w-12 text-v-text-subtle" />
      <h3 className="text-lg font-semibold text-v-text">No Active Session</h3>
      <p className="mt-2 mb-6 max-w-md text-sm text-v-text-muted">
        Start a live competition session to control the flow of rounds and contestants in real time.
        Judges will automatically see only the active round and current contestant.
      </p>
      <Button onClick={onStart} loading={actionLoading === 'start'} size="lg">
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

