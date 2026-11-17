import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import StageFooter from '@/components/ui/StageFooter'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import ManagementWorkspace from '@/components/ui/ManagementWorkspace'
import ElectionGroupStepper from '@/components/organizer/ElectionGroupStepper'
import ReadOnlyEventBanner from '@/components/organizer/ReadOnlyEventBanner'
import useEventStatus from '@/hooks/useEventStatus'
import { stagePath } from '@/utils/eventStages'
import { firstIncompleteSectionId, groupHasPositions } from '@/utils/electionGroupProgress'

import PositionForm from '@/components/organizer/election/PositionForm'
import GroupNameForm from '@/components/organizer/election/GroupNameForm'

export default function ElectionPositionsPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const [positions, setPositions] = useState([])
  const [sections, setSections] = useState([])
  const [completedSectionIds, setCompletedSectionIds] = useState([])
  const [sectionId, setSectionId] = useState('')
  const [sectionSaving, setSectionSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [groupsLoading, setGroupsLoading] = useState(true)
  const positionRequest = useRef(0)
  const [renamingSectionId, setRenamingSectionId] = useState('')
  const [programs, setPrograms] = useState([])
  const [eligibilityDrafts, setEligibilityDrafts] = useState({})
  const [eligibilityModes, setEligibilityModes] = useState({})
  const [savingEligibility, setSavingEligibility] = useState('')
  const [saving, setSaving] = useState(false)
  const { success: showSuccess, error: showError } = useToast()
  const { user } = useAuth()
  const canManagePositionEligibility = user?.scope?.scopeType !== 'scoped'
  const { status, setupLocked } = useEventStatus(electionService, eventId)

  const load = useCallback((selectedSectionId = sectionId) => {
    const request = ++positionRequest.current
    setPositions([])
    if (!selectedSectionId) { setLoading(false); return }
    setLoading(true)
    electionService
      .listPositions(eventId, selectedSectionId)
      .then(({ data }) => {
        if (request !== positionRequest.current) return
        const nextPositions = data.positions ?? []
        setPositions(nextPositions)
        setCompletedSectionIds((current) => groupHasPositions(nextPositions)
          ? [...new Set([...current, selectedSectionId])]
          : current.filter((id) => id !== selectedSectionId))
      })
      .catch((err) => showError(err.response?.data?.message || 'Failed to load positions'))
      .finally(() => { if (request === positionRequest.current) setLoading(false) })
  }, [eventId, sectionId, showError])

  useEffect(() => {
    setGroupsLoading(true)
    if (canManagePositionEligibility) {
      electionService.getCohorts(eventId).then(({ data }) => {
        setPrograms((data.programs ?? []).map((program) => program.value))
      }).catch((err) => showError(err.response?.data?.message || 'Failed to load voter programs'))
    }
    electionService.listBallotSections(eventId).then(async ({ data }) => {
      const nextSections = data.sections ?? []
      const positionSummaries = await Promise.all(nextSections.map(async (section) => {
        const { data: positionData } = await electionService.listPositions(eventId, section.id)
        return { id: section.id, ready: groupHasPositions(positionData.positions ?? []) }
      }))
      const completedIds = positionSummaries.filter((summary) => summary.ready).map((summary) => summary.id)
      setSections(nextSections)
      setCompletedSectionIds(completedIds)
      setSectionId(firstIncompleteSectionId(nextSections, completedIds))
      setLoading(false)
    }).catch((err) => { showError(err.response?.data?.message || 'Failed to load election groups'); setLoading(false) })
      .finally(() => setGroupsLoading(false))
  }, [eventId, showError, canManagePositionEligibility])

  useEffect(() => {
    load(sectionId)
  }, [eventId, sectionId, load])

  // The form validates as the organizer types; this only performs the request.
  // Resolves true on success so the form clears itself.
  const handleCreate = async (payload) => {
    if (!sectionId) { showError('Select an election group before adding a position'); return false }
    setSaving(true)
    try {
      await electionService.createPosition(eventId, payload, sectionId)
      setLoading(true)
      load()
      showSuccess(`Position "${payload.name}" added`)
      return true
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to create position')
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleCreateSection = async (name) => {
    setSectionSaving(true)
    try {
      const { data } = await electionService.createBallotSection(eventId, {
        name,
        displayOrder: sections.length,
      })
      setSections((current) => [...current, data.section])
      setCompletedSectionIds((current) => current.filter((id) => id !== data.section.id))
      setSectionId(data.section.id)
      setPositions([])
      showSuccess(`Election group "${data.section.name}" added`)
      return true
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to add election group')
      return false
    } finally {
      setSectionSaving(false)
    }
  }

  const handleMoveSection = async (section, delta) => {
    const index = sections.findIndex((item) => item.id === section.id)
    const target = index + delta
    if (target < 0 || target >= sections.length) return
    const other = sections[target]
    try {
      await Promise.all([
        electionService.updateBallotSection(eventId, section.id, { displayOrder: other.displayOrder }),
        electionService.updateBallotSection(eventId, other.id, { displayOrder: section.displayOrder }),
      ])
      setSections((current) => {
        const next = [...current]
        ;[next[index], next[target]] = [next[target], next[index]]
        return next.map((item) => item.id === section.id ? { ...item, displayOrder: other.displayOrder } : item.id === other.id ? { ...item, displayOrder: section.displayOrder } : item)
      })
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to reorder election groups')
    }
  }

  // Inline rename (GroupNameForm validates required / length / duplicates live).
  const handleRenameSection = async (section, name) => {
    if (name === section.name) { setRenamingSectionId(''); return true }
    try {
      const { data } = await electionService.updateBallotSection(eventId, section.id, { name })
      setSections((current) => current.map((item) => item.id === section.id ? data.section : item))
      setRenamingSectionId('')
      return true
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to rename election group')
      return false
    }
  }

  const handleDeleteSection = async (section) => {
    if (!confirm(`Delete "${section.name}" and its positions?`)) return
    try {
      await electionService.deleteBallotSection(eventId, section.id)
      const remaining = sections.filter((item) => item.id !== section.id)
      setSections(remaining)
      setCompletedSectionIds((current) => current.filter((id) => id !== section.id))
      if (sectionId === section.id) setSectionId(remaining[0]?.id ?? '')
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to delete election group')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this position and all its candidates?')) return
    try {
      await electionService.deletePosition(eventId, id)
      load()
      showSuccess('Position deleted')
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to delete position')
    }
  }

  const handleMove = async (position, delta) => {
    const target = Math.max(0, (position.displayOrder ?? 0) + delta)
    try {
      await electionService.updatePosition(eventId, position.id, { displayOrder: target })
      load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to reorder position')
    }
  }

  const handleSaveEligibility = async (position) => {
    const mode = eligibilityModes[position.id] ?? (position.eligiblePrograms?.length ? 'programs' : 'all')
    const eligiblePrograms = mode === 'all' ? [] : eligibilityDrafts[position.id] ?? position.eligiblePrograms ?? []
    // The button is disabled (with a message) while this is true; guard anyway.
    if (mode === 'programs' && !eligiblePrograms.length) return
    setSavingEligibility(position.id)
    try {
      const { data } = await electionService.updatePosition(eventId, position.id, { eligiblePrograms })
      setPositions((current) => current.map((item) => item.id === position.id ? data.position : item))
      setEligibilityDrafts((current) => ({ ...current, [position.id]: data.position.eligiblePrograms ?? [] }))
      setEligibilityModes((current) => ({
        ...current,
        [position.id]: data.position.eligiblePrograms?.length ? 'programs' : 'all',
      }))
      showSuccess(`Eligibility updated for "${position.name}"`)
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to update position eligibility')
    } finally {
      setSavingEligibility('')
    }
  }

  const sectionIndex = sections.findIndex((section) => section.id === sectionId)
  const previousSection = sectionIndex > 0 ? sections[sectionIndex - 1] : null
  const nextSection = sectionIndex >= 0 ? sections[sectionIndex + 1] : null
  const currentGroupReady = completedSectionIds.includes(sectionId) || groupHasPositions(positions)

  if (loading || groupsLoading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div data-module="election" className="mx-auto max-w-7xl pb-24">
    <div className="mb-4">
      <ElectionGroupStepper sections={sections} currentId={sectionId} completedIds={completedSectionIds} onSelect={setSectionId} />
    </div>
    <ManagementWorkspace
      title="Position Builder"
      subtitle="Organize ballot groups, add positions, and control who is eligible for each position."
      headerActions={sections.length > 1 && <p className="v-caption">{sections.length} election groups</p>}
      formPanel={
        <div className="space-y-4">
          {!setupLocked && (
            <details open={!sections.length} className="rounded-lg border border-v-border bg-v-surface px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-v-text">Manage election groups</summary>
              <div className="mt-3 space-y-3">
                {!sections.length && <p className="v-caption">Create one election group to begin. Additional groups are optional.</p>}
                <ol className="space-y-2">
                  {sections.map((section, index) => (
                    <li key={section.id} className="text-sm">
                      {renamingSectionId === section.id ? (
                        <GroupNameForm
                          initialName={section.name}
                          otherNames={sections.filter((item) => item.id !== section.id).map((item) => item.name)}
                          ariaLabel={`Rename ${section.name}`}
                          submitLabel="Save name"
                          savingLabel="Saving..."
                          onSubmit={(name) => handleRenameSection(section, name)}
                          onCancel={() => setRenamingSectionId('')}
                          autoFocus
                        />
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-v-text">{index + 1}. {section.name}</span>
                          <div className="flex shrink-0 items-center gap-2">
                            <button type="button" disabled={index === 0} onClick={() => handleMoveSection(section, -1)} aria-label={`Move ${section.name} up`}>↑</button>
                            <button type="button" disabled={index === sections.length - 1} onClick={() => handleMoveSection(section, 1)} aria-label={`Move ${section.name} down`}>↓</button>
                            <button type="button" onClick={() => setRenamingSectionId(section.id)} className="text-xs text-v-primary">Rename</button>
                            <button type="button" onClick={() => handleDeleteSection(section)} className="text-xs text-v-danger">Delete</button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
                <div className="border-t border-v-border pt-3">
                  <GroupNameForm
                    otherNames={sections.map((section) => section.name)}
                    placeholder="e.g. SSG, FSTLP"
                    submitLabel="+ Add Election Group"
                    savingLabel="Adding..."
                    saving={sectionSaving}
                    onSubmit={handleCreateSection}
                  />
                </div>
              </div>
            </details>
          )}
          {setupLocked ? (
            <ReadOnlyEventBanner status={status} noun="election" />
          ) : (
        <PositionForm
          sectionId={sectionId}
          saving={saving}
          canManageEligibility={canManagePositionEligibility}
          programs={programs}
          onCreate={handleCreate}
        />
          )}
        </div>
      }
      recordsPanel={
        <ul className="space-y-3 pb-8">
          {!positions.length && <li className="v-caption">{sectionId ? 'No positions in this election group yet.' : 'Select an election group to view its positions.'}</li>}
          {positions.map((p, idx) => (
          <li
            key={p.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-v-border bg-v-surface px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-v-text">
                <span className="mr-2 text-v-text-subtle">#{p.displayOrder ?? idx}</span>
                {p.name}
              </p>
              {p.description && (
                <p className="mt-1 text-xs text-v-text-subtle">{p.description}</p>
              )}
              <p className="mt-1 text-xs text-v-text-subtle">
                Winners: {p.numberOfWinners ?? 1} · Vote up to {p.maxVote}
              </p>
              {canManagePositionEligibility && (
                <p className="mt-1 text-xs text-v-text-subtle">
                  Eligible programs: {p.eligiblePrograms?.length
                    ? p.eligiblePrograms.length === 1 ? `${p.eligiblePrograms[0]} only` : p.eligiblePrograms.join(', ')
                    : 'All programs (group eligibility applies)'}
                </p>
              )}
              {!setupLocked && canManagePositionEligibility && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-v-primary">Edit program eligibility</summary>
                  <div className="mt-2 space-y-2 rounded-lg border border-v-border p-3">
                    <label className="flex items-center gap-2 text-sm text-v-text">
                      <input
                        type="radio"
                        name={`position-eligibility-${p.id}`}
                        checked={(eligibilityModes[p.id] ?? (p.eligiblePrograms?.length ? 'programs' : 'all')) === 'all'}
                        onChange={() => {
                          setEligibilityModes((current) => ({ ...current, [p.id]: 'all' }))
                          setEligibilityDrafts((current) => ({ ...current, [p.id]: [] }))
                        }}
                      />
                      All programs eligible for this group
                    </label>
                    <label className="flex items-center gap-2 text-sm text-v-text">
                      <input
                        type="radio"
                        name={`position-eligibility-${p.id}`}
                        checked={(eligibilityModes[p.id] ?? (p.eligiblePrograms?.length ? 'programs' : 'all')) === 'programs'}
                        onChange={() => setEligibilityModes((current) => ({ ...current, [p.id]: 'programs' }))}
                      />
                      Only selected programs
                    </label>
                    {(eligibilityModes[p.id] ?? (p.eligiblePrograms?.length ? 'programs' : 'all')) === 'programs' && (
                      <div className="grid gap-2 rounded-md border border-v-border p-3 sm:grid-cols-2">
                        {[...new Set([...programs, ...(p.eligiblePrograms ?? [])])].map((program) => {
                          const selected = eligibilityDrafts[p.id] ?? p.eligiblePrograms ?? []
                          return (
                            <label key={program} className="flex items-center gap-2 text-sm text-v-text">
                              <input
                                type="checkbox"
                                checked={selected.includes(program)}
                                onChange={(event) => setEligibilityDrafts((current) => {
                                  const previous = current[p.id] ?? p.eligiblePrograms ?? []
                                  return {
                                    ...current,
                                    [p.id]: event.target.checked
                                      ? [...previous, program]
                                      : previous.filter((value) => value !== program),
                                  }
                                })}
                              />
                              {program}
                            </label>
                          )
                        })}
                        {!programs.length && <p className="v-caption sm:col-span-2">No voter programs are available in your organizer scope.</p>}
                      </div>
                    )}
                    {(() => {
                      const mode = eligibilityModes[p.id] ?? (p.eligiblePrograms?.length ? 'programs' : 'all')
                      const chosen = eligibilityDrafts[p.id] ?? p.eligiblePrograms ?? []
                      const needsPrograms = mode === 'programs' && !chosen.length
                      return (
                        <>
                          {needsPrograms && (
                            <p role="alert" className="v-error-text">
                              Select at least one program, or choose all programs.
                            </p>
                          )}
                          <button
                            type="button"
                            disabled={savingEligibility === p.id || needsPrograms}
                            onClick={() => handleSaveEligibility(p)}
                            className="rounded-md bg-v-primary px-3 py-1.5 text-xs text-white disabled:opacity-50"
                          >
                            {savingEligibility === p.id ? 'Saving...' : 'Save eligibility'}
                          </button>
                        </>
                      )
                    })()}
                  </div>
                </details>
              )}
            </div>
            {!setupLocked && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => handleMove(p, -1)}
                className="rounded-lg border border-v-border px-2 py-1 text-xs text-v-text-muted hover:border-v-border-strong"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => handleMove(p, 1)}
                className="rounded-lg border border-v-border px-2 py-1 text-xs text-v-text-muted hover:border-v-border-strong"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                className="text-sm text-v-danger hover:text-v-danger"
              >
                Delete
              </button>
            </div>
            )}
          </li>
        ))}
      </ul>
      }
    />
    {!setupLocked && (
      <StageFooter
        module="election"
        currentKey="positions"
        eventId={eventId}
        saving={saving || sectionSaving || loading}
        showSidebarHint={false}
        backLabel={previousSection ? `Back: ${previousSection.name}` : undefined}
        onBack={previousSection ? () => setSectionId(previousSection.id) : undefined}
        nextLabel={nextSection ? `Next: ${nextSection.name}` : sections.length ? 'Next: Candidates' : 'Add an election group'}
        onNext={() => nextSection
          ? setSectionId(nextSection.id)
          : navigate(stagePath('election', 'candidates', eventId))}
        nextDisabled={!sectionId || !currentGroupReady || saving || loading}
      />
    )}
    </div>
  )
}
